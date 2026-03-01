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
        leadUpdated: true
      });
    } catch (updateError) {
      console.warn('⚠️ Email sent but lead update failed:', updateError.message);
      return Response.json({
        success: true,
        message: 'Quote link email sent',
        email,
        emailSent: true,
        leadUpdated: false,
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