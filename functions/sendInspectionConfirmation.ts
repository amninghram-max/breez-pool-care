import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';
import { Resend } from 'npm:resend@4.0.0';

const resend = new Resend(Deno.env.get('RESEND_API_KEY'));

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { leadId, firstName, email, inspectionDate, inspectionTime, force } = await req.json();

    let lead = null;
    if (leadId) {
      lead = await base44.asServiceRole.entities.Lead.get(leadId).catch(() => null);
    }

    const finalFirstName = lead ? (lead.firstName || 'Customer') : (firstName || 'Customer');
    const finalEmail = (lead ? lead.email : email) || email;
    const finalInspectionDate = inspectionDate || (lead?.confirmedInspectionDate?.split('T')[0]);
    const finalInspectionTime = inspectionTime || 'To be confirmed';

    if (!finalEmail) {
      return Response.json({ error: 'Missing email: provide leadId or email param' }, { status: 400 });
    }

    if (leadId && !force && lead?.inspectionConfirmationSent) {
      console.log(`Confirmation already sent for leadId=${leadId}, skipping.`);
      return Response.json({ success: true, skipped: true, reason: 'already_sent' });
    }

    const dateFormatted = finalInspectionDate
      ? new Date(finalInspectionDate + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
      : 'To be scheduled';

    const subject = `Inspection Confirmed — ${dateFormatted} · Breez Pool Care`;
    const body = `Hi ${finalFirstName},

Your free pool inspection with Breez Pool Care is confirmed!

DATE: ${dateFormatted}
TIME WINDOW: ${finalInspectionTime}
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

    await resend.emails.send({
      from: 'Breez Pool Care <noreply@breezpoolcare.com>',
      to: finalEmail,
      subject,
      text: body,
    });

    if (leadId) {
      await base44.asServiceRole.entities.Lead.update(leadId, {
        inspectionConfirmationSent: true,
        confirmationSentAt: new Date().toISOString(),
      }).catch(e => console.warn('Could not update Lead confirmation flag:', e.message));
    }

    console.log('sendInspectionConfirmation: email sent to', finalEmail);
    return Response.json({ success: true, emailSent: true });
  } catch (error) {
    console.error('sendInspectionConfirmation error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});