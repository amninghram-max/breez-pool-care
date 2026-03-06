import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

/**
 * cleanupTestRunV1
 * Deletes test records tagged with isTest:true and a specific testRunId.
 * Safe by default: only removes records matching BOTH isTest===true AND testRunId===payload.testRunId.
 *
 * Input:  { testRunId: string }
 * Output: { success, testRunId, deleted, build, runtimeVersion, requestId }
 */

const BUILD = "CLEANUP-V1-2026-03-06-B";

const json200 = (data) => new Response(
  JSON.stringify(data),
  { status: 200, headers: { "content-type": "application/json; charset=utf-8" } }
);

async function deleteTagged(entities, entityName, testRunId) {
  const records = await entities[entityName].filter({ isTest: true, testRunId }, null, 200);
  if (!records || records.length === 0) return 0;

  let count = 0;
  for (const record of records) {
    // Double-guard: never delete unless both fields are explicitly correct
    if (record.isTest !== true || record.testRunId !== testRunId) continue;
    await entities[entityName].delete(record.id);
    count++;
  }
  return count;
}

Deno.serve(async (req) => {
  const requestId = crypto.randomUUID();
  const runtimeVersion = BUILD;
  const meta = { build: BUILD, runtimeVersion, requestId };

  try {
    const base44 = createClientFromRequest(req);
    const payload = await req.json();
    const { testRunId } = payload || {};

    if (!testRunId || typeof testRunId !== 'string' || !testRunId.trim()) {
      return json200({ success: false, code: 'MISSING_TEST_RUN_ID', error: 'testRunId is required', ...meta });
    }

    const trimmedRunId = testRunId.trim();
    const entities = base44.asServiceRole.entities;

    // Deletion order: children before parents to respect referential integrity
    const deleted = {};

    deleted.NotificationLog  = await deleteTagged(entities, 'NotificationLog',  trimmedRunId);
    deleted.CalendarEvent    = await deleteTagged(entities, 'CalendarEvent',    trimmedRunId);
    deleted.InspectionRecord = await deleteTagged(entities, 'InspectionRecord', trimmedRunId);
    deleted.Quote            = await deleteTagged(entities, 'Quote',            trimmedRunId);
    deleted.QuoteRequests    = await deleteTagged(entities, 'QuoteRequests',    trimmedRunId);
    deleted.Lead             = await deleteTagged(entities, 'Lead',             trimmedRunId);

    const totalDeleted = Object.values(deleted).reduce((sum, n) => sum + n, 0);
    console.log('CLEANUP_V1_SUCCESS', { requestId, testRunId: trimmedRunId, totalDeleted, deleted });

    return json200({
      success: true,
      testRunId: trimmedRunId,
      deleted,
      totalDeleted,
      ...meta
    });
  } catch (error) {
    console.error('CLEANUP_V1_CRASH', { requestId, error: error?.message });
    return json200({ success: false, error: 'Cleanup failed', detail: error?.message, ...meta });
  }
});