import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

const SEED_CONFIG = {
  settingKey: 'debug_probe',
  pricingEngineVersion: 'v2_debug_probe',
  baseTierPrices: JSON.stringify({ tier_a_10_15k: 140 }),
  additiveTokens: JSON.stringify({ test_token: 1 }),
  initialFees: JSON.stringify({ test_fee: 1 }),
  riskEngine: JSON.stringify({
    points: { test: 1 },
    size_multipliers: { tier_a: 1.0 },
    escalation_brackets: [{ min_risk: 0, max_risk: 2, addon_amount: 0 }]
  }),
  frequencyLogic: JSON.stringify({ twice_weekly_multiplier: 1.8 }),
  autopayDiscount: 0
};

Deno.serve(async (req) => {
  const headers = { 'Content-Type': 'application/json' };
  const log = [];

  try {
    const base44 = createClientFromRequest(req);

    const env = Deno.env.get('BASE44_DATA_ENV') || 'unknown';
    const appId = Deno.env.get('BASE44_APP_ID') || 'unknown';

    const user = await base44.auth.me();
    if (!user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers });
    if (user.role !== 'admin') return new Response(JSON.stringify({ error: 'Admin required' }), { status: 403, headers });

    const meta = { env, appId, callerEmail: user.email, callerRole: user.role };

    // 1. User-scoped list (before)
    let userListBefore = null, userListBeforeErr = null;
    try {
      userListBefore = await base44.entities.AdminSettings.list('-created_date', 10);
      log.push(`user_list_before: ${userListBefore.length} records`);
    } catch (e) { userListBeforeErr = e.message; log.push(`user_list_before_err: ${e.message}`); }

    // 2. Service-role list (before)
    let srListBefore = null, srListBeforeErr = null;
    try {
      srListBefore = await base44.asServiceRole.entities.AdminSettings.list('-created_date', 10);
      log.push(`sr_list_before: ${srListBefore.length} records`);
    } catch (e) { srListBeforeErr = e.message; log.push(`sr_list_before_err: ${e.message}`); }

    // 3. User-scoped create
    let created = null, createErr = null;
    try {
      created = await base44.entities.AdminSettings.create(SEED_CONFIG);
      log.push(`user_create: id=${created?.id || 'NO_ID'}`);
    } catch (e) { createErr = e.message; log.push(`user_create_err: ${e.message}`); }

    if (!created?.id) {
      return new Response(JSON.stringify({ ...meta, log, error: 'CREATE_FAILED', createErr }), { status: 500, headers });
    }

    const createdId = created.id;

    // 4. Service-role get(id)
    let srGet = null, srGetErr = null;
    try {
      srGet = await base44.asServiceRole.entities.AdminSettings.get(createdId);
      log.push(`sr_get(${createdId}): found`);
    } catch (e) { srGetErr = e.message; log.push(`sr_get_err: ${e.message}`); }

    // 5. User-scoped get(id)
    let userGet = null, userGetErr = null;
    try {
      userGet = await base44.entities.AdminSettings.get(createdId);
      log.push(`user_get(${createdId}): found`);
    } catch (e) { userGetErr = e.message; log.push(`user_get_err: ${e.message}`); }

    // 6. Service-role list (after)
    let srListAfter = null, srListAfterErr = null;
    try {
      srListAfter = await base44.asServiceRole.entities.AdminSettings.list('-created_date', 10);
      log.push(`sr_list_after: ${srListAfter.length} records`);
    } catch (e) { srListAfterErr = e.message; log.push(`sr_list_after_err: ${e.message}`); }

    // 7. User-scoped list (after)
    let userListAfter = null, userListAfterErr = null;
    try {
      userListAfter = await base44.entities.AdminSettings.list('-created_date', 10);
      log.push(`user_list_after: ${userListAfter.length} records`);
    } catch (e) { userListAfterErr = e.message; log.push(`user_list_after_err: ${e.message}`); }

    // GHOST_WRITE: create returned id but both gets 404d
    const srGetMissing = !srGet && srGetErr;
    const userGetMissing = !userGet && userGetErr;
    const listCountAfter = srListAfter?.length ?? 0;
    const listCountBefore = srListBefore?.length ?? 0;
    const notInList = listCountAfter <= listCountBefore;

    if (srGetMissing && userGetMissing && notInList) {
      return new Response(JSON.stringify({
        ...meta,
        log,
        error: 'GHOST_WRITE',
        message: 'create() returned id but get(id) returned 404 for both user-scoped and service-role, and list count did not increase',
        createdId,
        srGetErr,
        userGetErr,
        srListBefore: listCountBefore,
        srListAfter: listCountAfter
      }), { status: 500, headers });
    }

    return new Response(JSON.stringify({
      ...meta,
      log,
      success: true,
      createdId,
      srGetFound: !!srGet,
      userGetFound: !!userGet,
      srListBefore: listCountBefore,
      srListAfter: listCountAfter,
      userListBefore: userListBefore?.length ?? null,
      userListAfter: userListAfter?.length ?? null,
      srGetErr: srGetErr || null,
      userGetErr: userGetErr || null
    }), { status: 200, headers });

  } catch (error) {
    return new Response(JSON.stringify({ log, error: error.message, stack: error.stack }), { status: 500, headers });
  }
});