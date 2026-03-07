import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

/**
 * createCalendarEventAdmin
 *
 * Admin-only helper for creating service CalendarEvents.
 * Replaces fragile direct frontend CalendarEvent.create in CreateServiceEventModal.
 *
 * Input: { leadId, scheduledDate, serviceAddress, assignedTechnician?, estimatedDuration? }
 * Output: { success, event }
 */

const BUILD = "CREATE_CALENDAR_EVENT_ADMIN_V1_2026_03_07";

Deno.serve(async (req) => {
  try {
    console.log('[createCalendarEventAdmin] START');
    const base44 = createClientFromRequest(req);

    const user = await base44.auth.me();
    console.log('[createCalendarEventAdmin] AUTH_DONE', { email: user?.email, role: user?.role });

    if (!user || user.role !== 'admin') {
      return Response.json({ success: false, error: 'Forbidden: admin access required' }, { status: 403 });
    }

    const payload = await req.json();
    const { leadId, scheduledDate, serviceAddress, assignedTechnician, estimatedDuration } = payload || {};
    console.log('[createCalendarEventAdmin] PAYLOAD_PARSED', { leadId, scheduledDate });

    if (!leadId || typeof leadId !== 'string') {
      return Response.json({ success: false, error: 'leadId is required' }, { status: 400 });
    }
    if (!scheduledDate || typeof scheduledDate !== 'string') {
      return Response.json({ success: false, error: 'scheduledDate is required' }, { status: 400 });
    }
    if (!serviceAddress || typeof serviceAddress !== 'string') {
      return Response.json({ success: false, error: 'serviceAddress is required' }, { status: 400 });
    }

    // Determine effective technician (mirrors create payload default)
    const effectiveTechnician = assignedTechnician || 'Matt';

    // --- CONFLICT CHECK: block same-date same-technician double-booking ---
    const existingEvents = await base44.asServiceRole.entities.CalendarEvent.filter({
      scheduledDate,
      assignedTechnician: effectiveTechnician,
      status: 'scheduled',
    });

    if (existingEvents && existingEvents.length > 0) {
      console.warn('[createCalendarEventAdmin] TECHNICIAN_CONFLICT', {
        leadId,
        scheduledDate,
        technician: effectiveTechnician,
        conflictCount: existingEvents.length,
      });
      return Response.json({
        success: false,
        error: 'Technician already has a scheduled service event on this date. Please select a different date or technician.',
        code: 'TECHNICIAN_CONFLICT',
      }, { status: 409 });
    }

    // Explicit create payload — preserves current repo defaults exactly
    const createPayload = {
      leadId,
      eventType: 'service',
      scheduledDate,
      serviceAddress,
      status: 'scheduled',
      assignedTechnician: effectiveTechnician,
      estimatedDuration: estimatedDuration || 30,
    };

    console.log('[createCalendarEventAdmin] CREATE_START', { leadId, scheduledDate });

    const event = await base44.asServiceRole.entities.CalendarEvent.create(createPayload);

    console.log('[createCalendarEventAdmin] CREATE_DONE', { eventId: event?.id });

    return Response.json({
      success: true,
      event,
      build: BUILD
    });

  } catch (error) {
    console.error('[createCalendarEventAdmin] CRASH', { error: error?.message });
    return Response.json({ success: false, error: error.message || 'Failed to create event' }, { status: 500 });
  }
});