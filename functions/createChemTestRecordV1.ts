import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    // Require authenticated user
    if (!user) {
      return Response.json({ ok: false, error: 'Unauthenticated' }, { status: 401 });
    }

    // Require provider role
    if (!['admin', 'staff', 'technician'].includes(user.role)) {
      return Response.json({ ok: false, error: 'Role not allowed' }, { status: 403 });
    }

    // Parse payload
    const { poolId, leadId, testDate, technicianId, notes, ...readings } = await req.json();

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

    // Create using service role
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

    return Response.json({ ok: true, testRecord });
  } catch (error) {
    console.error('[createChemTestRecordV1]', error);
    return Response.json(
      { ok: false, error: error.message || 'Failed to create test record' },
      { status: 500 }
    );
  }
});