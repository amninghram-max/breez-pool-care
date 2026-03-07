import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

/**
 * adminRescheduleInspection
 *
 * Admin-only direct reschedule for a single inspection event.
 * Syncs the repo-authoritative inspection scheduling entities in order:
 *   1. InspectionRecord (authoritative)
 *   2. CalendarEvent (projection)
 *   3. Lead (mirror fields)
 *
 * V1 scope:
 *   - backend only, no UI
 *   - no notifications
 *   - no RescheduleRequest creation
 *   - admin-only
 *
 * Input: { eventId, scheduledDate, startTime, timeWindow, reason? }
 * Output: { success, eventId, oldDate, newDate, build }
 */

const BUILD = 'ADMIN_RESCHEDULE_INSPECTION_V1_2026_03_07';

const json200 = (data) =>
  new Response(JSON.stringify(data), {
    status: 200,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });

const jsonErr = (status, data) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // --- AUTH: admin-only (mirrors approveRescheduleV2 line 49) ---
    const user = await base44.auth.me();
    if (user?.role !== 'admin') {
      return jsonErr(403, { success: false, error: 'Forbidden: Admin access required', build: BUILD });
    }

    const payload = await req.json();
    const { eventId, scheduledDate, startTime, timeWindow, reason } = payload || {};

    // --- INPUT VALIDATION ---
    if (!eventId || typeof eventId !== 'string') {
      return jsonErr(400, { success: false, error: 'eventId is required', build: BUILD });
    }
    if (!scheduledDate || !/^\d{4}-\d{2}-\d{2}$/.test(scheduledDate)) {
      return jsonErr(400, { success: false, error: 'scheduledDate is required (YYYY-MM-DD)', build: BUILD });
    }
    if (!startTime || !/^\d{2}:\d{2}$/.test(startTime)) {
      return jsonErr(400, { success: false, error: 'startTime is required (HH:MM)', build: BUILD });
    }
    if (!timeWindow || typeof timeWindow !== 'string') {
      return jsonErr(400, { success: false, error: 'timeWindow is required', build: BUILD });
    }

    // --- LOOKUP 1: CalendarEvent (entry point, mirrors all admin helpers) ---
    let event;
    try {
      event = await base44.asServiceRole.entities.CalendarEvent.get(eventId);
    } catch (e) {
      console.error('[adminRescheduleInspection] EVENT_FETCH_FAILED', { eventId, error: e.message });
      return jsonErr(404, { success: false, error: 'Event not found', build: BUILD });
    }

    if (!event) {
      return jsonErr(404, { success: false, error: 'Event not found', build: BUILD });
    }

    // --- INSPECTION TYPE GATE (mirrors updateCalendarEventAdmin guard, inverted) ---
    if (event.eventType !== 'inspection') {
      console.warn('[adminRescheduleInspection] NOT_INSPECTION', { eventId, eventType: event.eventType });
      return jsonErr(422, {
        success: false,
        error: 'This helper only supports inspection event types.',
        code: 'NOT_INSPECTION_EVENT',
        build: BUILD,
      });
    }

    const { leadId } = event;

    // --- LOOKUP 2: InspectionRecord via calendarEventId (mirrors bulkReschedule lines 207-212) ---
    let inspection = null;
    try {
      const inspections = await base44.asServiceRole.entities.InspectionRecord.filter(
        { calendarEventId: eventId },
        '-created_date',
        1
      );
      inspection = inspections?.[0] || null;
    } catch (e) {
      console.error('[adminRescheduleInspection] INSPECTION_FETCH_FAILED', { eventId, error: e.message });
    }

    if (!inspection) {
      console.warn('[adminRescheduleInspection] INSPECTION_RECORD_MISSING', { eventId });
      return jsonErr(422, {
        success: false,
        error: 'No linked InspectionRecord found for this calendar event.',
        code: 'INSPECTION_RECORD_MISSING',
        build: BUILD,
      });
    }

    // --- LOOKUP 3: Lead via event.leadId (mirrors approveRescheduleV2 lines 144-154) ---
    let lead = null;
    try {
      const leads = await base44.asServiceRole.entities.Lead.filter({ id: leadId }, null, 1);
      lead = leads?.[0] || null;
    } catch (e) {
      console.error('[adminRescheduleInspection] LEAD_FETCH_FAILED', { leadId, error: e.message });
    }

    if (!lead) {
      return jsonErr(422, {
        success: false,
        error: 'Linked Lead not found.',
        code: 'LEAD_NOT_FOUND',
        build: BUILD,
      });
    }

    const oldDate = inspection.scheduledDate || event.scheduledDate;
    const oldStartTime = inspection.startTime || event.startTime;
    const oldTimeWindow = inspection.timeWindow || event.timeWindow;

    // --- NO-OP DETECTION (mirrors updateCalendarEventAdmin lines 77-78) ---
    const dateUnchanged = scheduledDate === oldDate;
    const timeUnchanged = startTime === oldStartTime;
    const windowUnchanged = timeWindow === oldTimeWindow;

    if (dateUnchanged && timeUnchanged && windowUnchanged) {
      console.log('[adminRescheduleInspection] NO_OP', { eventId, scheduledDate, startTime, timeWindow });
      return json200({
        success: false,
        code: 'NO_OP',
        error: 'Requested values are identical to current values. No changes applied.',
        eventId,
        oldDate,
        build: BUILD,
      });
    }

    const rescheduleReason = reason?.trim() || 'admin_reschedule';
    // ISO datetime for confirmedInspectionDate — mirrors approveRescheduleV2 line 149
    const confirmedInspectionDate = `${scheduledDate}T${startTime}:00.000Z`;

    console.log('[adminRescheduleInspection] WRITE_START', {
      eventId,
      inspectionId: inspection.id,
      leadId,
      oldDate,
      scheduledDate,
      startTime,
    });

    // --- WRITE 1: InspectionRecord (AUTHORITATIVE — mirrors approveRescheduleV2 lines 115-120) ---
    try {
      await base44.asServiceRole.entities.InspectionRecord.update(inspection.id, {
        scheduledDate,
        startTime,
        timeWindow,
        appointmentStatus: 'scheduled',
      });
      console.log('[adminRescheduleInspection] INSPECTION_UPDATED', { inspectionId: inspection.id });
    } catch (e) {
      console.error('[adminRescheduleInspection] INSPECTION_UPDATE_FAILED', { error: e.message });
      return jsonErr(500, {
        success: false,
        error: 'Failed to update InspectionRecord.',
        detail: e.message,
        build: BUILD,
      });
    }

    // --- WRITE 2: CalendarEvent (PROJECTION — mirrors approveRescheduleV2 lines 130-137) ---
    const calendarUpdates = {
      scheduledDate,
      startTime,
      timeWindow,
      status: 'scheduled',
      rescheduleReason,
    };

    // Preserve originalScheduledDate when date actually changes (mirrors bulkReschedule line 422)
    if (!dateUnchanged) {
      calendarUpdates.originalScheduledDate = oldDate;
    }

    try {
      await base44.asServiceRole.entities.CalendarEvent.update(eventId, calendarUpdates);
      console.log('[adminRescheduleInspection] CALENDAR_UPDATED', { eventId });
    } catch (e) {
      console.error('[adminRescheduleInspection] CALENDAR_UPDATE_FAILED', { error: e.message });
      // InspectionRecord was already written — log but do not silently swallow
      return jsonErr(500, {
        success: false,
        error: 'Failed to update CalendarEvent. InspectionRecord may already be updated.',
        detail: e.message,
        build: BUILD,
      });
    }

    // --- WRITE 3: Lead mirror fields (mirrors approveRescheduleV2 lines 146-150) ---
    try {
      await base44.asServiceRole.entities.Lead.update(leadId, {
        requestedInspectionDate: scheduledDate,
        requestedInspectionTime: startTime,
        confirmedInspectionDate,
      });
      console.log('[adminRescheduleInspection] LEAD_SYNCED', { leadId });
    } catch (e) {
      // Non-fatal: mirrors approveRescheduleV2 pattern where Lead sync failure is warned, not fatal
      console.warn('[adminRescheduleInspection] LEAD_SYNC_FAILED', { leadId, error: e.message });
    }

    console.log('[adminRescheduleInspection] SUCCESS', { eventId, oldDate, scheduledDate });

    return json200({
      success: true,
      eventId,
      inspectionId: inspection.id,
      leadId,
      oldDate,
      newDate: scheduledDate,
      build: BUILD,
    });

  } catch (error) {
    console.error('[adminRescheduleInspection] CRASH', { error: error?.message });
    return jsonErr(500, {
      success: false,
      error: 'Unexpected error during admin inspection reschedule.',
      detail: error?.message,
      build: BUILD,
    });
  }
});