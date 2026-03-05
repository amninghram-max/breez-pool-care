import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

const BUILD = 'FPQ_V3_2026_03_05';
const PRICING_ENGINE_VERSION = 'v2_tokens_risk_frequency';

function json200(data) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { 'content-type': 'application/json; charset=utf-8' }
  });
}

function getAppOrigin(req) {
  const envUrl = Deno.env.get('PUBLIC_APP_URL');
  if (envUrl) return envUrl.replace(/\/$/, '');
  const proto = req.headers.get('x-forwarded-proto') || 'https';
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host');
  if (!host || host.includes('deno.dev')) throw new Error('Cannot determine app origin');
  return `${proto}://${host}`;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const payload = await req.json();
    const {
      token,
      prequalAnswers,
      clientFirstName: payloadFirstName,
      clientLastName: payloadLastName,
      clientEmail: payloadEmail,
    } = payload || {};

    if (!token || typeof token !== 'string') {
      return json200({ success: false, error: 'token is required', build: BUILD });
    }

    // Start with values from payload
    let email = payloadEmail ? payloadEmail.trim().toLowerCase() : null;
    let firstName = payloadFirstName ? payloadFirstName.trim() : null;
    let lastName = payloadLastName ? payloadLastName.trim() : null;
    let leadId = null;
    let quoteRequest = null;

    // Resolve QuoteRequests row via token
    try {
      const qrs = await base44.asServiceRole.entities.QuoteRequests.filter({ token: token.trim() }, '-created_date', 1);
      quoteRequest = qrs?.[0] || null;
      if (quoteRequest) {
        leadId = quoteRequest.leadId || null;
        // Only use QuoteRequests values as fallback
        if (!email || email === 'guest@breezpoolcare.com') {
          const qrEmail = quoteRequest.email?.trim().toLowerCase();
          if (qrEmail && qrEmail !== 'guest@breezpoolcare.com') email = qrEmail;
        }
        if (!firstName && quoteRequest.firstName) firstName = quoteRequest.firstName.trim() || null;
      }
    } catch (e) {
      console.warn('FPQ_V3_QR_LOOKUP_FAILED', { error: e.message });
    }

    if (!quoteRequest) {
      return json200({ success: false, error: 'Invalid or expired token', code: 'TOKEN_NOT_FOUND', build: BUILD });
    }

    // Fallback: try to get email/name from existing Quote snapshot for this token
    if (!email || email === 'guest@breezpoolcare.com') {
      try {
        const quotes = await base44.asServiceRole.entities.Quote.filter({ quoteToken: token.trim() }, '-created_date', 1);
        const q = quotes?.[0];
        if (q) {
          if (q.clientEmail && q.clientEmail !== 'guest@breezpoolcare.com') email = q.clientEmail.trim().toLowerCase();
          if (!firstName && q.clientFirstName) firstName = q.clientFirstName.trim() || null;
          if (!leadId && q.leadId) leadId = q.leadId;
        }
      } catch (e) {
        console.warn('FPQ_V3_QUOTE_SNAPSHOT_FALLBACK_FAILED', { error: e.message });
      }
    }

    // Fallback: try linked Lead
    if ((!email || email === 'guest@breezpoolcare.com') && leadId) {
      try {
        const leadRows = await base44.asServiceRole.entities.Lead.filter({ id: leadId }, null, 1);
        const lead = leadRows?.[0];
        if (lead) {
          if (lead.email && lead.email !== 'guest@breezpoolcare.com') email = lead.email.trim().toLowerCase();
          if (!firstName && lead.firstName) firstName = lead.firstName.trim() || null;
        }
      } catch (e) {
        console.warn('FPQ_V3_LEAD_FALLBACK_FAILED', { error: e.message });
      }
    }

    // Final validation
    if (!email || email === 'guest@breezpoolcare.com') {
      return json200({ success: false, error: 'Email is required', code: 'INCOMPLETE_DATA', build: BUILD });
    }

    console.log('FPQ_V3_RESOLVED', { token: token.trim().slice(0, 8), email: email.slice(0, 4) + '***', leadId, hasFirstName: !!firstName });

    // Helper: send quote-ready email (non-fatal)
    const sendQuoteReadyEmail = async ({ quoteToken: qt, summary, targetLeadId }) => {
      try {
        const appOrigin = getAppOrigin(req);
        const scheduleLink = `${appOrigin}/ScheduleInspection?token=${encodeURIComponent(qt.trim())}`;
        const monthlyText = summary?.monthlyPrice || 'TBD';
        const oneTimeText = summary?.oneTimeFees ? `\n• One-time fees: ${summary.oneTimeFees}` : '';
        const body = `Hi ${firstName || 'there'},\n\nYour Breez quote is ready.\n\n• Monthly: ${monthlyText}\n• Frequency: ${summary?.visitFrequency || 'Weekly'}${oneTimeText}\n\nSchedule your free inspection here:\n${scheduleLink}\n\n— Breez Pool Care`;
        const { Resend } = await import('npm:resend@4.0.0');
        const resend = new Resend(Deno.env.get('RESEND_API_KEY'));
        await resend.emails.send({
          from: 'Breez Pool Care <noreply@breezpoolcare.com>',
          to: email,
          subject: 'Your Breez Quote Is Ready — Schedule Your Free Inspection',
          text: body,
        });
        if (targetLeadId) {
          try {
            const rows = await base44.asServiceRole.entities.Lead.filter({ id: targetLeadId }, null, 1);
            const lead = rows?.[0];
            if (lead) {
              await base44.asServiceRole.entities.Lead.update(targetLeadId, {
                notes: `${lead.notes || ''}\n[QUOTE_EMAIL_SENT] ${new Date().toISOString()}`.trim()
              });
            }
          } catch (e) { /* non-fatal */ }
        }
        console.log('FPQ_V3_EMAIL_SENT', { token: qt.slice(0, 8) });
      } catch (e) {
        console.warn('FPQ_V3_EMAIL_FAILED', { error: e.message });
      }
    };

    // Helper: ensure lead exists and is linked
    const ensureLead = async () => {
      let lead = null;
      if (leadId) {
        const rows = await base44.asServiceRole.entities.Lead.filter({ id: leadId }, null, 1);
        lead = rows?.[0] || null;
      }
      if (!lead) {
        const activeRows = await base44.asServiceRole.entities.Lead.filter({ email, isDeleted: false }, '-created_date', 1);
        lead = activeRows?.[0] || null;
      }
      if (!lead) {
        const deletedRows = await base44.asServiceRole.entities.Lead.filter({ email, isDeleted: true }, '-created_date', 1);
        const deletedLead = deletedRows?.[0];
        if (deletedLead) {
          lead = await base44.asServiceRole.entities.Lead.update(deletedLead.id, {
            isDeleted: false, firstName: firstName || deletedLead.firstName || 'Customer', email
          });
        }
      }
      if (!lead) {
        lead = await base44.asServiceRole.entities.Lead.create({
          firstName: firstName || 'Customer', email, stage: 'contacted', quoteGenerated: true, isDeleted: false
        });
      } else {
        lead = await base44.asServiceRole.entities.Lead.update(lead.id, {
          firstName: firstName || lead.firstName || 'Customer',
          email,
          quoteGenerated: true,
          ...(lead.stage === 'new_lead' ? { stage: 'contacted' } : {})
        });
      }
      leadId = lead.id;
      try {
        await base44.asServiceRole.entities.QuoteRequests.update(quoteRequest.id, {
          leadId, email, firstName: firstName || lead.firstName || null
        });
      } catch (e) { /* non-fatal */ }
      return lead;
    };

    // Idempotency check: return existing quote if already created
    let existingQuote = null;
    try {
      const existing = await base44.asServiceRole.entities.Quote.filter({ quoteToken: token.trim() }, '-created_date', 1);
      existingQuote = existing?.[0] || null;
    } catch (e) {
      console.warn('FPQ_V3_IDEMPOTENCY_CHECK_FAILED', { error: e.message });
    }

    if (existingQuote) {
      if (!leadId && existingQuote.leadId) leadId = existingQuote.leadId;
      try { await ensureLead(); } catch (e) { console.warn('FPQ_V3_LINKAGE_REPAIR_FAILED', { error: e.message }); }

      const priceSummary = {
        monthlyPrice: existingQuote.outputMonthlyPrice ? `$${existingQuote.outputMonthlyPrice}` : '$0',
        visitFrequency: existingQuote.outputFrequency === 'weekly' ? 'Weekly' : 'Twice Weekly',
        oneTimeFees: existingQuote.outputOneTimeFees > 0 ? `$${existingQuote.outputOneTimeFees}` : null,
      };

      await sendQuoteReadyEmail({ quoteToken: existingQuote.quoteToken || token.trim(), summary: priceSummary, targetLeadId: leadId });

      return json200({
        success: true,
        quoteToken: existingQuote.quoteToken,
        quoteSnapshot: existingQuote,
        leadId: leadId || existingQuote.leadId || null,
        firstName: existingQuote.clientFirstName || firstName,
        email: existingQuote.clientEmail || email,
        priceSummary,
        build: BUILD
      });
    }

    // Load AdminSettings for pricing config
    let settings = null;
    try {
      const rows = await base44.asServiceRole.entities.AdminSettings.list('-created_date', 1);
      settings = rows?.[0];
      if (!settings) return json200({ success: false, error: 'Pricing configuration not found', build: BUILD });
    } catch (e) {
      return json200({ success: false, error: 'Failed to load pricing settings', build: BUILD });
    }

    // Run pricing engine
    let quoteResult = null;
    try {
      const calcRes = await base44.asServiceRole.functions.invoke('calculateQuoteOnly', { prequalAnswers, settings });
      const calcData = calcRes?.data ?? calcRes;
      if (calcData?.success) {
        quoteResult = calcData;
      }
    } catch (e) {
      console.warn('FPQ_V3_CALC_FAILED', { error: e.message });
    }

    // Fallback pricing if engine failed
    if (!quoteResult) {
      quoteResult = {
        finalMonthlyPrice: 149,
        perVisitPrice: 37.25,
        oneTimeFees: 0,
        firstMonthTotal: 149,
        frequency: 'weekly',
        frequencyAutoRequired: false,
        sizeTier: 'tier_b',
        greenSizeGroup: null,
        isRange: false,
        minMonthly: null,
        maxMonthly: null,
        minOneTimeFees: null,
        maxOneTimeFees: null,
      };
    }

    const isNotSure = prequalAnswers?.poolSize === 'not_sure';
    const priceSummary = {
      monthlyPrice: isNotSure
        ? `$${quoteResult.minMonthly}–$${quoteResult.maxMonthly}`
        : `$${quoteResult.finalMonthlyPrice}`,
      visitFrequency: quoteResult.frequency === 'weekly' ? 'Weekly' : 'Twice Weekly',
      oneTimeFees: isNotSure
        ? (quoteResult.minOneTimeFees > 0 ? `$${quoteResult.minOneTimeFees}–$${quoteResult.maxOneTimeFees}` : null)
        : (quoteResult.oneTimeFees > 0 ? `$${quoteResult.oneTimeFees}` : null),
      frequencyAutoRequired: quoteResult.frequencyAutoRequired || false,
    };

    // Ensure lead exists
    try { await ensureLead(); } catch (e) {
      console.warn('FPQ_V3_LEAD_ENSURE_FAILED', { error: e.message });
    }

    // Persist quote snapshot
    let persistedQuote = null;
    try {
      const quoteData = {
        clientEmail: email,
        clientFirstName: firstName || 'Customer',
        ...(lastName ? { clientLastName: lastName } : {}),
        quoteToken: token.trim(),
        status: 'quoted',
        pricingEngineVersion: PRICING_ENGINE_VERSION,
        inputPoolSize: prequalAnswers?.poolSize,
        inputPoolType: prequalAnswers?.poolType,
        inputEnclosure: prequalAnswers?.enclosure,
        inputChlorinationMethod: prequalAnswers?.chlorinationMethod,
        inputUseFrequency: prequalAnswers?.useFrequency,
        inputTreesOverhead: prequalAnswers?.treesOverhead,
        inputPetsAccess: prequalAnswers?.petsAccess === true,
        inputPoolCondition: prequalAnswers?.poolCondition,
        outputMonthlyPrice: isNotSure ? null : quoteResult.finalMonthlyPrice,
        outputPerVisitPrice: isNotSure ? null : quoteResult.perVisitPrice,
        outputOneTimeFees: isNotSure ? null : quoteResult.oneTimeFees,
        outputFirstMonthTotal: isNotSure ? null : quoteResult.firstMonthTotal,
        outputFrequency: quoteResult.frequency,
        outputFrequencyAutoRequired: quoteResult.frequencyAutoRequired || false,
        outputSizeTier: isNotSure ? null : quoteResult.sizeTier,
        outputGreenSizeGroup: isNotSure ? null : quoteResult.greenSizeGroup,
        ...(leadId ? { leadId } : {}),
      };
      persistedQuote = await base44.asServiceRole.entities.Quote.create(quoteData);
      console.log('FPQ_V3_QUOTE_PERSISTED', { quoteId: persistedQuote.id, leadId });
    } catch (e) {
      console.warn('FPQ_V3_QUOTE_PERSIST_FAILED', { error: e.message });
    }

    // Send quote-ready email (non-blocking)
    await sendQuoteReadyEmail({ quoteToken: token.trim(), summary: priceSummary, targetLeadId: leadId });

    return json200({
      success: true,
      quoteToken: token.trim(),
      quoteSnapshot: persistedQuote,
      leadId: leadId || null,
      firstName,
      email,
      priceSummary,
      persisted: !!persistedQuote,
      build: BUILD
    });

  } catch (error) {
    console.error('FPQ_V3_CRASH', { error: error?.message, stack: error?.stack?.slice(0, 500) });
    return json200({
      success: false,
      error: 'Quote finalization failed',
      detail: error?.message,
      build: BUILD
    });
  }
});