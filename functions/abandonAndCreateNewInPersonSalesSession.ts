import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * abandonAndCreateNewInPersonSalesSession
 * Staff/admin endpoint: optionally abandons an old session, then creates a new one.
 * 
 * Requirements:
 * - Auth: admin/staff only
 * - If sessionId provided, abandon it (best-effort)
 * - Create a new session with explicit values
 * - Return new sessionId
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

    const { sessionId: oldSessionId } = await req.json();

    // ── Best-effort abandon of old session ──
    if (oldSessionId) {
      try {
        const oldSession = await base44.entities.InPersonSalesSession.get(oldSessionId);
        if (oldSession && oldSession.status !== 'abandoned') {
          await base44.entities.InPersonSalesSession.update(oldSessionId, {
            status: 'abandoned',
            abandonedAt: new Date().toISOString()
          });
          console.log('ABANDONED_OLD_SESSION', { sessionId: oldSessionId });
        }
      } catch (e) {
        console.warn('Failed to abandon old session (best-effort):', e?.message);
        // Continue to create new session regardless
      }
    }

    // ── Create new session with explicit values ──
    const newSessionData = {
      staffEmail: user.email,
      status: 'draft',
      currentStep: 1
    };

    let newSession;
    try {
      newSession = await base44.entities.InPersonSalesSession.create(newSessionData);
    } catch (e) {
      console.error('InPersonSalesSession creation failed:', e);
      return Response.json(
        { success: false, error: 'Failed to create new session', detail: e.message },
        { status: 500 }
      );
    }

    console.log('ABANDON_AND_CREATE_NEW_IN_PERSON_SALES_SESSION_SUCCESS', {
      oldSessionId: oldSessionId || null,
      newSessionId: newSession.id,
      staffEmail: user.email
    });

    return Response.json({
      success: true,
      sessionId: newSession.id
    });
  } catch (error) {
    console.error('ABANDON_AND_CREATE_NEW_IN_PERSON_SALES_SESSION_ERROR', {
      error: error?.message,
      stack: error?.stack?.slice(0, 300)
    });
    return Response.json(
      { success: false, error: 'Operation failed', detail: error?.message },
      { status: 500 }
    );
  }
});