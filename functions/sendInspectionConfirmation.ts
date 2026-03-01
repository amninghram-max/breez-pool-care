import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { leadId, firstName, email, mobilePhone, inspectionDate, inspectionTime, serviceAddress, preferredContact, force } = await req.json();

    if (!firstName || !email) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // ── Idempotency check ──
    if (leadId && !force) {
      const lead = await base44.asServiceRole.entities.Lead.get(leadId).catch(() => null);
      if (lead?.inspectionConfirmationSent) {
        console.log(`Confirmation already sent for leadId=${leadId}, skipping. Use force=true to resend.`);
        return Response.json({ success: true, skipped: true, reason: 'already_sent' });
      }
    }

    // Send Email Confirmation
    const emailSubject = "Your Breez Pool Inspection is Confirmed";
    
    const emailBody = `Hi ${firstName},

Great news — your free pool inspection is confirmed.

Appointment Details:

Date: ${inspectionDate || 'To be scheduled'}
Time: ${inspectionTime || 'To be confirmed'}
Address: ${serviceAddress || 'Your service address'}

Matt will contact you approximately 30–60 minutes prior to arrival.

If you need to make changes, please contact us directly.

Thank you again for choosing Breez.

We look forward to meeting you.

— Breez Pool Care`;

    await base44.asServiceRole.integrations.Core.SendEmail({
      to: email,
      subject: emailSubject,
      body: emailBody,
      from_name: 'Breez Pool Care'
    });

    // Send SMS if phone exists and preferred contact includes text
    if (mobilePhone && (preferredContact === 'text' || !preferredContact)) {
      const smsBody = `Breez: Hi ${firstName}! Your free pool inspection is scheduled for ${inspectionDate} at ${inspectionTime}. Matt will call before arrival.`;
      
      try {
        await base44.asServiceRole.integrations.Core.SendEmail({
          to: mobilePhone + '@txt.att.net',
          subject: '',
          body: smsBody,
          from_name: 'Breez'
        });
      } catch (smsError) {
        console.warn('SMS send failed, continuing:', smsError);
      }
    }

    // ── Mark sent on Lead ──
    if (leadId) {
      await base44.asServiceRole.entities.Lead.update(leadId, {
        inspectionConfirmationSent: true,
        confirmationSentAt: new Date().toISOString(),
      }).catch(e => console.warn('Could not update Lead confirmation flag:', e.message));
    }

    return Response.json({ success: true, emailSent: true, smsSent: !!mobilePhone });
  } catch (error) {
    console.error('Error sending confirmation:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});