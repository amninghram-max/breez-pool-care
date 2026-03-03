import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * scheduleFirstInspectionPublicV2
 *
 * Public endpoint to schedule an inspection via token (no login required).
 * Architecture-compliant: NO backend-to-backend function invocations.
 * All logic inlined: token resolution, stage update, confirmation email.
 *
 * CRITICAL: Uses pure service-role client (not derived from request auth context)
 * to bypass RLS restrictions on public endpoints with unauthenticated requests.
 *
 * Input:  { token, firstName, phone, email, serviceAddress: { street, city, state, zip }, requestedDate (YYYY-MM-DD), requestedTimeSlot }
 * Output: { success, scheduledDate?, timeWindow?, email?, firstName?, alreadyScheduled?, inspectionId?, eventId?, emailStatus?, build }
 */

const BUILD = "SFI-V2-2026-03-03-B";

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

// ── Inlined: resolveQuoteTokenPublicV1 semantics + lifecycle validation ──
// Returns { leadId, email, firstName } or throws with a code.
async function resolveToken(base44, token) {
  const cleanToken = token.trim();

  // 1. Look up QuoteRequests
  let request = null;
  try {
    const rows = await base44.asServiceRole.entities.QuoteRequests.filter({ token: cleanToken }, null, 1);
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

  // 2. Repair path: if leadId missing, try Quote entity
  if (!leadId) {
    try {
      const quotes = await base44.asServiceRole.entities.Quote.filter({ quoteToken: cleanToken }, '-created_date', 1);
      if (quotes && quotes.length > 0) {
        const q = quotes[0];
        if (q.leadId) {
          leadId = q.leadId;
          if (!email)     email     = q.clientEmail     || null;
          if (!firstName) firstName = q.clientFirstName || null;
          // Write repair back
          try {
            const repairFields = { leadId };
            if (!request.email || request.email === 'guest@breezpoolcare.com') repairFields.email = email;
            if (!request.firstName) repairFields.firstName = firstName;
            await base44.asServiceRole.entities.QuoteRequests.update(request.id, repairFields);
          } catch (e) {
            console.warn('SFI_V2_TOKEN_REPAIR_WRITE_FAILED', { error: e.message });
          }
        }
      }
    } catch (e) {
      console.warn('SFI_V2_TOKEN_REPAIR_FAILED', { error: e.message });
    }
  }

  // 3. Validate lead is not soft-deleted (EXPLICIT UNAVAILABLE CHECK)
  if (leadId) {
    try {
      const leadRows = await base44.asServiceRole.entities.Lead.filter({ id: leadId }, null, 1);
      const lead = leadRows?.[0];
      if (lead && lead.isDeleted === true) {
        // Lead exists but is soft-deleted — explicit LEAD_UNAVAILABLE
        console.log('SFI_V2_LEAD_UNAVAILABLE', {
          token: cleanToken.slice(0, 8),
          leadId: leadId.slice(0, 8),
          reason: 'lead_soft_deleted'
        });
        return { code: 'LEAD_UNAVAILABLE', error: 'This quote is no longer active. Please contact Breez at (321) 524-3838 for assistance.' };
      }
      if (!lead) {
        leadId = null; // Force INCOMPLETE_DATA (true missing-link case)
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
// Check expiry and consumption state of scheduleToken
async function validateTokenLifecycle(base44, token) {
  try {
    const quotes = await base44.asServiceRole.entities.Quote.filter({ quoteToken: token.trim() }, null, 1);
    if (!quotes || quotes.length === 0) {
      // Token not found in Quote; not an error here (resolveToken handles it)
      return { valid: true };
    }

    const quote = quotes[0];
    const now = new Date();

    // Check expiry
    if (quote.scheduleTokenExpiresAt) {
      const expiryTime = new Date(quote.scheduleTokenExpiresAt);
      if (now > expiryTime) {
        console.warn('SFI_V2_TOKEN_EXPIRED', { token: token.trim().slice(0, 8), expiresAt: quote.scheduleTokenExpiresAt });
        return {
          valid: false,
          code: 'TOKEN_EXPIRED',
          message: 'This scheduling link has expired. Please request a new quote or contact support.'
        };
      }
    }

    // Check consumed
    if (quote.scheduleTokenUsedAt) {
      console.warn('SFI_V2_TOKEN_ALREADY_USED', { token: token.trim().slice(0, 8) });
      return {
        valid: false,
        code: 'TOKEN_ALREADY_USED',
        message: 'This scheduling link has already been used. To reschedule, please contact us at (321) 524-3838.'
      };
    }

    return { valid: true };
  } catch (e) {
    console.warn('SFI_V2_TOKEN_LIFECYCLE_CHECK_FAILED', { error: e.message });
    // Non-fatal: allow to proceed
    return { valid: true };
  }
}

// ── Inlined: updateLeadStagePublicV1 semantics ──
// Non-regression forward-only stage update. Failures are non-fatal (warn only).
async function updateLeadStage(base44, leadId, newStage) {
  try {
    const lead = await base44.asServiceRole.entities.Lead.get(leadId);
    const oldStage = lead?.stage || 'new_lead';
    if (oldStage === newStage) return; // idempotent
    const oldOrder = STAGE_ORDER[oldStage] ?? -999;
    const newOrder = STAGE_ORDER[newStage] ?? -999;
    if (newOrder < oldOrder && newStage !== 'lost') {
      console.warn('SFI_V2_STAGE_REGRESSION_BLOCKED', { leadId, oldStage, newStage });
      return;
    }
    await base44.asServiceRole.entities.Lead.update(leadId, { stage: newStage });
    console.log('SFI_V2_STAGE_UPDATED', { leadId, oldStage, newStage });
  } catch (e) {
    console.warn('SFI_V2_STAGE_UPDATE_FAILED', { error: e.message });
  }
}

// ── Capacity constraint checkers ──
// Returns { allowed: true } or { allowed: false, code: string, message: string, details: object }

// Conservative drive-time buffer (minutes) when historical data unavailable
const DEFAULT_DRIVE_TIME_MINUTES = 30;
const MAX_JOBS_PER_DAY = 10; // Default cap (can be overridden by SchedulingSettings.maxJobsPerDay)
const MAX_INSPECTIONS_PER_BLOCK = 3;

async function checkTechnicianDailyCapacity(base44, requestedDate, maxCap = MAX_JOBS_PER_DAY) {
  try {
    const events = await base44.asServiceRole.entities.CalendarEvent.filter(
      { scheduledDate: requestedDate, status: { $ne: 'cancelled' } },
      null,
      1000
    );
    const activeCount = (events || []).length;
    
    if (activeCount >= maxCap) {
      console.warn('SFI_V2_TECH_DAILY_CAP', { date: requestedDate, count: activeCount, cap: maxCap });
      return {
        allowed: false,
        code: 'TECH_DAILY_CAP_REACHED',
        message: `Maximum ${maxCap} inspections/services reached for this date. Please choose another date.`,
        details: { date: requestedDate, currentCount: activeCount, cap: maxCap }
      };
    }
    
    return { allowed: true };
  } catch (e) {
    console.warn('SFI_V2_TECH_DAILY_CAP_CHECK_FAILED', { error: e.message });
    // Non-fatal: allow booking to proceed on check failure
    return { allowed: true };
  }
}

async function checkInspectionBlockCapacity(base44, requestedDate, requestedTimeSlot, maxCap = MAX_INSPECTIONS_PER_BLOCK) {
  try {
    const timeWindow = timeWindowMap[requestedTimeSlot];
    const blockEvents = await base44.asServiceRole.entities.CalendarEvent.filter(
      { scheduledDate: requestedDate, eventType: 'inspection', status: { $ne: 'cancelled' } },
      null,
      1000
    );
    
    // Count inspections in the same time block
    const blockCount = (blockEvents || []).filter(e => e.timeWindow === timeWindow).length;
    
    if (blockCount >= maxCap) {
      console.warn('SFI_V2_INSPECTION_BLOCK_CAP', { date: requestedDate, timeWindow, count: blockCount, cap: maxCap });
      return {
        allowed: false,
        code: 'INSPECTION_BLOCK_CAP_REACHED',
        message: `Maximum ${maxCap} inspections available for this time slot. Please choose another time.`,
        details: { date: requestedDate, timeWindow, currentCount: blockCount, cap: maxCap }
      };
    }
    
    return { allowed: true };
  } catch (e) {
    console.warn('SFI_V2_INSPECTION_BLOCK_CAP_CHECK_FAILED', { error: e.message });
    return { allowed: true };
  }
}

async function checkDriveTimeFeasibility(base44, requestedDate, startTime) {
  try {
    // Fetch all events on the same day (sorted by time)
    const dayEvents = await base44.asServiceRole.entities.CalendarEvent.filter(
      { scheduledDate: requestedDate, status: { $ne: 'cancelled' } },
      'startTime',
      1000
    );
    
    if (!dayEvents || dayEvents.length === 0) {
      // No existing events, always feasible
      return { allowed: true };
    }
    
    // Check feasibility with adjacent events
    const reqHours = parseInt(startTime.split(':')[0]);
    const reqMinutes = parseInt(startTime.split(':')[1] || 0);
    const reqTimeInMinutes = reqHours * 60 + reqMinutes;
    
    // Simplified check: verify no back-to-back conflicts
    // (assume 30 min inspection + 30 min drive-time buffer)
    const INSPECTION_DURATION = 30;
    const DRIVE_BUFFER = DEFAULT_DRIVE_TIME_MINUTES;
    const REQUIRED_WINDOW = INSPECTION_DURATION + DRIVE_BUFFER * 2;
    
    for (const evt of dayEvents) {
      if (!evt.startTime) continue;
      const evtHours = parseInt(evt.startTime.split(':')[0]);
      const evtMinutes = parseInt(evt.startTime.split(':')[1] || 0);
      const evtTimeInMinutes = evtHours * 60 + evtMinutes;
      const evtDuration = evt.estimatedDuration || 45;
      
      // Check overlap: requested time within existing event's window (with buffer)
      const evtStart = evtTimeInMinutes - DRIVE_BUFFER;
      const evtEnd = evtTimeInMinutes + evtDuration + DRIVE_BUFFER;
      
      if (reqTimeInMinutes >= evtStart && reqTimeInMinutes <= evtEnd) {
        console.warn('SFI_V2_DRIVE_TIME_CONFLICT', { date: requestedDate, reqTime: startTime, existingEvent: evt.id });
        return {
          allowed: false,
          code: 'DRIVE_TIME_CONFLICT',
          message: 'Insufficient travel time between appointments. Please choose another time slot.',
          details: { date: requestedDate, requestedTime: startTime, buffer: DRIVE_BUFFER }
        };
      }
    }
    
    return { allowed: true };
  } catch (e) {
    console.warn('SFI_V2_DRIVE_TIME_CHECK_FAILED', { error: e.message });
    return { allowed: true };
  }
}

// ── Inlined: sendInspectionConfirmation semantics ──
// Returns 'sent' | 'skipped' | 'failed'. Non-fatal.
async function sendConfirmationEmail(base44, { leadId, firstName, email, inspectionDate, inspectionTime, force }) {
  try {
    // Idempotency: skip if already sent and not forced
    if (leadId && !force) {
      const lead = await base44.asServiceRole.entities.Lead.get(leadId).catch(() => null);
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

    await base44.asServiceRole.integrations.Core.SendEmail({
      to: email,
      subject,
      body,
      from_name: 'Breez Pool Care'
    });

    if (leadId) {
      await base44.asServiceRole.entities.Lead.update(leadId, {
        inspectionConfirmationSent: true,
        confirmationSentAt: new Date().toISOString()
      }).catch(e => console.warn('SFI_V2_CONFIRMATION_FLAG_FAILED', { error: e.message }));
    }

    console.log('SFI_V2_EMAIL_SENT', { leadId, email: email.slice(0, 5) });
    return 'sent';
  } catch (e) {
    console.error('SFI_V2_EMAIL_FAILED', { error: e.message });
    return 'failed';
  }
}

// ── Main Handler ──
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const payload = await req.json();
    const { token, firstName, phone, email, serviceAddress, requestedDate, requestedTimeSlot } = payload || {};

    // Input validation
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

    // Resolve token (inlined — no function invoke)
    const resolved = await resolveToken(base44, token);
    if (!resolved.leadId) {
      console.warn('SFI_V2_TOKEN_RESOLUTION_FAILED', { code: resolved.code });
      return json200({
        success: false,
        code: resolved.code,
        error: resolved.error || 'Token not found or invalid',
        build: BUILD
      });
    }
    const { leadId, email: tokenEmail, firstName: tokenFirstName } = resolved;
    const finalEmail     = email || tokenEmail;
    const finalFirstName = firstName.trim();

    // Validate token lifecycle (expiry + consumption)
    const lifecycleCheck = await validateTokenLifecycle(base44, token);
    if (!lifecycleCheck.valid) {
      console.log('SFI_V2_TOKEN_LIFECYCLE_FAILED', { code: lifecycleCheck.code });
      return json200({
        success: false,
        code: lifecycleCheck.code,
        error: lifecycleCheck.message,
        build: BUILD
      });
    }

    const serviceAddressStr = `${street.trim()}, ${city.trim()}, ${state.trim()} ${zip.trim()}`;
    const timeWindow = timeWindowMap[requestedTimeSlot];
    const startTime  = timeSlotToStart[requestedTimeSlot];

    // IDEMPOTENCY: check existing non-cancelled InspectionRecord
    try {
      const existing = await base44.asServiceRole.entities.InspectionRecord.filter(
        { leadId, appointmentStatus: { $ne: 'cancelled' } },
        '-created_date',
        1
      );
      if (existing && existing.length > 0) {
        const insp = existing[0];
        console.log('SFI_V2_ALREADY_SCHEDULED', { leadId, inspectionId: insp.id });
        return json200({
          success: true,
          alreadyScheduled: true,
          scheduledDate: insp.scheduledDate,
          timeWindow: insp.timeWindow,
          email: finalEmail,
          firstName: finalFirstName,
          inspectionId: insp.id,
          eventId: insp.calendarEventId,
          build: BUILD
        });
      }
    } catch (e) {
      console.warn('SFI_V2_IDEMPOTENCY_CHECK_FAILED', { error: e.message });
    }

    // CAPACITY CONSTRAINTS: Check before creating booking
    // Load max cap from SchedulingSettings if available, otherwise use default
    let maxJobsPerDay = MAX_JOBS_PER_DAY;
    try {
      const settings = await base44.asServiceRole.entities.SchedulingSettings.filter({ settingKey: 'default' }, null, 1);
      if (settings?.[0]?.maxJobsPerDay) {
        maxJobsPerDay = settings[0].maxJobsPerDay;
      }
    } catch (e) {
      console.warn('SFI_V2_SETTINGS_LOAD_FAILED', { error: e.message });
    }

    // Check 1: Per-technician daily capacity
    const dailyCapCheck = await checkTechnicianDailyCapacity(base44, requestedDate, maxJobsPerDay);
    if (!dailyCapCheck.allowed) {
      console.log('SFI_V2_CAPACITY_CONSTRAINT_VIOLATED', { code: dailyCapCheck.code });
      return json200({
        success: false,
        code: dailyCapCheck.code,
        error: dailyCapCheck.message,
        details: dailyCapCheck.details,
        build: BUILD
      });
    }

    // Check 2: Initial inspection time-block capacity
    const blockCapCheck = await checkInspectionBlockCapacity(base44, requestedDate, requestedTimeSlot);
    if (!blockCapCheck.allowed) {
      console.log('SFI_V2_CAPACITY_CONSTRAINT_VIOLATED', { code: blockCapCheck.code });
      return json200({
        success: false,
        code: blockCapCheck.code,
        error: blockCapCheck.message,
        details: blockCapCheck.details,
        build: BUILD
      });
    }

    // Check 3: Drive-time feasibility
    const driveTimeCheck = await checkDriveTimeFeasibility(base44, requestedDate, startTime);
    if (!driveTimeCheck.allowed) {
      console.log('SFI_V2_CAPACITY_CONSTRAINT_VIOLATED', { code: driveTimeCheck.code });
      return json200({
        success: false,
        code: driveTimeCheck.code,
        error: driveTimeCheck.message,
        details: driveTimeCheck.details,
        build: BUILD
      });
    }

    // Step 1: Create InspectionRecord (authoritative source)
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
      console.log('SFI_V2_INSPECTION_CREATED', { leadId, inspectionId: inspection.id });
    } catch (e) {
      // Classify error: permission/403 vs other failures
      const isPermissionError = e?.status === 403 || e?.message?.includes('Permission denied');
      
      if (isPermissionError) {
        // Permission failure: fail fast, no downstream writes
        console.error('SFI_V2_INSPECTION_CREATE_FORBIDDEN', {
          error: e.message,
          leadId: leadId.slice(0, 8),
          token: token.slice(0, 8),
          status: e?.status
        });
        return json200({
          success: false,
          code: 'INSPECTION_CREATE_FORBIDDEN',
          error: 'Unable to schedule inspection right now. Please contact Breez at (321) 524-3838.',
          build: BUILD
        });
      } else {
        // Non-permission failure (network, validation, etc.)
        console.error('SFI_V2_INSPECTION_CREATE_FAILED', {
          error: e.message,
          leadId: leadId.slice(0, 8),
          token: token.slice(0, 8)
        });
        return json200({
          success: false,
          code: 'INSPECTION_CREATE_FAILED',
          error: 'Failed to create inspection record',
          build: BUILD
        });
      }
    }

    // Step 2: Cancel any existing active inspection CalendarEvents (single-event guarantee)
    try {
      const existing = await base44.asServiceRole.entities.CalendarEvent.filter(
        { leadId, eventType: 'inspection' }, null, 100
      );
      const active = (existing || []).filter(e => e.status !== 'cancelled');
      for (const ev of active) {
        await base44.asServiceRole.entities.CalendarEvent.update(ev.id, {
          status: 'cancelled',
          cancelledAt: new Date().toISOString(),
          cancelReason: 'duplicate_inspection_event_cleanup'
        }).catch(e => console.warn('SFI_V2_DUPLICATE_CANCEL_FAILED', { eventId: ev.id, error: e.message }));
        console.log('SFI_V2_CANCELLED_DUPLICATE', { leadId, eventId: ev.id });
      }
    } catch (e) {
      console.warn('SFI_V2_EXISTING_EVENTS_QUERY_FAILED', { error: e.message });
    }

    // Step 3: Create CalendarEvent (projection from InspectionRecord)
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
        customerNotes: `Name: ${finalFirstName}\nPhone: ${phone.trim()}\nEmail: ${finalEmail || 'N/A'}`
      });
      console.log('SFI_V2_EVENT_CREATED', { leadId, eventId: calendarEvent.id });
    } catch (e) {
      console.error('SFI_V2_EVENT_CREATE_FAILED', { error: e.message });
      return json200({ success: false, error: 'Failed to create calendar event', build: BUILD });
    }

    // Step 4: Link CalendarEvent → InspectionRecord
    try {
      await base44.asServiceRole.entities.InspectionRecord.update(inspection.id, {
        calendarEventId: calendarEvent.id
      });
      console.log('SFI_V2_INSPECTION_LINKED', { inspectionId: inspection.id, calendarEventId: calendarEvent.id });
    } catch (e) {
      console.warn('SFI_V2_LINK_FAILED', { error: e.message });
    }

    // Step 5: Sync Lead mirror fields + stage update + consume token (inlined — no function invoke)
    let shouldSendNotification = false;
    try {
      const leads = await base44.asServiceRole.entities.Lead.filter({ id: leadId }, null, 1);
      if (leads && leads.length > 0) {
        const lead = leads[0];
        shouldSendNotification = lead.stage !== 'inspection_scheduled';

        await base44.asServiceRole.entities.Lead.update(leadId, {
          firstName: finalFirstName,
          mobilePhone: phone.trim(),
          inspectionScheduled: true,
          inspectionEventId: calendarEvent.id,
          requestedInspectionDate: requestedDate,
          requestedInspectionTime: requestedTimeSlot,
          serviceAddress: serviceAddressStr,
          ...(shouldSendNotification && { confirmationSentAt: new Date().toISOString() })
        });
        console.log('SFI_V2_LEAD_SYNCED', { leadId, shouldSendNotification });

        // Inline stage update (was: base44.functions.invoke('updateLeadStagePublicV1', ...))
        if (shouldSendNotification) {
          await updateLeadStage(base44, leadId, 'inspection_scheduled');
        }
      }
    } catch (e) {
      console.warn('SFI_V2_LEAD_SYNC_FAILED', { error: e.message });
    }

    // Mark token as consumed (prevent accidental replay/duplicate scheduling)
    try {
      const quotes = await base44.asServiceRole.entities.Quote.filter({ quoteToken: token.trim() }, null, 1);
      if (quotes && quotes.length > 0) {
        const quote = quotes[0];
        if (!quote.scheduleTokenUsedAt) {
          await base44.asServiceRole.entities.Quote.update(quote.id, {
            scheduleTokenUsedAt: new Date().toISOString()
          });
          console.log('SFI_V2_TOKEN_CONSUMED', { quoteId: quote.id, token: token.trim().slice(0, 8) });
        }
      }
    } catch (e) {
      console.warn('SFI_V2_TOKEN_CONSUMPTION_FAILED', { error: e.message });
    }

    // Step 6: Send confirmation email (inlined — no function invoke)
    const emailStatus = await sendConfirmationEmail(base44, {
      leadId,
      firstName: finalFirstName,
      email: finalEmail,
      inspectionDate: requestedDate,
      inspectionTime: timeWindow,
      force: shouldSendNotification
    });

    console.log('SFI_V2_SUCCESS', { leadId, inspectionId: inspection.id, eventId: calendarEvent.id, scheduledDate: requestedDate, emailStatus });

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
      build: BUILD
    });

  } catch (error) {
    console.error('SFI_V2_CRASH', { error: error?.message });
    return json200({
      success: false,
      error: 'Failed to schedule inspection',
      build: BUILD
    });
  }
});