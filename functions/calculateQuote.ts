import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const payload = await req.json();
    const { questionnaireData } = payload;

    // Fetch admin settings
    const settingsResult = await base44.asServiceRole.entities.AdminSettings.filter({
      settingKey: 'default'
    });
    const settings = settingsResult[0] || {};

    // Extract configuration with defaults
    const baseWeeklyPrices = settings.baseWeeklyPrices || {};
    const modifiers = settings.modifiers || {};
    const oneTimeFees = settings.oneTimeFees || {};
    const riskWeights = settings.riskWeights || {};
    const biweeklyMultiplier = settings.biweeklyMultiplier || 0.75;
    const baselineChemicalCOGS = settings.baselineChemicalCOGS || {};
    const cogsMultipliers = settings.cogsMultipliers || {};
    const cogsSurcharges = settings.cogsSurcharges || {};
    const greenPoolTiers = settings.greenPoolRecoveryTiers || {};
    const frequencyThresholds = settings.frequencyThresholds || {};
    const profitMargin = settings.profitMargin || {};
    const chemicalCosts = settings.chemicalCosts || {};
    const seasonality = settings.seasonality || {};

    // ============================================
    // SEASONALITY DETECTION
    // ============================================
    const currentDate = new Date();
    const currentMonth = currentDate.getMonth() + 1; // 1-12

    const peakStart = seasonality.peakSeasonStartMonth || 3;
    const peakEnd = seasonality.peakSeasonEndMonth || 10;
    const rainyStart = seasonality.rainySeasonStartMonth || 6;
    const rainyEnd = seasonality.rainySeasonEndMonth || 9;
    const pollenStart = seasonality.pollenSeasonStartMonth || 2;
    const pollenEnd = seasonality.pollenSeasonEndMonth || 5;

    // Determine season (peak or shoulder)
    const isPeakSeason = (currentMonth >= peakStart && currentMonth <= peakEnd);
    const seasonName = isPeakSeason ? 'peak' : 'shoulder';
    const seasonalChemMultiplier = isPeakSeason 
      ? (seasonality.peakSeasonChemicalMultiplier || 1.15)
      : (seasonality.shoulderSeasonChemicalMultiplier || 0.95);

    // Sub-season flags
    const isRainySeason = (seasonality.enableRainySeasonLogic !== false) && (currentMonth >= rainyStart && currentMonth <= rainyEnd);
    const isPollenSeason = (seasonality.enablePollenSeasonLogic !== false) && (currentMonth >= pollenStart && currentMonth <= pollenEnd);

    // ============================================
    // A) CALCULATE CHEMICAL COST ESTIMATOR (COGS)
    // ============================================
    let baseCOGS = baselineChemicalCOGS[questionnaireData.poolSize] || 50;
    let cogsBreakdown = [{ category: 'Baseline COGS', amount: baseCOGS }];

    // Enclosure COGS multiplier
    let enclosureCogsMultiplier = 1.0;
    if (questionnaireData.enclosure === 'unscreened') {
      enclosureCogsMultiplier = cogsMultipliers.enclosure_unscreened || 1.20;
    } else if (questionnaireData.enclosure === 'partially_screened') {
      enclosureCogsMultiplier = cogsMultipliers.enclosure_partially_screened || 1.10;
    } else {
      enclosureCogsMultiplier = cogsMultipliers.enclosure_screened || 1.00;
    }

    // Usage frequency COGS multiplier
    let usageCogsMultiplier = 1.0;
    if (questionnaireData.useFrequency === 'daily') {
      usageCogsMultiplier = cogsMultipliers.usage_daily || 1.15;
    } else if (questionnaireData.useFrequency === 'several_week') {
      usageCogsMultiplier = cogsMultipliers.usage_several_week || 1.08;
    } else if (questionnaireData.useFrequency === 'weekends') {
      usageCogsMultiplier = cogsMultipliers.usage_weekends || 1.04;
    }

    // Pets COGS multiplier
    let petsCogsMultiplier = 1.0;
    if (questionnaireData.petsAccess) {
      if (questionnaireData.petSwimFrequency === 'frequently') {
        petsCogsMultiplier = cogsMultipliers.pets_frequent || 1.15;
      } else if (questionnaireData.petSwimFrequency === 'occasionally') {
        petsCogsMultiplier = cogsMultipliers.pets_occasional || 1.08;
      }
    }

    // Environmental COGS adders (capped)
    let envCogsAdder = 0;
    if (questionnaireData.environmentalFactors?.includes('trees_overhead')) {
      envCogsAdder += cogsMultipliers.environment_trees_add || 0.05;
    }
    if (questionnaireData.environmentalFactors?.includes('heavy_debris')) {
      envCogsAdder += cogsMultipliers.environment_heavy_debris_add || 0.08;
    }
    if (questionnaireData.environmentalFactors?.includes('frequent_pollen')) {
      envCogsAdder += cogsMultipliers.environment_pollen_add || 0.03;
    }
    const envCapCogs = cogsMultipliers.environment_cap || 0.15;
    envCogsAdder = Math.min(envCogsAdder, envCapCogs);

    // Chlorination method adjustment
    let chlorinationCogsAdjustment = 1.0;
    let saltCellWearReserve = 0;
    if (questionnaireData.chlorinationMethod === 'saltwater') {
      chlorinationCogsAdjustment = cogsMultipliers.saltwater_chlorine_reduction || 0.92;
      saltCellWearReserve = cogsMultipliers.salt_cell_wear_reserve || 8.00;
    }

    // Condition surcharges
    let conditionSurcharge = 0;
    if (questionnaireData.poolCondition === 'slightly_cloudy') {
      conditionSurcharge = cogsSurcharges.slightly_cloudy || 15;
    } else if (questionnaireData.poolCondition === 'not_sure') {
      conditionSurcharge = cogsSurcharges.not_sure_inspection || 20;
    }

    // Apply seasonal multiplier to COGS (internal only, not base price)
    let rainySeasonChemAdder = 0;
    if (isRainySeason) {
      rainySeasonChemAdder = seasonality.rainySeasonChemicalAdder || 0.05;
    }

    let pollenSeasonChemAdder = 0;
    if (isPollenSeason && questionnaireData.environmentalFactors?.includes('frequent_pollen')) {
      pollenSeasonChemAdder = seasonality.pollenSeasonChemicalAdder || 0.04;
    }

    const totalSeasonalChemMultiplier = seasonalChemMultiplier * (1 + rainySeasonChemAdder + pollenSeasonChemAdder);

    // Calculate total estimated monthly COGS
    const estimatedMonthlyChemicalCOGS = 
      (baseCOGS * enclosureCogsMultiplier * usageCogsMultiplier * petsCogsMultiplier * (1 + envCogsAdder) * chlorinationCogsAdjustment * totalSeasonalChemMultiplier) 
      + conditionSurcharge 
      + saltCellWearReserve;

    cogsBreakdown.push(
      { category: 'Enclosure adjustment', amount: Math.round((baseCOGS * (enclosureCogsMultiplier - 1)) * 100) / 100 },
      { category: 'Usage adjustment', amount: Math.round((baseCOGS * (usageCogsMultiplier - 1)) * 100) / 100 },
      { category: 'Pets adjustment', amount: Math.round((baseCOGS * (petsCogsMultiplier - 1)) * 100) / 100 },
      { category: 'Environment adjustment', amount: Math.round((baseCOGS * envCogsAdder) * 100) / 100 },
      { category: 'Chlorination adjustment', amount: Math.round((baseCOGS * (chlorinationCogsAdjustment - 1)) * 100) / 100 },
      { category: 'Condition surcharge', amount: conditionSurcharge },
      { category: 'Salt cell wear reserve', amount: saltCellWearReserve },
      { category: `Seasonal multiplier (${seasonName}${isRainySeason ? ' + rainy' : ''}${isPollenSeason ? ' + pollen' : ''})`, amount: Math.round((baseCOGS * (totalSeasonalChemMultiplier - 1)) * 100) / 100 }
    );

    // Chemistry demand index (0-100 scale)
    let chemDemandIndex = 30; // baseline
    if (enclosureCogsMultiplier > 1.1) chemDemandIndex += 20;
    if (usageCogsMultiplier > 1.08) chemDemandIndex += 15;
    if (petsCogsMultiplier > 1.08) chemDemandIndex += 15;
    if (envCogsAdder > 0.08) chemDemandIndex += 10;
    if (questionnaireData.poolCondition === 'green_algae') chemDemandIndex = 90;
    // Seasonal demand boosts
    if (isPeakSeason) chemDemandIndex += Math.round((seasonalChemMultiplier - 1) * 10);
    if (isRainySeason) chemDemandIndex += 3;
    if (isPollenSeason && questionnaireData.environmentalFactors?.includes('frequent_pollen')) chemDemandIndex += 2;
    chemDemandIndex = Math.min(100, chemDemandIndex);

    // ============================================
    // CALCULATE BASE PRICE (pricing engine from before)
    // ============================================
    let baseWeekly = baseWeeklyPrices[questionnaireData.poolSize] || 140;
    let uncertaintyFee = 0;

    if (questionnaireData.poolSize === 'not_sure') {
      uncertaintyFee = baseWeeklyPrices.not_sure_fee || 10;
    }

    // Calculate monthly modifiers
    let monthlyModifierSum = 0;
    let influencingFactors = [];

    if (questionnaireData.enclosure === 'unscreened') {
      monthlyModifierSum += modifiers.enclosure_unscreened || 20;
      influencingFactors.push('Unscreened pool');
    } else if (questionnaireData.enclosure === 'partially_screened') {
      monthlyModifierSum += modifiers.enclosure_partially_screened || 10;
      influencingFactors.push('Partially screened');
    }

    let envModifiers = 0;
    if (questionnaireData.environmentalFactors?.includes('trees_overhead')) {
      envModifiers += modifiers.environment_trees || 10;
      influencingFactors.push('Trees overhead');
    }
    if (questionnaireData.environmentalFactors?.includes('heavy_debris')) {
      envModifiers += modifiers.environment_heavy_debris || 15;
      influencingFactors.push('Heavy debris');
    }
    if (questionnaireData.environmentalFactors?.includes('frequent_pollen')) {
      envModifiers += modifiers.environment_pollen || 5;
      influencingFactors.push('Frequent pollen');
    }
    if (questionnaireData.environmentalFactors?.includes('waterfront')) {
      envModifiers += modifiers.environment_waterfront || 5;
      influencingFactors.push('Waterfront property');
    }
    if (questionnaireData.environmentalFactors?.includes('construction_nearby')) {
      envModifiers += modifiers.environment_construction || 5;
      influencingFactors.push('Construction nearby');
    }

    const envCap = modifiers.environment_cap || 30;
    envModifiers = Math.min(envModifiers, envCap);
    monthlyModifierSum += envModifiers;

    if (questionnaireData.filterType === 'cartridge') {
      monthlyModifierSum += modifiers.filter_cartridge || 10;
      influencingFactors.push('Cartridge filter');
    } else if (questionnaireData.filterType === 'de') {
      monthlyModifierSum += modifiers.filter_de || 15;
      influencingFactors.push('DE filter');
    }

    if (questionnaireData.useFrequency === 'daily') {
      monthlyModifierSum += modifiers.usage_daily || 15;
      influencingFactors.push('Daily usage');
    } else if (questionnaireData.useFrequency === 'several_week') {
      monthlyModifierSum += modifiers.usage_several_week || 8;
      influencingFactors.push('Several times per week');
    }

    if (questionnaireData.petsAccess && questionnaireData.petSwimFrequency === 'frequently') {
      monthlyModifierSum += modifiers.pets_frequent || 15;
      influencingFactors.push('Pets swim frequently');
    } else if (questionnaireData.petsAccess && questionnaireData.petSwimFrequency === 'occasionally') {
      monthlyModifierSum += modifiers.pets_occasional || 8;
      influencingFactors.push('Pets swim occasionally');
    }

    if (questionnaireData.accessType === 'hoa_community') {
      monthlyModifierSum += modifiers.access_hoa || 5;
      influencingFactors.push('HOA/community access');
    } else if (questionnaireData.accessType === 'locked_gate') {
      monthlyModifierSum += modifiers.access_locked_gate || 5;
      influencingFactors.push('Locked gate access');
    } else if (questionnaireData.accessType === 'code_required') {
      monthlyModifierSum += modifiers.access_code || 3;
      influencingFactors.push('Code-required access');
    }

    let estimatedMonthlyPrice = baseWeekly + monthlyModifierSum + uncertaintyFee;
    let perVisitPrice = estimatedMonthlyPrice / 4.33;

    // ============================================
    // B) GREEN POOL RECOVERY TIER PRICING
    // ============================================
    let greenRecoveryTier = 'none';
    let greenRecoveryExpectedVisits = '';
    let greenRecoveryStartupFee = 0;
    let greenRecoveryMonthlySurcharge = 0;

    if (questionnaireData.poolCondition === 'green_algae') {
      // Determine tier based on greenness level
      let tierData;
      if (questionnaireData.greenPoolGreenness === 'light_green') {
        greenRecoveryTier = 'tier1_light';
        tierData = greenPoolTiers.tier1_light || {};
      } else if (questionnaireData.greenPoolGreenness === 'medium_green') {
        greenRecoveryTier = 'tier2_medium';
        tierData = greenPoolTiers.tier2_medium || {};
      } else if (questionnaireData.greenPoolGreenness === 'dark_green') {
        greenRecoveryTier = 'tier3_dark';
        tierData = greenPoolTiers.tier3_dark || {};
      } else {
        // default to tier 2 for unknown
        greenRecoveryTier = 'tier2_medium';
        tierData = greenPoolTiers.tier2_medium || {};
      }

      greenRecoveryStartupFee = tierData.startup_fee || 250;
      greenRecoveryMonthlySurcharge = tierData.monthly_surcharge || 50;
      greenRecoveryExpectedVisits = tierData.expected_visits || '2-3';
      influencingFactors.push(`Green pool recovery (${greenRecoveryTier.replace('tier', 'Tier ')})`);
    }

    // ============================================
    // D) MAINTENANCE FREQUENCY RECOMMENDATIONS
    // ============================================
    let recommendedFrequency = 'weekly';
    
    // Season-adjusted thresholds
    let weeklyRiskThreshold, weeklyChemThreshold;
    if (isPeakSeason) {
      weeklyRiskThreshold = seasonality.peakSeasonWeeklyThreshold || 55;
      weeklyChemThreshold = 55;
    } else {
      weeklyRiskThreshold = seasonality.shoulderSeasonWeeklyThreshold || 65;
      weeklyChemThreshold = 65;
    }

    // Risk score calculation (done later, but we'll use ChemDemandIndex here)
    if (chemDemandIndex < weeklyChemThreshold && questionnaireData.enclosure !== 'unscreened' && !questionnaireData.environmentalFactors?.includes('heavy_debris')) {
      recommendedFrequency = 'biweekly';
    }

    // ============================================
    // C) CALCULATE RISK SCORE
    // ============================================
    let riskScore = 0;

    if (questionnaireData.enclosure === 'unscreened') {
      riskScore += riskWeights.enclosure_unscreened || 15;
    } else if (questionnaireData.enclosure === 'partially_screened') {
      riskScore += riskWeights.enclosure_partially_screened || 5;
    }

    if (questionnaireData.environmentalFactors?.includes('trees_overhead')) {
      riskScore += riskWeights.environment_trees || 10;
    }
    if (questionnaireData.environmentalFactors?.includes('heavy_debris')) {
      riskScore += riskWeights.environment_heavy_debris || 12;
    }
    if (questionnaireData.environmentalFactors?.includes('frequent_pollen')) {
      riskScore += riskWeights.environment_pollen || 8;
    }
    if (questionnaireData.environmentalFactors?.includes('waterfront')) {
      riskScore += riskWeights.environment_waterfront || 6;
    }

    if (questionnaireData.useFrequency === 'daily') {
      riskScore += riskWeights.usage_daily || 10;
    } else if (questionnaireData.useFrequency === 'several_week') {
      riskScore += riskWeights.usage_several_week || 5;
    }

    if (questionnaireData.petsAccess && questionnaireData.petSwimFrequency === 'frequently') {
      riskScore += riskWeights.pets_frequent || 12;
    } else if (questionnaireData.petsAccess && questionnaireData.petSwimFrequency === 'occasionally') {
      riskScore += riskWeights.pets_occasional || 6;
    }

    if (questionnaireData.poolCondition === 'green_algae') {
      riskScore += riskWeights.condition_green_pool || 25;
    } else if (questionnaireData.poolCondition === 'slightly_cloudy') {
      riskScore += riskWeights.condition_slightly_cloudy || 8;
    }

    if (questionnaireData.filterType === 'cartridge') {
      riskScore += riskWeights.filter_cartridge || 6;
    } else if (questionnaireData.filterType === 'de') {
      riskScore += riskWeights.filter_de || 8;
    }

    if (questionnaireData.knownIssues?.includes('equipment_concerns')) {
      riskScore += riskWeights.issue_equipment_concerns || 10;
    }
    if (questionnaireData.knownIssues?.includes('leaks')) {
      riskScore += riskWeights.issue_leaks || 15;
    }
    if (questionnaireData.knownIssues?.includes('algae_problems')) {
      riskScore += riskWeights.issue_algae || 12;
    }

    riskScore = Math.min(100, Math.max(0, riskScore));
    const riskLevel = riskScore < 40 ? 'low' : riskScore < 70 ? 'medium' : 'high';

    // Adjust recommendation based on risk
    if (riskScore >= weeklyRiskThreshold || chemDemandIndex >= weeklyChemThreshold) {
      recommendedFrequency = 'weekly';
    }

    // ============================================
    // ONE-TIME FEES & FIRST MONTH
    // ============================================
    let estimatedOneTimeFees = 0;

    if (questionnaireData.poolCondition === 'slightly_cloudy') {
      estimatedOneTimeFees += oneTimeFees.condition_slightly_cloudy || 25;
    } else if (questionnaireData.poolCondition === 'not_sure') {
      estimatedOneTimeFees += oneTimeFees.condition_not_sure_inspection || 25;
    }

    if (questionnaireData.knownIssues?.includes('equipment_concerns')) {
      estimatedOneTimeFees += oneTimeFees.issue_equipment_concerns || 35;
    }
    if (questionnaireData.knownIssues?.includes('leaks')) {
      estimatedOneTimeFees += oneTimeFees.issue_leaks || 50;
    }
    if (questionnaireData.knownIssues?.includes('staining')) {
      estimatedOneTimeFees += oneTimeFees.issue_staining || 25;
    }

    // Add green pool recovery startup
    estimatedOneTimeFees += greenRecoveryStartupFee;

    let estimatedFirstMonthTotal = estimatedMonthlyPrice + estimatedOneTimeFees + greenRecoveryMonthlySurcharge;

    // ============================================
    // E) PROFIT MARGIN PROTECTION
    // ============================================
    const targetMargin = profitMargin.target_margin_percent || 0.55;
    const minimumMargin = profitMargin.minimum_margin_percent || 0.45;
    const laborCostPerHour = profitMargin.labor_cost_per_hour || 50;
    const laborMinutesPerVisit = profitMargin.labor_minutes_per_visit || {};

    // Determine how many visits per month
    const visitsPerMonth = recommendedFrequency === 'weekly' ? 4.33 : 2.16;

    // Labor cost
    const minutesPerVisit = laborMinutesPerVisit[questionnaireData.poolSize] || 35;
    const laborCostPerVisit = (minutesPerVisit / 60) * laborCostPerHour;
    const monthlyLaborCost = laborCostPerVisit * visitsPerMonth;

    // Total cost
    const totalMonthlyCost = monthlyLaborCost + estimatedMonthlyChemicalCOGS;

    // Calculate actual margin
    let actualMargin = (estimatedMonthlyPrice - totalMonthlyCost) / estimatedMonthlyPrice;
    let marginAdjustmentApplied = 0;
    let marginAdjustmentReason = '';

    if (actualMargin < minimumMargin) {
      // Need to increase price to hit minimum margin
      // Target: (Price - Cost) / Price = minimumMargin
      // => Price = Cost / (1 - minimumMargin)
      const requiredPrice = totalMonthlyCost / (1 - minimumMargin);
      marginAdjustmentApplied = Math.ceil((requiredPrice - estimatedMonthlyPrice) * 100) / 100;
      estimatedMonthlyPrice += marginAdjustmentApplied;
      perVisitPrice = estimatedMonthlyPrice / 4.33;
      marginAdjustmentReason = 'High-maintenance conditions adjustment (heavy chemical demand or labor requirements)';
      actualMargin = minimumMargin;
    } else if (actualMargin < targetMargin && riskScore > 50) {
      // Suggest weekly or add-ons, but don't force increase yet
      // (handled in upsells)
    }

    // Update first month if there's adjustment
    estimatedFirstMonthTotal = estimatedMonthlyPrice + estimatedOneTimeFees + greenRecoveryMonthlySurcharge;

    // ============================================
    // CREATE QUOTE BREAKDOWN
    // ============================================
    let quoteBreakdown = [
      { lineItem: 'Base weekly price', amount: baseWeekly, isAdjustment: false },
      { lineItem: 'Modifiers (enclosure, environment, filter, usage, etc)', amount: monthlyModifierSum, isAdjustment: false }
    ];

    if (uncertaintyFee > 0) {
      quoteBreakdown.push({ lineItem: 'Pool size uncertainty fee', amount: uncertaintyFee, isAdjustment: false });
    }

    if (greenRecoveryMonthlySurcharge > 0) {
      quoteBreakdown.push({ lineItem: 'Green pool recovery monthly surcharge (first month)', amount: greenRecoveryMonthlySurcharge, isAdjustment: false });
    }

    if (marginAdjustmentApplied > 0) {
      quoteBreakdown.push({ lineItem: marginAdjustmentReason, amount: marginAdjustmentApplied, isAdjustment: true });
    }

    // ============================================
    // C) DYNAMIC UPSELL TRIGGERS
    // ============================================
    let upsellSuggestions = [];

    // Upsell 1: Weekly upgrade if recommended but not selected
    if (recommendedFrequency === 'weekly' && questionnaireData.clientSelectedFrequency !== 'weekly') {
      upsellSuggestions.push({
        id: 'weekly_upgrade',
        title: 'Upgrade to Weekly Service',
        reason: 'Your pool has higher maintenance needs that weekly visits will address more reliably.',
        price: (settings.upsellPrices?.weekly_upgrade || 25),
        accepted: false
      });
    }

    // Upsell 2: Debris management
    if (questionnaireData.environmentalFactors?.includes('trees_overhead') || 
        questionnaireData.environmentalFactors?.includes('heavy_debris')) {
      upsellSuggestions.push({
        id: 'debris_management',
        title: 'Debris Management System',
        reason: 'Skimmer socks and leaf canisters can reduce maintenance burden and chemical costs.',
        price: (settings.upsellPrices?.debris_management_addon || 35),
        accepted: false
      });
    }

    // Upsell 3: Filter deep clean
    if ((questionnaireData.filterType === 'cartridge' || questionnaireData.filterType === 'de') &&
        (questionnaireData.environmentalFactors?.includes('heavy_debris') || greenRecoveryTier !== 'none')) {
      upsellSuggestions.push({
        id: 'filter_deep_clean',
        title: 'Filter Deep Clean Add-On',
        reason: 'Heavy debris or recovery conditions will stress your filter; professional cleaning extends its life.',
        price: (settings.upsellPrices?.filter_deep_clean || 75),
        accepted: false
      });
    }

    // Limit to 3 upsells
    upsellSuggestions = upsellSuggestions.slice(0, 3);

    // ============================================
    // GENERATE TECHNICIAN NOTES
    // ============================================
    const equipmentList = (questionnaireData.equipment || []).join(', ') || 'Standard';
    const technicianNotes = `PROPERTY SUMMARY
Pool Size: ${questionnaireData.poolSize.replace(/_/g, '-')} gallons (est)
Type: ${questionnaireData.poolType.replace(/_/g, ' ')} | Enclosure: ${questionnaireData.enclosure.replace(/_/g, ' ')}
Filter: ${questionnaireData.filterType} | Sanitizer: ${questionnaireData.chlorinationMethod.replace(/_/g, ' ')}${questionnaireData.chlorinatorType ? ` (${questionnaireData.chlorinatorType.replace(/_/g, ' ')})` : ''}
Usage: ${questionnaireData.useFrequency.replace(/_/g, ' ')} | Pets: ${questionnaireData.petsAccess ? `Yes (${questionnaireData.petSwimFrequency})` : 'No'}
Condition: ${questionnaireData.poolCondition.replace(/_/g, ' ')}${greenRecoveryTier !== 'none' ? ` - ${greenRecoveryTier.replace(/_/g, ' ')} recovery (expect ${greenRecoveryExpectedVisits} visits)` : ''}
Features: ${equipmentList}
Access: ${questionnaireData.accessType.replace(/_/g, ' ')}${questionnaireData.accessNotes ? ` - ${questionnaireData.accessNotes}` : ''}

ANALYSIS
Risk Score: ${riskScore} (${riskLevel})
Chemistry Demand: ${chemDemandIndex} (scale 0-100)
Est. Monthly Chemical COGS: $${estimatedMonthlyChemicalCOGS.toFixed(2)}
Est. Monthly Labor: $${monthlyLaborCost.toFixed(2)}
Gross Margin: ${Math.round(actualMargin * 100)}%

QUOTE
Recommended Frequency: ${recommendedFrequency} service
Monthly Quote: $${estimatedMonthlyPrice.toFixed(2)}
Per-Visit: $${perVisitPrice.toFixed(2)}
One-Time Fees: $${estimatedOneTimeFees.toFixed(2)}
First Month Est: $${estimatedFirstMonthTotal.toFixed(2)}`;

    return Response.json({
      success: true,
      quote: {
        estimatedMonthlyPrice: parseFloat(estimatedMonthlyPrice.toFixed(2)),
        estimatedPerVisitPrice: parseFloat(perVisitPrice.toFixed(2)),
        estimatedOneTimeFees: parseFloat(estimatedOneTimeFees.toFixed(2)),
        estimatedFirstMonthTotal: parseFloat(estimatedFirstMonthTotal.toFixed(2)),
        estimatedMonthlyChemicalCOGS: parseFloat(estimatedMonthlyChemicalCOGS.toFixed(2)),
        chemDemandIndex: Math.round(chemDemandIndex),
        cogsBreakdown,
        riskScore: Math.round(riskScore),
        riskLevel,
        priceInfluencers: influencingFactors,
        quoteBreakdown,
        marginAdjustmentApplied: parseFloat(marginAdjustmentApplied.toFixed(2)),
        marginAdjustmentReason,
        estimatedGrossMarginPercent: parseFloat((actualMargin * 100).toFixed(2)),
        recommendedFrequency,
        greenRecoveryTier,
        greenRecoveryExpectedVisits,
        upsellSuggestions,
        technicianNotes
      }
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});