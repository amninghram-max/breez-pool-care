/**
 * Unit Conversion Helpers for Technician-Friendly Display
 * 
 * Supports:
 * - Volume: gallons, cups, fl oz (canonical stored as gallons in DosePlan)
 * - Weight: lbs, oz (canonical stored as lbs in DosePlan)
 */

const VOLUME_UNITS = new Set(['fl_oz', 'cup', 'gal']);
const WEIGHT_UNITS = new Set(['oz_wt', 'lb']);

export function getUnitDomain(unit) {
  if (!unit) return null;
  if (VOLUME_UNITS.has(unit)) return 'volume';
  if (WEIGHT_UNITS.has(unit)) return 'weight';
  return null;
}

/**
 * Convert between units within same domain
 * Volume: gal ↔ cup ↔ fl_oz
 * Weight: lb ↔ oz_wt
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
      `Cannot convert between domains: ${fromUnit} (${fromDomain}) → ${toUnit} (${toDomain})`
    );
  }

  // Volume conversions (normalized to fl_oz)
  if (fromDomain === 'volume') {
    const toFlOz = {
      'fl_oz': amount,
      'cup': amount * 8,
      'gal': amount * 128
    };
    const result = toFlOz[fromUnit];
    return result / { 'fl_oz': 1, 'cup': 8, 'gal': 128 }[toUnit];
  }

  // Weight conversions (normalized to oz_wt)
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
 * Choose sensible default display unit based on canonical amount
 * For liquids: if < 0.5 gal, show as cups; else gallons
 * For dry: if < 1 lb, show as oz; else lbs
 */
export function getDefaultDisplayUnit(canonicalAmount, canonicalUnit) {
  if (!canonicalAmount) return canonicalUnit;

  if (canonicalUnit === 'gallons') {
    return canonicalAmount < 0.5 ? 'cup' : 'gal';
  }
  if (canonicalUnit === 'lbs') {
    return canonicalAmount < 1 ? 'oz_wt' : 'lb';
  }

  return canonicalUnit;
}

/**
 * Format a number for display (3 decimals, remove trailing zeros)
 */
export function formatAmount(val) {
  return parseFloat(val).toFixed(3).replace(/\.?0+$/, '');
}