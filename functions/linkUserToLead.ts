import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

const PROTECTED_ROLES = ['admin', 'staff', 'technician'];

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Require authenticated user — derive identity from auth context only
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ ok: false, error: 'unauthenticated' }, { status: 401 });
    }

    // Require admin role for this admin-side linking operation
    if (user.role !== 'admin') {
      return Response.json({ ok: false, error: 'admin_required' }, { status: 403 });
    }

    const { userId, leadId } = await req.json();

    if (!userId || !leadId) {
      return Response.json({ ok: false, error: 'invalid_request' }, { status: 400 });
    }

    // Validate Lead exists server-side via service role (no RLS exposure)
    let lead = null;
    try {
      lead = await base44.asServiceRole.entities.Lead.get(leadId);
    } catch {
      lead = null;
    }

    if (!lead) {
      return Response.json({ ok: false, error: 'invalid_or_expired' });
    }

    // Update target user's linkedLeadId — only admin can invoke this
    await base44.asServiceRole.entities.User.update(userId, { linkedLeadId: leadId });

    return Response.json({ ok: true, userId, leadId });
  } catch (error) {
    console.error('linkUserToLead error:', error);
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
});