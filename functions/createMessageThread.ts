import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { leadId, subject, category, initialMessage, attachments, aiConversationTranscript } = await req.json();

    // Get support settings for SLA calculation
    const settings = await base44.entities.SupportSettings.filter({ settingKey: 'default' });
    const config = settings[0] || {};

    // Calculate SLA deadline (48 business hours or next business day)
    const slaDeadline = calculateSLADeadline(config);

    // Create thread
    const thread = await base44.entities.MessageThread.create({
      leadId,
      subject: subject || 'Support Request',
      status: 'new',
      category: category || 'general',
      escalatedFromAI: !!aiConversationTranscript,
      aiConversationTranscript: aiConversationTranscript || [],
      lastMessageAt: new Date().toISOString(),
      lastMessageBy: 'customer',
      slaDeadline
    });

    // Create initial message
    await base44.entities.Message.create({
      threadId: thread.id,
      leadId,
      senderType: 'customer',
      senderName: user.full_name,
      content: initialMessage,
      attachments: attachments || [],
      sentAt: new Date().toISOString()
    });

    // Notify staff (optional - implement email notification)
    try {
      await base44.integrations.Core.SendEmail({
        to: 'support@breezpoolcare.com',
        subject: `New Support Request: ${subject}`,
        body: `New message from ${user.full_name}\n\nCategory: ${category}\n\n${initialMessage}`
      });
    } catch (emailError) {
      console.error('Failed to notify staff:', emailError);
    }

    return Response.json({
      success: true,
      threadId: thread.id
    });

  } catch (error) {
    console.error('Create message thread error:', error);
    return Response.json({ 
      error: error.message || 'Failed to create thread'
    }, { status: 500 });
  }
});

function calculateSLADeadline(config) {
  const now = new Date();
  const slaHours = config.slaHours || 48;
  const businessHours = config.businessHours || {};
  
  // Simple implementation: add 48 hours, skip Sundays
  let deadline = new Date(now.getTime() + slaHours * 60 * 60 * 1000);
  
  // If deadline falls on Sunday, push to Monday 9am
  if (deadline.getDay() === 0) {
    deadline.setDate(deadline.getDate() + 1);
    deadline.setHours(9, 0, 0, 0);
  }
  
  return deadline.toISOString();
}