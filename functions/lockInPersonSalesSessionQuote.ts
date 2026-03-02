import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * lockInPersonSalesSessionQuote
 * Staff/admin endpoint: computes and locks a quote snapshot for a sales session.
 * 
 * Requirements:
 * - Auth: admin/staff only
 * - Load session; require pricingInputs exists
 * - Compute quote using calculateQuoteOnly (demo pricing, no persistence)
 * - Save quoteSnapshot including pricingEngineVersion
 * - Set status = "quote_locked"
 */

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // ── Auth check: admin/staff only ──
    const user = await base44.auth.me();
    if (!user || !['admin', 'staff'].includes(user.role)) {
      return Response.json(
        { success: false, error: 'Forbidden: admin or staff role required' },
        { status: 403 }
      );
    }

    const { sessionId } = await req.json();
    
    if (!sessionId) {
      return Response.json(
        { success: false, error: 'sessionId is required' },
        { status: 400 }
      );
    }

    // ── Load session ──
    let session;
    try {
      session = await base44.entities.InPersonSalesSession.get(sessionId);
    } catch (e) {
      return Response.json(
        { success: false, error: 'Session not found' },
        { status: 404 }
      );
    }

    // ── Validate pricingInputs exists ──
    if (!session.pricingInputs) {
      return Response.json(
        { success: false, error: 'pricingInputs not provided; cannot lock quote' },
        { status: 400 }
      );
    }

    // ── Parse pricingInputs ──
    let pricingData;
    try {
      pricingData = typeof session.pricingInputs === 'string'
        ? JSON.parse(session.pricingInputs)
        : session.pricingInputs;
    } catch (e) {
      return Response.json(
        { success: false, error: 'Invalid pricingInputs JSON', detail: e.message },
        { status: 400 }
      );
    }

    // ── Compute quote using calculateQuoteOnly (demo engine, no persistence) ──
    let quoteResult;
    try {
      const response = await base44.functions.invoke('calculateQuoteOnly', {
        questionnaireData: pricingData
      });
      quoteResult = response?.data ?? response;
    } catch (e) {
      console.error('calculateQuoteOnly invocation failed:', e);
      return Response.json(
        { success: false, error: 'Failed to calculate quote', detail: e.message },
        { status: 500 }
      );
    }

    // ── Validate quote result ──
    if (!quoteResult || !quoteResult.pricingEngineVersion) {
      return Response.json(
        { success: false, error: 'Quote calculation did not return valid pricingEngineVersion' },
        { status: 500 }
      );
    }

    // ── Lock session with quote snapshot ──
    const quoteSnapshot = JSON.stringify(quoteResult);
    try {
      await base44.entities.InPersonSalesSession.update(sessionId, {
        quoteSnapshot,
        status: 'quote_locked'
      });
    } catch (e) {
      console.error('InPersonSalesSession lock update failed:', e);
      return Response.json(
        { success: false, error: 'Failed to lock quote snapshot', detail: e.message },
        { status: 500 }
      );
    }

    console.log('LOCK_IN_PERSON_SALES_SESSION_QUOTE_SUCCESS', {
      sessionId,
      staffEmail: user.email,
      pricingEngineVersion: quoteResult.pricingEngineVersion
    });

    return Response.json({
      success: true,
      quoteSnapshot: quoteResult
    });
  } catch (error) {
    console.error('LOCK_IN_PERSON_SALES_SESSION_QUOTE_ERROR', {
      error: error?.message,
      stack: error?.stack?.slice(0, 300)
    });
    return Response.json(
      { success: false, error: 'Quote lock failed', detail: error?.message },
      { status: 500 }
    );
  }
});