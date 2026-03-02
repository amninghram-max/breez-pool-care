import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * publicSubmitQuoteRequest
 * Public endpoint (no auth required). Accepts public quote request submissions.
 * Stores in PublicQuoteRequest entity for staff review and conversion to Lead.
 * 
 * Validates:
 * - email (required, basic format)
 * - firstName (required, ≤50 chars)
 * - source (required)
 * - questionnaireData (required, object)
 * 
 * Sets:
 * - status: "pending"
 * - ipHash: SHA-256 of client IP
 * - userAgent: from request headers
 * 
 * Returns: { success: true, requestId }
 */

function hashIP(ip) {
  if (!ip) return null;
  const enc = new TextEncoder();
  const data = enc.encode(ip);
  return crypto.subtle.digest('SHA-256', data).then(hashBuffer => {
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  });
}

function getClientIP(req) {
  return req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
         req.headers.get('x-real-ip') ||
         req.headers.get('cf-connecting-ip') ||
         null;
}

function validateEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

Deno.serve(async (req) => {
  const headers = { 'Content-Type': 'application/json; charset=utf-8' };
  try {
    const base44 = createClientFromRequest(req);
    const payload = await req.json();

    const { email, firstName, phone, source, questionnaireData } = payload;

    // ── Validation ──
    const errors = [];
    
    if (!email || typeof email !== 'string') {
      errors.push('email is required');
    } else if (!validateEmail(email)) {
      errors.push('email format invalid');
    }

    if (!firstName || typeof firstName !== 'string') {
      errors.push('firstName is required');
    } else if (firstName.trim().length > 50) {
      errors.push('firstName must be ≤50 characters');
    }

    if (!source || typeof source !== 'string') {
      errors.push('source is required');
    }

    if (!questionnaireData || typeof questionnaireData !== 'object') {
      errors.push('questionnaireData must be an object');
    }

    if (errors.length > 0) {
      return new Response(JSON.stringify({ success: false, errors }), { status: 200, headers });
    }

    // ── Extract IP and UserAgent ──
    const clientIP = getClientIP(req);
    const userAgent = req.headers.get('user-agent') || null;
    const ipHash = clientIP ? await hashIP(clientIP) : null;

    // ── Create PublicQuoteRequest ──
    const record = await base44.asServiceRole.entities.PublicQuoteRequest.create({
      email: email.trim(),
      firstName: firstName.trim(),
      phone: phone ? String(phone).trim() : undefined,
      source,
      status: 'pending',
      questionnaireData: JSON.stringify(questionnaireData),
      ipHash,
      userAgent,
    });

    console.log('PUBLIC_QUOTE_REQUEST_CREATED', { requestId: record.id, email, source });

    return new Response(JSON.stringify({
      success: true,
      requestId: record.id,
    }), { status: 200, headers });

  } catch (error) {
    console.error('PUBLIC_QUOTE_REQUEST_ERROR', { error: error?.message, stack: error?.stack?.slice(0, 300) });
    return new Response(JSON.stringify({ success: false, error: 'Request submission failed', detail: error?.message }), { status: 200, headers });
  }
});