import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const results = { chemistryTargets: null, productProfiles: [] };

    // ===== A) Seed ChemistryTargets =====
    const existingTargets = await base44.entities.ChemistryTargets.list('-created_date', 1);
    if (!existingTargets || existingTargets.length === 0) {
      const chemistryTargetsPayload = {
        settingKey: 'default',
        freeChlorine: { min: 2.0, max: 4.0, unit: 'ppm' },
        pH: { min: 7.2, max: 7.8, unit: 'pH' },
        totalAlkalinity: { min: 60, max: 180, unit: 'ppm' },
        cyanuricAcid: { min: 0, max: 100, unit: 'ppm' },
        calciumHardness: { min: 150, max: 1000, unit: 'ppm' },
        combinedChlorine: { min: 0, max: 0.4, unit: 'ppm' }
      };
      const created = await base44.asServiceRole.entities.ChemistryTargets.create(chemistryTargetsPayload);
      results.chemistryTargets = created;
    }

    // ===== B) Seed ProductProfiles =====
    const existingProducts = await base44.entities.ProductProfile.list();
    const activeCount = (existingProducts || []).filter(p => p.isActive).length;

    if (activeCount === 0) {
      // Define starter products with chemicalType, name, sku, strengthPercent, labelFactor, unit
      const starterProducts = [
        // Increase FC
        { chemicalType: 'LIQUID_CHLORINE', name: 'Calcium Hypochlorite 67%', sku: 'CAL-HYPO-67', strengthPercent: 67, labelFactor: 2.0, unit: 'lbs' },
        { chemicalType: 'LIQUID_CHLORINE', name: 'Sodium Hypochlorite 12%', sku: 'NAOH-HYPO-12', strengthPercent: 12, labelFactor: 10.71, unit: 'gallons' },
        { chemicalType: 'LIQUID_CHLORINE', name: 'Dichlor 62%', sku: 'DICHLOR-62', strengthPercent: 62, labelFactor: 2.11, unit: 'lbs' },
        { chemicalType: 'LIQUID_CHLORINE', name: 'Dichlor 56%', sku: 'DICHLOR-56', strengthPercent: 56, labelFactor: 2.35, unit: 'lbs' },
        { chemicalType: 'LIQUID_CHLORINE', name: 'Trichlor', sku: 'TRICHLOR-STD', strengthPercent: 90, labelFactor: 1.47, unit: 'lbs' },

        // Increase TA
        { chemicalType: 'ALKALINITY_UP', name: 'Sodium Bicarbonate', sku: 'BICARB-SODA', strengthPercent: 100, labelFactor: 0.14, unit: 'lbs' },
        { chemicalType: 'ALKALINITY_UP', name: 'Sodium Carbonate (Soda Ash)', sku: 'SODA-ASH', strengthPercent: 100, labelFactor: 1.40, unit: 'oz' },

        // Decrease TA
        { chemicalType: 'MURIATIC_ACID', name: 'Muriatic Acid 31.4%', sku: 'MURIATIC-31.4', strengthPercent: 31.4, labelFactor: 2.57, unit: 'gallons' },
        { chemicalType: 'MURIATIC_ACID', name: 'Sodium Bisulfate', sku: 'BISULFATE-DRY', strengthPercent: 100, labelFactor: 0.211, unit: 'lbs' },

        // Increase CH
        { chemicalType: 'CALCIUM_INCREASER', name: 'Calcium Chloride 100%', sku: 'CAL-CHLOR-100', strengthPercent: 100, labelFactor: 0.0918, unit: 'lbs' },
        { chemicalType: 'CALCIUM_INCREASER', name: 'Calcium Chloride 77%', sku: 'CAL-CHLOR-77', strengthPercent: 77, labelFactor: 0.12, unit: 'lbs' },

        // Increase CYA
        { chemicalType: 'STABILIZER_CYA', name: 'Cyanuric Acid', sku: 'CYA-ACID', strengthPercent: 100, labelFactor: 1.32, unit: 'lbs' }
      ];

      for (const product of starterProducts) {
        const created = await base44.asServiceRole.entities.ProductProfile.create({
          ...product,
          version: 1,
          isActive: true,
          notes: 'Seeded default product profile'
        });
        results.productProfiles.push(created);
      }
    }

    return Response.json({
      success: true,
      message: 'Seeding completed',
      results
    });
  } catch (error) {
    console.error('seedChemistryAndProducts error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});