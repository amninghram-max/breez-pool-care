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

    // Send admin notification email
    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
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