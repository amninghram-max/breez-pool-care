/**
 * Chemical Costing Utilities
 * 
 * Provides deterministic unit conversion, legacy oz normalization, and
 * per-visit chemical cost computation with line-level tracking.
 */

// Unit domain detection
const VOLUME_UNITS = new Set(['fl_oz', 'qt', 'gal']);
const WEIGHT_UNITS = new Set(['oz_wt', 'lb']);

export function getUnitDomain(unit) {
  if (!unit) return null;
  if (VOLUME_UNITS.has(unit)) return 'volume';
  if (WEIGHT_UNITS.has(unit)) return 'weight';
  return null;
}

/**
 * Deterministic unit conversion within a domain
 * Supports: fl_oz, qt, gal (volume) and oz_wt, lb (weight)
 * Throws if units are in different domains or unrecognized
 */
export function convertUnits(amount, fromUnit, toUnit) {
  if (!amount || amount === 0) return 0;
  if (fromUnit === toUnit) return amount;

  const fromDomain = getUnitDomain(fromUnit);
  const toDomain = getUnitDomain(toUnit);

  if (!fromDomain || !toDomain) {
    throw new Error(`Unrecognized unit: fromUnit=${fromUnit}, toUnit=${toUnit}`);
  }

  if (fromDomain !== toDomain) {
    throw new Error(
      `Cannot convert between domains: ${fromUnit} (${fromDomain}) → ${toUnit} (${toDomain}). Domain mismatch.`
    );
  }

  // Volume conversions (all normalized to fl_oz first)
  if (fromDomain === 'volume') {
    const toFlOz = {
      'fl_oz': amount,
      'qt': amount * 32,
      'gal': amount * 128
    };
    const result = toFlOz[fromUnit];
    return result / { 'fl_oz': 1, 'qt': 32, 'gal': 128 }[toUnit];
  }

  // Weight conversions (all normalized to oz_wt first)
  if (fromDomain === 'weight') {
    const toOzWt = {
      'oz_wt': amount,
      'lb': amount * 16
    };
    const result = toOzWt[fromUnit];
    return result / { 'oz_wt': 1, 'lb': 16 }[toUnit];
  }

  throw new Error(`Conversion failed: ${amount} ${fromUnit} → ${toUnit}`);
}

/**
 * Map legacy "oz" to canonical unit based on chemical type
 * Returns { normalizedUnit, serviceVisitKey } or throws
 */
export function normalizeLegacyOz(serviceVisitKey) {
  // Liquid chemicals → volume
  if (['liquidChlorine', 'acid'].includes(serviceVisitKey)) {
    return 'fl_oz';
  }

  // Powder/salt chemicals → weight
  if (
    ['bakingSoda', 'stabilizer', 'salt', 'chlorineTablets'].includes(
      serviceVisitKey
    )
  ) {
    return 'oz_wt';
  }

  // For "other" or unknown, default to fl_oz (but should be explicit in "other" entries)
  return 'fl_oz';
}

/**
 * Compute chemical cost lines for a service visit
 * 
 * Args:
 *   chemicalsAdded: {liquidChlorine?, chlorineTablets?, acid?, bakingSoda?, stabilizer?, salt?, other?: [{name, amount, unit}]}
 *   chemicalCatalogItemsByServiceVisitKey: Map<serviceVisitKey, ChemicalCatalogItem>
 *   chemicalCatalogItemsByName: Map<name, ChemicalCatalogItem>
 * 
 * Returns:
 *   { totalCostCents: number, lines: [{...}, ...] }
 *   lines[].status: "costable" | "skipped"
 *   lines[].reason?: "no_catalog_item" | "missing_cost_data" | "domain_mismatch" | "ambiguous_unit"
 */
export function computeChemicalCostLines(
  chemicalsAdded,
  chemicalCatalogItemsByServiceVisitKey,
  chemicalCatalogItemsByName
) {
  const lines = [];
  let totalCostCents = 0;

  const knownBuckets = [
    'liquidChlorine',
    'acid',
    'bakingSoda',
    'stabilizer',
    'salt',
    'chlorineTablets'
  ];

  // Process known bucket keys
  for (const key of knownBuckets) {
    const amount = chemicalsAdded[key];
    if (!amount || parseFloat(amount) === 0) continue;

    const amountNum = parseFloat(amount);
    const catalogItem = chemicalCatalogItemsByServiceVisitKey.get(key);

    if (!catalogItem) {
      lines.push({
        serviceVisitKey: key,
        catalogItemId: null,
        catalogName: null,
        inputAmount: amountNum,
        inputUnit: null,
        normalizedAmount: null,
        costCanonicalUnit: null,
        unitCostCents: null,
        lineCostCents: 0,
        status: 'skipped',
        reason: 'no_catalog_item'
      });
      continue;
    }

    // Determine implicit unit for this bucket
    let impliedUnit;
    if (key === 'liquidChlorine' || key === 'acid') {
      impliedUnit = 'gal';
    } else if (['bakingSoda', 'stabilizer', 'salt'].includes(key)) {
      impliedUnit = 'lb';
    } else if (key === 'chlorineTablets') {
      // Tablets: treat as numeric lb (ambiguous; should ideally be count or lb)
      impliedUnit = 'lb';
    }

    // Validate cost data exists
    if (
      !catalogItem.costCanonicalUnit ||
      catalogItem.costPerCanonicalUnitCents === null ||
      catalogItem.costPerCanonicalUnitCents === undefined
    ) {
      lines.push({
        serviceVisitKey: key,
        catalogItemId: catalogItem.id,
        catalogName: catalogItem.name,
        inputAmount: amountNum,
        inputUnit: impliedUnit,
        normalizedAmount: null,
        costCanonicalUnit: catalogItem.costCanonicalUnit,
        unitCostCents: catalogItem.costPerCanonicalUnitCents,
        lineCostCents: 0,
        status: 'skipped',
        reason: 'missing_cost_data'
      });
      continue;
    }

    // Check domain match
    const impliedDomain = getUnitDomain(impliedUnit);
    const costDomain = getUnitDomain(catalogItem.costCanonicalUnit);
    if (impliedDomain !== costDomain) {
      lines.push({
        serviceVisitKey: key,
        catalogItemId: catalogItem.id,
        catalogName: catalogItem.name,
        inputAmount: amountNum,
        inputUnit: impliedUnit,
        normalizedAmount: null,
        costCanonicalUnit: catalogItem.costCanonicalUnit,
        unitCostCents: catalogItem.costPerCanonicalUnitCents,
        lineCostCents: 0,
        status: 'skipped',
        reason: 'domain_mismatch'
      });
      continue;
    }

    // Convert to canonical unit
    let normalizedAmount;
    try {
      normalizedAmount = convertUnits(amountNum, impliedUnit, catalogItem.costCanonicalUnit);
    } catch (err) {
      lines.push({
        serviceVisitKey: key,
        catalogItemId: catalogItem.id,
        catalogName: catalogItem.name,
        inputAmount: amountNum,
        inputUnit: impliedUnit,
        normalizedAmount: null,
        costCanonicalUnit: catalogItem.costCanonicalUnit,
        unitCostCents: catalogItem.costPerCanonicalUnitCents,
        lineCostCents: 0,
        status: 'skipped',
        reason: 'domain_mismatch'
      });
      continue;
    }

    // Compute line cost
    const lineCostCents = Math.round(
      normalizedAmount * catalogItem.costPerCanonicalUnitCents
    );
    totalCostCents += lineCostCents;

    lines.push({
      serviceVisitKey: key,
      catalogItemId: catalogItem.id,
      catalogName: catalogItem.name,
      inputAmount: amountNum,
      inputUnit: impliedUnit,
      normalizedAmount,
      costCanonicalUnit: catalogItem.costCanonicalUnit,
      unitCostCents: catalogItem.costPerCanonicalUnitCents,
      lineCostCents,
      status: 'costable'
    });
  }

  // Process "other" entries
  if (chemicalsAdded.other && Array.isArray(chemicalsAdded.other)) {
    for (const otherEntry of chemicalsAdded.other) {
      const { name, amount, unit } = otherEntry;
      if (!name || !amount || parseFloat(amount) === 0) continue;

      const amountNum = parseFloat(amount);

      // Normalize legacy "oz"
      let normalizedUnit = unit;
      if (unit === 'oz') {
        // For "other" entries, default to fl_oz if oz is used
        normalizedUnit = 'fl_oz';
      }

      // Lookup catalog by name
      const catalogItem = chemicalCatalogItemsByName.get(name);
      if (!catalogItem) {
        lines.push({
          serviceVisitKey: 'other',
          catalogItemId: null,
          catalogName: name,
          inputAmount: amountNum,
          inputUnit: unit,
          normalizedAmount: null,
          costCanonicalUnit: null,
          unitCostCents: null,
          lineCostCents: 0,
          status: 'skipped',
          reason: 'no_catalog_item'
        });
        continue;
      }

      // Validate cost data
      if (
        !catalogItem.costCanonicalUnit ||
        catalogItem.costPerCanonicalUnitCents === null ||
        catalogItem.costPerCanonicalUnitCents === undefined
      ) {
        lines.push({
          serviceVisitKey: 'other',
          catalogItemId: catalogItem.id,
          catalogName: catalogItem.name,
          inputAmount: amountNum,
          inputUnit: normalizedUnit,
          normalizedAmount: null,
          costCanonicalUnit: catalogItem.costCanonicalUnit,
          unitCostCents: catalogItem.costPerCanonicalUnitCents,
          lineCostCents: 0,
          status: 'skipped',
          reason: 'missing_cost_data'
        });
        continue;
      }

      // Check domain match
      const inputDomain = getUnitDomain(normalizedUnit);
      const costDomain = getUnitDomain(catalogItem.costCanonicalUnit);
      if (inputDomain !== costDomain) {
        lines.push({
          serviceVisitKey: 'other',
          catalogItemId: catalogItem.id,
          catalogName: catalogItem.name,
          inputAmount: amountNum,
          inputUnit: normalizedUnit,
          normalizedAmount: null,
          costCanonicalUnit: catalogItem.costCanonicalUnit,
          unitCostCents: catalogItem.costPerCanonicalUnitCents,
          lineCostCents: 0,
          status: 'skipped',
          reason: 'domain_mismatch'
        });
        continue;
      }

      // Convert to canonical unit
      let normalizedAmount;
      try {
        normalizedAmount = convertUnits(
          amountNum,
          normalizedUnit,
          catalogItem.costCanonicalUnit
        );
      } catch (err) {
        lines.push({
          serviceVisitKey: 'other',
          catalogItemId: catalogItem.id,
          catalogName: catalogItem.name,
          inputAmount: amountNum,
          inputUnit: normalizedUnit,
          normalizedAmount: null,
          costCanonicalUnit: catalogItem.costCanonicalUnit,
          unitCostCents: catalogItem.costPerCanonicalUnitCents,
          lineCostCents: 0,
          status: 'skipped',
          reason: 'domain_mismatch'
        });
        continue;
      }

      // Compute line cost
      const lineCostCents = Math.round(
        normalizedAmount * catalogItem.costPerCanonicalUnitCents
      );
      totalCostCents += lineCostCents;

      lines.push({
        serviceVisitKey: 'other',
        catalogItemId: catalogItem.id,
        catalogName: catalogItem.name,
        inputAmount: amountNum,
        inputUnit: normalizedUnit,
        normalizedAmount,
        costCanonicalUnit: catalogItem.costCanonicalUnit,
        unitCostCents: catalogItem.costPerCanonicalUnitCents,
        lineCostCents,
        status: 'costable'
      });
    }
  }

  return { totalCostCents, lines };
}