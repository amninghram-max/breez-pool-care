import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * resolveQuoteTokenPublicV1
 * Resolves a quote token to lead details (leadId, email, firstName, phone).
 * Public endpoint; no authentication required.
 *
 * Resolution order:
 * 1. Query QuoteRequests by token
 * 2. If QuoteRequests.leadId is missing, attempt repair from Quote entity
 *    (Quote.leadId where Quote.quoteToken = token)
 * 3. If still unresolvable, return INCOMPLETE_DATA
 *
 * Input:  { token }
 * Output: { success:true, leadId, email, firstName?, phone?, snapshotId? }
 *      OR { success:false, code, error }
 */

const BUILD = "RESOLVE_TOKEN_V1-2026-03-03-A";

const json200 = (data) => new Response(
  JSON.stringify(data),
  { status: 200, headers: { "content-type": "application/json; charset=utf-8" } }
);

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const payload = await req.json();
    const { token } = payload || {};

    console.log('RESOLVE_TOKEN_V1_ENTRY', { token: token ? token.slice(0, 8) : null });

    if (!token || typeof token !== 'string' || !token.trim()) {
      console.log('RESOLVE_TOKEN_V1_INVALID', { reason: 'missing or empty token' });
      return json200({ success: false, code: 'INVALID_TOKEN', error: 'Token is required', build: BUILD });
    }

    const cleanToken = token.trim();

    // ── Step 1: Query QuoteRequests ──
    let request = null;
    try {
      const requests = await base44.asServiceRole.entities.QuoteRequests.filter({ token: cleanToken }, null, 1);
      if (requests && requests.length > 0) request = requests[0];
    } catch (e) {
      console.error('RESOLVE_TOKEN_V1_QUERY_FAILED', { error: e.message });
      return json200({ success: false, code: 'QUERY_ERROR', error: 'Failed to resolve token', build: BUILD });
    }

    if (!request) {
      console.log('RESOLVE_TOKEN_V1_NOT_FOUND', { token: cleanToken.slice(0, 8) });
      return json200({ success: false, code: 'TOKEN_NOT_FOUND', error: 'Invalid or expired token', build: BUILD });
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
      console.log('RESOLVE_TOKEN_V1_REPAIR_ATTEMPT', { token: cleanToken.slice(0, 8), reason: 'leadId null in QuoteRequests' });
      try {
        const quotes = await base44.asServiceRole.entities.Quote.filter({ quoteToken: cleanToken }, '-created_date', 1);
        if (quotes && quotes.length > 0) {
          const q = quotes[0];
          if (q.leadId) {
            leadId = q.leadId;
            if (!email) email = q.clientEmail || null;
            if (!firstName) firstName = q.clientFirstName || null;
            console.log('RESOLVE_TOKEN_V1_REPAIRED_FROM_QUOTE', { leadId, token: cleanToken.slice(0, 8) });

            // Write repair back to QuoteRequests so future calls are fast
            try {
              const repairFields = { leadId };
              if (!request.email || request.email === 'guest@breezpoolcare.com') repairFields.email = email;
              if (!request.firstName) repairFields.firstName = firstName;
              await base44.asServiceRole.entities.QuoteRequests.update(request.id, repairFields);
              console.log('RESOLVE_TOKEN_V1_REPAIR_WRITTEN', { requestId: request.id });
            } catch (repairWriteErr) {
              console.warn('RESOLVE_TOKEN_V1_REPAIR_WRITE_FAILED', { error: repairWriteErr.message });
            }
          }
        }
      } catch (repairErr) {
        console.warn('RESOLVE_TOKEN_V1_REPAIR_FAILED', { error: repairErr.message });
      }
    }

    // ── Step 2b: Validate Lead is not deleted (EXPLICIT UNAVAILABLE CHECK) ──
    if (leadId) {
      try {
        const leadRows = await base44.asServiceRole.entities.Lead.filter({ id: leadId }, null, 1);
        const lead = leadRows?.[0];
        if (lead && lead.isDeleted === true) {
          // Lead exists but is soft-deleted — explicit LEAD_UNAVAILABLE
          console.log('RESOLVE_TOKEN_V1_LEAD_UNAVAILABLE', {
            token: cleanToken.slice(0, 8),
            leadId: leadId.slice(0, 8),
            reason: 'lead_soft_deleted'
          });
          return json200({
            success: false,
            code: 'LEAD_UNAVAILABLE',
            error: 'This quote is no longer active. Please contact Breez at (321) 524-3838 for assistance.',
            build: BUILD
          });
        }
        if (!lead) {
          console.log('RESOLVE_TOKEN_V1_LEAD_NOT_FOUND', {
            token: cleanToken.slice(0, 8),
            leadId: leadId.slice(0, 8)
          });
          leadId = null; // Force INCOMPLETE_DATA (true missing-link case)
        }
      } catch (e) {
        console.warn('RESOLVE_TOKEN_V1_LEAD_CHECK_FAILED', { error: e.message });
        return json200({ success: false, code: 'LEAD_LOOKUP_FAILED', error: 'Platform temporarily unavailable', build: BUILD });
      }
    }

    // ── Step 3: Strict validation — both leadId and email must be present ──
    if (!leadId || !email) {
      console.log('RESOLVE_TOKEN_V1_INCOMPLETE', { leadId, hasEmail: !!email, token: cleanToken.slice(0, 8) });
      return json200({
        success: false,
        code: 'INCOMPLETE_DATA',
        error: 'Token does not have complete lead information',
        build: BUILD
      });
    }

    console.log('RESOLVE_TOKEN_V1_SUCCESS', {
      token: cleanToken.slice(0, 8),
      leadId,
      email: email.slice(0, 5),
      hasFirstName: !!firstName,
      hasPhone: !!phone
    });

    return json200({ success: true, leadId, email, firstName, phone, snapshotId, build: BUILD });

  } catch (error) {
    console.error('RESOLVE_TOKEN_V1_CRASH', { error: error?.message });
    return json200({ success: false, code: 'SERVER_ERROR', error: 'Failed to resolve token', build: BUILD });
  }
});