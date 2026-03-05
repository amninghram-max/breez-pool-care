import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';
import { Resend } from 'npm:resend@4.0.0';

const resend = new Resend(Deno.env.get('RESEND_API_KEY'));

/**
 * sendQuoteReadyEmail
 * Sends Email #1: "Your quote is ready → Schedule Free Inspection"
 * Includes tokenized link for passwordless scheduling.
 * Called after Quote is persisted in calculateQuote.
 * 
 * Idempotent: Only sends if quoteEmailSent !== true
 * Sets quoteEmailSent=true and quoteEmailSentAt after successful send
 */

import { getAppOrigin } from './_getAppOrigin.js';

function generateScheduleToken() {
  // Use cryptographically secure random bytes
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { quoteId } = await req.json();

    if (!quoteId) {
      return Response.json({ error: 'quoteId required' }, { status: 400 });
    }

    // Load quote
    const quote = await base44.asServiceRole.entities.Quote.get(quoteId);
    if (!quote) {
      return Response.json({ error: 'Quote not found' }, { status: 404 });
    }

    // Idempotency: only send if not already sent
    if (quote.quoteEmailSent) {
      console.log(`⏭️ Quote email already sent: quoteId=${quoteId}`);
      return Response.json({ success: true, alreadySent: true });
    }

    const { clientEmail, clientFirstName, outputMonthlyPrice, outputFrequency, outputOneTimeFees } = quote;

    if (!clientEmail) {
      return Response.json({ error: 'clientEmail required' }, { status: 400 });
    }

    // Generate schedule token + expiry (7 days)
    const scheduleToken = generateScheduleToken();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    // The scheduling page resolves via QuoteRequests.token (quoteToken), not scheduleToken.
    // We store scheduleToken on Quote for lifecycle tracking, but the link uses quoteToken.
    let schedulingToken = quote.quoteToken || null;

    // If no quoteToken on the Quote record, fall back to scheduleToken stored in QuoteRequests
    if (!schedulingToken) {
      try {
        const qrs = await base44.asServiceRole.entities.QuoteRequests.filter({ leadId: quote.leadId }, '-created_date', 1);
        if (qrs?.[0]?.token) schedulingToken = qrs[0].token;
      } catch (e) {
        console.warn('Could not find QuoteRequests token, using generated scheduleToken');
      }
    }

    // Fallback: use the generated scheduleToken (store it in QuoteRequests too)
    if (!schedulingToken) {
      schedulingToken = scheduleToken;
    }

    // Update quote with schedule token lifecycle fields
    await base44.asServiceRole.entities.Quote.update(quoteId, {
      scheduleToken,
      scheduleTokenExpiresAt: expiresAt,
      quoteEmailSent: true,
      quoteEmailSentAt: new Date().toISOString()
    });

    const appOrigin = getAppOrigin(req);
    const scheduleLink = `${appOrigin}/ScheduleInspection?token=${encodeURIComponent(schedulingToken)}`;

    const subject = 'Your Breez Quote Is Ready!';
    const TEAL = '#1B9B9F';
    const firstName = clientFirstName || 'there';
    const monthly = outputMonthlyPrice ? `$${outputMonthlyPrice.toFixed(2)}` : 'TBD';
    const freq = outputFrequency || 'weekly';
    const firstMonth = `$${((outputMonthlyPrice || 0) + (outputOneTimeFees || 0)).toFixed(2)}`;

    const htmlBody = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f4f7f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1f2937;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f7f8;padding:32px 16px;">
    <tr><td align="center">
      <table width="100%" style="max-width:600px;background-color:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.08);">
        <!-- Header -->
        <tr>
          <td style="background-color:${TEAL};padding:32px 40px;text-align:center;">
            <img src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/699a2b2056054b0207cea969/0b0c31666_Breez2.png" alt="Breez Pool Care" height="48" style="display:block;margin:0 auto 16px;" />
            <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;">Your Quote Is Ready! 🏊</h1>
            <p style="margin:8px 0 0;color:rgba(255,255,255,0.85);font-size:14px;">Personalized pool care pricing just for you</p>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:32px 40px;">
            <p style="margin:0;font-size:16px;color:#1f2937;">Hi <strong>${firstName}</strong>,</p>
            <p style="margin:12px 0 24px;font-size:15px;color:#374151;line-height:1.7;">Great news — your personalized pool care quote is ready! Here's a snapshot of your pricing:</p>

            <!-- Pricing Box -->
            <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f0fdfd;border:2px solid ${TEAL};border-radius:12px;margin-bottom:24px;">
              <tr><td style="padding:24px 28px;">
                <table width="100%" cellpadding="0" cellspacing="4">
                  <tr>
                    <td style="font-size:13px;color:#6b7280;padding:4px 0;">Monthly Rate</td>
                    <td style="font-size:18px;font-weight:700;color:#1f2937;text-align:right;">${monthly}<span style="font-size:13px;font-weight:400;color:#6b7280;"> / ${freq}</span></td>
                  </tr>
                  <tr>
                    <td style="font-size:13px;color:#6b7280;padding:4px 0;">First Month Total</td>
                    <td style="font-size:16px;font-weight:600;color:#1f2937;text-align:right;">${firstMonth}</td>
                  </tr>
                </table>
                <p style="margin:12px 0 0;font-size:11px;color:#9ca3af;">Estimate based on your questionnaire — final price confirmed at inspection.</p>
              </td></tr>
            </table>

            <!-- CTA -->
            <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.7;"><strong>Next step:</strong> Schedule your free pool inspection with Matt. He'll confirm the quote in person and answer all your questions — no obligation.</p>
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr><td align="center" style="padding:4px 0 28px;">
                <a href="${scheduleLink}" style="display:inline-block;background-color:${TEAL};color:#ffffff;padding:15px 40px;text-decoration:none;border-radius:10px;font-weight:700;font-size:16px;">
                  Schedule Free Inspection →
                </a>
              </td></tr>
            </table>

            <!-- What to expect -->
            <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;margin-bottom:20px;">
              <tr><td style="padding:20px 24px;">
                <p style="margin:0 0 12px;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:#374151;">What to expect at the inspection</p>
                <p style="margin:4px 0;font-size:14px;color:#374151;">✔&nbsp; Pool assessment &amp; water chemistry test</p>
                <p style="margin:4px 0;font-size:14px;color:#374151;">✔&nbsp; Equipment review</p>
                <p style="margin:4px 0;font-size:14px;color:#374151;">✔&nbsp; Final pricing confirmed</p>
                <p style="margin:4px 0;font-size:14px;color:#374151;">✔&nbsp; All your questions answered</p>
              </td></tr>
            </table>
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="padding:0 40px 32px;border-top:1px solid #e5e7eb;">
            <p style="margin:20px 0 4px;font-size:14px;color:#374151;">Questions? We're happy to help.</p>
            <p style="margin:0;font-size:14px;color:#374151;">📞 <a href="tel:3215243838" style="color:${TEAL};text-decoration:none;">(321) 524-3838</a></p>
            <p style="margin:16px 0 0;font-size:13px;color:#9ca3af;"><strong style="color:#374151;">Breez Pool Care LLC</strong> &nbsp;·&nbsp; Space Coast, FL</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

    const textBody = `Hi ${firstName},\n\nYour Breez Pool Care quote is ready!\n\nMonthly: ${monthly} (${freq})\nFirst month total: ${firstMonth}\n\nSchedule your free inspection: ${scheduleLink}\n\nQuestions? (321) 524-3838\n\n— Breez Pool Care`;

    await resend.emails.send({
      from: 'Breez Pool Care <noreply@breezpoolcare.com>',
      to: clientEmail,
      subject,
      html: htmlBody,
      text: textBody,
    });

    console.log(`✅ Quote ready email sent: quoteId=${quoteId}, email=${clientEmail}, token=${token.slice(0, 16)}...`);

    return Response.json({ success: true, quoteId, tokenExpiresAt: expiresAt });
  } catch (error) {
    console.error('sendQuoteReadyEmail error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});