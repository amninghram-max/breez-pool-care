import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * scheduleFirstInspectionPublicV2
 * 
 * Public endpoint to schedule an inspection via token (no login required).
 * IDEMPOTENT: Creates/ensures single InspectionRecord per lead (source of truth).
 * CalendarEvent is a projection derived from InspectionRecord.
 * Lead mirror fields stay in sync with InspectionRecord.
 * 
 * Input: { token, firstName, phone, email, serviceAddress: { street, city, state, zip }, requestedDate (YYYY-MM-DD), requestedTimeSlot }
 * Output: { success, scheduledDate?, timeWindow?, email?, firstName?, alreadyScheduled?, eventId?, inspectionId?, build }
 */

const BUILD = "SFI-V2-2026-03-02";

const json200 = (data) => new Response(
  JSON.stringify(data),
  { status: 200, headers: { "content-type": "application/json; charset=utf-8" } }
);

const timeWindowMap = {
  morning: '8:00 AM – 11:00 AM',
  midday: '11:00 AM – 2:00 PM',
  afternoon: '2:00 PM – 5:00 PM'
};

const timeSlotToStart = {
  morning: '09:00',
  midday: '12:00',
  afternoon: '14:00'
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const payload = await req.json();
    const { token, firstName, phone, email, serviceAddress, requestedDate, requestedTimeSlot } = payload || {};

    // Validate inputs
    if (!token || typeof token !== 'string') {
      return json200({ success: false, error: 'token is required', build: BUILD });
    }

    if (!firstName || typeof firstName !== 'string' || !firstName.trim()) {
      return json200({ success: false, error: 'firstName is required', build: BUILD });
    }

    if (!phone || typeof phone !== 'string' || !phone.trim()) {
      return json200({ success: false, error: 'phone is required', build: BUILD });
    }

    if (!serviceAddress || typeof serviceAddress !== 'object') {
      return json200({ success: false, error: 'serviceAddress object is required', build: BUILD });
    }

    const { street, city, state, zip } = serviceAddress;
    if (!street?.trim() || !city?.trim() || !state?.trim() || !zip?.trim()) {
      return json200({ success: false, error: 'serviceAddress must include street, city, state, and zip', build: BUILD });
    }

    if (!requestedDate || typeof requestedDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(requestedDate)) {
      return json200({ success: false, error: 'requestedDate must be in YYYY-MM-DD format', build: BUILD });
    }

    if (!requestedTimeSlot || !['morning', 'midday', 'afternoon'].includes(requestedTimeSlot)) {
      return json200({ success: false, error: 'requestedTimeSlot must be one of: morning, midday, afternoon', build: BUILD });
    }

    // Resolve leadId + contact via token
    let leadId = null;
    let tokenEmail = null;
    try {
      const resolveRes = await base44.asServiceRole.functions.invoke('resolveQuoteTokenPublicV1', { token: token.trim() });
      const resolveData = resolveRes?.data ?? resolveRes;
      
      if (resolveData?.success === true && resolveData.leadId && resolveData.email) {
        leadId = resolveData.leadId;
        tokenEmail = resolveData.email;
      } else {
        console.warn('SFI_V2_TOKEN_RESOLUTION_FAILED', { error: resolveData?.error });
      }
    } catch (e) {
      console.error('SFI_V2_TOKEN_RESOLUTION_CRASHED', { error: e.message });
    }

    if (!leadId || !tokenEmail) {
      return json200({ success: false, error: 'Token not found or invalid', build: BUILD });
    }

    const finalEmail = email || tokenEmail;
    const serviceAddressStr = `${street.trim()}, ${city.trim()}, ${state.trim()} ${zip.trim()}`;
    const timeWindow = timeWindowMap[requestedTimeSlot];
    const startTime = timeSlotToStart[requestedTimeSlot];

    // IDEMPOTENCY: Check if InspectionRecord already exists for this lead
    let existingInspection = null;
    try {
      const inspections = await base44.asServiceRole.entities.InspectionRecord.filter(
        { leadId, appointmentStatus: { $ne: 'cancelled' } },
        '-created_date',
        1
      );
      if (inspections && inspections.length > 0) {
        existingInspection = inspections[0];
        console.log('SFI_V2_INSPECTION_EXISTS', { leadId, inspectionId: existingInspection.id });
        return json200({
          success: true,
          alreadyScheduled: true,
          scheduledDate: existingInspection.scheduledDate,
          timeWindow: existingInspection.timeWindow,
          email: finalEmail,
          firstName: firstName,
          inspectionId: existingInspection.id,
          eventId: existingInspection.calendarEventId,
          build: BUILD
        });
      }
    } catch (e) {
      console.warn('SFI_V2_IDEMPOTENCY_CHECK_FAILED', { error: e.message });
    }

    // Step 1: Create InspectionRecord (AUTHORITATIVE SOURCE)
    let inspection = null;
    try {
      inspection = await base44.asServiceRole.entities.InspectionRecord.create({
        leadId,
        scheduledDate: requestedDate,
        startTime,
        timeWindow,
        appointmentStatus: 'scheduled',
        submittedByUserId: 'system_scheduler',
        submittedByName: 'Public Scheduler',
        submittedAt: new Date().toISOString(),
        finalizationStatus: 'pending_finalization',
        customerPresent: true
      });
      console.log('SFI_V2_INSPECTION_CREATED', { leadId, inspectionId: inspection.id, scheduledDate: requestedDate });
    } catch (e) {
      console.error('SFI_V2_INSPECTION_CREATE_FAILED', { error: e.message });
      return json200({ success: false, error: 'Failed to create inspection record', detail: e.message, build: BUILD });
    }

    // Step 2: Enforce single active inspection event per lead
    // Query for existing inspection CalendarEvents
    let existingEvents = [];
    try {
      const results = await base44.asServiceRole.entities.CalendarEvent.filter({
        leadId,
        eventType: 'inspection'
      }, null, 100);
      existingEvents = results ? results.filter(e => e.status !== 'cancelled') : [];
      console.log('SFI_V2_FOUND_EXISTING_EVENTS', { leadId, count: existingEvents.length });
    } catch (e) {
      console.warn('SFI_V2_EXISTING_EVENTS_QUERY_FAILED', { error: e.message });
    }

    // Cancel any duplicate active events
    for (const event of existingEvents) {
      try {
        await base44.asServiceRole.entities.CalendarEvent.update(event.id, {
          status: 'cancelled',
          cancelledAt: new Date().toISOString(),
          cancelReason: 'duplicate_inspection_event_cleanup'
        });
        console.log('SFI_V2_CANCELLED_DUPLICATE', { leadId, eventId: event.id });
      } catch (e) {
        console.warn('SFI_V2_DUPLICATE_CANCEL_FAILED', { error: e.message });
      }
    }

    // Step 3: Create CalendarEvent (PROJECTION from InspectionRecord)
    let calendarEvent = null;
    try {
      calendarEvent = await base44.asServiceRole.entities.CalendarEvent.create({
        leadId,
        eventType: 'inspection',
        scheduledDate: requestedDate,
        startTime,
        timeWindow,
        status: 'scheduled',
        serviceAddress: serviceAddressStr,
        customerNotes: `Name: ${firstName.trim()}\nPhone: ${phone.trim()}\nEmail: ${finalEmail || 'N/A'}`
      });
      console.log('SFI_V2_EVENT_CREATED', { leadId, eventId: calendarEvent.id, inspectionId: inspection.id });
    } catch (e) {
      console.error('SFI_V2_EVENT_CREATE_FAILED', { error: e.message });
      return json200({ success: false, error: 'Failed to create calendar event', detail: e.message, build: BUILD });
    }

    // Step 4: Link CalendarEvent to InspectionRecord
    try {
      await base44.asServiceRole.entities.InspectionRecord.update(inspection.id, {
        calendarEventId: calendarEvent.id
      });
      console.log('SFI_V2_INSPECTION_LINKED', { inspectionId: inspection.id, calendarEventId: calendarEvent.id });
    } catch (e) {
      console.warn('SFI_V2_LINK_FAILED', { error: e.message });
    }

    // Step 5: Sync Lead mirror fields with InspectionRecord
    let lead = null;
    let shouldSendNotification = false;
    try {
      const leads = await base44.asServiceRole.entities.Lead.filter({ id: leadId }, null, 1);
      if (leads && leads.length > 0) {
        lead = leads[0];
        shouldSendNotification = lead.stage !== 'inspection_scheduled';

        await base44.asServiceRole.entities.Lead.update(leadId, {
          firstName: firstName.trim(),
          mobilePhone: phone.trim(),
          inspectionScheduled: true,
          inspectionEventId: calendarEvent.id,
          requestedInspectionDate: requestedDate,
          requestedInspectionTime: requestedTimeSlot,
          serviceAddress: serviceAddressStr,
          ...(shouldSendNotification && { confirmationSentAt: new Date().toISOString() })
        });
        console.log('SFI_V2_LEAD_SYNCED', { leadId, shouldSendNotification });

        // Auto-stage progression
        if (shouldSendNotification) {
          try {
            await base44.functions.invoke('updateLeadStagePublicV1', {
              token: token.trim(),
              newStage: 'inspection_scheduled',
              context: 'schedule-success'
            });
            console.log('SFI_V2_STAGE_PROGRESSED', { leadId, newStage: 'inspection_scheduled' });
          } catch (stageErr) {
            console.warn('SFI_V2_STAGE_UPDATE_FAILED', { error: stageErr.message });
          }
        }
      }
    } catch (e) {
      console.warn('SFI_V2_LEAD_SYNC_FAILED', { error: e.message });
    }

    // Step 6: Send confirmation email server-side (authoritative, non-blocking)
    let emailStatus = 'sent';
    let emailError = null;
    try {
      const emailRes = await base44.asServiceRole.functions.invoke('sendInspectionConfirmation', {
        leadId,
        // Pass scheduling context in case lead fields aren't synced yet
        firstName: firstName.trim(),
        email: finalEmail,
        inspectionDate: requestedDate,
        inspectionTime: timeWindow,
        force: shouldSendNotification // force send on first schedule; skip if already sent
      });
      const emailData = emailRes?.data ?? emailRes;
      if (emailData?.skipped) {
        emailStatus = 'sent'; // already sent previously — treat as success
      } else if (!emailData?.success && !emailData?.emailSent) {
        emailStatus = 'failed';
        emailError = emailData?.error || 'Email delivery failed';
      }
      console.log('SFI_V2_EMAIL', { leadId, emailStatus, skipped: emailData?.skipped });
    } catch (emailErr) {
      emailStatus = 'failed';
      emailError = emailErr?.message || 'Email trigger exception';
      console.error('SFI_V2_EMAIL_FAILED', { leadId, error: emailErr?.message });
    }

    console.log('SFI_V2_SUCCESS', { leadId, inspectionId: inspection.id, eventId: calendarEvent.id, scheduledDate: requestedDate, emailStatus });

    return json200({
      success: true,
      scheduledDate: requestedDate,
      timeWindow,
      email: finalEmail,
      firstName,
      inspectionId: inspection.id,
      eventId: calendarEvent.id,
      shouldSendNotification,
      emailStatus,
      ...(emailError && { emailError }),
      build: BUILD
    });

  } catch (error) {
    console.error('SFI_V2_CRASH', { error: error?.message });
    return json200({
      success: false,
      error: 'Failed to schedule inspection',
      detail: error?.message,
      build: BUILD
    });
  }
});