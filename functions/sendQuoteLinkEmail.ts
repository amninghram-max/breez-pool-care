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

    // Build quote wizard link with leadId preserved
    const baseUrl = Deno.env.get('BASE_URL') || new URL(req.url).origin;
    const quoteLink = `${baseUrl}/PreQualification?leadId=${leadId}`;

    console.log('📧 sendQuoteLinkEmail:', { leadId, email, quoteLink });

    // Send link-only email via base44 integrations
    const emailRes = await base44.asServiceRole.integrations.Core.SendEmail({
      to: email,
      subject: 'Get Your Breez Pool Service Quote',
      body: `Hi ${firstName},\n\nThank you for your interest in Breez Pool Care! Click the link below to complete your pool questionnaire and get a personalized quote.\n\n${quoteLink}\n\nIf you have any questions, we're here to help!\n\nBest regards,\nBreez Pool Care Team`
    });

    console.log('✅ Quote link email sent:', emailRes);

    return Response.json({
      success: true,
      message: 'Quote link email sent',
      email
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