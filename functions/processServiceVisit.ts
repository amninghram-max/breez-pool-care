import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { computeChemicalCostLines } from './_shared/chemicalCosting.js';

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

    // Compute chemical costs (non-fatal errors; visits save even if costing partially fails)
    let chemicalCostCents = 0;
    let chemicalCostLines = [];
    const chemicalCostVersion = 'v1_canonical';

    if (visitData.chemicalsAdded && Object.keys(visitData.chemicalsAdded).length > 0) {
      try {
        // Fetch all active chemical catalog items
        const allChemicals = await base44.asServiceRole.entities.ChemicalCatalogItem.filter(
          { isActive: true },
          '-updated_date',
          200
        );

        // Build lookup maps
        const byServiceVisitKey = new Map(
          allChemicals.map(c => [c.serviceVisitKey, c])
        );
        const byName = new Map(
          allChemicals.map(c => [c.name, c])
        );

        // Compute cost lines
        const { totalCostCents, lines } = computeChemicalCostLines(
          visitData.chemicalsAdded,
          byServiceVisitKey,
          byName
        );

        chemicalCostCents = totalCostCents;
        chemicalCostLines = lines;

        if (lines.length > 0) {
          console.info(
            `[processServiceVisit] Cost computed: ${chemicalCostCents} cents from ${lines.length} line(s)`
          );
        }
      } catch (costingError) {
        // Non-fatal: log but don't crash the visit save
        console.error('[processServiceVisit] Chemical costing error:', costingError.message);
        chemicalCostCents = 0;
        chemicalCostLines = [];
      }
    }

    // Create service visit record with costing data
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
      phosphates: visitData.phosphates ? parseFloat(visitData.phosphates) : undefined,
      chemicalCostCents,
      chemicalCostVersion,
      chemicalCostLines: JSON.stringify(chemicalCostLines)
    });

    return Response.json({
      success: true,
      visitId: visit.id,
      outOfRange,
      chemicalCostCents
    });
  } catch (error) {
    console.error('Process service visit error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});