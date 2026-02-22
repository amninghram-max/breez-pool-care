import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    const { leadId, eventId, notificationType, message, metadata } = await req.json();

    // Get lead
    const lead = await base44.asServiceRole.entities.Lead.get(leadId);
    if (!lead) {
      return Response.json({ error: 'Lead not found' }, { status: 404 });
    }

    const preferredChannel = lead.preferredContact || 'email';
    let channel = preferredChannel;
    let recipient = '';

    // Determine channel and recipient
    if (preferredChannel === 'text' || preferredChannel === 'phone') {
      channel = preferredChannel === 'text' ? 'sms' : 'phone_call';
      recipient = lead.mobilePhone;
    } else {
      channel = 'email';
      recipient = lead.email;
    }

    // Send notification
    if (channel === 'email' || channel === 'sms') {
      try {
        await base44.asServiceRole.integrations.Core.SendEmail({
          to: recipient,
          subject: notificationType === 'storm_advisory' ? 'Breez Service Update' : 'Breez Schedule Update',
          body: message
        });
      } catch (sendError) {
        console.error('Failed to send notification:', sendError);
      }
    }

    // Log notification
    const notificationLog = await base44.asServiceRole.entities.NotificationLog.create({
      leadId,
      eventId: eventId || null,
      notificationType,
      channel,
      recipient,
      message,
      sentAt: new Date().toISOString(),
      status: 'sent',
      metadata: metadata || {}
    });

    // Update event with notification log reference
    if (eventId) {
      const event = await base44.asServiceRole.entities.CalendarEvent.get(eventId);
      const notificationsSent = event.notificationsSent || [];
      await base44.asServiceRole.entities.CalendarEvent.update(eventId, {
        notificationsSent: [...notificationsSent, notificationLog.id]
      });
    }

    return Response.json({
      success: true,
      notificationLogId: notificationLog.id,
      channel
    });

  } catch (error) {
    console.error('Send schedule notification error:', error);
    return Response.json({ 
      error: error.message || 'Failed to send notification'
    }, { status: 500 });
  }
});