import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { propertyId, readings } = await req.json();

    // Get property details for pool size
    const property = await base44.asServiceRole.entities.Property.get(propertyId);
    
    // Get chemistry targets
    const targetsResult = await base44.asServiceRole.entities.ChemistryTargets.filter({
      settingKey: 'default'
    });
    const targets = targetsResult[0] || {};

    const adjustments = [];

    // Estimate pool gallons from size category
    const poolGallons = {
      'under_10k': 8000,
      '10_15k': 12500,
      '15_20k': 17500,
      '20_30k': 25000,
      '30k_plus': 35000
    }[property.poolSize] || 15000;

    const gallonsK = poolGallons / 1000;

    // Free Chlorine adjustment
    if (targets.freeChlorine && readings.freeChlorine < targets.freeChlorine.min) {
      const deficit = targets.freeChlorine.min - readings.freeChlorine;
      const ozNeeded = deficit * gallonsK * (targets.estimationFormulas?.chlorinePerPpm || 0.013);
      const gallonsNeeded = (ozNeeded / 128).toFixed(2);
      
      adjustments.push({
        chemical: 'Liquid Chlorine',
        reason: `FC below target (${readings.freeChlorine} < ${targets.freeChlorine.min})`,
        amount: gallonsNeeded,
        unit: 'gallons'
      });
    }

    // pH adjustment (high)
    if (targets.pH && readings.pH > targets.pH.max) {
      const excess = readings.pH - targets.pH.max;
      const ozNeeded = (excess / 0.2) * gallonsK * (targets.estimationFormulas?.acidPerPH || 0.02);
      const gallonsNeeded = (ozNeeded / 128).toFixed(2);
      
      adjustments.push({
        chemical: 'Muriatic Acid',
        reason: `pH above target (${readings.pH} > ${targets.pH.max})`,
        amount: gallonsNeeded,
        unit: 'gallons'
      });
    }

    // Total Alkalinity adjustment (low)
    if (targets.totalAlkalinity && readings.totalAlkalinity < targets.totalAlkalinity.min) {
      const deficit = targets.totalAlkalinity.min - readings.totalAlkalinity;
      const ozNeeded = (deficit / 10) * gallonsK * (targets.estimationFormulas?.bakingSodaPerTA || 1.5);
      const lbsNeeded = (ozNeeded / 16).toFixed(2);
      
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
      poolGallons
    });
  } catch (error) {
    console.error('Calculate suggestions error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});