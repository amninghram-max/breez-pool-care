import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// Category-based fallback map — used ONLY when Pool.volumeGallons is null/absent.
// Marked as estimated; not used silently.
const CATEGORY_GALLON_ESTIMATES = {
  'under_10k': 8000,
  '10_15k': 12500,
  '15_20k': 17500,
  '20_30k': 25000,
  '30k_plus': 35000
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { poolId, readings } = await req.json();

    if (!poolId) {
      return Response.json({ success: false, error: 'poolId is required' }, { status: 400 });
    }

    // Load the authoritative Pool record
    const poolRows = await base44.asServiceRole.entities.Pool.filter({ id: poolId }, null, 1);
    const pool = poolRows?.[0];

    if (!pool) {
      return Response.json({ success: false, error: 'Pool record not found for poolId: ' + poolId }, { status: 404 });
    }

    // Determine volume — prefer Pool.volumeGallons (authoritative), fall back to category estimate
    let poolGallons;
    let volumeSource;
    let volumeConfirmed;

    if (pool.volumeGallons != null && pool.volumeGallons > 0) {
      poolGallons = pool.volumeGallons;
      volumeSource = 'pool.volumeGallons';
      volumeConfirmed = true;
    } else if (pool.poolSize && CATEGORY_GALLON_ESTIMATES[pool.poolSize]) {
      // Fallback: category-based estimate — explicitly flagged as unconfirmed
      poolGallons = CATEGORY_GALLON_ESTIMATES[pool.poolSize];
      volumeSource = 'category_estimate';
      volumeConfirmed = false;
      console.warn('CALC_CHEM_VOLUME_UNCONFIRMED', {
        poolId,
        poolSize: pool.poolSize,
        estimatedGallons: poolGallons,
        message: 'Pool.volumeGallons is not set — using category estimate. Suggestions are approximate.'
      });
    } else {
      // No volume data at all — return structured error, no suggestions
      console.error('CALC_CHEM_VOLUME_MISSING', { poolId });
      return Response.json({
        success: false,
        volumeMissing: true,
        error: 'Pool volume is not set and no size category is available. Cannot calculate suggestions.',
        adjustments: [],
        poolGallons: null,
        volumeConfirmed: false,
        volumeSource: 'none'
      });
    }

    // Get chemistry targets from AdminSettings (canonical source)
    const adminSettingsRows = await base44.asServiceRole.entities.AdminSettings.list('-created_date', 1);
    const adminSettings = adminSettingsRows?.[0];
    let targets = {};

    if (adminSettings?.chemistryTargets) {
      try {
        targets = JSON.parse(adminSettings.chemistryTargets);
      } catch (e) {
        console.error('CALC_CHEM_TARGETS_PARSE_FAILED', { error: e.message });
        return Response.json({ success: false, error: 'Chemistry targets configuration is invalid.' }, { status: 500 });
      }
    } else {
      // No targets configured — cannot produce suggestions
      console.error('CALC_CHEM_TARGETS_MISSING', { adminSettingsId: adminSettings?.id });
      return Response.json({
        success: false,
        error: 'Chemistry targets are not configured in AdminSettings. Cannot calculate suggestions.',
        adjustments: [],
        poolGallons,
        volumeConfirmed,
        volumeSource
      });
    }

    const gallonsK = poolGallons / 1000;
    const adjustments = [];

    // Estimation formulas from AdminSettings targets, no hardcoded fallbacks
    const formulas = targets.estimationFormulas;
    if (!formulas) {
      return Response.json({
        success: false,
        error: 'estimationFormulas not found in chemistryTargets. Cannot calculate suggestions.',
        adjustments: [],
        poolGallons,
        volumeConfirmed,
        volumeSource
      });
    }

    // Free Chlorine adjustment (low)
    if (targets.freeChlorine && readings.freeChlorine != null && readings.freeChlorine < targets.freeChlorine.min) {
      const deficit = targets.freeChlorine.min - readings.freeChlorine;
      const ozNeeded = deficit * gallonsK * formulas.chlorinePerPpm;
      const gallonsNeeded = ozNeeded / 128;
      adjustments.push({
        chemical: 'Liquid Chlorine',
        reason: `FC below target (${readings.freeChlorine} < ${targets.freeChlorine.min})`,
        amount: gallonsNeeded,
        unit: 'gallons'
      });
    }

    // pH adjustment (high)
    if (targets.pH && readings.pH != null && readings.pH > targets.pH.max) {
      const excess = readings.pH - targets.pH.max;
      const ozNeeded = (excess / 0.2) * gallonsK * formulas.acidPerPH;
      const gallonsNeeded = ozNeeded / 128;
      adjustments.push({
        chemical: 'Muriatic Acid',
        reason: `pH above target (${readings.pH} > ${targets.pH.max})`,
        amount: gallonsNeeded,
        unit: 'gallons'
      });
    }

    // Total Alkalinity adjustment (low)
    if (targets.totalAlkalinity && readings.totalAlkalinity != null && readings.totalAlkalinity < targets.totalAlkalinity.min) {
      const deficit = targets.totalAlkalinity.min - readings.totalAlkalinity;
      const ozNeeded = (deficit / 10) * gallonsK * formulas.bakingSodaPerTA;
      const lbsNeeded = ozNeeded / 16;
      adjustments.push({
        chemical: 'Baking Soda',
        reason: `TA below target (${readings.totalAlkalinity} < ${targets.totalAlkalinity.min})`,
        amount: lbsNeeded,
        unit: 'lbs'
      });
    }

    return Response.json({
      success: true,
      adjustments,
      poolGallons,
      volumeConfirmed,
      volumeSource
    });

  } catch (error) {
    console.error('CALC_CHEM_CRASH', { error: error.message });
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
});