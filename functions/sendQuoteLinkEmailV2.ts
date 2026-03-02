import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

const BUILD = "SQLE-V2-2026-03-01-H";

// All responses: HTTP 200, application/json; charset=utf-8
const json200 = (data) => new Response(
  JSON.stringify(data),
  { status: 200, headers: { "content-type": "application/json; charset=utf-8" } }
);

/**
 * Generates a cryptographically secure 24-byte hex token
 */
function generateToken() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

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
  try {
    const base44 = createClientFromRequest(req);

    const raw = await req.text();
    let payload = null;
    try {
      payload = raw ? JSON.parse(raw) : null;
    } catch (jsonErr) {
      return json200({
        success: false,
        error: 'Invalid JSON body',
        detail: String(jsonErr?.message ?? jsonErr),
        build: BUILD
      });
    }

    // Force probe
    if (payload?.__force === "1") {
      return json200({ success: false, build: BUILD, note: "force reached V2" });
    }
    const { leadId, email, appOrigin: appOriginRaw, origin: originFallback, firstName } = payload || {};

    // Validate required fields
    const missing = {
      leadId: !leadId || typeof leadId !== 'string' || !leadId.trim(),
      email: !email || typeof email !== 'string' || !email.trim(),
      appOrigin: !appOriginRaw && !originFallback
    };

    if (missing.leadId || missing.email || missing.appOrigin) {
      return json200({
        success: false,
        error: 'Missing or invalid required fields',
        missing,
        receivedKeys: Object.keys(payload || {}),
        build: BUILD
      });
    }

    const appOriginRawToValidate = appOriginRaw || originFallback;
    const originCheck = validateAppOrigin(appOriginRawToValidate);
    if (!originCheck.valid) {
      console.error('V2_ORIGIN_INVALID', { appOriginRaw: appOriginRawToValidate, reason: originCheck.reason });
      return json200({ success: false, error: originCheck.reason, build: BUILD });
    }
    const appOrigin = originCheck.origin;

    console.log('V2_ORIGIN_RESOLVED', { appOrigin, build: BUILD });

    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    if (!resendApiKey) {
      return json200({ success: false, error: 'RESEND_API_KEY not configured', build: BUILD });
    }

    // Find or create Quote for this lead
    let quotes = [];
    try {
      quotes = await base44.asServiceRole.entities.Quote.filter({ leadId });
    } catch (filterErr) {
      console.error('V2_QUOTE_FILTER_FAILED', { leadId, error: String(filterErr?.message ?? filterErr) });
      return json200({
        success: false,
        error: 'Failed to query quotes',
        detail: String(filterErr?.message ?? filterErr),
        build: BUILD
      });
    }

    let quote = quotes?.[0];
    let quoteToken = quote?.quoteToken;

    if (!quote) {
      // Create new Quote shell for this lead
      quoteToken = generateToken();
      const createPayload = {
        leadId,
        status: 'SENT',
        quoteToken
      };
      try {
        const newQuote = await base44.asServiceRole.entities.Quote.create(createPayload);
        quote = newQuote;
        console.log('V2_QUOTE_CREATED', { quoteId: quote.id, leadId });
      } catch (createErr) {
        const errorDetail = createErr?.message ?? String(createErr);
        const errorStack = createErr?.stack ? String(createErr.stack).slice(0, 300) : undefined;
        const errorCause = createErr?.cause ? String(createErr.cause) : undefined;
        const errorErrors = createErr?.errors ? JSON.stringify(createErr.errors) : undefined;
        
        console.error('V2_QUOTE_CREATE_FAILED', {
          leadId,
          message: errorDetail,
          cause: errorCause,
          errors: errorErrors
        });
        
        return json200({
          success: false,
          error: 'Failed to create quote',
          detail: errorDetail,
          cause: errorCause,
          errors: errorErrors,
          createPayloadKeys: Object.keys(createPayload),
          build: BUILD
        });
      }
    } else if (!quoteToken) {
      // Quote exists but has no token; generate and update
      quoteToken = generateToken();
      try {
        await base44.asServiceRole.entities.Quote.update(quote.id, { quoteToken });
        console.log('V2_TOKEN_GENERATED', { quoteId: quote.id });
      } catch (tokenErr) {
        console.error('V2_TOKEN_UPDATE_FAILED', { quoteId: quote.id, error: String(tokenErr?.message ?? tokenErr) });
        return json200({
          success: false,
          error: 'Failed to generate quote token',
          detail: String(tokenErr?.message ?? tokenErr),
          build: BUILD
        });
      }
    }

    const link = `${appOrigin}/QuoteView/${encodeURIComponent(quoteToken)}`;
    const publicHomeLink = `${appOrigin}/PublicHome`;

    console.log('V2_SEND', { quoteId: quote.id, email, link, build: BUILD });

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
      return json200({ success: false, error: 'Resend failed', status: emailRes.status, body: resendText.slice(0, 300), build: BUILD });
    }

    const resendId = emailData.id ?? null;
    console.log('V2_SENT', { resendId, email, quoteId: quote.id, build: BUILD });

    return json200({ success: true, quoteUrl: link, quoteId: quote.id, build: BUILD, resendId });

  } catch (error) {
    console.error('V2 crash:', error);
    const detail = String(error?.message ?? error);
    const stack = error?.stack ? String(error.stack).slice(0, 500) : undefined;
    return json200({
      success: false,
      error: 'sendQuoteLinkEmailV2 crashed',
      detail,
      stack,
      build: BUILD
    });
  }
});