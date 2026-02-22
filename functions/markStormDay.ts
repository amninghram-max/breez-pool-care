import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const { date, severity, reason, sendNotifications } = await req.json();

    // Check if storm day already exists
    const existing = await base44.asServiceRole.entities.StormDay.filter({ date });
    let stormDay;

    if (existing.length > 0) {
      stormDay = existing[0];
      await base44.asServiceRole.entities.StormDay.update(stormDay.id, {
        severity,
        reason
      });
    } else {
      stormDay = await base44.asServiceRole.entities.StormDay.create({
        date,
        severity: severity || 'advisory',
        reason: reason || 'Severe weather conditions',
        createdBy: user.email,
        notificationsSent: false,
        affectedJobsCount: 0,
        rescheduledCount: 0
      });
    }

    // Mark all events on this date as storm impacted
    const events = await base44.asServiceRole.entities.CalendarEvent.filter({
      scheduledDate: date
    });

    for (const event of events) {
      await base44.asServiceRole.entities.CalendarEvent.update(event.id, {
        status: 'storm_impacted',
        stormImpacted: true
      });
    }

    // Update affected count
    await base44.asServiceRole.entities.StormDay.update(stormDay.id, {
      affectedJobsCount: events.length
    });

    // Send storm advisory notifications if requested
    if (sendNotifications && events.length > 0) {
      const settings = await base44.asServiceRole.entities.SchedulingSettings.filter({ settingKey: 'default' });
      const config = settings[0] || {};
      const template = config.notificationTemplates?.storm_advisory || 
        "Breez: Due to severe weather in the area, we're adjusting today's service schedule for safety. We'll notify you with your updated service time shortly. Thank you for understanding.";

      for (const event of events) {
        try {
          await base44.asServiceRole.functions.invoke('sendScheduleNotification', {
            leadId: event.leadId,
            eventId: event.id,
            notificationType: 'storm_advisory',
            message: template
          });
        } catch (notifyError) {
          console.error('Failed to send storm notification:', notifyError);
        }
      }

      await base44.asServiceRole.entities.StormDay.update(stormDay.id, {
        notificationsSent: true
      });
    }

    return Response.json({
      success: true,
      stormDayId: stormDay.id,
      affectedJobsCount: events.length
    });

  } catch (error) {
    console.error('Mark storm day error:', error);
    return Response.json({ 
      error: error.message || 'Failed to mark storm day'
    }, { status: 500 });
  }
});