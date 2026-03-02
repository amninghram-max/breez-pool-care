import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * updateInPersonSalesSession
 * Staff/admin endpoint: updates draft data and step within an in-person sales session.
 * 
 * Requirements:
 * - Auth: admin/staff only
 * - Non-admin users can only update their own sessions (staffEmail match)
 * - If status === "quote_locked", forbid pricingInputs changes
 * - Persist drafts as JSON strings
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

    const { sessionId, currentStep, pricingInputs, inspectionDraft, contactDraft } = await req.json();
    
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

    // ── Authorization: non-admin must own the session ──
    if (user.role !== 'admin' && session.staffEmail !== user.email) {
      return Response.json(
        { success: false, error: 'Forbidden: cannot update another staff member\'s session' },
        { status: 403 }
      );
    }

    // ── Enforce quote-lock constraint ──
    if (session.status === 'quote_locked' && pricingInputs) {
      return Response.json(
        { success: false, error: 'Cannot modify pricingInputs after quote is locked' },
        { status: 400 }
      );
    }

    // ── Build update payload ──
    const updateData = {};
    
    if (currentStep !== undefined) {
      updateData.currentStep = currentStep;
    }
    
    if (pricingInputs !== undefined) {
      updateData.pricingInputs = typeof pricingInputs === 'string'
        ? pricingInputs
        : JSON.stringify(pricingInputs);
    }
    
    if (inspectionDraft !== undefined) {
      updateData.inspectionDraft = typeof inspectionDraft === 'string'
        ? inspectionDraft
        : JSON.stringify(inspectionDraft);
    }
    
    if (contactDraft !== undefined) {
      updateData.contactDraft = typeof contactDraft === 'string'
        ? contactDraft
        : JSON.stringify(contactDraft);
    }

    // ── Update session ──
    try {
      await base44.entities.InPersonSalesSession.update(sessionId, updateData);
    } catch (e) {
      console.error('InPersonSalesSession update failed:', e);
      return Response.json(
        { success: false, error: 'Failed to update session', detail: e.message },
        { status: 500 }
      );
    }

    console.log('UPDATE_IN_PERSON_SALES_SESSION_SUCCESS', {
      sessionId,
      staffEmail: user.email,
      fieldsUpdated: Object.keys(updateData)
    });

    return Response.json({ success: true });
  } catch (error) {
    console.error('UPDATE_IN_PERSON_SALES_SESSION_ERROR', {
      error: error?.message,
      stack: error?.stack?.slice(0, 300)
    });
    return Response.json(
      { success: false, error: 'Update failed', detail: error?.message },
      { status: 500 }
    );
  }
});