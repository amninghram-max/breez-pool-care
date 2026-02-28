import { createClientFromRequest } from "npm:@base44/sdk";

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  const results = {
    caller: {},
    userScope: {},
    serviceRoleScope: {}
  };

  // --- who am I? (helps prove admin context) ---
  try {
    const me = await base44.auth.me();
    results.caller = { email: me?.email ?? null, role: me?.role ?? null };
  } catch {
    results.caller = { email: null, role: null };
  }

  // --- IMPORTANT: schema-safe payload ---
  const minimalAdminSettings = {
    settingKey: "default",
    version: Date.now(),
    pricingEngineVersion: "debug_env_probe_" + Date.now(),
    baseTierPrices: JSON.stringify({
      tierA: 140, tierB: 160, tierC: 190, tierD: 230
    }),
    additiveTokens: JSON.stringify({ debug: true }),
    initialFees: JSON.stringify({}),
    riskEngine: JSON.stringify({
      brackets: [
        { min: 0, max: 2, addon: 0 },
        { min: 3, max: 5, addon: 15 },
        { min: 6, max: 8, addon: 30 },
        { min: 9, max: 11, addon: 45 },
        { min: 12, max: 999, addon: 60 }
      ],
      sizeMultipliers: { tierB: 1.1, tierC: 1.2, tierD: 1.3 },
      twiceWeeklyAtAdjustedRiskGte: 9,
      twiceWeeklyMultiplier: 1.8
    }),
    frequencyLogic: JSON.stringify({}),
    seasonalPeriods: JSON.stringify([]),
    autopayDiscount: 0
  };

  // Helper: list latest deterministically
  const listLatestUser = async () =>
    await base44.entities.AdminSettings.list("-created_date", 1).catch(() => []);
  const listLatestSR = async () =>
    await base44.asServiceRole.entities.AdminSettings.list("-created_date", 1).catch(() => []);

  // --- TEST 1: User-scoped create ---
  try {
    const beforeU = await listLatestUser();
    const created = await base44.entities.AdminSettings.create(minimalAdminSettings);

    const getU = await base44.entities.AdminSettings.get(created.id).catch(() => null);
    const afterU = await listLatestUser();

    results.userScope = {
      beforeLatestId: beforeU?.[0]?.id ?? null,
      createReturnedId: created?.id ?? null,
      getByIdPersisted: !!getU,
      afterLatestId: afterU?.[0]?.id ?? null,
      afterIncludesCreated: afterU?.[0]?.id === created?.id
    };
  } catch (e) {
    results.userScope = { error: String(e?.message ?? e) };
  }

  // --- TEST 2: Service-role create ---
  try {
    const beforeSR = await listLatestSR();
    const created = await base44.asServiceRole.entities.AdminSettings.create(minimalAdminSettings);

    const getBySR = await base44.asServiceRole.entities.AdminSettings.get(created.id).catch(() => null);
    const getByUser = await base44.entities.AdminSettings.get(created.id).catch(() => null);

    const afterSR = await listLatestSR();
    const afterUser = await listLatestUser();

    results.serviceRoleScope = {
      beforeLatestId_SR: beforeSR?.[0]?.id ?? null,
      createReturnedId: created?.id ?? null,
      getByIdViaSR_persisted: !!getBySR,
      getByIdViaUser_persisted: !!getByUser,
      afterLatestId_SR: afterSR?.[0]?.id ?? null,
      afterLatestId_User: afterUser?.[0]?.id ?? null,
      afterSR_includesCreated: afterSR?.[0]?.id === created?.id,
      afterUser_includesCreated: afterUser?.[0]?.id === created?.id
    };
  } catch (e) {
    results.serviceRoleScope = { error: String(e?.message ?? e) };
  }

  return Response.json(results);
});