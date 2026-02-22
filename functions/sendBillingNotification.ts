import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    const { leadId, notificationType, invoiceId } = await req.json();

    // Get lead
    const lead = await base44.asServiceRole.entities.Lead.get(leadId);
    if (!lead) {
      return Response.json({ error: 'Lead not found' }, { status: 404 });
    }

    // Get billing settings
    const settings = await base44.asServiceRole.entities.BillingSettings.filter({ settingKey: 'default' });
    const billingSettings = settings[0] || {};

    // Get invoice if provided
    let invoice = null;
    if (invoiceId) {
      invoice = await base44.asServiceRole.entities.Invoice.get(invoiceId);
    }

    // Get template
    const templates = billingSettings.emailTemplates || {};
    let template = {};
    let shouldSend = true;

    switch (notificationType) {
      case 'payment_due':
        template = templates.paymentDue || {
          subject: 'Your next month of service is ready',
          body: `Hi ${lead.firstName},\n\nYour next month of pool service is ready.\n\nAmount due: $${invoice?.amount || 0}\nDue: Now\n\nPay here: [Payment Link]`
        };
        shouldSend = billingSettings.notificationSettings?.sendPaymentDue !== false;
        break;
      
      case 'autopay_success':
        template = templates.autopaySuccess || {
          subject: 'Payment received — thank you!',
          body: `Hi ${lead.firstName},\n\nYour payment of $${invoice?.amount || 0} has been received. Thank you!\n\n— Breez Pool Care`
        };
        shouldSend = billingSettings.notificationSettings?.sendAutopaySuccess !== false;
        break;
      
      case 'autopay_failure':
        template = templates.autopayFailure || {
          subject: "Payment didn't go through — please update your payment method",
          body: `Hi ${lead.firstName},\n\nWe were unable to process your payment. Please update your payment method to keep your service active.\n\nUpdate here: [Payment Link]`
        };
        shouldSend = billingSettings.notificationSettings?.sendAutopayFailure !== false;
        break;
      
      case 'grace_warning':
        template = templates.graceWarning || {
          subject: 'Action needed to avoid service pause',
          body: `Hi ${lead.firstName},\n\nYour payment is overdue. Please pay within 24 hours to avoid service interruption.\n\nPay here: [Payment Link]`
        };
        shouldSend = billingSettings.notificationSettings?.sendGraceWarning24h !== false;
        break;
      
      case 'service_suspended':
        template = templates.serviceSuspended || {
          subject: 'Service paused',
          body: `Hi ${lead.firstName},\n\nYour service has been paused due to unpaid invoice. Please contact us to reinstate service.`
        };
        shouldSend = billingSettings.notificationSettings?.sendSuspensionNotice !== false;
        break;
      
      case 'service_complete':
        template = templates.serviceComplete || {
          subject: 'Your Breez service is complete',
          body: `Hi ${lead.firstName},\n\nYour pool service has been completed.\n\n— Breez Pool Care`
        };
        shouldSend = billingSettings.notificationSettings?.sendServiceComplete !== false;
        break;
      
      case 'reinstatement_approved':
        template = templates.reinstatementApproved || {
          subject: 'Breez Service Reinstatement Approved',
          body: `Hi ${lead.firstName},\n\nThanks for reaching out. We can reinstate your pool service.\n\nTo restart service, payment is required today.\n\nImportant: Future late payments may result in immediate cancellation of service.\n\nThank you,\n— Breez Pool Care`
        };
        break;
      
      case 'reinstatement_denied':
        template = templates.reinstatementDenied || {
          subject: 'Update About Your Breez Service',
          body: `Hi ${lead.firstName},\n\nWe're unable to continue service at this time due to unresolved billing.\n\nIf you believe this is a mistake or would like to discuss options, please contact us.\n\nThank you,\n— Breez Pool Care`
        };
        break;
      
      default:
        return Response.json({ error: 'Invalid notification type' }, { status: 400 });
    }

    if (!shouldSend) {
      return Response.json({ success: true, message: 'Notification disabled in settings' });
    }

    // Send email
    try {
      await base44.asServiceRole.integrations.Core.SendEmail({
        to: lead.email,
        subject: template.subject,
        body: template.body
      });
    } catch (emailError) {
      console.error('Failed to send email:', emailError);
    }

    // Send SMS if preferred contact is text
    if (lead.preferredContact === 'text' && lead.mobilePhone) {
      try {
        const smsBody = template.body.substring(0, 160); // Truncate for SMS
        await base44.asServiceRole.integrations.Core.SendEmail({
          to: `${lead.mobilePhone.replace(/\D/g, '')}@sms-gateway.com`,
          subject: '',
          body: smsBody
        });
      } catch (smsError) {
        console.error('Failed to send SMS:', smsError);
      }
    }

    return Response.json({ 
      success: true,
      message: 'Notification sent'
    });

  } catch (error) {
    console.error('Send billing notification error:', error);
    return Response.json({ 
      error: error.message || 'Failed to send notification'
    }, { status: 500 });
  }
});