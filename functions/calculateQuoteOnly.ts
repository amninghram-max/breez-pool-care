import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * calculateQuoteOnly — pure pricing engine, NO persistence.
 * Used by Demo mode and by verifyInspectionQuote for re-pricing.
 * Returns full quote breakdown without saving any records.
 */

const PRICING_ENGINE_VERSION = 'v2_tokens_risk_frequency';

const DEFAULT_ESCALATION_BRACKETS = [
  { min_risk: 0, max_risk: 2, addon_amount: 0 },
  { min_risk: 3, max_risk: 5, addon_amount: 15 },
  { min_risk: 6, max_risk: 8, addon_amount: 30 },
  { min_risk: 9, max_risk: 11, addon_amount: 45 },
  { min_risk: 12, max_risk: 999, addon_amount: 60 }
];

export function runPricingEngine(questionnaireData, settings) {
  const baseTiers = JSON.parse(settings.baseTierPrices);
  const tokens = JSON.parse(settings.additiveTokens);
  const initialFees = JSON.parse(settings.initialFees);
  const riskEngine = JSON.parse(settings.riskEngine);
  const frequencyLogic = JSON.parse(settings.frequencyLogic);
  const autopayDiscount = settings.autopayDiscount || 10;

  // 1) SIZE TIER
  let sizeTier = 'tier_a';
  let baseMonthly = baseTiers.tier_a_10_15k || 140;
  if (questionnaireData.poolSize === '15_20k') { sizeTier = 'tier_b'; baseMonthly = baseTiers.tier_b_15_20k || 160; }
  else if (questionnaireData.poolSize === '20_30k') { sizeTier = 'tier_c'; baseMonthly = baseTiers.tier_c_20_30k || 190; }
  else if (questionnaireData.poolSize === '30k_plus') { sizeTier = 'tier_d'; baseMonthly = baseTiers.tier_d_30k_plus || 230; }

  // 2) ADDITIVE TOKENS
  let monthlyAdditiveSum = 0;
  let additiveTokensApplied = [];

  if (questionnaireData.enclosure === 'unscreened') {
    let amt = 0;
    if (sizeTier === 'tier_a') amt = tokens.unscreened_tier_a || 20;
    else if (sizeTier === 'tier_b') amt = tokens.unscreened_tier_b || 25;
    else if (sizeTier === 'tier_c') amt = tokens.unscreened_tier_c || 30;
    else if (sizeTier === 'tier_d') amt = tokens.unscreened_tier_d || 40;
    monthlyAdditiveSum += amt;
    additiveTokensApplied.push({ token_name: 'Not screened', amount: amt });
  }

  if (questionnaireData.enclosure === 'unscreened' && questionnaireData.treesOverhead === 'yes') {
    const amt = tokens.trees_overhead || 10;
    monthlyAdditiveSum += amt;
    additiveTokensApplied.push({ token_name: 'Trees overhead', amount: amt });
  }

  if (questionnaireData.useFrequency === 'weekends') {
    const amt = tokens.usage_weekends || 10;
    monthlyAdditiveSum += amt;
    additiveTokensApplied.push({ token_name: 'Weekends usage', amount: amt });
  } else if (questionnaireData.useFrequency === 'several_week') {
    const amt = tokens.usage_several_week || 10;
    monthlyAdditiveSum += amt;
    additiveTokensApplied.push({ token_name: 'Several times/week usage', amount: amt });
  } else if (questionnaireData.useFrequency === 'daily') {
    const amt = tokens.usage_daily || 20;
    monthlyAdditiveSum += amt;
    additiveTokensApplied.push({ token_name: 'Daily usage', amount: amt });
  }

  const chlorMethod = questionnaireData.chlorinationMethod;
  const chlorType = questionnaireData.chlorinatorType;

  if (chlorMethod === 'tablets' && (chlorType === 'floating' || chlorType === 'skimmer')) {
    let amt = 0;
    if (sizeTier === 'tier_a') amt = tokens.chlorinator_floater_tier_a || 5;
    else if (sizeTier === 'tier_b') amt = tokens.chlorinator_floater_tier_b || 10;
    else if (sizeTier === 'tier_c') amt = tokens.chlorinator_floater_tier_c || 15;
    else if (sizeTier === 'tier_d') amt = tokens.chlorinator_floater_tier_d || 20;
    monthlyAdditiveSum += amt;
    additiveTokensApplied.push({ token_name: 'Floater/skimmer chlorinator', amount: amt });
  }

  if (chlorMethod === 'liquid_chlorine') {
    const amt = tokens.chlorinator_liquid_only || 10;
    monthlyAdditiveSum += amt;
    additiveTokensApplied.push({ token_name: 'Liquid chlorine only', amount: amt });
  }

  if (questionnaireData.petsAccess) {
    if (questionnaireData.petSwimFrequency === 'occasionally') {
      const amt = tokens.pets_occasional || 5;
      monthlyAdditiveSum += amt;
      additiveTokensApplied.push({ token_name: 'Pets swim occasionally', amount: amt });
    } else if (questionnaireData.petSwimFrequency === 'frequently') {
      const amt = tokens.pets_frequent || 10;
      monthlyAdditiveSum += amt;
      additiveTokensApplied.push({ token_name: 'Pets swim frequently', amount: amt });
    }
  }

  let monthlyAfterTokens = baseMonthly + monthlyAdditiveSum;

  // 3) RISK ENGINE
  const riskPoints = riskEngine.points;
  const sizeMultipliers = riskEngine.size_multipliers;
  let escalationBrackets = Array.isArray(riskEngine.escalation_brackets) && riskEngine.escalation_brackets.length >= 5
    ? riskEngine.escalation_brackets : DEFAULT_ESCALATION_BRACKETS;

  let rawRisk = 0;
  if (questionnaireData.enclosure === 'unscreened') rawRisk += riskPoints.unscreened || 2;
  if (questionnaireData.enclosure === 'unscreened' && questionnaireData.treesOverhead === 'yes') rawRisk += riskPoints.trees_overhead || 1;
  if (questionnaireData.useFrequency === 'daily') rawRisk += riskPoints.usage_daily || 2;
  else if (questionnaireData.useFrequency === 'several_week') rawRisk += riskPoints.usage_several_week || 1;
  if (chlorMethod === 'tablets' && (chlorType === 'floating' || chlorType === 'skimmer')) rawRisk += riskPoints.chlorinator_floater_skimmer || 1;
  if (chlorMethod === 'liquid_chlorine') rawRisk += riskPoints.chlorinator_liquid_only || 2;
  if (questionnaireData.petsAccess) {
    if (questionnaireData.petSwimFrequency === 'frequently') rawRisk += riskPoints.pets_frequent || 1;
    else if (questionnaireData.petSwimFrequency === 'occasionally') rawRisk += riskPoints.pets_occasional || 0.5;
  }
  if (questionnaireData.poolCondition === 'green_algae') rawRisk += riskPoints.condition_green || 2;

  let sizeMultiplier = 1.0;
  if (sizeTier === 'tier_a') sizeMultiplier = sizeMultipliers.tier_a || 1.0;
  else if (sizeTier === 'tier_b') sizeMultiplier = sizeMultipliers.tier_b || 1.1;
  else if (sizeTier === 'tier_c') sizeMultiplier = sizeMultipliers.tier_c || 1.2;
  else if (sizeTier === 'tier_d') sizeMultiplier = sizeMultipliers.tier_d || 1.3;

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
  if (riskAddonAmount > 0) {
    additiveTokensApplied.push({ token_name: 'Risk escalation buffer (internal)', amount: riskAddonAmount });
  }

  // 4) FREQUENCY
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

  // 5) ONE-TIME FEES
  let oneTimeFees = 0;
  let greenSizeGroup = null;
  if (questionnaireData.poolCondition === 'slightly_cloudy') {
    oneTimeFees += initialFees.slightly_cloudy || 25;
  }
  if (questionnaireData.poolCondition === 'green_algae') {
    if (sizeTier === 'tier_a') greenSizeGroup = 'small';
    else if (sizeTier === 'tier_b' || sizeTier === 'tier_c') greenSizeGroup = 'medium';
    else greenSizeGroup = 'large';

    const severity = questionnaireData.greenPoolSeverity || 'moderate';
    const greenFeeKey = severity === 'light' ? `green_light_${greenSizeGroup}`
      : severity === 'black_swamp' ? `green_black_${greenSizeGroup}`
      : `green_moderate_${greenSizeGroup}`;
    const greenFee = initialFees[greenFeeKey];
    oneTimeFees += greenFee !== undefined ? greenFee : (greenSizeGroup === 'small' ? 100 : greenSizeGroup === 'medium' ? 150 : 200);
  }

  const estimatedFirstMonthTotal = finalMonthlyPrice + oneTimeFees;

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
    estimatedMonthlyPrice: parseFloat(finalMonthlyPrice.toFixed(2)),
    estimatedPerVisitPrice: parseFloat(perVisitPrice.toFixed(2)),
    estimatedOneTimeFees: parseFloat(oneTimeFees.toFixed(2)),
    estimatedFirstMonthTotal: parseFloat(estimatedFirstMonthTotal.toFixed(2)),
    greenSizeGroup,
    autopayDiscountAmount: autopayDiscount,
    quoteLogicVersionId: PRICING_ENGINE_VERSION,
    configRecordId: settings.id
  };
}

Deno.serve(async (req) => {
  try {
    console.log("📊 calculateQuoteOnly — pure engine, no persistence");
    const base44 = createClientFromRequest(req);

    const payload = await req.json();
    const { questionnaireData } = payload;

    const rows = await base44.asServiceRole.entities.AdminSettings.list('-created_date', 1);
    const settings = rows[0] || null;

    if (!settings) {
      return Response.json({ error: 'AdminSettings not found', code: 'ADMIN_SETTINGS_MISSING' }, { status: 503 });
    }

    const result = runPricingEngine(questionnaireData, settings);

    return Response.json({ success: true, quote: result, configRecordId: settings.id });
  } catch (error) {
    console.error('calculateQuoteOnly error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});