import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { threadId, content, attachments, isInternal } = await req.json();

    // Get thread
    const thread = await base44.entities.MessageThread.get(threadId);
    if (!thread) {
      return Response.json({ error: 'Thread not found' }, { status: 404 });
    }

    // Determine sender type
    const senderType = user.role === 'admin' ? 'staff' : 'customer';

    // Check permissions
    if (senderType === 'customer' && thread.leadId !== user.email) {
      return Response.json({ error: 'Access denied' }, { status: 403 });
    }

    // Create message
    const message = await base44.entities.Message.create({
      threadId,
      leadId: thread.leadId,
      senderType,
      senderName: user.full_name,
      content,
      attachments: attachments || [],
      isInternal: isInternal || false,
      sentAt: new Date().toISOString(),
      readByCustomer: senderType === 'customer',
      readByStaff: senderType === 'staff'
    });

    // Update thread
    const updates = {
      lastMessageAt: new Date().toISOString(),
      lastMessageBy: senderType,
      status: senderType === 'customer' ? 'new' : 'waiting_on_customer'
    };

    // If this is first staff response, record it
    if (senderType === 'staff' && !thread.firstResponseAt) {
      updates.firstResponseAt = new Date().toISOString();
      updates.slaMet = new Date() <= new Date(thread.slaDeadline);
    }

    await base44.entities.MessageThread.update(threadId, updates);

    // Send notification to the other party
    if (senderType === 'staff' && !isInternal) {
      // Notify customer
      try {
        const lead = await base44.entities.Lead.get(thread.leadId);
        if (lead) {
          await base44.integrations.Core.SendEmail({
            to: lead.email,
            subject: `New message from Breez: ${thread.subject}`,
            body: `You have a new message from our team.\n\nView in app: [Link]\n\n${content}`
          });
        }
      } catch (notifyError) {
        console.error('Failed to notify customer:', notifyError);
      }
    }

    return Response.json({
      success: true,
      messageId: message.id
    });

  } catch (error) {
    console.error('Send message error:', error);
    return Response.json({ 
      error: error.message || 'Failed to send message'
    }, { status: 500 });
  }
});