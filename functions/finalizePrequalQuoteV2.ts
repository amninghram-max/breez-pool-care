import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { getAppOrigin } from './_getAppOrigin.js';

/**
 * finalizePrequalQuoteV2
 * Called from PreQualification wizard on final submit.
 * 
 * Resolves token → leadId, computes quote, PERSISTS snapshot to Quote entity,
 * returns priceSummary with idempotency (no duplicate quotes for same token).
 * 
 * Input: { token, prequalAnswers, appOrigin? }
 * Output: { success, quoteToken, leadId, firstName, email, priceSummary, persisted, build }
 */

const BUILD = "FPQ-V2-2026-03-02";
const PRICING_ENGINE_VERSION = 'v2_tokens_risk_frequency';

const json200 = (data) => new Response(
  JSON.stringify(data),
  { status: 200, headers: { "content-type": "application/json; charset=utf-8" } }
);

// Inline pricing engine (same as V1)
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

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const payload = await req.json();
    const {
      token,
      prequalAnswers,
      clientFirstName: payloadFirstName,
      clientEmail: payloadEmail,
    } = payload || {};

    // Validate inputs
    if (!token || typeof token !== 'string') {
      return json200({
        success: false,
        error: 'token is required',
        build: BUILD
      });
    }

    if (!prequalAnswers || typeof prequalAnswers !== 'object') {
      return json200({
        success: false,
        error: 'prequalAnswers is required',
        build: BUILD
      });
    }

    // Use clientFirstName and clientEmail from payload
    // Fall back to QuoteRequests only if not provided in payload
    let firstName = payloadFirstName || prequalAnswers?.clientFirstName || null;
    let email = payloadEmail || prequalAnswers?.clientEmail || null;
    let leadId = null;
    let quoteRequest = null;

    // Resolve QuoteRequests row via token (required)
    try {
      const requests = await base44.asServiceRole.entities.QuoteRequests.filter({ token: token.trim() }, null, 1);
      if (requests && requests.length > 0) {
        quoteRequest = requests[0];
        leadId = quoteRequest.leadId || null;
        // Only use QuoteRequests email if not provided in payload
        if (!email) email = quoteRequest.email;
        // Only use QuoteRequests firstName if not provided in payload
        if (!firstName) firstName = quoteRequest.firstName || null;
        console.log('FPQ_V2_TOKEN_RESOLVED', { token: token.trim().slice(0, 8), leadId, hasEmail: !!email, fromPayload: !!payloadEmail });
      }
    } catch (e) {
      console.warn('FPQ_V2_TOKEN_RESOLUTION_FAILED', { error: e.message });
    }

    if (!quoteRequest) {
      return json200({
        success: false,
        error: 'Invalid or expired token',
        code: 'TOKEN_NOT_FOUND',
        build: BUILD
      });
    }

    // Normalize user-provided contact input before attempting fallbacks.
    if (typeof email === 'string') {
      const trimmedEmail = email.trim().toLowerCase();
      email = trimmedEmail || null;
    }
    if (typeof firstName === 'string') {
      const trimmedName = firstName.trim();
      firstName = trimmedName || null;
    }

    // Repair missing QuoteRequests contact fields from latest Quote snapshot before validation.
    // This avoids blocking tokenized users when QuoteRequests has a placeholder/empty email.
    if (!email || email === 'guest@breezpoolcare.com') {
      try {
        const quotes = await base44.asServiceRole.entities.Quote.filter({ quoteToken: token.trim() }, '-created_date', 1);
        const latestQuote = quotes?.[0] || null;
        if (latestQuote) {
          if ((!email || email === 'guest@breezpoolcare.com') && latestQuote.clientEmail) {
            email = latestQuote.clientEmail;
          }
          if (!firstName && latestQuote.clientFirstName) {
            firstName = latestQuote.clientFirstName;
          }
          if (!leadId && latestQuote.leadId) {
            leadId = latestQuote.leadId;
          }

          const patch = {};
          if (leadId && quoteRequest.leadId !== leadId) patch.leadId = leadId;
          if (email && quoteRequest.email !== email) patch.email = email;
          if (firstName && quoteRequest.firstName !== firstName) patch.firstName = firstName;
          if (Object.keys(patch).length > 0) {
            await base44.asServiceRole.entities.QuoteRequests.update(quoteRequest.id, patch);
            console.log('FPQ_V2_REPAIRED_FROM_QUOTE', { token: token.trim().slice(0, 8), repaired: Object.keys(patch) });
          }
        }
      } catch (repairErr) {
        console.warn('FPQ_V2_REPAIR_FROM_QUOTE_FAILED', { error: repairErr.message, token: token.trim().slice(0, 8) });
      }
    }

    // Final fallback: attempt to recover contact from linked Lead.
    if ((!email || email === 'guest@breezpoolcare.com') && leadId) {
      try {
        const leadRows = await base44.asServiceRole.entities.Lead.filter({ id: leadId }, null, 1);
        const lead = leadRows?.[0] || null;
        if (lead) {
          if ((!email || email === 'guest@breezpoolcare.com') && lead.email) {
            email = String(lead.email).trim().toLowerCase();
          }
          if (!firstName && lead.firstName) {
            firstName = String(lead.firstName).trim() || null;
          }

          const patch = {};
          if (email && quoteRequest?.email !== email) patch.email = email;
          if (firstName && quoteRequest?.firstName !== firstName) patch.firstName = firstName;
          if (quoteRequest?.id && Object.keys(patch).length > 0) {
            await base44.asServiceRole.entities.QuoteRequests.update(quoteRequest.id, patch);
            console.log('FPQ_V2_REPAIRED_FROM_LEAD', { token: token.trim().slice(0, 8), repaired: Object.keys(patch) });
          }
        }
      } catch (leadRepairErr) {
        console.warn('FPQ_V2_REPAIR_FROM_LEAD_FAILED', { error: leadRepairErr.message, token: token.trim().slice(0, 8) });
      }
    }

    // Validate that email is present and normalize placeholders
    if (!email || email === 'guest@breezpoolcare.com') {
      return json200({
        success: false,
        error: 'Email is required (from payload, token, or quote snapshot)',
        code: 'INCOMPLETE_DATA',
        build: BUILD
      });
    }
    email = email.trim().toLowerCase();


    const sendQuoteReadyEmail = async ({ quoteToken, summary, targetLeadId }) => {
      try {
        const appOrigin = getAppOrigin(req);
        const scheduleLink = `${appOrigin}/ScheduleInspection?token=${encodeURIComponent(quoteToken.trim())}`;
        const monthlyText = summary?.monthlyPrice || 'TBD';
        const oneTimeText = summary?.oneTimeFees ? `\n• One-time fees: ${summary.oneTimeFees}` : '';
        const emailBody = `Hi ${firstName || 'there'},\n\nYour Breez quote is ready.\n\n• Monthly: ${monthlyText}\n• Frequency: ${summary?.visitFrequency || 'Weekly'}${oneTimeText}\n\nSchedule your free inspection here:\n${scheduleLink}\n\n— Breez Pool Care`;

        await base44.asServiceRole.integrations.Core.SendEmail({
          to: email,
          from_name: 'Breez Pool Care',
          subject: 'Your Breez Quote Is Ready — Schedule Your Free Inspection',
          body: emailBody
        });

        if (targetLeadId) {
          try {
            const leads = await base44.asServiceRole.entities.Lead.filter({ id: targetLeadId }, null, 1);
            const lead = leads?.[0] || null;
            if (lead) {
              const notes = `${lead.notes || ''}\n[QUOTE_EMAIL_SENT] ${new Date().toISOString()}`.trim();
              await base44.asServiceRole.entities.Lead.update(targetLeadId, { notes });
            }
          } catch (noteErr) {
            console.warn('FPQ_V2_QUOTE_EMAIL_NOTE_FAILED', { error: noteErr.message });
          }
        }

        console.log('FPQ_V2_QUOTE_EMAIL_SENT', { leadId: targetLeadId || null, token: quoteToken.trim().slice(0, 8) });
      } catch (emailErr) {
        console.warn('FPQ_V2_QUOTE_EMAIL_FAILED', { error: emailErr.message, token: quoteToken.trim().slice(0, 8) });
      }
    };

    // Check if quote already exists for this token (idempotency)
    let existingQuote = null;
    try {
      const existing = await base44.asServiceRole.entities.Quote.filter(
        { quoteToken: token.trim() },
        '-created_date',
        1
      );
      if (existing && existing.length > 0) {
        existingQuote = existing[0];
        console.log('FPQ_V2_IDEMPOTENCY_HIT', { token: token.trim().slice(0, 8), quoteId: existingQuote.id });
      }
    } catch (e) {
      console.warn('FPQ_V2_IDEMPOTENCY_CHECK_FAILED', { error: e.message });
    }

    // If quote exists, return it (after ensuring linkage is still usable)
    if (existingQuote) {
      if (!leadId && existingQuote.leadId) {
        leadId = existingQuote.leadId;
      }

      // Repair/create lead linkage for scheduling reliability
      try {
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
          const deletedLead = deletedRows?.[0] || null;
          if (deletedLead) {
            lead = await base44.asServiceRole.entities.Lead.update(deletedLead.id, {
              isDeleted: false,
              firstName: firstName || deletedLead.firstName || 'Customer',
              email
            });
          }
        }

        if (!lead) {
          lead = await base44.asServiceRole.entities.Lead.create({
            firstName: firstName || 'Customer',
            email,
            stage: 'contacted',
            quoteGenerated: true,
            isDeleted: false
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
        await base44.asServiceRole.entities.QuoteRequests.update(quoteRequest.id, {
          leadId,
          email,
          firstName: firstName || lead.firstName || null
        });
      } catch (linkErr) {
        console.warn('FPQ_V2_LINKAGE_REPAIR_FAILED', { error: linkErr.message });
      }

      const priceSummary = {
        monthlyPrice: existingQuote.outputMonthlyPrice ? `$${existingQuote.outputMonthlyPrice}` : '$0',
        visitFrequency: existingQuote.outputFrequency === 'weekly' ? 'Weekly' : 'Twice Weekly',
        planName: 'Your Quote',
        oneTimeFees: existingQuote.outputOneTimeFees && existingQuote.outputOneTimeFees > 0 ? `$${existingQuote.outputOneTimeFees}` : null,
        frequencyAutoRequired: existingQuote.outputFrequencyAutoRequired || false
      };

      await sendQuoteReadyEmail({
        quoteToken: existingQuote.quoteToken || token.trim(),
        summary: priceSummary,
        targetLeadId: leadId || existingQuote.leadId || null
      });

      return json200({
        success: true,
        quoteToken: existingQuote.quoteToken,
        leadId: leadId || existingQuote.leadId || null,
        firstName: existingQuote.clientFirstName || firstName,
        email: existingQuote.clientEmail || email,
        priceSummary,
        persisted: false, // existing, not newly persisted
        build: BUILD
      });
    }

    // Load AdminSettings for pricing
    let settings = null;
    try {
      const rows = await base44.asServiceRole.entities.AdminSettings.list('-created_date', 1);
      settings = rows[0];
      if (!settings) {
        return json200({
          success: false,
          error: 'Pricing configuration not found',
          build: BUILD
        });
      }
    } catch (e) {
      return json200({
        success: false,
        error: 'Failed to load pricing configuration',
        detail: e.message,
        build: BUILD
      });
    }

    // Validate settings integrity
    try {
      const riskEngine = JSON.parse(settings.riskEngine);
      const baseTiers = JSON.parse(settings.baseTierPrices);
      const brackets = riskEngine?.escalation_brackets;
      const bracketsOk = Array.isArray(brackets) && brackets.length >= 5;
      const multipliersOk = riskEngine?.size_multipliers && Object.keys(riskEngine.size_multipliers).length >= 4;
      const baseTiersOk = baseTiers?.tier_a_10_15k > 0 && baseTiers?.absolute_floor > 0;
      
      if (!bracketsOk || !multipliersOk || !baseTiersOk) {
        return json200({
          success: false,
          error: 'Pricing configuration is incomplete or invalid',
          build: BUILD
        });
      }
    } catch (e) {
      return json200({
        success: false,
        error: 'Failed to validate pricing configuration',
        detail: e.message,
        build: BUILD
      });
    }

    // Call pricing engine
    let quoteResult = null;
    try {
      const isNotSure = prequalAnswers.poolSize === 'not_sure';
      if (isNotSure) {
        quoteResult = runPricingRange(prequalAnswers, settings);
      } else {
        quoteResult = runPricingEngine(prequalAnswers, settings);
      }
      console.log('FPQ_V2_PRICING_COMPUTED', { monthly: isNotSure ? `${quoteResult.minMonthly}-${quoteResult.maxMonthly}` : quoteResult.finalMonthlyPrice });
    } catch (e) {
      console.error('FPQ_V2_PRICING_ERROR', { error: e.message });
      return json200({
        success: false,
        error: 'Failed to calculate pricing',
        detail: e.message,
        build: BUILD
      });
    }

    // Build priceSummary
    const isNotSure = prequalAnswers.poolSize === 'not_sure';
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

    // Ensure lead linkage is available for downstream scheduling
    try {
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
        const deletedLead = deletedRows?.[0] || null;
        if (deletedLead) {
          lead = await base44.asServiceRole.entities.Lead.update(deletedLead.id, {
            isDeleted: false,
            firstName: firstName || deletedLead.firstName || 'Customer',
            email
          });
        }
      }

      if (!lead) {
        lead = await base44.asServiceRole.entities.Lead.create({
          firstName: firstName || 'Customer',
          email,
          stage: 'contacted',
          quoteGenerated: true,
          isDeleted: false
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
      await base44.asServiceRole.entities.QuoteRequests.update(quoteRequest.id, {
        leadId,
        email,
        firstName: firstName || lead.firstName || null
      });
      console.log('FPQ_V2_QUOTEREQUEST_LINKED', { quoteRequestId: quoteRequest.id, leadId });
    } catch (linkErr) {
      console.warn('FPQ_V2_LEAD_LINKAGE_FAILED', { error: linkErr.message });
    }

    // Persist quote snapshot to Quote entity
    let persistedQuote = null;
    try {
      const quoteData = {
        leadId: leadId || null,
        clientEmail: email,
        clientFirstName: firstName,
        quoteToken: token.trim(),
        status: 'quoted',
        pricingEngineVersion: PRICING_ENGINE_VERSION,
        // Store inputs
        inputPoolSize: prequalAnswers.poolSize,
        inputEnclosure: prequalAnswers.enclosure,
        inputChlorinationMethod: prequalAnswers.chlorinationMethod,
        inputUseFrequency: prequalAnswers.useFrequency,
        inputTreesOverhead: prequalAnswers.treesOverhead,
        inputPetsAccess: prequalAnswers.petsAccess === true,
        inputPoolCondition: prequalAnswers.poolCondition,
        // Store outputs (handle range)
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
      console.log('FPQ_V2_QUOTE_PERSISTED', { quoteId: persistedQuote.id, token: token.trim().slice(0, 8) });

      // Auto-stage progression: update Lead to 'contacted' after quote persistence
      if (leadId) {
        try {
          const leadRows = await base44.asServiceRole.entities.Lead.filter({ id: leadId }, null, 1);
          const lead = leadRows?.[0] || null;
          const currentStage = lead?.stage || 'new_lead';
          if (currentStage === 'new_lead') {
            await base44.asServiceRole.entities.Lead.update(leadId, { stage: 'contacted' });
            console.log('FPQ_V2_STAGE_PROGRESSED', { leadId, oldStage: currentStage, newStage: 'contacted' });
          }
        } catch (stageErr) {
          console.warn('FPQ_V2_STAGE_UPDATE_FAILED', { error: stageErr.message });
          // Non-fatal: continue even if stage update fails
        }
      }

      // Send quote-ready scheduling email (non-blocking)
      await sendQuoteReadyEmail({
        quoteToken: token.trim(),
        summary: priceSummary,
        targetLeadId: leadId || null
      });
    } catch (e) {
      console.error('FPQ_V2_PERSIST_FAILED', { error: e.message });
      // Don't fail the response; still return the computed quote
    }

    const response = {
      success: true,
      quoteToken: token.trim(),
      leadId: leadId || null,
      firstName: firstName,
      email,
      priceSummary,
      persisted: !!persistedQuote,
      build: BUILD
    };

    return json200(response);

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
