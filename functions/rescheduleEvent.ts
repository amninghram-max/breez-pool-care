import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { eventId, newDate, newTimeWindowStart, newTimeWindowEnd, reason } = await req.json();

    // Get event
    const event = await base44.asServiceRole.entities.CalendarEvent.get(eventId);
    if (!event) {
      return Response.json({ error: 'Event not found' }, { status: 404 });
    }

    // Get lead
    const lead = await base44.asServiceRole.entities.Lead.get(event.leadId);
    if (!lead) {
      return Response.json({ error: 'Lead not found' }, { status: 404 });
    }

    // Check customer constraints for new date
    const constraints = await base44.asServiceRole.entities.CustomerConstraints.filter({ leadId: lead.id });
    if (constraints.length > 0) {
      const constraint = constraints[0];
      const newDateObj = new Date(newDate);
      const dayOfWeek = newDateObj.getDay(); // 0=Sun, 6=Sat
      
      // Convert to Mon=1, Sat=6 format
      const breezDay = dayOfWeek === 0 ? 7 : dayOfWeek;
      
      if (constraint.blockedDays?.includes(breezDay)) {
        return Response.json({ 
          error: 'Customer has blocked this day of week',
          suggestion: 'Please choose a different day'
        }, { status: 400 });
      }
    }

    // Update event
    const originalDate = event.originalDate || event.date;
    await base44.asServiceRole.entities.CalendarEvent.update(eventId, {
      date: newDate,
      timeWindowStart: newTimeWindowStart || event.timeWindowStart,
      timeWindowEnd: newTimeWindowEnd || event.timeWindowEnd,
      originalDate,
      rescheduledBy: user.email,
      status: 'scheduled'
    });

    // Send reschedule confirmation
    const settings = await base44.asServiceRole.entities.SchedulingSettings.filter({ settingKey: 'default' });
    const config = settings[0] || {};
    
    if (config.notificationSettings?.sendRescheduleConfirmation) {
      try {
        await base44.asServiceRole.functions.invoke('sendScheduleNotification', {
          leadId: lead.id,
          eventId,
          notificationType: 'reschedule_confirmation',
          newDate,
          newTimeWindowStart,
          newTimeWindowEnd
        });
      } catch (notifyError) {
        console.error('Failed to send reschedule confirmation:', notifyError);
      }
    }

    return Response.json({
      success: true,
      message: 'Event rescheduled successfully'
    });

  } catch (error) {
    console.error('Reschedule event error:', error);
    return Response.json({ 
      error: error.message || 'Failed to reschedule event'
    }, { status: 500 });
  }
});