import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    const { leadId, eventId, notificationType, date, newDate, newTimeWindowStart, newTimeWindowEnd } = await req.json();

    // Get lead
    const lead = await base44.asServiceRole.entities.Lead.get(leadId);
    if (!lead) {
      return Response.json({ error: 'Lead not found' }, { status: 404 });
    }

    // Get event if provided
    let event = null;
    if (eventId) {
      event = await base44.asServiceRole.entities.CalendarEvent.get(eventId);
    }

    let subject = '';
    let message = '';
    let method = lead.preferredContact === 'text' ? 'sms' : 'email';

    switch (notificationType) {
      case 'storm_advisory':
        subject = 'Weather Alert - Service Schedule Update';
        message = `Hi ${lead.firstName},\n\nDue to severe weather in the area, we're adjusting today's service schedule for safety. We'll notify you with your updated service time shortly. Thank you for understanding.\n\n— Breez Pool Care`;
        break;
      
      case 'reschedule_confirmation':
        subject = 'Service Rescheduled';
        const dateStr = new Date(newDate).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
        const timeWindow = newTimeWindowStart && newTimeWindowEnd 
          ? `between ${newTimeWindowStart} and ${newTimeWindowEnd}` 
          : 'during our service window';
        message = `Hi ${lead.firstName},\n\nYour pool service has been rescheduled to ${dateStr} ${timeWindow}.\n\nReply HELP if you have questions.\n\n— Breez Pool Care`;
        break;
      
      case 'arrival_notice':
        subject = 'Technician On The Way';
        message = `Hi ${lead.firstName},\n\nOur technician is on the way to your property for today's pool service. We'll be there within 30 minutes.\n\n— Breez Pool Care`;
        break;
      
      case 'completed_notice':
        subject = 'Your Breez Service Is Complete';
        message = `Hi ${lead.firstName},\n\nYour pool service has been completed. Thank you for choosing Breez Pool Care!\n\n— Breez Pool Care`;
        break;
      
      case 'could_not_access':
        subject = 'Unable to Access Your Property';
        message = `Hi ${lead.firstName},\n\nWe were unable to access your property for today's scheduled service. Please contact us to reschedule.\n\n— Breez Pool Care`;
        break;
      
      default:
        return Response.json({ error: 'Invalid notification type' }, { status: 400 });
    }

    // Send notification
    const recipient = method === 'sms' ? lead.mobilePhone : lead.email;
    
    try {
      if (method === 'sms' && lead.mobilePhone) {
        // Send SMS via email gateway (simplified)
        await base44.asServiceRole.integrations.Core.SendEmail({
          to: `${lead.mobilePhone.replace(/\D/g, '')}@sms-gateway.com`,
          subject: '',
          body: message.substring(0, 160)
        });
      } else {
        // Send email
        await base44.asServiceRole.integrations.Core.SendEmail({
          to: lead.email,
          subject,
          body: message
        });
      }

      // Log notification
      await base44.asServiceRole.entities.ScheduleNotificationLog.create({
        leadId,
        eventId: eventId || null,
        notificationType,
        method,
        recipient,
        subject,
        message,
        sentAt: new Date().toISOString(),
        status: 'sent'
      });

      return Response.json({
        success: true,
        message: 'Notification sent'
      });
    } catch (sendError) {
      console.error('Failed to send notification:', sendError);
      
      // Log failed notification
      await base44.asServiceRole.entities.ScheduleNotificationLog.create({
        leadId,
        eventId: eventId || null,
        notificationType,
        method,
        recipient,
        subject,
        message,
        sentAt: new Date().toISOString(),
        status: 'failed'
      });

      return Response.json({
        error: 'Failed to send notification',
        details: sendError.message
      }, { status: 500 });
    }

  } catch (error) {
    console.error('Send schedule notification error:', error);
    return Response.json({ 
      error: error.message || 'Failed to send notification'
    }, { status: 500 });
  }
});