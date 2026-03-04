import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * finalizePrequalQuoteV2
 * Called from PreQualification wizard on final submit.
 *
 * Flow:
 * 1. Resolve token → QuoteRequests row
 * 2. If no leadId: create Lead (firstName + email only, stage = 'new_lead')
 * 3. Persist Quote snapshot (idempotent via quoteToken)
 * 4. Update QuoteRequests.leadId + quoteToken linkage
 * 5. Send quote summary email directly via Resend (no function-to-function call)
 *    - Idempotent: skip email if Lead.quoteLinkEmailSentAt already set for this token
 * 6. Return priceSummary + quoteToken + leadId
 *
 * Input:  { token, prequalAnswers, clientFirstName, clientEmail }
 * Output: { success, quoteToken, leadId, firstName, email, priceSummary, persisted, emailSent, build }
 */

const BUILD = "FPQ-V2-2026-03-03-A";
const PRICING_ENGINE_VERSION = 'v2_tokens_risk_frequency';

const json200 = (data) => new Response(
  JSON.stringify(data),
  { status: 200, headers: { "content-type": "application/json; charset=utf-8" } }
);

// ── Inline pricing engine ─────────────────────────────────────────────────────

function runPricingEngine(q, settings) {
  const baseTiers = JSON.parse(settings.baseTierPrices);
  const tokens = JSON.parse(settings.additiveTokens);
  const riskEngine = JSON.parse(settings.riskEngine);
  const frequencyLogic = JSON.parse(settings.frequencyLogic);
  const initialFees = JSON.parse(settings.initialFees);

  const tierMap = {
    'under_10k':  ['tier_a', baseTiers.tier_a_10_15k],
    '10_15k':     ['tier_a', baseTiers.tier_a_10_15k],
    'not_sure':   ['tier_a', baseTiers.tier_a_10_15k],
    '15_20k':     ['tier_b', baseTiers.tier_b_15_20k],
    '20_30k':     ['tier_c', baseTiers.tier_c_20_30k],
    '30k_plus':   ['tier_d', baseTiers.tier_d_30k_plus],
  };
  const [sizeTier, baseMonthly] = tierMap[q.poolSize] || ['tier_a', baseTiers.tier_a_10_15k];

  let additive = 0;
  if (q.enclosure === 'unscreened') additive += tokens[`unscreened_${sizeTier}`] || 0;
  if (q.enclosure === 'unscreened' && q.treesOverhead === 'yes') additive += tokens.trees_overhead || 0;
  if (q.useFrequency === 'weekends') additive += tokens.usage_weekends || 0;
  else if (q.useFrequency === 'several_week') additive += tokens.usage_several_week || 0;
  else if (q.useFrequency === 'daily') additive += tokens.usage_daily || 0;
  if (q.chlorinationMethod === 'liquid_chlorine') additive += tokens.chlorinator_liquid_only || 0;
  if (q.petsAccess && q.petSwimFrequency === 'occasionally') additive += tokens.pets_occasional || 0;
  if (q.petsAccess && q.petSwimFrequency === 'frequently') additive += tokens.pets_frequent || 0;

  const pts = riskEngine.points;
  let rawRisk = 0;
  if (q.enclosure === 'unscreened') rawRisk += pts.unscreened || 0;
  if (q.enclosure === 'unscreened' && q.treesOverhead === 'yes') rawRisk += pts.trees_overhead || 0;
  if (q.useFrequency === 'daily') rawRisk += pts.usage_daily || 0;
  else if (q.useFrequency === 'several_week') rawRisk += pts.usage_several_week || 0;
  if (q.chlorinationMethod === 'liquid_chlorine') rawRisk += pts.chlorinator_liquid_only || 0;
  if (q.petsAccess && q.petSwimFrequency === 'frequently') rawRisk += pts.pets_frequent || 0;
  else if (q.petsAccess && q.petSwimFrequency === 'occasionally') rawRisk += pts.pets_occasional || 0;
  if (q.poolCondition === 'green' || q.poolCondition === 'dark_algae') rawRisk += pts.condition_green || 0;

  const sizeMultiplier = riskEngine.size_multipliers[sizeTier] || 1.0;
  const adjustedRisk = rawRisk * sizeMultiplier;

  if (!Array.isArray(riskEngine.escalation_brackets) || riskEngine.escalation_brackets.length < 5) {
    throw new Error('AdminSettings riskEngine.escalation_brackets invalid');
  }
  const sorted = [...riskEngine.escalation_brackets].sort((a, b) => a.min_risk - b.min_risk);
  let riskAddon = 0;
  for (const b of sorted) {
    if (adjustedRisk >= b.min_risk && (b.max_risk >= 999 || adjustedRisk <= b.max_risk)) {
      riskAddon = b.addon_amount;
      break;
    }
  }

  let freqMult = 1.0;
  let frequency = 'weekly';
  let frequencyAutoRequired = false;
  if (adjustedRisk >= frequencyLogic.auto_require_threshold) {
    freqMult = frequencyLogic.twice_weekly_multiplier;
    frequency = 'twice_weekly';
    frequencyAutoRequired = true;
  }

  let finalMonthly = (baseMonthly + additive + riskAddon) * freqMult;
  const floor = baseTiers.absolute_floor || 120;
  if (finalMonthly < floor) finalMonthly = floor;

  const visitsPerMonth = frequency === 'weekly' ? 4.33 : 8.66;
  const perVisit = finalMonthly / visitsPerMonth;

  let oneTimeFees = 0;
  let greenSizeGroup = null;
  if (q.poolCondition === 'slightly_cloudy') oneTimeFees += initialFees.slightly_cloudy || 25;
  if (q.poolCondition === 'green' || q.poolCondition === 'dark_algae') {
    if (sizeTier === 'tier_a') greenSizeGroup = 'small';
    else if (sizeTier === 'tier_b' || sizeTier === 'tier_c') greenSizeGroup = 'medium';
    else greenSizeGroup = 'large';
    const feeKey = `green_${q.poolCondition === 'dark_algae' ? 'black' : 'moderate'}_${greenSizeGroup}`;
    oneTimeFees += initialFees[feeKey] || (greenSizeGroup === 'small' ? 100 : greenSizeGroup === 'medium' ? 150 : 200);
  }

  return {
    sizeTier,
    baseMonthly: parseFloat(baseMonthly.toFixed(2)),
    finalMonthlyPrice: parseFloat(finalMonthly.toFixed(2)),
    perVisitPrice: parseFloat(perVisit.toFixed(2)),
    oneTimeFees: parseFloat(oneTimeFees.toFixed(2)),
    firstMonthTotal: parseFloat((finalMonthly + oneTimeFees).toFixed(2)),
    frequency,
    frequencyAutoRequired,
    adjustedRisk: parseFloat(adjustedRisk.toFixed(2)),
    greenSizeGroup
  };
}

function runPricingRange(q, settings) {
  const sizes = ['under_10k', '10_15k', '15_20k', '20_30k', '30k_plus'];
  const results = sizes.map(s => runPricingEngine({ ...q, poolSize: s }, settings));
  const prices = results.map(r => r.finalMonthlyPrice);
  const fees = results.map(r => r.oneTimeFees);
  return {
    isRange: true,
    minMonthly: Math.min(...prices),
    maxMonthly: Math.max(...prices),
    minOneTimeFees: Math.min(...fees),
    maxOneTimeFees: Math.max(...fees),
    frequency: results[0].frequency,
    frequencyAutoRequired: results[0].frequencyAutoRequired,
  };
}

// ── Email sender (direct Resend API — no function-to-function call) ───────────

async function sendQuoteSummaryEmail({ firstName, email, quoteToken, appOrigin, priceSummary }) {
  const resendApiKey = Deno.env.get('RESEND_API_KEY');
  if (!resendApiKey) {
    console.warn('FPQ_V2_EMAIL_SKIP', { reason: 'RESEND_API_KEY not configured' });
    return { sent: false, reason: 'RESEND_API_KEY not configured' };
  }

  // Canonical email link origin policy: env → request → relative fallback
  let scheduleLink, emailLinkMode;
  
  // (1) Check canonical env var first
  const canonicalOrigin = Deno.env.get('APP_ORIGIN') || Deno.env.get('BASE_URL');
  if (canonicalOrigin) {
    try {
      new URL(canonicalOrigin); // validate https
      scheduleLink = `${canonicalOrigin}/ScheduleInspection?token=${encodeURIComponent(quoteToken)}`;
      emailLinkMode = 'absolute_env';
      console.log('FPQ_V2_EMAIL_LINK_RESOLVED', { mode: 'absolute_env', source: 'APP_ORIGIN or BASE_URL' });
    } catch (e) {
      console.warn('FPQ_V2_CANONICAL_ORIGIN_INVALID', { error: e.message });
      // Fall through to request origin
      if (appOrigin) {
        scheduleLink = `${appOrigin}/ScheduleInspection?token=${encodeURIComponent(quoteToken)}`;
        emailLinkMode = 'absolute_request';
        console.log('FPQ_V2_EMAIL_LINK_RESOLVED', { mode: 'absolute_request', source: 'request_headers' });
      } else {
        scheduleLink = `/ScheduleInspection?token=${encodeURIComponent(quoteToken)}`;
        emailLinkMode = 'relative_fallback';
        console.warn('FPQ_V2_MISSING_CANONICAL_EMAIL_ORIGIN', { 
          msg: 'No valid APP_ORIGIN env and no request origin; using relative link',
          hasAppOrigin: !!Deno.env.get('APP_ORIGIN'),
          hasBaseUrl: !!Deno.env.get('BASE_URL'),
          hasRequestOrigin: !!appOrigin
        });
      }
    }
  } else {
    // (2) No env var; try request origin
    if (appOrigin) {
      scheduleLink = `${appOrigin}/ScheduleInspection?token=${encodeURIComponent(quoteToken)}`;
      emailLinkMode = 'absolute_request';
      console.log('FPQ_V2_EMAIL_LINK_RESOLVED', { mode: 'absolute_request', source: 'request_headers' });
    } else {
      // (3) Fallback to relative (non-blocking)
      scheduleLink = `/ScheduleInspection?token=${encodeURIComponent(quoteToken)}`;
      emailLinkMode = 'relative_fallback';
      console.warn('FPQ_V2_MISSING_CANONICAL_EMAIL_ORIGIN', { 
        msg: 'No APP_ORIGIN/BASE_URL env and no request origin resolved; using relative link',
        hasAppOrigin: !!Deno.env.get('APP_ORIGIN'),
        hasBaseUrl: !!Deno.env.get('BASE_URL'),
        hasRequestOrigin: !!appOrigin
      });
    }
  }

  // Build inline quote snapshot for email body
  const quoteSnapshot = priceSummary ? `
    <div style="background:#f0fdfd;border-left:4px solid #1B9B9F;border-radius:4px;padding:16px;margin-bottom:24px;">
      <p style="margin:0 0 12px;font-size:14px;font-weight:600;color:#1B9B9F;">Your Quote Summary</p>
      <div style="font-size:13px;color:#333;line-height:1.8;">
        <div style="display:flex;justify-content:space-between;margin-bottom:8px;">
          <span>Monthly Service:</span>
          <strong>${priceSummary.monthlyPrice || 'TBD'}</strong>
        </div>
        <div style="display:flex;justify-content:space-between;margin-bottom:8px;">
          <span>Frequency:</span>
          <strong>${priceSummary.visitFrequency || 'Weekly'}</strong>
        </div>
        ${priceSummary.oneTimeFees ? `<div style="display:flex;justify-content:space-between;">
          <span>One-Time Initial Fee:</span>
          <strong>${priceSummary.oneTimeFees}</strong>
        </div>` : ''}
      </div>
      <p style="margin:12px 0 0;font-size:12px;color:#666;border-top:1px solid #d0e8ea;padding-top:8px;">*Pricing is based on your questionnaire answers. Final rates confirmed during inspection.</p>
    </div>
  ` : '';

  const htmlBody = `<!-- email_link_mode: ${emailLinkMode} --><!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;line-height:1.6;color:#333;background:#f9fafb;">
  <div style="max-width:560px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
    <div style="background:#1B9B9F;padding:24px 32px;">
      <h2 style="color:#fff;margin:0;font-size:22px;font-weight:700;">Breez Pool Care</h2>
    </div>
    <div style="padding:32px;">
      <p style="font-size:16px;margin:0 0 16px;">Hi ${firstName},</p>
      <p style="font-size:15px;margin:0 0 24px;">Your personalized Breez Pool Care quote is ready!</p>
      ${quoteSnapshot}
      <div style="background:#f0fdfd;border:1px solid #a7f3d0;border-radius:8px;padding:20px;text-align:center;margin-bottom:24px;">
        <p style="margin:0 0 12px;font-size:15px;font-weight:600;color:#1B9B9F;">Ready to get started?</p>
        <p style="margin:0 0 16px;font-size:13px;color:#555;">Schedule your free no-obligation pool inspection. No commitment required.</p>
        <a href="${scheduleLink}" style="display:inline-block;background-color:#fff;color:#1B9B9F;padding:12px 28px;text-decoration:none;border-radius:8px;font-weight:600;font-size:15px;border:2px solid #1B9B9F;">Schedule Free Inspection</a>
      </div>
      <p style="font-size:12px;color:#999;text-align:center;margin:0;">
        Or copy this link to schedule: <a href="${scheduleLink}" style="color:#1B9B9F;word-break:break-all;">${scheduleLink}</a>
      </p>
    </div>
    <div style="border-top:1px solid #eee;padding:20px 32px;text-align:center;color:#999;font-size:12px;">
      <p style="margin:0;">Breez Pool Care LLC · Melbourne, FL · (321) 524-3838</p>
    </div>
  </div>
</body>
</html>`;

  const emailRes = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${resendApiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'Breez Pool Care <info@breezpoolcare.com>',
      to: [email],
      subject: `${firstName}, your Breez Pool Care quote is ready`,
      html: htmlBody,
      text: `Hi ${firstName},\n\nYour Breez Pool Care quote is ready.\n\nSchedule your free inspection: ${scheduleLink}\n\nBreez Pool Care LLC · Melbourne, FL · (321) 524-3838`
    })
  });

  const resendText = await emailRes.text();
  let resendData = {};
  try { resendData = JSON.parse(resendText); } catch {}

  if (!emailRes.ok) {
    console.error('FPQ_V2_EMAIL_RESEND_ERROR', { status: emailRes.status, body: resendText.slice(0, 200) });
    return { sent: false, reason: `Resend API error ${emailRes.status}`, detail: resendText.slice(0, 200) };
  }

  console.log('FPQ_V2_EMAIL_SENT', { email: email.slice(0, 5), resendId: resendData.id, emailLinkMode });
  return { sent: true, resendId: resendData.id || null };
}

// ── Resolve app origin from request (with hardened fallback order) ──────────────

function resolveAppOrigin(req) {
  const sources = {
    explicit_origin: req.headers.get('origin') || null,
    referer: req.headers.get('referer') || null,
    host: req.headers.get('host') || req.headers.get('x-forwarded-host') || null,
    proto: req.headers.get('x-forwarded-proto') || 'https'
  };

  // (a) Explicit request header origin (validated)
  if (sources.explicit_origin) {
    try {
      const u = new URL(sources.explicit_origin);
      if (u.hostname.endsWith('.base44.app') || u.hostname === 'localhost') {
        console.log('FPQ_V2_ORIGIN_RESOLVED', { source: 'explicit_origin', origin: sources.explicit_origin });
        return sources.explicit_origin;
      }
    } catch (e) {
      console.warn('FPQ_V2_ORIGIN_VALIDATION_FAILED', { source: 'explicit_origin', reason: e.message });
    }
  }

  // (b) Referer-derived origin (validated)
  if (sources.referer) {
    try {
      const u = new URL(sources.referer);
      if (u.hostname.endsWith('.base44.app') || u.hostname === 'localhost') {
        const origin = `${u.protocol}//${u.host}`;
        console.log('FPQ_V2_ORIGIN_RESOLVED', { source: 'referer', origin });
        return origin;
      }
    } catch (e) {
      console.warn('FPQ_V2_ORIGIN_VALIDATION_FAILED', { source: 'referer', reason: e.message });
    }
  }

  // (c) Host + x-forwarded-proto reconstruction (validated)
  if (sources.host && sources.proto) {
    if (sources.host.endsWith('.base44.app') || sources.host === 'localhost' || sources.host.startsWith('localhost:')) {
      const origin = `${sources.proto}://${sources.host}`;
      try {
        new URL(origin); // validation check
        console.log('FPQ_V2_ORIGIN_RESOLVED', { source: 'host_proto', origin });
        return origin;
      } catch (e) {
        console.warn('FPQ_V2_ORIGIN_VALIDATION_FAILED', { source: 'host_proto', reason: e.message });
      }
    }
  }

  // (d) Environment fallback (single canonical env var)
  const envOrigin = Deno.env.get('APP_ORIGIN') || Deno.env.get('BASE_URL') || null;
  if (envOrigin) {
    try {
      new URL(envOrigin); // validation check
      console.log('FPQ_V2_ORIGIN_RESOLVED', { source: 'environment', origin: envOrigin });
      return envOrigin;
    } catch (e) {
      console.warn('FPQ_V2_ORIGIN_VALIDATION_FAILED', { source: 'environment', reason: e.message });
    }
  }

  // (e) No absolute origin resolved — return null for relative-link fallback
  console.warn('FPQ_V2_ORIGIN_RESOLUTION_FALLBACK_TO_RELATIVE', {
    sources: {
      has_explicit_origin: !!sources.explicit_origin,
      has_referer: !!sources.referer,
      has_host: !!sources.host,
      proto: sources.proto
    }
  });
  return null;
}

// ── Main handler ──────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const payload = await req.json();
    const { token, prequalAnswers, clientFirstName: payloadFirstName, clientEmail: payloadEmail } = payload || {};

    // ── Validate required inputs ──
    if (!token || typeof token !== 'string') {
      return json200({ success: false, error: 'token is required', build: BUILD });
    }
    if (!prequalAnswers || typeof prequalAnswers !== 'object') {
      return json200({ success: false, error: 'prequalAnswers is required', build: BUILD });
    }

    const cleanToken = token.trim();

    // ── Step 1: Resolve token → QuoteRequests row ──
    let quoteRequest = null;
    try {
      const requests = await base44.asServiceRole.entities.QuoteRequests.filter({ token: cleanToken }, null, 1);
      if (requests && requests.length > 0) quoteRequest = requests[0];
    } catch (e) {
      console.warn('FPQ_V2_TOKEN_RESOLUTION_FAILED', { error: e.message });
    }

    // Resolve contact fields: payload takes priority, fall back to QuoteRequests
    let firstName = (payloadFirstName || '').trim() || (quoteRequest?.firstName || '').trim() || null;
    let email = (payloadEmail || '').trim().toLowerCase() || (quoteRequest?.email || '').trim().toLowerCase() || null;
    // Strip placeholder email
    if (email === 'guest@breezpoolcare.com') email = null;

    let leadId = quoteRequest?.leadId || null;

    console.log('FPQ_V2_TOKEN_RESOLVED', {
      token: cleanToken.slice(0, 8),
      leadId,
      hasEmail: !!email,
      hasFirstName: !!firstName,
      fromPayload: !!payloadEmail
    });

    if (!email) {
      return json200({ success: false, error: 'Email is required (from payload or token)', build: BUILD });
    }
    if (!firstName) {
      return json200({ success: false, error: 'First name is required', build: BUILD });
    }

    // ── Step 2: Idempotency — check for existing Quote ──
    let existingQuote = null;
    try {
      const existing = await base44.asServiceRole.entities.Quote.filter({ quoteToken: cleanToken }, '-created_date', 1);
      if (existing && existing.length > 0) existingQuote = existing[0];
    } catch (e) {
      console.warn('FPQ_V2_IDEMPOTENCY_CHECK_FAILED', { error: e.message });
    }

    if (existingQuote) {
      console.log('FPQ_V2_IDEMPOTENCY_HIT', { token: cleanToken.slice(0, 8), quoteId: existingQuote.id });
      const priceSummary = {
        monthlyPrice: existingQuote.outputMonthlyPrice ? `$${existingQuote.outputMonthlyPrice}` : '$0',
        visitFrequency: existingQuote.outputFrequency === 'weekly' ? 'Weekly' : 'Twice Weekly',
        planName: 'Your Quote',
        oneTimeFees: existingQuote.outputOneTimeFees > 0 ? `$${existingQuote.outputOneTimeFees}` : null,
        frequencyAutoRequired: existingQuote.outputFrequencyAutoRequired || false
      };
      return json200({
        success: true,
        quoteToken: existingQuote.quoteToken,
        leadId: existingQuote.leadId,
        firstName: existingQuote.clientFirstName || firstName,
        email: existingQuote.clientEmail,
        priceSummary,
        persisted: false,
        emailSent: false,
        note: 'idempotency_hit',
        build: BUILD
      });
    }

    // ── Step 3: Load AdminSettings ──
    let settings = null;
    try {
      const rows = await base44.asServiceRole.entities.AdminSettings.list('-created_date', 1);
      settings = rows[0];
      if (!settings) {
        return json200({ success: false, error: 'Pricing configuration not found', build: BUILD });
      }
    } catch (e) {
      return json200({ success: false, error: 'Failed to load pricing configuration', detail: e.message, build: BUILD });
    }

    // Validate settings integrity
    try {
      const riskEngine = JSON.parse(settings.riskEngine);
      const baseTiers = JSON.parse(settings.baseTierPrices);
      const brackets = riskEngine?.escalation_brackets;
      if (!Array.isArray(brackets) || brackets.length < 5) throw new Error('escalation_brackets invalid');
      if (!riskEngine?.size_multipliers || Object.keys(riskEngine.size_multipliers).length < 4) throw new Error('size_multipliers invalid');
      if (!baseTiers?.tier_a_10_15k || !baseTiers?.absolute_floor) throw new Error('baseTierPrices invalid');
    } catch (e) {
      return json200({ success: false, error: 'Pricing configuration is incomplete or invalid', detail: e.message, build: BUILD });
    }

    // ── Step 4: Run pricing engine ──
    let quoteResult = null;
    const isNotSure = prequalAnswers.poolSize === 'not_sure';
    try {
      quoteResult = isNotSure
        ? runPricingRange(prequalAnswers, settings)
        : runPricingEngine(prequalAnswers, settings);
      console.log('FPQ_V2_PRICING_COMPUTED', {
        monthly: isNotSure ? `${quoteResult.minMonthly}-${quoteResult.maxMonthly}` : quoteResult.finalMonthlyPrice
      });
    } catch (e) {
      console.error('FPQ_V2_PRICING_ERROR', { error: e.message });
      return json200({ success: false, error: 'Failed to calculate pricing', detail: e.message, build: BUILD });
    }

    const priceSummary = {
      monthlyPrice: isNotSure
        ? `$${quoteResult.minMonthly}–$${quoteResult.maxMonthly}`
        : `$${quoteResult.finalMonthlyPrice}`,
      visitFrequency: quoteResult.frequency === 'weekly' ? 'Weekly' : 'Twice Weekly',
      planName: isNotSure ? 'Estimated' : 'Your Quote',
      oneTimeFees: isNotSure
        ? (quoteResult.minOneTimeFees > 0 ? `$${quoteResult.minOneTimeFees}–$${quoteResult.maxOneTimeFees}` : null)
        : (quoteResult.oneTimeFees > 0 ? `$${quoteResult.oneTimeFees}` : null),
      frequencyAutoRequired: quoteResult.frequencyAutoRequired
    };

    // ── Step 5: Create Lead if missing (with email reuse/restore) ──
    if (!leadId) {
      try {
        // Email reuse: look for ANY lead with this email (deleted or active)
        const existingLeads = await base44.asServiceRole.entities.Lead.filter({ email }, '-created_date', 10);
        
        if (existingLeads && existingLeads.length > 0) {
          const lead = existingLeads[0];
          
          // If soft-deleted, automatically restore for reuse
          if (lead.isDeleted === true) {
            try {
              await base44.asServiceRole.entities.Lead.update(lead.id, {
                isDeleted: false,
                deletedAt: null,
                deletedBy: null,
                deleteReason: null,
                firstName,
                stage: 'new_lead',
                quoteGenerated: true
              });
              leadId = lead.id;
              console.log('FPQ_V2_LEAD_RESTORED', { leadId, email: email.slice(0, 5), reason: 'email_reuse' });
            } catch (restoreErr) {
              console.warn('FPQ_V2_LEAD_RESTORE_FAILED', { error: restoreErr.message, leadId: lead.id });
              // Fallback: create new lead if restore fails
              const newLead = await base44.asServiceRole.entities.Lead.create({
                firstName,
                email,
                stage: 'new_lead',
                quoteGenerated: true,
                isEligible: true,
                isDeleted: false,
              });
              leadId = newLead.id;
              console.log('FPQ_V2_LEAD_CREATED_FALLBACK', { leadId, email: email.slice(0, 5) });
            }
          } else {
            // Active lead: reuse as-is
            leadId = lead.id;
            console.log('FPQ_V2_LEAD_REUSED', { leadId, email: email.slice(0, 5), stage: lead.stage });
          }
        } else {
          // No prior record: create fresh
          const newLead = await base44.asServiceRole.entities.Lead.create({
            firstName,
            email,
            stage: 'new_lead',
            quoteGenerated: true,
            isEligible: true,
            isDeleted: false,
          });
          leadId = newLead.id;
          console.log('FPQ_V2_LEAD_CREATED', { leadId, email: email.slice(0, 5) });
        }
      } catch (e) {
        console.error('FPQ_V2_LEAD_CREATE_FAILED', { error: e.message });
        return json200({ success: false, error: 'Failed to create lead record', detail: e.message, build: BUILD });
      }
    }

    // ── Step 6: Persist Quote snapshot ──
    let persistedQuote = null;
    try {
      const quoteData = {
        leadId,
        clientEmail: email,
        clientFirstName: firstName,
        quoteToken: cleanToken,
        status: 'quoted',
        pricingEngineVersion: PRICING_ENGINE_VERSION,
        inputPoolSize: prequalAnswers.poolSize,
        inputEnclosure: prequalAnswers.enclosure,
        inputChlorinationMethod: prequalAnswers.chlorinationMethod,
        inputUseFrequency: prequalAnswers.useFrequency,
        inputTreesOverhead: prequalAnswers.treesOverhead,
        inputPetsAccess: prequalAnswers.petsAccess === true,
        inputPoolCondition: prequalAnswers.poolCondition,
        outputMonthlyPrice: isNotSure ? null : quoteResult.finalMonthlyPrice,
        outputPerVisitPrice: isNotSure ? null : quoteResult.perVisitPrice,
        outputOneTimeFees: isNotSure ? null : quoteResult.oneTimeFees,
        outputFirstMonthTotal: isNotSure ? null : quoteResult.firstMonthTotal,
        outputFrequency: quoteResult.frequency,
        outputFrequencyAutoRequired: quoteResult.frequencyAutoRequired || false,
        outputSizeTier: isNotSure ? null : quoteResult.sizeTier,
        outputGreenSizeGroup: isNotSure ? null : quoteResult.greenSizeGroup
      };

      persistedQuote = await base44.asServiceRole.entities.Quote.create(quoteData);
      console.log('FPQ_V2_QUOTE_PERSISTED', { quoteId: persistedQuote.id, token: cleanToken.slice(0, 8), leadId });
    } catch (e) {
      console.error('FPQ_V2_PERSIST_FAILED', { error: e.message });
      return json200({ success: false, error: 'Failed to persist quote', detail: e.message, build: BUILD });
    }

    // ── Step 7: Update QuoteRequests with leadId + quoteToken linkage (ALWAYS assert all 3) ──
    if (quoteRequest) {
      try {
        // ALWAYS re-assert all critical linkage fields for idempotent replay & repair path
        const updateFields = {
          leadId,
          email,
          firstName
        };
        if (!quoteRequest.quoteToken) updateFields.quoteToken = cleanToken;
        await base44.asServiceRole.entities.QuoteRequests.update(quoteRequest.id, updateFields);
        console.log('FPQ_V2_QUOTE_REQUESTS_ASSERTED', { 
          id: quoteRequest.id, 
          leadId: leadId.slice(0, 8),
          hasEmail: !!email,
          hasFirstName: !!firstName
        });
      } catch (e) {
        // Non-fatal: log but do not fail — quote + lead are already created
        console.warn('FPQ_V2_QUOTE_REQUESTS_UPDATE_FAILED', { error: e.message });
      }
    } else {
      // No prior QuoteRequests row — create one for this token to enable future repair
      try {
        const newRequest = await base44.asServiceRole.entities.QuoteRequests.create({
          token: cleanToken,
          leadId,
          email,
          firstName,
          status: 'COMPLETED'
        });
        console.log('FPQ_V2_QUOTE_REQUESTS_CREATED', { 
          id: newRequest.id, 
          token: cleanToken.slice(0, 8),
          leadId: leadId.slice(0, 8)
        });
      } catch (e) {
        console.warn('FPQ_V2_QUOTE_REQUESTS_CREATE_FAILED', { error: e.message });
      }
    }

    // ── Step 8: Update Lead stage to 'contacted' (quoted/contacted bucket) ──
    // Business rule: after quote is generated/sent, lead is in 'contacted' bucket.
    // Do NOT advance past inspection stages. Forward-only: new_lead → contacted.
    try {
      const leadCheck = await base44.asServiceRole.entities.Lead.filter({ id: leadId }, null, 1);
      if (leadCheck?.[0]) {
        const currentStage = leadCheck[0].stage || 'new_lead';
        const PRE_QUOTE_STAGES = ['new_lead'];
        if (PRE_QUOTE_STAGES.includes(currentStage)) {
          await base44.asServiceRole.entities.Lead.update(leadId, {
            stage: 'contacted',
            quoteGenerated: true,
          });
          console.log('FPQ_V2_STAGE_PROGRESSED', { leadId, fromStage: currentStage, toStage: 'contacted' });
        } else {
          console.log('FPQ_V2_STAGE_ALREADY_SET', { leadId, stage: currentStage });
        }
      }
    } catch (e) {
      console.warn('FPQ_V2_STAGE_UPDATE_FAILED', { error: e.message });
    }

    // ── Step 9: Send quote summary email (idempotent: skip if already sent for this lead) ──
    let emailResult = { sent: false, reason: 'skipped' };
    const appOrigin = resolveAppOrigin(req);
    // appOrigin can be null — fallback to relative links in email; do NOT fail quote finalization
    if (appOrigin === null) {
      console.warn('FPQ_V2_ORIGIN_RESOLUTION_FALLBACK', { msg: 'No absolute origin resolved; will use relative links in email' });
    }

    // Idempotency guard: check if email already sent for this lead
    let alreadyEmailed = false;
    try {
      const leadCheck = await base44.asServiceRole.entities.Lead.filter({ id: leadId }, null, 1);
      if (leadCheck?.[0]?.quoteLinkEmailSentAt) alreadyEmailed = true;
    } catch {}

    if (!alreadyEmailed) {
      try {
        emailResult = await sendQuoteSummaryEmail({ firstName, email, quoteToken: cleanToken, appOrigin, priceSummary });
        if (emailResult.sent) {
          await base44.asServiceRole.entities.Lead.update(leadId, {
            quoteLinkEmailSentAt: new Date().toISOString(),
            quoteLinkEmailResendId: emailResult.resendId || null,
            quoteEmailSent: true,
          });
        }
      } catch (e) {
        console.warn('FPQ_V2_EMAIL_FAILED', { error: e.message });
        emailResult = { sent: false, reason: e.message };
      }
    } else {
      emailResult = { sent: false, reason: 'already_sent' };
      console.log('FPQ_V2_EMAIL_SKIP', { leadId, reason: 'quoteLinkEmailSentAt already set' });
    }

    return json200({
      success: true,
      quoteToken: cleanToken,
      leadId,
      firstName,
      email,
      priceSummary,
      persisted: true,
      emailSent: emailResult.sent,
      emailResult,
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