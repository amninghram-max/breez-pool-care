import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const payload = await req.json();
    const { propertyId } = payload;

    // Fetch property and admin settings
    const property = await base44.entities.Property.get(propertyId);
    const settings = await base44.asServiceRole.entities.AdminSettings.filter({
      settingKey: 'default'
    });
    const adminConfig = settings[0] || {};

    // Calculate base chemical COGS
    let chemicalCOGS = 0;
    const poolSizeMultiplier = {
      small: 0.8,
      medium: 1.0,
      large: 1.4,
      oversized: 1.8
    }[property.poolSize] || 1.0;

    chemicalCOGS = (adminConfig.baseMonthlyPrice || 200) * 0.35 * poolSizeMultiplier;

    // Calculate seasonal multiplier
    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    let seasonalMultiplier = 1.0;
    let appliedSeasons = [];

    // Peak season (March-October)
    if (currentMonth >= 3 && currentMonth <= 10) {
      seasonalMultiplier *= (adminConfig.peakSeasonMultiplier || 1.18);
      appliedSeasons.push('peak');
    } else {
      seasonalMultiplier *= (adminConfig.winterSeasonMultiplier || 0.95);
      appliedSeasons.push('winter');
    }

    // Rainy season (June-September)
    if (currentMonth >= 6 && currentMonth <= 9) {
      seasonalMultiplier += (adminConfig.rainySeasonMultiplier || 0.05);
      appliedSeasons.push('rainy');
    }

    // Pollen season (Feb-May)
    if (currentMonth >= 2 && currentMonth <= 5 && property.pollenExposure) {
      seasonalMultiplier += (adminConfig.pollenSeasonMultiplier || 0.04);
      appliedSeasons.push('pollen');
    }

    // UV exposure multiplier (unscreened)
    if (!property.isScreened) {
      seasonalMultiplier += (adminConfig.unscreenedPoolMultiplier || 0.06);
      appliedSeasons.push('uv');
    }

    // Apply seasonal multiplier to COGS
    chemicalCOGS *= seasonalMultiplier;

    // Calculate risk score
    let riskScore = adminConfig.baselineRiskScore || 40;

    // Seasonal risk adjustments
    if (currentMonth >= 3 && currentMonth <= 10) {
      riskScore += 5; // Peak season slightly elevated
    }

    if (currentMonth >= 6 && currentMonth <= 9) {
      riskScore += (adminConfig.rainySeasonRiskBoost || 6);
    }

    if (currentMonth >= 2 && currentMonth <= 5 && property.pollenExposure) {
      riskScore += (adminConfig.pollenSeasonRiskBoost || 3);
    }

    // Pool-specific risk factors
    if (!property.isScreened) {
      riskScore += (adminConfig.unscreenedPoolRiskBoost || 5);
    }

    if (property.debrisLevel === 'high') {
      riskScore += 8;
    } else if (property.debrisLevel === 'moderate') {
      riskScore += 4;
    }

    if (property.dogsSwim) {
      riskScore += 6;
    }

    if (property.dailyUsage === 'heavy' || property.dailyUsage === 'daily') {
      riskScore += 8;
    } else if (property.dailyUsage === 'moderate') {
      riskScore += 4;
    }

    if (property.algaeHistory) {
      riskScore += 10;
    }

    // Summer algae risk boost (May-Sept)
    if (currentMonth >= 5 && currentMonth <= 9) {
      riskScore += (adminConfig.summerAlgaeBaselineBoost || 6);
    }

    // Cap risk score at 100
    riskScore = Math.min(riskScore, 100);

    // Calculate chemical demand index (related to risk)
    const chemDemandIndex = Math.min(riskScore + 10, 100);

    // Determine recommended frequency based on seasonal thresholds
    const peakThreshold = adminConfig.peakSeasonWeeklyThreshold || 55;
    const winterThreshold = adminConfig.winterSeasonWeeklyThreshold || 65;
    const threshold = (currentMonth >= 3 && currentMonth <= 10) ? peakThreshold : winterThreshold;

    const recommendedFrequency = (riskScore >= threshold || chemDemandIndex >= threshold)
      ? 'weekly'
      : 'biweekly';

    // Calculate monthly base price
    const basePrice = adminConfig.baseMonthlyPrice || 299;

    // Per-visit price (for weekly: basePrice/4.3, for biweekly: basePrice/2.15)
    const perVisitPrice = recommendedFrequency === 'weekly' 
      ? basePrice / 4.3 
      : basePrice / 2.15;

    // Calculate gross margin
    const costOfGoods = chemicalCOGS;
    const grossMargin = (basePrice - costOfGoods) / basePrice;

    // Margin protection logic
    let marginAdjustmentApplied = 0;
    let marginAdjustmentReason = '';
    let adjustedPrice = basePrice;

    const targetMargin = adminConfig.targetGrossMargin || 0.55;

    if (grossMargin < targetMargin) {
      const requiredPrice = costOfGoods / (1 - targetMargin);
      marginAdjustmentApplied = requiredPrice - basePrice;
      adjustedPrice = requiredPrice;
      marginAdjustmentReason = 'Service condition adjustment (High-maintenance conditions)';
    }

    // Dynamic upsells based on property conditions
    const upsells = [];

    // Green pool recovery
    if (property.algaeHistory || property.debrisLevel === 'high') {
      upsells.push({
        name: 'Green Pool Recovery Program',
        price: recommendedFrequency === 'weekly' ? 40 : 60,
        accepted: false
      });
    }

    // Debris/skimming
    if (property.debrisLevel === 'high' && (currentMonth >= 6 && currentMonth <= 9)) {
      upsells.push({
        name: 'Extra Debris & Skimming Service',
        price: 25,
        accepted: false
      });
    }

    // Filter maintenance
    if (property.filterType && (currentMonth >= 2 && currentMonth <= 5 || currentMonth >= 6 && currentMonth <= 9)) {
      upsells.push({
        name: 'Filter Rinse & Inspection',
        price: 35,
        accepted: false
      });
    }

    // Preventive algaecide (summer)
    if (currentMonth >= 5 && currentMonth <= 9 && riskScore >= 50) {
      upsells.push({
        name: 'Preventive Algaecide Program',
        price: 30,
        accepted: false
      });
    }

    // Create quote record
    const quote = await base44.entities.Quote.create({
      propertyId,
      clientEmail: user.email,
      status: 'draft',
      monthlyBasePrice: adjustedPrice,
      perVisitPrice,
      recommendedFrequency,
      estimatedChemicalCOGS: chemicalCOGS,
      riskScore: Math.round(riskScore),
      chemDemandIndex: Math.round(chemDemandIndex),
      seasonalMultiplier: Math.round(seasonalMultiplier * 100) / 100,
      marginAdjustmentApplied: Math.round(marginAdjustmentApplied * 100) / 100,
      marginAdjustmentReason,
      upsellSuggestions: upsells,
      grossMarginPercent: Math.round(((adjustedPrice - costOfGoods) / adjustedPrice) * 100)
    });

    return Response.json({
      success: true,
      quote: quote,
      calculationDetails: {
        seasonalFactors: appliedSeasons,
        baseChemicalCOGS: Math.round(chemicalCOGS * 100) / 100,
        poolSizeMultiplier
      }
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});