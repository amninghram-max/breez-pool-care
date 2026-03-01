import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const payload = await req.json();
    const { leadId, firstName, email } = payload;

    // Validate required fields
    const missingFields = [];
    if (!leadId) missingFields.push('leadId');
    if (!firstName) missingFields.push('firstName');
    if (!email) missingFields.push('email');

    if (missingFields.length > 0) {
      console.warn('❌ sendQuoteLinkEmail: Missing required fields:', missingFields);
      return Response.json({
        success: false,
        error: 'Missing required fields',
        missingFields
      }, { status: 400 });
    }

    // Build frontend app link (base44.app, not deno.dev)
    const publicAppUrl = Deno.env.get('PUBLIC_APP_URL');
    if (!publicAppUrl) {
      throw new Error('PUBLIC_APP_URL environment variable not set');
    }
    const quoteLink = `${publicAppUrl}/PreQualification?leadId=${leadId}`;

    console.log('📧 sendQuoteLinkEmail:', { leadId, email, quoteLink });

    // Send HTML email with branded CTA button via Resend (supports external emails)
    const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333;">
  <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
    <!-- Header -->
    <div style="text-align: center; margin-bottom: 30px;">
      <h2 style="color: #1B9B9F; margin: 0; font-size: 24px;">Breez Pool Care</h2>
    </div>
    
    <!-- Greeting -->
    <p style="font-size: 16px; margin-bottom: 20px;">Hi ${firstName},</p>
    
    <!-- Body -->
    <p style="font-size: 15px; margin-bottom: 20px;">
      Thank you for your interest in Breez Pool Care! We're excited to help you keep your pool crystal clear.
    </p>
    <p style="font-size: 15px; margin-bottom: 30px;">
      Click the button below to complete your pool questionnaire and get a personalized service quote in just a few minutes.
    </p>
    
    <!-- CTA Button -->
    <div style="text-align: center; margin-bottom: 30px;">
      <a href="${quoteLink}" style="display: inline-block; background-color: #1B9B9F; color: white; padding: 14px 32px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px; transition: background-color 200ms ease;">
        Get Your Free Quote
      </a>
    </div>
    
    <!-- Fallback Link -->
    <p style="font-size: 13px; text-align: center; color: #666; margin-bottom: 30px;">
      Or copy and paste this link in your browser:<br>
      <span style="color: #1B9B9F; word-break: break-all;"><a href="${quoteLink}" style="color: #1B9B9F; text-decoration: underline;">${quoteLink}</a></span>
    </p>
    
    <!-- Footer -->
    <div style="border-top: 1px solid #eee; padding-top: 20px; text-align: center; color: #666; font-size: 13px;">
      <p style="margin: 5px 0;">
        If you have any questions, we're here to help!<br>
        <strong>Breez Pool Care Team</strong>
      </p>
    </div>
  </div>
</body>
</html>
    `;

    // Send via Resend API (supports external addresses)
    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    if (!resendApiKey) {
      throw new Error('RESEND_API_KEY not configured');
    }

    const emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'noreply@breezpoolcare.com',
        to: email,
        subject: 'Get Your Breez Pool Service Quote',
        html: htmlBody
      })
    });

    const emailData = await emailRes.json();
    if (!emailRes.ok) {
      throw new Error(`Resend API error: ${emailData.message || emailRes.statusText}`);
    }

    console.log('✅ Quote link email sent via Resend:', emailData);

    // Update lead email and log timestamp (service role, no stage change)
    try {
      const timestamp = new Date().toISOString();
      const updatePayload = {};
      if (email) updatePayload.email = email;
      
      // Fetch current lead to append notes safely
      const leadList = await base44.asServiceRole.entities.Lead.list();
      const currentLead = leadList.find(l => l.id === leadId);
      const existingNotes = currentLead?.notes || '';
      updatePayload.notes = (existingNotes + `\n[QUOTE_LINK_SENT] ${timestamp}`).trim();

      await base44.asServiceRole.entities.Lead.update(leadId, updatePayload);
      console.log('✅ Lead updated (email + timestamp logged)', { leadId });

      return Response.json({
        success: true,
        message: 'Quote link email sent',
        email,
        emailSent: true,
        leadUpdated: true,
        link: quoteLink
      });
    } catch (updateError) {
      console.warn('⚠️ Email sent but lead update failed:', updateError.message);
      return Response.json({
        success: true,
        message: 'Quote link email sent',
        email,
        emailSent: true,
        leadUpdated: false,
        link: quoteLink,
        warning: `Email sent but could not log timestamp: ${updateError.message}`
      });
    }
  } catch (error) {
    console.error('❌ sendQuoteLinkEmail error:', error);
    return Response.json({
      success: false,
      error: 'Failed to send quote link email',
      message: error.message
    }, { status: 500 });
  }
});