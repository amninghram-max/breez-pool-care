import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * computeChemistryRiskScore30d
 * Sums severity points of all active (non-expired) ChemistryRiskEvents
 * for a given pool within a 30-day rolling window ending at asOfDate.
 *
 * Also updates Pool.lastRiskScore (non-authoritative UI cache).
 *
 * Input:  { poolId: string, asOfDate: string (ISO) }
 * Output: { poolId, asOfDate, totalScore, eventCount, events[] }
 */

// Fixed severity taxonomy — event type defines severity, no overrides allowed
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

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || !['admin', 'staff', 'technician'].includes(user.role)) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { poolId, asOfDate } = await req.json();

    if (!poolId || !asOfDate) {
      return Response.json({ error: 'poolId and asOfDate are required' }, { status: 400 });
    }

    const asOf = new Date(asOfDate);
    if (isNaN(asOf.getTime())) {
      return Response.json({ error: 'Invalid asOfDate' }, { status: 400 });
    }

    const windowStart = new Date(asOf.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const windowEnd = asOf.toISOString();

    console.log(`computeChemistryRiskScore30d: poolId=${poolId}, window=${windowStart} → ${windowEnd}`);

    // Fetch all events for this pool in the window that haven't expired
    const allEvents = await base44.asServiceRole.entities.ChemistryRiskEvent.filter({ poolId });

    // Filter client-side: active events within the 30-day window
    const activeEvents = allEvents.filter(e => {
      const created = new Date(e.createdDate);
      const expires = new Date(e.expiresAt);
      return created >= new Date(windowStart) &&
             created <= new Date(windowEnd) &&
             expires > asOf;
    });

    // Enforce fixed severity from taxonomy — ignore any stored severityPoints
    let totalScore = 0;
    const eventDetails = activeEvents.map(e => {
      const canonicalSeverity = SEVERITY_MAP[e.eventType] ?? 0;
      totalScore += canonicalSeverity;
      return {
        id: e.id,
        eventType: e.eventType,
        severityPoints: canonicalSeverity,
        triggerValue: e.triggerValue,
        thresholdValue: e.thresholdValue,
        createdDate: e.createdDate,
        expiresAt: e.expiresAt
      };
    });

    // Update non-authoritative UI cache on Pool
    await base44.asServiceRole.entities.Pool.update(poolId, {
      lastRiskScore: totalScore,
      lastTestDate: windowEnd
    }).catch(err => console.warn('Failed to update Pool cache:', err.message));

    console.log(`Score for ${poolId}: ${totalScore} (${activeEvents.length} active events)`);

    return Response.json({
      poolId,
      asOfDate,
      windowStart,
      windowEnd,
      totalScore,
      eventCount: activeEvents.length,
      events: eventDetails
    });

  } catch (error) {
    console.error('computeChemistryRiskScore30d error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});