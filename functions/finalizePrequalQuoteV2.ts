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
        const name = firstName || 'there';
        const monthly = summary?.monthlyPrice || 'TBD';
        const freq = summary?.visitFrequency || 'Weekly';
        const TEAL = '#1B9B9F';

        const htmlBody = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f4f7f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1f2937;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f7f8;padding:32px 16px;">
    <tr><td align="center">
      <table width="100%" style="max-width:600px;background-color:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.08);">
        <tr>
          <td style="background-color:${TEAL};padding:32px 40px;text-align:center;">
            <img src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/699a2b2056054b0207cea969/0b0c31666_Breez2.png" alt="Breez Pool Care" height="48" style="display:block;margin:0 auto 16px;" />
            <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;">Your Quote Is Ready! 🏊</h1>
            <p style="margin:8px 0 0;color:rgba(255,255,255,0.85);font-size:14px;">Personalized pool care pricing just for you</p>
          </td>
        </tr>
        <tr>
          <td style="padding:32px 40px;">
            <p style="margin:0;font-size:16px;color:#1f2937;">Hi <strong>${name}</strong>,</p>
            <p style="margin:12px 0 24px;font-size:15px;color:#374151;line-height:1.7;">Great news — your personalized pool care quote is ready! Here's a snapshot of your pricing:</p>
            <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f0fdfd;border:2px solid ${TEAL};border-radius:12px;margin-bottom:24px;">
              <tr><td style="padding:24px 28px;">
                <table width="100%" cellpadding="0" cellspacing="4">
                  <tr>
                    <td style="font-size:13px;color:#6b7280;padding:4px 0;">Monthly Rate</td>
                    <td style="font-size:18px;font-weight:700;color:#1f2937;text-align:right;">${monthly}<span style="font-size:13px;font-weight:400;color:#6b7280;"> / ${freq}</span></td>
                  </tr>
                  ${summary?.oneTimeFees ? `<tr><td style="font-size:13px;color:#6b7280;padding:4px 0;">One-time Fee</td><td style="font-size:15px;font-weight:600;color:#1f2937;text-align:right;">${summary.oneTimeFees}</td></tr>` : ''}
                </table>
                <p style="margin:12px 0 0;font-size:11px;color:#9ca3af;">Estimate based on your questionnaire — final price confirmed at inspection.</p>
              </td></tr>
            </table>
            <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.7;"><strong>Next step:</strong> Schedule your free pool inspection with Matt. He'll confirm the quote in person — no obligation.</p>
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr><td align="center" style="padding:4px 0 28px;">
                <a href="${scheduleLink}" style="display:inline-block;background-color:${TEAL};color:#ffffff;padding:15px 40px;text-decoration:none;border-radius:10px;font-weight:700;font-size:16px;">
                  Schedule Free Inspection →
                </a>
              </td></tr>
            </table>
            <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;margin-bottom:20px;">
              <tr><td style="padding:20px 24px;">
                <p style="margin:0 0 12px;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:#374151;">What to expect at the inspection</p>
                <p style="margin:4px 0;font-size:14px;color:#374151;">✔&nbsp; Pool assessment &amp; water chemistry test</p>
                <p style="margin:4px 0;font-size:14px;color:#374151;">✔&nbsp; Equipment review</p>
                <p style="margin:4px 0;font-size:14px;color:#374151;">✔&nbsp; Final pricing confirmed</p>
                <p style="margin:4px 0;font-size:14px;color:#374151;">✔&nbsp; All your questions answered</p>
              </td></tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:0 40px 32px;border-top:1px solid #e5e7eb;">
            <p style="margin:20px 0 4px;font-size:14px;color:#374151;">Questions? We're happy to help.</p>
            <p style="margin:0;font-size:14px;color:#374151;">📞 <a href="tel:3215243838" style="color:${TEAL};text-decoration:none;">(321) 524-3838</a></p>
            <p style="margin:16px 0 0;font-size:13px;color:#9ca3af;"><strong style="color:#374151;">Breez Pool Care LLC</strong> &nbsp;·&nbsp; Space Coast, FL</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

        const { Resend } = await import('npm:resend@4.0.0');
        const resend = new Resend(Deno.env.get('RESEND_API_KEY'));
        await resend.emails.send({
          from: 'Breez Pool Care <noreply@breezpoolcare.com>',
          to: email,
          subject: 'Your Breez Quote Is Ready — Schedule Your Free Inspection',
          html: htmlBody,
          text: `Hi ${name},\n\nYour Breez Pool Care quote is ready!\n\nMonthly: ${monthly} (${freq})${summary?.oneTimeFees ? `\nOne-time fee: ${summary.oneTimeFees}` : ''}\n\nSchedule your free inspection: ${scheduleLink}\n\nQuestions? (321) 524-3838\n\n— Breez Pool Care`,
        });
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

    // Send quote-ready email (non-blocking) — ONLY if this is a new quote
    // If quote already existed (idempotent), email was already sent above
    if (!existingQuote) {
      await sendQuoteReadyEmail({ quoteToken: token.trim(), summary: priceSummary, targetLeadId: leadId });
    }

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