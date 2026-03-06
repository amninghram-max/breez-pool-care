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

/**
 * ADMIN-ONLY: Backfill ServiceVisit chemical costing fields.
 * 
 * Processes historical visits missing chemicalCostVersion or chemicalCostLines,
 * using the same costing logic as processServiceVisit.
 * 
 * EXAMPLE PAYLOADS:
 * 
 * 1. First batch (dry run):
 *    { "dryRun": true, "limit": 50 }
 * 
 * 2. Actual backfill, first batch:
 *    { "limit": 50 }
 * 
 * 3. Subsequent batch (with cursor from previous response):
 *    { "limit": 50, "cursorCreatedDate": "2026-02-28T10:30:00Z" }
 * 
 * Repeat step 3 until response.done === true.
 */

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    // Admin-only access
    if (!user || user.role !== 'admin') {
      return Response.json(
        { success: false, error: 'Unauthorized' },
        { status: 403 }
      );
    }

    // Parse inputs
    const body = await req.json().catch(() => ({}));
    let { limit = 50, cursorCreatedDate = null, dryRun = false } = body;

    // Validate limit
    if (limit < 1 || limit > 200) {
      limit = 50;
    }

    // Build filter: needs backfill
    const filter = {
      $or: [
        { chemicalCostVersion: { $exists: false } },
        { chemicalCostVersion: null },
        { chemicalCostVersion: '' },
        { chemicalCostLines: { $exists: false } },
        { chemicalCostLines: null }
      ]
    };

    // Add cursor filter (created_date < cursorCreatedDate for backwards paging)
    if (cursorCreatedDate) {
      filter.created_date = { $lt: cursorCreatedDate };
    }

    // Fetch batch, sorted descending by created_date (oldest first within batch)
    const visits = await base44.asServiceRole.entities.ServiceVisit.filter(
      filter,
      '-created_date',
      limit
    );

    if (visits.length === 0) {
      return Response.json({
        success: true,
        done: true,
        nextCursorCreatedDate: null,
        processedCount: 0,
        updatedCount: 0,
        skippedCount: 0,
        errorCount: 0,
        sampleErrors: []
      });
    }

    let updatedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;
    const sampleErrors = [];

    // Process each visit
    for (const visit of visits) {
      try {
        // Skip if no chemicals added or empty
        if (
          !visit.chemicalsAdded ||
          (typeof visit.chemicalsAdded === 'string' &&
            visit.chemicalsAdded.trim() === '') ||
          Object.keys(visit.chemicalsAdded).length === 0
        ) {
          skippedCount++;
          continue;
        }

        // Scoped fetch: determine which keys/names are present with non-zero amounts
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
          const amount = visit.chemicalsAdded[key];
          if (amount && parseFloat(amount) > 0) {
            neededServiceVisitKeys.add(key);
          }
        }

        if (
          visit.chemicalsAdded.other &&
          Array.isArray(visit.chemicalsAdded.other)
        ) {
          for (const entry of visit.chemicalsAdded.other) {
            if (entry.name && entry.amount && parseFloat(entry.amount) > 0) {
              otherNames.add(entry.name.trim().toLowerCase());
            }
          }
        }

        // Fetch only needed catalog items
        const allChemicals = [];

        for (const key of neededServiceVisitKeys) {
          const results = await base44.asServiceRole.entities.ChemicalCatalogItem.filter(
            { serviceVisitKey: key, isActive: true },
            '-updated_date',
            10
          );
          allChemicals.push(...results);
        }

        if (otherNames.size > 0) {
          const otherResults = await base44.asServiceRole.entities.ChemicalCatalogItem.filter(
            { isActive: true },
            '-updated_date',
            50
          );
          allChemicals.push(
            ...otherResults.filter(c =>
              otherNames.has(c.name.trim().toLowerCase())
            )
          );
        }

        // Build lookup maps
        const byServiceVisitKey = new Map(
          allChemicals.map(c => [c.serviceVisitKey, c])
        );
        const byName = new Map(
          allChemicals.map(c => [c.name.trim().toLowerCase(), c])
        );

        // Compute costs using shared helper
        const { totalCostCents, lines } = computeChemicalCostLines(
          visit.chemicalsAdded,
          byServiceVisitKey,
          byName
        );

        // Update database if not dry run
        if (!dryRun) {
          await base44.asServiceRole.entities.ServiceVisit.update(visit.id, {
            chemicalCostCents: totalCostCents,
            chemicalCostVersion: 'v1_canonical',
            chemicalCostLines: JSON.stringify(lines)
          });
        }

        updatedCount++;
      } catch (err) {
        errorCount++;
        if (sampleErrors.length < 10) {
          sampleErrors.push({
            visitId: visit.id,
            error: err.message || String(err)
          });
        }
      }
    }

    // Determine next cursor (created_date of oldest visit in batch)
    const nextCursorCreatedDate =
      visits.length === limit ? visits[visits.length - 1].created_date : null;

    return Response.json({
      success: true,
      done: visits.length < limit,
      nextCursorCreatedDate,
      processedCount: visits.length,
      updatedCount,
      skippedCount,
      errorCount,
      sampleErrors
    });
  } catch (error) {
    return Response.json(
      { success: false, error: error.message || String(error) },
      { status: 500 }
    );
  }
});