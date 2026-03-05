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

const json200 = (data) => new Response(
  JSON.stringify(data),
  { status: 200, headers: { "content-type": "application/json; charset=utf-8" } }
);

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
      console.warn('SFI_V1_RESOLVE_REPAIR_FAILED', { requestId, error: repairErr.message });
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

    console.log('SFI_V1_ENTRY_VERSION', { requestId, runtimeVersion, token: token ? token.slice(0, 8) : null });

    if (!token || typeof token !== 'string') return json200({ success: false, error: 'token is required', ...meta });
    if (!firstName || typeof firstName !== 'string' || !firstName.trim()) return json200({ success: false, error: 'firstName is required', ...meta });
    if (!phone || typeof phone !== 'string' || !phone.trim()) return json200({ success: false, error: 'phone is required', ...meta });
    if (!serviceAddress || typeof serviceAddress !== 'object') return json200({ success: false, error: 'serviceAddress object is required', ...meta });

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

    }

    const resolveData = await resolveTokenInline(base44, token, requestId);
    if (resolveData?.success !== true || !resolveData.leadId || !resolveData.email) {
      const code = resolveData?.code || 'QUERY_ERROR';
      const errorMap = {
        TOKEN_NOT_FOUND: 'Invalid or expired token',
        INCOMPLETE_DATA: 'Token does not have complete lead information',
        QUERY_ERROR: 'Failed to resolve token'
      };
      console.warn('SFI_V1_RESOLVE_FAILED', { requestId, runtimeVersion, token: token.slice(0, 8), code });
      return json200({ success: false, code, error: errorMap[code] || (resolveData?.error || 'Failed to resolve token'), ...meta });
    }

    const leadId = resolveData.leadId;
    const finalEmail = email || resolveData.email;

    let existingLead = null;
    try {
      existingLead = await base44.asServiceRole.entities.Lead.filter({ id: leadId }, null, 1);
      if (existingLead && existingLead.length > 0) {
        const lead = existingLead[0];
        if (lead.inspectionScheduled === true && lead.inspectionEventId) {
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

    const resolveData = await resolveTokenInline(base44, token, requestId);
    if (resolveData?.success !== true || !resolveData.leadId || !resolveData.email) {
      const code = resolveData?.code || 'QUERY_ERROR';
      const errorMap = {
        TOKEN_NOT_FOUND: 'Invalid or expired token',
        INCOMPLETE_DATA: 'Token does not have complete lead information',
        QUERY_ERROR: 'Failed to resolve token'
      };
      console.warn('SFI_V1_RESOLVE_FAILED', { requestId, runtimeVersion, token: token.slice(0, 8), code });
      return json200({ success: false, code, error: errorMap[code] || (resolveData?.error || 'Failed to resolve token'), ...meta });
    }

    const leadId = resolveData.leadId;
    const finalEmail = email || resolveData.email;

    let existingLead = null;
    try {
      existingLead = await base44.asServiceRole.entities.Lead.filter({ id: leadId }, null, 1);
      if (existingLead && existingLead.length > 0) {
        const lead = existingLead[0];
        if (lead.inspectionScheduled === true && lead.inspectionEventId) {
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

    const resolveData = await resolveTokenInline(base44, token, requestId);
    if (resolveData?.success !== true || !resolveData.leadId || !resolveData.email) {
      const code = resolveData?.code || 'QUERY_ERROR';
      const errorMap = {
        TOKEN_NOT_FOUND: 'Invalid or expired token',
        INCOMPLETE_DATA: 'Token does not have complete lead information',
        QUERY_ERROR: 'Failed to resolve token'
      };
      console.warn('SFI_V1_RESOLVE_FAILED', { requestId, runtimeVersion, token: token.slice(0, 8), code });
      return json200({ success: false, code, error: errorMap[code] || (resolveData?.error || 'Failed to resolve token'), ...meta });
    }

    const leadId = resolveData.leadId;
    const finalEmail = email || resolveData.email;

    let existingLead = null;
    try {
      existingLead = await base44.asServiceRole.entities.Lead.filter({ id: leadId }, null, 1);
      if (existingLead && existingLead.length > 0) {
        const lead = existingLead[0];
        if (lead.inspectionScheduled === true && lead.inspectionEventId) {
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

    const leadId = resolveData.leadId;
    const finalEmail = email || resolveData.email;

    let existingLead = null;
    try {
      existingLead = await base44.asServiceRole.entities.Lead.filter({ id: leadId }, null, 1);
      if (existingLead && existingLead.length > 0) {
        const lead = existingLead[0];
        if (lead.inspectionScheduled === true && lead.inspectionEventId) {
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

    const leadId = resolveData.leadId;
    const finalEmail = email || resolveData.email;

    let existingLead = null;
    try {
      existingLead = await base44.asServiceRole.entities.Lead.filter({ id: leadId }, null, 1);
      if (existingLead && existingLead.length > 0) {
        const lead = existingLead[0];
        if (lead.inspectionScheduled === true && lead.inspectionEventId) {
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

    // Resolve leadId + contact via inlined token resolution (no function invoke)
    const resolved = await resolveTokenInline(base44.asServiceRole.entities, token.trim());
    const leadId = resolved.leadId || null;
    const tokenEmail = resolved.email || null;

    if (!leadId || !tokenEmail) {
      const code = resolved.code || 'INCOMPLETE_DATA';
      const ERROR_MESSAGES = {
        TOKEN_NOT_FOUND:  'Invalid or expired token.',
        INCOMPLETE_DATA:  'Token does not have complete lead information.',
        QUERY_ERROR:      'Failed to resolve token.',
        LEAD_LOOKUP_FAILED: 'Platform temporarily unavailable. Please try again.',
      };
      const errorMsg = ERROR_MESSAGES[code] || 'Token does not have complete lead information.';
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
    } catch (e) {
      console.warn('SFI_V1_IDEMPOTENCY_CHECK_FAILED', { requestId, error: e.message });
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
        leadId,
        eventType: 'inspection',
        scheduledDate: requestedDate,
        timeWindow,
        status: 'scheduled',
        serviceAddress: serviceAddressStr,
        customerNotes: `Name: ${firstName.trim()}\nPhone: ${phone.trim()}\nEmail: ${finalEmail || 'N/A'}`
      });
    } catch (e) {
      console.log('SFI_V1_EVENT_CREATED', { eventId: eventCreated.id, leadId, requestId });
    } catch (e) {
      console.error('SFI_V1_EVENT_CREATION_FAILED', { error: e.message, requestId });
      return json200({ success: false, error: 'Failed to create inspection event', detail: e.message, ...meta });
    }

    const previousStage = existingLead?.[0]?.stage || null;
    const shouldSendNotification = previousStage !== 'inspection_scheduled';

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
    } catch (e) {
      console.warn('SFI_V1_LEAD_UPDATE_FAILED', { requestId, error: e.message });
    }

    }

    }

    }

    }

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
            await base44.asServiceRole.entities.Lead.update(leadId, { stage: 'inspection_scheduled' });
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
      timeWindow,
      email: finalEmail,
      firstName,
      eventId: eventCreated?.id,
      shouldSendNotification,
      shouldSendNotification: shouldSendNotification,
      ...meta
    });
  } catch (error) {
    console.error('SFI_V1_CRASH', { requestId, error: error?.message });
    console.error('SFI_V1_CRASH', { error: error?.message, requestId });
    return json200({ success: false, error: 'Failed to schedule inspection', detail: error?.message, ...meta });
  }
});