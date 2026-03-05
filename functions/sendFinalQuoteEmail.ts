import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';
import { Resend } from 'npm:resend@4.0.0';

/**
 * sendFinalQuoteEmail
 * Sends locked quote + account activation link to customer after inspection finalization.
 * Triggered by finalizeInspection when outcome = 'new_customer'.
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { inspectionRecordId, leadId } = await req.json();

    if (!inspectionRecordId || !leadId) {
      return Response.json({ error: 'inspectionRecordId and leadId required' }, { status: 400 });
    }

    const [record, lead] = await Promise.all([
      base44.asServiceRole.entities.InspectionRecord.get(inspectionRecordId),
      base44.asServiceRole.entities.Lead.get(leadId),
    ]);

    if (!record || !lead) {
      return Response.json({ error: 'Record or Lead not found' }, { status: 404 });
    }

    if (record.finalQuoteEmailSent) {
      return Response.json({ success: true, alreadySent: true });
    }

    const monthlyRate = record.lockedMonthlyRate || 0;
    const frequency = record.lockedFrequency || 'weekly';
    const visitsPerMonth = frequency === 'twice_weekly' ? 8 : 4;
    const perVisit = visitsPerMonth > 0 ? (monthlyRate / visitsPerMonth) : 0;
    const greenFee = record.greenToCleanFee || 0;
    const firstName = lead.firstName || 'there';
    const email = lead.email;

    if (!email) {
      return Response.json({ error: 'Lead has no email' }, { status: 400 });
    }

    const proto = req.headers.get('x-forwarded-proto') || 'https';
    const host = req.headers.get('x-forwarded-host') || req.headers.get('host') || '';
    const appOrigin = Deno.env.get('PUBLIC_APP_URL')?.replace(/\/$/, '') || `${proto}://${host}`;
    const activationLink = `${appOrigin}/Activate?leadId=${encodeURIComponent(leadId)}`;

    const firstMonthTotal = monthlyRate + greenFee;
    const TEAL = '#1B9B9F';

    const subject = 'Your Breez Service Agreement Is Ready — Activate Your Account';

    const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f4f7f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1f2937;">
<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f7f8;padding:32px 16px;">
<tr><td align="center">
<table width="100%" style="max-width:600px;background-color:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.08);">
<tr><td style="background-color:${TEAL};padding:32px 40px;text-align:center;">
  <img src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/699a2b2056054b0207cea969/0b0c31666_Breez2.png" alt="Breez Pool Care" height="48" style="display:block;margin:0 auto 16px;"/>
  <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;">Inspection Complete — Let's Get Started!</h1>
  <p style="margin:6px 0 0;color:rgba(255,255,255,0.85);font-size:14px;">Review your service agreement and activate your account</p>
</td></tr>
<tr><td style="padding:32px 40px 0;">
  <p style="margin:0;font-size:16px;">Hi <strong>${firstName}</strong>,</p>
  <p style="margin:12px 0 0;font-size:15px;color:#374151;line-height:1.7;">Thanks for having us out! Based on what we saw during the inspection, here are your confirmed service details:</p>
</td></tr>
<!-- Pricing card -->
<tr><td style="padding:24px 40px 0;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#e8f8f9;border:2px solid ${TEAL};border-radius:12px;">
    <tr><td style="padding:24px 28px;text-align:center;">
      <p style="margin:0 0 4px;font-size:12px;text-transform:uppercase;letter-spacing:0.8px;color:${TEAL};font-weight:600;">Monthly Service Rate</p>
      <p style="margin:0;font-size:32px;font-weight:700;color:${TEAL};">$${monthlyRate.toFixed(2)}<span style="font-size:16px;font-weight:400;color:#6b7280;">/mo</span></p>
      <p style="margin:4px 0 0;font-size:14px;color:#4b5563;">${frequency === 'twice_weekly' ? 'Twice Weekly' : 'Weekly'} service · ~$${perVisit.toFixed(2)}/visit</p>
      ${greenFee > 0 ? `<p style="margin:12px 0 0;font-size:13px;color:#777;">Green-to-Clean (one-time): $${greenFee.toFixed(2)}</p>` : ''}
      <p style="margin:8px 0 0;font-size:14px;font-weight:600;color:#1f2937;">First month total: $${firstMonthTotal.toFixed(2)}</p>
    </td></tr>
  </table>
</td></tr>
<!-- CTA -->
<tr><td style="padding:28px 40px 0;text-align:center;">
  <p style="margin:0 0 16px;font-size:15px;color:#374151;">Click below to create your account, review your service agreement, and complete your initial payment:</p>
  <a href="${activationLink}" style="display:inline-block;background-color:${TEAL};color:#ffffff;padding:16px 36px;border-radius:8px;text-decoration:none;font-weight:700;font-size:16px;">Activate My Account →</a>
  <p style="margin:12px 0 0;font-size:12px;color:#9ca3af;">Or copy: <a href="${activationLink}" style="color:${TEAL};word-break:break-all;">${activationLink}</a></p>
</td></tr>
<tr><td style="padding:28px 40px 32px;">
  <p style="margin:0 0 16px;font-size:14px;color:#374151;">Once your agreement is accepted and payment is processed, we'll place you on the schedule and service will begin. Questions? Call or text <strong>(321) 524-3838</strong>.</p>
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

    const text = `Hi ${firstName},\n\nYour Breez Pool Care inspection is complete! Here are your confirmed service details:\n\nMonthly Rate: $${monthlyRate.toFixed(2)}/month (${frequency === 'twice_weekly' ? 'Twice Weekly' : 'Weekly'})\nPer visit: ~$${perVisit.toFixed(2)}\n${greenFee > 0 ? `Green-to-Clean (one-time): $${greenFee.toFixed(2)}\n` : ''}First month total: $${firstMonthTotal.toFixed(2)}\n\nActivate your account and review your service agreement:\n${activationLink}\n\nQuestions? Call (321) 524-3838.\n\n— Matt & The Breez Team`;

    const resend = new Resend(Deno.env.get('RESEND_API_KEY'));
    await resend.emails.send({
      from: 'Breez Pool Care <noreply@breezpoolcare.com>',
      to: email,
      subject,
      html,
      text
    });

    // Mark sent
    await base44.asServiceRole.entities.InspectionRecord.update(inspectionRecordId, {
      finalQuoteEmailSent: true,
      finalQuoteEmailSentAt: new Date().toISOString(),
    });
    await base44.asServiceRole.entities.Lead.update(leadId, { quoteEmailSent: true });

    console.log(`sendFinalQuoteEmail: sent to ${email} for inspection ${inspectionRecordId}`);
    return Response.json({ success: true });
  } catch (error) {
    console.error('sendFinalQuoteEmail error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});