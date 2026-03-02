import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * softDeleteLeadV1
 * 
 * Soft-deletes a Lead and cancels its associated CalendarEvent.
 * 
 * Input: { leadId, reason }
 * Output: { success, leadId, eventCancelled, build }
 */

const BUILD = "SOFT_DELETE_LEAD_V1_2026_03_02";

const json200 = (data) => new Response(
  JSON.stringify(data),
  { status: 200, headers: { "content-type": "application/json; charset=utf-8" } }
);

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

    const payload = await req.json();
    const { leadId, reason } = payload || {};

    if (!leadId || typeof leadId !== 'string') {
      return json200({
        success: false,
        error: 'leadId is required',
        build: BUILD
      });
    }

    // Fetch Lead to get inspectionEventId and verify it exists
    let lead = null;
    try {
      lead = await base44.asServiceRole.entities.Lead.filter({ id: leadId }, null, 1);
      if (!lead || lead.length === 0) {
        return json200({
          success: false,
          error: 'Lead not found',
          build: BUILD
        });
      }
      lead = lead[0];
    } catch (e) {
      return json200({
        success: false,
        error: 'Failed to fetch Lead',
        detail: e.message,
        build: BUILD
      });
    }

    // Mark Lead as deleted
    try {
      await base44.asServiceRole.entities.Lead.update(leadId, {
        isDeleted: true,
        deletedAt: new Date().toISOString(),
        deletedBy: user.email,
        deleteReason: reason || 'admin_deletion'
      });
      console.log('SOFT_DELETE_LEAD_V1_MARKED', { leadId, deletedBy: user.email });
    } catch (e) {
      console.error('SOFT_DELETE_LEAD_V1_MARK_FAILED', { error: e.message });
      return json200({
        success: false,
        error: 'Failed to mark Lead as deleted',
        detail: e.message,
        build: BUILD
      });
    }

    // If Lead has inspectionEventId, cancel that CalendarEvent
    let eventCancelled = false;
    if (lead.inspectionEventId) {
      try {
        await base44.asServiceRole.entities.CalendarEvent.update(lead.inspectionEventId, {
          status: 'cancelled',
          cancelledAt: new Date().toISOString(),
          cancelReason: 'lead_deleted'
        });
        eventCancelled = true;
        console.log('SOFT_DELETE_LEAD_V1_EVENT_CANCELLED', { leadId, eventId: lead.inspectionEventId });
      } catch (e) {
        console.warn('SOFT_DELETE_LEAD_V1_EVENT_CANCEL_FAILED', { error: e.message });
        // Non-fatal: continue even if event cancel fails
      }
    }

    return json200({
      success: true,
      leadId,
      eventCancelled,
      build: BUILD
    });

  } catch (error) {
    console.error('SOFT_DELETE_LEAD_V1_CRASH', { error: error?.message });
    return json200({
      success: false,
      error: 'Soft delete failed',
      detail: error?.message,
      build: BUILD
    });
  }
});