import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

function json200(data) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { 'content-type': 'application/json; charset=utf-8' }
  });
}

function getAppOrigin(req) {
  const envUrl = Deno.env.get('PUBLIC_APP_URL');
  if (envUrl) {
    const url = new URL(envUrl);
    if (url.protocol && url.host) return envUrl.replace(/\/$/, '');
    throw new Error('Invalid PUBLIC_APP_URL format');
  }
  const proto = req.headers.get('x-forwarded-proto') || 'https';
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host');
  if (!host || host.includes('deno.dev')) {
    throw new Error('Cannot determine app origin from request headers');
  }
  return `${proto}://${host}`;
}

Deno.serve(async (req) => {
  const BUILD = 'FPQ_V2_2026_03_04';

  try {
    const base44 = createClientFromRequest(req);

    const { token, questionnaire, firstName: payloadFirstName, email: payloadEmail } = await req.json();

    if (!token || typeof token !== 'string') {
      return json200({ success: false, error: 'token is required', build: BUILD });
    }

    // Lookup or create QuoteRequest + resolve lead
    let quoteRequest = null;
    let leadId = null;
    let email = payloadEmail;
    let firstName = payloadFirstName;

    try {
      const qrs = await base44.asServiceRole.entities.QuoteRequests.filter({ token: token.trim() }, '-created_date', 1);
      quoteRequest = qrs?.[0];
      if (quoteRequest) {
        leadId = quoteRequest.leadId || null;
        email = email || quoteRequest.email;
        firstName = firstName || quoteRequest.firstName;
      }
    } catch (e) {
      console.warn('FPQ_V2_QUOTE_REQUEST_LOOKUP_FAILED', { error: e.message });
    }

    if (!quoteRequest) {
      return json200({ success: false, error: 'Invalid or expired token', code: 'TOKEN_NOT_FOUND', build: BUILD });
    }

    if (!email || email === 'guest@breezpoolcare.com') {
      return json200({ success: false, error: 'Email is required', build: BUILD });
    }
    email = email.trim().toLowerCase();

    // Check if quote already exists (idempotency)
    let existingQuote = null;
    try {
      const existing = await base44.asServiceRole.entities.Quote.filter({ quoteToken: token.trim() }, '-created_date', 1);
      existingQuote = existing?.[0];
    } catch (e) {
      console.warn('FPQ_V2_IDEMPOTENCY_CHECK_FAILED', { error: e.message });
    }

    // If quote exists, send email and return
    if (existingQuote) {
      if (!leadId && existingQuote.leadId) leadId = existingQuote.leadId;

      const priceSummary = {
        monthlyPrice: existingQuote.outputMonthlyPrice ? `$${existingQuote.outputMonthlyPrice}` : '$0',
        visitFrequency: existingQuote.outputFrequency === 'weekly' ? 'Weekly' : 'Twice Weekly',
        oneTimeFees: existingQuote.outputOneTimeFees && existingQuote.outputOneTimeFees > 0 ? `$${existingQuote.outputOneTimeFees}` : null,
      };

      try {
        const appOrigin = getAppOrigin(req);
        const scheduleLink = `${appOrigin}/ScheduleInspection?token=${encodeURIComponent(token.trim())}`;
        const monthlyText = priceSummary?.monthlyPrice || 'TBD';
        const oneTimeText = priceSummary?.oneTimeFees ? `\n• One-time fees: ${priceSummary.oneTimeFees}` : '';
        const emailBody = `Hi ${firstName || 'there'},\n\nYour Breez quote is ready.\n\n• Monthly: ${monthlyText}\n• Frequency: ${priceSummary?.visitFrequency || 'Weekly'}${oneTimeText}\n\nSchedule your free inspection here:\n${scheduleLink}\n\n— Breez Pool Care`;

        await base44.asServiceRole.integrations.Core.SendEmail({
          to: email,
          from_name: 'Breez Pool Care',
          subject: 'Your Breez Quote Is Ready — Schedule Your Free Inspection',
          body: emailBody
        });
        console.log('FPQ_V2_QUOTE_EMAIL_SENT', { token: token.trim().slice(0, 8) });
      } catch (emailErr) {
        console.warn('FPQ_V2_QUOTE_EMAIL_FAILED', { error: emailErr.message });
      }

      return json200({
        success: true,
        quoteToken: existingQuote.quoteToken,
        leadId: leadId || existingQuote.leadId || null,
        firstName,
        email,
        priceSummary,
        build: BUILD
      });
    }

    // Load AdminSettings for pricing
    let settings = null;
    try {
      const rows = await base44.asServiceRole.entities.AdminSettings.list('-created_date', 1);
      settings = rows?.[0];
      if (!settings) {
        return json200({ success: false, error: 'Pricing configuration not found', build: BUILD });
      }
    } catch (e) {
      return json200({ success: false, error: 'Failed to load settings', build: BUILD });
    }

    // Calculate quote (placeholder—use actual pricing engine)
    const priceSummary = {
      monthlyPrice: '$149',
      visitFrequency: 'Weekly',
      oneTimeFees: null,
    };

    // Create or update Lead
    if (!leadId) {
      try {
        const newLead = await base44.asServiceRole.entities.Lead.create({
          email,
          firstName: firstName || 'Customer',
          stage: 'contacted',
          quoteGenerated: true,
        });
        leadId = newLead.id;
      } catch (e) {
        console.warn('FPQ_V2_LEAD_CREATE_FAILED', { error: e.message });
        leadId = null;
      }
    } else {
      try {
        await base44.asServiceRole.entities.Lead.update(leadId, {
          firstName: firstName || 'Customer',
          email,
          quoteGenerated: true,
        });
      } catch (e) {
        console.warn('FPQ_V2_LEAD_UPDATE_FAILED', { error: e.message });
      }
    }

    // Create Quote
    let persistedQuote = null;
    try {
      const quoteToken = crypto.randomUUID();
      persistedQuote = await base44.asServiceRole.entities.Quote.create({
        clientEmail: email,
        clientFirstName: firstName,
        quoteToken,
        status: 'quoted',
        outputMonthlyPrice: 149,
        outputFrequency: 'weekly',
        outputOneTimeFees: 0,
        inputPoolSize: questionnaire?.poolSize || 'not_sure',
        inputEnclosure: questionnaire?.enclosure || 'not_sure',
        ...(leadId ? { leadId } : {}),
      });
    } catch (e) {
      console.warn('FPQ_V2_QUOTE_CREATE_FAILED', { error: e.message });
    }

    // Send quote email
    try {
      const appOrigin = getAppOrigin(req);
      const scheduleLink = `${appOrigin}/ScheduleInspection?token=${encodeURIComponent(token.trim())}`;
      const monthlyText = priceSummary?.monthlyPrice || 'TBD';
      const oneTimeText = priceSummary?.oneTimeFees ? `\n• One-time fees: ${priceSummary.oneTimeFees}` : '';
      const emailBody = `Hi ${firstName || 'there'},\n\nYour Breez quote is ready.\n\n• Monthly: ${monthlyText}\n• Frequency: ${priceSummary?.visitFrequency || 'Weekly'}${oneTimeText}\n\nSchedule your free inspection here:\n${scheduleLink}\n\n— Breez Pool Care`;

      await base44.asServiceRole.integrations.Core.SendEmail({
        to: email,
        from_name: 'Breez Pool Care',
        subject: 'Your Breez Quote Is Ready — Schedule Your Free Inspection',
        body: emailBody
      });
      console.log('FPQ_V2_QUOTE_EMAIL_SENT', { token: token.trim().slice(0, 8) });
    } catch (emailErr) {
      console.warn('FPQ_V2_QUOTE_EMAIL_FAILED', { error: emailErr.message });
    }

    return json200({
      success: true,
      quoteToken: token.trim(),
      leadId: leadId || null,
      firstName,
      email,
      priceSummary,
      persisted: !!persistedQuote,
      build: BUILD
    });

  } catch (error) {
    console.error('FPQ_V2_CRASH', { error: error?.message });
    return json200({
      success: false,
      error: 'Quote finalization failed',
      detail: error?.message,
      build: BUILD
    });
  }
});