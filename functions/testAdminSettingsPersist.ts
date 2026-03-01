import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  const testPayload = {
    settingKey: `test_persist_${Date.now()}`,
    pricingEngineVersion: 'v2_tokens_risk_frequency',
    autopayDiscount: 10
  };

  const report = {
    step1_create: null,
    step2_getById: null,
    step3_list: null,
    conclusion: null
  };

  // Step 1: Create
  let createdId = null;
  try {
    const created = await base44.asServiceRole.entities.AdminSettings.create(testPayload);
    createdId = created?.id;
    report.step1_create = {
      success: true,
      id: createdId,
      returned: created
    };
    console.log('[step1] create returned:', JSON.stringify(created));
  } catch (err) {
    report.step1_create = { success: false, error: err.message };
    console.error('[step1] create error:', err.message);
    return Response.json({ report, aborted: 'create failed' }, { status: 200 });
  }

  // Step 2: Get by ID
  try {
    const fetched = await base44.asServiceRole.entities.AdminSettings.get(createdId);
    report.step2_getById = { success: true, found: !!fetched, data: fetched };
    console.log('[step2] get by id returned:', JSON.stringify(fetched));
  } catch (err) {
    report.step2_getById = { success: false, error: err.message };
    console.error('[step2] get error:', err.message);
  }

  // Step 3: List all
  try {
    const all = await base44.asServiceRole.entities.AdminSettings.list();
    const found = all?.find(r => r.id === createdId);
    report.step3_list = {
      success: true,
      totalRecords: all?.length ?? 0,
      createdRecordInList: !!found,
      ids: all?.map(r => r.id)
    };
    console.log('[step3] list count:', all?.length, '| created record found:', !!found);
  } catch (err) {
    report.step3_list = { success: false, error: err.message };
    console.error('[step3] list error:', err.message);
  }

  // Conclusion
  const getOk = report.step2_getById?.found === true;
  const listOk = report.step3_list?.createdRecordInList === true;

  if (getOk && listOk) {
    report.conclusion = 'PASS: Record created and persisted correctly.';
  } else if (!getOk && !listOk) {
    report.conclusion = 'FAIL: create() returned id but record not found via get() OR list() — persistence bug confirmed.';
  } else {
    report.conclusion = `PARTIAL: get=${getOk}, list=${listOk}`;
  }

  console.log('[conclusion]', report.conclusion);
  return Response.json({ report }, { status: 200 });
});