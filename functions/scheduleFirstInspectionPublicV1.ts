import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

/**
 * scheduleFirstInspectionPublicV1
 * Public endpoint to schedule an inspection via token (no login required).
 * IDEMPOTENT: Checks for existing inspection scheduling and returns cached state.
 * Side effects (email, stage update) only occur on first scheduling.
 *
 * Input: { token, firstName, phone, email, serviceAddress: { street, city, state, zip }, requestedDate (YYYY-MM-DD), requestedTimeSlot }
 * Output: { success, scheduledDate?, timeWindow?, email?, firstName?, alreadyScheduled?, error?, build, runtimeVersion, requestId }
 */

const BUILD = "SFI-V1-2026-03-04-F";

// Inlined token resolution (mirrors resolveQuoteTokenPublicV1 logic — no function invoke)
async function resolveTokenInline(entities, token) {
  const cleanToken = token.trim();
  let request = null;
  try {
    const rows = await entities.QuoteRequests.filter({ token: cleanToken }, null, 1);
    if (rows && rows.length > 0) request = rows[0];
  } catch (e) {
    return { code: 'LEAD_LOOKUP_FAILED', error: 'Platform temporarily unavailable' };
  }
  if (!request) return { code: 'TOKEN_NOT_FOUND', error: 'Token not found or invalid' };

  let leadId = request.leadId || null;
  let email = request.email || null;
  let firstName = request.firstName || null;
  if (email === 'guest@breezpoolcare.com') email = null;

  if (!leadId) {
    try {
      const quotes = await entities.Quote.filter({ quoteToken: cleanToken }, '-created_date', 1);
      if (quotes && quotes.length > 0 && quotes[0].leadId) {
        leadId = quotes[0].leadId;
        if (!email) email = quotes[0].clientEmail || null;
        if (!firstName) firstName = quotes[0].clientFirstName || null;
        try {
          const repairFields = { leadId };
          if (!request.email || request.email === 'guest@breezpoolcare.com') repairFields.email = email;
          if (!request.firstName) repairFields.firstName = firstName;
          await entities.QuoteRequests.update(request.id, repairFields);
        } catch (_) {}
      }
    } catch (_) {}
  }

  if (leadId) {
    try {
      const leadRows = await entities.Lead.filter({ id: leadId }, null, 1);
      const lead = leadRows?.[0];
      // Deleted or missing lead → INCOMPLETE_DATA (no email rebound)
      if (!lead || lead.isDeleted === true) leadId = null;
    } catch (e) {
      return { code: 'QUERY_ERROR', error: 'Failed to resolve token' };
    }
  }

  if (!leadId || !email) return { code: 'INCOMPLETE_DATA', error: 'Token does not have complete lead information' };
  return { leadId, email, firstName };
}

const json200 = (data) => new Response(
  JSON.stringify(data),
  { status: 200, headers: { "content-type": "application/json; charset=utf-8" } }
);

Deno.serve(async (req) => {
  const requestId = crypto.randomUUID();
  const runtimeVersion = BUILD;
  const meta = { build: BUILD, runtimeVersion, requestId };

  try {
    const base44 = createClientFromRequest(req);
    const payload = await req.json();
    const { token, firstName, phone, email, serviceAddress, requestedDate, requestedTimeSlot } = payload || {};

    console.log('SFI_V1_ENTRY_VERSION', { runtimeVersion, tokenPrefix: token ? token.slice(0, 8) : null, requestId });

    // Validate inputs
    if (!token || typeof token !== 'string') {
      return json200({ success: false, error: 'token is required', ...meta });
    }
    if (!firstName || typeof firstName !== 'string' || !firstName.trim()) {
      return json200({ success: false, error: 'firstName is required', ...meta });
    }
    if (!phone || typeof phone !== 'string' || !phone.trim()) {
      return json200({ success: false, error: 'phone is required', ...meta });
    }
    if (!serviceAddress || typeof serviceAddress !== 'object') {
      return json200({ success: false, error: 'serviceAddress object is required', ...meta });
    }
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

    // Resolve leadId + contact via inlined token resolution (no function invoke)
    const resolved = await resolveTokenInline(base44.asServiceRole.entities, token.trim());
    const leadId = resolved.leadId || null;
    const tokenEmail = resolved.email || null;

    if (!leadId || !tokenEmail) {
      const code = resolved.code || 'INCOMPLETE_DATA';
      let errorMsg;
      if (code === 'TOKEN_NOT_FOUND') {
        errorMsg = 'Invalid or expired token. Please request a new quote link.';
      } else if (code === 'LEAD_UNAVAILABLE') {
        errorMsg = 'This quote is no longer active. Please contact Breez at (321) 524-3838 for assistance.';
      } else {
        errorMsg = 'Token does not have complete lead information. Please request a new quote or contact Breez at (321) 524-3838.';
      }
      console.warn('SFI_V1_RESOLVE_FAILED', { code, tokenPrefix: token.trim().slice(0, 8), runtimeVersion, requestId });
      return json200({ success: false, code, error: errorMsg, ...meta });
    }

    console.log('SFI_V1_TOKEN_RESOLVED', { tokenPrefix: token.trim().slice(0, 8), leadId, requestId });

    const finalEmail = email || tokenEmail;

    // IDEMPOTENCY CHECK
    let existingLead = null;
    if (leadId) {
      try {
        existingLead = await base44.asServiceRole.entities.Lead.filter({ id: leadId }, null, 1);
        if (existingLead && existingLead.length > 0) {
          const lead = existingLead[0];
          if (lead.inspectionScheduled === true && lead.inspectionEventId) {
            console.log('SFI_V1_ALREADY_SCHEDULED', { leadId, eventId: lead.inspectionEventId, requestId });
            return json200({
              success: true,
              alreadyScheduled: true,
              scheduledDate: lead.requestedInspectionDate,
              timeWindow: lead.requestedInspectionTime,
              email: finalEmail,
              firstName: lead.firstName || firstName,
              ...meta
            });
          }
        }
      } catch (e) {
        console.warn('SFI_V1_IDEMPOTENCY_CHECK_FAILED', { error: e.message, requestId });
      }
    }

    const timeWindowMap = {
      morning: '8:00 AM – 11:00 AM',
      midday: '11:00 AM – 2:00 PM',
      afternoon: '2:00 PM – 5:00 PM'
    };
    const timeWindow = timeWindowMap[requestedTimeSlot];
    const serviceAddressStr = `${street.trim()}, ${city.trim()}, ${state.trim()} ${zip.trim()}`;

    // Create CalendarEvent
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
      console.log('SFI_V1_EVENT_CREATED', { eventId: eventCreated.id, leadId, requestId });
    } catch (e) {
      console.error('SFI_V1_EVENT_CREATION_FAILED', { error: e.message, requestId });
      return json200({ success: false, error: 'Failed to create inspection event', detail: e.message, ...meta });
    }

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
          ...(shouldSendNotification && { confirmationSentAt: new Date().toISOString() })
        });
        console.log('SFI_V1_LEAD_UPDATED', { leadId, shouldSendNotification, requestId });

        if (shouldSendNotification) {
          try {
            await base44.functions.invoke('updateLeadStagePublicV1', {
              token: token.trim(),
              newStage: 'inspection_scheduled',
              context: 'schedule-success'
            });
            console.log('SFI_V1_STAGE_PROGRESSED', { leadId, newStage: 'inspection_scheduled', requestId });
          } catch (stageErr) {
            console.warn('SFI_V1_STAGE_UPDATE_FAILED', { error: stageErr.message, requestId });
          }
        }
      } catch (e) {
        console.warn('SFI_V1_LEAD_UPDATE_FAILED', { error: e.message, requestId });
      }
    }

    console.log('SFI_V1_SUCCESS', { leadId, eventId: eventCreated?.id, scheduledDate: requestedDate, requestId });

    return json200({
      success: true,
      scheduledDate: requestedDate,
      timeWindow: timeWindow,
      email: finalEmail,
      firstName: firstName,
      eventId: eventCreated?.id,
      shouldSendNotification: shouldSendNotification,
      ...meta
    });

  } catch (error) {
    console.error('SFI_V1_CRASH', { error: error?.message, requestId });
    return json200({ success: false, error: 'Failed to schedule inspection', detail: error?.message, ...meta });
  }
});