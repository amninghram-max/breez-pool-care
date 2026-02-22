import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { visitData } = await req.json();

    // Get chemistry targets
    const targetsResult = await base44.asServiceRole.entities.ChemistryTargets.filter({
      settingKey: 'default'
    });
    const targets = targetsResult[0] || {};

    // Determine which readings are out of range
    const outOfRange = [];

    if (targets.freeChlorine) {
      const fc = parseFloat(visitData.freeChlorine);
      if (fc < targets.freeChlorine.min || fc > targets.freeChlorine.max) {
        outOfRange.push('freeChlorine');
      }
    }

    if (targets.pH) {
      const ph = parseFloat(visitData.pH);
      if (ph < targets.pH.min || ph > targets.pH.max) {
        outOfRange.push('pH');
      }
    }

    if (targets.totalAlkalinity) {
      const ta = parseFloat(visitData.totalAlkalinity);
      if (ta < targets.totalAlkalinity.min || ta > targets.totalAlkalinity.max) {
        outOfRange.push('totalAlkalinity');
      }
    }

    // Create service visit record
    const visit = await base44.asServiceRole.entities.ServiceVisit.create({
      ...visitData,
      outOfRange,
      freeChlorine: parseFloat(visitData.freeChlorine),
      pH: parseFloat(visitData.pH),
      totalAlkalinity: parseFloat(visitData.totalAlkalinity),
      cyanuricAcid: visitData.cyanuricAcid ? parseFloat(visitData.cyanuricAcid) : undefined,
      calciumHardness: visitData.calciumHardness ? parseFloat(visitData.calciumHardness) : undefined,
      salt: visitData.salt ? parseFloat(visitData.salt) : undefined,
      waterTemp: visitData.waterTemp ? parseFloat(visitData.waterTemp) : undefined,
      phosphates: visitData.phosphates ? parseFloat(visitData.phosphates) : undefined
    });

    return Response.json({
      success: true,
      visitId: visit.id,
      outOfRange
    });
  } catch (error) {
    console.error('Process service visit error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});