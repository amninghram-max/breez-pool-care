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

    const { poolId, volumeGallons } = await req.json();

    // Validate poolId
    if (!poolId || typeof poolId !== 'string') {
      return Response.json({ ok: false, error: 'invalid_request: poolId required' }, { status: 400 });
    }

    // Validate volumeGallons
    const gallons = parseFloat(volumeGallons);
    if (!Number.isFinite(gallons) || gallons <= 0) {
      return Response.json({ ok: false, error: 'invalid_request: volumeGallons must be positive number' }, { status: 400 });
    }

    // Update via service role
    const pool = await base44.asServiceRole.entities.Pool.update(poolId, { volumeGallons: gallons });

    return Response.json({ ok: true, pool });
  } catch (error) {
    console.error('updatePoolVolumeV1 error:', error);
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
});