import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';
import { Resend } from 'npm:resend@4.0.0';

const resend = new Resend(Deno.env.get('RESEND_API_KEY'));

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
async function sendConfirmationEmail(entities, integrations, { leadId, firstName, email, inspectionDate, inspectionTime, force, token }) {
  console.log('SFI_V2_EMAIL_FUNC_ENTRY', { leadId, email: email?.slice(0, 5), force });
  
  try {
    console.log('SFI_V2_EMAIL_SENDING_START', { leadId, email: email.slice(0, 5), inspectionDate, inspectionTime });
    
    if (leadId && !force) {
      const lead = await entities.Lead.get(leadId).catch(() => null);
      if (lead?.inspectionConfirmationSent) {
        console.log('SFI_V2_EMAIL_SKIPPED', { leadId, reason: 'already_sent' });
        return 'skipped';
      }
    }

    // Build the email inline
    const dateFormatted = inspectionDate
      ? new Date(inspectionDate + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
      : 'To be scheduled';

    const TEAL = '#1B9B9F';
    const LIGHT_TEAL = '#e8f8f9';
    const phone = '(321) 524-3838';
    const website = 'https://breezpoolcare.com';
    const serviceArea = 'Space Coast, FL · Mon–Sat 8am–6pm';
    const inspectorName = 'Matt Inghram';
    const inspectorTitle = 'Owner/Operator';
    const finalFirstName = firstName || 'Customer';

    // Build reschedule URL
    let rescheduleUrl = null;
    if (token) {
      const appOrigin = Deno.env.get('PUBLIC_APP_URL')?.replace(/\/$/, '') || '';
      if (appOrigin) {
        rescheduleUrl = `${appOrigin}/RescheduleInspection?token=${encodeURIComponent(token)}`;
      }
    }

    const subject = `Inspection Confirmed — ${dateFormatted} · Breez Pool Care`;

    const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/></head>
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
  <p style="margin:0;font-size:16px;color:#1f2937;line-height:1.6;">Hi <strong>${finalFirstName}</strong>,</p>
  <p style="margin:12px 0 0;font-size:15px;color:#374151;line-height:1.7;">This is a confirmation that your <strong>free pool inspection</strong> with <strong>Breez Pool Care</strong> is scheduled for:</p>
</td></tr>
<tr><td style="padding:20px 40px;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:${LIGHT_TEAL};border:2px solid ${TEAL};border-radius:12px;">
    <tr><td style="padding:24px 28px;">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr><td style="padding-bottom:14px;border-bottom:1px solid rgba(27,155,159,0.2);">
          <p style="margin:0 0 3px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.8px;color:${TEAL};">Date</p>
          <p style="margin:0;font-size:17px;font-weight:700;color:#1f2937;">${dateFormatted}</p>
        </td></tr>
        <tr><td style="padding:14px 0;border-bottom:1px solid rgba(27,155,159,0.2);">
          <p style="margin:0 0 3px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.8px;color:${TEAL};">Arrival Window</p>
          <p style="margin:0;font-size:17px;font-weight:700;color:#1f2937;">${inspectionTime || 'To be confirmed'}</p>
        </td></tr>
        <tr><td style="padding-top:14px;">
          <p style="margin:0 0 3px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.8px;color:${TEAL};">Inspector</p>
          <p style="margin:0;font-size:17px;font-weight:700;color:#1f2937;">${inspectorName}, <span style="font-weight:400;font-size:15px;color:#4b5563;">${inspectorTitle}</span></p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</td></tr>
<tr><td style="padding:4px 40px 0;">
  <h2 style="margin:0 0 12px;font-size:16px;font-weight:700;color:#1f2937;border-bottom:2px solid #e5e7eb;padding-bottom:8px;">What to expect</h2>
  <p style="margin:0 0 10px;font-size:14px;color:#374151;">During the visit, we'll:</p>
  <table cellpadding="0" cellspacing="0" width="100%">
    <tr><td style="padding:5px 0;font-size:14px;color:#374151;line-height:1.6;"><span style="color:${TEAL};font-weight:700;margin-right:8px;">•</span><strong>Test your water</strong> and review basic water balance</td></tr>
    <tr><td style="padding:5px 0;font-size:14px;color:#374151;line-height:1.6;"><span style="color:${TEAL};font-weight:700;margin-right:8px;">•</span><strong>Inspect your pool equipment</strong> (pump, filter, timer, valves, etc.)</td></tr>
    <tr><td style="padding:5px 0;font-size:14px;color:#374151;line-height:1.6;"><span style="color:${TEAL};font-weight:700;margin-right:8px;">•</span>Check <strong>circulation and overall system function</strong></td></tr>
    <tr><td style="padding:5px 0;font-size:14px;color:#374151;line-height:1.6;"><span style="color:${TEAL};font-weight:700;margin-right:8px;">•</span>Answer any questions you have and discuss any concerns you've noticed</td></tr>
  </table>
  <p style="margin:12px 0 0;font-size:14px;color:#374151;">Most inspections take <strong>about 20–30 minutes</strong>, depending on access and equipment layout.</p>
</td></tr>
<tr><td style="padding:24px 40px 0;">
  <h2 style="margin:0 0 10px;font-size:16px;font-weight:700;color:#1f2937;border-bottom:2px solid #e5e7eb;padding-bottom:8px;">Before we arrive</h2>
  <p style="margin:0;font-size:14px;color:#374151;line-height:1.7;">We will <strong>call you about 1 hour before arrival</strong> to confirm that you (or a designated caretaker) will be home and that we can access the pool and equipment area.</p>
</td></tr>
<tr><td style="padding:24px 40px 0;">
  <h2 style="margin:0 0 10px;font-size:16px;font-weight:700;color:#1f2937;border-bottom:2px solid #e5e7eb;padding-bottom:8px;">No obligation</h2>
  <p style="margin:0;font-size:14px;color:#374151;line-height:1.7;">This inspection is <strong>completely free</strong> and there is <strong>no obligation</strong> to sign up for service. Our goal is simply to give you a clear picture of your pool's condition and answer your questions.</p>
</td></tr>
${rescheduleUrl ? `
<tr><td style="padding:28px 40px 0;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;">
    <tr><td style="padding:20px 24px;text-align:center;">
      <p style="margin:0 0 4px;font-size:14px;font-weight:600;color:#374151;">Need to change your appointment?</p>
      <p style="margin:0 0 14px;font-size:13px;color:#6b7280;">If you need to reschedule, use the button below or call/text us.</p>
      <a href="${rescheduleUrl}" style="display:inline-block;background-color:#ffffff;color:${TEAL};border:2px solid ${TEAL};border-radius:8px;padding:10px 24px;font-size:14px;font-weight:600;text-decoration:none;">Reschedule My Inspection</a>
    </td></tr>
  </table>
</td></tr>` : ''}
<tr><td style="padding:28px 40px 0;">
  <p style="margin:0;font-size:14px;color:#374151;line-height:1.7;">If you need to reschedule or update access instructions, reply to this email or call/text us at <strong>${phone}</strong>.</p>
  <p style="margin:18px 0 0;font-size:14px;color:#374151;">Thank you,<br/><strong>Breez Pool Care</strong></p>
</td></tr>
<tr><td style="padding:28px 40px 32px;">
  <table width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #e5e7eb;padding-top:20px;">
    <tr><td style="text-align:center;">
      <p style="margin:0 0 4px;font-size:13px;color:#6b7280;"><strong style="color:#374151;">Breez Pool Care LLC</strong> &nbsp;|&nbsp; ${phone} &nbsp;|&nbsp; <a href="${website}" style="color:${TEAL};text-decoration:none;">breezpoolcare.com</a></p>
      <p style="margin:4px 0 0;font-size:12px;color:#9ca3af;">${serviceArea}</p>
    </td></tr>
  </table>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;

    const text = `Hi ${finalFirstName},\n\nYour free pool inspection with Breez Pool Care is confirmed!\n\nDate: ${dateFormatted}\nArrival Window: ${inspectionTime || 'To be confirmed'}\nInspector: ${inspectorName}, ${inspectorTitle}\n\nWHAT TO EXPECT\n• Test your water and review water balance\n• Inspect equipment (pump, filter, timer, valves)\n• Check circulation and system function\n• Answer your questions\n\nMost inspections take about 20–30 minutes.\n\nBEFORE WE ARRIVE\nWe will call you about 1 hour before arrival.\n\nNO OBLIGATION\nThis inspection is completely free with no obligation.\n\n${rescheduleUrl ? `To reschedule: ${rescheduleUrl}\n\n` : ''}Questions? Call/text ${phone}\n\nThank you,\nBreez Pool Care LLC\n${phone} | breezpoolcare.com\n${serviceArea}`;

    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    if (!resendApiKey) {
      console.error('SFI_V2_RESEND_KEY_MISSING');
      return 'failed';
    }

    console.log('SFI_V2_EMAIL_FETCH_START', { to: email, subject });

    const emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${resendApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'Breez Pool Care <noreply@breezpoolcare.com>',
        to: [email],
        subject,
        html,
        text
      })
    });

    console.log('SFI_V2_EMAIL_RESPONSE', { status: emailRes.status, statusOk: emailRes.ok });

    const resendText = await emailRes.text();
    let resendData = {};
    if (resendText?.trim()) {
      try { resendData = JSON.parse(resendText); } catch (e) {
        console.warn('SFI_V2_PARSE_ERROR', { rawText: resendText.slice(0, 100) });
      }
    }

    console.log('SFI_V2_RESEND_DATA', { id: resendData?.id, error: resendData?.error });

    if (!emailRes.ok) {
      console.error('SFI_V2_EMAIL_HTTP_FAILED', { status: emailRes.status, resendError: resendData?.error || resendText.slice(0, 200) });
      return 'failed';
    }

    const resendId = resendData.id ?? null;
    if (!resendId) {
      console.error('SFI_V2_EMAIL_NO_ID', { resendData });
      return 'failed';
    }

    console.log('SFI_V2_EMAIL_SENT', { leadId, emailPrefix: email.slice(0, 5), resendId });

    if (leadId) {
      await entities.Lead.update(leadId, {
        inspectionConfirmationSent: true,
        confirmationSentAt: new Date().toISOString()
      }).catch(e => console.warn('SFI_V2_CONFIRMATION_FLAG_FAILED', { error: e.message }));
    }

    return 'sent';
}

// ── Main Handler ──
Deno.serve(async (req) => {
  const requestId = crypto.randomUUID();
  const runtimeVersion = BUILD;
  const meta = { build: BUILD, runtimeVersion, requestId };

  try {
    const payload = await req.json();
    const { token, firstName, phone, email, serviceAddress, requestedDate, requestedTimeSlot } = payload || {};

    console.log('SFI_V2_ENTRY_VERSION', { requestId, runtimeVersion, token: token ? token.slice(0, 8) : null });

    if (!token || typeof token !== 'string') return json200({ success: false, error: 'token is required', ...meta });
    if (!firstName || typeof firstName !== 'string' || !firstName.trim()) return json200({ success: false, error: 'firstName is required', ...meta });
    if (!phone || typeof phone !== 'string' || !phone.trim()) return json200({ success: false, error: 'phone is required', ...meta });
    if (!serviceAddress || typeof serviceAddress !== 'object') return json200({ success: false, error: 'serviceAddress object is required', ...meta });

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
    }

    const leadId = resolveData.leadId;
    const tokenEmail = resolveData.email;
    const finalEmail = email || tokenEmail;
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
    const finalEmail     = email?.trim() || tokenEmail;
    const finalFirstName = firstName.trim();

    if (!finalEmail) {
      console.warn('SFI_V2_NO_EMAIL', { leadId, tokenEmail, payloadEmail: email });
      return json200({ success: false, code: 'NO_EMAIL', error: 'No email address found', ...meta });
    }

    // Token lifecycle check
    const lifecycleCheck = await validateTokenLifecycle(entities, token);
    if (!lifecycleCheck.valid) {
      console.log('SFI_V2_TOKEN_LIFECYCLE_FAILED', { code: lifecycleCheck.code, requestId });
      return json200({ success: false, code: lifecycleCheck.code, error: lifecycleCheck.message, ...meta });
    }

    const serviceAddressStr = `${street.trim()}, ${city.trim()}, ${state.trim()} ${zip.trim()}`;
    const timeWindow = timeWindowMap[requestedTimeSlot];
    const startTime  = timeSlotToStart[requestedTimeSlot];

    let existingInspection = null;
    // IDEMPOTENCY: check existing non-cancelled InspectionRecord
    try {
      const existing = await entities.InspectionRecord.filter(
        { leadId, appointmentStatus: { $ne: 'cancelled' } }, '-created_date', 1
      );
      if (inspections && inspections.length > 0) {
        existingInspection = inspections[0];
      if (existing && existing.length > 0) {
        const insp = existing[0];
        console.log('SFI_V2_ALREADY_SCHEDULED', { leadIdPrefix: leadId.slice(0, 8), inspectionId: insp.id, requestId });
        // Still send confirmation email in case it wasn't sent on the original attempt
        const emailStatus = await sendConfirmationEmail(entities, null, {
          leadId,
          firstName: finalFirstName,
          email: finalEmail,
          inspectionDate: insp.scheduledDate,
          inspectionTime: insp.timeWindow,
          force: false,
          token: token.trim()
        });
        return json200({
          success: true,
          alreadyScheduled: true,
          scheduledDate: insp.scheduledDate,
          timeWindow: insp.timeWindow,
          email: finalEmail,
          firstName,
          inspectionId: existingInspection.id,
          eventId: existingInspection.calendarEventId,
          firstName: finalFirstName,
          inspectionId: insp.id,
          eventId: insp.calendarEventId,
          emailStatus,
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

    }

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
      // Don't throw - continue even if link fails
    }

    // Step 5: Sync Lead + stage update + consume token
    let shouldSendNotification = false;
    try {
      const leads = await entities.Lead.filter({ id: leadId }, null, 1);
      if (leads && leads.length > 0) {
        const lead = leads[0];
        shouldSendNotification = lead.stage !== 'inspection_scheduled';
        await base44.asServiceRole.entities.Lead.update(leadId, {
          firstName: firstName.trim(),

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
      console.warn('SFI_V2_LEAD_SYNC_FAILED', { requestId, error: e.message });
    }

    const emailStatus = await sendConfirmationEmail(base44, {
      email: finalEmail,
      firstName: firstName.trim(),
      requestedDate,
      timeWindow,
      serviceAddress: serviceAddressStr
    }, requestId);
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
    console.log('SFI_V2_BEFORE_EMAIL_SEND', { leadId, requestId });
    let emailStatus = 'unknown';
    try {
      emailStatus = await sendConfirmationEmail(entities, integrations, {
        leadId,
        firstName: finalFirstName,
        email: finalEmail,
        inspectionDate: requestedDate,
        inspectionTime: timeWindow,
        force: true,
        token: token.trim()
      });
      console.log('SFI_V2_AFTER_EMAIL_SEND', { emailStatus, leadId, requestId });
    } catch (emailErr) {
      console.error('SFI_V2_EMAIL_FUNCTION_FAILED', { error: emailErr?.message, leadId, requestId });
      emailStatus = 'failed';
    }

    console.log('SFI_V2_SUCCESS', { leadIdPrefix: leadId.slice(0, 8), inspectionId: inspection.id, eventId: calendarEvent.id, scheduledDate: requestedDate, emailStatus, requestId });

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
      eventId: calendarEvent.id,
      shouldSendNotification,
      emailStatus,
      ...(degradedMode && {
        degradedMode: true,
        degradedReason: 'INSPECTION_RECORD_CREATE_FAILED'
      }),
      firstName: finalFirstName,
      inspectionId: inspection.id,
      eventId: calendarEvent.id,
      shouldSendNotification,
      emailStatus,
      ...meta
    });
  } catch (error) {
    console.error('SFI_V2_CRASH', { requestId, error: error?.message });
    return json200({ success: false, error: 'Failed to schedule inspection', detail: error?.message, ...meta });
    console.error('SFI_V2_CRASH', { error: error?.message, requestId });
    return json200({ success: false, error: 'Failed to schedule inspection', ...meta });
  }
});
