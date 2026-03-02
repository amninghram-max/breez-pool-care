import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * approveRescheduleV1
 * 
 * Admin approves a reschedule request and updates the CalendarEvent.
 * 
 * Input: { requestId, decisionNote? }
 * Output: { success, requestId, calendarEventId, newStart, build }
 */

const BUILD = "APPROVE_RESCHEDULE_V1_2026_03_02";

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
    const { requestId, decisionNote } = payload || {};

    if (!requestId || typeof requestId !== 'string') {
      return json200({
        success: false,
        error: 'requestId is required',
        build: BUILD
      });
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
      return json200({
        success: false,
        error: 'Failed to load reschedule request',
        detail: e.message,
        build: BUILD
      });
    }

    if (!rescheduleRequest) {
      return json200({
        success: false,
        error: 'Reschedule request not found',
        build: BUILD
      });
    }

    // Check if already approved (idempotency)
    if (rescheduleRequest.status === 'approved') {
      console.log('APPROVE_RESCHEDULE_V1_ALREADY_APPROVED', { requestId });
      return json200({
        success: true,
        requestId,
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

    const { calendarEventId, requestedStart, leadId } = rescheduleRequest;

    // Update CalendarEvent with new time
    try {
      // Parse requestedStart to extract date and time
      const startDate = new Date(requestedStart);
      const dateStr = startDate.toISOString().split('T')[0]; // YYYY-MM-DD
      const timeStr = startDate.toISOString().split('T')[1].substring(0, 5); // HH:MM

      await base44.asServiceRole.entities.CalendarEvent.update(calendarEventId, {
        scheduledDate: dateStr,
        startTime: timeStr,
        originalScheduledDate: null, // Clear if it was set
        rescheduleReason: 'customer_request'
      });
      console.log('APPROVE_RESCHEDULE_V1_EVENT_UPDATED', { calendarEventId, newStart: requestedStart });
    } catch (e) {
      console.error('APPROVE_RESCHEDULE_V1_EVENT_UPDATE_FAILED', { error: e.message });
      return json200({
        success: false,
        error: 'Failed to update CalendarEvent',
        detail: e.message,
        build: BUILD
      });
    }

    // Mark RescheduleRequest as approved
    try {
      await base44.asServiceRole.entities.RescheduleRequest.update(requestId, {
        status: 'approved',
        approvedAt: new Date().toISOString(),
        approvedBy: user.email,
        decisionNote: decisionNote || null
      });
      console.log('APPROVE_RESCHEDULE_V1_REQUEST_APPROVED', { 
        requestId, 
        leadId, 
        approvedBy: user.email 
      });
    } catch (e) {
      console.warn('APPROVE_RESCHEDULE_V1_REQUEST_UPDATE_FAILED', { error: e.message });
      // Non-fatal: event was updated, just request status failed
    }

    return json200({
      success: true,
      requestId,
      calendarEventId,
      newStart: requestedStart,
      build: BUILD
    });

  } catch (error) {
    console.error('APPROVE_RESCHEDULE_V1_CRASH', { error: error?.message });
    return json200({
      success: false,
      error: 'Approval failed',
      detail: error?.message,
      build: BUILD
    });
  }
});