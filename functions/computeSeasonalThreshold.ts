import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * computeSeasonalThreshold
 * Computes the effective frequency recommendation threshold for a given date.
 * ONLY applies seasonal offset to the recommendation threshold.
 * Does NOT modify chemistry targets (Phase 1 invariant).
 *
 * AdminSettings.seasonalPeriods format:
 * [{ name: string, startMonth: 1-12, endMonth: 1-12, riskThresholdOffset: number }]
 *
 * Input:  { asOfDate: string (ISO) }
 * Output: { asOfDate, seasonName, baseThreshold, seasonalOffset, effectiveThreshold }
 */

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || !['admin', 'staff', 'technician'].includes(user.role)) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { asOfDate } = await req.json();
    if (!asOfDate) {
      return Response.json({ error: 'asOfDate is required' }, { status: 400 });
    }

    const asOf = new Date(asOfDate);
    if (isNaN(asOf.getTime())) {
      return Response.json({ error: 'Invalid asOfDate' }, { status: 400 });
    }

    // Load latest AdminSettings (append-only — latest = most recent)
    const rows = await base44.asServiceRole.entities.AdminSettings.list('-created_date', 1);
    const settings = rows[0];

    if (!settings) {
      return Response.json({ error: 'AdminSettings not found' }, { status: 503 });
    }

    // frequencyLogic contains the base recommendation threshold
    let baseThreshold = 10; // safe default
    let frequencyLogic = null;
    if (settings.frequencyLogic) {
      try {
        frequencyLogic = JSON.parse(settings.frequencyLogic);
        baseThreshold = frequencyLogic.recommendation_threshold ?? frequencyLogic.auto_require_threshold ?? 10;
      } catch (e) {
        console.warn('Failed to parse frequencyLogic:', e.message);
      }
    }

    // Parse seasonal periods
    let seasonalPeriods = [];
    if (settings.seasonalPeriods) {
      try {
        seasonalPeriods = JSON.parse(settings.seasonalPeriods);
      } catch (e) {
        console.warn('Failed to parse seasonalPeriods:', e.message);
      }
    }

    // Determine active season — month is 1-indexed
    const currentMonth = asOf.getMonth() + 1;
    let matchedSeason = null;

    for (const period of seasonalPeriods) {
      const { startMonth, endMonth } = period;
      // Handle year-wrap (e.g., Dec-Feb)
      const inRange = startMonth <= endMonth
        ? currentMonth >= startMonth && currentMonth <= endMonth
        : currentMonth >= startMonth || currentMonth <= endMonth;

      if (inRange) {
        matchedSeason = period;
        break;
      }
    }

    const seasonalOffset = matchedSeason?.riskThresholdOffset ?? 0;
    const effectiveThreshold = baseThreshold + seasonalOffset;

    console.log(`computeSeasonalThreshold: month=${currentMonth}, base=${baseThreshold}, offset=${seasonalOffset}, effective=${effectiveThreshold}`);

    return Response.json({
      asOfDate,
      seasonName: matchedSeason?.name ?? null,
      baseThreshold,
      seasonalOffset,
      effectiveThreshold
    });

  } catch (error) {
    console.error('computeSeasonalThreshold error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});