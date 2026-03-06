import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

/**
 * seedTestRunV1
 * Creates tagged test records for the public quote / schedule flow.
 * Idempotent: returns existing records if testRunId was already seeded.
 *
 * Input:  { testRunId: string }
 * Output: { success, testRunId, created, scenarios, build, runtimeVersion, requestId }
 */

const BUILD = "SEED-V1-2026-03-06-A";

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

    // --- Idempotency check: look for existing leads for this testRunId ---
    const existingLeads = await entities.Lead.filter({ isTest: true, testRunId: runId }, null, 10);
    if (existingLeads && existingLeads.length >= 2) {
      const normalLead = existingLeads.find(l => l.email === `test+${runId}@breezpoolcare.com`);
      const repairLead = existingLeads.find(l => l.email === `repair+${runId}@breezpoolcare.com`);
      console.log('SEED_V1_ALREADY_SEEDED', { requestId, runId });
      return json200({
        success: true,
        testRunId: runId,
        created: false,
        scenarios: {
          normal: {
            leadId: normalLead?.id || null,
            token: `test-token-${runId}-A`,
            email: `test+${runId}@breezpoolcare.com`
          },
          repair: {
            leadId: repairLead?.id || null,
            token: `test-token-${runId}-B`,
            email: `repair+${runId}@breezpoolcare.com`
          }
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
      token: `test-token-${runId}-A`,
      leadId: normalLead.id,
      email: `test+${runId}@breezpoolcare.com`,
      firstName: 'Test',
      status: 'SENT'
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
      token: `test-token-${runId}-B`,
      email: 'guest@breezpoolcare.com',
      status: 'SENT'
      // leadId intentionally omitted
      // firstName intentionally omitted
    });

    // Quote linked by quoteToken so the repair function can find it
    await entities.Quote.create({
      isTest: true,
      testRunId: runId,
      quoteToken: `test-token-${runId}-B`,
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

    console.log('SEED_V1_CREATED', { requestId, runId, normalLeadId: normalLead.id, repairLeadId: repairLead.id });

    return json200({
      success: true,
      testRunId: runId,
      created: true,
      scenarios: {
        normal: {
          leadId: normalLead.id,
          token: `test-token-${runId}-A`,
          email: `test+${runId}@breezpoolcare.com`
        },
        repair: {
          leadId: repairLead.id,
          token: `test-token-${runId}-B`,
          email: `repair+${runId}@breezpoolcare.com`
        }
      },
      ...meta
    });
  } catch (error) {
    console.error('SEED_V1_CRASH', { requestId, error: error?.message });
    return json200({ success: false, error: 'Seed failed', detail: error?.message, ...meta });
  }
});