import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

/**
 * scheduleFirstInspectionPublicV2
 *
 * Public endpoint to schedule an inspection via token (no login required).
 * NO backend-to-backend function invocations. All logic inlined.
 *
 * Input:  { token, firstName, phone, email, serviceAddress: { street, city, state, zip }, requestedDate (YYYY-MM-DD), requestedTimeSlot }
 * Output: { success, scheduledDate?, timeWindow?, email?, firstName?, alreadyScheduled?, inspectionId?, eventId?,
 *           emailStatus?, build, runtimeVersion, requestId }
 */ 

const BUILD = "SFI-V2-2026-03-04-F";

const json200 = (data) => new Response(
  JSON.stringify(data),
  { status: 200, headers: { "content-type": "application/json; charset=utf-8" } }
);

const timeWindowMap = {
  morning:   '8:00 AM – 11:00 AM',
  midday:    '11:00 AM – 2:00 PM',
  afternoon: '2:00 PM – 5:00 PM'
};

const timeSlotToStart = {
  morning:   '09:00',
  midday:    '12:00',
  afternoon: '14:00'
};

// Stage progression ordering for non-regression guard
const STAGE_ORDER = {
  new_lead: 0, contacted: 1, quote_sent: 2,
  inspection_scheduled: 3, inspection_confirmed: 4, converted: 5, lost: -1
};

// ── Inlined: resolveQuoteTokenPublicV1 semantics ──
// Returns { leadId, email, firstName, quoteRequest } or { code, error }
async function resolveToken(entities, token) {
  const cleanToken = token.trim();

  let request = null;
  try {
    const rows = await entities.QuoteRequests.filter({ token: cleanToken }, null, 1);
    if (rows && rows.length > 0) request = rows[0];
  } catch (e) {
    console.error('SFI_V2_TOKEN_QUERY_FAILED', { error: e.message });
    return { code: 'LEAD_LOOKUP_FAILED', error: 'Platform temporarily unavailable' };
  }

  if (!request) {
    return { code: 'TOKEN_NOT_FOUND', error: 'Token not found or invalid' };
  }

  let leadId    = request.leadId  || null;
  let email     = request.email   || null;
  let firstName = request.firstName || null;

  if (email === 'guest@breezpoolcare.com') email = null;

  // Repair path: if leadId missing, try Quote entity
  if (!leadId) {
    try {
      const quotes = await entities.Quote.filter({ quoteToken: cleanToken }, '-created_date', 1);
      if (quotes && quotes.length > 0) {
        const q = quotes[0];
        if (q.leadId) {
          leadId = q.leadId;
          if (!email)     email     = q.clientEmail     || null;
          if (!firstName) firstName = q.clientFirstName || null;
          try {
            const repairFields = { leadId };
            if (!request.email || request.email === 'guest@breezpoolcare.com') repairFields.email = email;
            if (!request.firstName) repairFields.firstName = firstName;
            await entities.QuoteRequests.update(request.id, repairFields);
          } catch (e) {
            console.warn('SFI_V2_TOKEN_REPAIR_WRITE_FAILED', { error: e.message });
          }
        }
      }
    } catch (e) {
      console.warn('SFI_V2_TOKEN_REPAIR_FAILED', { error: e.message });
    }
  }

  // Validate lead is not soft-deleted
  if (leadId) {
    try {
      const leadRows = await entities.Lead.filter({ id: leadId }, null, 1);
      const lead = leadRows?.[0];
      // Deleted or missing lead → INCOMPLETE_DATA (no email rebound)
      if (!lead || lead.isDeleted === true) {
        console.log('SFI_V2_LEAD_UNAVAILABLE', { tokenPrefix: cleanToken.slice(0, 8), reason: lead ? 'lead_soft_deleted' : 'lead_not_found' });
        leadId = null;
      }
    } catch (e) {
      console.warn('SFI_V2_LEAD_VALIDATE_FAILED', { error: e.message });
      return { code: 'LEAD_LOOKUP_FAILED', error: 'Platform temporarily unavailable' };
    }
  }

  if (!leadId || !email) {
    return { code: 'INCOMPLETE_DATA', error: 'Token does not have complete lead information' };
  }

  return { leadId, email, firstName, quoteRequest: request };
}

// ── Token lifecycle validation ──
// NOTE: The scheduling token IS the quoteToken (QuoteRequests.token == Quote.quoteToken).
// scheduleTokenUsedAt on Quote is set AFTER scheduling succeeds — we only block if
// an InspectionRecord already exists (handled by idempotency check above).
// We only check hard expiry here, not used-at, to avoid false rejections.
async function validateTokenLifecycle(entities, token) {
  try {
    const quotes = await entities.Quote.filter({ quoteToken: token.trim() }, null, 1);
    if (!quotes || quotes.length === 0) return { valid: true };

    const quote = quotes[0];
    const now = new Date();

    // Only check expiry if a dedicated scheduleTokenExpiresAt was set (not quoteToken expiry)
    if (quote.scheduleTokenExpiresAt && quote.scheduleToken) {
      const expiryTime = new Date(quote.scheduleTokenExpiresAt);
      if (now > expiryTime) {
        console.warn('SFI_V2_TOKEN_EXPIRED', { tokenPrefix: token.trim().slice(0, 8), expiresAt: quote.scheduleTokenExpiresAt });
        return { valid: false, code: 'TOKEN_EXPIRED', message: 'This scheduling link has expired. Please request a new quote or contact support.' };
      }
    }

    // Do NOT block on scheduleTokenUsedAt here — idempotency check (InspectionRecord) handles deduplication
    return { valid: true };
  } catch (e) {
    console.warn('SFI_V2_TOKEN_LIFECYCLE_CHECK_FAILED', { error: e.message });
    return { valid: true };
  }
}

// ── Non-regression stage update ──
async function updateLeadStage(entities, leadId, newStage) {
  try {
    const lead = await entities.Lead.get(leadId);
    const oldStage = lead?.stage || 'new_lead';
    if (oldStage === newStage) return;
    const oldOrder = STAGE_ORDER[oldStage] ?? -999;
    const newOrder = STAGE_ORDER[newStage] ?? -999;
    if (newOrder < oldOrder && newStage !== 'lost') {
      console.warn('SFI_V2_STAGE_REGRESSION_BLOCKED', { leadId, oldStage, newStage });
      return;
    }
    await entities.Lead.update(leadId, { stage: newStage });
    console.log('SFI_V2_STAGE_UPDATED', { leadId, oldStage, newStage });
  } catch (e) {
    console.warn('SFI_V2_STAGE_UPDATE_FAILED', { error: e.message });
  }
}

// ── Capacity checkers ──
const DEFAULT_DRIVE_TIME_MINUTES = 30;
const MAX_JOBS_PER_DAY = 10;
const MAX_INSPECTIONS_PER_BLOCK = 3;

async function checkTechnicianDailyCapacity(entities, requestedDate, maxCap = MAX_JOBS_PER_DAY) {
  try {
    const events = await entities.CalendarEvent.filter(
      { scheduledDate: requestedDate, status: { $ne: 'cancelled' } }, null, 1000
    );
    const activeCount = (events || []).length;
    if (activeCount >= maxCap) {
      console.warn('SFI_V2_TECH_DAILY_CAP', { date: requestedDate, count: activeCount, cap: maxCap });
      return { allowed: false, code: 'TECH_DAILY_CAP_REACHED', message: `Maximum ${maxCap} inspections/services reached for this date. Please choose another date.`, details: { date: requestedDate, currentCount: activeCount, cap: maxCap } };
    }
    return { allowed: true };
  } catch (e) {
    console.warn('SFI_V2_TECH_DAILY_CAP_CHECK_FAILED', { error: e.message });
    return { allowed: true };
  }
}

async function checkInspectionBlockCapacity(entities, requestedDate, requestedTimeSlot, maxCap = MAX_INSPECTIONS_PER_BLOCK) {
  try {
    const timeWindow = timeWindowMap[requestedTimeSlot];
    const blockEvents = await entities.CalendarEvent.filter(
      { scheduledDate: requestedDate, eventType: 'inspection', status: { $ne: 'cancelled' } }, null, 1000
    );
    const blockCount = (blockEvents || []).filter(e => e.timeWindow === timeWindow).length;
    if (blockCount >= maxCap) {
      console.warn('SFI_V2_INSPECTION_BLOCK_CAP', { date: requestedDate, timeWindow, count: blockCount, cap: maxCap });
      return { allowed: false, code: 'INSPECTION_BLOCK_CAP_REACHED', message: `Maximum ${maxCap} inspections available for this time slot. Please choose another time.`, details: { date: requestedDate, timeWindow, currentCount: blockCount, cap: maxCap } };
    }
    return { allowed: true };
  } catch (e) {
    console.warn('SFI_V2_INSPECTION_BLOCK_CAP_CHECK_FAILED', { error: e.message });
    return { allowed: true };
  }
}

async function checkDriveTimeFeasibility(entities, requestedDate, startTime) {
  try {
    const dayEvents = await entities.CalendarEvent.filter(
      { scheduledDate: requestedDate, status: { $ne: 'cancelled' } }, 'startTime', 1000
    );
    if (!dayEvents || dayEvents.length === 0) return { allowed: true };

    const reqHours = parseInt(startTime.split(':')[0]);
    const reqMinutes = parseInt(startTime.split(':')[1] || 0);
    const reqTimeInMinutes = reqHours * 60 + reqMinutes;
    const INSPECTION_DURATION = 30;
    const DRIVE_BUFFER = DEFAULT_DRIVE_TIME_MINUTES;

    for (const evt of dayEvents) {
      if (!evt.startTime) continue;
      const evtHours = parseInt(evt.startTime.split(':')[0]);
      const evtMinutes = parseInt(evt.startTime.split(':')[1] || 0);
      const evtTimeInMinutes = evtHours * 60 + evtMinutes;
      const evtDuration = evt.estimatedDuration || 45;
      const evtStart = evtTimeInMinutes - DRIVE_BUFFER;
      const evtEnd = evtTimeInMinutes + evtDuration + DRIVE_BUFFER;

      if (reqTimeInMinutes >= evtStart && reqTimeInMinutes <= evtEnd) {
        console.warn('SFI_V2_DRIVE_TIME_CONFLICT', { date: requestedDate, reqTime: startTime, existingEvent: evt.id });
        return { allowed: false, code: 'DRIVE_TIME_CONFLICT', message: 'Insufficient travel time between appointments. Please choose another time slot.', details: { date: requestedDate, requestedTime: startTime, buffer: DRIVE_BUFFER } };
      }
    }
    return { allowed: true };
  } catch (e) {
    console.warn('SFI_V2_DRIVE_TIME_CHECK_FAILED', { error: e.message });
    return { allowed: true };
  }
}

// ── Confirmation email ──
async function sendConfirmationEmail(entities, integrations, { leadId, firstName, email, inspectionDate, inspectionTime, force }) {
  try {
    if (leadId && !force) {
      const lead = await entities.Lead.get(leadId).catch(() => null);
      if (lead?.inspectionConfirmationSent) {
        console.log('SFI_V2_EMAIL_SKIPPED', { leadId, reason: 'already_sent' });
        return 'skipped';
      }
    }

    const dateFormatted = inspectionDate
      ? new Date(inspectionDate + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
      : 'To be scheduled';

    const subject = `Inspection Confirmed — ${dateFormatted} · Breez Pool Care`;
    const body = `Hi ${firstName || 'Customer'},

Your free pool inspection with Breez Pool Care is confirmed!

DATE: ${dateFormatted}
TIME WINDOW: ${inspectionTime || 'To be confirmed'}
INSPECTOR: Matt

WHAT TO EXPECT
--------------
• We will call approximately one hour before arrival.
• The inspection typically takes 20–30 minutes.
• We will test your water chemistry, inspect equipment and circulation, and answer any questions you have.
• No obligation — this visit is completely free.

WHAT TO PREPARE
---------------
• Homeowner or designated caretaker must be present.
• Please ensure we can access the pool area.

If you need to reschedule or have any questions, call us at (321) 524-3838 or reply to this email.

We look forward to meeting you!

Breez Pool Care LLC
Owner/Operator: Matt Inghram
(321) 524-3838
Mon–Sat: 8am–6pm`;

    await integrations.Core.SendEmail({ to: email, subject, body, from_name: 'Breez Pool Care' });

    if (leadId) {
      await entities.Lead.update(leadId, {
        inspectionConfirmationSent: true,
        confirmationSentAt: new Date().toISOString()
      }).catch(e => console.warn('SFI_V2_CONFIRMATION_FLAG_FAILED', { error: e.message }));
    }

    console.log('SFI_V2_EMAIL_SENT', { leadId, emailPrefix: email.slice(0, 5) });
    return 'sent';
  } catch (e) {
    console.error('SFI_V2_EMAIL_FAILED', { error: e.message });
    return 'failed';
  }
}

// ── Main Handler ──
Deno.serve(async (req) => {
  const requestId = crypto.randomUUID();
  const runtimeVersion = BUILD;
  const meta = { build: BUILD, runtimeVersion, requestId };

  try {
    const payload = await req.json();
    const { token, firstName, phone, email, serviceAddress, requestedDate, requestedTimeSlot } = payload || {};

    console.log('SFI_V2_ENTRY_VERSION', { runtimeVersion, tokenPrefix: token ? token.slice(0, 8) : null, requestId });

    // Input validation
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

    const base44Request = createClientFromRequest(req);
    const entities = base44Request.asServiceRole.entities;
    const integrations = base44Request.asServiceRole.integrations;

    console.log('SFI_V2_ENTRY_VERSION', { runtimeVersion, mode: 'service_role', tokenPrefix: token.slice(0, 8), requestId });

    // Resolve token (inlined)
    const resolved = await resolveToken(entities, token);
    if (!resolved.leadId) {
      const code = resolved.code || 'INCOMPLETE_DATA';
      const ERROR_MESSAGES = {
        TOKEN_NOT_FOUND:    'Invalid or expired token.',
        INCOMPLETE_DATA:    'Token does not have complete lead information.',
        QUERY_ERROR:        'Failed to resolve token.',
        LEAD_LOOKUP_FAILED: 'Platform temporarily unavailable. Please try again.',
      };
      const errorMsg = ERROR_MESSAGES[code] || 'Token does not have complete lead information.';
      console.warn('SFI_V2_RESOLVE_FAILED', { code, tokenPrefix: token.slice(0, 8), runtimeVersion, requestId });
      return json200({ success: false, code, error: errorMsg, ...meta });
    }

    const { leadId, email: tokenEmail } = resolved;
    const finalEmail     = email || tokenEmail;
    const finalFirstName = firstName.trim();

    // Token lifecycle check
    const lifecycleCheck = await validateTokenLifecycle(entities, token);
    if (!lifecycleCheck.valid) {
      console.log('SFI_V2_TOKEN_LIFECYCLE_FAILED', { code: lifecycleCheck.code, requestId });
      return json200({ success: false, code: lifecycleCheck.code, error: lifecycleCheck.message, ...meta });
    }

    const serviceAddressStr = `${street.trim()}, ${city.trim()}, ${state.trim()} ${zip.trim()}`;
    const timeWindow = timeWindowMap[requestedTimeSlot];
    const startTime  = timeSlotToStart[requestedTimeSlot];

    // IDEMPOTENCY: check existing non-cancelled InspectionRecord
    try {
      const existing = await entities.InspectionRecord.filter(
        { leadId, appointmentStatus: { $ne: 'cancelled' } }, '-created_date', 1
      );
      if (existing && existing.length > 0) {
        const insp = existing[0];
        console.log('SFI_V2_ALREADY_SCHEDULED', { leadIdPrefix: leadId.slice(0, 8), inspectionId: insp.id, requestId });
        return json200({
          success: true,
          alreadyScheduled: true,
          scheduledDate: insp.scheduledDate,
          timeWindow: insp.timeWindow,
          email: finalEmail,
          firstName: finalFirstName,
          inspectionId: insp.id,
          eventId: insp.calendarEventId,
          ...meta
        });
      }
    } catch (e) {
      console.warn('SFI_V2_IDEMPOTENCY_CHECK_FAILED', { error: e.message, requestId });
    }

    // Capacity constraints
    let maxJobsPerDay = MAX_JOBS_PER_DAY;
    try {
      const settings = await entities.SchedulingSettings.filter({ settingKey: 'default' }, null, 1);
      if (settings?.[0]?.maxJobsPerDay) maxJobsPerDay = settings[0].maxJobsPerDay;
    } catch (e) {
      console.warn('SFI_V2_SETTINGS_LOAD_FAILED', { error: e.message });
    }

    const dailyCapCheck = await checkTechnicianDailyCapacity(entities, requestedDate, maxJobsPerDay);
    if (!dailyCapCheck.allowed) {
      return json200({ success: false, code: dailyCapCheck.code, error: dailyCapCheck.message, details: dailyCapCheck.details, ...meta });
    }

    const blockCapCheck = await checkInspectionBlockCapacity(entities, requestedDate, requestedTimeSlot);
    if (!blockCapCheck.allowed) {
      return json200({ success: false, code: blockCapCheck.code, error: blockCapCheck.message, details: blockCapCheck.details, ...meta });
    }

    const driveTimeCheck = await checkDriveTimeFeasibility(entities, requestedDate, startTime);
    if (!driveTimeCheck.allowed) {
      return json200({ success: false, code: driveTimeCheck.code, error: driveTimeCheck.message, details: driveTimeCheck.details, ...meta });
    }

    // Step 1: Create InspectionRecord
    const createPayload = {
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
    try {
      inspection = await entities.InspectionRecord.create(createPayload);
      console.log('SFI_V2_INSPECTION_CREATED', { leadIdPrefix: leadId.slice(0, 8), inspectionId: inspection.id, requestId });
    } catch (e) {
      const isPermissionError = e?.status === 403 || e?.message?.includes('Permission denied');
      const createPayloadShape = {
        hasLeadId: !!createPayload.leadId,
        appointmentStatus: createPayload.appointmentStatus,
        finalizationStatus: createPayload.finalizationStatus,
        submittedByUserId: createPayload.submittedByUserId,
        submittedByName: createPayload.submittedByName,
        customerPresent: createPayload.customerPresent
      };

      console.error('SFI_V2_INSPECTION_CREATE_FAILED_DIAG', {
        isPermissionError,
        errorMsg: e.message,
        errorStatus: e?.status,
        ...createPayloadShape,
        runtimeVersion,
        requestId
      });

      return json200({
        success: false,
        code: isPermissionError ? 'INSPECTION_CREATE_FORBIDDEN' : 'INSPECTION_CREATE_FAILED',
        error: isPermissionError
          ? 'Unable to schedule inspection right now. Please contact Breez at (321) 524-3838.'
          : 'Failed to create inspection record',
        detail: e.message,
        createPayloadShape,
        ...meta
      });
    }

    // Step 2: Cancel any existing active inspection CalendarEvents
    try {
      const existing = await entities.CalendarEvent.filter({ leadId, eventType: 'inspection' }, null, 100);
      const active = (existing || []).filter(e => e.status !== 'cancelled');
      for (const ev of active) {
        await entities.CalendarEvent.update(ev.id, {
          status: 'cancelled',
          cancelledAt: new Date().toISOString(),
          cancelReason: 'duplicate_inspection_event_cleanup'
        }).catch(e => console.warn('SFI_V2_DUPLICATE_CANCEL_FAILED', { eventId: ev.id, error: e.message }));
        console.log('SFI_V2_CANCELLED_DUPLICATE', { leadIdPrefix: leadId.slice(0, 8), eventId: ev.id });
      }
    } catch (e) {
      console.warn('SFI_V2_EXISTING_EVENTS_QUERY_FAILED', { error: e.message });
    }

    // Step 3: Create CalendarEvent
    let calendarEvent = null;
    try {
      calendarEvent = await entities.CalendarEvent.create({
        leadId,
        eventType: 'inspection',
        scheduledDate: requestedDate,
        startTime,
        timeWindow,
        status: 'scheduled',
        serviceAddress: serviceAddressStr,
        customerNotes: `Name: ${finalFirstName}\nPhone: ${phone.trim()}\nEmail: ${finalEmail || 'N/A'}`
      });
      console.log('SFI_V2_EVENT_CREATED', { leadIdPrefix: leadId.slice(0, 8), eventId: calendarEvent.id, requestId });
    } catch (e) {
      console.error('SFI_V2_EVENT_CREATE_FAILED', { error: e.message, requestId });
      return json200({ success: false, error: 'Failed to create calendar event', detail: e.message, ...meta });
    }

    // Step 4: Link CalendarEvent → InspectionRecord
    try {
      await entities.InspectionRecord.update(inspection.id, { calendarEventId: calendarEvent.id });
      console.log('SFI_V2_INSPECTION_LINKED', { inspectionId: inspection.id, calendarEventId: calendarEvent.id });
    } catch (e) {
      console.warn('SFI_V2_LINK_FAILED', { error: e.message });
    }

    // Step 5: Sync Lead + stage update + consume token
    let shouldSendNotification = false;
    try {
      const leads = await entities.Lead.filter({ id: leadId }, null, 1);
      if (leads && leads.length > 0) {
        const lead = leads[0];
        shouldSendNotification = lead.stage !== 'inspection_scheduled';

        await entities.Lead.update(leadId, {
          firstName: finalFirstName,
          mobilePhone: phone.trim(),
          inspectionScheduled: true,
          inspectionEventId: calendarEvent.id,
          requestedInspectionDate: requestedDate,
          requestedInspectionTime: requestedTimeSlot,
          serviceAddress: serviceAddressStr,
        });
        console.log('SFI_V2_LEAD_SYNCED', { leadIdPrefix: leadId.slice(0, 8), shouldSendNotification, requestId });

        if (shouldSendNotification) {
          await updateLeadStage(entities, leadId, 'inspection_scheduled');
        }
      }
    } catch (e) {
      console.warn('SFI_V2_LEAD_SYNC_FAILED', { error: e.message });
    }

    // Consume token
    try {
      const quotes = await entities.Quote.filter({ quoteToken: token.trim() }, null, 1);
      if (quotes && quotes.length > 0) {
        const quote = quotes[0];
        if (!quote.scheduleTokenUsedAt) {
          await entities.Quote.update(quote.id, { scheduleTokenUsedAt: new Date().toISOString() });
          console.log('SFI_V2_TOKEN_CONSUMED', { quoteId: quote.id, tokenPrefix: token.trim().slice(0, 8) });
        }
      }
    } catch (e) {
      console.warn('SFI_V2_TOKEN_CONSUMPTION_FAILED', { error: e.message });
    }

    // Step 6: Send confirmation email — always force=true since we just created a new inspection
    const emailStatus = await sendConfirmationEmail(entities, integrations, {
      leadId,
      firstName: finalFirstName,
      email: finalEmail,
      inspectionDate: requestedDate,
      inspectionTime: timeWindow,
      force: true
    });

    console.log('SFI_V2_SUCCESS', { leadIdPrefix: leadId.slice(0, 8), inspectionId: inspection.id, eventId: calendarEvent.id, scheduledDate: requestedDate, emailStatus, requestId });

    return json200({
      success: true,
      scheduledDate: requestedDate,
      timeWindow,
      email: finalEmail,
      firstName: finalFirstName,
      inspectionId: inspection.id,
      eventId: calendarEvent.id,
      shouldSendNotification,
      emailStatus,
      ...meta
    });

  } catch (error) {
    console.error('SFI_V2_CRASH', { error: error?.message, requestId });
    return json200({ success: false, error: 'Failed to schedule inspection', ...meta });
  }
});