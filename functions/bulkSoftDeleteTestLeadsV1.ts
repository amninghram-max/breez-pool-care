import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * bulkSoftDeleteTestLeadsV1
 * 
 * Admin-only function to bulk soft-delete test customer leads by email pattern.
 * Matches: test.customer*.@breezpoolcare.com
 * Uses softDeleteLeadV2 cascade for each lead (no orphaned InspectionRecords/CalendarEvents).
 * Idempotent: re-run is safe, skips already-deleted leads.
 * 
 * Input: { dryRun? (default true) }
 * Output: { success, dryRun, matchedCount, deletedCount, skippedCount, leadIds, build }
 */

const BUILD = "BULK_SOFT_DELETE_TEST_LEADS_V1_2026_03_02";

const json200 = (data) => new Response(
  JSON.stringify(data),
  { status: 200, headers: { "content-type": "application/json; charset=utf-8" } }
);

const isTestCustomerEmail = (email) => {
  if (!email || typeof email !== 'string') return false;
  const trimmed = email.trim().toLowerCase();
  return trimmed.startsWith('test.customer') && trimmed.endsWith('@breezpoolcare.com');
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    // Admin-only
    if (user?.role !== 'admin') {
      return json200({
        success: false,
        error: 'Forbidden: Admin access required',
        build: BUILD
      });
    }

    const payload = await req.json() || {};
    const dryRun = payload.dryRun !== false; // default true

    // Query all leads
    let allLeads = [];
    try {
      allLeads = await base44.asServiceRole.entities.Lead.list('-created_date', 1000);
    } catch (e) {
      console.error('BULK_DELETE_TEST_LEADS_V1_QUERY_FAILED', { error: e.message });
      return json200({
        success: false,
        error: 'Failed to query leads',
        detail: e.message,
        build: BUILD
      });
    }

    // Filter test customers
    const testLeads = allLeads.filter(lead => isTestCustomerEmail(lead.email));
    const matchedCount = testLeads.length;

    if (matchedCount === 0) {
      console.log('BULK_DELETE_TEST_LEADS_V1_NO_MATCHES', { dryRun });
      return json200({
        success: true,
        dryRun,
        matchedCount: 0,
        deletedCount: 0,
        skippedCount: 0,
        leadIds: [],
        build: BUILD
      });
    }

    // If dryRun, just return counts
    if (dryRun) {
      const notDeletedCount = testLeads.filter(l => !l.isDeleted).length;
      console.log('BULK_DELETE_TEST_LEADS_V1_DRY_RUN', { matchedCount, notDeletedCount });
      return json200({
        success: true,
        dryRun: true,
        matchedCount,
        deletedCount: 0,
        skippedCount: matchedCount,
        leadIds: testLeads.map(l => l.id),
        build: BUILD
      });
    }

    // Execute deletions
    let deletedCount = 0;
    let skippedCount = 0;
    const deletedIds = [];

    for (const lead of testLeads) {
      if (lead.isDeleted) {
        skippedCount++;
        console.log('BULK_DELETE_TEST_LEADS_V1_SKIP_ALREADY_DELETED', { leadId: lead.id, email: lead.email });
        continue;
      }

      try {
        const deleteRes = await base44.asServiceRole.functions.invoke('softDeleteLeadV2', {
          leadId: lead.id,
          reason: 'test_data_cleanup'
        });

        const deleteData = deleteRes?.data ?? deleteRes;
        if (deleteData?.success === true) {
          deletedCount++;
          deletedIds.push(lead.id);
          console.log('BULK_DELETE_TEST_LEADS_V1_DELETED', {
            leadId: lead.id,
            email: lead.email,
            inspectionsCancelled: deleteData.inspectionsCancelled,
            eventsCancelled: deleteData.eventsCancelled
          });
        } else {
          console.warn('BULK_DELETE_TEST_LEADS_V1_DELETE_FAILED', {
            leadId: lead.id,
            email: lead.email,
            error: deleteData?.error
          });
          skippedCount++;
        }
      } catch (e) {
        console.error('BULK_DELETE_TEST_LEADS_V1_DELETE_CRASH', {
          leadId: lead.id,
          email: lead.email,
          error: e.message
        });
        skippedCount++;
      }
    }

    console.log('BULK_DELETE_TEST_LEADS_V1_COMPLETE', {
      matchedCount,
      deletedCount,
      skippedCount,
      deletedIds
    });

    return json200({
      success: true,
      dryRun: false,
      matchedCount,
      deletedCount,
      skippedCount,
      leadIds: deletedIds,
      build: BUILD
    });

  } catch (error) {
    console.error('BULK_DELETE_TEST_LEADS_V1_CRASH', { error: error?.message });
    return json200({
      success: false,
      error: 'Bulk delete failed',
      detail: error?.message,
      build: BUILD
    });
  }
});