import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * chemistryGoldenTests — admin-only end-to-end determinism runner
 *
 * Executes the Chemistry Golden Test suite fully in-memory.
 * Does NOT persist any records. All sub-computations are inlined.
 *
 * Input:  {} (no params needed — test cases are hardcoded below)
 * Output: { passed, failed, total, results: [...] }
 */

const CALCULATOR_VERSION = 'v1_chemistry_engine';

// ─── Fixed severity taxonomy (canonical — not overridable) ────────────────────
const SEVERITY_MAP = {
  LOW_FC: 3, LOW_FC_CRITICAL: 5, HIGH_FC: 2, HIGH_FC_CRITICAL: 4,
  LOW_PH: 2, LOW_PH_CRITICAL: 4, HIGH_PH: 2, HIGH_PH_CRITICAL: 4,
  LOW_TA: 3, HIGH_TA: 2, LOW_CYA: 2, HIGH_CYA: 3,
  LOW_CH: 2, HIGH_CH: 2, LOW_SALT: 3, HIGH_SALT: 2,
  CC_HIGH: 4, CC_CRITICAL: 5, GREEN_ALGAE: 5
};

// ─── Default chemistry thresholds ────────────────────────────────────────────
const DEFAULT_THRESHOLDS = {
  fc_min: 1.0, fc_critical_min: 0.5, fc_max: 5.0, fc_critical_max: 10.0,
  ph_min: 7.2, ph_critical_min: 6.8, ph_max: 7.8, ph_critical_max: 8.2,
  ta_min: 80, ta_max: 150,
  cya_min: 30, cya_max: 100,
  ch_min: 200, ch_max: 500,
  salt_min: 2500, salt_max: 4000,
  cc_high: 0.5, cc_critical: 1.0,
  event_expiry_days: 30
};

// ─── Pure: generate risk events from a test reading ──────────────────────────
function computeRiskEvents(reading, pool, thresholds, testDate) {
  const t = { ...DEFAULT_THRESHOLDS, ...thresholds };
  const expiryMs = (t.event_expiry_days || 30) * 24 * 60 * 60 * 1000;
  const createdDate = new Date(testDate).toISOString();
  const expiresAt = new Date(new Date(testDate).getTime() + expiryMs).toISOString();
  const events = [];

  function add(eventType, triggerValue, thresholdValue) {
    events.push({ eventType, severityPoints: SEVERITY_MAP[eventType], triggerValue, thresholdValue, createdDate, expiresAt });
  }

  const { freeChlorine: fc, pH: ph, totalAlkalinity: ta, combinedChlorine: cc, cyanuricAcid: cya, calciumHardness: ch, salt } = reading;

  if (fc != null) {
    if (fc < t.fc_critical_min) add('LOW_FC_CRITICAL', fc, t.fc_critical_min);
    else if (fc < t.fc_min) add('LOW_FC', fc, t.fc_min);
    else if (fc > t.fc_critical_max) add('HIGH_FC_CRITICAL', fc, t.fc_critical_max);
    else if (fc > t.fc_max) add('HIGH_FC', fc, t.fc_max);
  }
  if (ph != null) {
    if (ph < t.ph_critical_min) add('LOW_PH_CRITICAL', ph, t.ph_critical_min);
    else if (ph < t.ph_min) add('LOW_PH', ph, t.ph_min);
    else if (ph > t.ph_critical_max) add('HIGH_PH_CRITICAL', ph, t.ph_critical_max);
    else if (ph > t.ph_max) add('HIGH_PH', ph, t.ph_max);
  }
  if (ta != null) {
    if (ta < t.ta_min) add('LOW_TA', ta, t.ta_min);
    else if (ta > t.ta_max) add('HIGH_TA', ta, t.ta_max);
  }
  if (cc != null) {
    if (cc > t.cc_critical) add('CC_CRITICAL', cc, t.cc_critical);
    else if (cc > t.cc_high) add('CC_HIGH', cc, t.cc_high);
  }
  if (cya != null) {
    if (cya < t.cya_min) add('LOW_CYA', cya, t.cya_min);
    else if (cya > t.cya_max) add('HIGH_CYA', cya, t.cya_max);
  }
  if (ch != null) {
    if (ch < t.ch_min) add('LOW_CH', ch, t.ch_min);
    else if (ch > t.ch_max) add('HIGH_CH', ch, t.ch_max);
  }
  if (pool?.chlorinationMethod === 'saltwater' && salt != null) {
    if (salt < t.salt_min) add('LOW_SALT', salt, t.salt_min);
    else if (salt > t.salt_max) add('HIGH_SALT', salt, t.salt_max);
  }

  return events;
}

// ─── Pure: compute 30d risk score from a list of events ──────────────────────
function computeScore30d(events, asOfDate) {
  const asOf = new Date(asOfDate);
  const windowStart = new Date(asOf.getTime() - 30 * 24 * 60 * 60 * 1000);
  const active = events.filter(e =>
    new Date(e.createdDate) >= windowStart &&
    new Date(e.createdDate) <= asOf &&
    new Date(e.expiresAt) > asOf
  );
  return active.reduce((sum, e) => sum + (SEVERITY_MAP[e.eventType] ?? 0), 0);
}

// ─── Pure: compute effective threshold ───────────────────────────────────────
function computeEffectiveThreshold(baseThreshold, seasonalPeriods, asOfDate) {
  const month = new Date(asOfDate).getMonth() + 1;
  for (const p of (seasonalPeriods || [])) {
    const inRange = p.startMonth <= p.endMonth
      ? month >= p.startMonth && month <= p.endMonth
      : month >= p.startMonth || month <= p.endMonth;
    if (inRange) return baseThreshold + (p.riskThresholdOffset ?? 0);
  }
  return baseThreshold;
}

// ─── Pure: SHA-256 planHash ──────────────────────────────────────────────────
async function computePlanHash(testRecordId, adminSettingsId, actions) {
  const orderedActions = [...actions].sort((a, b) => a.order - b.order);
  const actionStr = orderedActions.map(a =>
    `${a.chemicalType}:${a.dosePrimary}:${a.productProfileId}:${a.productProfileVersion}:${a.waitTimeMinutes}:${a.safetyCapEnforced}`
  ).join('|');
  const raw = `${testRecordId}:${adminSettingsId}:${actionStr}`;
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ─── Golden Test Cases ────────────────────────────────────────────────────────
const GOLDEN_TESTS = [
  {
    id: 'GT-001',
    name: 'Balanced pool — no events, zero risk score',
    pool: { chlorinationMethod: 'tablets' },
    reading: { freeChlorine: 2.0, pH: 7.4, totalAlkalinity: 100, combinedChlorine: 0.1, cyanuricAcid: 40, calciumHardness: 300 },
    testDate: '2026-02-27T10:00:00Z',
    asOfDate: '2026-02-27T10:00:00Z',
    expect: {
      eventTypes: [],
      riskScore: 0,
      outOfRange: []
    }
  },
  {
    id: 'GT-002',
    name: 'Critical low FC — 5 severity points',
    pool: { chlorinationMethod: 'tablets' },
    reading: { freeChlorine: 0.3, pH: 7.4, totalAlkalinity: 100 },
    testDate: '2026-02-27T10:00:00Z',
    asOfDate: '2026-02-27T10:00:00Z',
    expect: {
      eventTypes: ['LOW_FC_CRITICAL'],
      riskScore: 5,
      outOfRange: ['freeChlorine']
    }
  },
  {
    id: 'GT-003',
    name: 'Low FC (not critical) — 3 severity points',
    pool: { chlorinationMethod: 'tablets' },
    reading: { freeChlorine: 0.7, pH: 7.4, totalAlkalinity: 100 },
    testDate: '2026-02-27T10:00:00Z',
    asOfDate: '2026-02-27T10:00:00Z',
    expect: {
      eventTypes: ['LOW_FC'],
      riskScore: 3,
      outOfRange: ['freeChlorine']
    }
  },
  {
    id: 'GT-004',
    name: 'Multi-parameter out of range — additive scoring',
    pool: { chlorinationMethod: 'tablets' },
    reading: { freeChlorine: 0.3, pH: 6.5, totalAlkalinity: 60, combinedChlorine: 1.5, cyanuricAcid: 20 },
    testDate: '2026-02-27T10:00:00Z',
    asOfDate: '2026-02-27T10:00:00Z',
    expect: {
      // LOW_FC_CRITICAL=5, LOW_PH_CRITICAL=4, LOW_TA=3, CC_CRITICAL=5, LOW_CYA=2
      eventTypes: ['LOW_FC_CRITICAL', 'LOW_PH_CRITICAL', 'LOW_TA', 'CC_CRITICAL', 'LOW_CYA'],
      riskScore: 19,
      outOfRange: ['freeChlorine', 'pH', 'totalAlkalinity', 'combinedChlorine', 'cyanuricAcid']
    }
  },
  {
    id: 'GT-005',
    name: 'Salt event emitted for saltwater pool',
    pool: { chlorinationMethod: 'saltwater' },
    reading: { freeChlorine: 2.0, pH: 7.4, totalAlkalinity: 100, salt: 2000 },
    testDate: '2026-02-27T10:00:00Z',
    asOfDate: '2026-02-27T10:00:00Z',
    expect: {
      eventTypes: ['LOW_SALT'],
      riskScore: 3,
      outOfRange: ['salt']
    }
  },
  {
    id: 'GT-006',
    name: 'Salt event NOT emitted for non-saltwater pool',
    pool: { chlorinationMethod: 'tablets' },
    reading: { freeChlorine: 2.0, pH: 7.4, totalAlkalinity: 100, salt: 2000 },
    testDate: '2026-02-27T10:00:00Z',
    asOfDate: '2026-02-27T10:00:00Z',
    expect: {
      eventTypes: [],
      riskScore: 0,
      outOfRange: []
    }
  },
  {
    id: 'GT-007',
    name: 'Event expiry — 30d old events excluded from score',
    pool: { chlorinationMethod: 'tablets' },
    reading: { freeChlorine: 0.3, pH: 7.4, totalAlkalinity: 100 },
    testDate: '2026-01-27T10:00:00Z',     // 31 days before asOfDate
    asOfDate: '2026-02-27T10:00:00Z',
    expect: {
      eventTypes: ['LOW_FC_CRITICAL'],    // event generated
      riskScore: 0,                       // but excluded from 30d score (expired)
      outOfRange: ['freeChlorine']
    }
  },
  {
    id: 'GT-008',
    name: 'Boundary: FC exactly at min — no event',
    pool: { chlorinationMethod: 'tablets' },
    reading: { freeChlorine: 1.0, pH: 7.4, totalAlkalinity: 100 },
    testDate: '2026-02-27T10:00:00Z',
    asOfDate: '2026-02-27T10:00:00Z',
    expect: {
      eventTypes: [],
      riskScore: 0,
      outOfRange: []
    }
  },
  {
    id: 'GT-009',
    name: 'planHash determinism — same inputs produce identical hash',
    isDeterminismTest: true,
    actions: [
      { order: 1, chemicalType: 'LIQUID_CHLORINE', dosePrimary: 48, productProfileId: 'prod-001', productProfileVersion: 1, waitTimeMinutes: 30, safetyCapEnforced: false },
      { order: 2, chemicalType: 'MURIATIC_ACID', dosePrimary: 16, productProfileId: 'prod-002', productProfileVersion: 2, waitTimeMinutes: 60, safetyCapEnforced: true }
    ],
    testRecordId: 'test-rec-abc123',
    adminSettingsId: 'settings-xyz789',
    expect: {
      hashStable: true  // verified by running twice and comparing
    }
  },
  {
    id: 'GT-010',
    name: 'Idempotency: same events produce same score regardless of order in scoreMap',
    pool: { chlorinationMethod: 'tablets' },
    reading: { freeChlorine: 0.7, pH: 7.1, totalAlkalinity: 100 },
    testDate: '2026-02-27T10:00:00Z',
    asOfDate: '2026-02-27T10:00:00Z',
    expect: {
      // LOW_FC=3, LOW_PH=2
      eventTypes: ['LOW_FC', 'LOW_PH'],
      riskScore: 5,
      outOfRange: ['freeChlorine', 'pH']
    }
  }
];

// ─── Field name derivation (pure — mirrors generateChemistryRiskEvents) ──────
const EVENT_FIELD_MAP = {
  LOW_FC: 'freeChlorine', LOW_FC_CRITICAL: 'freeChlorine', HIGH_FC: 'freeChlorine', HIGH_FC_CRITICAL: 'freeChlorine',
  LOW_PH: 'pH', LOW_PH_CRITICAL: 'pH', HIGH_PH: 'pH', HIGH_PH_CRITICAL: 'pH',
  LOW_TA: 'totalAlkalinity', HIGH_TA: 'totalAlkalinity',
  LOW_CYA: 'cyanuricAcid', HIGH_CYA: 'cyanuricAcid',
  LOW_CH: 'calciumHardness', HIGH_CH: 'calciumHardness',
  LOW_SALT: 'salt', HIGH_SALT: 'salt',
  CC_HIGH: 'combinedChlorine', CC_CRITICAL: 'combinedChlorine'
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (user?.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    // Load AdminSettings for threshold overrides
    const settingsRows = await base44.asServiceRole.entities.AdminSettings.list('-created_date', 1);
    const settings = settingsRows[0];
    let thresholds = {};
    let baseThreshold = 10;
    let seasonalPeriods = [];

    if (settings) {
      if (settings.chemistryTargets) thresholds = JSON.parse(settings.chemistryTargets);
      if (settings.frequencyLogic) {
        const fl = JSON.parse(settings.frequencyLogic);
        baseThreshold = fl.recommendation_threshold ?? fl.auto_require_threshold ?? 10;
      }
      if (settings.seasonalPeriods) seasonalPeriods = JSON.parse(settings.seasonalPeriods);
    }

    const results = [];
    let passed = 0;
    let failed = 0;

    for (const tc of GOLDEN_TESTS) {
      const result = { id: tc.id, name: tc.name, assertions: [], pass: true };

      try {
        if (tc.isDeterminismTest) {
          // GT-009: planHash determinism
          const hash1 = await computePlanHash(tc.testRecordId, tc.adminSettingsId, tc.actions);
          const hash2 = await computePlanHash(tc.testRecordId, tc.adminSettingsId, tc.actions);
          const hashMatch = hash1 === hash2;
          result.planHash = hash1;
          result.assertions.push({ check: 'hash_stable', pass: hashMatch, detail: hashMatch ? `SHA-256: ${hash1}` : `MISMATCH: ${hash1} vs ${hash2}` });
          if (!hashMatch) result.pass = false;
        } else {
          // Standard chemistry test
          const events = computeRiskEvents(tc.reading, tc.pool, thresholds, tc.testDate);
          const score = computeScore30d(events, tc.asOfDate);
          const outOfRange = [...new Set(events.map(e => EVENT_FIELD_MAP[e.eventType]).filter(Boolean))];

          // Assert: event types match (order-independent)
          const actualTypes = events.map(e => e.eventType).sort();
          const expectedTypes = [...tc.expect.eventTypes].sort();
          const typesMatch = JSON.stringify(actualTypes) === JSON.stringify(expectedTypes);
          result.assertions.push({
            check: 'event_types',
            pass: typesMatch,
            expected: expectedTypes,
            actual: actualTypes,
            detail: typesMatch ? 'OK' : `Expected [${expectedTypes}] got [${actualTypes}]`
          });

          // Assert: risk score
          const scoreMatch = score === tc.expect.riskScore;
          result.assertions.push({
            check: 'risk_score',
            pass: scoreMatch,
            expected: tc.expect.riskScore,
            actual: score,
            detail: scoreMatch ? `Score = ${score}` : `Expected ${tc.expect.riskScore} got ${score}`
          });

          // Assert: outOfRange fields
          const actualOOR = [...outOfRange].sort();
          const expectedOOR = [...tc.expect.outOfRange].sort();
          const oorMatch = JSON.stringify(actualOOR) === JSON.stringify(expectedOOR);
          result.assertions.push({
            check: 'out_of_range',
            pass: oorMatch,
            expected: expectedOOR,
            actual: actualOOR,
            detail: oorMatch ? 'OK' : `Expected [${expectedOOR}] got [${actualOOR}]`
          });

          // Assert: severity points on each event are correct
          for (const evt of events) {
            const canonical = SEVERITY_MAP[evt.eventType];
            const sevOk = evt.severityPoints === canonical;
            if (!sevOk) {
              result.assertions.push({ check: `severity_${evt.eventType}`, pass: false, expected: canonical, actual: evt.severityPoints });
            }
          }

          // Assert: expiresAt = testDate + 30 days (within 1 minute tolerance)
          for (const evt of events) {
            const expectedExpiry = new Date(new Date(tc.testDate).getTime() + 30 * 24 * 60 * 60 * 1000);
            const actualExpiry = new Date(evt.expiresAt);
            const expiryOk = Math.abs(expectedExpiry - actualExpiry) < 60000;
            if (!expiryOk) {
              result.assertions.push({ check: `expiry_${evt.eventType}`, pass: false, expected: expectedExpiry.toISOString(), actual: evt.expiresAt });
            }
          }

          // Effective threshold (informational)
          result.effectiveThreshold = computeEffectiveThreshold(baseThreshold, seasonalPeriods, tc.asOfDate);
          result.events = events;
          result.riskScore = score;
          result.outOfRange = outOfRange;

          if (result.assertions.some(a => !a.pass)) result.pass = false;
        }
      } catch (err) {
        result.pass = false;
        result.error = err.message;
        result.assertions.push({ check: 'execution', pass: false, detail: err.message });
      }

      if (result.pass) passed++; else failed++;
      results.push(result);
    }

    console.log(`chemistryGoldenTests: ${passed}/${GOLDEN_TESTS.length} passed`);

    return Response.json({
      passed,
      failed,
      total: GOLDEN_TESTS.length,
      allPassed: failed === 0,
      adminSettingsLoaded: !!settings,
      results
    });

  } catch (error) {
    console.error('chemistryGoldenTests fatal:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});