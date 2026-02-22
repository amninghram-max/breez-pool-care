import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const { date, severity, reason, sendAdvisory } = await req.json();

    // Mark as storm day
    const stormDay = await base44.asServiceRole.entities.StormDay.create({
      date,
      severity: severity || 'moderate',
      reason: reason || 'Severe weather',
      createdBy: user.email,
      createdAt: new Date().toISOString(),
      notificationSent: false,
      bulkRescheduled: false
    });

    // Get all events for this date
    const events = await base44.asServiceRole.entities.CalendarEvent.filter({ date });

    if (events.length === 0) {
      return Response.json({ message: 'No events to reschedule', stormDay });
    }

    // Send storm advisory if requested
    if (sendAdvisory) {
      const uniqueLeads = [...new Set(events.map(e => e.leadId))];
      
      for (const leadId of uniqueLeads) {
        try {
          await base44.asServiceRole.functions.invoke('sendScheduleNotification', {
            leadId,
            notificationType: 'storm_advisory',
            date
          });
        } catch (notifyError) {
          console.error(`Failed to send storm advisory to ${leadId}:`, notifyError);
        }
      }

      await base44.asServiceRole.entities.StormDay.update(stormDay.id, {
        notificationSent: true
      });
    }

    // Mark events as weather impacted
    for (const event of events) {
      await base44.asServiceRole.entities.CalendarEvent.update(event.id, {
        weatherImpacted: true,
        originalDate: event.date
      });
    }

    // Update storm day with affected count
    await base44.asServiceRole.entities.StormDay.update(stormDay.id, {
      affectedEventsCount: events.length,
      affectedTechnicians: [...new Set(events.map(e => e.assignedTechnician).filter(Boolean))]
    });

    return Response.json({
      success: true,
      stormDay,
      affectedEvents: events.length,
      message: `Marked ${events.length} events as weather impacted`
    });

  } catch (error) {
    console.error('Bulk reschedule error:', error);
    return Response.json({ 
      error: error.message || 'Failed to bulk reschedule'
    }, { status: 500 });
  }
});