import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * MARGIN STRESS-TEST SIMULATION
 * Generates 500 synthetic pools and calculates margins
 * Admin-only analytics tool
 */

const TARGET_MARGIN_DEFAULT = 50; // 50% target margin

// Inline pricing engine — no sub-function calls allowed.
// AdminSettings is the sole source of truth; caller must pass a valid settings object.
function runPricingEngine(q, settings) {
  const baseTiers = JSON.parse(settings.baseTierPrices);
  const tokens = JSON.parse(settings.additiveTokens);
  const riskEngine = JSON.parse(settings.riskEngine);
  const frequencyLogic = JSON.parse(settings.frequencyLogic);

  let sizeTier = 'tier_a';
  let baseMonthly = baseTiers.tier_a_10_15k;
  if (q.poolSize === '15_20k') { sizeTier = 'tier_b'; baseMonthly = baseTiers.tier_b_15_20k; }
  else if (q.poolSize === '20_30k') { sizeTier = 'tier_c'; baseMonthly = baseTiers.tier_c_20_30k; }
  else if (q.poolSize === '30k_plus') { sizeTier = 'tier_d'; baseMonthly = baseTiers.tier_d_30k_plus; }

  let additive = 0;
  if (q.enclosure === 'unscreened') additive += tokens[`unscreened_${sizeTier}`] || 0;
  if (q.enclosure === 'unscreened' && q.treesOverhead === 'yes') additive += tokens.trees_overhead || 0;
  if (q.useFrequency === 'weekends') additive += tokens.usage_weekends || 0;
  else if (q.useFrequency === 'several_week') additive += tokens.usage_several_week || 0;
  else if (q.useFrequency === 'daily') additive += tokens.usage_daily || 0;
  const chlorMethod = q.chlorinationMethod;
  const chlorType = q.chlorinatorType;
  if (chlorMethod === 'tablets' && (chlorType === 'floating' || chlorType === 'skimmer')) additive += tokens[`chlorinator_floater_${sizeTier}`] || 0;
  if (chlorMethod === 'liquid_chlorine') additive += tokens.chlorinator_liquid_only || 0;
  if (q.petsAccess && q.petSwimFrequency === 'occasionally') additive += tokens.pets_occasional || 0;
  if (q.petsAccess && q.petSwimFrequency === 'frequently') additive += tokens.pets_frequent || 0;

  const pts = riskEngine.points;
  let rawRisk = 0;
  if (q.enclosure === 'unscreened') rawRisk += pts.unscreened || 0;
  if (q.enclosure === 'unscreened' && q.treesOverhead === 'yes') rawRisk += pts.trees_overhead || 0;
  if (q.useFrequency === 'daily') rawRisk += pts.usage_daily || 0;
  else if (q.useFrequency === 'several_week') rawRisk += pts.usage_several_week || 0;
  if (chlorMethod === 'tablets' && (chlorType === 'floating' || chlorType === 'skimmer')) rawRisk += pts.chlorinator_floater_skimmer || 0;
  if (chlorMethod === 'liquid_chlorine') rawRisk += pts.chlorinator_liquid_only || 0;
  if (q.petsAccess && q.petSwimFrequency === 'frequently') rawRisk += pts.pets_frequent || 0;
  else if (q.petsAccess && q.petSwimFrequency === 'occasionally') rawRisk += pts.pets_occasional || 0;
  if (q.poolCondition === 'green_algae') rawRisk += pts.condition_green || 0;

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
  let frequencySelectedOrRequired = 'weekly';
  if (adjustedRisk >= frequencyLogic.auto_require_threshold) {
    freqMult = frequencyLogic.twice_weekly_multiplier;
    frequencySelectedOrRequired = 'twice_weekly';
  }

  let finalMonthlyPrice = (baseMonthly + additive + riskAddon) * freqMult;
  const floor = baseTiers.absolute_floor;
  if (finalMonthlyPrice < floor) finalMonthlyPrice = floor;

  return { sizeTier, finalMonthlyPrice, adjustedRisk, frequencySelectedOrRequired };
}

// Cost estimation models (monthly)
const COST_MODELS = {
  chemicals: {
    tier_a: { low: 25, medium: 35, high: 50 },
    tier_b: { low: 35, medium: 50, high: 70 },
    tier_c: { low: 50, medium: 70, high: 95 },
    tier_d: { low: 70, medium: 95, high: 130 }
  },
  labor: {
    weekly: {
      tier_a: 60,  // ~15 min/visit * 4 visits * $60/hr
      tier_b: 70,
      tier_c: 90,
      tier_d: 110
    },
    twice_weekly: {
      tier_a: 108, // 1.8x weekly
      tier_b: 126,
      tier_c: 162,
      tier_d: 198
    }
  }
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (user?.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    const { targetMargin = TARGET_MARGIN_DEFAULT, poolCount = 500 } = await req.json();

    // Load AdminSettings — single source of truth
    const rows = await base44.asServiceRole.entities.AdminSettings.list('-created_date', 1);
    const settings = rows[0] || null;
    if (!settings) {
      return Response.json({ error: 'AdminSettings not found', code: 'ADMIN_SETTINGS_MISSING' }, { status: 503 });
    }

    console.log(`🧪 Running margin stress-test with ${poolCount} synthetic pools, configId=${settings.id}...`);

    // Generate synthetic pools
    const syntheticPools = generateSyntheticPools(poolCount);

    // Calculate pricing and margins for each pool (inline — no sub-function calls)
    const results = [];
    for (const pool of syntheticPools) {
      try {
        const quote = runPricingEngine(pool, settings);
        if (!quote) continue;

        // Estimate costs
        const chemicalCost = estimateChemicalCost(quote.sizeTier, quote.adjustedRisk);
        const laborCost = COST_MODELS.labor[quote.frequencySelectedOrRequired][quote.sizeTier];
        const totalCost = chemicalCost + laborCost;
        const revenue = quote.finalMonthlyPrice;
        const margin = revenue - totalCost;
        const marginPct = (margin / revenue) * 100;

        results.push({
          pool,
          quote,
          costs: {
            chemicals: chemicalCost,
            labor: laborCost,
            total: totalCost
          },
          revenue,
          margin,
          marginPct,
          meetsTarget: marginPct >= targetMargin
        });

      } catch (error) {
        console.error('Error calculating pool:', error);
      }
    }

    // Analytics
    const analytics = generateAnalytics(results, targetMargin);

    return Response.json({
      success: true,
      targetMargin,
      poolCount: results.length,
      results,
      analytics
    });

  } catch (error) {
    console.error('Margin stress-test error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});

function generateSyntheticPools(count) {
  const pools = [];
  const sizes = ['10_15k', '15_20k', '20_30k', '30k_plus'];
  const enclosures = ['fully_screened', 'unscreened'];
  const usageFreq = ['rarely', 'weekends', 'several_week', 'daily'];
  const chlorMethods = ['tablets', 'liquid_chlorine', 'saltwater'];
  const chlorTypes = ['inline_plumbed', 'floating', 'skimmer', 'offline'];
  const petFreq = ['never', 'rarely', 'occasionally', 'frequently'];

  for (let i = 0; i < count; i++) {
    // Realistic distributions (weighted)
    const poolSize = weightedRandom(sizes, [0.35, 0.30, 0.25, 0.10]);
    const enclosure = weightedRandom(enclosures, [0.65, 0.35]);
    const treesOverhead = enclosure === 'unscreened' ? weightedRandom(['yes', 'no'], [0.40, 0.60]) : 'no';
    const useFrequency = weightedRandom(usageFreq, [0.20, 0.30, 0.35, 0.15]);
    const chlorinationMethod = weightedRandom(chlorMethods, [0.60, 0.25, 0.15]);
    const chlorinatorType = chlorinationMethod === 'tablets' 
      ? weightedRandom(chlorTypes, [0.50, 0.25, 0.15, 0.10])
      : 'n/a';
    const petSwimFrequency = weightedRandom(petFreq, [0.50, 0.25, 0.15, 0.10]);
    const petsAccess = petSwimFrequency !== 'never';

    pools.push({
      poolSize,
      poolType: 'in_ground',
      enclosure,
      treesOverhead,
      useFrequency,
      chlorinationMethod,
      chlorinatorType,
      petSwimFrequency,
      petsAccess,
      poolCondition: 'clear',
      spaPresent: 'false',
      filterType: 'sand'
    });
  }

  return pools;
}

function weightedRandom(options, weights) {
  const total = weights.reduce((sum, w) => sum + w, 0);
  let random = Math.random() * total;
  
  for (let i = 0; i < options.length; i++) {
    random -= weights[i];
    if (random <= 0) return options[i];
  }
  
  return options[options.length - 1];
}

function estimateChemicalCost(sizeTier, adjustedRisk) {
  const tierCosts = COST_MODELS.chemicals[sizeTier];
  
  // Map risk to cost tier
  if (adjustedRisk < 3) return tierCosts.low;
  if (adjustedRisk < 7) return tierCosts.medium;
  return tierCosts.high;
}

function generateAnalytics(results, targetMargin) {
  // Overall stats
  const totalRevenue = results.reduce((sum, r) => sum + r.revenue, 0);
  const totalCost = results.reduce((sum, r) => sum + r.costs.total, 0);
  const totalMargin = totalRevenue - totalCost;
  const avgMarginPct = (totalMargin / totalRevenue) * 100;

  // By size tier
  const byTier = {};
  for (const tier of ['tier_a', 'tier_b', 'tier_c', 'tier_d']) {
    const tierResults = results.filter(r => r.quote.sizeTier === tier);
    if (tierResults.length === 0) continue;

    const tierRevenue = tierResults.reduce((sum, r) => sum + r.revenue, 0);
    const tierCost = tierResults.reduce((sum, r) => sum + r.costs.total, 0);
    const tierMargin = tierRevenue - tierCost;
    const tierMarginPct = (tierMargin / tierRevenue) * 100;

    byTier[tier] = {
      count: tierResults.length,
      avgRevenue: tierRevenue / tierResults.length,
      avgCost: tierCost / tierResults.length,
      avgMargin: tierMargin / tierResults.length,
      avgMarginPct: tierMarginPct,
      meetsTarget: tierMarginPct >= targetMargin
    };
  }

  // Worst-case scenarios
  const sortedByMargin = [...results].sort((a, b) => a.marginPct - b.marginPct);
  const worstCase = sortedByMargin.slice(0, 10);

  // High-risk clusters (low margin pools)
  const lowMarginPools = results.filter(r => r.marginPct < targetMargin);
  const highRiskClusters = analyzeHighRiskClusters(lowMarginPools);

  // Risk adjustment recommendations
  const recommendations = generateRecommendations(results, targetMargin, byTier);

  return {
    overall: {
      avgRevenue: totalRevenue / results.length,
      avgCost: totalCost / results.length,
      avgMargin: totalMargin / results.length,
      avgMarginPct,
      meetsTarget: avgMarginPct >= targetMargin
    },
    byTier,
    worstCase: worstCase.map(r => ({
      sizeTier: r.quote.sizeTier,
      revenue: r.revenue,
      cost: r.costs.total,
      margin: r.margin,
      marginPct: r.marginPct,
      risk: r.quote.adjustedRisk,
      frequency: r.quote.frequencySelectedOrRequired,
      profile: {
        enclosure: r.pool.enclosure,
        usage: r.pool.useFrequency,
        chlorination: r.pool.chlorinationMethod
      }
    })),
    highRiskClusters,
    recommendations
  };
}

function analyzeHighRiskClusters(lowMarginPools) {
  const clusters = {};

  for (const pool of lowMarginPools) {
    const key = `${pool.quote.sizeTier}_${pool.pool.enclosure}_${pool.pool.useFrequency}`;
    
    if (!clusters[key]) {
      clusters[key] = {
        profile: {
          sizeTier: pool.quote.sizeTier,
          enclosure: pool.pool.enclosure,
          usage: pool.pool.useFrequency
        },
        count: 0,
        avgMarginPct: 0,
        avgRisk: 0
      };
    }

    clusters[key].count++;
    clusters[key].avgMarginPct += pool.marginPct;
    clusters[key].avgRisk += pool.quote.adjustedRisk;
  }

  // Calculate averages
  for (const cluster of Object.values(clusters)) {
    cluster.avgMarginPct /= cluster.count;
    cluster.avgRisk /= cluster.count;
  }

  // Sort by count (most problematic)
  return Object.values(clusters)
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
}

function generateRecommendations(results, targetMargin, byTier) {
  const recommendations = [];

  // Check each tier
  for (const [tier, stats] of Object.entries(byTier)) {
    if (!stats.meetsTarget) {
      const marginGap = targetMargin - stats.avgMarginPct;
      const revenueIncrease = (stats.avgRevenue * (marginGap / 100)) / (1 - targetMargin / 100);
      
      recommendations.push({
        tier,
        issue: `Margin below target (${stats.avgMarginPct.toFixed(1)}% vs ${targetMargin}%)`,
        action: 'increase_base_price',
        suggestedIncrease: Math.ceil(revenueIncrease),
        impact: `Would raise margin to ~${targetMargin}%`
      });
    }
  }

  // Check high-risk low-margin scenarios
  const highRiskLowMargin = results.filter(r => 
    r.quote.adjustedRisk >= 7 && r.marginPct < targetMargin
  );

  if (highRiskLowMargin.length > results.length * 0.15) {
    recommendations.push({
      tier: 'all',
      issue: `${highRiskLowMargin.length} high-risk pools have low margins`,
      action: 'increase_risk_escalation',
      suggestedChange: 'Add $10-15 to brackets 6-8 and 9-11',
      impact: 'Would improve margin on high-maintenance pools'
    });
  }

  // Check frequency override effectiveness
  const forcedTwiceWeekly = results.filter(r => 
    r.quote.frequencySelectedOrRequired === 'twice_weekly' && 
    r.marginPct < targetMargin
  );

  if (forcedTwiceWeekly.length > 0) {
    recommendations.push({
      tier: 'all',
      issue: `${forcedTwiceWeekly.length} twice-weekly pools still have low margins`,
      action: 'increase_frequency_multiplier',
      suggestedChange: 'Increase from 1.8x to 1.9x or 2.0x',
      impact: 'Better compensates for extra labor on high-risk pools'
    });
  }

  return recommendations;
}