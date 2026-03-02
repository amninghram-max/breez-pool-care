import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// Utility to generate realistic chemistry values
function getRandomChemistry() {
  return {
    freeChlorine: 1.0 + Math.random() * 3.5, // 1.0-4.5
    pH: 7.2 + Math.random() * 0.6, // 7.2-7.8
    totalAlkalinity: 70 + Math.random() * 40, // 70-110
    cyanuricAcid: 30 + Math.random() * 40, // 30-70
    calciumHardness: 200 + Math.random() * 200, // 200-400
    waterTemp: 72 + Math.random() * 14, // 72-86
  };
}

// Utility to get a date N days ago
function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(Math.floor(Math.random() * 24), Math.floor(Math.random() * 60), 0, 0);
  return d.toISOString();
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    // 1. Admin/Staff only
    if (!user || !['admin', 'staff'].includes(user.role)) {
      return Response.json({ error: 'Forbidden: Admin/Staff only' }, { status: 403 });
    }

    // 2. Parse request body
    const body = await req.json();
    const { leadId, daysBack = 30, visitsCount = 6 } = body;

    if (!leadId) {
      return Response.json({ error: 'leadId is required' }, { status: 400 });
    }

    // 3. Read the Lead
    let lead;
    try {
      const leads = await base44.entities.Lead.list();
      lead = leads.find(l => l.id === leadId);
      if (!lead) {
        return Response.json({ error: 'Lead not found' }, { status: 404 });
      }
    } catch (err) {
      return Response.json({ error: `Failed to fetch Lead: ${err.message}` }, { status: 500 });
    }

    let attemptedServiceVisits = 0;
    let attemptedCustomerEquipment = 0;
    let attemptedChemistryRiskEvents = 0;

    // 4. Create ServiceVisit records (spread across daysBack)
    try {
      const technicianNames = ['Matt', 'Sarah', 'James', 'Lisa'];
      const servicesOptions = [
        ['test_equipment', 'brush', 'skim'],
        ['test_equipment', 'vacuum'],
        ['test_equipment', 'filter_check', 'brush'],
        ['test_equipment', 'backwash'],
        ['test_equipment', 'empty_baskets'],
        ['test_equipment', 'brush', 'skim'],
      ];

      for (let i = 0; i < visitsCount; i++) {
        const daysAgoVal = Math.floor((daysBack * (i + 1)) / (visitsCount + 1));
        const visitData = {
          propertyId: leadId,
          visitDate: daysAgo(daysAgoVal),
          technicianName: technicianNames[i % technicianNames.length],
          ...getRandomChemistry(),
          servicesPerformed: servicesOptions[i % servicesOptions.length],
          notes: `Test service visit ${i + 1} for dashboard validation`,
        };

        await base44.entities.ServiceVisit.create(visitData);
        attemptedServiceVisits++;
      }
    } catch (err) {
      console.error('ServiceVisit creation error:', err.message);
      return Response.json({
        error: {
          step: 'createServiceVisits',
          errorMessage: err.message,
          errorCode: err.code || 'UNKNOWN',
          statusCode: err.status || 500,
          attempted: attemptedServiceVisits
        }
      }, { status: err.status || 500 });
    }

    // 5. Create CustomerEquipment records (pump + filter)
    try {
      const pump = {
        customerId: leadId,
        sourceType: 'custom',
        customType: 'pump',
        customBrand: 'Pentair',
        customModel: 'SuperFlo Variable Speed',
        customNotes: 'Test pump for validation',
        serialNumber: `TST-PUMP-${Date.now()}`,
        installDate: new Date(2024, 5, 15).toISOString().split('T')[0],
      };

      await base44.entities.CustomerEquipment.create(pump);
      attemptedCustomerEquipment++;

      const filter = {
        customerId: leadId,
        sourceType: 'custom',
        customType: 'filter',
        customBrand: 'Hayward',
        customModel: 'Pro-Series Sand',
        customNotes: 'Test filter for validation',
        serialNumber: `TST-FILTER-${Date.now()}`,
        installDate: new Date(2023, 7, 20).toISOString().split('T')[0],
      };

      await base44.entities.CustomerEquipment.create(filter);
      attemptedCustomerEquipment++;
    } catch (err) {
      console.error('CustomerEquipment creation error:', err.message);
      return Response.json({
        error: {
          step: 'createCustomerEquipment',
          errorMessage: err.message,
          errorCode: err.code || 'UNKNOWN',
          statusCode: err.status || 500,
          attempted: attemptedCustomerEquipment
        }
      }, { status: err.status || 500 });
    }

    // 6. Create ChemistryRiskEvent records (open + resolved)
    try {
      const now = new Date();
      const thirtyDaysFromNow = new Date(now);
      thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

      const openRiskEvent = {
        poolId: leadId,
        leadId: leadId,
        testRecordId: `TST-RECORD-${Date.now()}`,
        eventType: 'LOW_FC_CRITICAL',
        severityPoints: 5,
        triggerValue: 0.5,
        thresholdValue: 1.0,
        createdDate: new Date().toISOString(),
        expiresAt: thirtyDaysFromNow.toISOString(),
        notes: 'Test open risk event for dashboard',
      };

      await base44.entities.ChemistryRiskEvent.create(openRiskEvent);
      attemptedChemistryRiskEvents++;

      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 35);
      const expiredDate = new Date(pastDate);
      expiredDate.setDate(expiredDate.getDate() + 30);

      const resolvedRiskEvent = {
        poolId: leadId,
        leadId: leadId,
        testRecordId: `TST-RECORD-${Date.now() + 1}`,
        eventType: 'HIGH_PH',
        severityPoints: 2,
        triggerValue: 8.2,
        thresholdValue: 7.8,
        createdDate: pastDate.toISOString(),
        expiresAt: expiredDate.toISOString(),
        notes: 'Test resolved risk event for dashboard',
      };

      await base44.entities.ChemistryRiskEvent.create(resolvedRiskEvent);
      attemptedChemistryRiskEvents++;
    } catch (err) {
      console.error('ChemistryRiskEvent creation error:', err.message);
      return Response.json({
        error: {
          step: 'createChemistryRiskEvents',
          errorMessage: err.message,
          errorCode: err.code || 'UNKNOWN',
          statusCode: err.status || 500,
          attempted: attemptedChemistryRiskEvents
        }
      }, { status: err.status || 500 });
    }

    // 7. Verification read-back
    let verifiedServiceVisitCount = 0;
    let verifiedCustomerEquipmentCount = 0;
    let verifiedChemistryRiskEventCount = 0;

    try {
      const allVisits = await base44.entities.ServiceVisit.list('-visitDate', 500);
      verifiedServiceVisitCount = allVisits.filter(v => v.propertyId === leadId).length;

      const allEquipment = await base44.entities.CustomerEquipment.list();
      verifiedCustomerEquipmentCount = allEquipment.filter(e => e.customerId === leadId).length;

      const allRiskEvents = await base44.entities.ChemistryRiskEvent.list();
      verifiedChemistryRiskEventCount = allRiskEvents.filter(e => e.leadId === leadId).length;
    } catch (err) {
      console.error('Verification read-back error:', err.message);
      // Continue despite verification error—creations may have succeeded
    }

    // 8. Return summary with both attempted and verified counts
    return Response.json({
      leadId,
      attemptedServiceVisits,
      attemptedCustomerEquipment,
      attemptedChemistryRiskEvents,
      verifiedServiceVisitCount,
      verifiedCustomerEquipmentCount,
      verifiedChemistryRiskEventCount,
      message: 'Test customer data seeded successfully',
    });
  } catch (error) {
    console.error('[seedTestCustomerData] Unexpected error:', error);
    return Response.json({
      error: {
        step: 'initialization',
        errorMessage: error.message || 'Internal server error'
      }
    }, { status: 500 });
  }
});