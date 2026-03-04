import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    // Admin-only check
    if (!user || user.role !== 'admin') {
      return Response.json(
        { error: 'Unauthorized: Admin access required' },
        { status: 403 }
      );
    }

    const payload = await req.json().catch(() => ({}));
    const { confirmCode } = payload;

    // Require confirmation code to prevent accidental deletion
    if (confirmCode !== 'CLEAR_ALL_TEST_DATA_CONFIRMED') {
      return Response.json(
        { error: 'Confirmation code required', requiresConfirmation: true },
        { status: 400 }
      );
    }

    console.log('[clearAllTestData] Starting deletion for user:', user.email);

    const entities = base44.asServiceRole.entities;
    const entitiesToClear = ['Lead', 'CalendarEvent', 'Quote', 'QuoteRequests', 'InspectionRecord'];
    const results = {};

    for (const entityName of entitiesToClear) {
      try {
        // Get all records
        const records = await entities[entityName].filter({}, null, 10000);
        const count = records?.length || 0;

        if (count > 0) {
          // Delete all records
          for (const record of records) {
            try {
              await entities[entityName].delete(record.id);
            } catch (e) {
              console.warn(`[clearAllTestData] Failed to delete ${entityName} ${record.id}:`, e.message);
            }
          }
        }

        results[entityName] = { deleted: count, status: 'success' };
        console.log(`[clearAllTestData] ${entityName}: deleted ${count} records`);
      } catch (e) {
        results[entityName] = { status: 'error', error: e.message };
        console.error(`[clearAllTestData] Error clearing ${entityName}:`, e.message);
      }
    }

    console.log('[clearAllTestData] Completed by:', user.email, 'Results:', JSON.stringify(results));

    return Response.json({
      success: true,
      message: 'All test data cleared',
      results,
      clearedBy: user.email,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('[clearAllTestData] Crash:', error.message);
    return Response.json(
      { error: error.message },
      { status: 500 }
    );
  }
});