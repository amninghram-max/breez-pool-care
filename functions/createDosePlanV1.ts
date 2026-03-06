import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    console.log('[createDosePlanV1] START');
    const base44 = createClientFromRequest(req);
    console.log('[createDosePlanV1] CLIENT_READY');
    console.log('[createDosePlanV1] AUTH_START');
    const user = await base44.auth.me();
    console.log('[createDosePlanV1] AUTH_DONE', { userEmail: user?.email, userRole: user?.role });

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
    console.log('[createDosePlanV1] PAYLOAD_PARSE_START');
    const payload = await req.json();
    console.log('[createDosePlanV1] PAYLOAD_PARSE_DONE', {
      poolId: payload.poolId,
      leadId: payload.leadId,
      testRecordId: payload.testRecordId,
      actionsCount: payload.actions?.length || 0
    });

    // Validate minimum required fields
    const required = ['poolId', 'leadId', 'testRecordId', 'technicianId', 'createdDate', 'calculatorVersion', 'adminSettingsId', 'planHash', 'readiness'];
    const missing = required.filter(f => !payload[f]);
    if (missing.length > 0) {
      return Response.json(
        { ok: false, error: `Missing required fields: ${missing.join(', ')}` },
        { status: 400 }
      );
    }

    console.log('[createDosePlanV1] VALIDATION_DONE');

    // Create using service role
    console.log('[createDosePlanV1] CREATE_START');
    const dosePlan = await base44.asServiceRole.entities.DosePlan.create(payload);
    console.log('[createDosePlanV1] CREATE_DONE', { dosePlanId: dosePlan.id });

    console.log('[createDosePlanV1] RETURN_SUCCESS');
    return Response.json({ ok: true, dosePlan });
  } catch (error) {
    console.error('[createDosePlanV1]', error);
    return Response.json(
      { ok: false, error: error.message || 'Failed to create dose plan' },
      { status: 500 }
    );
  }
});