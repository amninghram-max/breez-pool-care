import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

/**
 * seedMelbourneSchedulingTestData
 *
 * Seed Melbourne, Florida scheduling test data for provider/admin QA.
 * Demonstrates multi-stop same-tech same-day service routing.
 * Idempotent via seedId.
 *
 * Input:  { seedId, customerCount?, startDate? }
 * Output: { success, seedId, created, existing }
 *
 * Access: SEED_KEY header OR authenticated admin
 * RLS: Uses service-role entity writes throughout (no RLS bypass — respects entity constraints)
 */

const BUILD = "SEED_MELBOURNE_SCHEDULING_V1_2026_03_07";

const MELBOURNE_ADDRESSES = [
  { street: "123 Palm Avenue", city: "Melbourne", state: "FL", zip: "32901", lat: 28.0729, lon: -80.6084 },
  { street: "456 Ocean Drive", city: "Melbourne", state: "FL", zip: "32935", lat: 28.0847, lon: -80.6094 },
  { street: "789 Riverside Drive", city: "Melbourne", state: "FL", zip: "32901", lat: 28.0629, lon: -80.6234 },
  { street: "321 Harbor Boulevard", city: "Melbourne", state: "FL", zip: "32940", lat: 28.1329, lon: -80.6084 },
  { street: "654 Pinewood Lane", city: "Melbourne", state: "FL", zip: "32934", lat: 28.0529, lon: -80.5984 },
  { street: "987 Pelican Street", city: "Melbourne", state: "FL", zip: "32901", lat: 28.0829, lon: -80.6184 },
  { street: "111 Sunrise Court", city: "Melbourne", state: "FL", zip: "32935", lat: 28.1029, lon: -80.5934 },
  { street: "222 Sunset Road", city: "Melbourne", state: "FL", zip: "32940", lat: 28.0429, lon: -80.6284 },
];

Deno.serve(async (req) => {
  const requestId = crypto.randomUUID();

  try {
    // --- Authorization ---
    const base44 = createClientFromRequest(req);
    const SEED_KEY = Deno.env.get('SEED_KEY');
    const providedKey = req.headers.get('X-Seed-Key');

    let isAuthorized = false;

    if (SEED_KEY && providedKey === SEED_KEY) {
      isAuthorized = true;
    }

    if (!isAuthorized) {
      try {
        const user = await base44.auth.me();
        if (user?.role === 'admin') {
          isAuthorized = true;
        }
      } catch (_) {
        // not authenticated
      }
    }

    if (!isAuthorized) {
      return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const payload = await req.json();
    const { seedId, customerCount = 60, startDate } = payload || {};

    if (!seedId || typeof seedId !== 'string' || !seedId.trim()) {
      return Response.json({
        success: false,
        error: 'seedId is required (string)',
      }, { status: 400 });
    }

    const entities = base44.asServiceRole.entities;
    const trimmedSeedId = seedId.trim();

    // Determine start date (today if not provided)
    let baseDateStr;
    if (startDate && typeof startDate === 'string') {
      baseDateStr = startDate;
    } else {
      baseDateStr = new Date().toISOString().split('T')[0];
    }

    console.log('[seedMelbourneSchedulingTestData] START', { requestId, seedId: trimmedSeedId, baseDateStr });

    const created = {
      techniciansAdded: 0,
      leadsCreated: 0,
      serviceEventsCreated: 0,
      inspectionEventsCreated: 0,
      inspectionRecordsCreated: 0,
    };

    const existing = {
      leadsSkipped: 0,
      serviceEventsSkipped: 0,
      inspectionEventsSkipped: 0,
    };

    // --- 1. Ensure Technicians ---
    console.log('[seedMelbourneSchedulingTestData] TECHNICIAN_SYNC');
    const requiredTechs = [
      { name: 'Matt', email: 'matt@test.breezpoolcare.com', phone: '3215550100', active: true },
      { name: 'Sarah', email: 'sarah@test.breezpoolcare.com', phone: '3215550200', active: true },
    ];

    let settings = await entities.SchedulingSettings.filter({ settingKey: 'default' }, null, 1);
    const existingTechs = settings && settings.length > 0 ? settings[0].technicians || [] : [];

    const existingTechNames = new Set(existingTechs.map(t => t.name));
    const techsToAdd = requiredTechs.filter(t => !existingTechNames.has(t.name));

    if (techsToAdd.length > 0) {
      const mergedTechs = [...existingTechs, ...techsToAdd];

      if (settings && settings.length > 0) {
        // Update existing
        await entities.SchedulingSettings.update(settings[0].id, { technicians: mergedTechs });
      } else {
        // Create new default
        await entities.SchedulingSettings.create({
          settingKey: 'default',
          technicians: mergedTechs,
        });
      }

      created.techniciansAdded = techsToAdd.length;
      console.log('[seedMelbourneSchedulingTestData] TECHNICIANS_ADDED', { count: techsToAdd.length });
    }

    // --- 2. Seed Leads (Melbourne, Florida) ---
    console.log('[seedMelbourneSchedulingTestData] LEADS_SYNC');
    const finalCustomerCount = Math.min(customerCount, 60);

    for (let i = 0; i < finalCustomerCount; i++) {
      const addr = MELBOURNE_ADDRESSES[i % MELBOURNE_ADDRESSES.length];
      const deterministicEmail = `melbtest-${trimmedSeedId}-${i}@breezpoolcare.com`;

      // Idempotent check
      const existing = await entities.Lead.filter({ email: deterministicEmail }, null, 1);
      if (existing && existing.length > 0) {
        existing.existing.leadsSkipped++;
        continue;
      }

      const lead = await entities.Lead.create({
        firstName: `Cust${i}`,
        lastName: `Melb${trimmedSeedId.substring(0, 5)}`,
        email: deterministicEmail,
        mobilePhone: `321555${String(i).padStart(4, '0')}`,
        streetAddress: addr.street,
        city: addr.city,
        state: addr.state,
        zipCode: addr.zip,
        serviceAddress: `${addr.street}, ${addr.city}, ${addr.state} ${addr.zip}`,
        stage: 'converted',
        accountStatus: 'active',
        poolType: 'in_ground',
        filterType: i % 2 === 0 ? 'sand' : 'cartridge',
        sanitizerType: i % 3 === 0 ? 'saltwater' : 'tablets',
        screenedArea: 'fully_screened',
        preferredContact: 'email',
        notes: `[TEST SEED] Melbourne scheduling test data (seedId: ${trimmedSeedId})`,
      });

      created.leadsCreated++;
    }

    console.log('[seedMelbourneSchedulingTestData] LEADS_CREATED', { count: created.leadsCreated });

    // --- 3. Seed Service Events (Multi-stop routes) ---
    console.log('[seedMelbourneSchedulingTestData] SERVICE_EVENTS_SYNC');

    // Fetch all seeded leads
    const allLeads = await entities.Lead.filter(
      { notes: { $regex: `seedId: ${trimmedSeedId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}` } },
      '-created_date',
      finalCustomerCount + 10
    );

    if (allLeads && allLeads.length > 0) {
      const serviceRoutes = [
        {
          date: baseDateStr,
          tech: 'Matt',
          count: 8,
          positions: Array.from({ length: 8 }, (_, i) => i + 1),
        },
        {
          date: baseDateStr,
          tech: 'Sarah',
          count: 7,
          positions: Array.from({ length: 7 }, (_, i) => i + 1),
        },
        {
          date: addDays(baseDateStr, 1),
          tech: 'Matt',
          count: 6,
          positions: Array.from({ length: 6 }, (_, i) => i + 1),
        },
        {
          date: addDays(baseDateStr, 1),
          tech: 'Sarah',
          count: 5,
          positions: Array.from({ length: 5 }, (_, i) => i + 1),
        },
        {
          date: addDays(baseDateStr, 3),
          tech: 'Matt',
          count: 4,
          positions: Array.from({ length: 4 }, (_, i) => i + 1),
        },
        {
          date: addDays(baseDateStr, 3),
          tech: 'Sarah',
          count: 4,
          positions: Array.from({ length: 4 }, (_, i) => i + 1),
        },
      ];

      let leadIdx = 0;

      for (const route of serviceRoutes) {
        for (let pos = 0; pos < route.count; pos++) {
          if (leadIdx >= allLeads.length) break;

          const lead = allLeads[leadIdx % allLeads.length];
          leadIdx++;

          // Idempotent check: unique combo of seedId + lead + date + tech + position
          const eventNote = `[TEST] ${trimmedSeedId} ${route.date} ${route.tech} ${pos + 1}`;
          const existing = await entities.CalendarEvent.filter(
            {
              leadId: lead.id,
              scheduledDate: route.date,
              assignedTechnician: route.tech,
              routePosition: pos + 1,
              eventType: 'service',
            },
            null,
            1
          );

          if (existing && existing.length > 0) {
            existing.existing.serviceEventsSkipped++;
            continue;
          }

          // Special cases for DayView testing
          let status = 'scheduled';
          let isFixed = false;

          if (route.tech === 'Matt' && route.date === baseDateStr && pos === 0) {
            // First Matt event: fixed
            isFixed = true;
          } else if (route.tech === 'Sarah' && route.date === baseDateStr && pos === 2) {
            // Sarah's 3rd event: cancelled (for cancelled display testing)
            status = 'cancelled';
          }

          await entities.CalendarEvent.create({
            leadId: lead.id,
            eventType: 'service',
            scheduledDate: route.date,
            serviceAddress: lead.serviceAddress,
            assignedTechnician: route.tech,
            status: status,
            routePosition: pos + 1,
            estimatedDuration: 30,
            isFixed: isFixed,
            isRecurring: true,
            notes: eventNote,
            accessNotes: `Test access for ${lead.firstName}`,
            customerNotes: 'Test service event',
          });

          created.serviceEventsCreated++;
        }

        if (leadIdx >= allLeads.length) break;
      }
    }

    console.log('[seedMelbourneSchedulingTestData] SERVICE_EVENTS_CREATED', { count: created.serviceEventsCreated });

    // --- 4. Seed Inspection Events + InspectionRecords ---
    console.log('[seedMelbourneSchedulingTestData] INSPECTIONS_SYNC');

    const inspectionDates = [
      { date: baseDateStr, count: 3 },
      { date: addDays(baseDateStr, 1), count: 2 },
    ];

    let inspLeadIdx = 0;

    for (const dateGroup of inspectionDates) {
      for (let i = 0; i < dateGroup.count; i++) {
        if (inspLeadIdx >= allLeads.length) break;

        const lead = allLeads[inspLeadIdx % allLeads.length];
        inspLeadIdx++;

        // Idempotent check
        const existingInsp = await entities.CalendarEvent.filter(
          {
            leadId: lead.id,
            scheduledDate: dateGroup.date,
            eventType: 'inspection',
          },
          null,
          1
        );

        if (existingInsp && existingInsp.length > 0) {
          existing.inspectionEventsSkipped++;
          continue;
        }

        // Create CalendarEvent
        const calEvent = await entities.CalendarEvent.create({
          leadId: lead.id,
          eventType: 'inspection',
          scheduledDate: dateGroup.date,
          serviceAddress: lead.serviceAddress,
          assignedTechnician: i % 2 === 0 ? 'Matt' : 'Sarah',
          status: 'scheduled',
          estimatedDuration: 45,
          notes: `[TEST] Inspection for ${lead.firstName}`,
        });

        created.inspectionEventsCreated++;

        // Create InspectionRecord
        await entities.InspectionRecord.create({
          leadId: lead.id,
          scheduledDate: dateGroup.date,
          startTime: '09:00',
          timeWindow: '9:00 AM - 11:00 AM',
          appointmentStatus: 'scheduled',
          calendarEventId: calEvent.id,
          confirmedPoolType: lead.poolType,
          confirmedEnclosure: lead.screenedArea,
          confirmedFilterType: lead.filterType,
          confirmedChlorinationMethod: lead.sanitizerType,
          confirmedPoolCondition: 'clear',
          customerPresent: true,
          finalizationStatus: 'pending_finalization',
          notes: `[TEST] Inspection record for ${lead.firstName}`,
        });

        created.inspectionRecordsCreated++;
      }
    }

    console.log('[seedMelbourneSchedulingTestData] INSPECTIONS_CREATED', {
      events: created.inspectionEventsCreated,
      records: created.inspectionRecordsCreated,
    });

    console.log('[seedMelbourneSchedulingTestData] DONE', { requestId, seedId: trimmedSeedId });

    return Response.json({
      success: true,
      seedId: trimmedSeedId,
      created,
      existing,
      build: BUILD,
    });

  } catch (error) {
    console.error('[seedMelbourneSchedulingTestData] CRASH', { requestId, error: error?.message });
    return Response.json({
      success: false,
      error: error.message || 'Seed failed',
    }, { status: 500 });
  }
});

// Helper: add N days to YYYY-MM-DD
function addDays(dateStr, days) {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split('T')[0];
}