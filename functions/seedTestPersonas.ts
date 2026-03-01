import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

const TEST_TECH_EMAIL = 'test.tech1@breezpoolcare.com';
const TEST_CUSTOMER1_EMAIL = 'test.customer1@breezpoolcare.com';
const TEST_CUSTOMER2_EMAIL = 'test.customer2@breezpoolcare.com';
const TEST_CUSTOMER3_EMAIL = 'test.customer3@breezpoolcare.com';

const MELBOURNE_FL_ADDRESS = {
  streetAddress: '450 N Harbor City Blvd',
  city: 'Melbourne',
  state: 'FL',
  zipCode: '32935',
  serviceAddress: '450 N Harbor City Blvd, Melbourne, FL 32935',
};

Deno.serve(async (req) => {
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

    const result = {};

    // ─────────────────────────────────────────────
    // A) TECHNICIAN — lookup only, cannot create/update User entity from functions
    // User entity has special built-in security. Must be configured manually via Dashboard.
    // ─────────────────────────────────────────────
    const allUsers = await db.entities.User.list();
    const techUser = allUsers.find(u => u.email === TEST_TECH_EMAIL);

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
    let activatedLeads = await db.entities.Lead.filter({ email: TEST_CUSTOMER1_EMAIL });
    let activatedLead = activatedLeads?.[0] || null;
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
    let quotes = await db.entities.Quote.filter({ clientEmail: TEST_CUSTOMER1_EMAIL });
    let quote = quotes?.[0] || null;
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
    if (!activatedLead.acceptedQuoteId || activatedLeadCreated) {
      await db.entities.Lead.update(activatedLead.id, { acceptedQuoteId: quote.id });
    }

    // Future CalendarEvent
    let events = await db.entities.CalendarEvent.filter({ leadId: activatedLead.id, eventType: 'service', status: 'scheduled' });
    let event = events?.[0] || null;
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

    // Past ServiceVisit
    let visits = await db.entities.ServiceVisit.filter({ propertyId: activatedLead.id });
    let visit = visits?.[0] || null;
    let visitCreated = false;

    if (!visit) {
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
    }
    result.activatedServiceVisitId = visit.id;
    result.activatedServiceVisitCreated = visitCreated;

    // ─────────────────────────────────────────────
    // C) PENDING CUSTOMER
    // ─────────────────────────────────────────────
    let pendingLeads = await db.entities.Lead.filter({ email: TEST_CUSTOMER2_EMAIL });
    let pendingLead = pendingLeads?.[0] || null;
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
    let fecalLeads = await db.entities.Lead.filter({ email: TEST_CUSTOMER3_EMAIL });
    let fecalLead = fecalLeads?.[0] || null;
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
    let incidents = await db.entities.FecalIncident.filter({ leadId: fecalLead.id, status: 'open' });
    let incident = incidents?.[0] || null;
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
    console.error('seedTestPersonas error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});