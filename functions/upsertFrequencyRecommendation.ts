import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * upsertFrequencyRecommendation
 * Visit-based consecutive logic:
 * 1. Load recent ChemTestRecords for pool (descending by testDate)
 * 2. Batch-load all ChemistryRiskEvents for those tests (no N+1)
 * 3. Build scoreMap { testRecordId → totalScore }
 * 4. Walk descending tests — count consecutive visits >= effectiveThreshold
 * 5. Stop at first below-threshold visit
 * 6. Create or update FrequencyRecommendation
 * 7. Auto-dismiss only if: consecutiveCount < min AND currentScore < effectiveThreshold
 *
 * ADVISORY ONLY — does not mutate billing, contracts, or scheduling.
 *
 * Input:  { poolId: string, asOfDate: string, minVisitsAboveThreshold?: number }
 * Output: { created, recommendationId, status, riskScore, effectiveThreshold, consecutiveVisitsAbove }
 */

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || !['admin', 'staff'].includes(user.role)) {
      return Response.json({ error: 'Unauthorized — admin or staff only' }, { status: 403 });
    }

    const { poolId, asOfDate, minVisitsAboveThreshold = 3 } = await req.json();

    if (!poolId || !asOfDate) {
      return Response.json({ error: 'poolId and asOfDate are required' }, { status: 400 });
    }

    const asOf = new Date(asOfDate);
    if (isNaN(asOf.getTime())) {
      return Response.json({ error: 'Invalid asOfDate' }, { status: 400 });
    }

    // --- Step 1: computeSeasonalThreshold (inline to avoid extra round-trip) ---
    const settingsRows = await base44.asServiceRole.entities.AdminSettings.list('-created_date', 1);
    const settings = settingsRows[0];
    if (!settings) {
      return Response.json({ error: 'AdminSettings not found' }, { status: 503 });
    }

    let baseThreshold = 10;
    if (settings.frequencyLogic) {
      const fl = JSON.parse(settings.frequencyLogic);
      baseThreshold = fl.recommendation_threshold ?? fl.auto_require_threshold ?? 10;
    }

    let seasonalOffset = 0;
    if (settings.seasonalPeriods) {
      const periods = JSON.parse(settings.seasonalPeriods);
      const month = asOf.getMonth() + 1;
      for (const p of periods) {
        const inRange = p.startMonth <= p.endMonth
          ? month >= p.startMonth && month <= p.endMonth
          : month >= p.startMonth || month <= p.endMonth;
        if (inRange) { seasonalOffset = p.riskThresholdOffset ?? 0; break; }
      }
    }

    const effectiveThreshold = baseThreshold + seasonalOffset;

    // --- Step 2: computeChemistryRiskScore30d for current score ---
    const windowStart = new Date(asOf.getTime() - 30 * 24 * 60 * 60 * 1000);

    const SEVERITY_MAP = {
      LOW_FC: 3, LOW_FC_CRITICAL: 5, HIGH_FC: 2, HIGH_FC_CRITICAL: 4,
      LOW_PH: 2, LOW_PH_CRITICAL: 4, HIGH_PH: 2, HIGH_PH_CRITICAL: 4,
      LOW_TA: 3, HIGH_TA: 2, LOW_CYA: 2, HIGH_CYA: 3,
      LOW_CH: 2, HIGH_CH: 2, LOW_SALT: 3, HIGH_SALT: 2,
      CC_HIGH: 4, CC_CRITICAL: 5, GREEN_ALGAE: 5
    };

    const allActiveEvents = await base44.asServiceRole.entities.ChemistryRiskEvent.filter({ poolId });
    const activeEvents = allActiveEvents.filter(e =>
      new Date(e.createdDate) >= windowStart &&
      new Date(e.createdDate) <= asOf &&
      new Date(e.expiresAt) > asOf
    );
    const currentScore = activeEvents.reduce((sum, e) => sum + (SEVERITY_MAP[e.eventType] ?? 0), 0);

    // --- Step 3: Load recent test records — fetch more than min to have buffer ---
    const fetchLimit = minVisitsAboveThreshold * 3;
    const recentTests = await base44.asServiceRole.entities.ChemTestRecord.filter({ poolId });
    // Sort descending by testDate
    recentTests.sort((a, b) => new Date(b.testDate) - new Date(a.testDate));
    const candidateTests = recentTests.slice(0, fetchLimit);

    if (candidateTests.length === 0) {
      return Response.json({
        created: false,
        recommendationId: null,
        status: 'no_tests',
        riskScore: currentScore,
        effectiveThreshold,
        consecutiveVisitsAbove: 0,
        message: 'No test records found for this pool'
      });
    }

    // --- Step 4: Batch-load all risk events for candidate tests (no N+1) ---
    const testIds = candidateTests.map(t => t.id);
    const allEventsForCandidates = await base44.asServiceRole.entities.ChemistryRiskEvent.filter({ poolId });

    // Build scoreMap { testRecordId → totalSeverityPoints }
    const scoreMap = {};
    for (const testId of testIds) {
      scoreMap[testId] = 0;
    }
    for (const evt of allEventsForCandidates) {
      if (scoreMap.hasOwnProperty(evt.testRecordId)) {
        scoreMap[evt.testRecordId] += SEVERITY_MAP[evt.eventType] ?? 0;
      }
    }

    // --- Step 5: Walk descending — count consecutive visits >= threshold ---
    let consecutiveCount = 0;
    const qualifyingTestIds = [];

    for (const test of candidateTests) {
      const score = scoreMap[test.id] ?? 0;
      if (score >= effectiveThreshold) {
        consecutiveCount++;
        qualifyingTestIds.push(test.id);
      } else {
        break; // Stop at first below-threshold visit
      }
    }

    // --- Step 6: Load existing open recommendation for this pool ---
    const existingRecs = await base44.asServiceRole.entities.FrequencyRecommendation.filter({ poolId });
    const openRec = existingRecs.find(r =>
      r.status === 'pending_review' || r.status === 'monitoring'
    );

    const now = new Date().toISOString();
    let result;

    if (consecutiveCount >= minVisitsAboveThreshold) {
      // Threshold met — create or refresh recommendation
      if (openRec) {
        await base44.asServiceRole.entities.FrequencyRecommendation.update(openRec.id, {
          riskScore: currentScore,
          effectiveThreshold,
          consecutiveVisitsAbove: consecutiveCount,
          qualifyingTestRecordIds: qualifyingTestIds
        });
        result = { created: false, recommendationId: openRec.id, status: openRec.status };
        console.log(`Refreshed existing recommendation ${openRec.id}: consecutive=${consecutiveCount}`);
      } else {
        const newRec = await base44.asServiceRole.entities.FrequencyRecommendation.create({
          poolId,
          leadId: candidateTests[0]?.leadId ?? null,
          status: 'pending_review',
          riskScore: currentScore,
          effectiveThreshold,
          consecutiveVisitsAbove: consecutiveCount,
          qualifyingTestRecordIds: qualifyingTestIds,
          createdAt: now
        });
        result = { created: true, recommendationId: newRec.id, status: 'pending_review' };
        console.log(`Created new recommendation ${newRec.id}: consecutive=${consecutiveCount}`);
      }
    } else {
      // Below threshold — auto-dismiss ONLY if currentScore is also below threshold
      if (openRec && currentScore < effectiveThreshold) {
        await base44.asServiceRole.entities.FrequencyRecommendation.update(openRec.id, {
          status: 'dismissed',
          dismissalReason: 'risk_normalized',
          reviewedAt: now
        });
        result = { created: false, recommendationId: openRec.id, status: 'dismissed' };
        console.log(`Auto-dismissed recommendation ${openRec.id}: score=${currentScore} < threshold=${effectiveThreshold}`);
      } else {
        // Not enough visits but 30-day score still elevated — no action
        result = { created: false, recommendationId: openRec?.id ?? null, status: openRec?.status ?? 'none' };
        console.log(`No action: consecutive=${consecutiveCount} < min=${minVisitsAboveThreshold}, score=${currentScore}`);
      }
    }

    return Response.json({
      ...result,
      riskScore: currentScore,
      effectiveThreshold,
      consecutiveVisitsAbove: consecutiveCount,
      minVisitsAboveThreshold
    });

  } catch (error) {
    console.error('upsertFrequencyRecommendation error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});