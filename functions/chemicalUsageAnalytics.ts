import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * CHEMICAL USAGE FORECASTING ANALYTICS
 * Creates feedback loop between real service data and pricing logic
 * Admin-only analytics tool
 */

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (user?.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    console.log('📊 Analyzing chemical usage and margins...');

    // Fetch all service visits with chemical data
    const serviceVisits = await base44.asServiceRole.entities.ServiceVisit.list();
    
    // Fetch all leads with pool details
    const leads = await base44.asServiceRole.entities.Lead.list();
    
    // Fetch pricing config
    const settingsResult = await base44.asServiceRole.entities.AdminSettings.filter({
      settingKey: 'default'
    });
    const config = settingsResult[0];
    
    if (!config) {
      return Response.json({ error: 'AdminSettings not found' }, { status: 404 });
    }

    const riskEngine = JSON.parse(config.riskEngine);

    // Build pool profiles with service history
    const poolProfiles = buildPoolProfiles(serviceVisits, leads);

    // Calculate chemical costs and labor
    const enrichedProfiles = enrichWithCosts(poolProfiles);

    // Calculate risk scores for each pool
    const profilesWithRisk = enrichedProfiles.map(profile => ({
      ...profile,
      riskScore: calculateRiskScore(profile.lead, riskEngine),
      riskBracket: getRiskBracket(
        calculateRiskScore(profile.lead, riskEngine),
        riskEngine.escalation_brackets
      )
    }));

    // Aggregate by risk bracket, size tier, frequency
    const analytics = {
      byRiskBracket: aggregateByRiskBracket(profilesWithRisk),
      bySizeTier: aggregateBySizeTier(profilesWithRisk),
      byFrequency: aggregateByFrequency(profilesWithRisk),
      underpricedPools: findUnderpricedPools(profilesWithRisk),
      overperformingPools: findOverperformingPools(profilesWithRisk),
      adjustmentRecommendations: generateAdjustmentRecommendations(profilesWithRisk, riskEngine)
    };

    return Response.json({
      success: true,
      totalPools: profilesWithRisk.length,
      totalVisits: serviceVisits.length,
      analytics
    });

  } catch (error) {
    console.error('Chemical analytics error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});

function buildPoolProfiles(serviceVisits, leads) {
  const profiles = [];

  for (const lead of leads) {
    if (lead.stage !== 'converted') continue;

    const poolVisits = serviceVisits.filter(v => v.propertyId === lead.id);
    if (poolVisits.length === 0) continue;

    profiles.push({
      leadId: lead.id,
      lead,
      visits: poolVisits,
      visitCount: poolVisits.length
    });
  }

  return profiles;
}

function enrichWithCosts(profiles) {
  return profiles.map(profile => {
    let totalChlorineCost = 0;
    let totalAcidCost = 0;
    let totalShockCost = 0;
    let totalOtherChemicalCost = 0;
    let totalLaborMinutes = 0;

    // Chemical pricing (per unit)
    const chemicalPrices = {
      liquidChlorine: 3.50, // per gallon
      chlorineTablets: 0.50, // per lb
      acid: 2.00, // per gallon
      bakingSoda: 0.75, // per lb
      stabilizer: 1.20, // per lb
      salt: 0.10, // per lb
      shock: 8.00 // per treatment
    };

    // Labor cost estimation (based on pool size)
    const laborMinutes = {
      tier_a: 25,
      tier_b: 30,
      tier_c: 40,
      tier_d: 50
    };

    for (const visit of profile.visits) {
      const chemicals = visit.chemicalsAdded || {};

      // Calculate costs
      if (chemicals.liquidChlorine) {
        totalChlorineCost += chemicals.liquidChlorine * chemicalPrices.liquidChlorine;
      }
      if (chemicals.chlorineTablets) {
        totalChlorineCost += chemicals.chlorineTablets * chemicalPrices.chlorineTablets;
      }
      if (chemicals.acid) {
        totalAcidCost += chemicals.acid * chemicalPrices.acid;
      }
      if (chemicals.bakingSoda) {
        totalOtherChemicalCost += chemicals.bakingSoda * chemicalPrices.bakingSoda;
      }
      if (chemicals.stabilizer) {
        totalOtherChemicalCost += chemicals.stabilizer * chemicalPrices.stabilizer;
      }
      if (chemicals.salt) {
        totalOtherChemicalCost += chemicals.salt * chemicalPrices.salt;
      }
      if (chemicals.other) {
        for (const item of chemicals.other) {
          if (item.name.toLowerCase().includes('shock')) {
            totalShockCost += chemicalPrices.shock;
          } else {
            totalOtherChemicalCost += 5; // estimate
          }
        }
      }

      // Estimate labor time
      const sizeTier = getSizeTierFromLead(profile.lead);
      totalLaborMinutes += laborMinutes[sizeTier] || 30;
    }

    const totalChemicalCost = totalChlorineCost + totalAcidCost + totalShockCost + totalOtherChemicalCost;
    const avgChemicalCostPerVisit = totalChemicalCost / profile.visitCount;
    const avgLaborMinutesPerVisit = totalLaborMinutes / profile.visitCount;

    // Calculate monthly projections
    const frequency = profile.lead.frequencySelectedOrRequired || 'weekly';
    const visitsPerMonth = frequency === 'weekly' ? 4.33 : 8.66;
    
    const projectedMonthlyChemicalCost = avgChemicalCostPerVisit * visitsPerMonth;
    const projectedMonthlyLaborMinutes = avgLaborMinutesPerVisit * visitsPerMonth;
    const projectedMonthlyLaborCost = (projectedMonthlyLaborMinutes / 60) * 60; // $60/hr

    const monthlyRevenue = profile.lead.monthlyServiceAmount || 0;
    const totalMonthlyCost = projectedMonthlyChemicalCost + projectedMonthlyLaborCost;
    const monthlyMargin = monthlyRevenue - totalMonthlyCost;
    const marginPct = monthlyRevenue > 0 ? (monthlyMargin / monthlyRevenue) * 100 : 0;

    return {
      ...profile,
      costs: {
        chlorine: totalChlorineCost,
        acid: totalAcidCost,
        shock: totalShockCost,
        other: totalOtherChemicalCost,
        total: totalChemicalCost,
        avgPerVisit: avgChemicalCostPerVisit
      },
      labor: {
        totalMinutes: totalLaborMinutes,
        avgMinutesPerVisit: avgLaborMinutesPerVisit
      },
      monthly: {
        chemicalCost: projectedMonthlyChemicalCost,
        laborMinutes: projectedMonthlyLaborMinutes,
        laborCost: projectedMonthlyLaborCost,
        totalCost: totalMonthlyCost,
        revenue: monthlyRevenue,
        margin: monthlyMargin,
        marginPct
      }
    };
  });
}

function calculateRiskScore(lead, riskEngine) {
  const points = riskEngine.points || {};
  const multipliers = riskEngine.size_multipliers || {};
  
  let rawRisk = 0;

  if (lead.screenedArea === 'unscreened') rawRisk += points.unscreened || 2;
  if (lead.screenedArea === 'unscreened' && lead.treesOverhead === 'yes') {
    rawRisk += points.trees_overhead || 1;
  }
  if (lead.usageFrequency === 'daily') rawRisk += points.usage_daily || 2;
  if (lead.usageFrequency === 'several_week') rawRisk += points.usage_several_week || 1;
  if (lead.sanitizerType === 'liquid_chlorine') rawRisk += points.chlorinator_liquid_only || 2;
  if (['floating', 'skimmer'].includes(lead.tabletFeederType)) {
    rawRisk += points.chlorinator_floater_skimmer || 1;
  }
  if (lead.petsSwimInPool) {
    if (lead.petSwimFrequency === 'frequently') rawRisk += points.pets_frequent || 1;
    if (lead.petSwimFrequency === 'occasionally') rawRisk += points.pets_occasional || 0.5;
  }

  const sizeTier = getSizeTierFromLead(lead);
  const multiplier = multipliers[sizeTier] || 1.0;

  return rawRisk * multiplier;
}

function getSizeTierFromLead(lead) {
  if (lead.poolSize === '10_15k' || lead.poolSize === 'under_10k') return 'tier_a';
  if (lead.poolSize === '15_20k') return 'tier_b';
  if (lead.poolSize === '20_30k') return 'tier_c';
  return 'tier_d';
}

function getRiskBracket(riskScore, brackets) {
  if (!brackets) return 'unknown';
  
  for (const bracket of brackets) {
    if (riskScore >= bracket.min_risk && 
        (bracket.max_risk >= 999 || riskScore <= bracket.max_risk)) {
      return `${bracket.min_risk}-${bracket.max_risk >= 999 ? '+' : bracket.max_risk}`;
    }
  }
  
  return 'unknown';
}

function aggregateByRiskBracket(profiles) {
  const brackets = {};

  for (const profile of profiles) {
    const bracket = profile.riskBracket;
    if (!brackets[bracket]) {
      brackets[bracket] = {
        count: 0,
        totalChemicalCost: 0,
        totalLaborMinutes: 0,
        totalRevenue: 0,
        totalMargin: 0
      };
    }

    brackets[bracket].count++;
    brackets[bracket].totalChemicalCost += profile.monthly.chemicalCost;
    brackets[bracket].totalLaborMinutes += profile.monthly.laborMinutes;
    brackets[bracket].totalRevenue += profile.monthly.revenue;
    brackets[bracket].totalMargin += profile.monthly.margin;
  }

  // Calculate averages
  for (const [bracket, data] of Object.entries(brackets)) {
    brackets[bracket] = {
      count: data.count,
      avgChemicalCost: data.totalChemicalCost / data.count,
      avgLaborMinutes: data.totalLaborMinutes / data.count,
      avgRevenue: data.totalRevenue / data.count,
      avgMargin: data.totalMargin / data.count,
      avgMarginPct: (data.totalMargin / data.totalRevenue) * 100
    };
  }

  return brackets;
}

function aggregateBySizeTier(profiles) {
  const tiers = {};

  for (const profile of profiles) {
    const tier = getSizeTierFromLead(profile.lead);
    if (!tiers[tier]) {
      tiers[tier] = {
        count: 0,
        totalChemicalCost: 0,
        totalLaborMinutes: 0,
        totalRevenue: 0,
        totalMargin: 0
      };
    }

    tiers[tier].count++;
    tiers[tier].totalChemicalCost += profile.monthly.chemicalCost;
    tiers[tier].totalLaborMinutes += profile.monthly.laborMinutes;
    tiers[tier].totalRevenue += profile.monthly.revenue;
    tiers[tier].totalMargin += profile.monthly.margin;
  }

  // Calculate averages
  for (const [tier, data] of Object.entries(tiers)) {
    tiers[tier] = {
      count: data.count,
      avgChemicalCost: data.totalChemicalCost / data.count,
      avgLaborMinutes: data.totalLaborMinutes / data.count,
      avgRevenue: data.totalRevenue / data.count,
      avgMargin: data.totalMargin / data.count,
      avgMarginPct: (data.totalMargin / data.totalRevenue) * 100
    };
  }

  return tiers;
}

function aggregateByFrequency(profiles) {
  const frequencies = {};

  for (const profile of profiles) {
    const freq = profile.lead.frequencySelectedOrRequired || 'weekly';
    if (!frequencies[freq]) {
      frequencies[freq] = {
        count: 0,
        totalChemicalCost: 0,
        totalLaborMinutes: 0,
        totalRevenue: 0,
        totalMargin: 0
      };
    }

    frequencies[freq].count++;
    frequencies[freq].totalChemicalCost += profile.monthly.chemicalCost;
    frequencies[freq].totalLaborMinutes += profile.monthly.laborMinutes;
    frequencies[freq].totalRevenue += profile.monthly.revenue;
    frequencies[freq].totalMargin += profile.monthly.margin;
  }

  // Calculate averages
  for (const [freq, data] of Object.entries(frequencies)) {
    frequencies[freq] = {
      count: data.count,
      avgChemicalCost: data.totalChemicalCost / data.count,
      avgLaborMinutes: data.totalLaborMinutes / data.count,
      avgRevenue: data.totalRevenue / data.count,
      avgMargin: data.totalMargin / data.count,
      avgMarginPct: (data.totalMargin / data.totalRevenue) * 100
    };
  }

  return frequencies;
}

function findUnderpricedPools(profiles) {
  // Pools with margin < 40%
  return profiles
    .filter(p => p.monthly.marginPct < 40)
    .sort((a, b) => a.monthly.marginPct - b.monthly.marginPct)
    .slice(0, 20)
    .map(p => ({
      leadId: p.leadId,
      customerName: `${p.lead.firstName} ${p.lead.lastName || ''}`.trim(),
      sizeTier: getSizeTierFromLead(p.lead),
      riskBracket: p.riskBracket,
      riskScore: p.riskScore.toFixed(1),
      monthlyRevenue: p.monthly.revenue,
      monthlyCost: p.monthly.totalCost,
      marginPct: p.monthly.marginPct.toFixed(1),
      visitCount: p.visitCount,
      avgChemicalCostPerVisit: p.costs.avgPerVisit.toFixed(2)
    }));
}

function findOverperformingPools(profiles) {
  // Pools with margin > 60%
  return profiles
    .filter(p => p.monthly.marginPct > 60)
    .sort((a, b) => b.monthly.marginPct - a.monthly.marginPct)
    .slice(0, 20)
    .map(p => ({
      leadId: p.leadId,
      customerName: `${p.lead.firstName} ${p.lead.lastName || ''}`.trim(),
      sizeTier: getSizeTierFromLead(p.lead),
      riskBracket: p.riskBracket,
      riskScore: p.riskScore.toFixed(1),
      monthlyRevenue: p.monthly.revenue,
      monthlyCost: p.monthly.totalCost,
      marginPct: p.monthly.marginPct.toFixed(1),
      visitCount: p.visitCount,
      avgChemicalCostPerVisit: p.costs.avgPerVisit.toFixed(2)
    }));
}

function generateAdjustmentRecommendations(profiles, riskEngine) {
  const recommendations = [];
  const byBracket = aggregateByRiskBracket(profiles);

  // Check each risk bracket for low margins
  for (const [bracket, data] of Object.entries(byBracket)) {
    if (data.avgMarginPct < 45 && data.count >= 3) {
      const marginGap = 50 - data.avgMarginPct;
      const neededRevenue = (data.avgRevenue * (marginGap / 100)) / (1 - 0.50);
      
      recommendations.push({
        type: 'increase_bracket_addon',
        bracket,
        issue: `Low margin (${data.avgMarginPct.toFixed(1)}%) for ${data.count} pools`,
        suggestedIncrease: Math.ceil(neededRevenue),
        currentAvgMargin: data.avgMarginPct.toFixed(1),
        targetMargin: 50
      });
    }
  }

  // Check if high-risk pools are consuming more chemicals than expected
  const highRiskProfiles = profiles.filter(p => p.riskScore >= 7);
  if (highRiskProfiles.length > 0) {
    const avgHighRiskChemicalCost = highRiskProfiles.reduce(
      (sum, p) => sum + p.monthly.chemicalCost, 0
    ) / highRiskProfiles.length;

    const avgLowRiskChemicalCost = profiles
      .filter(p => p.riskScore < 4)
      .reduce((sum, p) => sum + p.monthly.chemicalCost, 0) / 
      profiles.filter(p => p.riskScore < 4).length;

    if (avgHighRiskChemicalCost > avgLowRiskChemicalCost * 1.5) {
      recommendations.push({
        type: 'adjust_risk_points',
        issue: 'High-risk pools consuming 50%+ more chemicals',
        suggestion: 'Increase risk points for unscreened/daily usage',
        highRiskAvgCost: avgHighRiskChemicalCost.toFixed(2),
        lowRiskAvgCost: avgLowRiskChemicalCost.toFixed(2)
      });
    }
  }

  return recommendations;
}