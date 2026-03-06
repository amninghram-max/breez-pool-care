import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Require authenticated user
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ ok: false, error: 'unauthenticated' }, { status: 401 });
    }

    // Require admin or staff role
    if (!['admin', 'staff'].includes(user.role)) {
      return Response.json({ ok: false, error: 'role_not_allowed' }, { status: 403 });
    }

    const { leadId } = await req.json();
    if (!leadId) {
      return Response.json({ ok: false, error: 'invalid_request' }, { status: 400 });
    }

    // Read pool using service role (bypasses customer-level RLS)
    const pools = await base44.asServiceRole.entities.Pool.filter({ leadId });
    let pool = pools.length > 0 ? pools[0] : null;
    let fallbackMatched = false;

    // Fallback: if filter returned no results, fetch all Pools and find locally
    if (!pool) {
      const allPools = await base44.asServiceRole.entities.Pool.list();
      const foundPool = allPools.find(p => String(p.leadId) === String(leadId));
      if (foundPool) {
        pool = foundPool;
        fallbackMatched = true;
      }
    }

    return Response.json({
      ok: true,
      requestedLeadId: leadId,
      filterCount: pools.length,
      fallbackMatched,
      pool
    });
  } catch (error) {
    console.error('getPoolForLeadV1 error:', error);
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
});