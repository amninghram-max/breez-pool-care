import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * resolveQuoteTokenPublicV1
 * Resolves a quote token to lead details (leadId, email, firstName, phone).
 * Public endpoint; no authentication required.
 * 
 * Input: { token }
 * Output: { success:true, leadId, email, firstName?, phone?, snapshotId? } OR { success:false, code, error }
 */

const BUILD = "RESOLVE_TOKEN_V1_2026-03-02";

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

    // Validate token
    if (!token || typeof token !== 'string' || !token.trim()) {
      console.log('RESOLVE_TOKEN_V1_INVALID', { reason: 'missing or empty token' });
      return json200({
        success: false,
        code: 'INVALID_TOKEN',
        error: 'Token is required',
        build: BUILD
      });
    }

    // Query QuoteRequests for this token
    let request = null;
    try {
      const requests = await base44.asServiceRole.entities.QuoteRequests.filter(
        { token: token.trim() },
        null,
        1
      );
      if (requests && requests.length > 0) {
        request = requests[0];
      }
    } catch (e) {
      console.error('RESOLVE_TOKEN_V1_QUERY_FAILED', { error: e.message });
      return json200({
        success: false,
        code: 'QUERY_ERROR',
        error: 'Failed to resolve token',
        build: BUILD
      });
    }

    if (!request) {
      console.log('RESOLVE_TOKEN_V1_NOT_FOUND', { token: token.slice(0, 8) });
      return json200({
        success: false,
        code: 'TOKEN_NOT_FOUND',
        error: 'Invalid or expired token',
        build: BUILD
      });
    }

    // Token is valid; extract lead details
    const leadId = request.leadId || null;
    const email = request.email || null;
    const firstName = request.firstName || null;
    const phone = request.phone || null;
    const snapshotId = request.snapshotId || request.id || null;

    if (!leadId || !email) {
      console.log('RESOLVE_TOKEN_V1_INCOMPLETE', { leadId, email, token: token.slice(0, 8) });
      return json200({
        success: false,
        code: 'INCOMPLETE_DATA',
        error: 'Token does not have complete lead information',
        build: BUILD
      });
    }

    console.log('RESOLVE_TOKEN_V1_SUCCESS', {
      token: token.slice(0, 8),
      leadId,
      email: email.slice(0, 5),
      hasFirstName: !!firstName,
      hasPhone: !!phone
    });

    return json200({
      success: true,
      leadId,
      email,
      firstName,
      phone,
      snapshotId,
      build: BUILD
    });

  } catch (error) {
    console.error('RESOLVE_TOKEN_V1_CRASH', { error: error?.message });
    return json200({
      success: false,
      code: 'SERVER_ERROR',
      error: 'Failed to resolve token',
      build: BUILD
    });
  }
});