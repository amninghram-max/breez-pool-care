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

    const { invoiceId, paymentMethodId, acknowledgeStrictPolicy } = await req.json();

    // Get invoice
    const invoice = await base44.entities.Invoice.get(invoiceId);
    if (!invoice) {
      return Response.json({ error: 'Invoice not found' }, { status: 404 });
    }

    // Get lead
    const lead = await base44.entities.Lead.get(invoice.leadId);
    if (!lead || !lead.stripeCustomerId) {
      return Response.json({ error: 'Customer not found' }, { status: 404 });
    }

    // Check if reinstatement invoice requires policy acknowledgment
    if (invoice.invoiceType === 'reinstatement' && !acknowledgeStrictPolicy) {
      return Response.json({ 
        error: 'Must acknowledge strict late policy',
        requiresAcknowledgment: true
      }, { status: 400 });
    }

    // Create payment intent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(invoice.amount * 100), // Convert to cents
      currency: 'usd',
      customer: lead.stripeCustomerId,
      payment_method: paymentMethodId,
      confirm: true,
      metadata: {
        invoiceId: invoice.id,
        leadId: lead.id,
        base44_app_id: Deno.env.get('BASE44_APP_ID')
      }
    });

    // Record payment attempt
    const attemptRecord = {
      attemptDate: new Date().toISOString(),
      success: paymentIntent.status === 'succeeded',
      failureReason: paymentIntent.status !== 'succeeded' ? paymentIntent.last_payment_error?.message : null,
      processorResponse: paymentIntent.status
    };

    const updatedAttempts = [...(invoice.paymentAttempts || []), attemptRecord];

    if (paymentIntent.status === 'succeeded') {
      // Update invoice
      await base44.entities.Invoice.update(invoice.id, {
        status: 'paid',
        paidDate: new Date().toISOString(),
        stripePaymentIntentId: paymentIntent.id,
        paymentAttempts: updatedAttempts
      });

      // Update lead
      const leadUpdates = {
        lastPaymentDate: new Date().toISOString()
      };

      // If this was a reinstatement payment, reactivate account
      if (invoice.invoiceType === 'reinstatement') {
        leadUpdates.accountStatus = 'active';
        leadUpdates.suspensionDate = null;
        leadUpdates.strictLatePolicy = true;

        // Update reinstatement request
        const requests = await base44.entities.ReinstatementRequest.filter({
          leadId: lead.id,
          status: 'approved',
          reinstatementInvoiceId: invoice.id
        });
        if (requests.length > 0) {
          await base44.entities.ReinstatementRequest.update(requests[0].id, {
            strictPolicyAcknowledged: true
          });
        }
      }

      await base44.entities.Lead.update(lead.id, leadUpdates);

      return Response.json({ 
        success: true,
        message: 'Payment processed successfully',
        paymentIntent
      });
    } else {
      // Update invoice with failed attempt
      await base44.entities.Invoice.update(invoice.id, {
        paymentAttempts: updatedAttempts
      });

      return Response.json({ 
        success: false,
        message: 'Payment failed',
        reason: paymentIntent.last_payment_error?.message
      }, { status: 402 });
    }

  } catch (error) {
    console.error('Pay invoice error:', error);
    return Response.json({ 
      error: error.message || 'Failed to process payment'
    }, { status: 500 });
  }
});