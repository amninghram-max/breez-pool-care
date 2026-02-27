import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    // Try all access patterns
    const [listSR, listSR5, createResult] = await Promise.all([
      base44.asServiceRole.entities.AdminSettings.list('-created_date', 10),
      base44.asServiceRole.entities.AdminSettings.list('-created_date', 5),
      base44.asServiceRole.entities.AdminSettings.create({
        settingKey: 'debug_test_' + Date.now(),
        pricingEngineVersion: 'debug',
        baseTierPrices: JSON.stringify({ tier_a_10_15k: 140, absolute_floor: 120 }),
        additiveTokens: JSON.stringify({ usage_weekends: 10 }),
        initialFees: JSON.stringify({ slightly_cloudy: 25 }),
        riskEngine: JSON.stringify({ points: {}, size_multipliers: {}, escalation_brackets: [] }),
        frequencyLogic: JSON.stringify({ twice_weekly_multiplier: 1.8, auto_require_threshold: 9 }),
        autopayDiscount: 10
      })
    ]);

    // Now list again to see if create is visible
    const listAfterCreate = await base44.asServiceRole.entities.AdminSettings.list('-created_date', 10);

    return Response.json({
      listSR_count: listSR.length,
      listSR5_count: listSR5.length,
      createResult_id: createResult?.id,
      createResult_settingKey: createResult?.settingKey,
      listAfterCreate_count: listAfterCreate.length,
      listAfterCreate_ids: listAfterCreate.map(r => ({ id: r.id, settingKey: r.settingKey }))
    });
  } catch (error) {
    return Response.json({ error: error.message, stack: error.stack }, { status: 500 });
  }
});