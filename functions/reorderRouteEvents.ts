import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

/**
 * reorderRouteEvents
 *
 * Persists a manually-specified route order for eligible service events
 * within a single technician's column on a single day.
 *
 * Payload: { date, technician, orderedEventIds: string[] }
 * Output:  { success, updatedCount }
 *
 * Eligibility (matches DayView isDraggable):
 *   - eventType === 'service'
 *   - isFixed !== true
 *   - status === 'scheduled'
 *
 * Non-eligible events (inspections, cleanup, green_recovery, fixed) are
 * not mutated regardless of whether their IDs appear in orderedEventIds.
 */

const BUILD = 'REORDER_ROUTE_EVENTS_V1_2026_03_07';

Deno.serve(async (req) => {
  try {
    console.log('[reorderRouteEvents] START');
    const base44 = createClientFromRequest(req);

    const user = await base44.auth.me();
    console.log('[reorderRouteEvents] AUTH_DONE', { email: user?.email, role: user?.role });

    if (!user || !['admin', 'staff'].includes(user.role)) {
      return Response.json({ success: false, error: 'Forbidden: admin/staff access required' }, { status: 403 });
    }

    const payload = await req.json();
    const { date, technician, orderedEventIds } = payload || {};

    // --- Input validation ---
    if (!date || typeof date !== 'string') {
      return Response.json({ success: false, error: 'date is required' }, { status: 400 });
    }
    if (!technician || typeof technician !== 'string') {
      return Response.json({ success: false, error: 'technician is required' }, { status: 400 });
    }
    if (!Array.isArray(orderedEventIds) || orderedEventIds.length === 0) {
      return Response.json({ success: false, error: 'orderedEventIds must be a non-empty array' }, { status: 400 });
    }

    console.log('[reorderRouteEvents] PAYLOAD_PARSED', { date, technician, count: orderedEventIds.length });

    // --- Fetch all events for this date + technician ---
    const scopedEvents = await base44.asServiceRole.entities.CalendarEvent.filter({
      scheduledDate: date,
      assignedTechnician: technician,
    });

    const scopedIds = new Set(scopedEvents.map(e => e.id));

    // Validate all orderedEventIds belong to this scope
    const outOfScope = orderedEventIds.filter(id => !scopedIds.has(id));
    if (outOfScope.length > 0) {
      console.warn('[reorderRouteEvents] OUT_OF_SCOPE_IDS', { outOfScope });
      return Response.json({
        success: false,
        error: 'Some event IDs do not belong to the specified date/technician scope',
        outOfScope,
      }, { status: 422 });
    }

    // Build a map of eligible events by ID
    const eligibleMap = {};
    for (const e of scopedEvents) {
      if (
        e.eventType === 'service' &&
        e.isFixed !== true &&
        e.status === 'scheduled'
      ) {
        eligibleMap[e.id] = e;
      }
    }

    // Only persist updates for IDs that are eligible
    const eligibleOrdered = orderedEventIds.filter(id => eligibleMap[id]);

    if (eligibleOrdered.length === 0) {
      console.log('[reorderRouteEvents] NO_ELIGIBLE_EVENTS');
      return Response.json({ success: true, updatedCount: 0, build: BUILD });
    }

    console.log('[reorderRouteEvents] UPDATING', { eligibleCount: eligibleOrdered.length });

    // Persist 1-based routePosition for each eligible event in the supplied order
    for (let i = 0; i < eligibleOrdered.length; i++) {
      const eventId = eligibleOrdered[i];
      await base44.asServiceRole.entities.CalendarEvent.update(eventId, {
        routePosition: i + 1,
      });
    }

    console.log('[reorderRouteEvents] DONE', { updatedCount: eligibleOrdered.length });

    return Response.json({
      success: true,
      updatedCount: eligibleOrdered.length,
      build: BUILD,
    });

  } catch (error) {
    console.error('[reorderRouteEvents] CRASH', { error: error?.message });
    return Response.json({ success: false, error: error.message || 'Failed to reorder route events' }, { status: 500 });
  }
});