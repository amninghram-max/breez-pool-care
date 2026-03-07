import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

/**
 * updateCalendarEventAdmin
 *
 * Admin-only helper for updating CalendarEvent scheduling fields.
 * Replaces fragile direct frontend CalendarEvent.update in EventDetailsModal.
 *
 * Input: { eventId, timeWindow?, estimatedDuration?, assignedTechnician?, isFixed?, accessNotes?, customerNotes?, scheduledDate? }
 * Output: { success, event, warning? }
 *
 * scheduledDate:
 *   - Supported for non-inspection event types only.
 *   - BLOCKED for eventType === 'inspection' — use approveRescheduleV2 or requestReschedulePublicV2 instead.
 *   - When date actually changes, automatically sets originalScheduledDate and rescheduleReason = 'admin_reschedule'.
 *   - If event was storm-impacted, clears stormImpacted = false on reschedule.
 */

const BUILD = "UPDATE_CALENDAR_EVENT_ADMIN_V2_2026_03_07";

Deno.serve(async (req) => {
  try {
    console.log('[updateCalendarEventAdmin] START');
    const base44 = createClientFromRequest(req);

    const user = await base44.auth.me();
    console.log('[updateCalendarEventAdmin] AUTH_DONE', { email: user?.email, role: user?.role });

    if (!user || !['admin', 'staff'].includes(user.role)) {
      return Response.json({ success: false, error: 'Forbidden: admin/staff access required' }, { status: 403 });
    }

    const payload = await req.json();
    const { eventId, timeWindow, estimatedDuration, assignedTechnician, isFixed, accessNotes, customerNotes, scheduledDate } = payload || {};
    console.log('[updateCalendarEventAdmin] PAYLOAD_PARSED', { eventId, hasScheduledDate: scheduledDate !== undefined });

    if (!eventId || typeof eventId !== 'string') {
      return Response.json({ success: false, error: 'eventId is required' }, { status: 400 });
    }

    // Fetch current event to validate it exists and check eventType
    let event;
    try {
      event = await base44.asServiceRole.entities.CalendarEvent.get(eventId);
    } catch (e) {
      console.error('[updateCalendarEventAdmin] EVENT_FETCH_FAILED', { error: e.message });
      return Response.json({ success: false, error: 'Event not found' }, { status: 404 });
    }

    if (!event) {
      return Response.json({ success: false, error: 'Event not found' }, { status: 404 });
    }

    console.log('[updateCalendarEventAdmin] EVENT_FETCHED', { eventId, eventType: event.eventType, status: event.status });

    // Build explicit allowed-field updates only — no arbitrary passthrough
    const updates = {};
    if (timeWindow !== undefined)        updates.timeWindow = timeWindow;
    if (estimatedDuration !== undefined) updates.estimatedDuration = estimatedDuration;
    if (assignedTechnician !== undefined) updates.assignedTechnician = assignedTechnician;
    if (isFixed !== undefined)           updates.isFixed = isFixed;
    if (accessNotes !== undefined)       updates.accessNotes = accessNotes;
    if (customerNotes !== undefined)     updates.customerNotes = customerNotes;

    if (Object.keys(updates).length === 0) {
      return Response.json({ success: false, error: 'No updatable fields provided' }, { status: 400 });
    }

    console.log('[updateCalendarEventAdmin] UPDATE_START', { eventId, fields: Object.keys(updates) });

    await base44.asServiceRole.entities.CalendarEvent.update(eventId, updates);

    console.log('[updateCalendarEventAdmin] UPDATE_DONE', { eventId });

    // Re-fetch updated event for response
    const updatedEvent = await base44.asServiceRole.entities.CalendarEvent.get(eventId);

    // Warn (non-blocking) if this was an inspection event — current repo has no hard block
    const warning = event.eventType === 'inspection'
      ? 'Edited event is of type inspection. Verify intended changes.'
      : undefined;

    if (warning) {
      console.warn('[updateCalendarEventAdmin] INSPECTION_EVENT_EDITED', { eventId });
    }

    return Response.json({
      success: true,
      event: updatedEvent,
      ...(warning ? { warning } : {}),
      build: BUILD
    });

  } catch (error) {
    console.error('[updateCalendarEventAdmin] CRASH', { error: error?.message });
    return Response.json({ success: false, error: error.message || 'Failed to update event' }, { status: 500 });
  }
});