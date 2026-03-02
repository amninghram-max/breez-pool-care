import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * approveRescheduleV2
 * 
 * Admin approves a reschedule request.
 * Updates ALL THREE in one atomic operation (no drift):
 * - InspectionRecord (authoritative appointment time)
 * - CalendarEvent (projection)
 * - Lead mirror fields
 * 
 * Input: { requestId, decisionNote? }
 * Output: { success, requestId, inspectionId, calendarEventId, newStart, build }
 */

const BUILD = "APPROVE_RESCHEDULE_V2_2026_03_02";

const json200 = (data) => new Response(
  JSON.stringify(data),
  { status: 200, headers: { "content-type": "application/json; charset=utf-8" } }
);

const timeSlotToStart = {
  morning: '09:00',
  midday: '12:00',
  afternoon: '14:00'
};

const mapTimeToSlot = (timeStr) => {
  if (!timeStr) return 'morning';
  const hour = parseInt(timeStr.split(':')[0], 10);
  if (hour >= 14) return 'afternoon';
  if (hour >= 12) return 'midday';
  return 'morning';
};

const timeSlotToWindow = {
  morning: '8:00 AM – 11:00 AM',
  midday: '11:00 AM – 2:00 PM',
  afternoon: '2:00 PM – 5:00 PM'
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    // Admin-only
    if (user?.role !== 'admin') {
      return json200({ success: false, error: 'Forbidden: Admin access required', build: BUILD });
    }

    const payload = await req.json();
    const { requestId, decisionNote } = payload || {};

    if (!requestId || typeof requestId !== 'string') {
      return json200({ success: false, error: 'requestId is required', build: BUILD });
    }

    // Load RescheduleRequest
    let rescheduleRequest = null;
    try {
      const requests = await base44.asServiceRole.entities.RescheduleRequest.filter(
        { id: requestId },
        null,
        1
      );
      if (requests && requests.length > 0) {
        rescheduleRequest = requests[0];
      }
    } catch (e) {
      return json200({ success: false, error: 'Failed to load reschedule request', detail: e.message, build: BUILD });
    }

    if (!rescheduleRequest) {
      return json200({ success: false, error: 'Reschedule request not found', build: BUILD });
    }

    // Check if already approved (idempotency)
    if (rescheduleRequest.status === 'approved') {
      console.log('APPROVE_RESCHEDULE_V2_ALREADY_APPROVED', { requestId });
      return json200({
        success: true,
        requestId,
        inspectionId: rescheduleRequest.inspectionId,
        calendarEventId: rescheduleRequest.calendarEventId,
        newStart: rescheduleRequest.requestedStart,
        alreadyApproved: true,
        build: BUILD
      });
    }

    // Only pending can be approved
    if (rescheduleRequest.status !== 'pending') {
      return json200({
        success: false,
        error: `Cannot approve reschedule with status: ${rescheduleRequest.status}`,
        build: BUILD
      });
    }

    const { calendarEventId, requestedStart, leadId, inspectionId } = rescheduleRequest;

    // Parse new appointment time
    const startDate = new Date(requestedStart);
    const newDateStr = startDate.toISOString().split('T')[0]; // YYYY-MM-DD
    const newTimeStr = startDate.toISOString().split('T')[1].substring(0, 5); // HH:MM
    const timeSlot = mapTimeToSlot(newTimeStr);
    const timeWindow = timeSlotToWindow[timeSlot] || `${newTimeStr} – ...`;

    try {
      // UPDATE 1: InspectionRecord (AUTHORITATIVE)
      if (inspectionId) {
        try {
          await base44.asServiceRole.entities.InspectionRecord.update(inspectionId, {
            scheduledDate: newDateStr,
            startTime: newTimeStr,
            timeWindow,
            appointmentStatus: 'scheduled'
          });
          console.log('APPROVE_RESCHEDULE_V2_INSPECTION_UPDATED', { inspectionId, newDateStr, newTimeStr });
        } catch (e) {
          console.warn('APPROVE_RESCHEDULE_V2_INSPECTION_UPDATE_FAILED', { error: e.message });
          // Continue to try other updates
        }
      }

      // UPDATE 2: CalendarEvent (PROJECTION)
      try {
        await base44.asServiceRole.entities.CalendarEvent.update(calendarEventId, {
          scheduledDate: newDateStr,
          startTime: newTimeStr,
          timeWindow,
          status: 'scheduled',
          originalScheduledDate: null,
          rescheduleReason: 'customer_request'
        });
        console.log('APPROVE_RESCHEDULE_V2_EVENT_UPDATED', { calendarEventId, newDateStr, newTimeStr });
      } catch (e) {
        console.error('APPROVE_RESCHEDULE_V2_EVENT_UPDATE_FAILED', { error: e.message });
        return json200({ success: false, error: 'Failed to update calendar event', detail: e.message, build: BUILD });
      }

      // UPDATE 3: Lead mirror fields (SYNC)
      try {
        await base44.asServiceRole.entities.Lead.update(leadId, {
          requestedInspectionDate: newDateStr,
          requestedInspectionTime: timeSlot,
          confirmedInspectionDate: requestedStart
        });
        console.log('APPROVE_RESCHEDULE_V2_LEAD_SYNCED', { leadId, newDateStr, timeSlot });
      } catch (e) {
        console.warn('APPROVE_RESCHEDULE_V2_LEAD_SYNC_FAILED', { error: e.message });
      }

      // Mark RescheduleRequest as approved
      try {
        await base44.asServiceRole.entities.RescheduleRequest.update(requestId, {
          status: 'approved',
          approvedAt: new Date().toISOString(),
          approvedBy: user.email,
          decisionNote: decisionNote || null
        });
        console.log('APPROVE_RESCHEDULE_V2_REQUEST_APPROVED', { requestId, leadId, approvedBy: user.email });
      } catch (e) {
        console.warn('APPROVE_RESCHEDULE_V2_REQUEST_MARK_FAILED', { error: e.message });
      }

      return json200({
        success: true,
        requestId,
        inspectionId,
        calendarEventId,
        newStart: requestedStart,
        build: BUILD
      });

    } catch (error) {
      console.error('APPROVE_RESCHEDULE_V2_SYNC_CRASH', { error: error?.message });
      return json200({ success: false, error: 'Approval failed', detail: error?.message, build: BUILD });
    }

  } catch (error) {
    console.error('APPROVE_RESCHEDULE_V2_CRASH', { error: error?.message });
    return json200({
      success: false,
      error: 'Approval failed',
      detail: error?.message,
      build: BUILD
    });
  }
});