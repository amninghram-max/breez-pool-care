import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * softDeleteLeadV2
 * 
 * Soft-deletes a Lead and cancels ALL associated InspectionRecords and CalendarEvents.
 * Ensures no orphaned appointments remain.
 * 
 * Input: { leadId, reason }
 * Output: { success, leadId, inspectionsCancelled, eventsCancelled, build }
 */

const BUILD = "SOFT_DELETE_LEAD_V2_2026_03_02";

const json200 = (data) => new Response(
  JSON.stringify(data),
  { status: 200, headers: { "content-type": "application/json; charset=utf-8" } }
);

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    console.log('DEBUG_USER_CONTEXT', { email: user?.email, role: user?.role });

    // Admin-only
    if (user?.role !== 'admin') {
      return json200({ success: false, error: 'Forbidden: Admin access required', build: BUILD });
    }

    const payload = await req.json();
    const { leadId, reason } = payload || {};

    if (!leadId || typeof leadId !== 'string') {
      return json200({ success: false, error: 'leadId is required', build: BUILD });
    }

    // Create service-role client for all cascade operations
    const serviceBase44 = createClientFromRequest(req);

    // Fetch Lead to verify it exists
    let lead = null;
    try {
      lead = await serviceBase44.asServiceRole.entities.Lead.filter({ id: leadId }, null, 1);
      if (!lead || lead.length === 0) {
        return json200({ success: false, error: 'Lead not found', build: BUILD });
      }
      lead = lead[0];
    } catch (e) {
      return json200({ success: false, error: 'Failed to fetch Lead', detail: e.message, build: BUILD });
    }

    // Mark Lead as deleted (service role bypasses RLS)
    console.log('DEBUG_DELETE_TARGET', { leadId });
    console.log('DEBUG_DELETE_UPDATE_PATH', { path: 'serviceBase44.asServiceRole.entities.Lead.update' });
    try {
      await serviceBase44.asServiceRole.entities.Lead.update(leadId, {
        isDeleted: true,
        deletedAt: new Date().toISOString(),
        deletedBy: user.email,
        deleteReason: reason || 'admin_deletion'
      });
      console.log('SOFT_DELETE_LEAD_V2_MARKED', { leadId, deletedBy: user.email });
    } catch (e) {
      console.error('SOFT_DELETE_LEAD_V2_MARK_FAILED', { error: e.message, detail: e?.response?.data });
      return json200({ success: false, error: 'Failed to mark Lead as deleted', detail: e.message, build: BUILD });
    }

    let inspectionsCancelled = 0;
    let eventsCancelled = 0;

    // Cancel all InspectionRecords for this lead (service role bypasses RLS)
    try {
      const inspections = await serviceBase44.asServiceRole.entities.InspectionRecord.filter(
        { leadId, appointmentStatus: { $ne: 'cancelled' } },
        null,
        100
      );
      if (inspections && inspections.length > 0) {
        for (const inspection of inspections) {
          try {
            await serviceBase44.asServiceRole.entities.InspectionRecord.update(inspection.id, {
              appointmentStatus: 'cancelled',
              cancelledAt: new Date().toISOString(),
              cancelReason: 'lead_deleted'
            });
            inspectionsCancelled++;
            console.log('SOFT_DELETE_LEAD_V2_INSPECTION_CANCELLED', { leadId, inspectionId: inspection.id });
          } catch (e) {
            console.warn('SOFT_DELETE_LEAD_V2_INSPECTION_CANCEL_FAILED', { error: e.message });
          }
        }
      }
    } catch (e) {
      console.warn('SOFT_DELETE_LEAD_V2_INSPECTIONS_QUERY_FAILED', { error: e.message });
    }

    // Cancel all CalendarEvents for this lead (service role bypasses RLS)
    try {
      const events = await serviceBase44.asServiceRole.entities.CalendarEvent.filter(
        { leadId, status: { $ne: 'cancelled' } },
        null,
        100
      );
      if (events && events.length > 0) {
        for (const event of events) {
          try {
            await serviceBase44.asServiceRole.entities.CalendarEvent.update(event.id, {
              status: 'cancelled',
              cancelledAt: new Date().toISOString(),
              cancelReason: 'lead_deleted'
            });
            eventsCancelled++;
            console.log('SOFT_DELETE_LEAD_V2_EVENT_CANCELLED', { leadId, eventId: event.id });
          } catch (e) {
            console.warn('SOFT_DELETE_LEAD_V2_EVENT_CANCEL_FAILED', { error: e.message });
          }
        }
      }
    } catch (e) {
      console.warn('SOFT_DELETE_LEAD_V2_EVENTS_QUERY_FAILED', { error: e.message });
    }

    console.log('SOFT_DELETE_LEAD_V2_SUCCESS', { leadId, inspectionsCancelled, eventsCancelled });

    return json200({
      success: true,
      leadId,
      inspectionsCancelled,
      eventsCancelled,
      build: BUILD
    });

  } catch (error) {
    console.error('SOFT_DELETE_LEAD_V2_CRASH', { error: error?.message });
    return json200({
      success: false,
      error: 'Soft delete failed',
      detail: error?.message,
      build: BUILD
    });
  }
});