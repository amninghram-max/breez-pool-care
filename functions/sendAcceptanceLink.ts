import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    // Require staff role
    const user = await base44.auth.me();
    if (!user || (user.role !== 'staff' && user.role !== 'admin')) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { leadId } = await req.json();

    if (!leadId) {
      return Response.json({ error: 'Lead ID required' }, { status: 400 });
    }

    // Get lead
    const lead = await base44.entities.Lead.get(leadId);

    if (!lead) {
      return Response.json({ error: 'Lead not found' }, { status: 404 });
    }

    const acceptanceUrl = `${req.headers.get('origin')}/Agreements`;

    // Send email
    await base44.integrations.Core.SendEmail({
      to: lead.email,
      subject: 'Welcome to Breez — Let's Get Your Service Started',
      body: `
        <h2>Hi ${lead.firstName},</h2>
        <p>Thanks again for meeting with us. We're ready to start your pool service.</p>
        <p><strong>Next step:</strong> Review and accept our service agreements, then set up your first payment to activate service.</p>
        <p style="margin: 30px 0;">
          <a href="${acceptanceUrl}" 
             style="background-color: #1B9B9F; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; display: inline-block; font-weight: bold;">
            Review & Activate Service
          </a>
        </p>
        <p>We're excited to take care of your pool.</p>
        <p>— Breez Pool Care</p>
      `
    });

    // Send SMS if preferred
    if (lead.preferredContact === 'text' || lead.secondaryContact === 'text') {
      // Note: SMS sending would require Twilio integration
      // For now, log the intent
      console.log(`SMS would be sent to ${lead.mobilePhone}: Breez: You're approved to start service! Tap to review agreements and activate: ${acceptanceUrl}`);
    }

    // Update lead
    await base44.entities.Lead.update(leadId, {
      stage: 'quote_sent',
      lastContactedAt: new Date().toISOString()
    });

    // Log analytics
    await base44.entities.AnalyticsEvent.create({
      eventType: 'AcceptanceSent',
      leadId: leadId,
      source: 'provider_portal',
      metadata: {
        sent_by: user.email
      },
      timestamp: new Date().toISOString()
    });

    return Response.json({
      success: true,
      message: 'Acceptance link sent successfully'
    });

  } catch (error) {
    console.error('Send acceptance link error:', error);
    return Response.json(
      { error: error.message || 'Failed to send acceptance link' },
      { status: 500 }
    );
  }
});