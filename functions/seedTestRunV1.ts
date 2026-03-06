import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

/**
 * seedTestRunV1
 * Creates tagged test records for the public quote / schedule flow.
 * Idempotent: returns existing records if testRunId was already seeded.
 *
 * Input:  { testRunId: string }
 * Output: { success, testRunId, created, scenarios, build, runtimeVersion, requestId }
 */

const BUILD = "SEED-V1-2026-03-06-C";

// Canonical prequalAnswers for each scenario — used by finalizePrequalQuoteV2
const PREQUAL_NORMAL = {
  poolSize: '10_15k',
  poolType: 'in_ground',
  enclosure: 'fully_screened',
  filterType: 'sand',
  chlorinationMethod: 'saltwater',
  useFrequency: 'weekends',
  poolCondition: 'clear'
};

const PREQUAL_REPAIR = {
  poolSize: '15_20k',
  poolType: 'in_ground',
  enclosure: 'unscreened',
  filterType: 'cartridge',
  chlorinationMethod: 'tablets',
  useFrequency: 'daily',
  poolCondition: 'slightly_cloudy',
  treesOverhead: 'yes',
  petsAccess: true,
  petSwimFrequency: 'frequently'
};

const json200 = (data) => new Response(
  JSON.stringify(data),
  { status: 200, headers: { "content-type": "application/json; charset=utf-8" } }
);

Deno.serve(async (req) => {
  const requestId = crypto.randomUUID();
  const runtimeVersion = BUILD;
  const meta = { build: BUILD, runtimeVersion, requestId };

  try {
    const base44 = createClientFromRequest(req);
    const payload = await req.json();
    const { testRunId } = payload || {};

    if (!testRunId || typeof testRunId !== 'string' || !testRunId.trim()) {
      return json200({ success: false, code: 'MISSING_TEST_RUN_ID', error: 'testRunId is required', ...meta });
    }

    const runId = testRunId.trim();
    const entities = base44.asServiceRole.entities;

    // --- Idempotency check: token strings are deterministic and unique per runId ---
    const tokenA = `test-token-${runId}-A`;
    const tokenB = `test-token-${runId}-B`;
    const existingA = await entities.QuoteRequests.filter({ token: tokenA }, null, 1);
    const existingB = await entities.QuoteRequests.filter({ token: tokenB }, null, 1);

    if (existingA && existingA.length > 0 && existingB && existingB.length > 0) {
      const normalLeadId = existingA[0].leadId || null;
      const repairLeads = await entities.Lead.filter({ email: `repair+${runId}@breezpoolcare.com` }, null, 1);
      const repairLeadId = repairLeads?.[0]?.id || null;

      // Repair-in-place: patch prequalAnswers if missing on existing records
      const repairPatches = [];
      if (!existingA[0].prequalAnswers) {
        repairPatches.push(entities.QuoteRequests.update(existingA[0].id, { prequalAnswers: JSON.stringify(PREQUAL_NORMAL) }));
      }
      if (!existingB[0].prequalAnswers) {
        repairPatches.push(entities.QuoteRequests.update(existingB[0].id, { prequalAnswers: JSON.stringify(PREQUAL_REPAIR) }));
      }
      if (repairPatches.length > 0) {
        await Promise.all(repairPatches);
        console.log('SEED_V1_REPAIRED_PREQUAL', { requestId, runId, count: repairPatches.length });
      }

      console.log('SEED_V1_ALREADY_SEEDED', { requestId, runId });
      return json200({
        success: true,
        testRunId: runId,
        created: false,
        scenarios: {
          normal: { leadId: normalLeadId, token: tokenA, email: `test+${runId}@breezpoolcare.com`, prequalAnswers: PREQUAL_NORMAL },
          repair: { leadId: repairLeadId, token: tokenB, email: `repair+${runId}@breezpoolcare.com`, prequalAnswers: PREQUAL_REPAIR }
        },
        ...meta
      });
    }

    // --- Scenario A: Normal token path ---
    const normalLead = await entities.Lead.create({
      isTest: true,
      testRunId: runId,
      firstName: 'Test',
      email: `test+${runId}@breezpoolcare.com`,
      mobilePhone: '5551234567',
      stage: 'quote_sent',
      inspectionScheduled: false
    });

    await entities.QuoteRequests.create({
      isTest: true,
      testRunId: runId,
      token: tokenA,
      leadId: normalLead.id,
      email: `test+${runId}@breezpoolcare.com`,
      firstName: 'Test',
      status: 'SENT',
      prequalAnswers: JSON.stringify(PREQUAL_NORMAL)
    });

    // --- Scenario B: Repair fallback path ---
    const repairLead = await entities.Lead.create({
      isTest: true,
      testRunId: runId,
      firstName: 'Repair',
      email: `repair+${runId}@breezpoolcare.com`,
      mobilePhone: '5559876543',
      stage: 'quote_sent',
      inspectionScheduled: false
    });

    // QuoteRequests deliberately missing leadId and email to force repair path
    await entities.QuoteRequests.create({
      isTest: true,
      testRunId: runId,
      token: tokenB,
      email: 'guest@breezpoolcare.com',
      status: 'SENT',
      prequalAnswers: JSON.stringify(PREQUAL_REPAIR)
      // leadId intentionally omitted
      // firstName intentionally omitted
    });

    // Quote linked by quoteToken so the repair function can find it
    await entities.Quote.create({
      isTest: true,
      testRunId: runId,
      quoteToken: tokenB,
      leadId: repairLead.id,
      clientEmail: `repair+${runId}@breezpoolcare.com`,
      clientFirstName: 'Repair',
      status: 'quoted',
      outputMonthlyPrice: 99,
      outputPerVisitPrice: 49.5,
      outputOneTimeFees: 0,
      outputFirstMonthTotal: 99,
      outputFrequency: 'weekly',
      pricingEngineVersion: 'v2_tokens_risk_frequency'
    });

    // --- Scenario C: service_visit_ready ---
    // A converted customer with a Pool (no volumeGallons) and a scheduled service CalendarEvent.
    // This fixture is the entry point for full technician-flow testing.
    const visitLeadEmail = `visit+${runId}@breezpoolcare.com`;
    const visitLeadAddress = '100 Test Pool Lane, Tampa, FL 33601';

    const visitLead = await entities.Lead.create({
      isTest: true,
      testRunId: runId,
      firstName: 'VisitReady',
      lastName: 'TestC',
      email: visitLeadEmail,
      mobilePhone: '5550001234',
      streetAddress: '100 Test Pool Lane',
      city: 'Tampa',
      state: 'FL',
      zipCode: '33601',
      serviceAddress: visitLeadAddress,
      stage: 'converted',
      accountStatus: 'active',
      poolType: 'in_ground',
      filterType: 'sand',
      sanitizerType: 'saltwater',
      screenedArea: 'fully_screened',
      inspectionScheduled: true,
      quoteGenerated: true,
      notes: '[TEST FIXTURE C] service_visit_ready — safe to delete'
    });

    // Pool with no volumeGallons (tests estimate-path in chemistry engine)
    const visitPool = await entities.Pool.create({
      isTest: true,
      testRunId: runId,
      leadId: visitLead.id,
      surfaceType: 'CONCRETE_PLASTER',
      poolSize: '10_15k',
      poolType: 'in_ground',
      enclosure: 'fully_screened',
      filterType: 'sand',
      chlorinationMethod: 'saltwater',
      chlorinatorType: 'inline_plumbed',
      status: 'active'
      // volumeGallons intentionally omitted — tests null-volume estimate path
    });

    // CalendarEvent: scheduled service visit for today so it appears on the technician's route
    const todayDate = new Date().toISOString().split('T')[0];
    const visitEvent = await entities.CalendarEvent.create({
      isTest: true,
      testRunId: runId,
      leadId: visitLead.id,
      eventType: 'service',
      scheduledDate: todayDate,
      timeWindow: '9:00 AM - 11:00 AM',
      startTime: '09:00',
      serviceAddress: visitLeadAddress,
      assignedTechnician: 'Test Tech',
      status: 'scheduled',
      routePosition: 99,
      estimatedDuration: 35,
      isRecurring: false,
      accessNotes: '[TEST] No real access needed — fixture only',
      customerNotes: '[TEST FIXTURE C] service_visit_ready scenario'
    });

    console.log('SEED_V1_CREATED', {
      requestId, runId,
      normalLeadId: normalLead.id,
      repairLeadId: repairLead.id,
      visitLeadId: visitLead.id,
      visitPoolId: visitPool.id,
      visitEventId: visitEvent.id
    });

    return json200({
      success: true,
      testRunId: runId,
      created: true,
      scenarios: {
        normal: { leadId: normalLead.id, token: tokenA, email: `test+${runId}@breezpoolcare.com`, prequalAnswers: PREQUAL_NORMAL },
        repair: { leadId: repairLead.id, token: tokenB, email: `repair+${runId}@breezpoolcare.com`, prequalAnswers: PREQUAL_REPAIR },
        visit_ready: {
          label: 'Scenario C — service_visit_ready',
          leadId: visitLead.id,
          poolId: visitPool.id,
          eventId: visitEvent.id,
          email: visitLeadEmail,
          scheduledDate: todayDate,
          launchUrl: `/ServiceVisitFlow?eventId=${visitEvent.id}&poolId=${visitPool.id}`,
          notes: 'Pool has no volumeGallons — exercises estimate path. Appears on TechnicianRoute for today under assignedTechnician=Test Tech.'
        }
      },
      ...meta
    });
  } catch (error) {
    console.error('SEED_V1_CRASH', { requestId, error: error?.message });
    return json200({ success: false, error: 'Seed failed', detail: error?.message, ...meta });
  }
});