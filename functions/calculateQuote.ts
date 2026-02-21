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

    // Extract values with defaults
    const baseWeeklyPrices = settings.baseWeeklyPrices || {
      under_10k: 125,
      10_15k: 140,
      15_20k: 160,
      20_30k: 190,
      30k_plus: 230,
      not_sure_fee: 10
    };

    const modifiers = settings.modifiers || {};
    const oneTimeFees = settings.oneTimeFees || {};
    const riskWeights = settings.riskWeights || {};
    const biweeklyMultiplier = settings.biweeklyMultiplier || 0.75;

    // CALCULATE BASE WEEKLY PRICE
    let baseWeekly = baseWeeklyPrices[questionnaireData.poolSize] || baseWeeklyPrices['10_15k'];
    let uncertaintyFee = 0;

    if (questionnaireData.poolSize === 'not_sure') {
      uncertaintyFee = baseWeeklyPrices.not_sure_fee || 10;
    }

    // CALCULATE MONTHLY MODIFIERS
    let monthlyModifierSum = 0;
    let influencingFactors = [];

    // Enclosure
    if (questionnaireData.enclosure === 'unscreened') {
      monthlyModifierSum += modifiers.enclosure_unscreened || 20;
      influencingFactors.push('Unscreened pool');
    } else if (questionnaireData.enclosure === 'partially_screened') {
      monthlyModifierSum += modifiers.enclosure_partially_screened || 10;
      influencingFactors.push('Partially screened');
    }

    // Environmental factors (capped)
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

    // Filter type
    if (questionnaireData.filterType === 'cartridge') {
      monthlyModifierSum += modifiers.filter_cartridge || 10;
      influencingFactors.push('Cartridge filter');
    } else if (questionnaireData.filterType === 'de') {
      monthlyModifierSum += modifiers.filter_de || 15;
      influencingFactors.push('DE filter');
    }

    // Usage frequency
    if (questionnaireData.useFrequency === 'daily') {
      monthlyModifierSum += modifiers.usage_daily || 15;
      influencingFactors.push('Daily usage');
    } else if (questionnaireData.useFrequency === 'several_week') {
      monthlyModifierSum += modifiers.usage_several_week || 8;
      influencingFactors.push('Several times per week');
    }

    // Pets
    if (questionnaireData.petsAccess && questionnaireData.petSwimFrequency === 'frequently') {
      monthlyModifierSum += modifiers.pets_frequent || 15;
      influencingFactors.push('Pets swim frequently');
    } else if (questionnaireData.petsAccess && questionnaireData.petSwimFrequency === 'occasionally') {
      monthlyModifierSum += modifiers.pets_occasional || 8;
      influencingFactors.push('Pets swim occasionally');
    }

    // Access complexity
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

    // CALCULATE MONTHLY PRICE
    const estimatedMonthlyPrice = baseWeekly + monthlyModifierSum + uncertaintyFee;

    // CALCULATE PER-VISIT PRICE
    let perVisitPrice;
    if (questionnaireData.recommendedFrequency === 'biweekly') {
      const biweeklyMonthly = estimatedMonthlyPrice * biweeklyMultiplier;
      perVisitPrice = biweeklyMonthly / 2.16;
    } else {
      perVisitPrice = estimatedMonthlyPrice / 4.33;
    }

    // Round per-visit price
    const rounding = settings.perVisitRounding || 'round';
    if (rounding === 'ceil') {
      perVisitPrice = Math.ceil(perVisitPrice * 100) / 100;
    } else if (rounding === 'floor') {
      perVisitPrice = Math.floor(perVisitPrice * 100) / 100;
    } else {
      perVisitPrice = Math.round(perVisitPrice * 100) / 100;
    }

    // CALCULATE ONE-TIME FEES
    let estimatedOneTimeFees = 0;

    if (questionnaireData.poolCondition === 'green_algae') {
      estimatedOneTimeFees += (oneTimeFees.condition_green_pool_startup || 120);
      influencingFactors.push('Green pool recovery required');
    } else if (questionnaireData.poolCondition === 'slightly_cloudy') {
      estimatedOneTimeFees += (oneTimeFees.condition_slightly_cloudy || 25);
      influencingFactors.push('Water clarity adjustment');
    } else if (questionnaireData.poolCondition === 'not_sure') {
      estimatedOneTimeFees += (oneTimeFees.condition_not_sure_inspection || 25);
      influencingFactors.push('Professional water inspection');
    }

    if (questionnaireData.knownIssues?.includes('equipment_concerns')) {
      estimatedOneTimeFees += (oneTimeFees.issue_equipment_concerns || 35);
      influencingFactors.push('Equipment assessment required');
    }
    if (questionnaireData.knownIssues?.includes('leaks')) {
      estimatedOneTimeFees += (oneTimeFees.issue_leaks || 50);
      influencingFactors.push('Leak investigation');
    }
    if (questionnaireData.knownIssues?.includes('staining')) {
      estimatedOneTimeFees += (oneTimeFees.issue_staining || 25);
      influencingFactors.push('Stain treatment');
    }

    // CALCULATE FIRST MONTH ADJUSTMENT
    let firstMonthAdjustment = 0;
    if (questionnaireData.poolCondition === 'green_algae') {
      firstMonthAdjustment = oneTimeFees.condition_green_pool_first_month || 25;
    }

    const estimatedFirstMonthTotal = estimatedMonthlyPrice + estimatedOneTimeFees + firstMonthAdjustment;

    // CALCULATE RISK SCORE
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

    riskScore = Math.min(riskScore, 100);

    const riskLevel = riskScore < 40 ? 'low' : riskScore < 70 ? 'medium' : 'high';

    // GENERATE TECHNICIAN NOTES
    const equipmentList = (questionnaireData.equipment || []).join(', ') || 'Standard';
    const technicianNotes = `PROPERTY SUMMARY
Pool Size: ${questionnaireData.poolSize.replace(/_/g, '-')} gallons (est)
Type: ${questionnaireData.poolType.replace(/_/g, ' ')} | Enclosure: ${questionnaireData.enclosure.replace(/_/g, ' ')}
Filter: ${questionnaireData.filterType} | Sanitizer: ${questionnaireData.chlorinationMethod.replace(/_/g, ' ')}${questionnaireData.chlorinatorType ? ` (${questionnaireData.chlorinatorType.replace(/_/g, ' ')})` : ''}
Usage: ${questionnaireData.useFrequency.replace(/_/g, ' ')} | Pets: ${questionnaireData.petsAccess ? `Yes (${questionnaireData.petSwimFrequency})` : 'No'}
Condition: ${questionnaireData.poolCondition.replace(/_/g, ' ')}
Features: ${equipmentList}
Access: ${questionnaireData.accessType.replace(/_/g, ' ')}${questionnaireData.accessNotes ? ` - ${questionnaireData.accessNotes}` : ''}
Risk: ${riskScore} (${riskLevel})
Quote: $${estimatedMonthlyPrice.toFixed(2)}/month + $${estimatedOneTimeFees.toFixed(2)} one-time
First Month Est: $${estimatedFirstMonthTotal.toFixed(2)}`;

    return Response.json({
      success: true,
      quote: {
        estimatedMonthlyPrice: parseFloat(estimatedMonthlyPrice.toFixed(2)),
        estimatedPerVisitPrice: perVisitPrice,
        estimatedOneTimeFees: parseFloat(estimatedOneTimeFees.toFixed(2)),
        estimatedFirstMonthTotal: parseFloat(estimatedFirstMonthTotal.toFixed(2)),
        riskScore: Math.round(riskScore),
        riskLevel,
        priceInfluencers: influencingFactors,
        technicianNotes
      }
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});