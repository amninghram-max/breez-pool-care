import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

/**
 * handleAccessReschedule
 * 
 * Technician-initiated automatic reschedule after access issue confirmation.
 * Computes next service day (skipping Sunday), updates CalendarEvent, notifies customer.
 * 
 * Input: { eventId, accessIssueReason }
 * Output: { success, eventId, newScheduledDate, message, build }
 */

const BUILD = "HANDLE_ACCESS_RESCHEDULE_V1_2026_03_06";

const json200 = (data) => new Response(
  JSON.stringify(data),
  { status: 200, headers: { "content-type": "application/json; charset=utf-8" } }
);

// Compute next service date: tomorrow, skip if Sunday, land on Monday
function computeNextServiceDate(currentDate) {
  const date = new Date(currentDate);
  date.setDate(date.getDate() + 1); // Next day
  
  // If Sunday (day 0), skip to Monday
  while (date.getDay() === 0) {
    date.setDate(date.getDate() + 1);
  }
  
  // Return YYYY-MM-DD format
  return date.toISOString().split('T')[0];
}

Deno.serve(async (req) => {
  try {
    console.log('[handleAccessReschedule] START');
    const base44 = createClientFromRequest(req);

    // Auth: technician/staff/admin only
    console.log('[handleAccessReschedule] AUTH_START');
    const user = await base44.auth.me();
    console.log('[handleAccessReschedule] AUTH_DONE', { userEmail: user?.email, userRole: user?.role });

    if (!user || !['admin', 'staff', 'technician'].includes(user.role)) {
      return json200({
        success: false,
        error: 'Forbidden: technician/staff/admin access required',
        build: BUILD
      });
    }

    // Parse payload
    console.log('[handleAccessReschedule] PAYLOAD_PARSE_START');
    const payload = await req.json();
    const { eventId, accessIssueReason } = payload || {};
    console.log('[handleAccessReschedule] PAYLOAD_PARSE_DONE', { eventId, accessIssueReason });

    if (!eventId || typeof eventId !== 'string') {
      return json200({
        success: false,
        error: 'eventId is required',
        build: BUILD
      });
    }

    // Fetch current event
    console.log('[handleAccessReschedule] EVENT_FETCH_START', { eventId });
    let event = null;
    try {
      event = await base44.entities.CalendarEvent.get(eventId);
    } catch (e) {
      console.error('[handleAccessReschedule] EVENT_FETCH_FAILED', { error: e.message });
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

    console.log('[handleAccessReschedule] EVENT_FETCH_SUCCESS', {
      eventId,
      currentDate: event.scheduledDate,
      currentTime: event.startTime
    });

    // Compute next service date (skip Sunday)
    console.log('[handleAccessReschedule] DATE_COMPUTATION_START', { currentDate: event.scheduledDate });
    const newScheduledDate = computeNextServiceDate(event.scheduledDate);
    console.log('[handleAccessReschedule] DATE_COMPUTATION_DONE', { newDate: newScheduledDate });

    // Update CalendarEvent with service role
    console.log('[handleAccessReschedule] EVENT_UPDATE_START', { eventId, newDate: newScheduledDate });
    try {
      await base44.asServiceRole.entities.CalendarEvent.update(eventId, {
        originalScheduledDate: event.originalScheduledDate || event.scheduledDate, // Preserve original
        scheduledDate: newScheduledDate,
        rescheduleReason: 'access_issue',
        status: 'scheduled',
        // Keep couldNotAccessReason intact
      });
      console.log('[handleAccessReschedule] EVENT_UPDATE_SUCCESS', { eventId, newDate: newScheduledDate });
    } catch (e) {
      console.error('[handleAccessReschedule] EVENT_UPDATE_FAILED', { error: e.message });
      return json200({
        success: false,
        error: 'Failed to update event',
        detail: e.message,
        build: BUILD
      });
    }

    // Send customer notification
    console.log('[handleAccessReschedule] NOTIFICATION_START', { leadId: event.leadId, eventId });
    try {
      await base44.functions.invoke('sendScheduleNotification', {
        leadId: event.leadId,
        eventId: event.id,
        notificationType: 'reschedule',
        metadata: {
          accessIssueReason: accessIssueReason || null,
          originalDate: event.scheduledDate,
          newDate: newScheduledDate
        }
      });
      console.log('[handleAccessReschedule] NOTIFICATION_SENT', { leadId: event.leadId });
    } catch (notifyError) {
      console.error('[handleAccessReschedule] NOTIFICATION_FAILED', { error: notifyError?.message });
      // Non-fatal: event was updated, notification failed
    }

    console.log('[handleAccessReschedule] RETURN_SUCCESS');
    return json200({
      success: true,
      eventId,
      newScheduledDate,
      message: `Visit rescheduled to ${newScheduledDate}. Customer notified.`,
      build: BUILD
    });

  } catch (error) {
    console.error('[handleAccessReschedule] CRASH', { error: error?.message });
    return json200({
      success: false,
      error: 'Reschedule failed',
      detail: error?.message,
      build: BUILD
    });
  }
});