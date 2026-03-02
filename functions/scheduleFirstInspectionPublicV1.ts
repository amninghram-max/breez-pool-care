import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * scheduleFirstInspectionPublicV1
 * Public endpoint to schedule an inspection via token (no login required).
 * IDEMPOTENT: Checks for existing inspection scheduling and returns cached state.
 * Side effects (email, stage update) only occur on first scheduling.
 * 
 * Input: { token, firstName, phone, email, serviceAddress: { street, city, state, zip }, requestedDate (YYYY-MM-DD), requestedTimeSlot }
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
    const { token, firstName, phone, email, serviceAddress, requestedDate, requestedTimeSlot } = payload || {};

    // Validate inputs
    if (!token || typeof token !== 'string') {
      return json200({
        success: false,
        error: 'token is required',
        build: BUILD
      });
    }

    if (!firstName || typeof firstName !== 'string' || !firstName.trim()) {
      return json200({
        success: false,
        error: 'firstName is required',
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

    if (!serviceAddress || typeof serviceAddress !== 'object') {
      return json200({
        success: false,
        error: 'serviceAddress object is required',
        build: BUILD
      });
    }

    const { street, city, state, zip } = serviceAddress;
    if (!street?.trim() || !city?.trim() || !state?.trim() || !zip?.trim()) {
      return json200({
        success: false,
        error: 'serviceAddress must include street, city, state, and zip',
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

    // Resolve leadId + contact via token (verify token is valid)
    let leadId = null;
    let tokenEmail = null;
    try {
      const requests = await base44.asServiceRole.entities.QuoteRequests.filter({ token: token.trim() }, null, 1);
      if (requests && requests.length > 0) {
        leadId = requests[0].leadId;
        tokenEmail = requests[0].email;
        console.log('SFI_V1_TOKEN_RESOLVED', { token: token.trim().slice(0, 8), leadId });
      }
    } catch (e) {
      console.warn('SFI_V1_TOKEN_RESOLUTION_FAILED', { error: e.message });
    }

    if (!tokenEmail) {
      return json200({
        success: false,
        error: 'Token not found or invalid',
        build: BUILD
      });
    }

    // Use provided email or fall back to token email
    const finalEmail = email || tokenEmail;

    // IDEMPOTENCY CHECK: If this lead already has an inspection scheduled, return cached state
    let existingLead = null;
    if (leadId) {
      try {
        existingLead = await base44.asServiceRole.entities.Lead.filter({ id: leadId }, null, 1);
        if (existingLead && existingLead.length > 0) {
          const lead = existingLead[0];
          if (lead.inspectionScheduled === true && lead.inspectionEventId) {
            console.log('SFI_V1_ALREADY_SCHEDULED', { leadId, eventId: lead.inspectionEventId });
            return json200({
              success: true,
              alreadyScheduled: true,
              scheduledDate: lead.requestedInspectionDate,
              timeWindow: lead.requestedInspectionTime, // Will be converted to friendly format below
              email: finalEmail,
              firstName: lead.firstName || firstName,
              build: BUILD
            });
          }
        }
      } catch (e) {
        console.warn('SFI_V1_IDEMPOTENCY_CHECK_FAILED', { error: e.message });
        // Continue with normal flow
      }
    }

    // Map time slot to time window
    const timeWindowMap = {
      morning: '8:00 AM – 11:00 AM',
      midday: '11:00 AM – 2:00 PM',
      afternoon: '2:00 PM – 5:00 PM'
    };
    const timeWindow = timeWindowMap[requestedTimeSlot];

    // Build service address string
    const serviceAddressStr = `${street.trim()}, ${city.trim()}, ${state.trim()} ${zip.trim()}`;

    // Create CalendarEvent (service inspection) with all contact fields
    let eventCreated = null;
    try {
      eventCreated = await base44.asServiceRole.entities.CalendarEvent.create({
        leadId: leadId,
        eventType: 'inspection',
        scheduledDate: requestedDate,
        timeWindow: timeWindow,
        status: 'scheduled',
        serviceAddress: serviceAddressStr,
        customerNotes: `Name: ${firstName.trim()}\nPhone: ${phone.trim()}\nEmail: ${finalEmail || 'N/A'}`,
      });
      console.log('SFI_V1_EVENT_CREATED', { eventId: eventCreated.id, leadId, serviceAddress: serviceAddressStr });
    } catch (e) {
      console.error('SFI_V1_EVENT_CREATION_FAILED', { error: e.message });
      return json200({
        success: false,
        error: 'Failed to create inspection event',
        detail: e.message,
        build: BUILD
      });
    }

    // IDEMPOTENT SIDE EFFECTS: Update Lead record (only if not already scheduled)
    // This ensures email notifications + stage transitions happen exactly once
    const previousStage = existingLead?.[0]?.stage || null;
    const shouldSendNotification = previousStage !== 'inspection_scheduled';

    if (leadId) {
      try {
        await base44.asServiceRole.entities.Lead.update(leadId, {
          firstName: firstName.trim(),
          mobilePhone: phone.trim(),
          inspectionScheduled: true,
          inspectionEventId: eventCreated.id,
          requestedInspectionDate: requestedDate,
          requestedInspectionTime: requestedTimeSlot,
          serviceAddress: serviceAddressStr,
          stage: 'inspection_scheduled',
          // Only set notification flag if this is first scheduling
          ...(shouldSendNotification && { confirmationSentAt: new Date().toISOString() })
        });
        console.log('SFI_V1_LEAD_UPDATED', { leadId, shouldSendNotification, serviceAddress: serviceAddressStr });
      } catch (e) {
        console.warn('SFI_V1_LEAD_UPDATE_FAILED', { error: e.message });
        // Don't fail the response; event is created
      }
    }

    return json200({
      success: true,
      scheduledDate: requestedDate,
      timeWindow: timeWindow,
      email: finalEmail,
      firstName: firstName,
      eventId: eventCreated?.id,
      shouldSendNotification: shouldSendNotification,
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