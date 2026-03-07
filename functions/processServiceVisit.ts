import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// --- Inlined from functions/shared/chemicalCosting.js (local imports unsupported in Base44 Deno) ---
const VOLUME_UNITS = new Set(['fl_oz', 'qt', 'gal']);
const WEIGHT_UNITS = new Set(['oz_wt', 'lb']);

function getUnitDomain(unit) {
  if (!unit) return null;
  if (VOLUME_UNITS.has(unit)) return 'volume';
  if (WEIGHT_UNITS.has(unit)) return 'weight';
  return null;
}

function convertUnits(amount, fromUnit, toUnit) {
  if (!amount || amount === 0) return 0;
  if (fromUnit === toUnit) return amount;
  const fromDomain = getUnitDomain(fromUnit);
  const toDomain = getUnitDomain(toUnit);
  if (!fromDomain || !toDomain) {
    throw new Error(`Unrecognized unit: fromUnit=${fromUnit}, toUnit=${toUnit}`);
  }
  if (fromDomain !== toDomain) {
    throw new Error(`Cannot convert between domains: ${fromUnit} (${fromDomain}) → ${toUnit} (${toDomain}). Domain mismatch.`);
  }
  if (fromDomain === 'volume') {
    const toFlOz = { 'fl_oz': amount, 'qt': amount * 32, 'gal': amount * 128 };
    const result = toFlOz[fromUnit];
    return result / { 'fl_oz': 1, 'qt': 32, 'gal': 128 }[toUnit];
  }
  if (fromDomain === 'weight') {
    const toOzWt = { 'oz_wt': amount, 'lb': amount * 16 };
    const result = toOzWt[fromUnit];
    return result / { 'oz_wt': 1, 'lb': 16 }[toUnit];
  }
  throw new Error(`Conversion failed: ${amount} ${fromUnit} → ${toUnit}`);
}

function computeChemicalCostLines(chemicalsAdded, chemicalCatalogItemsByServiceVisitKey, chemicalCatalogItemsByName) {
  const lines = [];
  let totalCostCents = 0;
  const knownBuckets = ['liquidChlorine', 'acid', 'bakingSoda', 'stabilizer', 'salt', 'chlorineTablets'];

  for (const key of knownBuckets) {
    const amount = chemicalsAdded[key];
    if (!amount || parseFloat(amount) === 0) continue;
    const amountNum = parseFloat(amount);
    const catalogItem = chemicalCatalogItemsByServiceVisitKey.get(key);
    if (!catalogItem) {
      lines.push({ serviceVisitKey: key, catalogItemId: null, catalogName: null, inputAmount: amountNum, inputUnit: null, normalizedAmount: null, costCanonicalUnit: null, unitCostCents: null, lineCostCents: 0, status: 'skipped', reason: 'no_catalog_item' });
      continue;
    }
    let impliedUnit;
    if (key === 'liquidChlorine' || key === 'acid') { impliedUnit = 'gal'; }
    else if (['bakingSoda', 'stabilizer', 'salt'].includes(key)) { impliedUnit = 'lb'; }
    else if (key === 'chlorineTablets') {
      lines.push({ serviceVisitKey: key, catalogItemId: catalogItem.id, catalogName: catalogItem.name, inputAmount: amountNum, inputUnit: 'unknown', normalizedAmount: null, costCanonicalUnit: catalogItem.costCanonicalUnit, unitCostCents: catalogItem.costPerCanonicalUnitCents, lineCostCents: 0, status: 'skipped', reason: 'ambiguous_unit' });
      continue;
    }
    if (!catalogItem.costCanonicalUnit || catalogItem.costPerCanonicalUnitCents === null || catalogItem.costPerCanonicalUnitCents === undefined) {
      lines.push({ serviceVisitKey: key, catalogItemId: catalogItem.id, catalogName: catalogItem.name, inputAmount: amountNum, inputUnit: impliedUnit, normalizedAmount: null, costCanonicalUnit: catalogItem.costCanonicalUnit, unitCostCents: catalogItem.costPerCanonicalUnitCents, lineCostCents: 0, status: 'skipped', reason: 'missing_cost_data' });
      continue;
    }
    const impliedDomain = getUnitDomain(impliedUnit);
    const costDomain = getUnitDomain(catalogItem.costCanonicalUnit);
    if (impliedDomain !== costDomain) {
      lines.push({ serviceVisitKey: key, catalogItemId: catalogItem.id, catalogName: catalogItem.name, inputAmount: amountNum, inputUnit: impliedUnit, normalizedAmount: null, costCanonicalUnit: catalogItem.costCanonicalUnit, unitCostCents: catalogItem.costPerCanonicalUnitCents, lineCostCents: 0, status: 'skipped', reason: 'domain_mismatch' });
      continue;
    }
    let normalizedAmount;
    try { normalizedAmount = convertUnits(amountNum, impliedUnit, catalogItem.costCanonicalUnit); }
    catch (err) {
      lines.push({ serviceVisitKey: key, catalogItemId: catalogItem.id, catalogName: catalogItem.name, inputAmount: amountNum, inputUnit: impliedUnit, normalizedAmount: null, costCanonicalUnit: catalogItem.costCanonicalUnit, unitCostCents: catalogItem.costPerCanonicalUnitCents, lineCostCents: 0, status: 'skipped', reason: 'domain_mismatch' });
      continue;
    }
    const lineCostCents = Math.round(normalizedAmount * catalogItem.costPerCanonicalUnitCents);
    totalCostCents += lineCostCents;
    lines.push({ serviceVisitKey: key, catalogItemId: catalogItem.id, catalogName: catalogItem.name, inputAmount: amountNum, inputUnit: impliedUnit, normalizedAmount, costCanonicalUnit: catalogItem.costCanonicalUnit, unitCostCents: catalogItem.costPerCanonicalUnitCents, lineCostCents, status: 'costable' });
  }

  if (chemicalsAdded.other && Array.isArray(chemicalsAdded.other)) {
    for (const otherEntry of chemicalsAdded.other) {
      const { name, amount, unit } = otherEntry;
      if (!name || !amount || parseFloat(amount) === 0) continue;
      const amountNum = parseFloat(amount);
      let normalizedUnit = unit;
      if (unit === 'oz') { normalizedUnit = 'fl_oz'; }
      const normalizedName = name.trim().toLowerCase();
      const catalogItem = chemicalCatalogItemsByName.get(normalizedName);
      if (!catalogItem) {
        lines.push({ serviceVisitKey: 'other', catalogItemId: null, catalogName: name, inputAmount: amountNum, inputUnit: unit, normalizedAmount: null, costCanonicalUnit: null, unitCostCents: null, lineCostCents: 0, status: 'skipped', reason: 'no_catalog_item' });
        continue;
      }
      if (!catalogItem.costCanonicalUnit || catalogItem.costPerCanonicalUnitCents === null || catalogItem.costPerCanonicalUnitCents === undefined) {
        lines.push({ serviceVisitKey: 'other', catalogItemId: catalogItem.id, catalogName: catalogItem.name, inputAmount: amountNum, inputUnit: normalizedUnit, normalizedAmount: null, costCanonicalUnit: catalogItem.costCanonicalUnit, unitCostCents: catalogItem.costPerCanonicalUnitCents, lineCostCents: 0, status: 'skipped', reason: 'missing_cost_data' });
        continue;
      }
      const inputDomain = getUnitDomain(normalizedUnit);
      const costDomain = getUnitDomain(catalogItem.costCanonicalUnit);
      if (inputDomain !== costDomain) {
        lines.push({ serviceVisitKey: 'other', catalogItemId: catalogItem.id, catalogName: catalogItem.name, inputAmount: amountNum, inputUnit: normalizedUnit, normalizedAmount: null, costCanonicalUnit: catalogItem.costCanonicalUnit, unitCostCents: catalogItem.costPerCanonicalUnitCents, lineCostCents: 0, status: 'skipped', reason: 'domain_mismatch' });
        continue;
      }
      let normalizedAmount;
      try { normalizedAmount = convertUnits(amountNum, normalizedUnit, catalogItem.costCanonicalUnit); }
      catch (err) {
        lines.push({ serviceVisitKey: 'other', catalogItemId: catalogItem.id, catalogName: catalogItem.name, inputAmount: amountNum, inputUnit: normalizedUnit, normalizedAmount: null, costCanonicalUnit: catalogItem.costCanonicalUnit, unitCostCents: catalogItem.costPerCanonicalUnitCents, lineCostCents: 0, status: 'skipped', reason: 'domain_mismatch' });
        continue;
      }
      const lineCostCents = Math.round(normalizedAmount * catalogItem.costPerCanonicalUnitCents);
      totalCostCents += lineCostCents;
      lines.push({ serviceVisitKey: 'other', catalogItemId: catalogItem.id, catalogName: catalogItem.name, inputAmount: amountNum, inputUnit: normalizedUnit, normalizedAmount, costCanonicalUnit: catalogItem.costCanonicalUnit, unitCostCents: catalogItem.costPerCanonicalUnitCents, lineCostCents, status: 'costable' });
    }
  }

  return { totalCostCents, lines };
}
// --- End inlined helpers ---

Deno.serve(async (req) => {
  try {
    console.log('[processServiceVisit] START');
    const base44 = createClientFromRequest(req);
    console.log('[processServiceVisit] CLIENT_READY');
    console.log('[processServiceVisit] AUTH_START');
    const user = await base44.auth.me();
    console.log('[processServiceVisit] AUTH_DONE', { userEmail: user?.email });

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log('[processServiceVisit] JSON_START');
    const { visitData } = await req.json();
    console.log('[processServiceVisit] JSON_DONE', { testRecordId: visitData?.testRecordId });

    // --- Duplicate-submit guard ---
    // testRecordId is created exactly once in StepTest and is required to advance
    // to StepCloseout, making it the strongest single-field visit identity anchor.
    // A matching record means this closeout was already processed; return success.
    if (visitData.testRecordId) {
      console.log('[processServiceVisit] DUPLICATE_CHECK_START');
      const existing = await base44.asServiceRole.entities.ServiceVisit.filter(
        { testRecordId: visitData.testRecordId },
        '-created_date',
        1
      );
      if (existing.length > 0) {
        console.info(
          `[processServiceVisit] Duplicate detected for testRecordId=${visitData.testRecordId} — returning existing visitId=${existing[0].id}`
        );
        return Response.json({
          success: true,
          visitId: existing[0].id,
          alreadyRecorded: true,
        });
      }
      console.log('[processServiceVisit] DUPLICATE_CHECK_DONE');
    }

    // Get chemistry targets
    console.log('[processServiceVisit] CHEMISTRY_TARGETS_START');
    const targetsResult = await base44.asServiceRole.entities.ChemistryTargets.filter({
      settingKey: 'default'
    });
    const targets = targetsResult[0] || {};
    console.log('[processServiceVisit] CHEMISTRY_TARGETS_DONE');

    // Determine which readings are out of range
    console.log('[processServiceVisit] OUT_OF_RANGE_START');
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
    console.log('[processServiceVisit] OUT_OF_RANGE_DONE', { outOfRange });

    // Compute chemical costs (non-fatal errors; visits save even if costing partially fails)
    console.log('[processServiceVisit] CHEMICAL_COSTING_START');
    let chemicalCostCents = 0;
    let chemicalCostLines = [];
    const chemicalCostVersion = 'v1_canonical';

    const safeChemicalsAdded = (visitData.chemicalsAdded && typeof visitData.chemicalsAdded === 'object')
      ? visitData.chemicalsAdded
      : {};
    if (Object.keys(safeChemicalsAdded).length > 0) {
      console.log('[processServiceVisit] CHEMICALS_ADDED_RECEIVED', { keys: Object.keys(safeChemicalsAdded) });
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
        console.log('[processServiceVisit] FETCH_CATALOG_ITEMS_START', { neededKeys: Array.from(neededServiceVisitKeys), otherNamesCount: otherNames.size });
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
        console.log('[processServiceVisit] FETCH_CATALOG_ITEMS_DONE', { itemsCount: allChemicals.length });
        const byServiceVisitKey = new Map(
          allChemicals.map(c => [c.serviceVisitKey, c])
        );
        const byName = new Map(
          allChemicals.map(c => [c.name.trim().toLowerCase(), c])
        );

        // Compute cost lines
        console.log('[processServiceVisit] COMPUTE_COST_LINES_START');
        const { totalCostCents, lines } = computeChemicalCostLines(
          visitData.chemicalsAdded,
          byServiceVisitKey,
          byName
        );

        chemicalCostCents = totalCostCents;
        chemicalCostLines = lines;
        console.log('[processServiceVisit] COMPUTE_COST_LINES_DONE', { totalCostCents, lineCount: lines.length });

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
    console.log('[processServiceVisit] CHEMICAL_COSTING_DONE', { totalCost: chemicalCostCents });

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

    // Log trichlor accounting if present
    if (visitData.chemicalsAdded?.chlorineTablets || visitData.chemicalsAdded?.trichlorPlacement) {
      console.log('[processServiceVisit] TRICHLOR_CLOSEOUT_ACCOUNTING', {
        tabletCount: visitData.chemicalsAdded?.chlorineTablets,
        placement: visitData.chemicalsAdded?.trichlorPlacement
      });
    }

    // Create service visit record with costing data
    console.log('[processServiceVisit] CREATE_SERVICEVISIT_START');
    const visit = await base44.asServiceRole.entities.ServiceVisit.create({
      ...visitData,
      // Explicit audit chain links (all optional, non-breaking for older records)
      // testRecordId: set by StepTest via advance({ testRecordId: testRecord.id })
      // dosePlanId: set by StepDoseConfirm via advance({ dosePlan: plan }) — extracted below
      // retestRecordId: set by StepRetest via advance({ retestRecordId: record.id })
      testRecordId: visitData.testRecordId || undefined,
      dosePlanId: visitData.dosePlan?.id || visitData.dosePlanId || undefined,
      retestRecordId: visitData.retestRecordId || undefined,
      waterLevelLogId: visitData.waterLevelLogId || undefined,
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
    console.log('[processServiceVisit] CREATE_SERVICEVISIT_DONE', { visitId: visit.id });
    console.log('[processServiceVisit] RETURN_SUCCESS');

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