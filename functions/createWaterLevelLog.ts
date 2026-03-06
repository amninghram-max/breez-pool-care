import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    console.log('[createWaterLevelLog] START');
    const base44 = createClientFromRequest(req);
    console.log('[createWaterLevelLog] CLIENT_READY');
    console.log('[createWaterLevelLog] AUTH_START');
    const user = await base44.auth.me();
    console.log('[createWaterLevelLog] AUTH_DONE', { userEmail: user?.email, userRole: user?.role });

    // Require authenticated user
    if (!user) {
      return Response.json({ ok: false, error: 'Unauthenticated' }, { status: 401 });
    }

    // Require provider role
    if (!['admin', 'staff', 'technician'].includes(user.role)) {
      return Response.json({
        ok: false,
        error: 'Role not allowed',
        debug: {
          userEmail: user?.email || null,
          userRole: user?.role || null,
          allowedRoles: ['admin', 'staff', 'technician']
        }
      }, { status: 403 });
    }

    // Parse payload
    console.log('[createWaterLevelLog] JSON_START');
    const { poolId, leadId, visitDate, technicianId, technicianName, waterLevel, waterAdded, shutoffPlan, shutoffTime, safetyFlag, notes } = await req.json();
    console.log('[createWaterLevelLog] JSON_DONE', { poolId, leadId, visitDate, technicianId, waterLevel });

    // Validate required fields
    if (!poolId || !leadId || !visitDate || !technicianId || !waterLevel) {
      return Response.json(
        { ok: false, error: 'Missing required fields: poolId, leadId, visitDate, technicianId, waterLevel' },
        { status: 400 }
      );
    }

    console.log('[createWaterLevelLog] VALIDATION_DONE');

    // Create using service role
    console.log('[createWaterLevelLog] CREATE_START');
    const log = await base44.asServiceRole.entities.WaterLevelLog.create({
      poolId,
      leadId,
      visitDate,
      technicianId,
      technicianName,
      waterLevel,
      ...(waterAdded != null && { waterAdded }),
      ...(shutoffPlan && { shutoffPlan }),
      ...(shutoffTime && { shutoffTime }),
      ...(safetyFlag && { safetyFlag }),
      ...(notes && { notes })
    });

    console.log('[createWaterLevelLog] CREATE_DONE', { logId: log.id });
    console.log('[createWaterLevelLog] RETURN_SUCCESS');
    return Response.json({ ok: true, log });
  } catch (error) {
    console.error('[createWaterLevelLog]', error);
    return Response.json(
      { ok: false, error: error.message || 'Failed to create water level log' },
      { status: 500 }
    );
  }
});