import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

const BUILD = 'undoStormBatchV1';

// Module-level in-memory guard for concurrent undo of same batch
const undoingBatches = new Set();

// Helper: compute deterministic fingerprint
function computeFingerprint(batchEventId) {
  return JSON.stringify([batchEventId]);
}

// Helper: parse date string safely
function parseDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  if (!Number.isFinite(d.getTime())) return null;
  return d;
}

// Helper: format date as YYYY-MM-DD
function formatDate(d) {
  if (!(d instanceof Date) || !Number.isFinite(d.getTime())) return null;
  return d.toISOString().split('T')[0];
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const { batchEventId, idempotencyKey } = await req.json();

    if (!batchEventId) {
      return Response.json({ error: 'batchEventId required' }, { status: 400 });
    }

    // IN-FLIGHT GUARD
    if (idempotencyKey && undoingBatches.has(idempotencyKey)) {
      return Response.json({
        success: false,
        code: 'UNDO_IN_PROGRESS',
        error: 'An undo for this batch is already in progress.',
        idempotency: { key: idempotencyKey, fingerprint: null, replayed: false }
      }, { status: 409 });
    }

    if (idempotencyKey) {
      undoingBatches.add(idempotencyKey);
    }

    // Compute fingerprint
    const effectiveFingerprint = computeFingerprint(batchEventId);
    let idempotencyInfo = { key: idempotencyKey || null, fingerprint: effectiveFingerprint, replayed: false };

    // PERSISTED IDEMPOTENCY LOOKUP
    if (idempotencyKey) {
      const priorUndos = await base44.asServiceRole.entities.AnalyticsEvent.filter({
        eventName: 'storm_batch_undo_audit',
        'metadata.idempotencyKey': idempotencyKey
      });

      if (priorUndos.length > 0) {
        const priorUndo = priorUndos[0];
        const storedFingerprint = priorUndo.metadata?.fingerprint;

        if (storedFingerprint === effectiveFingerprint) {
          idempotencyInfo.replayed = true;
          const cachedResponse = priorUndo.metadata?.responseBody || {};
          cachedResponse.idempotency = idempotencyInfo;
          return Response.json(cachedResponse);
        }

        return Response.json({
          success: false,
          error: 'IDEMPOTENCY_CONFLICT',
          message: 'Same idempotencyKey provided but batch differs.',
          idempotency: idempotencyInfo
        }, { status: 400 });
      }
    }

    // Load batch AnalyticsEvent
    const batch = await base44.asServiceRole.entities.AnalyticsEvent.filter({ id: batchEventId });
    if (batch.length === 0) {
      return Response.json({
        success: false,
        error: 'BATCH_NOT_FOUND',
        message: `No batch found with id ${batchEventId}`
      }, { status: 404 });
    }

    const batchRecord = batch[0];
    const batchMeta = batchRecord.data?.metadata || {};
    const appliedItems = batchMeta.responseBody?.applied || [];

    // Validate event name (allow both for backwards compat)
    if (!['storm_batch_audit', 'bulk_reschedule_idempotency'].includes(batchRecord.data?.eventName)) {
      return Response.json({
        success: false,
        error: 'INVALID_BATCH',
        message: 'Batch record is not a storm batch.'
      }, { status: 400 });
    }

    // Validate 24h window
    const batchTime = new Date(batchRecord.created_date);
    const now = new Date();
    const diffMs = now.getTime() - batchTime.getTime();
    const diffHours = diffMs / (1000 * 60 * 60);

    if (diffHours > 24) {
      return Response.json({
        success: false,
        error: 'UNDO_WINDOW_EXPIRED',
        message: `Undo window expired (batch created ${Math.floor(diffHours)} hours ago; max 24h).`
      }, { status: 400 });
    }

    if (appliedItems.length === 0) {
      return Response.json({
        success: true,
        undoneCount: 0,
        skippedCount: 0,
        applied: [],
        skipped: [],
        warnings: ['No applied items in batch; nothing to undo.'],
        summary: { appliedCount: 0, skippedCount: 0 },
        idempotency: idempotencyInfo
      });
    }

    // Load leads and events for unchanged check
    const leads = await base44.asServiceRole.entities.Lead.list('-created_date', 1000);
    const leadMap = {};
    leads.forEach(l => { leadMap[l.id] = l; });

    const inspections = await base44.asServiceRole.entities.InspectionRecord.list('-created_date', 1000);
    const inspectionByEventId = {};
    inspections.forEach(ir => {
      if (ir.calendarEventId) inspectionByEventId[ir.calendarEventId] = ir;
    });

    // Process undo for each applied item
    const undoneItems = [];
    const skippedItems = [];
    const warnings = [];

    for (const item of appliedItems) {
      const { eventId, oldDate, newDate, leadId, eventType } = item;

      // Fetch current event
      const currentEvents = await base44.asServiceRole.entities.CalendarEvent.filter({ id: eventId });
      if (currentEvents.length === 0) {
        skippedItems.push({
          eventId,
          leadId,
          reason: 'event_not_found',
          message: `Event ${eventId} no longer exists.`
        });
        continue;
      }

      const currentEvent = currentEvents[0];

      // Check if event was modified since batch (unchanged guard)
      if (currentEvent.scheduledDate !== newDate) {
        skippedItems.push({
          eventId,
          leadId,
          reason: 'already_modified',
          message: `Event has been modified since batch (expected ${newDate}, found ${currentEvent.scheduledDate}).`
        });
        continue;
      }

      // Event is safe to undo
      try {
        // Write order: InspectionRecord → CalendarEvent → Lead

        // If inspection, update authoritative record first
        if (eventType === 'inspection' && inspectionByEventId[eventId]) {
          const inspection = inspectionByEventId[eventId];
          await base44.asServiceRole.entities.InspectionRecord.update(inspection.id, {
            scheduledDate: oldDate,
            appointmentStatus: 'scheduled'
          });
        }

        // Update CalendarEvent projection
        await base44.asServiceRole.entities.CalendarEvent.update(eventId, {
          scheduledDate: oldDate,
          stormImpacted: false,
          rescheduleReason: null
        });

        // Sync Lead if inspection
        if (eventType === 'inspection') {
          const lead = leadMap[leadId];
          if (lead) {
            const oldDateTime = new Date(oldDate + 'T' + (currentEvent.startTime || '09:00') + ':00');
            await base44.asServiceRole.entities.Lead.update(leadId, {
              confirmedInspectionDate: oldDateTime.toISOString()
            });
          }
        }

        undoneItems.push({
          eventId,
          leadId,
          eventType,
          restoredDate: oldDate
        });
      } catch (writeErr) {
        console.error(`Write error undoing event ${eventId}:`, writeErr);
        skippedItems.push({
          eventId,
          leadId,
          reason: 'write_error',
          message: writeErr.message
        });
      }
    }

    const undoResponse = {
      success: undoneItems.length > 0,
      undoneCount: undoneItems.length,
      skippedCount: skippedItems.length,
      applied: undoneItems,
      skipped: skippedItems,
      warnings,
      summary: {
        appliedCount: undoneItems.length,
        skippedCount: skippedItems.length
      },
      idempotency: idempotencyInfo
    };

    // PERSIST AUDIT RECORD
    if (idempotencyKey || true) {
      try {
        await base44.asServiceRole.entities.AnalyticsEvent.create({
          eventName: 'storm_batch_undo_audit',
          properties: {
            operatorEmail: user.email,
            batchEventId,
            undoneCount: undoneItems.length,
            skippedCount: skippedItems.length
          },
          metadata: {
            idempotencyKey: idempotencyKey || null,
            fingerprint: effectiveFingerprint,
            responseBody: undoResponse,
            createdAt: new Date().toISOString()
          }
        });
      } catch (auditErr) {
        console.error(`Failed to persist undo audit record:`, auditErr);
        undoResponse.warnings.push('WARNING: Audit persistence failed.');
      }
    }

    return Response.json(undoResponse);
  } catch (error) {
    console.error(`[${BUILD}] Unhandled error:`, error);
    return Response.json({
      success: false,
      error: error.message || 'Internal server error',
      build: BUILD
    }, { status: 500 });
  } finally {
    if (idempotencyKey) {
      undoingBatches.delete(idempotencyKey);
    }
  }
});