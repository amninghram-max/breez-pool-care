import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';
import { Resend } from 'npm:resend@4.0.0';

const BUILD = "SFI-V3-2026-03-05";

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

const STAGE_ORDER = {
  new_lead: 0, contacted: 1, quote_sent: 2,
  inspection_scheduled: 3, inspection_confirmed: 4, converted: 5, lost: -1
};

const MAX_JOBS_PER_DAY = 10;
const MAX_INSPECTIONS_PER_BLOCK = 3;

// ── Resolve token → leadId, email, firstName ──
async function resolveToken(entities, token) {
  const cleanToken = token.trim();
  let request = null;
  try {
    const rows = await entities.QuoteRequests.filter({ token: cleanToken }, null, 1);
    request = rows?.[0] || null;
  } catch (e) {
    return { code: 'LEAD_LOOKUP_FAILED', error: 'Platform temporarily unavailable' };
  }
  if (!request) return { code: 'TOKEN_NOT_FOUND', error: 'Token not found or invalid' };

  let leadId = request.leadId || null;
  let email = request.email === 'guest@breezpoolcare.com' ? null : (request.email || null);
  let firstName = request.firstName || null;

  // Repair path: try Quote entity
  if (!leadId || !email) {
    try {
      const quotes = await entities.Quote.filter({ quoteToken: cleanToken }, '-created_date', 1);
      const q = quotes?.[0];
      if (q) {
        if (!leadId && q.leadId) leadId = q.leadId;
        if (!email && q.clientEmail && q.clientEmail !== 'guest@breezpoolcare.com') email = q.clientEmail;
        if (!firstName && q.clientFirstName) firstName = q.clientFirstName;
        const patch = {};
        if (leadId && request.leadId !== leadId) patch.leadId = leadId;
        if (email && request.email !== email) patch.email = email;
        if (firstName && request.firstName !== firstName) patch.firstName = firstName;
        if (Object.keys(patch).length > 0) {
          await entities.QuoteRequests.update(request.id, patch).catch(() => {});
        }
      }
    } catch (e) {
      console.warn('SFI_V3_TOKEN_REPAIR_FAILED', { error: e.message });
    }
  }

  // Validate lead exists and is not deleted
  if (leadId) {
    try {
      const leadRows = await entities.Lead.filter({ id: leadId }, null, 1);
      const lead = leadRows?.[0];
      if (!lead || lead.isDeleted === true) leadId = null;
      else {
        if (!email && lead.email && lead.email !== 'guest@breezpoolcare.com') email = lead.email;
        if (!firstName && lead.firstName) firstName = lead.firstName;
      }
    } catch (e) {
      return { code: 'LEAD_LOOKUP_FAILED', error: 'Platform temporarily unavailable' };
    }
  }

  if (!leadId || !email) return { code: 'INCOMPLETE_DATA', error: 'Token does not have complete lead information' };
  return { leadId, email, firstName, quoteRequest: request };
}

// ── Non-regression stage update ──
async function updateLeadStage(entities, leadId, newStage) {
  try {
    const rows = await entities.Lead.filter({ id: leadId }, null, 1);
    const lead = rows?.[0];
    const oldStage = lead?.stage || 'new_lead';
    if (oldStage === newStage) return;
    const oldOrder = STAGE_ORDER[oldStage] ?? -999;
    const newOrder = STAGE_ORDER[newStage] ?? -999;
    if (newOrder < oldOrder && newStage !== 'lost') {
      console.warn('SFI_V3_STAGE_REGRESSION_BLOCKED', { leadId, oldStage, newStage });
      return;
    }
    await entities.Lead.update(leadId, { stage: newStage });
    console.log('SFI_V3_STAGE_UPDATED', { leadId, oldStage, newStage });
  } catch (e) {
    console.warn('SFI_V3_STAGE_UPDATE_FAILED', { error: e.message });
  }
}

// ── Capacity checks ──
async function checkTechnicianDailyCapacity(entities, date, maxCap) {
  try {
    const events = await entities.CalendarEvent.filter({ scheduledDate: date, status: { $ne: 'cancelled' } }, null, 1000);
    if ((events || []).length >= maxCap) {
      return { allowed: false, code: 'TECH_DAILY_CAP_REACHED', message: `Maximum ${maxCap} appointments reached for this date. Please choose another date.` };
    }
    return { allowed: true };
  } catch (e) { return { allowed: true }; }
}

async function checkInspectionBlockCapacity(entities, date, timeSlot) {
  try {
    const timeWindow = timeWindowMap[timeSlot];
    const events = await entities.CalendarEvent.filter({ scheduledDate: date, eventType: 'inspection', status: { $ne: 'cancelled' } }, null, 1000);
    const blockCount = (events || []).filter(e => e.timeWindow === timeWindow).length;
    if (blockCount >= MAX_INSPECTIONS_PER_BLOCK) {
      return { allowed: false, code: 'INSPECTION_BLOCK_CAP_REACHED', message: `This time slot is full. Please choose another time.` };
    }
    return { allowed: true };
  } catch (e) { return { allowed: true }; }
}

// ── Send confirmation email via Resend ──
async function sendConfirmationEmail({ email, firstName, inspectionDate, inspectionTime, token, leadId, entities }) {
  try {
    const TEAL = '#1B9B9F';
    const dateFormatted = inspectionDate
      ? new Date(inspectionDate + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
      : 'To be scheduled';

    const appOrigin = Deno.env.get('PUBLIC_APP_URL')?.replace(/\/$/, '') || '';
    const rescheduleUrl = token && appOrigin ? `${appOrigin}/RescheduleInspection?token=${encodeURIComponent(token)}` : null;
    const subject = `Inspection Confirmed — ${dateFormatted} · Breez Pool Care`;

    const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f4f7f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1f2937;">
<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f7f8;padding:32px 16px;">
<tr><td align="center">
<table width="100%" style="max-width:600px;background-color:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.08);">
<tr><td style="background-color:${TEAL};padding:32px 40px;text-align:center;">
  <img src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/699a2b2056054b0207cea969/0b0c31666_Breez2.png" alt="Breez Pool Care" height="48" style="display:block;margin:0 auto 16px;"/>
  <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;">Inspection Confirmed ✓</h1>
  <p style="margin:6px 0 0;color:rgba(255,255,255,0.85);font-size:14px;">Your free pool inspection is booked</p>
</td></tr>
<tr><td style="padding:32px 40px 0;">
  <p style="margin:0;font-size:16px;">Hi <strong>${firstName || 'Customer'}</strong>,</p>
  <p style="margin:12px 0 0;font-size:15px;color:#374151;line-height:1.7;">This is a confirmation that your <strong>free pool inspection</strong> with <strong>Breez Pool Care</strong> is scheduled for:</p>
</td></tr>
<tr><td style="padding:20px 40px;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#e8f8f9;border:2px solid ${TEAL};border-radius:12px;">
    <tr><td style="padding:24px 28px;">
      <p style="margin:0 0 3px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.8px;color:${TEAL};">Date</p>
      <p style="margin:0 0 14px;font-size:17px;font-weight:700;color:#1f2937;">${dateFormatted}</p>
      <p style="margin:0 0 3px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.8px;color:${TEAL};">Arrival Window</p>
      <p style="margin:0 0 14px;font-size:17px;font-weight:700;color:#1f2937;">${inspectionTime || 'To be confirmed'}</p>
      <p style="margin:0 0 3px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.8px;color:${TEAL};">Inspector</p>
      <p style="margin:0;font-size:17px;font-weight:700;color:#1f2937;">Matt Inghram, <span style="font-weight:400;font-size:15px;color:#4b5563;">Owner/Operator</span></p>
    </td></tr>
  </table>
</td></tr>
<tr><td style="padding:4px 40px 0;">
  <h2 style="margin:0 0 10px;font-size:16px;font-weight:700;color:#1f2937;border-bottom:2px solid #e5e7eb;padding-bottom:8px;">What to expect</h2>
  <p style="margin:6px 0;font-size:14px;color:#374151;">• <strong>Test your water</strong> and review water balance</p>
  <p style="margin:6px 0;font-size:14px;color:#374151;">• <strong>Inspect equipment</strong> (pump, filter, timer, valves)</p>
  <p style="margin:6px 0;font-size:14px;color:#374151;">• Check <strong>circulation and system function</strong></p>
  <p style="margin:6px 0;font-size:14px;color:#374151;">• Answer your questions — most visits take <strong>20–30 minutes</strong></p>
</td></tr>
<tr><td style="padding:20px 40px 0;">
  <p style="margin:0;font-size:14px;color:#374151;"><strong>Before we arrive:</strong> We'll call about 1 hour ahead to confirm access.</p>
</td></tr>
${rescheduleUrl ? `
<tr><td style="padding:20px 40px 0;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;">
    <tr><td style="padding:18px 24px;text-align:center;">
      <p style="margin:0 0 10px;font-size:14px;color:#374151;">Need to change your appointment?</p>
      <a href="${rescheduleUrl}" style="display:inline-block;background-color:#ffffff;color:${TEAL};border:2px solid ${TEAL};border-radius:8px;padding:10px 24px;font-size:14px;font-weight:600;text-decoration:none;">Reschedule My Inspection</a>
    </td></tr>
  </table>
</td></tr>` : ''}
<tr><td style="padding:24px 40px 32px;">
  <p style="margin:0 0 16px;font-size:14px;color:#374151;">Questions? Call or text us at <strong>(321) 524-3838</strong>.</p>
  <table width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #e5e7eb;padding-top:16px;">
    <tr><td style="text-align:center;">
      <p style="margin:0;font-size:13px;color:#6b7280;"><strong style="color:#374151;">Breez Pool Care LLC</strong> &nbsp;|&nbsp; (321) 524-3838 &nbsp;|&nbsp; <a href="https://breezpoolcare.com" style="color:${TEAL};text-decoration:none;">breezpoolcare.com</a></p>
      <p style="margin:4px 0 0;font-size:12px;color:#9ca3af;">Space Coast, FL · Mon–Sat 8am–6pm</p>
    </td></tr>
  </table>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;

    const text = `Hi ${firstName || 'Customer'},\n\nYour free pool inspection with Breez Pool Care is confirmed!\n\nDate: ${dateFormatted}\nArrival Window: ${inspectionTime || 'To be confirmed'}\nInspector: Matt Inghram, Owner/Operator\n\nWe'll call about 1 hour before arrival.\n\n${rescheduleUrl ? `To reschedule: ${rescheduleUrl}\n\n` : ''}Questions? Call (321) 524-3838.\n\nBreez Pool Care LLC | breezpoolcare.com`;

    const resend = new Resend(Deno.env.get('RESEND_API_KEY'));
    const result = await resend.emails.send({
      from: 'Breez Pool Care <noreply@breezpoolcare.com>',
      to: email,
      subject,
      html,
      text
    });

    if (result.error) throw new Error(result.error.message || 'Resend error');

    if (leadId && entities) {
      await entities.Lead.update(leadId, {
        inspectionConfirmationSent: true,
        confirmationSentAt: new Date().toISOString()
      }).catch(e => console.warn('SFI_V3_FLAG_UPDATE_FAILED', { error: e.message }));
    }

    console.log('SFI_V3_CONFIRMATION_EMAIL_SENT', { emailPrefix: email.slice(0, 5), resendId: result.data?.id });
    return 'sent';
  } catch (e) {
    console.error('SFI_V3_CONFIRMATION_EMAIL_FAILED', { error: e.message });
    return 'failed';
  }
}

// ── Main Handler ──
Deno.serve(async (req) => {
  const requestId = crypto.randomUUID();
  const meta = { build: BUILD, requestId };

  try {
    const base44 = createClientFromRequest(req);
    const entities = base44.asServiceRole.entities;

    const payload = await req.json();
    const { token, firstName, phone, email, serviceAddress, requestedDate, requestedTimeSlot } = payload || {};

    // Input validation
    if (!token || typeof token !== 'string') return json200({ success: false, error: 'token is required', ...meta });
    if (!firstName?.trim()) return json200({ success: false, error: 'firstName is required', ...meta });
    if (!phone?.trim()) return json200({ success: false, error: 'phone is required', ...meta });
    if (!serviceAddress || typeof serviceAddress !== 'object') return json200({ success: false, error: 'serviceAddress object is required', ...meta });
    const { street, city, state, zip } = serviceAddress;
    if (!street?.trim() || !city?.trim() || !state?.trim() || !zip?.trim()) {
      return json200({ success: false, error: 'serviceAddress must include street, city, state, and zip', ...meta });
    }

    // ZIP code service area check
    const ALLOWED_ZIPS = ['32940', '32934', '32935', '32937', '32952', '32925'];
    const cleanZip = zip.trim().slice(0, 5);
    if (!ALLOWED_ZIPS.includes(cleanZip)) {
      return json200({ success: false, code: 'OUTSIDE_SERVICE_AREA', error: 'outside_service_area', ...meta });
    }
    if (!requestedDate || !/^\d{4}-\d{2}-\d{2}$/.test(requestedDate)) {
      return json200({ success: false, error: 'requestedDate must be in YYYY-MM-DD format', ...meta });
    }
    if (!requestedTimeSlot || !['morning', 'midday', 'afternoon'].includes(requestedTimeSlot)) {
      return json200({ success: false, error: 'requestedTimeSlot must be one of: morning, midday, afternoon', ...meta });
    }

    // Resolve token
    const resolved = await resolveToken(entities, token);
    if (!resolved.leadId) {
      console.warn('SFI_V3_RESOLVE_FAILED', { code: resolved.code, tokenPrefix: token.slice(0, 8), requestId });
      return json200({ success: false, code: resolved.code, error: resolved.error, ...meta });
    }

    const { leadId, email: tokenEmail, firstName: tokenFirstName } = resolved;
    const finalEmail = email?.trim() || tokenEmail;
    const finalFirstName = firstName.trim() || tokenFirstName || 'Customer';
    const serviceAddressStr = `${street.trim()}, ${city.trim()}, ${state.trim()} ${zip.trim()}`;
    const timeWindow = timeWindowMap[requestedTimeSlot];
    const startTime = timeSlotToStart[requestedTimeSlot];

    console.log('SFI_V3_ENTRY', { requestId, leadIdPrefix: leadId.slice(0, 8), tokenPrefix: token.slice(0, 8) });

    // Idempotency check — AUTHORITATIVE. On any lookup failure, fail safe (no duplicates).
    {
      let idempotencyError = null;
      let activeInspection = null;
      let lookupSource = null;

      // Source 1: InspectionRecord (preferred — authoritative)
      try {
        const existing = await entities.InspectionRecord.filter(
          { leadId, appointmentStatus: { $ne: 'cancelled' } }, '-created_date', 1
        );
        lookupSource = 'InspectionRecord';
        activeInspection = existing?.[0] || null;
        console.log('SFI_V3_IDEMPOTENCY_LOOKUP', {
          requestId, source: lookupSource,
          found: existing?.length ?? 0,
          storedDate: activeInspection?.scheduledDate ?? null,
          storedTimeWindow: activeInspection?.timeWindow ?? null,
          incomingDate: requestedDate,
          incomingTimeWindow: timeWindow
        });
      } catch (e) {
        idempotencyError = e;
        console.warn('SFI_V3_IDEMPOTENCY_INSPECTION_FAILED', { requestId, error: e.message });
      }

      // Source 2: active CalendarEvent fallback
      if (!activeInspection && !idempotencyError) {
        try {
          const evRows = await entities.CalendarEvent.filter(
            { leadId, eventType: 'inspection', status: { $ne: 'cancelled' } }, '-created_date', 1
          );
          lookupSource = 'CalendarEvent';
          const ev = evRows?.[0] || null;
          if (ev) {
            activeInspection = { scheduledDate: ev.scheduledDate, timeWindow: ev.timeWindow, calendarEventId: ev.id, id: null };
          }
          console.log('SFI_V3_IDEMPOTENCY_LOOKUP', {
            requestId, source: lookupSource,
            found: evRows?.length ?? 0,
            storedDate: ev?.scheduledDate ?? null,
            storedTimeWindow: ev?.timeWindow ?? null,
            incomingDate: requestedDate,
            incomingTimeWindow: timeWindow
          });
        } catch (e) {
          idempotencyError = e;
          console.warn('SFI_V3_IDEMPOTENCY_EVENT_FAILED', { requestId, error: e.message });
        }
      }

      // Source 3: Lead mirror fields fallback
      if (!activeInspection && !idempotencyError) {
        try {
          const leadRows = await entities.Lead.filter({ id: leadId }, null, 1);
          const lead = leadRows?.[0];
          lookupSource = 'LeadMirror';
          if (lead?.inspectionScheduled && lead?.requestedInspectionDate && lead?.requestedInspectionTime) {
            const mirrorTimeWindow = timeWindowMap[lead.requestedInspectionTime] || null;
            activeInspection = {
              scheduledDate: lead.requestedInspectionDate,
              timeWindow: mirrorTimeWindow,
              calendarEventId: lead.inspectionEventId || null,
              id: null
            };
          }
          console.log('SFI_V3_IDEMPOTENCY_LOOKUP', {
            requestId, source: lookupSource,
            found: activeInspection ? 1 : 0,
            storedDate: activeInspection?.scheduledDate ?? null,
            storedTimeWindow: activeInspection?.timeWindow ?? null,
            incomingDate: requestedDate,
            incomingTimeWindow: timeWindow
          });
        } catch (e) {
          idempotencyError = e;
          console.warn('SFI_V3_IDEMPOTENCY_LEAD_FAILED', { requestId, error: e.message });
        }
      }

      // If all lookups failed — fail safe, do not create duplicates
      if (idempotencyError) {
        console.error('SFI_V3_IDEMPOTENCY_ALL_SOURCES_FAILED', { requestId, error: idempotencyError.message });
        return json200({
          success: false,
          code: 'IDEMPOTENCY_CHECK_FAILED',
          error: 'Unable to verify existing appointment. Please try again or contact support.',
          ...meta
        });
      }

      if (activeInspection) {
        const isSameAppointment = activeInspection.scheduledDate === requestedDate && activeInspection.timeWindow === timeWindow;
        console.log('SFI_V3_IDEMPOTENCY_RESULT', {
          requestId, source: lookupSource, isSameAppointment,
          storedDate: activeInspection.scheduledDate, storedTimeWindow: activeInspection.timeWindow,
          incomingDate: requestedDate, incomingTimeWindow: timeWindow
        });
        if (isSameAppointment) {
          return json200({
            success: true,
            alreadyScheduled: true,
            scheduledDate: activeInspection.scheduledDate,
            timeWindow: activeInspection.timeWindow,
            email: finalEmail,
            firstName: finalFirstName,
            inspectionId: activeInspection.id || null,
            eventId: activeInspection.calendarEventId || null,
            emailStatus: 'skipped',
            ...meta
          });
        }
        // Different date/time — fall through to replacement scheduling
        console.log('SFI_V3_RESCHEDULE_DETECTED', {
          requestId, leadIdPrefix: leadId.slice(0, 8), source: lookupSource,
          existing: `${activeInspection.scheduledDate}/${activeInspection.timeWindow}`,
          incoming: `${requestedDate}/${timeWindow}`
        });
      }
    }

    // Load capacity settings
    let maxJobsPerDay = MAX_JOBS_PER_DAY;
    try {
      const settings = await entities.SchedulingSettings.filter({ settingKey: 'default' }, null, 1);
      if (settings?.[0]?.maxJobsPerDay) maxJobsPerDay = settings[0].maxJobsPerDay;
    } catch (e) { /* use default */ }

    // Capacity checks
    const dailyCap = await checkTechnicianDailyCapacity(entities, requestedDate, maxJobsPerDay);
    if (!dailyCap.allowed) return json200({ success: false, code: dailyCap.code, error: dailyCap.message, ...meta });

    const blockCap = await checkInspectionBlockCapacity(entities, requestedDate, requestedTimeSlot);
    if (!blockCap.allowed) return json200({ success: false, code: blockCap.code, error: blockCap.message, ...meta });

    // Create InspectionRecord
    let inspection = null;
    try {
      inspection = await entities.InspectionRecord.create({
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
      console.log('SFI_V3_INSPECTION_CREATED', { inspectionId: inspection.id });
    } catch (e) {
      console.error('SFI_V3_INSPECTION_CREATE_FAILED', { error: e.message });
      return json200({ success: false, code: 'INSPECTION_CREATE_FAILED', error: 'Failed to create inspection record', detail: e.message, ...meta });
    }

    // Cancel any existing active inspection CalendarEvents
    try {
      const existingEvents = await entities.CalendarEvent.filter({ leadId, eventType: 'inspection' }, null, 100);
      for (const ev of (existingEvents || []).filter(e => e.status !== 'cancelled')) {
        await entities.CalendarEvent.update(ev.id, { status: 'cancelled', cancelledAt: new Date().toISOString(), cancelReason: 'replaced_by_new_scheduling' }).catch(() => {});
      }
    } catch (e) { /* non-fatal */ }

    // Create CalendarEvent
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
    } catch (e) {
      return json200({ success: false, error: 'Failed to create calendar event', detail: e.message, ...meta });
    }

    // Link CalendarEvent → InspectionRecord
    try {
      await entities.InspectionRecord.update(inspection.id, { calendarEventId: calendarEvent.id });
    } catch (e) {
      console.warn('SFI_V3_LINK_FAILED', { error: e.message });
    }

    // Update Lead + advance stage
    try {
      await entities.Lead.update(leadId, {
        firstName: finalFirstName,
        mobilePhone: phone.trim(),
        inspectionScheduled: true,
        inspectionEventId: calendarEvent.id,
        requestedInspectionDate: requestedDate,
        requestedInspectionTime: requestedTimeSlot,
        serviceAddress: serviceAddressStr,
      });
      await updateLeadStage(entities, leadId, 'inspection_scheduled');
    } catch (e) {
      console.warn('SFI_V3_LEAD_SYNC_FAILED', { error: e.message });
    }

    // Consume schedule token on Quote
    try {
      const quotes = await entities.Quote.filter({ quoteToken: token.trim() }, null, 1);
      if (quotes?.[0] && !quotes[0].scheduleTokenUsedAt) {
        await entities.Quote.update(quotes[0].id, { scheduleTokenUsedAt: new Date().toISOString() });
      }
    } catch (e) { /* non-fatal */ }

    // Send confirmation email via Resend
    const emailStatus = await sendConfirmationEmail({
      email: finalEmail,
      firstName: finalFirstName,
      inspectionDate: requestedDate,
      inspectionTime: timeWindow,
      token: token.trim(),
      leadId,
      entities
    });

    console.log('SFI_V3_SUCCESS', { leadIdPrefix: leadId.slice(0, 8), inspectionId: inspection.id, eventId: calendarEvent.id, emailStatus, requestId });

    return json200({
      success: true,
      scheduledDate: requestedDate,
      timeWindow,
      email: finalEmail,
      firstName: finalFirstName,
      inspectionId: inspection.id,
      eventId: calendarEvent.id,
      emailStatus,
      ...meta
    });

  } catch (error) {
    console.error('SFI_V3_CRASH', { requestId, error: error?.message });
    return json200({ success: false, error: 'Failed to schedule inspection', detail: error?.message, ...meta });
  }
});