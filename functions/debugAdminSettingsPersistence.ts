import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * Server-side diagnostic: Create AdminSettings, capture ID, immediately query it back.
 * Reproduces the persistence issue in controlled env to isolate platform-level mismatch.
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (user.role !== 'admin') {
      return Response.json({ error: `Forbidden: Expected role "admin", got "${user.role}"` }, { status: 403 });
    }

    console.info('[debugAdminSettingsPersistence] user:', { email: user.email, role: user.role });

    // STEP 1: Attempt CREATE
    console.info('[debugAdminSettingsPersistence] Step 1: Creating AdminSettings record...');
    const createPayload = {
      settingKey: 'default',
      baseTierPrices: JSON.stringify({}),
      additiveTokens: JSON.stringify({}),
      riskEngine: JSON.stringify({ points: {}, size_multipliers: {}, escalation_brackets: [] }),
      initialFees: JSON.stringify({}),
      frequencyLogic: JSON.stringify({}),
      chemistryTargets: JSON.stringify({}),
      seasonalPeriods: JSON.stringify({})
    };

    const createResult = await base44.entities.AdminSettings.create(createPayload);
    console.info('[debugAdminSettingsPersistence] CREATE result:', createResult);

    if (!createResult || !createResult.id) {
      return Response.json({
        step: 'create',
        status: 'failed',
        error: 'CREATE returned no ID',
        createResult
      }, { status: 500 });
    }

    const createdId = createResult.id;

    // STEP 2: Immediately GET by ID
    console.info('[debugAdminSettingsPersistence] Step 2: Fetching by ID immediately after create...');
    let getByIdResult = null;
    try {
      getByIdResult = await base44.entities.AdminSettings.get(createdId);
      console.info('[debugAdminSettingsPersistence] GET by ID result:', getByIdResult);
    } catch (err) {
      console.error('[debugAdminSettingsPersistence] GET by ID error:', err);
      getByIdResult = { error: err.message };
    }

    // STEP 3: LIST all records
    console.info('[debugAdminSettingsPersistence] Step 3: Listing all AdminSettings records...');
    let listAllResult = null;
    try {
      listAllResult = await base44.entities.AdminSettings.list('-created_date', 10);
      console.info('[debugAdminSettingsPersistence] LIST result:', listAllResult);
    } catch (err) {
      console.error('[debugAdminSettingsPersistence] LIST error:', err);
      listAllResult = { error: err.message };
    }

    // STEP 4: LIST with explicit filter
    console.info('[debugAdminSettingsPersistence] Step 4: Listing with settingKey filter...');
    let listFilteredResult = null;
    try {
      listFilteredResult = await base44.entities.AdminSettings.filter(
        { settingKey: 'default' },
        '-created_date',
        10
      );
      console.info('[debugAdminSettingsPersistence] LIST FILTERED result:', listFilteredResult);
    } catch (err) {
      console.error('[debugAdminSettingsPersistence] LIST FILTERED error:', err);
      listFilteredResult = { error: err.message };
    }

    return Response.json({
      user: { email: user.email, role: user.role },
      steps: {
        create: {
          status: 'success',
          id: createdId,
          result: createResult
        },
        get_by_id: {
          status: getByIdResult?.error ? 'failed' : 'success',
          result: getByIdResult
        },
        list_all: {
          status: Array.isArray(listAllResult) || listAllResult?.error ? (listAllResult?.error ? 'failed' : 'success') : 'failed',
          result: listAllResult,
          count: Array.isArray(listAllResult) ? listAllResult.length : 'N/A'
        },
        list_filtered: {
          status: Array.isArray(listFilteredResult) || listFilteredResult?.error ? (listFilteredResult?.error ? 'failed' : 'success') : 'failed',
          result: listFilteredResult,
          count: Array.isArray(listFilteredResult) ? listFilteredResult.length : 'N/A'
        }
      },
      diagnosis: {
        create_succeeded: !!createdId,
        get_by_id_returns_record: !!getByIdResult && !getByIdResult.error && !!getByIdResult.id,
        list_returns_record: Array.isArray(listAllResult) && listAllResult.length > 0,
        issue_likely: (!getByIdResult || getByIdResult.error) || (Array.isArray(listAllResult) && listAllResult.length === 0)
          ? 'DATA ENVIRONMENT MISMATCH or SILENT ROLLBACK'
          : 'No issue detected'
      }
    });

  } catch (error) {
    console.error('[debugAdminSettingsPersistence] Unhandled error:', error);
    return Response.json({
      error: error.message,
      stack: error.stack
    }, { status: 500 });
  }
});