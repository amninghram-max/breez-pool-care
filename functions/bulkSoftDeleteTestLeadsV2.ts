import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * bulkSoftDeleteTestLeadsV2
 * 
 * Dev-only bulk soft-delete function for test data cleanup.
 * 
 * Safety:
 * - Requires explicit data_env: "dev" or refuses to run (403)
 * - Admin-only access
 * - Uses explicit leadIds (no email heuristics in execute mode)
 * 
 * Modes:
 * 1. Discover: if leadIds not provided, return matched leads (uses email heuristic for discovery only, dev-only)
 * 2. Execute: if leadIds provided, soft-delete exactly those leads (idempotent - skips already deleted)
 * 
 * Input: { 
 *   dryRun?: boolean (default true),
 *   data_env: "dev" (REQUIRED),
 *   leadIds?: string[] (if not provided, discovers test leads via email heuristic)
 * }
 * 
 * Output: { 
 *   success: boolean,
 *   dryRun: boolean,
 *   matchedCount: number,
 *   deletedCount: number,
 *   skippedCount: number,
 *   leadIds: string[],
 *   build: string,
 *   error?: string
 * }
 */

const BUILD = "BULK_SOFT_DELETE_TEST_LEADS_V2_2026_03_02";

const json = (data, status = 200) => new Response(
  JSON.stringify(data),
  { status, headers: { "content-type": "application/json; charset=utf-8" } }
);

// DISCOVERY-ONLY heuristic: matches test.customer*.@breezpoolcare.com
// This is explicitly dev-only and used only for discovery, not execution
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
      return json({
        success: false,
        error: 'Forbidden: Admin access required',
        build: BUILD
      }, 403);
    }

    const payload = await req.json() || {};
    const { dryRun = true, data_env, leadIds } = payload;

    // CRITICAL: Require data_env === "dev"
    if (data_env !== 'dev') {
      console.warn('BULK_DELETE_TEST_LEADS_V2_MISSING_DEV_ENV', {
        data_env,
        email: user?.email
      });
      return json({
        success: false,
        error: 'Forbidden: data_env must be "dev"',
        build: BUILD
      }, 403);
    }

    // --- DISCOVER MODE ---
    // If leadIds not provided, discover test leads via email heuristic (dev-only)
    if (!leadIds || leadIds.length === 0) {
      console.info('BULK_DELETE_TEST_LEADS_V2_DISCOVER_MODE', {
        user: user?.email
      });

      let allLeads = [];
      try {
        allLeads = await base44.asServiceRole.entities.Lead.list('-created_date', 1000);
      } catch (e) {
        console.error('BULK_DELETE_TEST_LEADS_V2_QUERY_FAILED', { error: e.message });
        return json({
          success: false,
          error: 'Failed to query leads',
          detail: e.message,
          build: BUILD
        }, 500);
      }

      // Filter via email heuristic (discovery-only, dev-only)
      const testLeads = allLeads.filter(lead => isTestCustomerEmail(lead.email));
      const matchedCount = testLeads.length;

      if (matchedCount === 0) {
        console.info('BULK_DELETE_TEST_LEADS_V2_NO_MATCHES', { dryRun });
        return json({
          success: true,
          dryRun,
          matchedCount: 0,
          deletedCount: 0,
          skippedCount: 0,
          leadIds: [],
          build: BUILD
        });
      }

      const notDeletedCount = testLeads.filter(l => !l.isDeleted).length;
      console.info('BULK_DELETE_TEST_LEADS_V2_DISCOVER_COMPLETE', {
        matchedCount,
        notDeletedCount
      });

      return json({
        success: true,
        dryRun: true, // Discovery is always a dry run
        matchedCount,
        deletedCount: 0,
        skippedCount: matchedCount,
        leadIds: testLeads.map(l => l.id),
        build: BUILD
      });
    }

    // --- EXECUTE MODE ---
    // leadIds provided: soft-delete exactly those leads (no further discovery)
    console.info('BULK_DELETE_TEST_LEADS_V2_EXECUTE_MODE', {
      requestedCount: leadIds.length,
      dryRun,
      user: user?.email
    });

    // Fetch the leads to delete
    let leadsToDelete = [];
    try {
      // Filter to requested leadIds only
      const allLeads = await base44.asServiceRole.entities.Lead.list('-created_date', 1000);
      leadsToDelete = allLeads.filter(l => leadIds.includes(l.id));
    } catch (e) {
      console.error('BULK_DELETE_TEST_LEADS_V2_FETCH_FAILED', { error: e.message });
      return json({
        success: false,
        error: 'Failed to fetch leads',
        detail: e.message,
        build: BUILD
      }, 500);
    }

    const matchedCount = leadsToDelete.length;

    // If dryRun, just return counts without mutations
    if (dryRun) {
      const notDeletedCount = leadsToDelete.filter(l => !l.isDeleted).length;
      console.info('BULK_DELETE_TEST_LEADS_V2_EXECUTE_DRY_RUN', {
        matchedCount,
        notDeletedCount
      });
      return json({
        success: true,
        dryRun: true,
        matchedCount,
        deletedCount: 0,
        skippedCount: matchedCount,
        leadIds: leadsToDelete.map(l => l.id),
        build: BUILD
      });
    }

    // Execute deletions (idempotent)
    let deletedCount = 0;
    let skippedCount = 0;
    const deletedIds = [];

    for (const lead of leadsToDelete) {
      if (lead.isDeleted) {
        skippedCount++;
        console.info('BULK_DELETE_TEST_LEADS_V2_SKIP_ALREADY_DELETED', {
          leadId: lead.id,
          email: lead.email
        });
        continue;
      }

      try {
        const now = new Date().toISOString();

        // 1. Soft-delete the Lead
        await base44.asServiceRole.entities.Lead.update(lead.id, {
          isDeleted: true,
          deletedAt: now,
          deletedBy: user?.email || 'system',
          deleteReason: 'test_data_cleanup'
        });

        // 2. Cancel all non-cancelled InspectionRecords for this lead
        let inspectionsCancelled = 0;
        try {
          const inspections = await base44.asServiceRole.entities.InspectionRecord.filter(
            { leadId: lead.id },
            null,
            100
          );
          for (const inspection of inspections) {
            if (inspection.appointmentStatus !== 'cancelled') {
              await base44.asServiceRole.entities.InspectionRecord.update(inspection.id, {
                appointmentStatus: 'cancelled',
                cancelledAt: now,
                cancelReason: 'lead_deleted'
              });
              inspectionsCancelled++;
            }
          }
        } catch (e) {
          console.warn('BULK_DELETE_TEST_LEADS_V2_INSPECTIONS_CANCEL_FAILED', {
            leadId: lead.id,
            error: e.message
          });
        }

        // 3. Cancel all non-cancelled CalendarEvents for this lead
        let eventsCancelled = 0;
        try {
          const events = await base44.asServiceRole.entities.CalendarEvent.filter(
            { leadId: lead.id },
            null,
            100
          );
          for (const event of events) {
            if (event.status !== 'cancelled') {
              await base44.asServiceRole.entities.CalendarEvent.update(event.id, {
                status: 'cancelled',
                cancelledAt: now,
                cancelReason: 'lead_deleted'
              });
              eventsCancelled++;
            }
          }
        } catch (e) {
          console.warn('BULK_DELETE_TEST_LEADS_V2_EVENTS_CANCEL_FAILED', {
            leadId: lead.id,
            error: e.message
          });
        }

        deletedCount++;
        deletedIds.push(lead.id);
        console.info('BULK_DELETE_TEST_LEADS_V2_DELETED', {
          leadId: lead.id,
          email: lead.email,
          inspectionsCancelled,
          eventsCancelled
        });

      } catch (e) {
        console.error('BULK_DELETE_TEST_LEADS_V2_DELETE_CRASH', {
          leadId: lead.id,
          email: lead.email,
          error: e.message
        });
        skippedCount++;
      }
    }

    console.info('BULK_DELETE_TEST_LEADS_V2_EXECUTE_COMPLETE', {
      matchedCount,
      deletedCount,
      skippedCount,
      deletedIds
    });

    return json({
      success: true,
      dryRun: false,
      matchedCount,
      deletedCount,
      skippedCount,
      leadIds: deletedIds,
      build: BUILD
    });

  } catch (error) {
    console.error('BULK_DELETE_TEST_LEADS_V2_CRASH', { error: error?.message });
    return json({
      success: false,
      error: 'Bulk delete failed',
      detail: error?.message,
      build: BUILD
    }, 500);
  }
});