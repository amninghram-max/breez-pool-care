import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

/**
 * bulkUpdateServiceEvents
 *
 * Bulk technician reassignment for eligible service events on a single day.
 * Validates all events before any writes. If any write fails, entire operation fails.
 * NOTE: True atomicity (all-or-nothing) is not guaranteed at the database level in this runtime.
 * Writes are sequential; if a write fails mid-loop, earlier writes have already committed.
 * For maximum safety, this helper validates all conditions before starting writes
 * and fails the entire operation on first write error.
 *
 * Input: { date, eventIds[], assignedTechnician }
 * Output: { success, updatedCount, build } or { success: false, error, code: 'BULK_UPDATE_FAILED' }
 *
 * Eligible events: eventType === 'service' && isFixed !== true && status === 'scheduled'
 */

const BUILD = "BULK_UPDATE_SERVICE_EVENTS_V1_2026_03_07";

Deno.serve(async (req) => {
  try {
    console.log('[bulkUpdateServiceEvents] START');
    const base44 = createClientFromRequest(req);

    const user = await base44.auth.me();
    console.log('[bulkUpdateServiceEvents] AUTH_DONE', { email: user?.email, role: user?.role });

    if (!user || !['admin', 'staff'].includes(user.role)) {
      return Response.json({ success: false, error: 'Forbidden: admin/staff access required' }, { status: 403 });
    }

    const payload = await req.json();
    const { date, eventIds, assignedTechnician } = payload || {};
    console.log('[bulkUpdateServiceEvents] PAYLOAD_PARSED', { date, eventIdCount: eventIds?.length });

    // --- Input validation ---
    if (!date || typeof date !== 'string') {
      return Response.json({ success: false, error: 'date is required and must be a string' }, { status: 400 });
    }
    if (!Array.isArray(eventIds) || eventIds.length === 0) {
      return Response.json({ success: false, error: 'eventIds must be a non-empty array' }, { status: 400 });
    }
    if (!assignedTechnician || typeof assignedTechnician !== 'string') {
      return Response.json({ success: false, error: 'assignedTechnician is required and must be a string' }, { status: 400 });
    }

    // --- Fetch all events by IDs ---
    let events = [];
    const notFound = [];
    for (const eventId of eventIds) {
      try {
        const event = await base44.asServiceRole.entities.CalendarEvent.get(eventId);
        if (event) {
          events.push(event);
        } else {
          notFound.push(eventId);
        }
      } catch (e) {
        notFound.push(eventId);
      }
    }

    if (notFound.length > 0) {
      console.warn('[bulkUpdateServiceEvents] EVENTS_NOT_FOUND', { notFound });
      return Response.json({
        success: false,
        error: 'Some event IDs were not found',
        code: 'EVENTS_NOT_FOUND',
        notFound,
      }, { status: 404 });
    }

    // --- Validate all events belong to provided date ---
    const wrongDate = events.filter(e => e.scheduledDate !== date);
    if (wrongDate.length > 0) {
      console.warn('[bulkUpdateServiceEvents] WRONG_DATE', { wrongDate: wrongDate.map(e => e.id) });
      return Response.json({
        success: false,
        error: 'Some events do not belong to the specified date',
        code: 'WRONG_DATE',
      }, { status: 422 });
    }

    // --- Validate all events are eligible (service + not fixed + scheduled) ---
    const ineligible = events.filter(e =>
      e.eventType !== 'service' ||
      e.isFixed === true ||
      e.status !== 'scheduled'
    );
    if (ineligible.length > 0) {
      console.warn('[bulkUpdateServiceEvents] INELIGIBLE_EVENTS', { ineligible: ineligible.map(e => e.id) });
      return Response.json({
        success: false,
        error: 'Some events are not eligible (must be service, not fixed, and scheduled)',
        code: 'INELIGIBLE_EVENTS',
      }, { status: 422 });
    }

    // --- Conflict check: target technician must not have other service events on this date ---
    const conflicting = await base44.asServiceRole.entities.CalendarEvent.filter({
      scheduledDate: date,
      assignedTechnician: assignedTechnician,
      status: 'scheduled',
      eventType: 'service',
    });

    const selectedIds = new Set(eventIds);
    const hasConflict = conflicting && conflicting.some(e => !selectedIds.has(e.id));

    if (hasConflict) {
      console.warn('[bulkUpdateServiceEvents] TECHNICIAN_CONFLICT', {
        date,
        assignedTechnician,
        conflictCount: conflicting.filter(e => !selectedIds.has(e.id)).length,
      });
      return Response.json({
        success: false,
        error: 'Target technician already has a scheduled service event on this date that is not in the selected set',
        code: 'TECHNICIAN_CONFLICT',
      }, { status: 409 });
    }

    // --- Write phase: assign technician to all selected events ---
    // Validation is complete; now attempt all writes.
    // If any write fails, the entire operation fails (fail-fast pattern).
    console.log('[bulkUpdateServiceEvents] UPDATING', { date, assignedTechnician, count: eventIds.length });

    try {
      for (const eventId of eventIds) {
        await base44.asServiceRole.entities.CalendarEvent.update(eventId, {
          assignedTechnician,
        });
      }
    } catch (writeError) {
      console.error('[bulkUpdateServiceEvents] WRITE_FAILED', { error: writeError?.message });
      return Response.json({
        success: false,
        error: writeError?.message || 'Failed to update events during bulk assignment',
        code: 'BULK_UPDATE_FAILED',
      }, { status: 500 });
    }

    console.log('[bulkUpdateServiceEvents] DONE', { updatedCount: eventIds.length });

    return Response.json({
      success: true,
      updatedCount: eventIds.length,
      build: BUILD,
    });

  } catch (error) {
    console.error('[bulkUpdateServiceEvents] CRASH', { error: error?.message });
    return Response.json({ success: false, error: error.message || 'Failed to update events' }, { status: 500 });
  }
});