import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// DEFAULT FALLBACK CONFIG (used only if AdminSettings is missing)
const DEFAULT_BRACKETS = [
  { min_risk: 0, max_risk: 2, addon_amount: 0 },
  { min_risk: 3, max_risk: 5, addon_amount: 15 },
  { min_risk: 6, max_risk: 8, addon_amount: 30 },
  { min_risk: 9, max_risk: 11, addon_amount: 45 },
  { min_risk: 12, max_risk: 999, addon_amount: 60 }
];

const DEFAULT_CONFIG = {
  baseTierPrices: {
    tier_a_10_15k: 140,
    tier_b_15_20k: 160,
    tier_c_20_30k: 190,
    tier_d_30k_plus: 230,
    absolute_floor: 120
  },
  additiveTokens: {
    unscreened_tier_a: 20,
    unscreened_tier_b: 25,
    unscreened_tier_c: 30,
    unscreened_tier_d: 40,
    trees_overhead: 10,
    usage_weekends: 10,
    usage_several_week: 10,
    usage_daily: 20,
    chlorinator_floater_tier_a: 5,
    chlorinator_floater_tier_b: 10,
    chlorinator_floater_tier_c: 15,
    chlorinator_floater_tier_d: 20,
    chlorinator_liquid_only: 10,
    pets_occasional: 5,
    pets_frequent: 10
  },
  initialFees: {
    slightly_cloudy: 25,
    green_light_small: 60,
    green_light_medium: 100,
    green_light_large: 150,
    green_moderate_small: 100,
    green_moderate_medium: 150,
    green_moderate_large: 200,
    green_black_small: 250,
    green_black_medium: 350,
    green_black_large: 450
  },
  riskEngine: {
    points: {
      unscreened: 2,
      trees_overhead: 1,
      usage_daily: 2,
      usage_several_week: 1,
      chlorinator_floater_skimmer: 1,
      chlorinator_liquid_only: 2,
      pets_frequent: 1,
      pets_occasional: 0.5,
      condition_green: 2
    },
    size_multipliers: {
      tier_a: 1.0,
      tier_b: 1.1,
      tier_c: 1.2,
      tier_d: 1.3
    },
    escalation_brackets: DEFAULT_BRACKETS
  },
  frequencyLogic: {
    twice_weekly_multiplier: 1.8,
    auto_require_threshold: 9
  },
  autopayDiscount: 10
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const payload = await req.json();
    const { questionnaireData } = payload;

    // Fetch admin settings
    const settingsResult = await base44.asServiceRole.entities.AdminSettings.filter({
      settingKey: 'default'
    });
    
    let usingFallback = false;
    const settings = settingsResult[0];
    
    if (!settings) {
      console.warn('⚠️ AdminSettings not found - using DEFAULT_CONFIG fallback');
      usingFallback = true;
    }

    // Extract pricing configuration with fallback
    const baseTiers = settings?.baseTierPrices 
      ? JSON.parse(settings.baseTierPrices)
      : DEFAULT_CONFIG.baseTierPrices;
    const tokens = settings?.additiveTokens
      ? JSON.parse(settings.additiveTokens)
      : DEFAULT_CONFIG.additiveTokens;
    const initialFees = settings?.initialFees
      ? JSON.parse(settings.initialFees)
      : DEFAULT_CONFIG.initialFees;
    const riskEngine = settings?.riskEngine
      ? JSON.parse(settings.riskEngine)
      : DEFAULT_CONFIG.riskEngine;
    const frequencyLogic = settings?.frequencyLogic
      ? JSON.parse(settings.frequencyLogic)
      : DEFAULT_CONFIG.frequencyLogic;
    const autopayDiscount = settings?.autopayDiscount || DEFAULT_CONFIG.autopayDiscount;

    // ============================================
    // 1) DETERMINE SIZE TIER
    // ============================================
    let sizeTier = 'tier_a';
    let baseMonthly = baseTiers.tier_a_10_15k || 140;

    if (questionnaireData.poolSize === '10_15k' || questionnaireData.poolSize === 'not_sure') {
      sizeTier = 'tier_a';
      baseMonthly = baseTiers.tier_a_10_15k || 140;
    } else if (questionnaireData.poolSize === '15_20k') {
      sizeTier = 'tier_b';
      baseMonthly = baseTiers.tier_b_15_20k || 160;
    } else if (questionnaireData.poolSize === '20_30k') {
      sizeTier = 'tier_c';
      baseMonthly = baseTiers.tier_c_20_30k || 190;
    } else if (questionnaireData.poolSize === '30k_plus') {
      sizeTier = 'tier_d';
      baseMonthly = baseTiers.tier_d_30k_plus || 230;
    }

    // ============================================
    // 2) APPLY ADDITIVE TOKENS
    // ============================================
    let monthlyAdditiveSum = 0;
    let additiveTokensApplied = [];

    // 2.1 Environmental - Unscreened
    if (questionnaireData.enclosure === 'unscreened') {
      let unscreenedAmount = 0;
      if (sizeTier === 'tier_a') unscreenedAmount = tokens.unscreened_tier_a || 20;
      else if (sizeTier === 'tier_b') unscreenedAmount = tokens.unscreened_tier_b || 25;
      else if (sizeTier === 'tier_c') unscreenedAmount = tokens.unscreened_tier_c || 30;
      else if (sizeTier === 'tier_d') unscreenedAmount = tokens.unscreened_tier_d || 40;

      monthlyAdditiveSum += unscreenedAmount;
      additiveTokensApplied.push({ token_name: 'Not screened', amount: unscreenedAmount });
    }

    // Trees overhead (only if unscreened)
    if (questionnaireData.enclosure === 'unscreened' && questionnaireData.treesOverhead === 'yes') {
      const treesAmount = tokens.trees_overhead || 10;
      monthlyAdditiveSum += treesAmount;
      additiveTokensApplied.push({ token_name: 'Trees overhead', amount: treesAmount });
    }

    // 2.2 Usage
    if (questionnaireData.useFrequency === 'weekends') {
      const amount = tokens.usage_weekends || 10;
      monthlyAdditiveSum += amount;
      additiveTokensApplied.push({ token_name: 'Weekends usage', amount });
    } else if (questionnaireData.useFrequency === 'several_week') {
      const amount = tokens.usage_several_week || 10;
      monthlyAdditiveSum += amount;
      additiveTokensApplied.push({ token_name: 'Several times/week usage', amount });
    } else if (questionnaireData.useFrequency === 'daily') {
      const amount = tokens.usage_daily || 20;
      monthlyAdditiveSum += amount;
      additiveTokensApplied.push({ token_name: 'Daily usage', amount });
    }

    // 2.3 Sanitation / Chlorination
    const chlorMethod = questionnaireData.chlorinationMethod;
    const chlorType = questionnaireData.chlorinatorType;

    // Floater or skimmer upcharge (scales by tier)
    if (chlorMethod === 'tablets' && (chlorType === 'floating' || chlorType === 'skimmer')) {
      let amount = 0;
      if (sizeTier === 'tier_a') amount = tokens.chlorinator_floater_tier_a || 5;
      else if (sizeTier === 'tier_b') amount = tokens.chlorinator_floater_tier_b || 10;
      else if (sizeTier === 'tier_c') amount = tokens.chlorinator_floater_tier_c || 15;
      else if (sizeTier === 'tier_d') amount = tokens.chlorinator_floater_tier_d || 20;

      monthlyAdditiveSum += amount;
      additiveTokensApplied.push({ token_name: 'Floater/skimmer chlorinator', amount });
    }

    // Liquid only upcharge
    if (chlorMethod === 'liquid_chlorine') {
      const amount = tokens.chlorinator_liquid_only || 10;
      monthlyAdditiveSum += amount;
      additiveTokensApplied.push({ token_name: 'Liquid chlorine only', amount });
    }

    // 2.4 Pets
    if (questionnaireData.petsAccess) {
      if (questionnaireData.petSwimFrequency === 'occasionally') {
        const amount = tokens.pets_occasional || 5;
        monthlyAdditiveSum += amount;
        additiveTokensApplied.push({ token_name: 'Pets swim occasionally', amount });
      } else if (questionnaireData.petSwimFrequency === 'frequently') {
        const amount = tokens.pets_frequent || 10;
        monthlyAdditiveSum += amount;
        additiveTokensApplied.push({ token_name: 'Pets swim frequently', amount });
      }
    }

    // Subtotal after tokens
    let monthlyAfterTokens = baseMonthly + monthlyAdditiveSum;

    // ============================================
    // 3) ADMIN-ONLY RISK ENGINE (HIDDEN ESCALATION)
    // ============================================
    const riskPoints = riskEngine.points || DEFAULT_CONFIG.riskEngine.points;
    const sizeMultipliers = riskEngine.size_multipliers || DEFAULT_CONFIG.riskEngine.size_multipliers;
    
    // Use escalation_brackets with fallback to DEFAULT_BRACKETS
    let escalationBrackets = riskEngine.escalation_brackets;
    if (!escalationBrackets || escalationBrackets.length === 0) {
      console.warn('⚠️ escalation_brackets missing - using DEFAULT_BRACKETS fallback');
      escalationBrackets = DEFAULT_BRACKETS;
      usingFallback = true;
    }
    
    if (usingFallback) {
      console.warn('⚠️ PRICING RUNNING ON FALLBACK CONFIG - AdminSettings needs seeding');
    }

    let rawRisk = 0;

    if (questionnaireData.enclosure === 'unscreened') {
      rawRisk += riskPoints.unscreened || 2;
    }

    if (questionnaireData.enclosure === 'unscreened' && questionnaireData.treesOverhead === 'yes') {
      rawRisk += riskPoints.trees_overhead || 1;
    }

    if (questionnaireData.useFrequency === 'daily') {
      rawRisk += riskPoints.usage_daily || 2;
    } else if (questionnaireData.useFrequency === 'several_week') {
      rawRisk += riskPoints.usage_several_week || 1;
    }

    if (chlorMethod === 'tablets' && (chlorType === 'floating' || chlorType === 'skimmer')) {
      rawRisk += riskPoints.chlorinator_floater_skimmer || 1;
    }

    if (chlorMethod === 'liquid_chlorine') {
      rawRisk += riskPoints.chlorinator_liquid_only || 2;
    }

    if (questionnaireData.petsAccess) {
      if (questionnaireData.petSwimFrequency === 'frequently') {
        rawRisk += riskPoints.pets_frequent || 1;
      } else if (questionnaireData.petSwimFrequency === 'occasionally') {
        rawRisk += riskPoints.pets_occasional || 0.5;
      }
    }

    if (questionnaireData.poolCondition === 'green_algae') {
      rawRisk += riskPoints.condition_green || 2;
    }

    // Apply size multiplier
    let sizeMultiplier = 1.0;
    if (sizeTier === 'tier_a') sizeMultiplier = sizeMultipliers.tier_a || 1.0;
    else if (sizeTier === 'tier_b') sizeMultiplier = sizeMultipliers.tier_b || 1.1;
    else if (sizeTier === 'tier_c') sizeMultiplier = sizeMultipliers.tier_c || 1.2;
    else if (sizeTier === 'tier_d') sizeMultiplier = sizeMultipliers.tier_d || 1.3;

    const adjustedRisk = rawRisk * sizeMultiplier;

    // Find escalation bracket - ALWAYS applied (hidden from customer)
    let riskAddonAmount = 0;
    let riskBracket = null;
    
    if (escalationBrackets && escalationBrackets.length > 0) {
      // Sort brackets by min_risk to ensure correct matching
      const sortedBrackets = [...escalationBrackets].sort((a, b) => a.min_risk - b.min_risk);
      
      for (const bracket of sortedBrackets) {
        const matchesMin = adjustedRisk >= bracket.min_risk;
        const matchesMax = bracket.max_risk >= 999 ? true : adjustedRisk <= bracket.max_risk;
        
        if (matchesMin && matchesMax) {
          riskAddonAmount = bracket.addon_amount || 0;
          riskBracket = bracket.max_risk >= 999 ? `${bracket.min_risk}+` : `${bracket.min_risk}-${bracket.max_risk}`;
          break;
        }
      }
    }

    // Apply risk add-on (hidden from customer)
    monthlyAfterTokens += riskAddonAmount;
    if (riskAddonAmount > 0) {
      additiveTokensApplied.push({ token_name: 'Risk escalation buffer (internal)', amount: riskAddonAmount });
    }

    // ============================================
    // 4) FREQUENCY LOGIC & MULTIPLIER
    // ============================================
    const autoRequireThreshold = frequencyLogic.auto_require_threshold || 9;
    let frequencySelectedOrRequired = 'weekly';
    let frequencyMultiplier = 1.0;
    let frequencyAutoRequired = false;

    if (adjustedRisk >= autoRequireThreshold) {
      frequencySelectedOrRequired = 'twice_weekly';
      frequencyMultiplier = frequencyLogic.twice_weekly_multiplier || 1.8;
      frequencyAutoRequired = true;
    }

    // Apply frequency multiplier to monthly price
    let finalMonthlyPrice = monthlyAfterTokens * frequencyMultiplier;

    // Apply absolute floor
    const absoluteFloor = baseTiers.absolute_floor || 120;
    if (finalMonthlyPrice < absoluteFloor) {
      finalMonthlyPrice = absoluteFloor;
    }

    // Calculate per-visit price
    const visitsPerMonth = frequencySelectedOrRequired === 'weekly' ? 4.33 : 8.66;
    const perVisitPrice = finalMonthlyPrice / visitsPerMonth;

    // ============================================
    // 5) ONE-TIME FEES (WATER CONDITION)
    // ============================================
    let oneTimeFees = 0;
    let greenSizeGroup = null;

    // Slightly cloudy
    if (questionnaireData.poolCondition === 'slightly_cloudy') {
      oneTimeFees += initialFees.slightly_cloudy || 25;
    }

    // Green pool pricing
    if (questionnaireData.poolCondition === 'green_algae') {
      // Determine size group
      if (sizeTier === 'tier_a') greenSizeGroup = 'small';
      else if (sizeTier === 'tier_b' || sizeTier === 'tier_c') greenSizeGroup = 'medium';
      else greenSizeGroup = 'large';

      const severity = questionnaireData.greenPoolSeverity || 'moderate';
      let greenFeeKey = '';

      // Map severity to fee key - handle all possible values
      if (severity === 'light') {
        greenFeeKey = `green_light_${greenSizeGroup}`;
      } else if (severity === 'black_swamp') {
        greenFeeKey = `green_black_${greenSizeGroup}`;
      } else {
        // moderate or not_sure defaults to moderate
        greenFeeKey = `green_moderate_${greenSizeGroup}`;
      }

      const greenFee = initialFees[greenFeeKey];
      if (greenFee !== undefined) {
        oneTimeFees += greenFee;
      } else {
        console.warn(`Missing green fee for ${greenFeeKey}, using default based on size`);
        oneTimeFees += greenSizeGroup === 'small' ? 100 : (greenSizeGroup === 'medium' ? 150 : 200);
      }
    }

    // ============================================
    // 6) FINAL TOTALS
    // ============================================
    const estimatedFirstMonthTotal = finalMonthlyPrice + oneTimeFees;

    // ============================================
    // 7) RESPONSE (Customer sees only clean pricing)
    // ============================================
    return Response.json({
      success: true,
      quote: {
        // Customer-visible fields
        estimatedMonthlyPrice: parseFloat(finalMonthlyPrice.toFixed(2)),
        estimatedPerVisitPrice: parseFloat(perVisitPrice.toFixed(2)),
        estimatedOneTimeFees: parseFloat(oneTimeFees.toFixed(2)),
        estimatedFirstMonthTotal: parseFloat(estimatedFirstMonthTotal.toFixed(2)),
        frequencySelectedOrRequired,
        frequencyAutoRequired,
        greenSizeGroup,

        // Staff/Admin-visible fields (internal breakdown)
        sizeTier,
        baseMonthly: parseFloat(baseMonthly.toFixed(2)),
        additiveTokensApplied,
        rawRisk: parseFloat(rawRisk.toFixed(2)),
        adjustedRisk: parseFloat(adjustedRisk.toFixed(2)),
        riskBracket,
        riskAddonAmount: parseFloat(riskAddonAmount.toFixed(2)),
        frequencyMultiplier,
        oneTimeFees: parseFloat(oneTimeFees.toFixed(2)),
        finalMonthlyPrice: parseFloat(finalMonthlyPrice.toFixed(2)),
        quoteLogicVersionId: 'v2_tokens_risk_frequency',
        autopayDiscountAmount: autopayDiscount
      }
    });
  } catch (error) {
    console.error('calculateQuote error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});