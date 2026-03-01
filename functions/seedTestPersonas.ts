import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

const TEST_TECH_EMAIL = 'test.tech1@breezpoolcare.com';
const TEST_CUSTOMER1_EMAIL = 'test.customer1@breezpoolcare.com';
const TEST_CUSTOMER2_EMAIL = 'test.customer2@breezpoolcare.com';
const TEST_CUSTOMER3_EMAIL = 'test.customer3@breezpoolcare.com';

// Helper: filter using list + JS filter (avoids asServiceRole filter issues)
async function findByEmail(db, entityName, email) {
  const all = await db.entities[entityName].list();
  return all.find(r => r.email === email) || null;
}

async function findByLeadId(db, entityName, leadId, extraCheck) {
  const all = await db.entities[entityName].list();
  const matches = all.filter(r => r.leadId === leadId || r.propertyId === leadId);
  if (extraCheck) return matches.find(extraCheck) || null;
  return matches[0] || null;
}

const MELBOURNE_FL_ADDRESS = {
  streetAddress: '450 N Harbor City Blvd',
  city: 'Melbourne',
  state: 'FL',
  zipCode: '32935',
  serviceAddress: '450 N Harbor City Blvd, Melbourne, FL 32935',
};

Deno.serve(async (req) => {
  const result = {};
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const db = base44.asServiceRole;
    const now = new Date().toISOString();
    const todayPlus3 = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const todayMinus7 = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    // ─────────────────────────────────────────────
    // A) TECHNICIAN — lookup only, cannot create/update User entity from functions
    // User entity has special built-in security. Must be configured manually via Dashboard.
    // ─────────────────────────────────────────────
    const allUsers = await db.entities.User.list();
    const techUser = allUsers.find(u => u.email === TEST_TECH_EMAIL) || null;

    if (techUser) {
      result.technicianUserId = techUser.id;
      result.technicianCreated = false;
      result.technicianNote = `User found (id: ${techUser.id}). Manually set role=technician and canFinalizeInspections=true via Dashboard > Users if not already done.`;
    } else {
      result.technicianUserId = null;
      result.technicianCreated = false;
      result.technicianNote = `User not found. Invite ${TEST_TECH_EMAIL} via Dashboard, set role=technician and canFinalizeInspections=true, then re-run this seed.`;
    }

    // ─────────────────────────────────────────────
    // B) ACTIVATED CUSTOMER
    // ─────────────────────────────────────────────
    let activatedLead = await findByEmail(db, 'Lead', TEST_CUSTOMER1_EMAIL);
    let activatedLeadCreated = false;

    if (!activatedLead) {
      activatedLead = await db.entities.Lead.create({
        email: TEST_CUSTOMER1_EMAIL,
        firstName: 'Activated',
        lastName: 'Customer',
        ...MELBOURNE_FL_ADDRESS,
        stage: 'converted',
        accountStatus: 'active',
        activationPaymentStatus: 'paid',
        activationPaymentDate: now,
        agreementsAccepted: true,
        agreementsAcceptedAt: now,
        notes: '[TEST SEED] Activated customer persona',
      });
      activatedLeadCreated = true;
    }
    // If already exists, reuse as-is (avoid RLS conflicts on update)
    result.activatedLeadId = activatedLead.id;
    result.activatedLeadCreated = activatedLeadCreated;

    // Quote for activated customer
    const allQuotes = await db.entities.Quote.list();
    let quote = allQuotes.find(q => q.clientEmail === TEST_CUSTOMER1_EMAIL) || null;
    let quoteCreated = false;

    if (!quote) {
      quote = await db.entities.Quote.create({
        clientEmail: TEST_CUSTOMER1_EMAIL,
        clientFirstName: 'Activated',
        clientLastName: 'Customer',
        status: 'converted',
        version: 1,
        outputMonthlyPrice: 160,
        outputPerVisitPrice: 40,
        outputOneTimeFees: 0,
        outputFirstMonthTotal: 160,
        outputFrequency: 'weekly',
        outputSizeTier: 'tier_b',
      });
      quoteCreated = true;
    }
    result.activatedQuoteId = quote.id;
    result.activatedQuoteCreated = quoteCreated;

    // Set acceptedQuoteId on lead if not already set
    // Note: Lead RLS update requires admin/staff role on the calling user — service role handles this
    if (!activatedLead.acceptedQuoteId || activatedLeadCreated) {
      try {
        await db.entities.Lead.update(activatedLead.id, { acceptedQuoteId: quote.id });
      } catch (e) {
        result.acceptedQuoteIdUpdateNote = `Could not set acceptedQuoteId: ${e.message}. Set it manually on leadId=${activatedLead.id}.`;
      }
    }

    // Future CalendarEvent
    let event = await findByLeadId(db, 'CalendarEvent', activatedLead.id, r => r.eventType === 'service' && r.status === 'scheduled');
    let eventCreated = false;

    if (!event) {
      event = await db.entities.CalendarEvent.create({
        leadId: activatedLead.id,
        eventType: 'service',
        scheduledDate: todayPlus3,
        status: 'scheduled',
        assignedTechnician: 'Test Technician',
        serviceAddress: MELBOURNE_FL_ADDRESS.serviceAddress,
        timeWindow: '9:00 AM - 11:00 AM',
        isRecurring: true,
        recurrencePattern: 'weekly',
        customerNotes: '[TEST SEED] Upcoming service visit',
      });
      eventCreated = true;
    }
    result.activatedEventId = event.id;
    result.activatedEventCreated = eventCreated;

    // Past ServiceVisit — also try ChemTestRecord as fallback for service history display
    let visit = await findByLeadId(db, 'ServiceVisit', activatedLead.id);
    let visitCreated = false;

    if (!visit) {
      try {
        visit = await db.entities.ServiceVisit.create({
          propertyId: activatedLead.id,
          visitDate: todayMinus7,
          technicianName: 'Test Technician',
          freeChlorine: 2.5,
          pH: 7.4,
          totalAlkalinity: 100,
          combinedChlorine: 0.1,
          cyanuricAcid: 45,
          calciumHardness: 250,
          waterTemp: 78,
          servicesPerformed: ['skim', 'brush', 'empty_baskets', 'filter_check'],
          notes: '[TEST SEED] Past service visit',
          chemicalsAdded: { liquidChlorine: 0.25 },
        });
        visitCreated = true;
      } catch (e) {
        result.activatedServiceVisitNote = `Could not create ServiceVisit: ${e.message}`;
        visit = { id: null };
      }
    }
    result.activatedServiceVisitId = visit.id;
    result.activatedServiceVisitCreated = visitCreated;

    // Also create ChemTestRecord (used by CustomerServiceHistory page)
    let pool = null;
    try {
      const allPools = await db.entities.Pool.list();
      pool = allPools.find(p => p.leadId === activatedLead.id) || null;
    } catch (e) { /* ignore */ }

    if (!pool) {
      try {
        pool = await db.entities.Pool.create({
          leadId: activatedLead.id,
          surfaceType: 'CONCRETE_PLASTER',
          volumeGallons: 15000,
          poolType: 'in_ground',
          enclosure: 'fully_screened',
          filterType: 'cartridge',
          chlorinationMethod: 'liquid_chlorine',
          status: 'active',
        });
        result.activatedPoolId = pool.id;
        result.activatedPoolCreated = true;
      } catch (e) {
        result.activatedPoolNote = `Could not create Pool: ${e.message}`;
      }
    } else {
      result.activatedPoolId = pool.id;
      result.activatedPoolCreated = false;
    }

    if (pool?.id) {
      try {
        const allChemTests = await db.entities.ChemTestRecord.list();
        const existingTest = allChemTests.find(r => r.leadId === activatedLead.id);
        if (!existingTest) {
          const chemTest = await db.entities.ChemTestRecord.create({
            poolId: pool.id,
            leadId: activatedLead.id,
            testDate: todayMinus7,
            technicianId: 'test-seed-tech',
            freeChlorine: 2.5,
            pH: 7.4,
            totalAlkalinity: 100,
            combinedChlorine: 0.1,
            cyanuricAcid: 45,
            calciumHardness: 250,
            waterTemp: 78,
            notes: '[TEST SEED] Past chemistry test',
          });
          result.activatedChemTestId = chemTest.id;
          result.activatedChemTestCreated = true;
        } else {
          result.activatedChemTestId = existingTest.id;
          result.activatedChemTestCreated = false;
        }
      } catch (e) {
        result.activatedChemTestNote = `Could not create ChemTestRecord: ${e.message}`;
      }
    }

    // ─────────────────────────────────────────────
    // C) PENDING CUSTOMER
    // ─────────────────────────────────────────────
    let pendingLead = await findByEmail(db, 'Lead', TEST_CUSTOMER2_EMAIL);
    let pendingLeadCreated = false;

    if (!pendingLead) {
      pendingLead = await db.entities.Lead.create({
        email: TEST_CUSTOMER2_EMAIL,
        firstName: 'Pending',
        lastName: 'Customer',
        streetAddress: '1200 S Babcock St',
        city: 'Melbourne',
        state: 'FL',
        zipCode: '32901',
        serviceAddress: '1200 S Babcock St, Melbourne, FL 32901',
        stage: 'converted',
        accountStatus: 'active',
        activationPaymentStatus: 'pending',
        agreementsAccepted: false,
        notes: '[TEST SEED] Pending payment customer persona',
      });
      pendingLeadCreated = true;
    }
    // If already exists, reuse as-is
    result.pendingLeadId = pendingLead.id;
    result.pendingLeadCreated = pendingLeadCreated;

    // ─────────────────────────────────────────────
    // D) FECAL INCIDENT CUSTOMER
    // ─────────────────────────────────────────────
    let fecalLead = await findByEmail(db, 'Lead', TEST_CUSTOMER3_EMAIL);
    let fecalLeadCreated = false;

    if (!fecalLead) {
      fecalLead = await db.entities.Lead.create({
        email: TEST_CUSTOMER3_EMAIL,
        firstName: 'Fecal',
        lastName: 'Customer',
        streetAddress: '2701 N Wickham Rd',
        city: 'Melbourne',
        state: 'FL',
        zipCode: '32935',
        serviceAddress: '2701 N Wickham Rd, Melbourne, FL 32935',
        stage: 'converted',
        accountStatus: 'active',
        activationPaymentStatus: 'paid',
        activationPaymentDate: now,
        agreementsAccepted: true,
        agreementsAcceptedAt: now,
        notes: '[TEST SEED] Fecal incident customer persona',
      });
      fecalLeadCreated = true;
    }
    // If already exists, reuse as-is
    result.fecalLeadId = fecalLead.id;
    result.fecalLeadCreated = fecalLeadCreated;

    // FecalIncident — reuse open one if exists
    let incident = await findByLeadId(db, 'FecalIncident', fecalLead.id, r => r.status === 'open');
    let incidentCreated = false;

    if (!incident) {
      incident = await db.entities.FecalIncident.create({
        leadId: fecalLead.id,
        incidentType: 'formed_stool',
        reportedAt: now,
        status: 'open',
        anyoneSwamSince: false,
        notes: '[TEST SEED] Test fecal incident — do not remediate',
      });
      incidentCreated = true;
    }
    result.fecalIncidentId = incident.id;
    result.fecalIncidentCreated = incidentCreated;

    return Response.json({
      success: true,
      message: 'Test personas seeded successfully',
      ids: result,
    });

  } catch (error) {
    console.error('seedTestPersonas error:', error.message);
    console.error('Error data:', JSON.stringify(error?.data || {}));
    return Response.json({ error: error.message, partialResult: result }, { status: 500 });
  }
});