import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

/**
 * resolveQuoteTokenPublicV1
 * Resolves a quote token to lead details (leadId, email, firstName, phone).
 * Public endpoint; no authentication required.
 */

const BUILD = "RESOLVE_TOKEN_V1-2026-03-05";

const json200 = (data) => new Response(
  JSON.stringify(data),
  { status: 200, headers: { "content-type": "application/json; charset=utf-8" } }
);

Deno.serve(async (req) => {
  const requestId = crypto.randomUUID();
  const meta = { build: BUILD, requestId };

  try {
    const base44 = createClientFromRequest(req);
    const payload = await req.json();
    const { token } = payload || {};

    if (!token || typeof token !== 'string' || !token.trim()) {
      return json200({ success: false, code: 'INVALID_TOKEN', error: 'Token is required', ...meta });
    }

    const cleanToken = token.trim();

    // Step 1: Query QuoteRequests by token
    let request = null;
    try {
      const requests = await base44.asServiceRole.entities.QuoteRequests.filter({ token: cleanToken }, null, 1);
      request = requests?.[0] || null;
    } catch (e) {
      console.error('RQT_V1_QUERY_FAILED', { error: e.message, requestId });
      return json200({ success: false, code: 'QUERY_ERROR', error: 'Failed to resolve token', ...meta });
    }

    if (!request) {
      return json200({ success: false, code: 'TOKEN_NOT_FOUND', error: 'Invalid or expired token', ...meta });
    }

    let leadId = request.leadId || null;
    let email = request.email === 'guest@breezpoolcare.com' ? null : (request.email || null);
    let firstName = request.firstName || null;
    const phone = request.phone || null;
    const snapshotId = request.id || null;

    // Step 2: Repair path — if leadId missing, try Quote entity
    if (!leadId || !email) {
      try {
        const quotes = await base44.asServiceRole.entities.Quote.filter({ quoteToken: cleanToken }, '-created_date', 1);
        const q = quotes?.[0];
        if (q) {
          if (!leadId && q.leadId) leadId = q.leadId;
          if (!email && q.clientEmail && q.clientEmail !== 'guest@breezpoolcare.com') email = q.clientEmail;
          if (!firstName && q.clientFirstName) firstName = q.clientFirstName;
          // Write repair back
          const patch = {};
          if (leadId && request.leadId !== leadId) patch.leadId = leadId;
          if (email && request.email !== email) patch.email = email;
          if (firstName && request.firstName !== firstName) patch.firstName = firstName;
          if (Object.keys(patch).length > 0) {
            await base44.asServiceRole.entities.QuoteRequests.update(request.id, patch).catch(() => {});
          }
        }
      } catch (e) {
        console.warn('RQT_V1_REPAIR_FAILED', { error: e.message, requestId });
      }
    }

    // Step 3: Validate lead exists and is not deleted
    if (leadId) {
      try {
        const leadRows = await base44.asServiceRole.entities.Lead.filter({ id: leadId }, null, 1);
        const lead = leadRows?.[0];
        if (!lead || lead.isDeleted === true) {
          return json200({ success: false, code: 'INCOMPLETE_DATA', error: 'Token does not have complete lead information', ...meta });
        }
        if (!email) email = lead.email || null;
        if (!firstName) firstName = lead.firstName || null;
      } catch (e) {
        return json200({ success: false, code: 'LEAD_LOOKUP_FAILED', error: 'Platform temporarily unavailable', ...meta });
      }
    }

    if (!leadId || !email) {
      return json200({ success: false, code: 'INCOMPLETE_DATA', error: 'Token does not have complete lead information', ...meta });
    }

    console.log('RQT_V1_SUCCESS', { tokenPrefix: cleanToken.slice(0, 8), leadId, requestId });
    return json200({ success: true, leadId, email, firstName, phone, snapshotId, ...meta });

  } catch (error) {
    console.error('RQT_V1_CRASH', { error: error?.message, requestId });
    return json200({ success: false, code: 'SERVER_ERROR', error: 'Failed to resolve token', ...meta });
  }
});