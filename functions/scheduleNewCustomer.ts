import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    const { leadId } = await req.json();

    if (!leadId) {
      return Response.json({ error: 'Lead ID required' }, { status: 400 });
    }

    // Get lead
    const lead = await base44.asServiceRole.entities.Lead.get(leadId);

    if (!lead) {
      return Response.json({ error: 'Lead not found' }, { status: 404 });
    }

    // Get customer constraints if any
    const constraints = await base44.asServiceRole.entities.CustomerConstraints.filter({
      leadId: leadId
    });
    const constraint = constraints[0];

    // Get scheduling settings
    const settings = await base44.asServiceRole.entities.SchedulingSettings.filter({
      settingKey: 'default'
    });
    const schedulingSettings = settings[0];

    // Determine service frequency
    const quotes = await base44.asServiceRole.entities.PoolQuestionnaire.filter({
      clientEmail: lead.email
    });
    const quote = quotes[0];
    const frequency = quote?.clientSelectedFrequency || quote?.recommendedFrequency || 'weekly';

    // Calculate next available service date
    const nextDate = calculateNextAvailableDate(
      constraint?.preferredDays || [],
      constraint?.doNotScheduleDays || []
    );

    // Assign technician based on location and capacity
    const technician = await assignTechnician(
      lead.serviceAddress,
      schedulingSettings,
      nextDate,
      base44
    );

    // Create first service event
    const event = await base44.asServiceRole.entities.CalendarEvent.create({
      leadId: leadId,
      eventType: quote?.poolCondition === 'green' ? 'green_recovery' : 'service',
      scheduledDate: nextDate,
      timeWindow: '9:00 AM - 11:00 AM',
      startTime: '09:00',
      endTime: '11:00',
      estimatedDuration: getEstimatedDuration(quote),
      assignedTechnician: technician,
      status: 'scheduled',
      serviceAddress: lead.serviceAddress,
      latitude: lead.latitude,
      longitude: lead.longitude,
      accessNotes: lead.gateCode ? `Gate code: ${lead.gateCode}` : '',
      isRecurring: true,
      recurrencePattern: frequency === 'weekly' ? 'weekly' : 'biweekly'
    });

    // Send notification to customer
    await base44.asServiceRole.integrations.Core.SendEmail({
      to: lead.email,
      subject: 'Your First Pool Service is Scheduled',
      body: `
        <h2>Hi ${lead.firstName},</h2>
        <p>Great news — your first pool service is scheduled!</p>
        <p><strong>Service Details:</strong></p>
        <ul>
          <li>Date: ${new Date(nextDate).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</li>
          <li>Time Window: 9:00 AM - 11:00 AM</li>
          <li>Technician: ${technician}</li>
          <li>Frequency: ${frequency.charAt(0).toUpperCase() + frequency.slice(1)}</li>
        </ul>
        <p><strong>Before your first service:</strong></p>
        <ul>
          <li>Ensure the pool area is accessible</li>
          <li>Pets should be secured</li>
          <li>Pool equipment should be accessible</li>
        </ul>
        <p>We'll text you when our technician is on the way.</p>
        <p>Questions? Call us at (321) 524-3838</p>
        <p>— Breez Pool Care</p>
      `
    });

    // Log analytics
    await base44.asServiceRole.entities.AnalyticsEvent.create({
      eventType: 'CustomerScheduled',
      leadId: leadId,
      technicianName: technician,
      source: 'system',
      metadata: {
        first_service_date: nextDate,
        frequency: frequency
      },
      timestamp: new Date().toISOString()
    });

    return Response.json({
      success: true,
      eventId: event.id,
      scheduledDate: nextDate,
      technician: technician
    });

  } catch (error) {
    console.error('Schedule new customer error:', error);
    return Response.json(
      { error: error.message || 'Failed to schedule customer' },
      { status: 500 }
    );
  }
});

function calculateNextAvailableDate(preferredDays, doNotScheduleDays) {
  const today = new Date();
  const daysMap = {
    'monday': 1,
    'tuesday': 2,
    'wednesday': 3,
    'thursday': 4,
    'friday': 5,
    'saturday': 6
  };

  // Start from 2 days out to allow preparation
  let checkDate = new Date(today);
  checkDate.setDate(checkDate.getDate() + 2);

  // Find next available day (not Sunday, not in doNotScheduleDays)
  for (let i = 0; i < 14; i++) {
    const dayName = checkDate.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
    
    if (dayName === 'sunday') {
      checkDate.setDate(checkDate.getDate() + 1);
      continue;
    }

    if (doNotScheduleDays.includes(dayName)) {
      checkDate.setDate(checkDate.getDate() + 1);
      continue;
    }

    // If preferred days specified, check if this is preferred
    if (preferredDays.length > 0 && preferredDays.includes(dayName)) {
      return checkDate.toISOString().split('T')[0];
    }

    // If no preferred days, any available day is fine
    if (preferredDays.length === 0) {
      return checkDate.toISOString().split('T')[0];
    }

    checkDate.setDate(checkDate.getDate() + 1);
  }

  // Fallback: 7 days out
  const fallback = new Date(today);
  fallback.setDate(fallback.getDate() + 7);
  return fallback.toISOString().split('T')[0];
}

async function assignTechnician(address, settings, date, base44) {
  // Simple assignment: rotate through active technicians
  // In production, this would use route optimization
  
  const technicians = settings?.technicians?.filter(t => t.active) || [];
  
  if (technicians.length === 0) {
    return 'Matt'; // Default
  }

  // Get existing events for this date
  const events = await base44.asServiceRole.entities.CalendarEvent.filter({
    scheduledDate: date
  });

  // Count events per technician
  const counts = {};
  technicians.forEach(t => {
    counts[t.name] = events.filter(e => e.assignedTechnician === t.name).length;
  });

  // Assign to technician with fewest events
  let minCount = Infinity;
  let assignedTech = technicians[0].name;

  for (const tech of technicians) {
    if (counts[tech.name] < minCount) {
      minCount = counts[tech.name];
      assignedTech = tech.name;
    }
  }

  return assignedTech;
}

function getEstimatedDuration(quote) {
  if (!quote) return 30;

  const poolSize = quote.poolSize;
  const durations = {
    'under_10k': 25,
    '10_15k': 30,
    '15_20k': 35,
    '20_30k': 45,
    '30k_plus': 55
  };

  return durations[poolSize] || 30;
}