import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * scheduleFirstService
 * Create first CalendarEvent based on accepted quote frequency.
 * Schedule next 4–8 weeks of recurring events.
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
    const { leadId, quoteId, frequency, assignedTechnician } = await req.json();

    if (!leadId || !frequency) {
      return Response.json({ error: 'leadId and frequency required' }, { status: 400 });
    }

    // Load lead for address
    const lead = await base44.asServiceRole.entities.Lead.get(leadId);
    if (!lead) {
      return Response.json({ error: 'Lead not found' }, { status: 404 });
    }

    const serviceAddress = lead.serviceAddress || `${lead.streetAddress}, ${lead.city}, ${lead.state} ${lead.zipCode}`;
    const firstDate = getNextServiceDate();
    const recurringWeeks = frequency === 'twice_weekly' ? 8 : 4;
    const serviceDates = getNextRecurringDates(firstDate, frequency, recurringWeeks);

    // Create CalendarEvents for first month
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
        assignedTechnician: assignedTechnician || 'Matt',
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

    console.log(`✅ First service scheduled: leadId=${leadId}, startDate=${firstDate}, frequency=${frequency}, events=${events.length}`);

    return Response.json({
      success: true,
      leadId,
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