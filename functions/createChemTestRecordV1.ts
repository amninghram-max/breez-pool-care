import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    console.log('[createChemTestRecordV1] START');
    const base44 = createClientFromRequest(req);
    console.log('[createChemTestRecordV1] CLIENT_READY');
    console.log('[createChemTestRecordV1] AUTH_START');
    const user = await base44.auth.me();
    console.log('[createChemTestRecordV1] AUTH_DONE', { userEmail: user?.email, userRole: user?.role });

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
    console.log('[createChemTestRecordV1] JSON_START');
    const { poolId, leadId, testDate, technicianId, notes, ...readings } = await req.json();
    console.log('[createChemTestRecordV1] JSON_DONE', { poolId, leadId, testDate, technicianId });

    // Validate required fields
    if (!poolId || !leadId || !testDate || !technicianId) {
      return Response.json(
        { ok: false, error: 'Missing required fields: poolId, leadId, testDate, technicianId' },
        { status: 400 }
      );
    }

    if (readings.freeChlorine == null || readings.pH == null || readings.totalAlkalinity == null) {
      return Response.json(
        { ok: false, error: 'Missing required readings: freeChlorine, pH, totalAlkalinity' },
        { status: 400 }
      );
    }

    console.log('[createChemTestRecordV1] VALIDATION_DONE');

    // Create using service role
    console.log('[createChemTestRecordV1] CREATE_START');
    const testRecord = await base44.asServiceRole.entities.ChemTestRecord.create({
      poolId,
      leadId,
      testDate,
      technicianId,
      freeChlorine: readings.freeChlorine,
      pH: readings.pH,
      totalAlkalinity: readings.totalAlkalinity,
      ...(readings.combinedChlorine != null && { combinedChlorine: readings.combinedChlorine }),
      ...(readings.cyanuricAcid != null && { cyanuricAcid: readings.cyanuricAcid }),
      ...(readings.calciumHardness != null && { calciumHardness: readings.calciumHardness }),
      ...(readings.waterTemp != null && { waterTemp: readings.waterTemp }),
      ...(readings.salt != null && { salt: readings.salt }),
      ...(notes && { notes })
    });

    console.log('[createChemTestRecordV1] CREATE_DONE', { testRecordId: testRecord.id });
    console.log('[createChemTestRecordV1] RETURN_SUCCESS');
    return Response.json({ ok: true, testRecord });
  } catch (error) {
    console.error('[createChemTestRecordV1]', error);
    return Response.json(
      { ok: false, error: error.message || 'Failed to create test record' },
      { status: 500 }
    );
  }
});