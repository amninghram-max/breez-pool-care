import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

/**
 * resolveQuoteTokenPublicV1
 * Resolves a quote token to lead details (leadId, email, firstName, phone).
 * Public endpoint; no authentication required.
 *
 * Resolution order:
 * 1. Query QuoteRequests by token
 * 2. If QuoteRequests.leadId is missing, attempt repair from Quote entity
 * 3. If still unresolvable, return INCOMPLETE_DATA
 *
 * Input:  { token }
 * Output: { success:true, leadId, email, firstName?, phone?, snapshotId?, build, runtimeVersion, requestId }
 *      OR { success:false, code, error, build, runtimeVersion, requestId }
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
    console.log('RQT_V1_ENTRY_VERSION', { runtimeVersion, tokenPrefix: token ? token.slice(0, 8) : null, requestId });

    if (!token || typeof token !== 'string' || !token.trim()) {
      console.log('RQT_V1_INVALID', { reason: 'missing or empty token', requestId });
      return json200({ success: false, code: 'INVALID_TOKEN', error: 'Token is required', ...meta });
    }

    const cleanToken = token.trim();

    // ── Step 1: Query QuoteRequests ──
    let request = null;
    try {
      const requests = await base44.asServiceRole.entities.QuoteRequests.filter({ token: cleanToken }, null, 1);
      if (requests && requests.length > 0) request = requests[0];
    } catch (e) {
      console.error('RQT_V1_QUERY_FAILED', { error: e.message, requestId });
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
      console.log('RQT_V1_NOT_FOUND', { tokenPrefix: cleanToken.slice(0, 8), requestId });
      return json200({ success: false, code: 'TOKEN_NOT_FOUND', error: 'Invalid or expired token', ...meta });
    }

    let leadId = request.leadId || null;
    let email = request.email || null;
    let firstName = request.firstName || null;
    const phone = request.phone || null;
    const snapshotId = request.snapshotId || request.id || null;

    // Strip placeholder email
    if (email === 'guest@breezpoolcare.com') email = null;

    // ── Step 2: Repair path — if QuoteRequests.leadId is missing, check Quote entity ──
    if (!leadId) {
      console.log('RQT_V1_REPAIR_ATTEMPT', { tokenPrefix: cleanToken.slice(0, 8), reason: 'leadId null in QuoteRequests', requestId });
      try {
        const quotes = await base44.asServiceRole.entities.Quote.filter({ quoteToken: cleanToken }, '-created_date', 1);
        if (quotes && quotes.length > 0) {
          const q = quotes[0];
          if (q.leadId) {
            leadId = q.leadId;
            if (!email) email = q.clientEmail || null;
            if (!firstName) firstName = q.clientFirstName || null;
            console.log('RQT_V1_REPAIRED_FROM_QUOTE', { leadId, tokenPrefix: cleanToken.slice(0, 8), requestId });

            // Write repair back to QuoteRequests so future calls are fast
            try {
              const repairFields = { leadId };
              if (!request.email || request.email === 'guest@breezpoolcare.com') repairFields.email = email;
              if (!request.firstName) repairFields.firstName = firstName;
              await base44.asServiceRole.entities.QuoteRequests.update(request.id, repairFields);
              console.log('RQT_V1_REPAIR_WRITTEN', { requestId: request.id });
            } catch (repairWriteErr) {
              console.warn('RQT_V1_REPAIR_WRITE_FAILED', { error: repairWriteErr.message, requestId });
            }
          }
        }
      } catch (repairErr) {
        console.warn('RQT_V1_REPAIR_FAILED', { error: repairErr.message, requestId });
      }
    }

    // ── Step 2b: Validate Lead is not deleted (EXPLICIT UNAVAILABLE CHECK) ──
    if (leadId) {
      try {
        const leadRows = await base44.asServiceRole.entities.Lead.filter({ id: leadId }, null, 1);
        const lead = leadRows?.[0];
        if (lead && lead.isDeleted === true) {
          console.log('RQT_V1_LEAD_UNAVAILABLE', { tokenPrefix: cleanToken.slice(0, 8), reason: 'lead_soft_deleted', requestId });
          // Map deleted lead to INCOMPLETE_DATA — do not silently rebound by email
          leadId = null;
        }
        if (!lead) {
          console.log('RQT_V1_LEAD_NOT_FOUND', { tokenPrefix: cleanToken.slice(0, 8), requestId });
          leadId = null;
        }
      } catch (e) {
        console.warn('RQT_V1_LEAD_CHECK_FAILED', { error: e.message, requestId });
        return json200({ success: false, code: 'LEAD_LOOKUP_FAILED', error: 'Platform temporarily unavailable', ...meta });
      }
    }

    // ── Step 3: Strict validation — both leadId and email must be present ──
    if (!leadId || !email) {
      console.log('RQT_V1_INCOMPLETE', { hasLeadId: !!leadId, hasEmail: !!email, tokenPrefix: cleanToken.slice(0, 8), requestId });
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
  } catch (error) {
    console.error('RESOLVE_TOKEN_V1_CRASH', { requestId, error: error?.message });
  } catch (error) {
    console.error('RESOLVE_TOKEN_V1_CRASH', { requestId, error: error?.message });
    console.log('RQT_V1_SUCCESS', {
      tokenPrefix: cleanToken.slice(0, 8),
      leadId,
      emailPrefix: email.slice(0, 5),
      hasFirstName: !!firstName,
      hasPhone: !!phone,
      requestId
    });

    return json200({ success: true, leadId, email, firstName, phone, snapshotId, ...meta });

  } catch (error) {
    console.error('RQT_V1_CRASH', { error: error?.message, requestId });
    return json200({ success: false, code: 'SERVER_ERROR', error: 'Failed to resolve token', ...meta });
  }
});
