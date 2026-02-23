import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import Stripe from 'npm:stripe@17.5.0';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY'), {
  apiVersion: '2024-12-18.acacia',
});

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    const { sessionId } = await req.json();

    if (!sessionId) {
      return Response.json({ error: 'Session ID required' }, { status: 400 });
    }

    // Retrieve session from Stripe
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (session.payment_status !== 'paid') {
      return Response.json({ 
        error: 'Payment not completed',
        status: session.payment_status 
      }, { status: 400 });
    }

    const leadId = session.metadata.lead_id;
    const autopayEnabled = session.metadata.autopay_enabled === 'true';

    // Get lead
    const lead = await base44.asServiceRole.entities.Lead.get(leadId);

    if (!lead) {
      return Response.json({ error: 'Lead not found' }, { status: 404 });
    }

    // Update lead to Active Customer
    await base44.asServiceRole.entities.Lead.update(leadId, {
      stage: 'converted',
      accountStatus: 'active',
      autopayEnabled: autopayEnabled,
      lastPaymentDate: new Date().toISOString(),
      nextBillingDate: getNextBillingDate(),
      monthlyServiceAmount: lead.monthlyServiceAmount || 0
    });

    // Create first invoice record
    await base44.asServiceRole.entities.Invoice.create({
      leadId: leadId,
      invoiceType: 'bundle',
      status: 'paid',
      amount: session.amount_total / 100,
      stripePaymentIntentId: session.payment_intent,
      issueDate: new Date().toISOString(),
      paidDate: new Date().toISOString()
    });

    // Log analytics events
    await base44.asServiceRole.entities.AnalyticsEvent.create({
      eventType: 'PaymentSucceeded',
      leadId: leadId,
      source: 'client_app',
      amount: session.amount_total / 100,
      metadata: {
        session_id: sessionId,
        autopay_enabled: autopayEnabled
      },
      timestamp: new Date().toISOString()
    });

    await base44.asServiceRole.entities.AnalyticsEvent.create({
      eventType: 'CustomerActivated',
      leadId: leadId,
      source: 'system',
      metadata: {
        autopay: autopayEnabled
      },
      timestamp: new Date().toISOString()
    });

    // Schedule first service (invoke scheduling function)
    await base44.asServiceRole.functions.invoke('scheduleNewCustomer', {
      leadId: leadId
    });

    // Send welcome/activation email
    await base44.asServiceRole.integrations.Core.SendEmail({
      to: lead.email,
      subject: 'Welcome to Breez — Your Service is Active! 🎉',
      body: `
        <h2>Hi ${lead.firstName},</h2>
        <p>Great news — your pool service is now active!</p>
        <p>We're scheduling your first service visit and will send you the details shortly.</p>
        <p><strong>What's Next:</strong></p>
        <ul>
          <li>Check your email for your first service appointment</li>
          <li>Make sure pool area is accessible</li>
          <li>Have your gate code ready (if applicable)</li>
        </ul>
        ${autopayEnabled ? '<p>✓ AutoPay is enabled — you\'ll save $10/month and never miss a payment.</p>' : ''}
        <p>Questions? Call us at (321) 524-3838 or reply to this email.</p>
        <p>— Breez Pool Care Team</p>
      `
    });

    return Response.json({
      success: true,
      message: 'Customer activated successfully',
      leadId: leadId
    });

  } catch (error) {
    console.error('Handle activation payment error:', error);
    return Response.json(
      { error: error.message || 'Failed to process activation' },
      { status: 500 }
    );
  }
});

function getNextBillingDate() {
  const date = new Date();
  date.setMonth(date.getMonth() + 1);
  return date.toISOString().split('T')[0];
}