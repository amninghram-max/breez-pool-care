Deno.serve(async (req) => {
  try {
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

    // Resolve PUBLIC_APP_URL: env var first, then request headers, then error
    let publicAppUrl = Deno.env.get('PUBLIC_APP_URL');
    if (!publicAppUrl) {
      const origin = req.headers.get('origin');
      if (origin && !origin.includes('deno.dev')) {
        publicAppUrl = origin;
        console.log('ℹ️ Using origin header for PUBLIC_APP_URL:', publicAppUrl);
      } else {
        const referer = req.headers.get('referer');
        if (referer && !referer.includes('deno.dev')) {
          try {
            const refererUrl = new URL(referer);
            publicAppUrl = `${refererUrl.protocol}//${refererUrl.host}`;
            console.log('ℹ️ Derived PUBLIC_APP_URL from referer:', publicAppUrl);
          } catch (e) {
            console.error('❌ Invalid referer header:', referer);
          }
        }
      }
    }

    if (!publicAppUrl) {
      console.error('❌ PUBLIC_APP_URL not available (env, origin, or referer)');
      return Response.json({
        success: false,
        error: 'Could not determine application URL'
      }, { status: 500 });
    }

    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    if (!resendApiKey) {
      console.error('❌ RESEND_API_KEY env var not set');
      return Response.json({
        success: false,
        error: 'RESEND_API_KEY environment variable not configured'
      }, { status: 500 });
    }
    const quoteLink = `${publicAppUrl}/PreQualification?leadId=${leadId}`;

    console.log('📧 sendQuoteLinkEmail:', { leadId, email, quoteLink, resendFrom: 'info@breezpoolcare.com' });

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

    // Send email ONLY via Resend API (no Core.SendEmail, supports external addresses)
    const emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'Breez Pool Care <info@breezpoolcare.com>',
        to: [email],
        subject: 'Get Your Breez Pool Service Quote',
        html: htmlBody,
        text: `Hi ${firstName},\n\nThank you for your interest in Breez Pool Care! Click here to get your quote:\n${quoteLink}`
      })
    });

    const emailData = await emailRes.json();
    if (!emailRes.ok) {
      const errorMsg = emailData.message || emailRes.statusText;
      console.error('❌ Resend API error:', errorMsg);
      throw new Error(`Resend API error: ${errorMsg}`);
    }

    console.log('✅ Quote link email sent via Resend:', { id: emailData.id, to: email });

    return Response.json({
      success: true,
      link: quoteLink,
      resendId: emailData.id
    });
  } catch (error) {
    console.error('❌ sendQuoteLinkEmail error:', error);
    return Response.json({
      success: false,
      error: 'Failed to send quote link email',
      message: error.message
    }, { status: 500 });
  }
});