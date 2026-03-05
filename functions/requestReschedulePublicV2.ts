import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';
import { Resend } from 'npm:resend@4.0.0';

/**
 * requestReschedulePublicV2
 * 
 * Customer-initiated reschedule (public, token-based).
 * IMMEDIATELY updates InspectionRecord, CalendarEvent, and Lead with the new time.
 * Sends admin notification email about the reschedule.
 * 
 * Input: { token, requestedDate (YYYY-MM-DD), requestedTimeSlot (morning|midday|afternoon), note? }
 * Output: { success, scheduledDate, timeWindow, build }
 */

const BUILD = "REQUEST_RESCHEDULE_V2-2026-03-05";

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

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const payload = await req.json();
    const { token, requestedDate, requestedTimeSlot, note } = payload || {};

    if (!token) return json200({ success: false, error: 'token is required', build: BUILD });
    if (!requestedDate || !/^\d{4}-\d{2}-\d{2}$/.test(requestedDate)) {
      return json200({ success: false, error: 'requestedDate must be YYYY-MM-DD', build: BUILD });
    }
    if (!requestedTimeSlot || !['morning', 'midday', 'afternoon'].includes(requestedTimeSlot)) {
      return json200({ success: false, error: 'requestedTimeSlot must be morning, midday, or afternoon', build: BUILD });
    }

    // Resolve token → leadId
    let leadId = null;
    let lead = null;
    try {
      const requests = await base44.asServiceRole.entities.QuoteRequests.filter({ token: token.trim() }, null, 1);
      leadId = requests?.[0]?.leadId || null;
      if (!leadId) {
        // Fallback: try Quote entity
        const quotes = await base44.asServiceRole.entities.Quote.filter({ quoteToken: token.trim() }, '-created_date', 1);
        leadId = quotes?.[0]?.leadId || null;
      }
    } catch (e) {
      console.warn('RESCHED_V2_TOKEN_RESOLVE_FAILED', { error: e.message });
    }

    if (!leadId) {
      return json200({ success: false, code: 'INVALID_TOKEN', error: 'Invalid or expired token', build: BUILD });
    }

    // Load Lead
    try {
      const leads = await base44.asServiceRole.entities.Lead.filter({ id: leadId }, null, 1);
      lead = leads?.[0] || null;
    } catch (e) {}

    if (!lead || lead.isDeleted) {
      return json200({ success: false, code: 'LEAD_NOT_FOUND', error: 'Account not found', build: BUILD });
    }

    // Find active InspectionRecord
    let inspection = null;
    try {
      const inspections = await base44.asServiceRole.entities.InspectionRecord.filter(
        { leadId, appointmentStatus: { $ne: 'cancelled' } },
        '-created_date',
        1
      );
      inspection = inspections?.[0] || null;
    } catch (e) {}

    if (!inspection) {
      return json200({ success: false, code: 'NO_APPOINTMENT', error: 'No scheduled inspection found to reschedule', build: BUILD });
    }

    const oldDate = inspection.scheduledDate;
    const oldTimeWindow = inspection.timeWindow;
    const calendarEventId = inspection.calendarEventId || lead.inspectionEventId;

    const newTimeWindow = timeWindowMap[requestedTimeSlot];
    const newStartTime = timeSlotToStart[requestedTimeSlot];

    // UPDATE 1: InspectionRecord
    await base44.asServiceRole.entities.InspectionRecord.update(inspection.id, {
      scheduledDate: requestedDate,
      startTime: newStartTime,
      timeWindow: newTimeWindow,
      appointmentStatus: 'scheduled'
    });

    // UPDATE 2: CalendarEvent
    if (calendarEventId) {
      try {
        await base44.asServiceRole.entities.CalendarEvent.update(calendarEventId, {
          scheduledDate: requestedDate,
          startTime: newStartTime,
          timeWindow: newTimeWindow,
          status: 'scheduled',
          rescheduleReason: note ? `Customer request: ${note}` : 'Customer request'
        });
      } catch (e) {
        console.warn('RESCHED_V2_CALENDAR_UPDATE_FAILED', { error: e.message });
      }
    }

    // UPDATE 3: Lead mirror fields
    try {
      await base44.asServiceRole.entities.Lead.update(leadId, {
        requestedInspectionDate: requestedDate,
        requestedInspectionTime: requestedTimeSlot,
        confirmedInspectionDate: `${requestedDate}T${newStartTime}:00.000Z`
      });
    } catch (e) {
      console.warn('RESCHED_V2_LEAD_SYNC_FAILED', { error: e.message });
    }

    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
    const dateFormatted = new Date(requestedDate + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    // Send customer confirmation email
    if (RESEND_API_KEY && lead.email) {
      try {
        const resend = new Resend(RESEND_API_KEY);
        const customerName = lead.firstName || 'Customer';
        const TEAL = '#1B9B9F';
        const LIGHT_TEAL = '#e8f8f9';

        // Build reschedule URL so customer can change again if needed
        let rescheduleUrl = null;
        try {
          const qrs = await base44.asServiceRole.entities.QuoteRequests.filter({ leadId }, '-created_date', 1);
          if (qrs?.[0]?.token) {
            const appOrigin = Deno.env.get('PUBLIC_APP_URL')?.replace(/\/$/, '') || 'https://breezpoolcare.com';
            rescheduleUrl = `${appOrigin}/RescheduleInspection?token=${encodeURIComponent(qrs[0].token)}`;
          }
        } catch (e) {}

        const customerHtml = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<title>Inspection Rescheduled — Breez Pool Care</title></head>
<body style="margin:0;padding:0;background-color:#f4f7f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1f2937;">
<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f7f8;padding:32px 16px;">
  <tr><td align="center">
    <table width="100%" style="max-width:600px;background-color:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.08);">
      <tr><td style="background-color:${TEAL};padding:32px 40px;text-align:center;">
        <img src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/699a2b2056054b0207cea969/0b0c31666_Breez2.png" alt="Breez Pool Care" height="48" style="display:block;margin:0 auto 16px;"/>
        <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;">Inspection Rescheduled ✓</h1>
        <p style="margin:6px 0 0;color:rgba(255,255,255,0.85);font-size:14px;">Your appointment has been updated</p>
      </td></tr>
      <tr><td style="padding:32px 40px 0;">
        <p style="margin:0;font-size:16px;color:#1f2937;">Hi <strong>${customerName}</strong>,</p>
        <p style="margin:12px 0 0;font-size:15px;color:#374151;line-height:1.7;">Your free pool inspection has been rescheduled. Here are your updated appointment details:</p>
      </td></tr>
      <tr><td style="padding:20px 40px;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color:${LIGHT_TEAL};border:2px solid ${TEAL};border-radius:12px;">
          <tr><td style="padding:24px 28px;">
            <p style="margin:0 0 3px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.8px;color:${TEAL};">New Date</p>
            <p style="margin:0 0 16px;font-size:18px;font-weight:700;color:#1f2937;">${dateFormatted}</p>
            <p style="margin:0 0 3px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.8px;color:${TEAL};">Arrival Window</p>
            <p style="margin:0 0 16px;font-size:18px;font-weight:700;color:#1f2937;">${newTimeWindow}</p>
            <p style="margin:0 0 3px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.8px;color:${TEAL};">Inspector</p>
            <p style="margin:0;font-size:18px;font-weight:700;color:#1f2937;">Matt Inghram</p>
          </td></tr>
        </table>
      </td></tr>
      <tr><td style="padding:4px 40px 0;">
        <p style="margin:0;font-size:14px;color:#374151;line-height:1.7;">We'll call you about <strong>1 hour before arrival</strong> to confirm access. The inspection is <strong>completely free</strong> with no obligation.</p>
      </td></tr>
      ${rescheduleUrl ? `<tr><td style="padding:24px 40px 0;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;">
          <tr><td style="padding:20px 24px;text-align:center;">
            <p style="margin:0 0 12px;font-size:14px;color:#374151;">Need to change the time again?</p>
            <a href="${rescheduleUrl}" style="display:inline-block;background-color:#ffffff;color:${TEAL};border:2px solid ${TEAL};border-radius:8px;padding:10px 24px;font-size:14px;font-weight:600;text-decoration:none;">Reschedule My Inspection</a>
          </td></tr>
        </table>
      </td></tr>` : ''}
      <tr><td style="padding:24px 40px 32px;">
        <p style="margin:0;font-size:14px;color:#374151;">Questions? Call or text us at <strong>(321) 524-3838</strong>.</p>
        <p style="margin:16px 0 0;font-size:14px;color:#374151;">Thank you,<br/><strong>Breez Pool Care</strong></p>
        <table width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #e5e7eb;margin-top:20px;padding-top:16px;">
          <tr><td style="text-align:center;font-size:12px;color:#9ca3af;">Breez Pool Care LLC &nbsp;|&nbsp; (321) 524-3838 &nbsp;|&nbsp; Space Coast, FL</td></tr>
        </table>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;

        await resend.emails.send({
          from: 'Breez Pool Care <noreply@breezpoolcare.com>',
          to: lead.email,
          subject: `Inspection Rescheduled — ${dateFormatted} · Breez Pool Care`,
          html: customerHtml,
          text: `Hi ${customerName},\n\nYour inspection has been rescheduled.\n\nNew Date: ${dateFormatted}\nArrival Window: ${newTimeWindow}\nInspector: Matt Inghram\n\nWe'll call about 1 hour before arrival. Questions? (321) 524-3838.\n\nThank you,\nBreez Pool Care`
        });
        console.log('RESCHED_V2_CUSTOMER_EMAIL_SENT', { email: lead.email });
      } catch (emailErr) {
        console.warn('RESCHED_V2_CUSTOMER_EMAIL_FAILED', { error: emailErr.message });
      }
    }

    // Send admin notification email
    if (RESEND_API_KEY) {
    if (RESEND_API_KEY) {
      try {
        const resend = new Resend(RESEND_API_KEY);
        const dateFormatted = new Date(requestedDate + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        const oldDateFormatted = oldDate ? new Date(oldDate + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }) : 'Unknown';
        const customerName = `${lead.firstName || ''} ${lead.lastName || ''}`.trim() || lead.email;

        await resend.emails.send({
          from: 'Breez Pool Care <noreply@breezpoolcare.com>',
          to: 'matt@breezpoolcare.com',
          subject: `⚠️ Inspection Rescheduled — ${customerName}`,
          html: `<!DOCTYPE html>
<html><body style="font-family:-apple-system,sans-serif;color:#1f2937;max-width:600px;margin:0 auto;padding:24px;">
  <div style="background:#fff3cd;border:1px solid #ffc107;border-radius:8px;padding:20px;margin-bottom:20px;">
    <h2 style="margin:0 0 8px;font-size:18px;">⚠️ Inspection Rescheduled</h2>
    <p style="margin:0;font-size:14px;color:#664d03;">A customer has rescheduled their inspection. Please update your calendar.</p>
  </div>
  <table style="width:100%;border-collapse:collapse;font-size:14px;">
    <tr><td style="padding:8px 0;color:#6b7280;width:140px;">Customer</td><td style="padding:8px 0;font-weight:600;">${customerName}</td></tr>
    <tr><td style="padding:8px 0;color:#6b7280;">Email</td><td style="padding:8px 0;">${lead.email}</td></tr>
    <tr><td style="padding:8px 0;color:#6b7280;">Phone</td><td style="padding:8px 0;">${lead.mobilePhone || 'Not provided'}</td></tr>
    <tr><td style="padding:8px 0;color:#6b7280;">Address</td><td style="padding:8px 0;">${lead.serviceAddress || 'Not on file'}</td></tr>
    <tr><td colspan="2" style="padding-top:12px;border-top:1px solid #e5e7eb;"></td></tr>
    <tr><td style="padding:8px 0;color:#6b7280;">Old Date</td><td style="padding:8px 0;text-decoration:line-through;color:#9ca3af;">${oldDateFormatted} · ${oldTimeWindow || 'Unknown time'}</td></tr>
    <tr><td style="padding:8px 0;color:#1B9B9F;font-weight:600;">New Date</td><td style="padding:8px 0;font-weight:700;color:#1B9B9F;">${dateFormatted} · ${newTimeWindow}</td></tr>
    ${note ? `<tr><td style="padding:8px 0;color:#6b7280;">Customer Note</td><td style="padding:8px 0;font-style:italic;">"${note}"</td></tr>` : ''}
  </table>
  <p style="margin-top:20px;font-size:13px;color:#6b7280;">This change has been automatically applied to the schedule. No action required unless you need to follow up.</p>
</body></html>`,
          text: `Inspection Rescheduled\n\nCustomer: ${customerName}\nEmail: ${lead.email}\nPhone: ${lead.mobilePhone || 'N/A'}\n\nOld: ${oldDateFormatted} · ${oldTimeWindow}\nNew: ${dateFormatted} · ${newTimeWindow}\n${note ? `\nCustomer note: "${note}"\n` : ''}\nThe schedule has been automatically updated.`
        });
        console.log('RESCHED_V2_ADMIN_NOTIFIED');
      } catch (emailErr) {
        console.warn('RESCHED_V2_ADMIN_EMAIL_FAILED', { error: emailErr.message });
      }
    }

    console.log('RESCHED_V2_SUCCESS', { leadId, oldDate, requestedDate, requestedTimeSlot });
    return json200({
      success: true,
      scheduledDate: requestedDate,
      timeWindow: newTimeWindow,
      build: BUILD
    });

  } catch (error) {
    console.error('RESCHED_V2_CRASH', { error: error?.message });
    return json200({ success: false, error: 'Reschedule failed', detail: error?.message, build: BUILD });
  }
});