import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    console.log('[updateEventStatus] START');
    const base44 = createClientFromRequest(req);
    console.log('[updateEventStatus] CLIENT_READY');
    
    console.log('[updateEventStatus] AUTH_START');
    const user = await base44.auth.me();
    console.log('[updateEventStatus] AUTH_DONE');

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log('[updateEventStatus] JSON_START');
    const { eventId, status, couldNotAccessReason, sendNotification } = await req.json();
    console.log('[updateEventStatus] JSON_DONE', { eventId, status });

    // Get event
    console.log('[updateEventStatus] VALIDATION_DONE');
    const event = await base44.entities.CalendarEvent.get(eventId);
    if (!event) {
      return Response.json({ error: 'Event not found' }, { status: 404 });
    }

    // Update event
    console.log('[updateEventStatus] EVENT_UPDATE_START', { eventId, status });
    const updates = { status };

    if (status === 'completed') {
      updates.completedAt = new Date().toISOString();
    }

    if (status === 'could_not_access' && couldNotAccessReason) {
      updates.couldNotAccessReason = couldNotAccessReason;
      updates.status = 'needs_reschedule';
    }

    await base44.entities.CalendarEvent.update(eventId, updates);
    console.log('[updateEventStatus] EVENT_UPDATE_DONE', { eventId });

    // Send notification if requested
    if (sendNotification && (status === 'completed' || status === 'en_route')) {
      const settings = await base44.entities.SchedulingSettings.filter({ settingKey: 'default' });
      const config = settings[0] || {};
      
      let message = '';
      let notificationType = '';

      if (status === 'completed') {
        notificationType = 'completed';
        message = config.notificationTemplates?.service_complete || 
          "Breez: Your pool service is complete. Thank you!";
      } else if (status === 'en_route') {
        notificationType = 'on_the_way';
        const eta = event.drivingTimeToNext || 15;
        message = (config.notificationTemplates?.on_the_way || 
          "Breez: Your technician is on the way and will arrive in approximately {minutes} minutes.")
          .replace('{minutes}', eta);
      }

      if (message) {
        try {
          await base44.functions.invoke('sendScheduleNotification', {
            leadId: event.leadId,
            eventId: event.id,
            notificationType,
            message
          });
        } catch (notifyError) {
          console.error('Failed to send notification:', notifyError);
        }
      }
    }

    console.log('[updateEventStatus] RETURN_SUCCESS');
    return Response.json({
      success: true,
      status: updates.status
    });

  } catch (error) {
    console.error('Update event status error:', error);
    return Response.json({ 
      error: error.message || 'Failed to update event status'
    }, { status: 500 });
  }
});