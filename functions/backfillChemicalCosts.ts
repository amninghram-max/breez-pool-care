import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { computeChemicalCostLines } from './_shared/chemicalCosting.js';

/**
 * ADMIN-ONLY: Backfill ServiceVisit chemical costing fields.
 * 
 * Processes historical visits missing chemicalCostVersion or chemicalCostLines,
 * using the same costing logic as processServiceVisit.
 * 
 * EXAMPLE PAYLOADS:
 * 
 * 1. First batch (dry run):
 *    { "dryRun": true, "limit": 50 }
 * 
 * 2. Actual backfill, first batch:
 *    { "limit": 50 }
 * 
 * 3. Subsequent batch (with cursor from previous response):
 *    { "limit": 50, "cursorCreatedDate": "2026-02-28T10:30:00Z" }
 * 
 * Repeat step 3 until response.done === true.
 */

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    // Admin-only access
    if (!user || user.role !== 'admin') {
      return Response.json(
        { success: false, error: 'Unauthorized' },
        { status: 403 }
      );
    }

    // Parse inputs
    const body = await req.json().catch(() => ({}));
    let { limit = 50, cursorCreatedDate = null, dryRun = false } = body;

    // Validate limit
    if (limit < 1 || limit > 200) {
      limit = 50;
    }

    // Build filter: needs backfill
    const filter = {
      $or: [
        { chemicalCostVersion: { $exists: false } },
        { chemicalCostVersion: null },
        { chemicalCostVersion: '' },
        { chemicalCostLines: { $exists: false } },
        { chemicalCostLines: null }
      ]
    };

    // Add cursor filter (created_date < cursorCreatedDate for backwards paging)
    if (cursorCreatedDate) {
      filter.created_date = { $lt: cursorCreatedDate };
    }

    // Fetch batch, sorted descending by created_date (oldest first within batch)
    const visits = await base44.asServiceRole.entities.ServiceVisit.filter(
      filter,
      '-created_date',
      limit
    );

    if (visits.length === 0) {
      return Response.json({
        success: true,
        done: true,
        nextCursorCreatedDate: null,
        processedCount: 0,
        updatedCount: 0,
        skippedCount: 0,
        errorCount: 0,
        sampleErrors: []
      });
    }

    let updatedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;
    const sampleErrors = [];

    // Process each visit
    for (const visit of visits) {
      try {
        // Skip if no chemicals added or empty
        if (
          !visit.chemicalsAdded ||
          (typeof visit.chemicalsAdded === 'string' &&
            visit.chemicalsAdded.trim() === '') ||
          Object.keys(visit.chemicalsAdded).length === 0
        ) {
          skippedCount++;
          continue;
        }

        // Scoped fetch: determine which keys/names are present with non-zero amounts
        const knownBuckets = [
          'liquidChlorine',
          'acid',
          'bakingSoda',
          'stabilizer',
          'salt',
          'chlorineTablets'
        ];
        const neededServiceVisitKeys = new Set();
        const otherNames = new Set();

        for (const key of knownBuckets) {
          const amount = visit.chemicalsAdded[key];
          if (amount && parseFloat(amount) > 0) {
            neededServiceVisitKeys.add(key);
          }
        }

        if (
          visit.chemicalsAdded.other &&
          Array.isArray(visit.chemicalsAdded.other)
        ) {
          for (const entry of visit.chemicalsAdded.other) {
            if (entry.name && entry.amount && parseFloat(entry.amount) > 0) {
              otherNames.add(entry.name.trim().toLowerCase());
            }
          }
        }

        // Fetch only needed catalog items
        const allChemicals = [];

        for (const key of neededServiceVisitKeys) {
          const results = await base44.asServiceRole.entities.ChemicalCatalogItem.filter(
            { serviceVisitKey: key, isActive: true },
            '-updated_date',
            10
          );
          allChemicals.push(...results);
        }

        if (otherNames.size > 0) {
          const otherResults = await base44.asServiceRole.entities.ChemicalCatalogItem.filter(
            { isActive: true },
            '-updated_date',
            50
          );
          allChemicals.push(
            ...otherResults.filter(c =>
              otherNames.has(c.name.trim().toLowerCase())
            )
          );
        }

        // Build lookup maps
        const byServiceVisitKey = new Map(
          allChemicals.map(c => [c.serviceVisitKey, c])
        );
        const byName = new Map(
          allChemicals.map(c => [c.name.trim().toLowerCase(), c])
        );

        // Compute costs using shared helper
        const { totalCostCents, lines } = computeChemicalCostLines(
          visit.chemicalsAdded,
          byServiceVisitKey,
          byName
        );

        // Update database if not dry run
        if (!dryRun) {
          await base44.asServiceRole.entities.ServiceVisit.update(visit.id, {
            chemicalCostCents: totalCostCents,
            chemicalCostVersion: 'v1_canonical',
            chemicalCostLines: JSON.stringify(lines)
          });
        }

        updatedCount++;
      } catch (err) {
        errorCount++;
        if (sampleErrors.length < 10) {
          sampleErrors.push({
            visitId: visit.id,
            error: err.message || String(err)
          });
        }
      }
    }

    // Determine next cursor (created_date of oldest visit in batch)
    const nextCursorCreatedDate =
      visits.length === limit ? visits[visits.length - 1].created_date : null;

    return Response.json({
      success: true,
      done: visits.length < limit,
      nextCursorCreatedDate,
      processedCount: visits.length,
      updatedCount,
      skippedCount,
      errorCount,
      sampleErrors
    });
  } catch (error) {
    return Response.json(
      { success: false, error: error.message || String(error) },
      { status: 500 }
    );
  }
});