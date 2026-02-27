import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * scheduleFirstService
 * Create first CalendarEvent based on accepted quote frequency (immutable).
 * Schedule next 4–8 weeks of recurring events.
 * 
 * Idempotent: if events already exist for this lead, return existing.
 * Load frequency from Quote, not frontend params.
 */

function getNextServiceDate() {
  const d = new Date();
  d.setDate(d.getDate() + 7); // Start 1 week from today
  // Prefer Tuesdays/Thursdays (skip Sundays)
  while ([0, 6].includes(d.getDay())) {
    d.setDate(d.getDate() + 1);
  }
  return d.toISOString().split('T')[0];
}

function getNextRecurringDates(startDate, frequency, weeks) {
  const dates = [startDate];
  const d = new Date(startDate);
  const interval = frequency === 'twice_weekly' ? 3 : 7;

  for (let i = 1; i < weeks; i++) {
    d.setDate(d.getDate() + interval);
    dates.push(d.toISOString().split('T')[0]);
  }
  return dates;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { leadId, quoteId } = await req.json();

    if (!leadId || !quoteId) {
      return Response.json({ error: 'leadId and quoteId required' }, { status: 400 });
    }

    // Load lead
    const lead = await base44.asServiceRole.entities.Lead.get(leadId);
    if (!lead) {
      return Response.json({ error: 'Lead not found' }, { status: 404 });
    }

    // Load quote — derive frequency from immutable field
    const quote = await base44.asServiceRole.entities.Quote.get(quoteId);
    if (!quote) {
      return Response.json({ error: 'Quote not found' }, { status: 404 });
    }

    const frequency = quote.outputFrequency;
    if (!frequency) {
      return Response.json({ error: 'Quote has no frequency' }, { status: 400 });
    }

    // Idempotency check: if events already exist for this lead, return existing
    const existingEvents = await base44.asServiceRole.entities.CalendarEvent.filter({
      leadId,
      eventType: 'service'
    }, '-created_date', 10);

    if (existingEvents && existingEvents.length > 0) {
      console.log(`⏭️ Service events already exist for leadId=${leadId}, returning existing`);
      return Response.json({
        success: true,
        leadId,
        alreadyScheduled: true,
        eventCount: existingEvents.length,
        upcomingDates: existingEvents.map(e => e.scheduledDate).slice(0, 4)
      });
    }

    const serviceAddress = lead.serviceAddress || `${lead.streetAddress}, ${lead.city}, ${lead.state} ${lead.zipCode}`;
    const firstDate = getNextServiceDate();
    const recurringWeeks = frequency === 'twice_weekly' ? 8 : 4;
    const serviceDates = getNextRecurringDates(firstDate, frequency, recurringWeeks);

    // Create CalendarEvents for first period
    const events = [];
    for (const date of serviceDates.slice(0, (frequency === 'twice_weekly' ? 8 : 4))) {
      const event = await base44.asServiceRole.entities.CalendarEvent.create({
        leadId,
        eventType: 'service',
        scheduledDate: date,
        timeWindow: 'morning',
        startTime: '09:00',
        endTime: '10:00',
        estimatedDuration: 30,
        assignedTechnician: lead.assignedInspector || 'Matt',
        status: 'scheduled',
        serviceAddress,
        isRecurring: true,
        recurrencePattern: frequency === 'twice_weekly' ? 'biweekly' : 'weekly'
      });
      events.push(event);
    }

    // Update Lead
    await base44.asServiceRole.entities.Lead.update(leadId, {
      stage: 'converted',
      nextBillingDate: serviceDates[1] || firstDate
    });

    console.log(`✅ First service scheduled: leadId=${leadId}, quoteId=${quoteId}, startDate=${firstDate}, frequency=${frequency}, events=${events.length}`);

    return Response.json({
      success: true,
      leadId,
      quoteId,
      firstServiceDate: firstDate,
      frequency,
      eventCount: events.length,
      upcomingDates: serviceDates.slice(0, 4)
    });
  } catch (error) {
    console.error('scheduleFirstService error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});