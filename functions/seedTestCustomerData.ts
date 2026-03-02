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
      lead = await base44.asServiceRole.entities.Lead.list();
      lead = lead.find(l => l.id === leadId);
      if (!lead) {
        return Response.json({ error: 'Lead not found' }, { status: 404 });
      }
    } catch (err) {
      return Response.json({ error: `Failed to fetch Lead: ${err.message}` }, { status: 500 });
    }

    let serviceVisitsCreated = 0;
    let customerEquipmentCreated = 0;
    let chemistryRiskEventsCreated = 0;

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

        await base44.asServiceRole.entities.ServiceVisit.create(visitData);
        serviceVisitsCreated++;
      }
    } catch (err) {
      console.error('ServiceVisit creation error:', err.message);
      return Response.json({ error: `Failed to create ServiceVisit: ${err.message}` }, { status: 500 });
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
        installDate: new Date(2024, 5, 15).toISOString().split('T')[0], // June 15, 2024
      };

      await base44.asServiceRole.entities.CustomerEquipment.create(pump);
      customerEquipmentCreated++;

      const filter = {
        customerId: leadId,
        sourceType: 'custom',
        customType: 'filter',
        customBrand: 'Hayward',
        customModel: 'Pro-Series Sand',
        customNotes: 'Test filter for validation',
        serialNumber: `TST-FILTER-${Date.now()}`,
        installDate: new Date(2023, 7, 20).toISOString().split('T')[0], // August 20, 2023
      };

      await base44.asServiceRole.entities.CustomerEquipment.create(filter);
      customerEquipmentCreated++;
    } catch (err) {
      console.error('CustomerEquipment creation error:', err.message);
      return Response.json({ error: `Failed to create CustomerEquipment: ${err.message}` }, { status: 500 });
    }

    // 6. Create ChemistryRiskEvent records (open + resolved)
    // Note: ChemistryRiskEvent requires poolId, leadId, testRecordId, eventType, severityPoints, triggerValue, thresholdValue, createdDate, expiresAt
    // We'll create minimal test records with dummy testRecordId
    try {
      const now = new Date();
      const thirtyDaysFromNow = new Date(now);
      thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

      // Open risk event (high severity, won't expire for 30 days)
      const openRiskEvent = {
        poolId: leadId, // Use leadId as poolId (may need Pool entity to exist)
        leadId: leadId,
        testRecordId: `TST-RECORD-${Date.now()}`,
        eventType: 'LOW_FC_CRITICAL', // Low free chlorine critical
        severityPoints: 5,
        triggerValue: 0.5,
        thresholdValue: 1.0,
        createdDate: new Date().toISOString(),
        expiresAt: thirtyDaysFromNow.toISOString(),
        notes: 'Test open risk event for dashboard',
      };

      await base44.asServiceRole.entities.ChemistryRiskEvent.create(openRiskEvent);
      chemistryRiskEventsCreated++;

      // Resolved risk event (low severity, already expired)
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 35);
      const expiredDate = new Date(pastDate);
      expiredDate.setDate(expiredDate.getDate() + 30);

      const resolvedRiskEvent = {
        poolId: leadId,
        leadId: leadId,
        testRecordId: `TST-RECORD-${Date.now() + 1}`,
        eventType: 'HIGH_PH', // High pH (low severity)
        severityPoints: 2,
        triggerValue: 8.2,
        thresholdValue: 7.8,
        createdDate: pastDate.toISOString(),
        expiresAt: expiredDate.toISOString(),
        notes: 'Test resolved risk event for dashboard',
      };

      await base44.asServiceRole.entities.ChemistryRiskEvent.create(resolvedRiskEvent);
      chemistryRiskEventsCreated++;
    } catch (err) {
      console.error('ChemistryRiskEvent creation error:', err.message);
      return Response.json({ error: `Failed to create ChemistryRiskEvent: ${err.message}` }, { status: 500 });
    }

    // 7. Return summary
    return Response.json({
      leadId,
      serviceVisitsCreated,
      customerEquipmentCreated,
      chemistryRiskEventsCreated,
      message: 'Test customer data seeded successfully',
    });
  } catch (error) {
    console.error('[seedTestCustomerData] Unexpected error:', error);
    return Response.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
});