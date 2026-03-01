import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  const results = {
    success: false,
    runId: null,
    ids: {},
    errors: [],
    notes: [],
  };

  try {
    // --- Auth ---
    const base44 = createClientFromRequest(req);
    const SEED_KEY = Deno.env.get('SEED_KEY');
    const providedKey = req.headers.get('X-Seed-Key');

    let isAuthorized = false;

    // Option A: valid SEED_KEY header match
    if (SEED_KEY && providedKey === SEED_KEY) {
      isAuthorized = true;
    }

    // Option B: authenticated admin
    if (!isAuthorized) {
      try {
        const user = await base44.auth.me();
        if (user?.role === 'admin') {
          isAuthorized = true;
        }
      } catch (_) {
        // not authenticated — fall through
      }
    }

    if (!isAuthorized) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const db = base44.asServiceRole;
    const ts = Date.now();
    results.runId = ts;

    const todayPlus7 = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    // ----------------------------------------------------------------
    // PERSONA 1: Activated Customer
    // ----------------------------------------------------------------
    try {
      const email1 = `test.customer1.${ts}@breezpoolcare.com`;

      // Create Quote first so we can reference its ID in the Lead
      let quote = null;
      try {
        quote = await db.entities.Quote.create({
          clientEmail: email1,
          clientFirstName: 'Alice',
          clientLastName: 'Active',
          status: 'converted',
          outputMonthlyPrice: 150,
          outputPerVisitPrice: 37.5,
          outputOneTimeFees: 0,
          outputFirstMonthTotal: 150,
          outputFrequency: 'weekly',
          inspectionVerified: true,
        });
        results.ids.activatedQuoteId = quote.id;
      } catch (e) {
        results.errors.push({ step: 'activated_quote_create', error: e.message });
      }

      const lead1 = await db.entities.Lead.create({
        firstName: 'Alice',
        lastName: 'Active',
        email: email1,
        mobilePhone: '5550001001',
        streetAddress: '100 Active Lane',
        city: 'Tampa',
        state: 'FL',
        zipCode: '33601',
        serviceAddress: '100 Active Lane, Tampa, FL 33601',
        stage: 'converted',
        accountStatus: 'active',
        activationPaymentStatus: 'paid',
        agreementsAccepted: true,
        agreementsAcceptedAt: new Date().toISOString(),
        monthlyServiceAmount: 150,
        acceptedQuoteId: quote?.id || null,
        poolType: 'in_ground',
        poolSurface: 'concrete',
        filterType: 'cartridge',
        sanitizerType: 'liquid_chlorine',
        screenedArea: 'fully_screened',
        preferredContact: 'email',
      });
      results.ids.activatedLeadId = lead1.id;

      // CalendarEvent
      try {
        const event = await db.entities.CalendarEvent.create({
          leadId: lead1.id,
          eventType: 'service',
          status: 'scheduled',
          scheduledDate: todayPlus7.split('T')[0],
          serviceAddress: '100 Active Lane, Tampa, FL 33601',
          assignedTechnician: 'Test Technician',
          notes: '[TEST SEED] Future service visit',
        });
        results.ids.activatedEventId = event.id;
      } catch (e) {
        results.errors.push({ step: 'activated_event_create', error: e.message });
      }

      results.notes.push('Pool and ServiceVisit skipped per design (RLS restricted).');
    } catch (e) {
      results.errors.push({ step: 'activated_persona', error: e.message });
    }

    // ----------------------------------------------------------------
    // PERSONA 2: Pending Customer
    // ----------------------------------------------------------------
    try {
      const email2 = `test.customer2.${ts}@breezpoolcare.com`;

      const lead2 = await db.entities.Lead.create({
        firstName: 'Pete',
        lastName: 'Pending',
        email: email2,
        mobilePhone: '5550002002',
        streetAddress: '200 Pending Ave',
        city: 'Tampa',
        state: 'FL',
        zipCode: '33601',
        serviceAddress: '200 Pending Ave, Tampa, FL 33601',
        stage: 'converted',
        accountStatus: 'active',
        activationPaymentStatus: 'pending',
        agreementsAccepted: false,
        poolType: 'in_ground',
        poolSurface: 'concrete',
        filterType: 'sand',
        sanitizerType: 'tablets',
        screenedArea: 'fully_screened',
        preferredContact: 'text',
      });
      results.ids.pendingLeadId = lead2.id;
    } catch (e) {
      results.errors.push({ step: 'pending_persona', error: e.message });
    }

    // ----------------------------------------------------------------
    // PERSONA 3: Fecal Incident Customer
    // ----------------------------------------------------------------
    try {
      const email3 = `test.customer3.${ts}@breezpoolcare.com`;

      const lead3 = await db.entities.Lead.create({
        firstName: 'Frank',
        lastName: 'Fecal',
        email: email3,
        mobilePhone: '5550003003',
        streetAddress: '300 Incident Rd',
        city: 'Tampa',
        state: 'FL',
        zipCode: '33601',
        serviceAddress: '300 Incident Rd, Tampa, FL 33601',
        stage: 'converted',
        accountStatus: 'active',
        activationPaymentStatus: 'paid',
        agreementsAccepted: true,
        agreementsAcceptedAt: new Date().toISOString(),
        poolType: 'in_ground',
        poolSurface: 'concrete',
        filterType: 'cartridge',
        sanitizerType: 'saltwater',
        screenedArea: 'fully_screened',
        preferredContact: 'phone',
      });
      results.ids.fecalLeadId = lead3.id;

      // FecalIncident
      try {
        const incident = await db.entities.FecalIncident.create({
          leadId: lead3.id,
          reportedAt: new Date().toISOString(),
          incidentType: 'formed_stool',
          status: 'open',
          anyoneSwamSince: false,
          adminAlertSent: false,
          notes: '[TEST SEED] Open fecal incident for UX testing',
        });
        results.ids.fecalIncidentId = incident.id;
      } catch (e) {
        results.errors.push({ step: 'fecal_incident_create', error: e.message });
        results.notes.push(
          'FecalIncident create failed — check RLS: service role may need create permission on FecalIncident entity.'
        );
      }
    } catch (e) {
      results.errors.push({ step: 'fecal_persona', error: e.message });
    }

    results.success = true;
    results.notes.push(
      'Technician persona: manually invite test.tech1@breezpoolcare.com via Dashboard, set role=technician.'
    );

    return Response.json(results, { status: 200 });

  } catch (e) {
    results.errors.push({ step: 'top_level', error: e.message });
    return Response.json(results, { status: 200 });
  }
});