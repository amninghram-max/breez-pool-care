import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * abandonInPersonSalesSession
 * Staff/admin endpoint: marks a sales session as abandoned.
 * 
 * Requirements:
 * - Auth: admin/staff only
 * - Load session and set status="abandoned" with abandonedAt timestamp
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

    // ── Load session (to verify it exists) ──
    let session;
    try {
      session = await base44.entities.InPersonSalesSession.get(sessionId);
    } catch (e) {
      return Response.json(
        { success: false, error: 'Session not found' },
        { status: 404 }
      );
    }

    // ── Update session status to abandoned ──
    try {
      await base44.entities.InPersonSalesSession.update(sessionId, {
        status: 'abandoned',
        abandonedAt: new Date().toISOString()
      });
    } catch (e) {
      console.error('InPersonSalesSession abandon update failed:', e);
      return Response.json(
        { success: false, error: 'Failed to abandon session', detail: e.message },
        { status: 500 }
      );
    }

    console.log('ABANDON_IN_PERSON_SALES_SESSION_SUCCESS', {
      sessionId,
      staffEmail: user.email,
      timestamp: new Date().toISOString()
    });

    return Response.json({ success: true });
  } catch (error) {
    console.error('ABANDON_IN_PERSON_SALES_SESSION_ERROR', {
      error: error?.message,
      stack: error?.stack?.slice(0, 300)
    });
    return Response.json(
      { success: false, error: 'Abandon failed', detail: error?.message },
      { status: 500 }
    );
  }
});