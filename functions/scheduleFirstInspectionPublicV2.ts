import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

const BUILD = "SFI-V2-2026-03-04-F";

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

async function sendConfirmationEmail(base44, { email, firstName, requestedDate, timeWindow, serviceAddress }, requestId) {
  if (!email) return 'skipped';

  try {
    await base44.asServiceRole.integrations.Core.SendEmail({
      to: email,
      from_name: 'Breez Pool Care',
      subject: 'Your Breez Inspection Is Scheduled',
      body: `Hi ${firstName || 'there'},\n\nYour inspection is confirmed for ${requestedDate} (${timeWindow}).\nService address: ${serviceAddress}\n\nIf anything changes, call us at (321) 524-3838.\n\n— Breez Pool Care`
    });
    return 'sent';
  } catch (e) {
    console.warn('SFI_V2_CONFIRMATION_EMAIL_FAILED', { requestId, error: e.message });
    return 'failed';
  }
}

async function resolveTokenInline(base44, token, requestId) {
  let request = null;
  try {
    const requests = await base44.asServiceRole.entities.QuoteRequests.filter({ token: token.trim() }, null, 1);
    request = requests?.[0] || null;
  } catch (e) {
    return { success: false, code: 'QUERY_ERROR', error: e.message || 'Failed to resolve token' };
  }
  if (!request) {
    return { success: false, code: 'TOKEN_NOT_FOUND', error: 'Invalid or expired token' };
  }

  let leadId = request.leadId || null;
  let email = request.email || null;
  let firstName = request.firstName || null;
  let phone = request.phone || null;

  if (!leadId || !email || email === 'guest@breezpoolcare.com') {
    try {
      const quotes = await base44.asServiceRole.entities.Quote.filter({ quoteToken: token.trim() }, '-created_date', 1);
      const quote = quotes?.[0] || null;
      if (quote) {
        if (!leadId && quote.leadId) leadId = quote.leadId;
        if ((!email || email === 'guest@breezpoolcare.com') && quote.clientEmail) email = quote.clientEmail;
        if (!firstName && quote.clientFirstName) firstName = quote.clientFirstName;

        const patch = {};
        if (leadId && request.leadId !== leadId) patch.leadId = leadId;
        if (email && request.email !== email) patch.email = email;
        if (firstName && request.firstName !== firstName) patch.firstName = firstName;
        if (Object.keys(patch).length > 0) {
          await base44.asServiceRole.entities.QuoteRequests.update(request.id, patch);
          console.log('RQT_V1_REPAIRED_FROM_QUOTE', { requestId, token: token.slice(0, 8), repaired: Object.keys(patch) });
        }
      }
    } catch (repairErr) {
      console.warn('SFI_V2_RESOLVE_REPAIR_FAILED', { requestId, error: repairErr.message });
    }
  }

  let lead = null;
  if (leadId) {
    const leads = await base44.asServiceRole.entities.Lead.filter({ id: leadId }, null, 1);
    lead = leads?.[0] || null;
  }

  if (!lead || lead.isDeleted === true) {
    return { success: false, code: 'INCOMPLETE_DATA', error: 'Token does not have complete lead information' };
  }

  if (!email || email === 'guest@breezpoolcare.com') email = lead.email || null;
  if (!firstName) firstName = lead.firstName || null;
  if (!phone) phone = lead.mobilePhone || lead.phone || null;

  if (!leadId || !email) {
    return { success: false, code: 'INCOMPLETE_DATA', error: 'Token does not have complete lead information' };
  }

  return { success: true, leadId, email, firstName, phone };
}

Deno.serve(async (req) => {
  const requestId = crypto.randomUUID();
  const runtimeVersion = BUILD;
  const meta = { build: BUILD, runtimeVersion, requestId };

  try {
    const base44 = createClientFromRequest(req);
    const payload = await req.json();
    const { token, firstName, phone, email, serviceAddress, requestedDate, requestedTimeSlot } = payload || {};

    console.log('SFI_V2_ENTRY_VERSION', { requestId, runtimeVersion, token: token ? token.slice(0, 8) : null });

    if (!token || typeof token !== 'string') return json200({ success: false, error: 'token is required', ...meta });
    if (!firstName || typeof firstName !== 'string' || !firstName.trim()) return json200({ success: false, error: 'firstName is required', ...meta });
    if (!phone || typeof phone !== 'string' || !phone.trim()) return json200({ success: false, error: 'phone is required', ...meta });
    if (!serviceAddress || typeof serviceAddress !== 'object') return json200({ success: false, error: 'serviceAddress object is required', ...meta });

    const { street, city, state, zip } = serviceAddress;
    if (!street?.trim() || !city?.trim() || !state?.trim() || !zip?.trim()) {
      return json200({ success: false, error: 'serviceAddress must include street, city, state, and zip', ...meta });
    }
    if (!requestedDate || typeof requestedDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(requestedDate)) {
      return json200({ success: false, error: 'requestedDate must be in YYYY-MM-DD format', ...meta });
    }
    if (!requestedTimeSlot || !['morning', 'midday', 'afternoon'].includes(requestedTimeSlot)) {
      return json200({ success: false, error: 'requestedTimeSlot must be one of: morning, midday, afternoon', ...meta });
    }

    const resolveData = await resolveTokenInline(base44, token, requestId);
    if (resolveData?.success !== true || !resolveData.leadId || !resolveData.email) {
      const code = resolveData?.code || 'QUERY_ERROR';
      const errorMap = {
        TOKEN_NOT_FOUND: 'Invalid or expired token',
        INCOMPLETE_DATA: 'Token does not have complete lead information',
        QUERY_ERROR: 'Failed to resolve token'
      };
      console.warn('SFI_V2_RESOLVE_FAILED', { requestId, runtimeVersion, token: token.slice(0, 8), code });
      return json200({ success: false, code, error: errorMap[code] || (resolveData?.error || 'Failed to resolve token'), ...meta });
    }

    const leadId = resolveData.leadId;
    const tokenEmail = resolveData.email;
    const finalEmail = email || tokenEmail;
    const serviceAddressStr = `${street.trim()}, ${city.trim()}, ${state.trim()} ${zip.trim()}`;
    const timeWindow = timeWindowMap[requestedTimeSlot];
    const startTime = timeSlotToStart[requestedTimeSlot];

    let existingInspection = null;
    try {
      const inspections = await base44.asServiceRole.entities.InspectionRecord.filter(
        { leadId, appointmentStatus: { $ne: 'cancelled' } },
        '-created_date',
        1
      );
      if (inspections && inspections.length > 0) {
        existingInspection = inspections[0];
        return json200({
          success: true,
          alreadyScheduled: true,
          scheduledDate: existingInspection.scheduledDate,
          timeWindow: existingInspection.timeWindow,
          email: finalEmail,
          firstName,
          inspectionId: existingInspection.id,
          eventId: existingInspection.calendarEventId,
          ...meta
        });
      }
    } catch (e) {
      console.warn('SFI_V2_IDEMPOTENCY_CHECK_FAILED', { requestId, error: e.message });
    }

    const inspectionCreatePayload = {
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
    };

    let inspection = null;
    let degradedMode = false;
    try {
      inspection = await base44.asServiceRole.entities.InspectionRecord.create(inspectionCreatePayload);
    } catch (e) {
      const createPayloadShape = {
        hasLeadId: !!inspectionCreatePayload.leadId,
        appointmentStatus: inspectionCreatePayload.appointmentStatus,
        finalizationStatus: inspectionCreatePayload.finalizationStatus,
        submittedByUserId: inspectionCreatePayload.submittedByUserId,
        submittedByName: inspectionCreatePayload.submittedByName,
        customerPresent: inspectionCreatePayload.customerPresent
      };
      console.error('SFI_V2_INSPECTION_CREATE_FAILED_DIAG', { requestId, error: e.message, createPayloadShape });
      degradedMode = true;
      console.warn('SFI_V2_DEGRADED_FALLBACK_USED', {
        requestId,
        reason: 'INSPECTION_RECORD_CREATE_FAILED',
        detail: e.message,
        createPayloadShape
      });
    }

    let existingEvents = [];
    try {
      const results = await base44.asServiceRole.entities.CalendarEvent.filter({ leadId, eventType: 'inspection' }, null, 100);
      existingEvents = results ? results.filter((event) => event.status !== 'cancelled') : [];
    } catch (e) {
      console.warn('SFI_V2_EXISTING_EVENTS_QUERY_FAILED', { requestId, error: e.message });
    }

    for (const event of existingEvents) {
      try {
        await base44.asServiceRole.entities.CalendarEvent.update(event.id, {
          status: 'cancelled',
          cancelledAt: new Date().toISOString(),
          cancelReason: 'duplicate_inspection_event_cleanup'
        });
      } catch (e) {
        console.warn('SFI_V2_DUPLICATE_CANCEL_FAILED', { requestId, error: e.message });
      }
    }

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
    } catch (e) {
      return json200({ success: false, error: 'Failed to create calendar event', detail: e.message, ...meta });
    }

    if (inspection?.id) {
      try {
        await base44.asServiceRole.entities.InspectionRecord.update(inspection.id, { calendarEventId: calendarEvent.id });
      } catch (e) {
        console.warn('SFI_V2_LINK_FAILED', { requestId, error: e.message });
      }
    }

    let shouldSendNotification = false;
    try {
      const leads = await base44.asServiceRole.entities.Lead.filter({ id: leadId }, null, 1);
      if (leads && leads.length > 0) {
        const lead = leads[0];
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
      }
    } catch (e) {
      console.warn('SFI_V2_LEAD_SYNC_FAILED', { requestId, error: e.message });
    }

    const emailStatus = await sendConfirmationEmail(base44, {
      email: finalEmail,
      firstName: firstName.trim(),
      requestedDate,
      timeWindow,
      serviceAddress: serviceAddressStr
    }, requestId);

    return json200({
      success: true,
      scheduledDate: requestedDate,
      timeWindow,
      email: finalEmail,
      firstName,
      inspectionId: inspection?.id || null,
      eventId: calendarEvent.id,
      shouldSendNotification,
      emailStatus,
      ...(degradedMode && {
        degradedMode: true,
        degradedReason: 'INSPECTION_RECORD_CREATE_FAILED'
      }),
      ...meta
    });
  } catch (error) {
    console.error('SFI_V2_CRASH', { requestId, error: error?.message });
    return json200({ success: false, error: 'Failed to schedule inspection', detail: error?.message, ...meta });
  }
});
