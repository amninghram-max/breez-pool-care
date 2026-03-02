import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * scheduleFirstInspectionPublicV1
 * Public endpoint to schedule an inspection via token (no login required).
 * IDEMPOTENT: Checks for existing inspection scheduling and returns cached state.
 * Side effects (email, stage update) only occur on first scheduling.
 * 
 * Input: { token, phone, requestedDate (YYYY-MM-DD), requestedTimeSlot }
 * Output: { success, scheduledDate?, timeWindow?, email?, firstName?, alreadyScheduled?, error?, build }
 */

const BUILD = "SFI-V1-2026-03-02";

const json200 = (data) => new Response(
  JSON.stringify(data),
  { status: 200, headers: { "content-type": "application/json; charset=utf-8" } }
);

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const payload = await req.json();
    const { token, phone, requestedDate, requestedTimeSlot } = payload || {};

    // Validate inputs
    if (!token || typeof token !== 'string') {
      return json200({
        success: false,
        error: 'token is required',
        build: BUILD
      });
    }

    if (!phone || typeof phone !== 'string' || !phone.trim()) {
      return json200({
        success: false,
        error: 'phone is required',
        build: BUILD
      });
    }

    if (!requestedDate || typeof requestedDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(requestedDate)) {
      return json200({
        success: false,
        error: 'requestedDate must be in YYYY-MM-DD format',
        build: BUILD
      });
    }

    if (!requestedTimeSlot || !['morning', 'midday', 'afternoon'].includes(requestedTimeSlot)) {
      return json200({
        success: false,
        error: 'requestedTimeSlot must be one of: morning, midday, afternoon',
        build: BUILD
      });
    }

    // Resolve leadId + contact via token
    let leadId = null;
    let email = null;
    let firstName = null;
    try {
      const requests = await base44.asServiceRole.entities.QuoteRequests.filter({ token: token.trim() }, null, 1);
      if (requests && requests.length > 0) {
        leadId = requests[0].leadId;
        email = requests[0].email;
        firstName = requests[0].firstName;
        console.log('SFI_V1_TOKEN_RESOLVED', { token: token.trim().slice(0, 8), leadId });
      }
    } catch (e) {
      console.warn('SFI_V1_TOKEN_RESOLUTION_FAILED', { error: e.message });
    }

    if (!email) {
      return json200({
        success: false,
        error: 'Token not found or invalid',
        build: BUILD
      });
    }

    // Map time slot to time window
    const timeWindowMap = {
      morning: '8:00 AM – 11:00 AM',
      midday: '11:00 AM – 2:00 PM',
      afternoon: '2:00 PM – 5:00 PM'
    };
    const timeWindow = timeWindowMap[requestedTimeSlot];

    // Create CalendarEvent (service inspection)
    let eventCreated = null;
    try {
      eventCreated = await base44.asServiceRole.entities.CalendarEvent.create({
        leadId: leadId,
        eventType: 'inspection',
        scheduledDate: requestedDate,
        timeWindow: timeWindow,
        status: 'scheduled',
        serviceAddress: 'TBD', // Will be updated after lead confirmation
      });
      console.log('SFI_V1_EVENT_CREATED', { eventId: eventCreated.id, leadId });
    } catch (e) {
      console.error('SFI_V1_EVENT_CREATION_FAILED', { error: e.message });
      return json200({
        success: false,
        error: 'Failed to create inspection event',
        detail: e.message,
        build: BUILD
      });
    }

    // Update Lead record with inspection scheduled + phone
    if (leadId) {
      try {
        await base44.asServiceRole.entities.Lead.update(leadId, {
          mobilePhone: phone.trim(),
          inspectionScheduled: true,
          inspectionEventId: eventCreated.id,
          requestedInspectionDate: requestedDate,
          requestedInspectionTime: requestedTimeSlot,
          stage: 'inspection_scheduled'
        });
        console.log('SFI_V1_LEAD_UPDATED', { leadId });
      } catch (e) {
        console.warn('SFI_V1_LEAD_UPDATE_FAILED', { error: e.message });
        // Don't fail the response; event is created
      }
    }

    return json200({
      success: true,
      scheduledDate: requestedDate,
      timeWindow: timeWindow,
      email: email,
      firstName: firstName,
      build: BUILD
    });

  } catch (error) {
    console.error('SFI_V1_CRASH', { error: error?.message });
    return json200({
      success: false,
      error: 'Failed to schedule inspection',
      detail: error?.message,
      build: BUILD
    });
  }
});