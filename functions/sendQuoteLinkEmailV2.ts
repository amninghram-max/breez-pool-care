import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

const BUILD = "SQLE-V2-2026-03-01-H";

// All responses: HTTP 200, application/json; charset=utf-8
const json200 = (data) => new Response(
  JSON.stringify(data),
  { status: 200, headers: { "content-type": "application/json; charset=utf-8" } }
);

/**
 * Validates that appOrigin sent from the client (window.location.origin) is:
 * - a valid URL
 * - origin-only (pathname === "/", no search, no hash)
 * - protocol https
 * - hostname ends with .base44.app
 * Returns { valid: true, origin } or { valid: false, reason }
 */
function validateAppOrigin(appOrigin) {
  if (!appOrigin || typeof appOrigin !== 'string') {
    return { valid: false, reason: 'appOrigin is required in request body' };
  }
  let u;
  try {
    u = new URL(appOrigin);
  } catch {
    return { valid: false, reason: `appOrigin is not a valid URL: ${appOrigin}` };
  }
  if (u.protocol !== 'https:') {
    return { valid: false, reason: `appOrigin must use https, got: ${u.protocol}` };
  }
  if (!u.hostname.endsWith('.base44.app')) {
    return { valid: false, reason: `appOrigin hostname must end with .base44.app, got: ${u.hostname}` };
  }
  if (u.pathname !== '/' || u.search || u.hash) {
    return { valid: false, reason: `appOrigin must be origin-only (no path/search/hash), got: ${appOrigin}` };
  }
  return { valid: true, origin: `${u.protocol}//${u.host}` };
}

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  const raw = await req.text();
  let payload = null;
  try { payload = raw ? JSON.parse(raw) : null; } catch {}

  // Force probe
  if (payload?.__force === "1") {
    return json({ success: false, build: BUILD, note: "force reached V2" });
  }

  try {
    const { leadId, firstName, email } = payload || {};

    const missingFields = [];
    if (!leadId || typeof leadId !== 'string' || !leadId.trim()) missingFields.push('leadId');
    if (!firstName || typeof firstName !== 'string' || !firstName.trim()) missingFields.push('firstName');
    if (!email || typeof email !== 'string' || !email.trim()) missingFields.push('email');

    if (missingFields.length > 0) {
      return json({ success: false, error: 'Missing or invalid required fields', missingFields, build: BUILD });
    }

    const appOrigin = getAppOrigin(req);
    if (!appOrigin) {
      console.error('V2 getAppOrigin: no valid origin found', {
        url: req.url,
        host: req.headers.get("host"),
        xfHost: req.headers.get("x-forwarded-host"),
        xfProto: req.headers.get("x-forwarded-proto")
      });
      return json({
        success: false,
        error: 'Could not determine application URL',
        detail: `req.url=${req.url} host=${req.headers.get("host")} xfHost=${req.headers.get("x-forwarded-host")}`,
        build: BUILD
      });
    }

    console.log('V2_ORIGIN_RESOLVED', { appOrigin, build: BUILD });

    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    if (!resendApiKey) {
      return json({ success: false, error: 'RESEND_API_KEY not configured', build: BUILD });
    }

    const link = `${appOrigin}/PreQualification?leadId=${encodeURIComponent(leadId)}`;
    const publicHomeLink = `${appOrigin}/PublicHome`;

    console.log('V2_SEND', { leadId, email, link, build: BUILD });

    const htmlBody = `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;line-height:1.6;color:#333;">
  <div style="max-width:600px;margin:0 auto;padding:20px;">
    <div style="text-align:center;margin-bottom:30px;">
      <h2 style="color:#1B9B9F;margin:0;font-size:24px;">Breez Pool Care</h2>
    </div>
    <p style="font-size:16px;margin-bottom:20px;">Hi ${firstName},</p>
    <p style="font-size:15px;margin-bottom:20px;">Thank you for your interest in Breez Pool Care! We're excited to help you keep your pool crystal clear.</p>
    <p style="font-size:15px;margin-bottom:30px;">Click the button below to complete your pool questionnaire and get a personalized service quote in just a few minutes.</p>
    <div style="text-align:center;margin-bottom:20px;">
      <a href="${link}" style="display:inline-block;background-color:#1B9B9F;color:white;padding:14px 32px;text-decoration:none;border-radius:6px;font-weight:600;font-size:16px;">Start Your Quote</a>
    </div>
    <p style="font-size:13px;text-align:center;color:#666;margin-bottom:20px;">Or copy and paste this link:<br><a href="${link}" style="color:#1B9B9F;word-break:break-all;">${link}</a></p>
    <p style="font-size:13px;text-align:center;color:#666;margin-bottom:30px;">Having trouble? <a href="${publicHomeLink}" style="color:#1B9B9F;">Visit our homepage</a></p>
    <div style="border-top:1px solid #eee;padding-top:20px;text-align:center;color:#666;font-size:13px;">
      <p style="margin:5px 0;">If you have any questions, we're here to help!<br><strong>Breez Pool Care Team</strong></p>
    </div>
  </div>
</body>
</html>`;

    const emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${resendApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'Breez Pool Care <info@breezpoolcare.com>',
        to: [email],
        subject: 'Get Your Breez Pool Service Quote',
        html: htmlBody,
        text: `Hi ${firstName},\n\nThank you for your interest in Breez Pool Care!\n\nStart your quote: ${link}\n\nOr visit: ${publicHomeLink}`
      })
    });

    const resendText = await emailRes.text();
    let emailData = {};
    if (resendText?.trim()) {
      try { emailData = JSON.parse(resendText); } catch {}
    }

    if (!emailRes.ok) {
      console.error('V2 Resend error:', emailRes.status, resendText.slice(0, 200));
      return json({ success: false, error: 'Resend failed', status: emailRes.status, body: resendText.slice(0, 300), build: BUILD });
    }

    const resendId = emailData.id ?? null;
    console.log('V2_SENT', { resendId, email, build: BUILD });

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
    console.log('V2_STAMP', { stampUpdated, stampError });

    return json({ success: true, build: BUILD, link, resendId, stampUpdated, stampValue, stampError });

  } catch (error) {
    console.error('V2 crash:', error);
    return json({ success: false, error: 'sendQuoteLinkEmailV2 crashed', message: String(error?.message ?? error), build: BUILD });
  }
});