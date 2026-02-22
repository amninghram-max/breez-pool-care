import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { eventId, status, reason, serviceVisitId } = await req.json();

    // Get event
    const event = await base44.asServiceRole.entities.CalendarEvent.get(eventId);
    if (!event) {
      return Response.json({ error: 'Event not found' }, { status: 404 });
    }

    const updates = { status };

    if (status === 'completed') {
      updates.completedAt = new Date().toISOString();
      if (serviceVisitId) {
        updates.serviceVisitId = serviceVisitId;
      }

      // Send completion notice if configured
      const settings = await base44.asServiceRole.entities.SchedulingSettings.filter({ settingKey: 'default' });
      const config = settings[0] || {};
      
      if (config.notificationSettings?.sendCompletedNotice) {
        try {
          await base44.asServiceRole.functions.invoke('sendScheduleNotification', {
            leadId: event.leadId,
            eventId,
            notificationType: 'completed_notice'
          });
        } catch (notifyError) {
          console.error('Failed to send completion notice:', notifyError);
        }
      }
    }

    if (status === 'could_not_access') {
      updates.couldNotAccessReason = reason;

      // Send could not access notice
      try {
        await base44.asServiceRole.functions.invoke('sendScheduleNotification', {
          leadId: event.leadId,
          eventId,
          notificationType: 'could_not_access'
        });
      } catch (notifyError) {
        console.error('Failed to send could not access notice:', notifyError);
      }
    }

    if (status === 'en_route') {
      // Send arrival notice if configured
      const settings = await base44.asServiceRole.entities.SchedulingSettings.filter({ settingKey: 'default' });
      const config = settings[0] || {};
      
      if (config.notificationSettings?.sendArrivalNotice) {
        try {
          await base44.asServiceRole.functions.invoke('sendScheduleNotification', {
            leadId: event.leadId,
            eventId,
            notificationType: 'arrival_notice'
          });
        } catch (notifyError) {
          console.error('Failed to send arrival notice:', notifyError);
        }
      }
    }

    await base44.asServiceRole.entities.CalendarEvent.update(eventId, updates);

    return Response.json({
      success: true,
      message: 'Event status updated'
    });

  } catch (error) {
    console.error('Update event status error:', error);
    return Response.json({ 
      error: error.message || 'Failed to update status'
    }, { status: 500 });
  }
});