import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import Stripe from 'npm:stripe@14.11.0';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY'), {
  apiVersion: '2023-10-16',
});

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { leadId, email, firstName, lastName, phone } = await req.json();

    // Get lead
    const lead = await base44.entities.Lead.get(leadId);
    if (!lead) {
      return Response.json({ error: 'Lead not found' }, { status: 404 });
    }

    // Check if already has Stripe customer
    if (lead.stripeCustomerId) {
      return Response.json({ 
        customerId: lead.stripeCustomerId,
        message: 'Customer already exists' 
      });
    }

    // Create Stripe customer
    const customer = await stripe.customers.create({
      email: email || lead.email,
      name: `${firstName || lead.firstName} ${lastName || lead.lastName || ''}`.trim(),
      phone: phone || lead.mobilePhone,
      metadata: {
        leadId: leadId,
        base44_app_id: Deno.env.get('BASE44_APP_ID')
      }
    });

    // Update lead with Stripe customer ID
    await base44.entities.Lead.update(leadId, {
      stripeCustomerId: customer.id
    });

    return Response.json({ 
      customerId: customer.id,
      message: 'Stripe customer created successfully'
    });

  } catch (error) {
    console.error('Create Stripe customer error:', error);
    return Response.json({ 
      error: error.message || 'Failed to create Stripe customer'
    }, { status: 500 });
  }
});