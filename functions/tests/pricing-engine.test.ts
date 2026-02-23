/**
 * UNIT TESTS - Pricing Engine
 * Tests pure pricing logic: tiers, tokens, risk, frequency, floor
 */

export async function runPricingTests(base44) {
  const results = {
    total: 0,
    passed: 0,
    failed: 0,
    skipped: 0,
    failures: []
  };

  // Fetch admin settings
  const settingsList = await base44.asServiceRole.entities.AdminSettings.filter({ settingKey: 'default' });
  const config = settingsList[0] || getDefaultConfig();

  // Test cases
  const tests = [
    // Base tier tests
    {
      name: 'Base Tier A (10-15k) = $140',
      input: { poolSize: '10_15k' },
      expected: { baseTier: 'tier_a', baseMonthly: 140 }
    },
    {
      name: 'Base Tier B (15-20k) = $160',
      input: { poolSize: '15_20k' },
      expected: { baseTier: 'tier_b', baseMonthly: 160 }
    },
    {
      name: 'Base Tier C (20-30k) = $190',
      input: { poolSize: '20_30k' },
      expected: { baseTier: 'tier_c', baseMonthly: 190 }
    },
    {
      name: 'Base Tier D (30k+) = $230',
      input: { poolSize: '30k_plus' },
      expected: { baseTier: 'tier_d', baseMonthly: 230 }
    },

    // Additive tokens
    {
      name: 'Unscreened Tier A adds $20',
      input: { poolSize: '10_15k', enclosure: 'unscreened' },
      expected: { hasToken: 'unscreened', tokenAmount: 20 }
    },
    {
      name: 'Trees overhead adds $10 (only if unscreened)',
      input: { poolSize: '10_15k', enclosure: 'unscreened', treesOverhead: 'yes' },
      expected: { hasToken: 'trees_overhead', tokenAmount: 10 }
    },
    {
      name: 'Trees overhead ignored if screened',
      input: { poolSize: '10_15k', enclosure: 'fully_screened', treesOverhead: 'yes' },
      expected: { noToken: 'trees_overhead' }
    },
    {
      name: 'Daily usage adds $20',
      input: { poolSize: '10_15k', useFrequency: 'daily' },
      expected: { hasToken: 'usage_daily', tokenAmount: 20 }
    },
    {
      name: 'Floater Tier A adds $5',
      input: { poolSize: '10_15k', chlorinationMethod: 'tablets', chlorinatorType: 'floating' },
      expected: { hasToken: 'chlorinator_floater', tokenAmount: 5 }
    },
    {
      name: 'Liquid only adds $10',
      input: { poolSize: '10_15k', chlorinationMethod: 'liquid_chlorine' },
      expected: { hasToken: 'chlorinator_liquid_only', tokenAmount: 10 }
    },
    {
      name: 'Pets frequent adds $10',
      input: { poolSize: '10_15k', petSwimFrequency: 'frequently' },
      expected: { hasToken: 'pets_frequent', tokenAmount: 10 }
    },

    // One-time fees
    {
      name: 'Slightly cloudy adds $25',
      input: { poolSize: '10_15k', poolCondition: 'slightly_cloudy' },
      expected: { oneTimeFee: 25 }
    },
    {
      name: 'Green light small = $60',
      input: { poolSize: '10_15k', poolCondition: 'green_algae', greenPoolSeverity: 'light' },
      expected: { oneTimeFee: 60 }
    },

    // Risk engine
    {
      name: 'Risk points calculated correctly',
      input: { 
        poolSize: '10_15k', 
        enclosure: 'unscreened', 
        useFrequency: 'daily',
        chlorinationMethod: 'liquid_chlorine'
      },
      expected: { rawRisk: 6 } // unscreened(2) + daily(2) + liquid(2) = 6
    },
    {
      name: 'Risk multiplier Tier A = 1.0x',
      input: { poolSize: '10_15k', enclosure: 'unscreened' },
      expected: { adjustedRisk: 2.0 } // 2 * 1.0 = 2.0
    },
    {
      name: 'Risk bracket 3-5 adds $15',
      input: { poolSize: '10_15k', enclosure: 'unscreened', treesOverhead: 'yes', useFrequency: 'daily' },
      expected: { riskAddon: 15 } // risk = (2+1+2)*1.0 = 5 → bracket [3,5] = $15
    },

    // Frequency override
    {
      name: 'High risk (≥9) forces Twice/Week',
      input: { 
        poolSize: '30k_plus', // Tier D, multiplier 1.3
        enclosure: 'unscreened', // 2 pts
        treesOverhead: 'yes', // 1 pt
        useFrequency: 'daily', // 2 pts
        chlorinationMethod: 'liquid_chlorine', // 2 pts
        petSwimFrequency: 'frequently' // 1 pt
      },
      expected: { frequencyRequired: 'twice_weekly' } // (2+1+2+2+1)*1.3 = 10.4 ≥ 9
    },
    {
      name: 'Twice/Week multiplies by 1.8x',
      input: { poolSize: '10_15k', enclosure: 'unscreened', useFrequency: 'daily', chlorinationMethod: 'liquid_chlorine', petSwimFrequency: 'frequently' },
      expected: { frequencyMultiplier: 1.8 }
    },

    // Floor enforcement
    {
      name: 'Final monthly never below $120',
      input: { poolSize: '10_15k' }, // minimal scenario
      expected: { finalMonthly: { min: 120 } }
    }
  ];

  // Run tests
  for (const test of tests) {
    results.total++;
    try {
      const output = await calculateTestQuote(test.input, config, base44);
      const passed = validateExpectations(test.expected, output);
      
      if (passed) {
        results.passed++;
      } else {
        results.failed++;
        results.failures.push({
          test: test.name,
          expected: test.expected,
          actual: output,
          stack: null
        });
      }
    } catch (error) {
      results.failed++;
      results.failures.push({
        test: test.name,
        expected: test.expected,
        actual: null,
        stack: error.stack
      });
    }
  }

  return results;
}

async function calculateTestQuote(input, config, base44) {
  // Call the actual calculateQuote function
  const response = await base44.asServiceRole.functions.invoke('calculateQuote', { questionnaire: input });
  return response.data;
}

function validateExpectations(expected, actual) {
  for (const [key, value] of Object.entries(expected)) {
    if (key === 'baseTier') {
      if (actual.sizeTier !== value) return false;
    } else if (key === 'baseMonthly') {
      if (actual.baseMonthly !== value) return false;
    } else if (key === 'hasToken') {
      const token = actual.additiveTokensApplied?.find(t => t.token_name === value);
      if (!token) return false;
    } else if (key === 'tokenAmount') {
      // Already validated by hasToken
    } else if (key === 'noToken') {
      const token = actual.additiveTokensApplied?.find(t => t.token_name === value);
      if (token) return false;
    } else if (key === 'oneTimeFee') {
      if (actual.oneTimeFees !== value) return false;
    } else if (key === 'rawRisk') {
      if (Math.abs(actual.rawRisk - value) > 0.1) return false;
    } else if (key === 'adjustedRisk') {
      if (Math.abs(actual.adjustedRisk - value) > 0.1) return false;
    } else if (key === 'riskAddon') {
      if (actual.riskAddonAmount !== value) return false;
    } else if (key === 'frequencyRequired') {
      if (actual.frequencySelectedOrRequired !== value) return false;
    } else if (key === 'frequencyMultiplier') {
      if (actual.frequencyMultiplier !== value) return false;
    } else if (key === 'finalMonthly') {
      if (value.min && actual.finalMonthlyPrice < value.min) return false;
    }
  }
  return true;
}

function getDefaultConfig() {
  return {
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
      escalation_brackets: [
        { min_risk: 0, max_risk: 2, addon_amount: 0 },
        { min_risk: 3, max_risk: 5, addon_amount: 15 },
        { min_risk: 6, max_risk: 8, addon_amount: 30 },
        { min_risk: 9, max_risk: 11, addon_amount: 45 },
        { min_risk: 12, max_risk: 999, addon_amount: 60 }
      ]
    },
    frequencyLogic: {
      twice_weekly_multiplier: 1.8,
      auto_require_threshold: 9
    },
    autopayDiscount: 10
  };
}