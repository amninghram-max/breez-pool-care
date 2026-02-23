import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import Stripe from 'npm:stripe@17.5.0';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY'), {
  apiVersion: '2024-12-18.acacia',
});

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { leadId, autopayEnabled } = await req.json();

    // Fetch lead
    const lead = await base44.entities.Lead.get(leadId);
    if (!lead || lead.email !== user.email) {
      return Response.json({ error: 'Lead not found' }, { status: 404 });
    }

    // Fetch quote
    const quotes = await base44.entities.PoolQuestionnaire.filter({
      clientEmail: lead.email
    });
    const quote = quotes[0];

    if (!quote) {
      return Response.json({ error: 'Quote not found' }, { status: 404 });
    }

    // Calculate amounts
    const monthlyAmount = autopayEnabled 
      ? (quote.estimatedMonthlyPrice || 0) - 10 
      : (quote.estimatedMonthlyPrice || 0);
    
    const oneTimeFees = quote.estimatedOneTimeFees || 0;
    const totalAmount = Math.round((monthlyAmount + oneTimeFees) * 100); // Convert to cents

    // Create or get Stripe customer
    let stripeCustomerId = lead.stripeCustomerId;
    
    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        email: lead.email,
        name: `${lead.firstName} ${lead.lastName || ''}`.trim(),
        metadata: {
          lead_id: lead.id,
          base44_app_id: Deno.env.get('BASE44_APP_ID')
        }
      });
      stripeCustomerId = customer.id;

      // Update lead with Stripe customer ID
      await base44.asServiceRole.entities.Lead.update(lead.id, {
        stripeCustomerId: customer.id
      });
    }

    // Create Checkout Session
    const session = await stripe.checkout.sessions.create({
      customer: stripeCustomerId,
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            unit_amount: Math.round(monthlyAmount * 100),
            product_data: {
              name: 'First Month Pool Service',
              description: `${quote.clientSelectedFrequency || quote.recommendedFrequency || 'Weekly'} service`
            }
          },
          quantity: 1
        },
        ...(oneTimeFees > 0 ? [{
          price_data: {
            currency: 'usd',
            unit_amount: Math.round(oneTimeFees * 100),
            product_data: {
              name: 'One-Time Service Fees',
              description: 'Startup and initial treatment fees'
            }
          },
          quantity: 1
        }] : [])
      ],
      success_url: `${req.headers.get('origin')}/PaymentSuccess?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${req.headers.get('origin')}/PaymentSetup`,
      metadata: {
        base44_app_id: Deno.env.get('BASE44_APP_ID'),
        lead_id: lead.id,
        autopay_enabled: autopayEnabled ? 'true' : 'false',
        activation_payment: 'true'
      }
    });

    // Log analytics event
    await base44.asServiceRole.entities.AnalyticsEvent.create({
      eventType: 'PaymentAttempted',
      leadId: lead.id,
      source: 'client_app',
      amount: totalAmount / 100,
      metadata: {
        autopay_enabled: autopayEnabled,
        session_id: session.id
      },
      timestamp: new Date().toISOString()
    });

    return Response.json({
      sessionId: session.id,
      customerId: stripeCustomerId
    });

  } catch (error) {
    console.error('Create activation payment error:', error);
    return Response.json(
      { error: error.message || 'Failed to create payment session' },
      { status: 500 }
    );
  }
});