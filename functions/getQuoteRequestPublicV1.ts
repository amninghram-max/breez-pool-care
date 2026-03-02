import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

const BUILD = "GQRP-V1-2026-03-02";

// All responses: HTTP 200, application/json; charset=utf-8
const json200 = (data) => new Response(
  JSON.stringify(data),
  { status: 200, headers: { "content-type": "application/json; charset=utf-8" } }
);

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

    const { token } = payload || {};

    if (!token || typeof token !== 'string' || !token.trim()) {
      return json200({
        success: false,
        error: 'Token is required',
        build: BUILD
      });
    }

    // Lookup QuoteRequests by token using service role
    let requests = [];
    try {
      requests = await base44.asServiceRole.entities.QuoteRequests.filter({ token: token.trim() });
    } catch (filterErr) {
      console.error('GQRP_FILTER_FAILED', { token: token.trim(), error: String(filterErr?.message ?? filterErr) });
      return json200({
        success: false,
        error: 'Failed to retrieve quote request',
        detail: String(filterErr?.message ?? filterErr),
        build: BUILD
      });
    }

    if (!requests || requests.length === 0) {
      return json200({
        success: false,
        error: 'Invalid or expired link',
        build: BUILD
      });
    }

    const request = requests[0];

    // Optionally stamp openedAt if not already set
    if (!request.openedAt) {
      try {
        await base44.asServiceRole.entities.QuoteRequests.update(request.id, {
          openedAt: new Date().toISOString()
        });
        console.log('GQRP_OPENED_STAMPED', { token: token.trim(), requestId: request.id });
      } catch (updateErr) {
        // Log but don't fail if we can't stamp openedAt
        console.warn('GQRP_OPENEDATTR_STAMP_FAILED', { token: token.trim(), error: String(updateErr?.message ?? updateErr) });
      }
    }

    console.log('GQRP_SUCCESS', { token: token.trim(), leadId: request.leadId, email: request.email, firstName: request.firstName });

    return json200({
      success: true,
      request: {
        leadId: request.leadId,
        email: request.email,
        firstName: request.firstName || null,
        status: request.status
      },
      build: BUILD
    });

  } catch (error) {
    console.error('GQRP_CRASH', error);
    const detail = String(error?.message ?? error);
    const stack = error?.stack ? String(error.stack).slice(0, 500) : undefined;
    return json200({
      success: false,
      error: 'getQuoteRequestPublicV1 crashed',
      detail,
      stack,
      build: BUILD
    });
  }
});