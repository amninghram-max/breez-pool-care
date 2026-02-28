import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * AdminSettings Seeder — always creates a new record (append-only, RLS update=false).
 * Verifies persistence via before/after list counts and created ID.
 * Entity name: AdminSettings (exact, matches entities/AdminSettings.json)
 */

const SEED_CONFIG = {
  settingKey: 'default',
  pricingEngineVersion: 'v2_tokens_risk_frequency',
  baseTierPrices: JSON.stringify({
    tier_a_10_15k: 140,
    tier_b_15_20k: 160,
    tier_c_20_30k: 190,
    tier_d_30k_plus: 230,
    absolute_floor: 120
  }),
  additiveTokens: JSON.stringify({
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
  }),
  initialFees: JSON.stringify({
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
  }),
  riskEngine: JSON.stringify({
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
  }),
  frequencyLogic: JSON.stringify({
    twice_weekly_multiplier: 1.8,
    auto_require_threshold: 9
  }),
  autopayDiscount: 10
};

Deno.serve(async (req) => {
  const headers = { 'Content-Type': 'application/json' };

  try {
    const base44 = createClientFromRequest(req);

    // Require admin role
    const user = await base44.auth.me();
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers });
    }
    if (user.role !== 'admin') {
      return new Response(JSON.stringify({ error: 'Admin access required' }), { status: 403, headers });
    }

    // Step 1: Count before
    const before = await base44.asServiceRole.entities.AdminSettings.list('-created_date', 50);
    const beforeCount = before.length;
    console.log(`[seed] before count: ${beforeCount}`);

    // Step 2: Create (append-only — entity RLS has update:false)
    const created = await base44.asServiceRole.entities.AdminSettings.create(SEED_CONFIG);
    console.log(`[seed] create returned:`, JSON.stringify({ id: created?.id }));

    // Step 3: Count after
    const after = await base44.asServiceRole.entities.AdminSettings.list('-created_date', 50);
    const afterCount = after.length;
    console.log(`[seed] after count: ${afterCount}`);

    // Step 4: Hard verification
    if (!created?.id || afterCount <= beforeCount || after[0]?.id !== created.id) {
      const body = JSON.stringify({
        error: 'SEED_NOT_PERSISTED',
        beforeCount,
        afterCount,
        createdId: created?.id || null,
        latestIdAfter: after[0]?.id || null
      });
      console.error('[seed] VERIFICATION FAILED:', body);
      return new Response(body, { status: 500, headers });
    }

    // Success
    const body = JSON.stringify({
      success: true,
      createdId: created.id,
      beforeCount,
      afterCount,
      latestId: after[0].id
    });
    console.log('[seed] SUCCESS:', body);
    return new Response(body, { status: 200, headers });

  } catch (error) {
    console.error('[seed] EXCEPTION:', error.message, error.stack);
    return new Response(
      JSON.stringify({ error: error.message, stack: error.stack }),
      { status: 500, headers }
    );
  }
});