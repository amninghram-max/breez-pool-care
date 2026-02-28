import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * verifyInspectionQuote
 * Inspector edits verified inputs → system re-runs pricing engine deterministically.
 * If price changes → new immutable Quote version with auto-generated reason codes.
 * If no change → marks quote inspectionVerified=true.
 * No manual price override allowed.
 */

const PRICING_ENGINE_VERSION = 'v2_tokens_risk_frequency';

// NO DEFAULT ESCALATION BRACKETS — AdminSettings is the sole source of truth.

// Maps input field names to structured reason codes
const INPUT_TO_REASON_CODE = {
  poolSize: 'SIZE_MISMATCH',
  enclosure: 'SCREENING_STATUS_MISMATCH',
  treesOverhead: 'TREE_EXPOSURE_MISMATCH',
  chlorinationMethod: 'CHLORINATION_METHOD_MISMATCH',
  chlorinatorType: 'CHLORINATION_METHOD_MISMATCH',
  useFrequency: 'USAGE_MISMATCH',
  petsAccess: 'PETS_MISMATCH',
  petSwimFrequency: 'PETS_MISMATCH',
  poolCondition: 'CONDITION_MISMATCH',
  greenPoolSeverity: 'CONDITION_MISMATCH',
  filterType: 'FILTER_MISMATCH',
  poolType: 'POOL_TYPE_MISMATCH',
  spaPresent: 'SPA_MISMATCH'
};

function runPricingEngine(q, settings) {
  const baseTiers = JSON.parse(settings.baseTierPrices);
  const tokens = JSON.parse(settings.additiveTokens);
  const initialFees = JSON.parse(settings.initialFees);
  const riskEngine = JSON.parse(settings.riskEngine);
  const frequencyLogic = JSON.parse(settings.frequencyLogic);

  let sizeTier = 'tier_a';
  let baseMonthly = baseTiers.tier_a_10_15k || 140;
  if (q.poolSize === '15_20k') { sizeTier = 'tier_b'; baseMonthly = baseTiers.tier_b_15_20k || 160; }
  else if (q.poolSize === '20_30k') { sizeTier = 'tier_c'; baseMonthly = baseTiers.tier_c_20_30k || 190; }
  else if (q.poolSize === '30k_plus') { sizeTier = 'tier_d'; baseMonthly = baseTiers.tier_d_30k_plus || 230; }

  let monthlyAdditiveSum = 0;
  let additiveTokensApplied = [];

  if (q.enclosure === 'unscreened') {
    let amt = sizeTier === 'tier_a' ? (tokens.unscreened_tier_a || 20)
      : sizeTier === 'tier_b' ? (tokens.unscreened_tier_b || 25)
      : sizeTier === 'tier_c' ? (tokens.unscreened_tier_c || 30)
      : (tokens.unscreened_tier_d || 40);
    monthlyAdditiveSum += amt;
    additiveTokensApplied.push({ token_name: 'Not screened', amount: amt });
  }
  if (q.enclosure === 'unscreened' && q.treesOverhead === 'yes') {
    const amt = tokens.trees_overhead || 10;
    monthlyAdditiveSum += amt;
    additiveTokensApplied.push({ token_name: 'Trees overhead', amount: amt });
  }
  if (q.useFrequency === 'weekends') { const amt = tokens.usage_weekends || 10; monthlyAdditiveSum += amt; additiveTokensApplied.push({ token_name: 'Weekends usage', amount: amt }); }
  else if (q.useFrequency === 'several_week') { const amt = tokens.usage_several_week || 10; monthlyAdditiveSum += amt; additiveTokensApplied.push({ token_name: 'Several times/week usage', amount: amt }); }
  else if (q.useFrequency === 'daily') { const amt = tokens.usage_daily || 20; monthlyAdditiveSum += amt; additiveTokensApplied.push({ token_name: 'Daily usage', amount: amt }); }

  const chlorMethod = q.chlorinationMethod;
  const chlorType = q.chlorinatorType;
  if (chlorMethod === 'tablets' && (chlorType === 'floating' || chlorType === 'skimmer')) {
    let amt = sizeTier === 'tier_a' ? (tokens.chlorinator_floater_tier_a || 5)
      : sizeTier === 'tier_b' ? (tokens.chlorinator_floater_tier_b || 10)
      : sizeTier === 'tier_c' ? (tokens.chlorinator_floater_tier_c || 15)
      : (tokens.chlorinator_floater_tier_d || 20);
    monthlyAdditiveSum += amt;
    additiveTokensApplied.push({ token_name: 'Floater/skimmer chlorinator', amount: amt });
  }
  if (chlorMethod === 'liquid_chlorine') {
    const amt = tokens.chlorinator_liquid_only || 10;
    monthlyAdditiveSum += amt;
    additiveTokensApplied.push({ token_name: 'Liquid chlorine only', amount: amt });
  }
  if (q.petsAccess) {
    if (q.petSwimFrequency === 'occasionally') { const amt = tokens.pets_occasional || 5; monthlyAdditiveSum += amt; additiveTokensApplied.push({ token_name: 'Pets swim occasionally', amount: amt }); }
    else if (q.petSwimFrequency === 'frequently') { const amt = tokens.pets_frequent || 10; monthlyAdditiveSum += amt; additiveTokensApplied.push({ token_name: 'Pets swim frequently', amount: amt }); }
  }

  let monthlyAfterTokens = baseMonthly + monthlyAdditiveSum;

  const riskPoints = riskEngine.points;
  const sizeMultipliers = riskEngine.size_multipliers;
  const escalationBrackets = Array.isArray(riskEngine.escalation_brackets) && riskEngine.escalation_brackets.length >= 5
    ? riskEngine.escalation_brackets : DEFAULT_ESCALATION_BRACKETS;

  let rawRisk = 0;
  if (q.enclosure === 'unscreened') rawRisk += riskPoints.unscreened || 2;
  if (q.enclosure === 'unscreened' && q.treesOverhead === 'yes') rawRisk += riskPoints.trees_overhead || 1;
  if (q.useFrequency === 'daily') rawRisk += riskPoints.usage_daily || 2;
  else if (q.useFrequency === 'several_week') rawRisk += riskPoints.usage_several_week || 1;
  if (chlorMethod === 'tablets' && (chlorType === 'floating' || chlorType === 'skimmer')) rawRisk += riskPoints.chlorinator_floater_skimmer || 1;
  if (chlorMethod === 'liquid_chlorine') rawRisk += riskPoints.chlorinator_liquid_only || 2;
  if (q.petsAccess) {
    if (q.petSwimFrequency === 'frequently') rawRisk += riskPoints.pets_frequent || 1;
    else if (q.petSwimFrequency === 'occasionally') rawRisk += riskPoints.pets_occasional || 0.5;
  }
  if (q.poolCondition === 'green_algae') rawRisk += riskPoints.condition_green || 2;

  let sizeMultiplier = sizeTier === 'tier_a' ? (sizeMultipliers.tier_a || 1.0)
    : sizeTier === 'tier_b' ? (sizeMultipliers.tier_b || 1.1)
    : sizeTier === 'tier_c' ? (sizeMultipliers.tier_c || 1.2)
    : (sizeMultipliers.tier_d || 1.3);

  const adjustedRisk = rawRisk * sizeMultiplier;

  const sortedBrackets = [...escalationBrackets].sort((a, b) => a.min_risk - b.min_risk);
  let riskAddonAmount = 0;
  let riskBracket = null;
  for (const bracket of sortedBrackets) {
    if (adjustedRisk >= bracket.min_risk && (bracket.max_risk >= 999 || adjustedRisk <= bracket.max_risk)) {
      riskAddonAmount = bracket.addon_amount || 0;
      riskBracket = bracket.max_risk >= 999 ? `${bracket.min_risk}+` : `${bracket.min_risk}-${bracket.max_risk}`;
      break;
    }
  }
  monthlyAfterTokens += riskAddonAmount;

  const autoRequireThreshold = frequencyLogic.auto_require_threshold || 9;
  let frequencySelectedOrRequired = 'weekly';
  let frequencyMultiplier = 1.0;
  let frequencyAutoRequired = false;
  if (adjustedRisk >= autoRequireThreshold) {
    frequencySelectedOrRequired = 'twice_weekly';
    frequencyMultiplier = frequencyLogic.twice_weekly_multiplier || 1.8;
    frequencyAutoRequired = true;
  }

  let finalMonthlyPrice = monthlyAfterTokens * frequencyMultiplier;
  const absoluteFloor = baseTiers.absolute_floor || 120;
  if (finalMonthlyPrice < absoluteFloor) finalMonthlyPrice = absoluteFloor;

  const visitsPerMonth = frequencySelectedOrRequired === 'weekly' ? 4.33 : 8.66;
  const perVisitPrice = finalMonthlyPrice / visitsPerMonth;

  let oneTimeFees = 0;
  let greenSizeGroup = null;
  if (q.poolCondition === 'slightly_cloudy') oneTimeFees += initialFees.slightly_cloudy || 25;
  if (q.poolCondition === 'green_algae') {
    greenSizeGroup = sizeTier === 'tier_a' ? 'small' : (sizeTier === 'tier_d' ? 'large' : 'medium');
    const severity = q.greenPoolSeverity || 'moderate';
    const key = severity === 'light' ? `green_light_${greenSizeGroup}` : severity === 'black_swamp' ? `green_black_${greenSizeGroup}` : `green_moderate_${greenSizeGroup}`;
    const fee = initialFees[key];
    oneTimeFees += fee !== undefined ? fee : (greenSizeGroup === 'small' ? 100 : greenSizeGroup === 'medium' ? 150 : 200);
  }

  return {
    sizeTier,
    baseMonthly: parseFloat(baseMonthly.toFixed(2)),
    additiveTokensApplied,
    rawRisk: parseFloat(rawRisk.toFixed(2)),
    adjustedRisk: parseFloat(adjustedRisk.toFixed(2)),
    riskBracket,
    riskAddonAmount: parseFloat(riskAddonAmount.toFixed(2)),
    frequencySelectedOrRequired,
    frequencyAutoRequired,
    frequencyMultiplier,
    finalMonthlyPrice: parseFloat(finalMonthlyPrice.toFixed(2)),
    perVisitPrice: parseFloat(perVisitPrice.toFixed(2)),
    oneTimeFees: parseFloat(oneTimeFees.toFixed(2)),
    firstMonthTotal: parseFloat((finalMonthlyPrice + oneTimeFees).toFixed(2)),
    greenSizeGroup
  };
}

function computeInputDiff(original, verified) {
  const fields = ['poolSize', 'poolType', 'spaPresent', 'enclosure', 'treesOverhead', 'filterType',
    'chlorinationMethod', 'chlorinatorType', 'useFrequency', 'petsAccess', 'petSwimFrequency',
    'poolCondition', 'greenPoolSeverity'];

  const diff = {};
  for (const field of fields) {
    const orig = original[field];
    const verif = verified[field];
    if (String(orig) !== String(verif)) {
      diff[field] = { original: orig, verified: verif };
    }
  }
  return diff;
}

function autoReasonCodes(inputDiff) {
  const codes = new Set();
  for (const field of Object.keys(inputDiff)) {
    const code = INPUT_TO_REASON_CODE[field];
    if (code) codes.add(code);
  }
  return Array.from(codes);
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || !['admin', 'staff'].includes(user.role)) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { originalQuoteId, verifiedInputs } = await req.json();
    if (!originalQuoteId || !verifiedInputs) {
      return Response.json({ error: 'originalQuoteId and verifiedInputs required' }, { status: 400 });
    }

    console.log(`🔍 verifyInspectionQuote — originalQuoteId=${originalQuoteId}, inspector=${user.email}`);

    // Load original quote
    const originalQuote = await base44.asServiceRole.entities.Quote.get(originalQuoteId);
    if (!originalQuote) {
      return Response.json({ error: 'Quote not found' }, { status: 404 });
    }
    if (originalQuote.inspectionVerified) {
      return Response.json({ error: 'Quote already inspection-verified' }, { status: 409 });
    }

    // Load AdminSettings
    const rows = await base44.asServiceRole.entities.AdminSettings.list('-created_date', 1);
    const settings = rows[0];
    if (!settings) {
      return Response.json({ error: 'AdminSettings not found', code: 'ADMIN_SETTINGS_MISSING' }, { status: 503 });
    }

    // Extract original inputs from quote record
    const originalInputs = {
      poolSize: originalQuote.inputPoolSize,
      poolType: originalQuote.inputPoolType,
      spaPresent: originalQuote.inputSpaPresent,
      enclosure: originalQuote.inputEnclosure,
      treesOverhead: originalQuote.inputTreesOverhead,
      filterType: originalQuote.inputFilterType,
      chlorinationMethod: originalQuote.inputChlorinationMethod,
      chlorinatorType: originalQuote.inputChlorinatiorType,
      useFrequency: originalQuote.inputUseFrequency,
      petsAccess: originalQuote.inputPetsAccess,
      petSwimFrequency: originalQuote.inputPetSwimFrequency,
      poolCondition: originalQuote.inputPoolCondition,
      greenPoolSeverity: originalQuote.inputGreenPoolSeverity
    };

    // Compute diff
    const inputDiff = computeInputDiff(originalInputs, verifiedInputs);
    const inputDiffJson = JSON.stringify(inputDiff);

    // Re-run pricing engine with verified inputs
    const repriced = runPricingEngine(verifiedInputs, settings);

    const originalMonthly = originalQuote.outputMonthlyPrice;
    const newMonthly = repriced.finalMonthlyPrice;
    const priceChanged = Math.abs(originalMonthly - newMonthly) >= 0.01;

    const nowIso = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
    const reasonCodes = autoReasonCodes(inputDiff);

    let resultQuoteId;

    if (priceChanged) {
      // Create new immutable Quote version
      const newVersion = (originalQuote.version || 1) + 1;
      const newQuote = await base44.asServiceRole.entities.Quote.create({
        clientEmail: originalQuote.clientEmail,
        clientFirstName: originalQuote.clientFirstName,
        clientLastName: originalQuote.clientLastName,
        clientPhone: originalQuote.clientPhone,
        status: 'inspection_verified',
        version: newVersion,
        previousQuoteId: originalQuoteId,
        inspectionVerified: true,
        inspectionVerifiedAt: nowIso,
        inspectionVerifiedBy: user.email,
        priceChanged: true,
        adjustmentReasonCodes: reasonCodes,
        inputDiff: inputDiffJson,
        inputPoolSize: verifiedInputs.poolSize,
        inputPoolType: verifiedInputs.poolType,
        inputSpaPresent: verifiedInputs.spaPresent,
        inputEnclosure: verifiedInputs.enclosure,
        inputTreesOverhead: verifiedInputs.treesOverhead || null,
        inputFilterType: verifiedInputs.filterType,
        inputChlorinationMethod: verifiedInputs.chlorinationMethod,
        inputChlorinatiorType: verifiedInputs.chlorinatorType || null,
        inputUseFrequency: verifiedInputs.useFrequency,
        inputPetsAccess: verifiedInputs.petsAccess || false,
        inputPetSwimFrequency: verifiedInputs.petSwimFrequency || null,
        inputPoolCondition: verifiedInputs.poolCondition,
        inputGreenPoolSeverity: verifiedInputs.greenPoolSeverity || null,
        outputMonthlyPrice: repriced.finalMonthlyPrice,
        outputPerVisitPrice: repriced.perVisitPrice,
        outputOneTimeFees: repriced.oneTimeFees,
        outputFirstMonthTotal: repriced.firstMonthTotal,
        outputFrequency: repriced.frequencySelectedOrRequired,
        outputFrequencyAutoRequired: repriced.frequencyAutoRequired,
        outputSizeTier: repriced.sizeTier,
        outputGreenSizeGroup: repriced.greenSizeGroup || null,
        pricingEngineVersion: PRICING_ENGINE_VERSION,
        configRecordId: settings.id,
        expiresAt
      });
      resultQuoteId = newQuote.id;
      console.log(`✅ New quote version created: id=${newQuote.id}, v${newVersion}, $${originalMonthly}→$${newMonthly}`);
    } else {
      // Mark original as inspectionVerified (no price change)
      await base44.asServiceRole.entities.Quote.update(originalQuoteId, {
        inspectionVerified: true,
        inspectionVerifiedAt: nowIso,
        inspectionVerifiedBy: user.email,
        priceChanged: false,
        status: 'inspection_verified',
        inputDiff: inputDiffJson,
        adjustmentReasonCodes: reasonCodes
      });
      resultQuoteId = originalQuoteId;
      console.log(`✅ Quote inspectionVerified (no price change): id=${originalQuoteId}`);
    }

    return Response.json({
      success: true,
      priceChanged,
      resultQuoteId,
      originalMonthly,
      newMonthly,
      inputDiff,
      adjustmentReasonCodes: reasonCodes,
      repriced
    });
  } catch (error) {
    console.error('verifyInspectionQuote error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});