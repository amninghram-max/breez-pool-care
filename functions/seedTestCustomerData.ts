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
    
    // Parse request body FIRST to check for debugAuth flag
    let body = {};
    try {
      body = await req.json();
    } catch (err) {
      console.error('Failed to parse request body:', err.message);
    }

    const { leadId, daysBack = 30, visitsCount = 6, debugAuth = false } = body;

    // Read current user context
    let user = null;
    let authError = null;
    try {
      user = await base44.auth.me();
    } catch (err) {
      authError = err.message;
      console.error('Auth read error:', authError);
    }

    // If debugAuth is requested, return diagnostics without running seeding
    if (debugAuth) {
      const diagnostics = {
        authDebug: true,
        userIdentifier: user?.email || user?.id || 'not-identified',
        userPresent: !!user,
        availableRoleFields: user ? {
          role: user.role,
          roles: user.roles,
          isAdmin: user.isAdmin,
          permissions: user.permissions,
          claims: user.claims
        } : null,
        authError,
        expectedAdminGate: 'admin|staff',
        observedRole: user?.role || 'undefined'
      };
      return Response.json(diagnostics, { status: 200 });
    }

    // 1. Admin/Staff gate (check actual role field)
    if (!user) {
      return Response.json({
        step: 'auth',
        errorMessage: 'User not authenticated',
        observedRole: null,
        authError
      }, { status: 403 });
    }

    // Check for admin/staff role (support both user.role and user.roles array)
    const hasAdminRole = 
      user.role === 'admin' || 
      user.role === 'staff' ||
      (Array.isArray(user.roles) && (user.roles.includes('admin') || user.roles.includes('staff'))) ||
      user.isAdmin === true;

    if (!hasAdminRole) {
      return Response.json({
        step: 'auth',
        errorMessage: `User role "${user.role}" does not have admin/staff access`,
        observedRole: user.role,
        availableRoles: user.roles,
        isAdmin: user.isAdmin
      }, { status: 403 });
    }

    // 2. Validate leadId
    if (!leadId) {
      return Response.json({ error: 'leadId is required' }, { status: 400 });
    }

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
      return Response.json({ 
        step: 'readLead',
        error: `Failed to fetch Lead: ${err.message}` 
      }, { status: 500 });
    }

    let attemptedServiceVisits = 0;
    let attemptedCustomerEquipment = 0;

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

    // 6. Skip ChemistryRiskEvent for now (requires poolId + testRecordId linkage)
    // TODO: Add after visits/equipment populate
    const attemptedChemistryRiskEvents = 0;

    // 7. Verification read-back
    let verifiedServiceVisitCount = 0;
    let verifiedCustomerEquipmentCount = 0;

    try {
      const allVisits = await base44.entities.ServiceVisit.list('-visitDate', 500);
      verifiedServiceVisitCount = allVisits.filter(v => v.propertyId === leadId).length;

      const allEquipment = await base44.entities.CustomerEquipment.list();
      verifiedCustomerEquipmentCount = allEquipment.filter(e => e.customerId === leadId).length;
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
      verifiedChemistryRiskEventCount: 0,
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