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

    const htmlBody = `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;line-height:1.6;color:#333;">
  <div style="max-width:600px;margin:0 auto;padding:20px;">
    <div style="text-align:center;margin-bottom:30px;">
      <h2 style="color:#1B9B9F;margin:0;font-size:24px;">Breez Pool Care</h2>
    </div>
    <p style="font-size:16px;margin-bottom:20px;">Hi ${firstName},</p>
    <p style="font-size:15px;margin-bottom:20px;">Your personalized Breez Pool Care quote is ready. No account or login needed — just click the button below to view it.</p>
    <div style="text-align:center;margin-bottom:20px;">
      <a href="${link}" style="display:inline-block;background-color:#1B9B9F;color:white;padding:14px 32px;text-decoration:none;border-radius:6px;font-weight:600;font-size:16px;">View Your Quote</a>
    </div>
    <p style="font-size:13px;text-align:center;color:#666;margin-bottom:20px;">Or copy and paste this link:<br><a href="${link}" style="color:#1B9B9F;word-break:break-all;">${link}</a></p>
    <p style="font-size:13px;text-align:center;color:#666;margin-bottom:30px;">Having trouble? <a href="${publicHomeLink}" style="color:#1B9B9F;">Visit our homepage</a></p>
    <div style="border-top:1px solid #eee;padding-top:20px;text-align:center;color:#666;font-size:13px;">
      <p style="margin:5px 0;">Questions? We're happy to help.<br><strong>Breez Pool Care Team</strong></p>
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