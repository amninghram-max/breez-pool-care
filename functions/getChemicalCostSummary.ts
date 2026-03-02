import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * CHEMICAL COST SUMMARY ANALYTICS
 * MVP endpoint for per-visit chemical cost aggregation.
 * Queries ServiceVisit.chemicalCostCents persisted by processServiceVisit.
 * 
 * Admin-only. Deterministic grouping by day/week/technician/customer.
 * No Lead joins in this MVP (customer reporting via leadId only).
 */

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    // AuthZ: admin only (consistent with getAnalyticsData.js)
    if (!user || user.role !== 'admin') {
      return Response.json({
        success: false,
        error: 'Unauthorized'
      }, { status: 403 });
    }

    // Parse and validate input
    let body;
    try {
      body = await req.json();
    } catch (e) {
      return Response.json({
        success: false,
        error: 'Invalid JSON body'
      }, { status: 400 });
    }

    const { dateFrom, dateTo, groupBy } = body;

    // Required field validation
    if (!dateFrom || !dateTo) {
      return Response.json({
        success: false,
        error: 'dateFrom and dateTo (ISO date/datetime strings) are required'
      }, { status: 400 });
    }

    // Parse dates
    const from = new Date(dateFrom);
    const to = new Date(dateTo);

    if (isNaN(from.getTime()) || isNaN(to.getTime())) {
      return Response.json({
        success: false,
        error: 'dateFrom and dateTo must be valid ISO dates or datetimes'
      }, { status: 400 });
    }

    if (from > to) {
      return Response.json({
        success: false,
        error: 'dateFrom must be <= dateTo'
      }, { status: 400 });
    }

    // Validate groupBy
    const validGroupBy = ['all', 'day', 'week', 'tech', 'customer'];
    const groupByValue = groupBy || 'all';
    if (!validGroupBy.includes(groupByValue)) {
      return Response.json({
        success: false,
        error: `groupBy must be one of: ${validGroupBy.join(', ')}`
      }, { status: 400 });
    }

    // Fetch ServiceVisit records with visitDate in range
    // Inclusive start, exclusive end: dateFrom <= visitDate < dateTo
    const visits = await base44.asServiceRole.entities.ServiceVisit.filter({
      visitDate: {
        $gte: dateFrom,
        $lt: dateTo
      }
    }, '-visitDate', 200); // Fetch up to 200, sorted by visitDate desc

    // Aggregate data
    let totalVisits = 0;
    let totalChemicalCostCents = 0;
    let skippedRecords = 0;
    const groupMap = {};

    for (const visit of visits) {
      // Validate visitDate
      const visitDate = new Date(visit.visitDate);
      if (isNaN(visitDate.getTime())) {
        console.warn(`[getChemicalCostSummary] Skipping visit ${visit.id}: invalid visitDate`);
        skippedRecords++;
        continue;
      }

      totalVisits++;
      // Treat missing chemicalCostCents as 0
      const costCents = visit.chemicalCostCents ?? 0;
      totalChemicalCostCents += costCents;

      // Group aggregation (if not 'all')
      if (groupByValue !== 'all') {
        let groupKey;

        if (groupByValue === 'day') {
          // YYYY-MM-DD
          groupKey = visitDate.toISOString().split('T')[0];
        } else if (groupByValue === 'week') {
          // ISO week: YYYY-Www
          // Algorithm: find Monday of week, then calculate week number from Jan 4
          groupKey = getISOWeek(visitDate);
        } else if (groupByValue === 'tech') {
          // Technician name or 'Unknown'
          groupKey = visit.technicianName || 'Unknown';
        } else if (groupByValue === 'customer') {
          // Lead/property ID
          groupKey = visit.propertyId || 'Unknown';
        }

        if (!groupMap[groupKey]) {
          groupMap[groupKey] = { visitCount: 0, totalCostCents: 0 };
        }
        groupMap[groupKey].visitCount++;
        groupMap[groupKey].totalCostCents += costCents;
      }
    }

    // Compute overall average
    const avgChemicalCostCents = totalVisits > 0
      ? Math.round(totalChemicalCostCents / totalVisits)
      : 0;

    // Build response rows
    const rows = [];
    if (groupByValue !== 'all') {
      for (const [key, data] of Object.entries(groupMap)) {
        rows.push({
          key,
          visitCount: data.visitCount,
          totalChemicalCostCents: data.totalCostCents,
          avgChemicalCostCents: Math.round(data.totalCostCents / data.visitCount)
        });
      }
      // Sort rows by key for determinism
      rows.sort((a, b) => String(a.key).localeCompare(String(b.key)));
    }

    return Response.json({
      success: true,
      summary: {
        totalVisits,
        totalChemicalCostCents,
        avgChemicalCostCents
      },
      groupBy: groupByValue,
      rows,
      skippedRecords
    });

  } catch (error) {
    console.error('[getChemicalCostSummary] Error:', error);
    return Response.json({
      success: false,
      error: error.message || 'Internal server error'
    }, { status: 500 });
  }
});

/**
 * Calculate ISO week number for a date.
 * Returns format: YYYY-Www (e.g., "2026-W01")
 * 
 * ISO week: Monday is day 1, week 1 contains Jan 4.
 */
function getISOWeek(date) {
  // Convert to UTC date
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  
  // Get day of week (1=Monday, 7=Sunday)
  const dayNum = d.getUTCDay() || 7;
  
  // Move to Monday of that week
  d.setUTCDate(d.getUTCDate() - dayNum + 1);
  const weekStart = new Date(d);
  
  // Get the year of the week start
  const year = weekStart.getUTCFullYear();
  
  // Jan 4 of the week's year always falls in week 1
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4day = jan4.getUTCDay() || 7;
  jan4.setUTCDate(jan4.getUTCDate() - jan4day + 1);
  
  // Calculate week number
  const weekNum = Math.ceil((weekStart - jan4) / (7 * 24 * 60 * 60 * 1000)) + 1;
  
  return `${year}-W${String(weekNum).padStart(2, '0')}`;
}