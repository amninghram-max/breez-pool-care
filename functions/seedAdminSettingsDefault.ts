import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * IDEMPOTENT AdminSettings Seeder
 * Guarantees escalation_brackets and all nested config exist
 * Can be run multiple times safely (upserts)
 */

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
  }
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    // Try to get user, but allow service role access for CI
    let user = null;
    try {
      user = await base44.auth.me();
      if (user && user.role !== 'admin') {
        return Response.json({ error: 'Admin access required' }, { status: 403 });
      }
    } catch {
      // No auth - allow for CI/service role access
      console.log('Running as service role (no user auth)');
    }

    // Check if exists — use list() to avoid any filter/RLS issues
    const existing = await base44.asServiceRole.entities.AdminSettings.list('-created_date', 1);

    const payload = {
      settingKey: 'default',
      pricingEngineVersion: 'v2_tokens_risk_frequency',
      baseTierPrices: JSON.stringify(DEFAULT_CONFIG.baseTierPrices),
      additiveTokens: JSON.stringify(DEFAULT_CONFIG.additiveTokens),
      initialFees: JSON.stringify(DEFAULT_CONFIG.initialFees),
      riskEngine: JSON.stringify(DEFAULT_CONFIG.riskEngine),
      frequencyLogic: JSON.stringify(DEFAULT_CONFIG.frequencyLogic),
      autopayDiscount: 10
    };

    let result;
    if (existing.length > 0) {
      // Update existing
      result = await base44.asServiceRole.entities.AdminSettings.update(existing[0].id, payload);
      console.log('✅ Updated existing AdminSettings');
    } else {
      // Create new
      result = await base44.asServiceRole.entities.AdminSettings.create(payload);
      console.log('✅ Created new AdminSettings');
    }

    // VERIFICATION: Read back and validate
    // Use result directly instead of re-querying (may not be immediately consistent)
    const record = result;
    
    // Parse and validate nested config
    const riskEngine = JSON.parse(record.riskEngine);
    const baseTiers = JSON.parse(record.baseTierPrices);
    const tokens = JSON.parse(record.additiveTokens);
    const frequencyLogic = JSON.parse(record.frequencyLogic);

    const brackets = riskEngine.escalation_brackets;
    if (!brackets || brackets.length !== 5) {
      throw new Error(`SEED VERIFICATION FAILED: escalation_brackets has ${brackets?.length || 0} items, expected 5`);
    }

    if (!riskEngine.size_multipliers || Object.keys(riskEngine.size_multipliers).length !== 4) {
      throw new Error('SEED VERIFICATION FAILED: size_multipliers incomplete');
    }

    if (!baseTiers.tier_a_10_15k || !baseTiers.absolute_floor) {
      throw new Error('SEED VERIFICATION FAILED: baseTierPrices incomplete');
    }

    console.log('✅ VERIFICATION PASSED: All nested config intact');
    console.log(`   - Brackets: ${brackets.length}`);
    console.log(`   - Multipliers: ${Object.keys(riskEngine.size_multipliers).length}`);
    console.log(`   - Tokens: ${Object.keys(tokens).length}`);

    return Response.json({
      success: true,
      message: existing.length > 0 ? 'AdminSettings updated and verified' : 'AdminSettings created and verified',
      verification: {
        bracketsCount: brackets.length,
        multipliersCount: Object.keys(riskEngine.size_multipliers).length,
        tokensCount: Object.keys(tokens).length,
        baseTiersCount: Object.keys(baseTiers).length
      }
    });

  } catch (error) {
    console.error('❌ SEED FAILED:', error);
    return Response.json({ 
      error: error.message, 
      stack: error.stack 
    }, { status: 500 });
  }
});