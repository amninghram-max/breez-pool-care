import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

const BUILD = 'bulkRescheduleStormV2';

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

// Helper: add days to date string
function addDaysToDateStr(dateStr, n) {
  const d = parseDate(dateStr);
  if (!d) return null;
  d.setDate(d.getDate() + n);
  return formatDate(d);
}

// Conflict check: does event overlap with existing active event on new date for same lead?
async function checkConflict(base44, leadId, newDate, newTimeWindow, eventDuration = 30) {
  const existingEvents = await base44.asServiceRole.entities.CalendarEvent.filter({
    leadId,
    scheduledDate: newDate,
    status: { $ne: 'cancelled' }
  });
  
  if (existingEvents.length === 0) return null;
  
  // Simple check: if any non-cancelled event exists on same date for same lead, flag conflict
  return {
    type: 'overlap',
    message: `Lead already has ${existingEvents.length} event(s) scheduled on ${newDate}`,
    existingEventIds: existingEvents.map(e => e.id)
  };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const {
      fromDate,
      toDate,
      eventTypes = [],
      technicianFilter,
      policy = 'shift_day',
      dryRun = true,
      sendNotifications = false,
      idempotencyKey,
      targetDate
    } = await req.json();

    // Input validation
    if (!fromDate || !toDate) {
      return Response.json({ error: 'fromDate and toDate required' }, { status: 400 });
    }
    if (!['shift_day', 'next_available', 'manual_review'].includes(policy)) {
      return Response.json({ error: `Invalid policy: ${policy}` }, { status: 400 });
    }

    // Load all events in date range
    const dayMap = {};
    let d = parseDate(fromDate);
    const endDate = parseDate(toDate);
    while (d <= endDate) {
      const dateStr = formatDate(d);
      dayMap[dateStr] = [];
      d.setDate(d.getDate() + 1);
    }

    // Fetch events per day
    const allEventsRaw = [];
    for (const dateStr of Object.keys(dayMap).sort()) {
      const dayEvents = await base44.asServiceRole.entities.CalendarEvent.filter({ scheduledDate: dateStr });
      allEventsRaw.push(...dayEvents);
    }

    // Filter by event type and technician
    let allEvents = allEventsRaw;
    if (eventTypes.length > 0) {
      allEvents = allEvents.filter(e => eventTypes.includes(e.eventType));
    }
    if (technicianFilter && technicianFilter !== 'all') {
      allEvents = allEvents.filter(e => e.assignedTechnician === technicianFilter);
    }

    // Exclude cancelled, deleted leads
    const leads = await base44.asServiceRole.entities.Lead.list('-created_date', 1000);
    const leadMap = {};
    leads.forEach(l => { leadMap[l.id] = l; });

    const validEvents = allEvents.filter(e => {
      const lead = leadMap[e.leadId];
      return lead && !lead.isDeleted && e.status !== 'cancelled';
    });

    if (validEvents.length === 0) {
      return Response.json({
        success: true,
        dryRun,
        applied: [],
        skipped: [],
        conflicts: [],
        warnings: [],
        summary: { selectedCount: 0, applyEligibleCount: 0, skippedCount: 0 }
      });
    }

    // --- PHASE 2: Dry-run preview + policy-driven rescheduling ---

    const applied = [];
    const skipped = [];
    const conflicts = [];
    const warnings = [];

    // Load inspection records (authoritative source)
    const inspections = await base44.asServiceRole.entities.InspectionRecord.list('-created_date', 1000);
    const inspectionByEventId = {};
    inspections.forEach(ir => {
      if (ir.calendarEventId) inspectionByEventId[ir.calendarEventId] = ir;
    });

    // Check for pending reschedule requests
    const pendingReschedules = await base44.asServiceRole.entities.RescheduleRequest.filter({ status: 'pending' });
    const pendingByEventId = {};
    pendingReschedules.forEach(pr => {
      if (pr.calendarEventId) pendingByEventId[pr.calendarEventId] = pr;
    });

    // Process each event
    for (const event of validEvents) {
      const itemId = event.id;

      // Skip: pending reschedule request
      if (pendingByEventId[itemId]) {
        skipped.push({
          eventId: itemId,
          leadId: event.leadId,
          oldDate: event.scheduledDate,
          reason: 'pending_reschedule_request',
          message: 'Event has pending reschedule request'
        });
        continue;
      }

      // Determine new date based on policy
      let newDate = null;
      let newDateStr = null;

      if (policy === 'manual_review') {
        // No reschedule; mark for manual review
        skipped.push({
          eventId: itemId,
          leadId: event.leadId,
          oldDate: event.scheduledDate,
          reason: 'manual_review_required',
          message: 'Flagged for manual review by supervisor'
        });
        warnings.push(`Event ${itemId} requires manual review before rescheduling.`);
        continue;
      } else if (policy === 'shift_day') {
        // Shift to +1 day from original
        newDate = parseDate(event.scheduledDate);
        if (!newDate) {
          skipped.push({ eventId: itemId, leadId: event.leadId, oldDate: event.scheduledDate, reason: 'invalid_date' });
          continue;
        }
        newDate.setDate(newDate.getDate() + 1);
        newDateStr = formatDate(newDate);
      } else if (policy === 'next_available') {
        // Find next open slot after toDate, respecting constraints
        newDate = parseDate(toDate);
        if (!newDate) {
          skipped.push({ eventId: itemId, leadId: event.leadId, oldDate: event.scheduledDate, reason: 'invalid_date' });
          continue;
        }
        newDate.setDate(newDate.getDate() + 1);

        // Respect customer constraints and inspection priority
        const isInspection = event.eventType === 'inspection';
        const constraints = await base44.asServiceRole.entities.CustomerConstraints.filter({ leadId: event.leadId });
        const custConstraints = constraints[0];

        let attempts = 0;
        while (attempts < 30) {
          newDateStr = formatDate(newDate);
          const dow = newDate.toLocaleDateString('en-US', { weekday: 'lowercase' });

          // Skip Sunday
          if (newDate.getDay() === 0) {
            newDate.setDate(newDate.getDate() + 1);
            attempts++;
            continue;
          }

          // Respect do-not-schedule days
          if (custConstraints?.doNotScheduleDays?.includes(dow)) {
            newDate.setDate(newDate.getDate() + 1);
            attempts++;
            continue;
          }

          // Check conflicts
          const conflict = await checkConflict(base44, event.leadId, newDateStr, event.timeWindow, event.estimatedDuration);
          if (!conflict) break; // Found slot

          newDate.setDate(newDate.getDate() + 1);
          attempts++;
        }

        if (attempts >= 30) {
          skipped.push({
            eventId: itemId,
            leadId: event.leadId,
            oldDate: event.scheduledDate,
            reason: 'no_available_slot',
            message: 'No available slot found in next 30 days'
          });
          continue;
        }

        newDateStr = formatDate(newDate);
      }

      if (!newDateStr) {
        skipped.push({ eventId: itemId, leadId: event.leadId, oldDate: event.scheduledDate, reason: 'unknown' });
        continue;
      }

      // Final conflict check
      const finalConflict = await checkConflict(base44, event.leadId, newDateStr, event.timeWindow, event.estimatedDuration);
      if (finalConflict) {
        conflicts.push({
          eventId: itemId,
          leadId: event.leadId,
          newDate: newDateStr,
          conflict: finalConflict
        });
        skipped.push({
          eventId: itemId,
          leadId: event.leadId,
          oldDate: event.scheduledDate,
          reason: 'conflict',
          message: finalConflict.message
        });
        continue;
      }

      // Ready to apply (or preview)
      applied.push({
        eventId: itemId,
        eventType: event.eventType,
        leadId: event.leadId,
        oldDate: event.scheduledDate,
        newDate: newDateStr
      });
    }

    // If dry run, return preview without writes
    if (dryRun) {
      return Response.json({
        success: true,
        dryRun: true,
        applied: [],
        skipped: [...skipped, ...conflicts.map(c => ({ eventId: c.eventId, leadId: c.leadId, oldDate: 'N/A', reason: 'conflict', message: c.conflict.message }))],
        conflicts: conflicts.length > 0 ? conflicts : [],
        warnings,
        summary: {
          selectedCount: validEvents.length,
          applyEligibleCount: applied.length,
          skippedCount: skipped.length + conflicts.length
        }
      });
    }

    // --- WRITE PATH: Apply rescheduling ---
    const writeResults = [];

    for (const item of applied) {
      const event = validEvents.find(e => e.id === item.eventId);
      if (!event) continue;

      try {
        // If inspection: update InspectionRecord first (source of truth)
        if (event.eventType === 'inspection' && inspectionByEventId[event.id]) {
          const inspection = inspectionByEventId[event.id];
          await base44.asServiceRole.entities.InspectionRecord.update(inspection.id, {
            scheduledDate: item.newDate,
            appointmentStatus: 'scheduled'
          });
        }

        // Update CalendarEvent projection
        await base44.asServiceRole.entities.CalendarEvent.update(event.id, {
          scheduledDate: item.newDate,
          originalScheduledDate: event.scheduledDate,
          status: 'scheduled',
          stormImpacted: false,
          rescheduleReason: 'Storm/weather conditions'
        });

        // Sync Lead mirror fields if inspection
        if (event.eventType === 'inspection') {
          const lead = leadMap[event.leadId];
          if (lead) {
            await base44.asServiceRole.entities.Lead.update(event.leadId, {
              confirmedInspectionDate: new Date(item.newDate + 'T' + (event.startTime || '09:00') + ':00').toISOString()
            });
          }
        }

        writeResults.push({
          eventId: item.eventId,
          leadId: item.leadId,
          oldDate: item.oldDate,
          newDate: item.newDate,
          status: 'success'
        });
      } catch (writeErr) {
        console.error(`Write error for event ${item.eventId}:`, writeErr);
        writeResults.push({
          eventId: item.eventId,
          leadId: item.leadId,
          oldDate: item.oldDate,
          newDate: item.newDate,
          status: 'error',
          error: writeErr.message
        });
      }
    }

    return Response.json({
      success: writeResults.filter(r => r.status === 'success').length > 0,
      dryRun: false,
      applied: writeResults,
      skipped,
      conflicts: [],
      warnings,
      summary: {
        selectedCount: validEvents.length,
        applyEligibleCount: writeResults.filter(r => r.status === 'success').length,
        skippedCount: skipped.length + conflicts.length
      }
    });

  } catch (error) {
    console.error('Bulk reschedule error:', error);
    return Response.json({ 
      error: error.message || 'Failed to bulk reschedule'
    }, { status: 500 });
  }
});