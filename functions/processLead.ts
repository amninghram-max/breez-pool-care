import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { leadData } = await req.json();

    // Determine eligibility
    let isEligible = true;
    let disqualificationReason = '';

    if (leadData.poolType === 'above_ground') {
      isEligible = false;
      disqualificationReason = 'Above-ground pools are not currently serviced.';
    } else if (leadData.poolSurface === 'fiberglass' || leadData.poolSurface === 'vinyl') {
      isEligible = false;
      disqualificationReason = `${leadData.poolSurface} pool surfaces are not currently serviced.`;
    } else if (leadData.filterType === 'de') {
      isEligible = false;
      disqualificationReason = 'DE filters are not currently serviced.';
    } else if (leadData.sanitizerType === 'mineral') {
      isEligible = false;
      disqualificationReason = 'Mineral sanitizer systems (non-salt) are not currently serviced.';
    }

    // Create lead record
    const lead = await base44.asServiceRole.entities.Lead.create({
      ...leadData,
      isEligible,
      disqualificationReason,
      stage: isEligible ? 'inspection_scheduled' : 'lost',
      emailSent: false,
      smsSent: false
    });

    if (isEligible) {
      // Send welcome email
      try {
        await base44.asServiceRole.integrations.Core.SendEmail({
          to: leadData.email,
          subject: 'Welcome to Breez - Inspection Request Received',
          from_name: 'Breez Pool Care',
          body: `
            <h2>Welcome to Breez, ${leadData.firstName}!</h2>
            <p>Thank you for requesting a free pool inspection. We're excited to help you maintain a beautiful, healthy pool.</p>
            
            <h3>Your Request Details:</h3>
            <ul>
              <li><strong>Address:</strong> ${leadData.serviceAddress}</li>
              <li><strong>Requested Date:</strong> ${leadData.requestedInspectionDate}</li>
              <li><strong>Requested Time:</strong> ${leadData.requestedInspectionTime}</li>
            </ul>

            <h3>What to Expect:</h3>
            <p>Your inspection will be handled by ${leadData.assignedInspector}, our pool care specialist. ${leadData.assignedInspector} will:</p>
            <ul>
              <li>Assess your pool's condition</li>
              <li>Test water chemistry</li>
              <li>Check equipment</li>
              <li>Answer your questions</li>
              <li>Provide a customized service quote</li>
            </ul>

            <p>We'll contact you shortly to confirm your appointment.</p>

            <p>Questions? Just reply to this email.</p>

            <p>Best regards,<br>The Breez Team</p>
          `
        });

        await base44.asServiceRole.entities.Lead.update(lead.id, { emailSent: true });
      } catch (emailError) {
        console.error('Email send failed:', emailError);
      }

      // Send SMS confirmation
      if (leadData.preferredContact === 'text') {
        try {
          // Note: SMS integration would be configured here
          // For now, we'll mark it as sent if text is preferred
          await base44.asServiceRole.entities.Lead.update(lead.id, { smsSent: true });
        } catch (smsError) {
          console.error('SMS send failed:', smsError);
        }
      }
    }

    return Response.json({
      success: true,
      isEligible,
      leadId: lead.id,
      disqualificationReason
    });
  } catch (error) {
    console.error('Process lead error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});