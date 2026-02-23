/**
 * PRICING GOLDEN FIXTURES
 * Canonical quote scenarios for snapshot testing
 * Any change to these outputs = pricing engine regression
 */

export const pricingFixtures = [
  {
    id: 'floor-candidate',
    name: 'Absolute Floor Case (Tier A screened rarely inline no pets clear)',
    description: 'Minimal load pool hitting absolute floor of $120',
    input: {
      poolSize: '10_15k',
      enclosure: 'fully_screened',
      useFrequency: 'rarely',
      chlorinationMethod: 'tablets',
      chlorinatorType: 'inline_plumbed',
      petSwimFrequency: 'never',
      poolCondition: 'clear'
    },
    expected: {
      sizeTier: 'tier_a',
      baseMonthly: 140,
      additiveTokensApplied: [],
      rawRisk: 0,
      adjustedRisk: 0,
      riskAddonAmount: 0,
      frequencySelectedOrRequired: 'weekly',
      frequencyMultiplier: 1.0,
      oneTimeFees: 0,
      finalMonthlyPrice: 140, // base $140, no tokens, 1.0x freq, floor is $120
      autopayDiscountApplicable: false
    }
  },

  {
    id: 'tier-a-moderate-load',
    name: 'Tier A unscreened + trees + weekends + floater + occasional pets',
    description: 'Moderate risk Tier A scenario',
    input: {
      poolSize: '10_15k',
      enclosure: 'unscreened',
      treesOverhead: 'yes',
      useFrequency: 'weekends',
      chlorinationMethod: 'tablets',
      chlorinatorType: 'floating',
      petSwimFrequency: 'occasionally',
      poolCondition: 'clear'
    },
    expected: {
      sizeTier: 'tier_a',
      baseMonthly: 140,
      additiveTokensApplied: [
        { token_name: 'unscreened_tier_a', amount: 20 },
        { token_name: 'trees_overhead', amount: 10 },
        { token_name: 'usage_weekends', amount: 10 },
        { token_name: 'chlorinator_floater_tier_a', amount: 5 },
        { token_name: 'pets_occasional', amount: 5 }
      ],
      rawRisk: 4.5, // unscreened(2) + trees(1) + floater(1) + pets(0.5) = 4.5
      adjustedRisk: 4.5, // 4.5 * 1.0 = 4.5
      riskAddonAmount: 15, // bracket [3,5] = $15
      frequencySelectedOrRequired: 'weekly',
      frequencyMultiplier: 1.0,
      oneTimeFees: 0,
      finalMonthlyPrice: 205, // 140 + 50 (tokens) + 15 (risk) = 205
      autopayDiscountApplicable: false
    }
  },

  {
    id: 'tier-b-high-load',
    name: 'Tier B screened daily + liquid-only + frequent pets',
    description: 'High usage Tier B with liquid chlorine',
    input: {
      poolSize: '15_20k',
      enclosure: 'fully_screened',
      useFrequency: 'daily',
      chlorinationMethod: 'liquid_chlorine',
      petSwimFrequency: 'frequently',
      poolCondition: 'clear'
    },
    expected: {
      sizeTier: 'tier_b',
      baseMonthly: 160,
      additiveTokensApplied: [
        { token_name: 'usage_daily', amount: 20 },
        { token_name: 'chlorinator_liquid_only', amount: 10 },
        { token_name: 'pets_frequent', amount: 10 }
      ],
      rawRisk: 5, // daily(2) + liquid(2) + pets(1) = 5
      adjustedRisk: 5.5, // 5 * 1.1 = 5.5
      riskAddonAmount: 15, // bracket [3,5] = $15
      frequencySelectedOrRequired: 'weekly',
      frequencyMultiplier: 1.0,
      oneTimeFees: 0,
      finalMonthlyPrice: 215, // 160 + 40 (tokens) + 15 (risk) = 215
      autopayDiscountApplicable: false
    }
  },

  {
    id: 'tier-c-moderate',
    name: 'Tier C unscreened + trees + several/week + floater',
    description: 'Tier C with moderate environmental load',
    input: {
      poolSize: '20_30k',
      enclosure: 'unscreened',
      treesOverhead: 'yes',
      useFrequency: 'several_week',
      chlorinationMethod: 'tablets',
      chlorinatorType: 'floating',
      petSwimFrequency: 'never',
      poolCondition: 'clear'
    },
    expected: {
      sizeTier: 'tier_c',
      baseMonthly: 190,
      additiveTokensApplied: [
        { token_name: 'unscreened_tier_c', amount: 30 },
        { token_name: 'trees_overhead', amount: 10 },
        { token_name: 'usage_several_week', amount: 10 },
        { token_name: 'chlorinator_floater_tier_c', amount: 15 }
      ],
      rawRisk: 5, // unscreened(2) + trees(1) + several(1) + floater(1) = 5
      adjustedRisk: 6.0, // 5 * 1.2 = 6.0
      riskAddonAmount: 30, // bracket [6,8] = $30
      frequencySelectedOrRequired: 'weekly',
      frequencyMultiplier: 1.0,
      oneTimeFees: 0,
      finalMonthlyPrice: 285, // 190 + 65 (tokens) + 30 (risk) = 285
      autopayDiscountApplicable: false
    }
  },

  {
    id: 'tier-d-worst-case',
    name: 'Tier D worst-case (forced Twice/Week)',
    description: 'Maximum risk scenario forcing twice-weekly service',
    input: {
      poolSize: '30k_plus',
      enclosure: 'unscreened',
      treesOverhead: 'yes',
      useFrequency: 'daily',
      chlorinationMethod: 'liquid_chlorine',
      petSwimFrequency: 'frequently',
      poolCondition: 'clear'
    },
    expected: {
      sizeTier: 'tier_d',
      baseMonthly: 230,
      additiveTokensApplied: [
        { token_name: 'unscreened_tier_d', amount: 40 },
        { token_name: 'trees_overhead', amount: 10 },
        { token_name: 'usage_daily', amount: 20 },
        { token_name: 'chlorinator_liquid_only', amount: 10 },
        { token_name: 'pets_frequent', amount: 10 }
      ],
      rawRisk: 8, // unscreened(2) + trees(1) + daily(2) + liquid(2) + pets(1) = 8
      adjustedRisk: 10.4, // 8 * 1.3 = 10.4
      riskAddonAmount: 45, // bracket [9,11] = $45
      frequencySelectedOrRequired: 'twice_weekly', // adjustedRisk >= 9 forces twice/week
      frequencyMultiplier: 1.8,
      oneTimeFees: 0,
      finalMonthlyPrice: 657, // (230 + 90 + 45) = 365, then 365 * 1.8 = 657
      autopayDiscountApplicable: false
    }
  },

  // Green-to-Clean Fixtures (9 severity × size combinations)
  {
    id: 'green-light-small',
    name: 'Green Light Small Pool',
    description: 'Light algae in small pool',
    input: {
      poolSize: '10_15k',
      poolCondition: 'green_algae',
      greenPoolSeverity: 'light',
      enclosure: 'fully_screened',
      useFrequency: 'rarely',
      chlorinationMethod: 'tablets',
      chlorinatorType: 'inline_plumbed',
      petSwimFrequency: 'never'
    },
    expected: {
      sizeTier: 'tier_a',
      oneTimeFees: 60,
      finalMonthlyPrice: 140 // base 140, no multipliers
    }
  },

  {
    id: 'green-light-medium',
    name: 'Green Light Medium Pool',
    description: 'Light algae in medium pool',
    input: {
      poolSize: '15_20k',
      poolCondition: 'green_algae',
      greenPoolSeverity: 'light',
      enclosure: 'fully_screened',
      useFrequency: 'rarely',
      chlorinationMethod: 'tablets',
      chlorinatorType: 'inline_plumbed',
      petSwimFrequency: 'never'
    },
    expected: {
      sizeTier: 'tier_b',
      oneTimeFees: 100
    }
  },

  {
    id: 'green-light-large',
    name: 'Green Light Large Pool',
    description: 'Light algae in large pool',
    input: {
      poolSize: '30k_plus',
      poolCondition: 'green_algae',
      greenPoolSeverity: 'light',
      enclosure: 'fully_screened',
      useFrequency: 'rarely',
      chlorinationMethod: 'tablets',
      chlorinatorType: 'inline_plumbed',
      petSwimFrequency: 'never'
    },
    expected: {
      sizeTier: 'tier_d',
      oneTimeFees: 150
    }
  },

  {
    id: 'green-moderate-small',
    name: 'Green Moderate Small Pool',
    description: 'Moderate algae in small pool',
    input: {
      poolSize: '10_15k',
      poolCondition: 'green_algae',
      greenPoolSeverity: 'moderate',
      enclosure: 'fully_screened',
      useFrequency: 'rarely',
      chlorinationMethod: 'tablets',
      chlorinatorType: 'inline_plumbed',
      petSwimFrequency: 'never'
    },
    expected: {
      sizeTier: 'tier_a',
      oneTimeFees: 100
    }
  },

  {
    id: 'green-moderate-medium',
    name: 'Green Moderate Medium Pool',
    description: 'Moderate algae in medium pool',
    input: {
      poolSize: '15_20k',
      poolCondition: 'green_algae',
      greenPoolSeverity: 'moderate',
      enclosure: 'fully_screened',
      useFrequency: 'rarely',
      chlorinationMethod: 'tablets',
      chlorinatorType: 'inline_plumbed',
      petSwimFrequency: 'never'
    },
    expected: {
      sizeTier: 'tier_b',
      oneTimeFees: 150
    }
  },

  {
    id: 'green-moderate-large',
    name: 'Green Moderate Large Pool',
    description: 'Moderate algae in large pool',
    input: {
      poolSize: '30k_plus',
      poolCondition: 'green_algae',
      greenPoolSeverity: 'moderate',
      enclosure: 'fully_screened',
      useFrequency: 'rarely',
      chlorinationMethod: 'tablets',
      chlorinatorType: 'inline_plumbed',
      petSwimFrequency: 'never'
    },
    expected: {
      sizeTier: 'tier_d',
      oneTimeFees: 200
    }
  },

  {
    id: 'green-black-small',
    name: 'Black Swamp Small Pool',
    description: 'Severe black/swamp algae in small pool',
    input: {
      poolSize: '10_15k',
      poolCondition: 'green_algae',
      greenPoolSeverity: 'black_swamp',
      enclosure: 'fully_screened',
      useFrequency: 'rarely',
      chlorinationMethod: 'tablets',
      chlorinatorType: 'inline_plumbed',
      petSwimFrequency: 'never'
    },
    expected: {
      sizeTier: 'tier_a',
      oneTimeFees: 250
    }
  },

  {
    id: 'green-black-medium',
    name: 'Black Swamp Medium Pool',
    description: 'Severe black/swamp algae in medium pool',
    input: {
      poolSize: '15_20k',
      poolCondition: 'green_algae',
      greenPoolSeverity: 'black_swamp',
      enclosure: 'fully_screened',
      useFrequency: 'rarely',
      chlorinationMethod: 'tablets',
      chlorinatorType: 'inline_plumbed',
      petSwimFrequency: 'never'
    },
    expected: {
      sizeTier: 'tier_b',
      oneTimeFees: 350,
      finalMonthlyPrice: 160
    }
  },

  {
    id: 'green-black-large',
    name: 'Black Swamp Large Pool',
    description: 'Severe black/swamp algae in large pool',
    input: {
      poolSize: '30k_plus',
      poolCondition: 'green_algae',
      greenPoolSeverity: 'black_swamp',
      enclosure: 'fully_screened',
      useFrequency: 'rarely',
      chlorinationMethod: 'tablets',
      chlorinatorType: 'inline_plumbed',
      petSwimFrequency: 'never'
    },
    expected: {
      sizeTier: 'tier_d',
      oneTimeFees: 450
    }
  },

  {
    id: 'slightly-cloudy',
    name: 'Slightly Cloudy Pool',
    description: 'Minor clarity issue requiring treatment',
    input: {
      poolSize: '10_15k',
      poolCondition: 'slightly_cloudy',
      enclosure: 'fully_screened',
      useFrequency: 'rarely',
      chlorinationMethod: 'tablets',
      chlorinatorType: 'inline_plumbed',
      petSwimFrequency: 'never'
    },
    expected: {
      sizeTier: 'tier_a',
      oneTimeFees: 25
    }
  },

  {
    id: 'autopay-eligible',
    name: 'AutoPay Discount Scenario',
    description: 'Test autopay discount applicability flag',
    input: {
      poolSize: '10_15k',
      enclosure: 'fully_screened',
      useFrequency: 'rarely',
      chlorinationMethod: 'tablets',
      chlorinatorType: 'inline_plumbed',
      petSwimFrequency: 'never',
      poolCondition: 'clear'
    },
    expected: {
      sizeTier: 'tier_a',
      baseMonthly: 140,
      finalMonthlyPrice: 140,
      autopayDiscountApplicable: false // Set during payment setup, not during quote
    }
  }
];