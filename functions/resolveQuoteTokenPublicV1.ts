import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * resolveQuoteTokenPublicV1
 * Resolves a quote token to lead details (leadId, email, firstName, phone).
 * Public endpoint; no authentication required.
 */

const BUILD = "RESOLVE_TOKEN_V1-2026-03-04-F";

const json200 = (data) => new Response(
  JSON.stringify(data),
  { status: 200, headers: { "content-type": "application/json; charset=utf-8" } }
);

Deno.serve(async (req) => {
  const requestId = crypto.randomUUID();
  const runtimeVersion = BUILD;
  const meta = { build: BUILD, runtimeVersion, requestId };

  try {
    const base44 = createClientFromRequest(req);
    const payload = await req.json();
    const { token } = payload || {};

    console.log('RQT_V1_ENTRY_VERSION', { runtimeVersion, requestId, token: token ? token.slice(0, 8) : null });

    if (!token || typeof token !== 'string' || !token.trim()) {
      return json200({ success: false, code: 'INVALID_TOKEN', error: 'Token is required', ...meta });
    }

    let request = null;
    try {
      const requests = await base44.asServiceRole.entities.QuoteRequests.filter({ token: token.trim() }, null, 1);
      request = requests?.[0] || null;
    } catch (e) {
      console.error('RESOLVE_TOKEN_V1_QUERY_FAILED', { requestId, error: e.message });
      return json200({ success: false, code: 'QUERY_ERROR', error: 'Failed to resolve token', ...meta });
    }

    if (!request) {
      return json200({ success: false, code: 'TOKEN_NOT_FOUND', error: 'Invalid or expired token', ...meta });
    }

    let leadId = request.leadId || null;
    let email = request.email || null;
    let firstName = request.firstName || null;
    let phone = request.phone || null;
    const snapshotId = request.snapshotId || request.id || null;

    if (!leadId || !email || email === 'guest@breezpoolcare.com') {
      try {
        const quotes = await base44.asServiceRole.entities.Quote.filter({ quoteToken: token.trim() }, '-created_date', 1);
        const quote = quotes?.[0] || null;
        if (quote) {
          if (!leadId && quote.leadId) leadId = quote.leadId;
          if ((!email || email === 'guest@breezpoolcare.com') && quote.clientEmail) email = quote.clientEmail;
          if (!firstName && quote.clientFirstName) firstName = quote.clientFirstName;

          const patch = {};
          if (leadId && request.leadId !== leadId) patch.leadId = leadId;
          if (email && request.email !== email) patch.email = email;
          if (firstName && request.firstName !== firstName) patch.firstName = firstName;
          if (Object.keys(patch).length > 0) {
            await base44.asServiceRole.entities.QuoteRequests.update(request.id, patch);
            console.log('RQT_V1_REPAIRED_FROM_QUOTE', { requestId, token: token.slice(0, 8), repaired: Object.keys(patch) });
          }
        }
      } catch (repairErr) {
        console.warn('RESOLVE_TOKEN_V1_REPAIR_FAILED', { requestId, error: repairErr.message });
      }
    }

    let lead = null;
    if (leadId) {
      try {
        const leads = await base44.asServiceRole.entities.Lead.filter({ id: leadId }, null, 1);
        lead = leads?.[0] || null;
      } catch (leadErr) {
        console.warn('RESOLVE_TOKEN_V1_LEAD_QUERY_FAILED', { requestId, error: leadErr.message, leadId });
      }
    }

    if (!lead || lead.isDeleted === true) {
      console.warn('RQT_V1_LEAD_DELETED_OR_MISSING', { requestId, token: token.slice(0, 8), leadId: leadId || null });
      return json200({
        success: false,
        code: 'INCOMPLETE_DATA',
        error: 'Token does not have complete lead information',
        ...meta
      });
    }

    if (!email || email === 'guest@breezpoolcare.com') email = lead.email || null;
    if (!firstName) firstName = lead.firstName || null;
    if (!phone) phone = lead.mobilePhone || lead.phone || null;

    if (!leadId || !email) {
      return json200({
        success: false,
        code: 'INCOMPLETE_DATA',
        error: 'Token does not have complete lead information',
        ...meta
      });
    }

    return json200({ success: true, leadId, email, firstName, phone, snapshotId, ...meta });
  } catch (error) {
    console.error('RESOLVE_TOKEN_V1_CRASH', { requestId, error: error?.message });
    return json200({ success: false, code: 'SERVER_ERROR', error: 'Failed to resolve token', ...meta });
  }
});
