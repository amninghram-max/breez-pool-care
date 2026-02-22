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

    const { leadId, paymentMethodId, setAsDefault, enableAutopay } = await req.json();

    // Get lead
    const lead = await base44.entities.Lead.get(leadId);
    if (!lead) {
      return Response.json({ error: 'Lead not found' }, { status: 404 });
    }

    if (!lead.stripeCustomerId) {
      return Response.json({ error: 'No Stripe customer ID found' }, { status: 400 });
    }

    // Attach payment method to customer
    await stripe.paymentMethods.attach(paymentMethodId, {
      customer: lead.stripeCustomerId,
    });

    // Get payment method details
    const paymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId);

    // Set as default if requested
    if (setAsDefault) {
      await stripe.customers.update(lead.stripeCustomerId, {
        invoice_settings: {
          default_payment_method: paymentMethodId,
        },
      });

      // Mark other payment methods as not default
      const existingMethods = await base44.entities.PaymentMethod.filter({ leadId });
      for (const method of existingMethods) {
        if (method.isDefault) {
          await base44.entities.PaymentMethod.update(method.id, { isDefault: false });
        }
      }
    }

    // Create PaymentMethod record
    const paymentMethodData = {
      leadId,
      stripePaymentMethodId: paymentMethodId,
      type: paymentMethod.type === 'card' ? 'card' : paymentMethod.type === 'us_bank_account' ? 'bank_account' : 'digital_wallet',
      brand: paymentMethod.card?.brand || paymentMethod.us_bank_account?.bank_name || 'unknown',
      last4: paymentMethod.card?.last4 || paymentMethod.us_bank_account?.last4 || '',
      expirationMonth: paymentMethod.card?.exp_month,
      expirationYear: paymentMethod.card?.exp_year,
      isDefault: setAsDefault || false,
      isAutopay: enableAutopay || false,
      status: 'active',
      addedDate: new Date().toISOString()
    };

    const savedMethod = await base44.entities.PaymentMethod.create(paymentMethodData);

    // If autopay enabled, update lead
    if (enableAutopay) {
      await base44.entities.Lead.update(leadId, {
        autopayEnabled: true
      });
    }

    return Response.json({ 
      success: true,
      paymentMethod: savedMethod
    });

  } catch (error) {
    console.error('Add payment method error:', error);
    return Response.json({ 
      error: error.message || 'Failed to add payment method'
    }, { status: 500 });
  }
});