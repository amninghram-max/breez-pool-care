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

    // Get customer constraints to find next available slots
    const rescheduledEvents = [];
    const settings = await base44.asServiceRole.entities.SchedulingSettings.filter({ settingKey: 'default' });
    const config = settings[0] || {};

    for (const event of events) {
      // Get customer constraints
      const constraints = await base44.asServiceRole.entities.CustomerConstraints.filter({ leadId: event.leadId });
      const customerConstraints = constraints[0];

      // Find next available date after toDate
      let newDate = new Date(toDate);
      newDate.setDate(newDate.getDate() + 1);

      // Check recurrence pattern
      if (event.recurrencePattern === 'weekly') {
        // Schedule for same day next week
        newDate.setDate(newDate.getDate() + 7);
      } else if (event.recurrencePattern === 'biweekly') {
        newDate.setDate(newDate.getDate() + 14);
      }

      // Respect customer constraints
      const dayOfWeek = newDate.toLocaleDateString('en-US', { weekday: 'lowercase' });
      if (customerConstraints?.doNotScheduleDays?.includes(dayOfWeek)) {
        // Move to next day
        newDate.setDate(newDate.getDate() + 1);
      }

      // Check if newDate is not Sunday (skip to Monday)
      if (newDate.getDay() === 0) {
        newDate.setDate(newDate.getDate() + 1);
      }

      const newDateStr = newDate.toISOString().split('T')[0];

      // Update event
      await base44.asServiceRole.entities.CalendarEvent.update(event.id, {
        originalScheduledDate: event.scheduledDate,
        scheduledDate: newDateStr,
        status: 'scheduled',
        stormImpacted: false,
        rescheduleReason: 'Storm/weather conditions'
      });

      rescheduledEvents.push({
        eventId: event.id,
        leadId: event.leadId,
        oldDate: event.scheduledDate,
        newDate: newDateStr
      });

      // Send reschedule notification
      if (sendNotifications) {
        const template = config.notificationTemplates?.reschedule_confirmation || 
          "Breez: Your pool service has been rescheduled to {date} at {time}. Reply HELP if you have questions.";
        
        const message = template
          .replace('{date}', new Date(newDateStr).toLocaleDateString())
          .replace('{time}', event.timeWindow || 'your scheduled time');

        try {
          await base44.asServiceRole.functions.invoke('sendScheduleNotification', {
            leadId: event.leadId,
            eventId: event.id,
            notificationType: 'reschedule_confirmation',
            message
          });
        } catch (notifyError) {
          console.error('Failed to send reschedule notification:', notifyError);
        }
      }
    }

    // Update storm day reschedule count
    if (rescheduledEvents.length > 0) {
      const stormDays = await base44.asServiceRole.entities.StormDay.filter({ date: fromDate });
      if (stormDays.length > 0) {
        await base44.asServiceRole.entities.StormDay.update(stormDays[0].id, {
          rescheduledCount: rescheduledEvents.length
        });
      }
    }

    return Response.json({
      success: true,
      rescheduledCount: rescheduledEvents.length,
      events: rescheduledEvents
    });

  } catch (error) {
    console.error('Bulk reschedule error:', error);
    return Response.json({ 
      error: error.message || 'Failed to bulk reschedule'
    }, { status: 500 });
  }
});