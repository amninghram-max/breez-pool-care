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
        // Scoped fetch: collect only needed serviceVisitKeys and "other" names
        const knownBuckets = [
          'liquidChlorine',
          'acid',
          'bakingSoda',
          'stabilizer',
          'salt',
          'chlorineTablets'
        ];
        const neededServiceVisitKeys = new Set();
        const otherNames = new Set();

        for (const key of knownBuckets) {
          const amount = visitData.chemicalsAdded[key];
          if (amount && parseFloat(amount) > 0) {
            neededServiceVisitKeys.add(key);
          }
        }

        if (
          visitData.chemicalsAdded.other &&
          Array.isArray(visitData.chemicalsAdded.other)
        ) {
          for (const entry of visitData.chemicalsAdded.other) {
            if (entry.name && entry.amount && parseFloat(entry.amount) > 0) {
              otherNames.add(entry.name.trim().toLowerCase());
            }
          }
        }

        // Fetch only needed serviceVisitKey items
        const allChemicals = [];
        for (const key of neededServiceVisitKeys) {
          const results = await base44.asServiceRole.entities.ChemicalCatalogItem.filter(
            { serviceVisitKey: key, isActive: true },
            '-updated_date',
            10
          );
          allChemicals.push(...results);
        }

        // Fetch "other" items by name (if any)
        if (otherNames.size > 0) {
          const otherResults = await base44.asServiceRole.entities.ChemicalCatalogItem.filter(
            { isActive: true },
            '-updated_date',
            50
          );
          allChemicals.push(
            ...otherResults.filter(c => otherNames.has(c.name.trim().toLowerCase()))
          );
        }

        // Build lookup maps (name map uses lowercased key)
        const byServiceVisitKey = new Map(
          allChemicals.map(c => [c.serviceVisitKey, c])
        );
        const byName = new Map(
          allChemicals.map(c => [c.name.trim().toLowerCase(), c])
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

    // Compute costing summary for response
    const skippedLines = chemicalCostLines.filter(l => l.status === 'skipped');
    const costedLines = chemicalCostLines.filter(l => l.status === 'costed');
    const skippedCount = skippedLines.length;
    const costedCount = costedLines.length;
    const skippedReasons = Array.from(
      new Set(skippedLines.map(l => l.reason).filter(Boolean))
    );
    const costingSummary = {
      skippedCount,
      costedCount,
      skippedReasons
    };

    // Create service visit record with costing data
    const visit = await base44.asServiceRole.entities.ServiceVisit.create({
      ...visitData,
      // Explicit audit chain links — all optional; undefined values are omitted by the SDK
      testRecordId: visitData.testRecordId || undefined,
      dosePlanId: visitData.dosePlanId || undefined,
      retestRecordId: visitData.retestRecordId || undefined,
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
      chemicalCostCents,
      costingSummary
    });
  } catch (error) {
    console.error('Process service visit error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});