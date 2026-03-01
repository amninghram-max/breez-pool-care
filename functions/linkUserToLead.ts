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

    const { leadId } = await req.json();

    if (!leadId) {
      return Response.json({ ok: false, error: 'invalid_or_expired' }, { status: 400 });
    }

    // Validate Lead existence server-side via service role (no RLS exposure)
    let lead = null;
    try {
      lead = await base44.asServiceRole.entities.Lead.get(leadId);
    } catch {
      lead = null;
    }

    if (!lead) {
      return Response.json({ ok: false, error: 'invalid_or_expired' });
    }

    // Block privileged roles — defense-in-depth, never link or change role
    if (PROTECTED_ROLES.includes(user.role)) {
      return Response.json({ ok: false, error: 'role_not_allowed' }, { status: 403 });
    }

    // Only update linkedLeadId — never touch role (platform restriction)
    await base44.asServiceRole.entities.User.update(user.id, { linkedLeadId: leadId });

    return Response.json({ ok: true });
  } catch (error) {
    console.error('linkUserToLead error:', error);
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
});