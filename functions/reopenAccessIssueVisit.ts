import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

/**
 * reopenAccessIssueVisit
 *
 * Technician/staff/admin action to reopen a visit that was rescheduled due to access issue.
 * Transitions status from 'scheduled' back to 'arrived' while preserving audit trail.
 *
 * Input: { eventId }
 * Output: { success, eventId, status, message, build }
 */

const BUILD = "REOPEN_ACCESS_ISSUE_VISIT_V1_2026_03_06";

const json200 = (data) => new Response(
  JSON.stringify(data),
  { status: 200, headers: { "content-type": "application/json; charset=utf-8" } }
);

Deno.serve(async (req) => {
  try {
    console.log('[reopenAccessIssueVisit] START');
    const base44 = createClientFromRequest(req);

    // Auth: technician/staff/admin only
    console.log('[reopenAccessIssueVisit] AUTH_START');
    const user = await base44.auth.me();
    console.log('[reopenAccessIssueVisit] AUTH_DONE', { userEmail: user?.email, userRole: user?.role });

    if (!user || !['admin', 'staff', 'technician'].includes(user.role)) {
      return json200({
        success: false,
        error: 'Forbidden: technician/staff/admin access required',
        build: BUILD
      });
    }

    // Parse payload
    console.log('[reopenAccessIssueVisit] PAYLOAD_PARSE_START');
    const payload = await req.json();
    const { eventId } = payload || {};
    console.log('[reopenAccessIssueVisit] PAYLOAD_PARSE_DONE', { eventId });

    if (!eventId || typeof eventId !== 'string') {
      return json200({
        success: false,
        error: 'eventId is required',
        build: BUILD
      });
    }

    // Fetch current event
    console.log('[reopenAccessIssueVisit] EVENT_FETCH_START', { eventId });
    let event = null;
    try {
      event = await base44.entities.CalendarEvent.get(eventId);
    } catch (e) {
      console.error('[reopenAccessIssueVisit] EVENT_FETCH_FAILED', { error: e.message });
      return json200({
        success: false,
        error: 'Event not found',
        build: BUILD
      });
    }

    if (!event) {
      return json200({
        success: false,
        error: 'Event not found',
        build: BUILD
      });
    }

    console.log('[reopenAccessIssueVisit] EVENT_FETCH_SUCCESS', {
      eventId,
      currentStatus: event.status,
      rescheduleReason: event.rescheduleReason
    });

    // Validate: only allow reopen for access-issue reschedules in scheduled state
    console.log('[reopenAccessIssueVisit] VALIDATION_START');
    if (event.rescheduleReason !== 'access_issue') {
      console.error('[reopenAccessIssueVisit] VALIDATION_FAILED: not access_issue', { rescheduleReason: event.rescheduleReason });
      return json200({
        success: false,
        error: 'Event must have rescheduleReason === "access_issue" to reopen',
        build: BUILD
      });
    }

    if (event.status !== 'scheduled') {
      console.error('[reopenAccessIssueVisit] VALIDATION_FAILED: status not scheduled', { status: event.status });
      return json200({
        success: false,
        error: `Event status must be "scheduled" to reopen, current status: "${event.status}"`,
        build: BUILD
      });
    }

    console.log('[reopenAccessIssueVisit] VALIDATION_SUCCESS');

    // Update CalendarEvent with service role
    console.log('[reopenAccessIssueVisit] EVENT_UPDATE_START', { eventId, newStatus: 'arrived' });
    try {
      await base44.asServiceRole.entities.CalendarEvent.update(eventId, {
        status: 'arrived',
        // Preserve all audit/history fields
        // couldNotAccessReason preserved
        // rescheduleReason preserved
        // originalScheduledDate preserved
        // scheduledDate preserved
      });
      console.log('[reopenAccessIssueVisit] EVENT_UPDATE_SUCCESS', { eventId, newStatus: 'arrived' });
    } catch (e) {
      console.error('[reopenAccessIssueVisit] EVENT_UPDATE_FAILED', { error: e.message });
      return json200({
        success: false,
        error: 'Failed to update event',
        detail: e.message,
        build: BUILD
      });
    }

    console.log('[reopenAccessIssueVisit] RETURN_SUCCESS');
    return json200({
      success: true,
      eventId,
      status: 'arrived',
      message: 'Visit reopened — technician can now continue service.',
      build: BUILD
    });

  } catch (error) {
    console.error('[reopenAccessIssueVisit] CRASH', { error: error?.message });
    return json200({
      success: false,
      error: 'Reopen failed',
      detail: error?.message,
      build: BUILD
    });
  }
});