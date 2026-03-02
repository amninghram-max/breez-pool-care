import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { getAppOrigin } from "./_getAppOrigin.js";

const BUILD = "SQLE-STAMP-CONFIRM-2026-03-01-B";

/**
 * sendQuoteLinkEmail
 * 
 * Expected payload: { leadId: string, firstName: string, email: string }
 * 
 * Method: POST
 * Content-Type: application/json
 * 
 * Returns HTTP 200 with success:false for validation errors:
 * - Body is missing or empty
 * - Body is not valid JSON
 * - Required fields are missing/invalid
 * 
 * Returns HTTP 500 only for true server failures (Resend errors, env issues, etc.)
 */

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  try {
    // Capture diagnostics immediately
    const method = req.method;
    const contentType = req.headers.get("content-type") || "";
    const raw = await req.text();
    const bodyLength = raw?.length ?? 0;

    console.log("SQLE build", BUILD, { method, contentType, bodyLength });
    console.log('📨 sendQuoteLinkEmail request:', { method, contentType, bodyLength, bodyPreview: raw.slice(0, 80) });

    if (bodyLength === 0) {
      const obj = {
        success: false,
        error: 'Missing JSON body',
        diagnostics: { method, contentType, bodyLength },
        expected: { leadId: 'string', firstName: 'string', email: 'string' },
        build: BUILD
      };
      return new Response(JSON.stringify(obj), {
        status: 200,
        headers: { "content-type": "application/json; charset=utf-8" }
      });
    }

    let payload;
    try {
      payload = JSON.parse(raw);
    } catch (parseError) {
      const obj = {
        success: false,
        error: 'Invalid JSON body',
        diagnostics: { method, contentType, bodyLength, rawPreview: raw.slice(0, 120) },
        message: String(parseError?.message ?? parseError),
        build: BUILD
      };
      return new Response(JSON.stringify(obj), {
        status: 200,
        headers: { "content-type": "application/json; charset=utf-8" }
      });
    }

    const { leadId, firstName, email } = payload;

    // Validate required fields: non-empty strings
    const missingFields = [];
    if (!leadId || typeof leadId !== 'string' || leadId.trim() === '') missingFields.push('leadId');
    if (!firstName || typeof firstName !== 'string' || firstName.trim() === '') missingFields.push('firstName');
    if (!email || typeof email !== 'string' || email.trim() === '') missingFields.push('email');

    if (missingFields.length > 0) {
      console.warn('❌ sendQuoteLinkEmail: Missing or invalid required fields:', missingFields);
      const obj = {
        success: false,
        error: 'Missing or invalid required fields',
        missingFields,
        build: BUILD
      };
      return new Response(JSON.stringify(obj), {
        status: 200,
        headers: { "content-type": "application/json; charset=utf-8" }
      });
    }

    // Resolve app origin using helper
    let appOrigin;
    try {
      appOrigin = getAppOrigin(req);
    } catch (error) {
      console.error('❌ Failed to determine app origin:', error.message);
      const obj = {
        success: false,
        error: 'Could not determine application URL',
        details: error.message,
        build: BUILD
      };
      return new Response(JSON.stringify(obj), {
        status: 200,
        headers: { "content-type": "application/json; charset=utf-8" }
      });
    }

    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    if (!resendApiKey) {
      console.error('❌ RESEND_API_KEY env var not set');
      const obj = {
        success: false,
        error: 'RESEND_API_KEY environment variable not configured',
        build: BUILD
      };
      return new Response(JSON.stringify(obj), {
        status: 200,
        headers: { "content-type": "application/json; charset=utf-8" }
      });
    }
    
    const quoteLink = `${appOrigin}/PreQualification?leadId=${encodeURIComponent(leadId)}`;

    console.log('📧 sendQuoteLinkEmail:', { leadId, email, quoteLink, resendFrom: 'info@breezpoolcare.com' });

    // Send HTML email with branded CTA button via Resend (supports external emails)
    const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333;">
  <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
    <!-- Header -->
    <div style="text-align: center; margin-bottom: 30px;">
      <h2 style="color: #1B9B9F; margin: 0; font-size: 24px;">Breez Pool Care</h2>
    </div>
    
    <!-- Greeting -->
    <p style="font-size: 16px; margin-bottom: 20px;">Hi ${firstName},</p>
    
    <!-- Body -->
    <p style="font-size: 15px; margin-bottom: 20px;">
      Thank you for your interest in Breez Pool Care! We're excited to help you keep your pool crystal clear.
    </p>
    <p style="font-size: 15px; margin-bottom: 30px;">
      Click the button below to complete your pool questionnaire and get a personalized service quote in just a few minutes.
    </p>
    
    <!-- CTA Button -->
    <div style="text-align: center; margin-bottom: 30px;">
      <a href="${quoteLink}" style="display: inline-block; background-color: #1B9B9F; color: white; padding: 14px 32px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px; transition: background-color 200ms ease;">
        Get Your Free Quote
      </a>
    </div>
    
    <!-- Fallback Link -->
    <p style="font-size: 13px; text-align: center; color: #666; margin-bottom: 30px;">
      Or copy and paste this link in your browser:<br>
      <span style="color: #1B9B9F; word-break: break-all;"><a href="${quoteLink}" style="color: #1B9B9F; text-decoration: underline;">${quoteLink}</a></span>
    </p>
    
    <!-- Footer -->
    <div style="border-top: 1px solid #eee; padding-top: 20px; text-align: center; color: #666; font-size: 13px;">
      <p style="margin: 5px 0;">
        If you have any questions, we're here to help!<br>
        <strong>Breez Pool Care Team</strong>
      </p>
    </div>
  </div>
</body>
</html>
    `;

    // Send email ONLY via Resend API (no Core.SendEmail, supports external addresses)
    const emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'Breez Pool Care <info@breezpoolcare.com>',
        to: [email],
        subject: 'Get Your Breez Pool Service Quote',
        html: htmlBody,
        text: `Hi ${firstName},\n\nThank you for your interest in Breez Pool Care! Click here to get your quote:\n${quoteLink}`
      })
    });

    // Safe Resend response parsing: read text first, parse only if non-empty
    const resendText = await emailRes.text();
    let emailData = {};
    
    if (resendText && resendText.trim()) {
      try {
        emailData = JSON.parse(resendText);
      } catch (parseError) {
        console.error('❌ Resend response parsing error:', parseError.message, { status: emailRes.status, resendTextPreview: resendText.slice(0, 120) });
        emailData = { message: 'Failed to parse Resend response' };
      }
    } else {
      console.warn('⚠️ Resend returned empty response body', { status: emailRes.status });
    }

    if (!emailRes.ok) {
      const errorMsg = emailData.message || emailRes.statusText || `HTTP ${emailRes.status}`;
      console.error('❌ Resend API error:', errorMsg, { status: emailRes.status, resendResponse: emailData });
      const obj = {
        success: false,
        error: 'Resend failed',
        status: emailRes.status,
        body: resendText,
        build: BUILD
      };
      return new Response(JSON.stringify(obj), {
        status: 200,
        headers: { "content-type": "application/json; charset=utf-8" }
      });
    }

    console.log('✅ Quote link email sent via Resend:', { id: emailData.id, to: email, link: quoteLink, build: BUILD });

    // Stamp the Lead so frontend can verify success even if SDK parse fails
    let stampUpdated = false;
    let stampError = null;
    let stampValue = new Date().toISOString();

    console.log('STAMP_ATTEMPT', { leadId, stampValue });
    try {
      await base44.asServiceRole.entities.Lead.update(leadId, {
        confirmationSentAt: stampValue
      });
      stampUpdated = true;
    } catch (stampErr) {
      stampError = String(stampErr?.stack ?? stampErr?.message ?? stampErr);
    }
    console.log('STAMP_RESULT', { stampUpdated, stampError });

    return new Response(JSON.stringify({
      success: true,
      build: BUILD,
      resendId: emailData.id ?? null,
      link: quoteLink,
      stampField: "confirmationSentAt",
      stampUpdated,
      stampValue,
      stampError
    }), {
      status: 200,
      headers: { "content-type": "application/json; charset=utf-8" }
    });
  } catch (error) {
    console.error('❌ sendQuoteLinkEmail error:', error);
    const obj = {
      success: false,
      error: 'sendQuoteLinkEmail crashed',
      message: String(error?.stack ?? error?.message ?? error),
      build: BUILD
    };
    return new Response(JSON.stringify(obj), {
      status: 200,
      headers: { "content-type": "application/json; charset=utf-8" }
    });
  }
});