import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * createStripeCustomerFromQuote
 * Create Stripe Customer from accepted quote.
 * Stores stripeCustomerId on Lead for future billing.
 */

const stripe = (() => {
  const secretKey = Deno.env.get('STRIPE_SECRET_KEY');
  if (!secretKey) throw new Error('STRIPE_SECRET_KEY not set');

  return {
    createCustomer: async (email, metadata) => {
      const body = new URLSearchParams({
        email,
        metadata: JSON.stringify(metadata || {})
      });

      const res = await fetch('https://api.stripe.com/v1/customers', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${secretKey}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body
      });

      if (!res.ok) {
        const err = await res.text();
        throw new Error(`Stripe API error: ${err}`);
      }
      return res.json();
    }
  };
})();

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { leadId, quoteId, clientEmail, clientFirstName } = await req.json();

    if (!leadId || !clientEmail) {
      return Response.json({ error: 'leadId and clientEmail required' }, { status: 400 });
    }

    // Check if lead already has stripeCustomerId
    const lead = await base44.asServiceRole.entities.Lead.get(leadId);
    if (lead?.stripeCustomerId) {
      return Response.json({
        success: true,
        leadId,
        stripeCustomerId: lead.stripeCustomerId,
        alreadyExists: true
      });
    }

    // Create Stripe customer
    const customer = await stripe.createCustomer(clientEmail, {
      base44_app_id: Deno.env.get('BASE44_APP_ID'),
      lead_id: leadId,
      quote_id: quoteId
    });

    // Store stripeCustomerId on Lead
    await base44.asServiceRole.entities.Lead.update(leadId, {
      stripeCustomerId: customer.id
    });

    console.log(`✅ Stripe customer created: id=${customer.id}, email=${clientEmail}`);

    return Response.json({
      success: true,
      leadId,
      stripeCustomerId: customer.id,
      email: customer.email
    });
  } catch (error) {
    console.error('createStripeCustomerFromQuote error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});