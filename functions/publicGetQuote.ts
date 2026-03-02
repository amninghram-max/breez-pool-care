import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * publicGetQuote
 * Public endpoint (no user auth required). Called from the landing page quote wizard.
 * 
 * Steps:
 * 1. Run inline readiness check against AdminSettings
 * 2. If ready: run pricing engine, persist Quote, create/update Lead, send quote email
 * 3. If not ready: persist Lead only, send "we'll follow up" email
 * 
 * Returns: { releaseReady, quoteId?, quote?, isRange? }
 */

const PRICING_ENGINE_VERSION = 'v2_tokens_risk_frequency';

function runPricingEngine(q, settings) {
  const baseTiers = JSON.parse(settings.baseTierPrices);
  const tokens = JSON.parse(settings.additiveTokens);
  const riskEngine = JSON.parse(settings.riskEngine);
  const frequencyLogic = JSON.parse(settings.frequencyLogic);
  const initialFees = JSON.parse(settings.initialFees);

  // ── Size Tier ──
  const tierMap = {
    'under_10k':  ['tier_a', baseTiers.tier_a_10_15k],
    '10_15k':     ['tier_a', baseTiers.tier_a_10_15k],
    'not_sure':   ['tier_a', baseTiers.tier_a_10_15k],
    '15_20k':     ['tier_b', baseTiers.tier_b_15_20k],
    '20_30k':     ['tier_c', baseTiers.tier_c_20_30k],
    '30k_plus':   ['tier_d', baseTiers.tier_d_30k_plus],
  };
  const [sizeTier, baseMonthly] = tierMap[q.poolSize] || ['tier_a', baseTiers.tier_a_10_15k];

  // ── Additive Tokens ──
  let additive = 0;
  if (q.enclosure === 'unscreened') additive += tokens[`unscreened_${sizeTier}`] || 0;
  if (q.enclosure === 'unscreened' && q.treesOverhead === 'yes') additive += tokens.trees_overhead || 0;
  if (q.useFrequency === 'weekends') additive += tokens.usage_weekends || 0;
  else if (q.useFrequency === 'several_week') additive += tokens.usage_several_week || 0;
  else if (q.useFrequency === 'daily') additive += tokens.usage_daily || 0;
  if (q.chlorinationMethod === 'liquid_chlorine') additive += tokens.chlorinator_liquid_only || 0;
  if (q.petsAccess && q.petSwimFrequency === 'occasionally') additive += tokens.pets_occasional || 0;
  if (q.petsAccess && q.petSwimFrequency === 'frequently') additive += tokens.pets_frequent || 0;

  // ── Risk Engine ──
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

  // ── One-time Fees ──
  let oneTimeFees = 0;
  let greenSizeGroup = null;
  if (q.poolCondition === 'slightly_cloudy') oneTimeFees += initialFees.slightly_cloudy || 25;
  if (q.poolCondition === 'green' || q.poolCondition === 'dark_algae') {
    if (sizeTier === 'tier_a') greenSizeGroup = 'small';
    else if (sizeTier === 'tier_b' || sizeTier === 'tier_c') greenSizeGroup = 'medium';
    else greenSizeGroup = 'large';
    const severity = q.poolCondition === 'dark_algae' ? 'black_swamp' : 'moderate';
    const feeKey = `green_${severity === 'black_swamp' ? 'black' : 'moderate'}_${greenSizeGroup}`;
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

// For "not_sure" pool size — compute min/max across all size tiers
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

async function sendEmail(base44, { to, subject, body }) {
  await base44.asServiceRole.integrations.Core.SendEmail({ to, subject, body });
}

Deno.serve(async (req) => {
  const headers = { 'Content-Type': 'application/json; charset=utf-8' };
  try {
    const base44 = createClientFromRequest(req);
    const payload = await req.json();
    const { questionnaireData } = payload;

    const { clientFirstName, clientEmail, poolSize } = questionnaireData;
    if (!clientEmail || !clientFirstName) {
      return new Response(JSON.stringify({ success: false, error: 'clientFirstName and clientEmail are required' }), { status: 200, headers });
    }

    // ── 1. Inline readiness check ──
    let settings = null;
    let releaseReady = false;
    let releaseBlockers = [];
    try {
      const rows = await base44.asServiceRole.entities.AdminSettings.list('-created_date', 1);
      settings = rows[0] || null;
      if (settings) {
        const riskEngine = JSON.parse(settings.riskEngine);
        const baseTiers = JSON.parse(settings.baseTierPrices);
        const tokens = JSON.parse(settings.additiveTokens);
        const brackets = riskEngine?.escalation_brackets;
        const bracketsOk = Array.isArray(brackets) && brackets.length >= 5;
        const multipliersOk = riskEngine?.size_multipliers && Object.keys(riskEngine.size_multipliers).length >= 4;
        const baseTiersOk = baseTiers?.tier_a_10_15k > 0 && baseTiers?.absolute_floor > 0;
        const tokensOk = Object.keys(tokens).length >= 10;
        releaseReady = bracketsOk && multipliersOk && baseTiersOk && tokensOk;
        if (!releaseReady) {
          releaseBlockers.push('AdminSettings config integrity check failed');
          console.warn('QUOTE_READINESS_GATING', { blocker: 'config_check_fail', brackets: brackets?.length, multipliers: riskEngine?.size_multipliers ? Object.keys(riskEngine.size_multipliers).length : 0, baseTiers: !!baseTiers?.tier_a_10_15k, tokens: Object.keys(tokens).length });
        }
      } else {
        releaseBlockers.push('AdminSettings not found in DB');
        console.warn('QUOTE_READINESS_GATING', { blocker: 'no_admin_settings' });
      }
    } catch (e) {
      releaseBlockers.push('AdminSettings load error: ' + e.message);
      console.error('QUOTE_READINESS_ERROR', { error: e.message });
    }

    // ── 2. Create/upsert Lead record ──
    let lead = null;
    try {
      const existing = await base44.asServiceRole.entities.Lead.filter({ email: clientEmail }, '-created_date', 1);
      const leadData = {
        firstName: clientFirstName,
        email: clientEmail,
        poolType: questionnaireData.poolType || undefined,
        screenedArea: questionnaireData.enclosure === 'unscreened' ? 'unscreened' : (questionnaireData.enclosure === 'fully_screened' ? 'fully_screened' : undefined),
        treesOverhead: questionnaireData.treesOverhead || undefined,
        usageFrequency: questionnaireData.useFrequency || undefined,
        sanitizerType: questionnaireData.chlorinationMethod === 'saltwater' ? 'saltwater' : (questionnaireData.chlorinationMethod === 'traditional' ? 'tablets' : undefined),
        poolCondition: (() => {
          const c = questionnaireData.poolCondition;
          if (c === 'clear') return 'clear';
          if (c === 'slightly_cloudy') return 'slightly_cloudy';
          if (c === 'green' || c === 'dark_algae') return 'green';
          return undefined;
        })(),
        hasPets: questionnaireData.petsAccess || false,
        petsSwimInPool: questionnaireData.petsAccess || false,
        quoteGenerated: false,
        stage: 'new_lead',
      };
      if (existing.length > 0) {
        lead = await base44.asServiceRole.entities.Lead.update(existing[0].id, { ...leadData, quoteGenerated: true });
      } else {
        lead = await base44.asServiceRole.entities.Lead.create({ ...leadData, quoteGenerated: true });
      }
    } catch (e) {
      console.warn('Lead upsert failed (non-blocking):', e.message);
    }

    // ── 3. If ready: calculate quote and persist ──
    if (releaseReady && settings) {
      const isNotSure = poolSize === 'not_sure';
      let quoteResult = null;
      let quoteRecord = null;

      if (isNotSure) {
        quoteResult = runPricingRange(questionnaireData, settings);
      } else {
        quoteResult = runPricingEngine(questionnaireData, settings);
      }

      // Persist a Quote record (use min price for not_sure)
      const monthlyForRecord = isNotSure ? quoteResult.minMonthly : quoteResult.finalMonthlyPrice;
      const oneTimeForRecord = isNotSure ? quoteResult.minOneTimeFees : quoteResult.oneTimeFees;
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString();

      try {
        quoteRecord = await base44.asServiceRole.entities.Quote.create({
          clientEmail,
          clientFirstName,
          status: 'quoted',
          inputPoolSize: questionnaireData.poolSize,
          inputEnclosure: questionnaireData.enclosure,
          inputTreesOverhead: questionnaireData.treesOverhead || null,
          inputChlorinationMethod: questionnaireData.chlorinationMethod,
          inputUseFrequency: questionnaireData.useFrequency,
          inputPetsAccess: questionnaireData.petsAccess || false,
          inputPetSwimFrequency: questionnaireData.petSwimFrequency || null,
          inputPoolCondition: questionnaireData.poolCondition,
          outputMonthlyPrice: monthlyForRecord,
          outputPerVisitPrice: isNotSure ? null : quoteResult.perVisitPrice,
          outputOneTimeFees: oneTimeForRecord,
          outputFirstMonthTotal: monthlyForRecord + oneTimeForRecord,
          outputFrequency: isNotSure ? quoteResult.frequency : quoteResult.frequency,
          outputFrequencyAutoRequired: isNotSure ? quoteResult.frequencyAutoRequired : quoteResult.frequencyAutoRequired,
          outputSizeTier: isNotSure ? 'not_sure' : quoteResult.sizeTier,
          pricingEngineVersion: PRICING_ENGINE_VERSION,
          configRecordId: settings.id,
          expiresAt,
        });
        // Update lead with quote reference
        if (lead) {
          await base44.asServiceRole.entities.Lead.update(lead.id, { acceptedQuoteId: quoteRecord.id, quoteGenerated: true });
        }
      } catch (e) {
        console.warn('Quote persist failed (non-blocking):', e.message);
      }

      // ── Send quote email ──
      const scheduleLink = 'https://app.breezpoolcare.com/PreQualification';
      const priceDisplay = isNotSure
        ? `$${quoteResult.minMonthly}–$${quoteResult.maxMonthly}/month`
        : `$${quoteResult.finalMonthlyPrice}/month`;
      const freqDisplay = quoteResult.frequency === 'twice_weekly' ? 'Twice Weekly' : 'Weekly';
      const oneTimeDisplay = isNotSure
        ? (quoteResult.minOneTimeFees > 0 ? `$${quoteResult.minOneTimeFees}–$${quoteResult.maxOneTimeFees} one-time initial fee may apply` : '')
        : (quoteResult.oneTimeFees > 0 ? `$${quoteResult.oneTimeFees} one-time initial fee` : '');

      const emailBody = `Hi ${clientFirstName},

Your Breez Pool Care quote is ready.

Estimated Monthly Service: ${priceDisplay}
Service Frequency: ${freqDisplay}
${oneTimeDisplay ? oneTimeDisplay + '\n' : ''}
*Final pricing is based on confirmation of pool size, condition, and equipment during inspection to ensure accuracy and consistency.

Ready to move forward? Schedule your free, no-obligation inspection:
${scheduleLink}

Questions? Reply to this email or call us at (321) 524-3838.
Mon–Sat: 8am–6pm

Breez Pool Care LLC
Owner/Operator: Matt Inghram`;

      try {
        await sendEmail(base44, {
          to: clientEmail,
          subject: `${clientFirstName}, your Breez Pool Care quote is ready`,
          body: emailBody
        });
      } catch (e) {
        console.warn('Quote email failed (non-blocking):', e.message);
      }

      return new Response(JSON.stringify({
        success: true,
        releaseReady: true,
        quoteId: quoteRecord?.id || null,
        isRange: isNotSure,
        quote: quoteResult,
      }), { status: 200, headers });
    }

    // ── 4. Not ready — send follow-up email ──
    const scheduleLink = 'https://app.breezpoolcare.com/PreQualification';
    const followUpBody = `Hi ${clientFirstName},

Thank you for reaching out to Breez Pool Care!

We've received your pool information and our team will prepare your personalized quote and be in touch shortly.

In the meantime, feel free to schedule your free, no-obligation inspection:
${scheduleLink}

Questions? Call us at (321) 524-3838.
Mon–Sat: 8am–6pm

Breez Pool Care LLC
Owner/Operator: Matt Inghram`;

    try {
      await sendEmail(base44, {
        to: clientEmail,
        subject: `Thanks ${clientFirstName} — we'll send your Breez quote shortly`,
        body: followUpBody
      });
    } catch (e) {
      console.warn('Follow-up email failed (non-blocking):', e.message);
    }

    return new Response(JSON.stringify({
      success: true,
      releaseReady: false,
      releaseBlockers,
    }), { status: 200, headers });

  } catch (error) {
    console.error('publicGetQuote error:', error.message, error.stack);
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers });
  }
});