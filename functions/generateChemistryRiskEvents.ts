import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

/**
 * generateChemistryRiskEvents
 * Called after a ChemTestRecord is created.
 * Evaluates readings against AdminSettings targets/thresholds,
 * emits immutable ChemistryRiskEvent records, and updates
 * ChemTestRecord.outOfRange (derived field).
 *
 * Input:  { testRecordId: string }
 * Output: { eventsCreated: number, events: ChemistryRiskEvent[], outOfRange: string[] }
 */

// Derives outOfRange field names from a set of ChemistryRiskEvent records.
// Pure function — no DB writes.
function deriveOutOfRange(events) {
  const fieldMap = {
    LOW_FC: 'freeChlorine', LOW_FC_CRITICAL: 'freeChlorine', HIGH_FC: 'freeChlorine', HIGH_FC_CRITICAL: 'freeChlorine',
    LOW_PH: 'pH', LOW_PH_CRITICAL: 'pH', HIGH_PH: 'pH', HIGH_PH_CRITICAL: 'pH',
    LOW_TA: 'totalAlkalinity', HIGH_TA: 'totalAlkalinity',
    LOW_CYA: 'cyanuricAcid', HIGH_CYA: 'cyanuricAcid',
    LOW_CH: 'calciumHardness', HIGH_CH: 'calciumHardness',
    LOW_SALT: 'salt', HIGH_SALT: 'salt',
    CC_HIGH: 'combinedChlorine', CC_CRITICAL: 'combinedChlorine'
  };
  return [...new Set(events.map(e => fieldMap[e.eventType]).filter(Boolean))];
}

// Fixed severity taxonomy
const SEVERITY_MAP = {
  LOW_FC: 3,
  LOW_FC_CRITICAL: 5,
  HIGH_FC: 2,
  HIGH_FC_CRITICAL: 4,
  LOW_PH: 2,
  LOW_PH_CRITICAL: 4,
  HIGH_PH: 2,
  HIGH_PH_CRITICAL: 4,
  LOW_TA: 3,
  HIGH_TA: 2,
  LOW_CYA: 2,
  HIGH_CYA: 3,
  LOW_CH: 2,
  HIGH_CH: 2,
  LOW_SALT: 3,
  HIGH_SALT: 2,
  CC_HIGH: 4,
  CC_CRITICAL: 5,
  GREEN_ALGAE: 5
};

// Default thresholds — require AdminSettings to override
const DEFAULT_THRESHOLDS = {
  fc_min: 1.0,
  fc_critical_min: 0.5,
  fc_max: 5.0,
  fc_critical_max: 10.0,
  ph_min: 7.2,
  ph_critical_min: 6.8,
  ph_max: 7.8,
  ph_critical_max: 8.2,
  ta_min: 80,
  ta_max: 150,
  cya_min: 30,
  cya_max: 100,
  ch_min: 200,
  ch_max: 500,
  salt_min: 2500,
  salt_max: 4000,
  cc_high: 0.5,
  cc_critical: 1.0,
  event_expiry_days: 30
};

Deno.serve(async (req) => {
  try {
    console.log('[generateChemistryRiskEvents] START');
    const base44 = createClientFromRequest(req);
    console.log('[generateChemistryRiskEvents] CLIENT_READY');

    const user = await base44.auth.me();

    if (!user || !['admin', 'staff', 'technician'].includes(user.role)) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log('[generateChemistryRiskEvents] JSON_START');
    const { testRecordId, testRecord: providedTestRecord } = await req.json();
    console.log('[generateChemistryRiskEvents] JSON_DONE', { testRecordId, hasProvidedRecord: !!providedTestRecord });
    if (!testRecordId) {
      return Response.json({ error: 'testRecordId is required' }, { status: 400 });
    }

    // Use provided test record if valid, otherwise load from database
    console.log('[generateChemistryRiskEvents] TEST_RECORD_RESOLUTION_START');
    let test = null;
    if (providedTestRecord && providedTestRecord.id === testRecordId) {
      test = providedTestRecord;
      console.log('[generateChemistryRiskEvents] TEST_RECORD_USING_PROVIDED');
    } else {
      // Fallback: load from database (used for retests or idempotent re-invocations)
      console.log('[generateChemistryRiskEvents] TEST_RECORD_FALLBACK_LOAD_START');
      try {
        const filterResults = await base44.asServiceRole.entities.ChemTestRecord.filter({ id: testRecordId });
        test = filterResults[0] || null;
        console.log('[generateChemistryRiskEvents] TEST_RECORD_FALLBACK_LOAD_DONE', { found: !!test });
      } catch (e) {
        console.log('[generateChemistryRiskEvents] TEST_RECORD_FALLBACK_LOAD_ERROR', { error: e.message });
        // Swallow and continue to error
      }
    }

    if (!test) {
      return Response.json({ error: `ChemTestRecord not found for id: ${testRecordId}` }, { status: 404 });
    }
    console.log('[generateChemistryRiskEvents] TEST_RECORD_READY', { poolId: test.poolId, leadId: test.leadId });

    // Load pool to check chlorinationMethod for salt event gating
    console.log('[generateChemistryRiskEvents] LOAD_POOL_START');
    const pools = await base44.asServiceRole.entities.Pool.filter({ id: test.poolId });
    const pool = pools[0];
    if (!pool) {
      return Response.json({ error: 'Pool not found for this test record' }, { status: 404 });
    }
    console.log('[generateChemistryRiskEvents] LOAD_POOL_DONE', { chlorinationMethod: pool.chlorinationMethod });

    // Load AdminSettings (latest append-only record)
    console.log('[generateChemistryRiskEvents] TARGETS_START');
    const settingsRows = await base44.asServiceRole.entities.AdminSettings.list('-created_date', 1);
    const settings = settingsRows[0];

    if (!settings) {
      return Response.json({ error: 'AdminSettings not found. Cannot generate risk events.' }, { status: 503 });
    }

    // Parse chemistry thresholds from AdminSettings
    let thresholds = { ...DEFAULT_THRESHOLDS };
    if (settings.chemistryTargets) {
      try {
        const parsed = JSON.parse(settings.chemistryTargets);
        thresholds = { ...thresholds, ...parsed };
      } catch (e) {
        console.warn('Failed to parse AdminSettings.chemistryTargets, using defaults:', e.message);
      }
    }
    console.log('[generateChemistryRiskEvents] TARGETS_DONE', { usingDefaults: !settings.chemistryTargets });

    const expiryDays = thresholds.event_expiry_days || 30;
    const now = new Date(test.testDate);
    const expiresAt = new Date(now.getTime() + expiryDays * 24 * 60 * 60 * 1000).toISOString();
    console.log('[generateChemistryRiskEvents] ANALYZE_START', { fc: test.freeChlorine, pH: test.pH, ta: test.totalAlkalinity });

    const eventsToCreate = [];
    const outOfRange = [];

    function addEvent(eventType, triggerValue, thresholdValue) {
      eventsToCreate.push({
        poolId: test.poolId,
        leadId: test.leadId,
        testRecordId: test.id,
        eventType,
        severityPoints: SEVERITY_MAP[eventType],
        triggerValue,
        thresholdValue,
        createdDate: now.toISOString(),
        expiresAt
      });
    }

    const fc = test.freeChlorine;
    const ph = test.pH;
    const ta = test.totalAlkalinity;
    const cc = test.combinedChlorine;
    const cya = test.cyanuricAcid;
    const ch = test.calciumHardness;
    const salt = test.salt;

    // --- Free Chlorine ---
    if (fc !== null && fc !== undefined) {
      if (fc < thresholds.fc_critical_min) {
        addEvent('LOW_FC_CRITICAL', fc, thresholds.fc_critical_min);
        outOfRange.push('freeChlorine');
      } else if (fc < thresholds.fc_min) {
        addEvent('LOW_FC', fc, thresholds.fc_min);
        outOfRange.push('freeChlorine');
      } else if (fc > thresholds.fc_critical_max) {
        addEvent('HIGH_FC_CRITICAL', fc, thresholds.fc_critical_max);
        outOfRange.push('freeChlorine');
      } else if (fc > thresholds.fc_max) {
        addEvent('HIGH_FC', fc, thresholds.fc_max);
        outOfRange.push('freeChlorine');
      }
    }

    // --- pH ---
    if (ph !== null && ph !== undefined) {
      if (ph < thresholds.ph_critical_min) {
        addEvent('LOW_PH_CRITICAL', ph, thresholds.ph_critical_min);
        outOfRange.push('pH');
      } else if (ph < thresholds.ph_min) {
        addEvent('LOW_PH', ph, thresholds.ph_min);
        outOfRange.push('pH');
      } else if (ph > thresholds.ph_critical_max) {
        addEvent('HIGH_PH_CRITICAL', ph, thresholds.ph_critical_max);
        outOfRange.push('pH');
      } else if (ph > thresholds.ph_max) {
        addEvent('HIGH_PH', ph, thresholds.ph_max);
        outOfRange.push('pH');
      }
    }

    // --- Total Alkalinity ---
    if (ta !== null && ta !== undefined) {
      if (ta < thresholds.ta_min) {
        addEvent('LOW_TA', ta, thresholds.ta_min);
        outOfRange.push('totalAlkalinity');
      } else if (ta > thresholds.ta_max) {
        addEvent('HIGH_TA', ta, thresholds.ta_max);
        outOfRange.push('totalAlkalinity');
      }
    }

    // --- Combined Chlorine (CC) ---
    if (cc !== null && cc !== undefined) {
      if (cc > thresholds.cc_critical) {
        addEvent('CC_CRITICAL', cc, thresholds.cc_critical);
        outOfRange.push('combinedChlorine');
      } else if (cc > thresholds.cc_high) {
        addEvent('CC_HIGH', cc, thresholds.cc_high);
        outOfRange.push('combinedChlorine');
      }
    }

    // --- CYA ---
    if (cya !== null && cya !== undefined) {
      if (cya < thresholds.cya_min) {
        addEvent('LOW_CYA', cya, thresholds.cya_min);
        outOfRange.push('cyanuricAcid');
      } else if (cya > thresholds.cya_max) {
        addEvent('HIGH_CYA', cya, thresholds.cya_max);
        outOfRange.push('cyanuricAcid');
      }
    }

    // --- Calcium Hardness ---
    if (ch !== null && ch !== undefined) {
      if (ch < thresholds.ch_min) {
        addEvent('LOW_CH', ch, thresholds.ch_min);
        outOfRange.push('calciumHardness');
      } else if (ch > thresholds.ch_max) {
        addEvent('HIGH_CH', ch, thresholds.ch_max);
        outOfRange.push('calciumHardness');
      }
    }

    // --- Salt — only for saltwater pools ---
    if (pool.chlorinationMethod === 'saltwater' && salt !== null && salt !== undefined) {
      if (salt < thresholds.salt_min) {
        addEvent('LOW_SALT', salt, thresholds.salt_min);
        outOfRange.push('salt');
      } else if (salt > thresholds.salt_max) {
        addEvent('HIGH_SALT', salt, thresholds.salt_max);
        outOfRange.push('salt');
      }
    }
    console.log('[generateChemistryRiskEvents] ANALYZE_DONE', { eventsToCreateCount: eventsToCreate.length, outOfRangeCount: outOfRange.length });

    // Idempotency guard: load existing events for this testRecordId.
    // If any already exist, function was already run — return derived state without creating duplicates.
    console.log('[generateChemistryRiskEvents] DEDUPE_START');
    const existingEvents = await base44.asServiceRole.entities.ChemistryRiskEvent.filter({ testRecordId: test.id });
    console.log('[generateChemistryRiskEvents] DEDUPE_DONE', { existingCount: existingEvents.length });
    if (existingEvents.length > 0) {
      console.log(`generateChemistryRiskEvents: idempotency guard — ${existingEvents.length} events already exist for testRecord=${testRecordId}, skipping creation`);
      const derivedOutOfRange = deriveOutOfRange(existingEvents);
      return Response.json({
        testRecordId,
        poolId: test.poolId,
        eventsCreated: 0,
        idempotent: true,
        outOfRange: derivedOutOfRange,
        events: existingEvents.map(e => ({
          id: e.id,
          eventType: e.eventType,
          severityPoints: e.severityPoints,
          triggerValue: e.triggerValue,
          thresholdValue: e.thresholdValue,
          expiresAt: e.expiresAt
        }))
      });
    }

    // Create all events (first-time only — ChemTestRecord is never written to after creation)
    console.log('[generateChemistryRiskEvents] CREATE_EVENTS_START', { count: eventsToCreate.length });
    const createdEvents = [];
    for (const evt of eventsToCreate) {
      const created = await base44.asServiceRole.entities.ChemistryRiskEvent.create(evt);
      createdEvents.push(created);
    }
    console.log('[generateChemistryRiskEvents] CREATE_EVENTS_DONE', { createdCount: createdEvents.length });

    // outOfRange is derived from ChemistryRiskEvent records — never persisted on ChemTestRecord
    const uniqueOutOfRange = [...new Set(outOfRange)];

    console.log(`generateChemistryRiskEvents: ${createdEvents.length} events created for testRecord=${testRecordId}`);
    console.log('[generateChemistryRiskEvents] RETURN_SUCCESS');

    return Response.json({
      testRecordId,
      poolId: test.poolId,
      eventsCreated: createdEvents.length,
      outOfRange: uniqueOutOfRange,
      events: createdEvents.map(e => ({
        id: e.id,
        eventType: e.eventType,
        severityPoints: e.severityPoints,
        triggerValue: e.triggerValue,
        thresholdValue: e.thresholdValue,
        expiresAt: e.expiresAt
      }))
    });

  } catch (error) {
    console.error('generateChemistryRiskEvents error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});