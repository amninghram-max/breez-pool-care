import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * createInPersonSalesSession
 * Staff/admin endpoint: creates a new in-person sales session buffer.
 * 
 * Requirements:
 * - Auth: admin/staff only
 * - Explicitly set: staffEmail, status, currentStep, optional pricingInputs
 * - No defaults in schema; all values must be set explicitly by this function
 * - Returns sessionId on success
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

    const payload = await req.json();
    const { pricingInputs } = payload || {};

    // ── Build session data with explicit values ──
    const sessionData = {
      staffEmail: user.email,
      status: 'draft',
      currentStep: 1
    };

    // ── Optionally include pricingInputs if provided ──
    if (pricingInputs) {
      sessionData.pricingInputs = typeof pricingInputs === 'string'
        ? pricingInputs
        : JSON.stringify(pricingInputs);
    }

    // ── Create InPersonSalesSession ──
    let session;
    try {
      session = await base44.entities.InPersonSalesSession.create(sessionData);
    } catch (e) {
      console.error('InPersonSalesSession creation failed:', e);
      return Response.json(
        { success: false, error: 'Failed to create session', detail: e.message },
        { status: 500 }
      );
    }

    console.log('CREATE_IN_PERSON_SALES_SESSION_SUCCESS', {
      sessionId: session.id,
      staffEmail: user.email,
      timestamp: new Date().toISOString()
    });

    return Response.json({
      success: true,
      sessionId: session.id
    });
  } catch (error) {
    console.error('CREATE_IN_PERSON_SALES_SESSION_ERROR', {
      error: error?.message,
      stack: error?.stack?.slice(0, 300)
    });
    return Response.json(
      { success: false, error: 'Session creation failed', detail: error?.message },
      { status: 500 }
    );
  }
});