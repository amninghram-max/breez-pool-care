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

    // --- DATE MOVE GUARD: block inspection scheduledDate changes through this helper ---
    if (scheduledDate !== undefined && event.eventType === 'inspection') {
      console.warn('[updateCalendarEventAdmin] INSPECTION_DATE_MOVE_BLOCKED', { eventId, scheduledDate });
      return Response.json({
        success: false,
        error: 'Inspection date moves are not supported through this helper. Use approveRescheduleV2 or requestReschedulePublicV2 instead.',
        code: 'INSPECTION_DATE_MOVE_NOT_SUPPORTED'
      }, { status: 422 });
    }

    // --- UPDATE CONFLICT CHECK: block same-date same-technician double-booking for service events ---
    if (event.eventType !== 'inspection') {
      const effectiveScheduledDate = (scheduledDate !== undefined) ? scheduledDate : event.scheduledDate;
      const effectiveAssignedTechnician = (assignedTechnician !== undefined) ? assignedTechnician : event.assignedTechnician;

      const dateChanging = scheduledDate !== undefined && scheduledDate !== event.scheduledDate;
      const techChanging = assignedTechnician !== undefined && assignedTechnician !== event.assignedTechnician;

      if (dateChanging || techChanging) {
        const conflicting = await base44.asServiceRole.entities.CalendarEvent.filter({
          scheduledDate: effectiveScheduledDate,
          assignedTechnician: effectiveAssignedTechnician,
          status: 'scheduled',
          eventType: 'service',
        });

        const hasConflict = conflicting && conflicting.some(e => e.id !== eventId);

        if (hasConflict) {
          console.warn('[updateCalendarEventAdmin] TECHNICIAN_CONFLICT', {
            eventId,
            effectiveScheduledDate,
            effectiveAssignedTechnician,
          });
          return Response.json({
            success: false,
            error: 'Technician already has a scheduled service event on this date. Please select a different date or technician.',
            code: 'TECHNICIAN_CONFLICT',
          }, { status: 409 });
        }
      }
    }

    // Build explicit allowed-field updates only — no arbitrary passthrough
    const updates = {};
    if (timeWindow !== undefined)         updates.timeWindow = timeWindow;
    if (estimatedDuration !== undefined)  updates.estimatedDuration = estimatedDuration;
    if (assignedTechnician !== undefined) updates.assignedTechnician = assignedTechnician;
    if (isFixed !== undefined)            updates.isFixed = isFixed;
    if (accessNotes !== undefined)        updates.accessNotes = accessNotes;
    if (customerNotes !== undefined)      updates.customerNotes = customerNotes;

    // Service-event date move — only apply when date is actually changing
    if (scheduledDate !== undefined) {
      const dateActuallyChanging = scheduledDate !== event.scheduledDate;
      if (dateActuallyChanging) {
        updates.scheduledDate = scheduledDate;
        updates.originalScheduledDate = event.scheduledDate;
        updates.rescheduleReason = 'admin_reschedule';
        updates.status = 'scheduled';
        if (event.stormImpacted) {
          updates.stormImpacted = false;
        }
        console.log('[updateCalendarEventAdmin] SERVICE_DATE_MOVE', {
          eventId,
          from: event.scheduledDate,
          to: scheduledDate,
          wasStormImpacted: !!event.stormImpacted
        });
      } else {
        console.log('[updateCalendarEventAdmin] DATE_NO_OP', { eventId, scheduledDate });
      }
    }

    if (Object.keys(updates).length === 0) {
      return Response.json({ success: false, error: 'No updatable fields provided' }, { status: 400 });
    }

    console.log('[updateCalendarEventAdmin] UPDATE_START', { eventId, fields: Object.keys(updates) });

    await base44.asServiceRole.entities.CalendarEvent.update(eventId, updates);

    console.log('[updateCalendarEventAdmin] UPDATE_DONE', { eventId });

    // Re-fetch updated event for response
    const updatedEvent = await base44.asServiceRole.entities.CalendarEvent.get(eventId);

    // Retain non-blocking inspection warning for non-date inspection edits
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