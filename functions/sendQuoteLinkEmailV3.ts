import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

const BUILD = "SQLE-V3-2026-03-02-A";

// All responses: HTTP 200, application/json; charset=utf-8
const json200 = (data) => new Response(
  JSON.stringify(data),
  { status: 200, headers: { "content-type": "application/json; charset=utf-8" } }
);

function resolveAppOrigin(appOriginRaw) {
  // Priority 1: PUBLIC_APP_URL env var
  const envUrl = Deno.env.get('PUBLIC_APP_URL');
  if (envUrl) {
    try {
      const u = new URL(envUrl);
      return { valid: true, origin: `${u.protocol}//${u.host}` };
    } catch {}
  }
  // Priority 2: appOrigin from request body
  if (appOriginRaw && typeof appOriginRaw === 'string') {
    try {
      const u = new URL(appOriginRaw);
      if (['http:', 'https:'].includes(u.protocol)) {
        return { valid: true, origin: `${u.protocol}//${u.host}` };
      }
    } catch {}
  }
  return { valid: false, reason: 'Could not resolve app origin. Set PUBLIC_APP_URL env variable.' };
}

function generateToken() {
  const arr = new Uint8Array(24);
  crypto.getRandomValues(arr);
  return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  const raw = await req.text();
  let payload = null;
  try { payload = raw ? JSON.parse(raw) : null; } catch {}

  // Force probe
  if (payload?.__force === "1") {
    return json200({ success: false, build: BUILD, note: "force reached V3" });
  }

  try {
    const { leadId, quoteId, firstName, email, appOrigin: appOriginRaw } = payload || {};

    const missingFields = [];
    if (!leadId || typeof leadId !== 'string' || !leadId.trim()) missingFields.push('leadId');
    if (!quoteId || typeof quoteId !== 'string' || !quoteId.trim()) missingFields.push('quoteId');
    if (!firstName || typeof firstName !== 'string' || !firstName.trim()) missingFields.push('firstName');
    if (!email || typeof email !== 'string' || !email.trim()) missingFields.push('email');

    if (missingFields.length > 0) {
      return json200({ success: false, error: 'Missing or invalid required fields', missingFields, build: BUILD });
    }

    const originCheck = resolveAppOrigin(appOriginRaw);
    if (!originCheck.valid) {
      console.error('V3_ORIGIN_INVALID', { appOriginRaw, reason: originCheck.reason });
      return json200({ success: false, error: originCheck.reason, build: BUILD });
    }
    const appOrigin = originCheck.origin;

    console.log('V3_ORIGIN_RESOLVED', { appOrigin, build: BUILD });

    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    if (!resendApiKey) {
      return json200({ success: false, error: 'RESEND_API_KEY not configured', build: BUILD });
    }

    // Load the Quote record and ensure it has a quoteToken
    let quoteRecord;
    try {
      const quotes = await base44.asServiceRole.entities.Quotes.filter({ id: quoteId });
      quoteRecord = quotes?.[0] ?? null;
    } catch (err) {
      return json200({ success: false, error: 'Failed to load Quote record', detail: String(err?.message ?? err), build: BUILD });
    }

    if (!quoteRecord) {
      return json200({ success: false, error: 'Quote not found', quoteId, build: BUILD });
    }

    // Ensure quoteToken exists; generate + persist if missing
    let quoteToken = quoteRecord.quoteToken;
    if (!quoteToken || typeof quoteToken !== 'string' || !quoteToken.trim()) {
      quoteToken = generateToken();
      try {
        await base44.asServiceRole.entities.Quotes.update(quoteId, { quoteToken });
        console.log('V3_TOKEN_GENERATED', { quoteId, quoteToken });
      } catch (err) {
        return json200({ success: false, error: 'Failed to persist quoteToken', detail: String(err?.message ?? err), build: BUILD });
      }
    }

    // Build the public quote link — /QuoteView/:quoteToken (no auth required)
    const link = `${appOrigin}/QuoteView/${encodeURIComponent(quoteToken)}`;
    const publicHomeLink = `${appOrigin}/PublicHome`;

    console.log('V3_SEND', { leadId, quoteId, quoteToken, email, link, build: BUILD });

    const TEAL = '#1B9B9F';
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
            <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;">Your Quote is Ready! 🏊</h1>
            <p style="margin:8px 0 0;color:rgba(255,255,255,0.85);font-size:14px;">Personalized pool care pricing — no login needed</p>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:32px 40px;">
            <p style="margin:0;font-size:16px;color:#1f2937;">Hi <strong>${firstName}</strong>,</p>
            <p style="margin:12px 0 24px;font-size:15px;color:#374151;line-height:1.7;">
              We've put together a custom quote based on your pool. It includes your estimated monthly rate, visit frequency, and any one-time fees — all transparent, no surprises.
            </p>

            <!-- CTA Button -->
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr><td align="center" style="padding:4px 0 28px;">
                <a href="${link}" style="display:inline-block;background-color:${TEAL};color:#ffffff;padding:15px 40px;text-decoration:none;border-radius:10px;font-weight:700;font-size:16px;letter-spacing:0.3px;">
                  View My Quote →
                </a>
              </td></tr>
            </table>

            <!-- What's included callout -->
            <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f0fdfd;border:2px solid ${TEAL};border-radius:12px;margin-bottom:24px;">
              <tr><td style="padding:20px 24px;">
                <p style="margin:0 0 12px;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:${TEAL};">Your quote includes</p>
                <table width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="padding:4px 0;font-size:14px;color:#374151;">✔&nbsp; Monthly service rate</td>
                    <td style="padding:4px 0;font-size:14px;color:#374151;">✔&nbsp; Visit frequency</td>
                  </tr>
                  <tr>
                    <td style="padding:4px 0;font-size:14px;color:#374151;">✔&nbsp; One-time startup fees</td>
                    <td style="padding:4px 0;font-size:14px;color:#374151;">✔&nbsp; Schedule inspection</td>
                  </tr>
                </table>
              </td></tr>
            </table>

            <p style="margin:0 0 6px;font-size:13px;color:#9ca3af;text-align:center;">
              Can't click the button? Copy this link into your browser:
            </p>
            <p style="margin:0;font-size:12px;color:${TEAL};text-align:center;word-break:break-all;">
              <a href="${link}" style="color:${TEAL};text-decoration:none;">${link}</a>
            </p>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding:0 40px 32px;border-top:1px solid #e5e7eb;">
            <p style="margin:20px 0 4px;font-size:14px;color:#374151;">Questions? We're happy to help.</p>
            <p style="margin:0;font-size:14px;color:#374151;">📞 <a href="tel:3215243838" style="color:${TEAL};text-decoration:none;">(321) 524-3838</a></p>
            <p style="margin:16px 0 0;font-size:13px;color:#9ca3af;">
              <strong style="color:#374151;">Breez Pool Care LLC</strong> &nbsp;·&nbsp; Space Coast, FL &nbsp;·&nbsp;
              <a href="${publicHomeLink}" style="color:${TEAL};text-decoration:none;">breezpoolcare.com</a>
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

    const emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${resendApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'Breez Pool Care <info@breezpoolcare.com>',
        to: [email],
        subject: 'Your Breez Pool Care Quote is Ready',
        html: htmlBody,
        text: `Hi ${firstName},\n\nYour Breez Pool Care quote is ready — no login needed.\n\nView it here: ${link}\n\nOr visit: ${publicHomeLink}`
      })
    });

    const resendText = await emailRes.text();
    let emailData = {};
    if (resendText?.trim()) {
      try { emailData = JSON.parse(resendText); } catch {}
    }

    if (!emailRes.ok) {
      console.error('V3 Resend error:', emailRes.status, resendText.slice(0, 200));
      return json200({ success: false, error: 'Resend failed', status: emailRes.status, body: resendText.slice(0, 300), build: BUILD });
    }

    const resendId = emailData.id ?? null;
    console.log('V3_SENT', { resendId, email, build: BUILD });

    // Stamp the Lead with email sent metadata
    const stampValue = new Date().toISOString();
    let stampUpdated = false;
    let stampError = null;
    try {
      await base44.asServiceRole.entities.Lead.update(leadId, {
        quoteLinkEmailSentAt: stampValue,
        quoteLinkEmailResendId: resendId
      });
      stampUpdated = true;
    } catch (stampErr) {
      stampError = String(stampErr?.message ?? stampErr);
    }
    console.log('V3_STAMP', { stampUpdated, stampError });

    return json200({
      success: true,
      quoteUrl: link,
      quoteToken,
      build: BUILD,
      resendId,
      stampUpdated,
      stampValue,
      stampError
    });

  } catch (error) {
    console.error('V3 crash:', error);
    return json200({ success: false, error: 'sendQuoteLinkEmailV3 crashed', message: String(error?.message ?? error), build: BUILD });
  }
});