import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import Stripe from 'npm:stripe@14.11.0';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY'), {
  apiVersion: '2023-10-16',
});

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    const { invoiceId } = await req.json();

    // Get invoice
    const invoice = await base44.asServiceRole.entities.Invoice.get(invoiceId);
    if (!invoice) {
      return Response.json({ error: 'Invoice not found' }, { status: 404 });
    }

    // Get lead
    const lead = await base44.asServiceRole.entities.Lead.get(invoice.leadId);
    if (!lead || !lead.stripeCustomerId) {
      return Response.json({ error: 'Customer not found' }, { status: 404 });
    }

    if (!lead.autopayEnabled) {
      return Response.json({ error: 'AutoPay not enabled' }, { status: 400 });
    }

    // Get default payment method
    const paymentMethods = await base44.asServiceRole.entities.PaymentMethod.filter({ 
      leadId: lead.id,
      isDefault: true,
      status: 'active'
    });

    if (paymentMethods.length === 0) {
      return Response.json({ error: 'No active payment method found' }, { status: 400 });
    }

    const paymentMethod = paymentMethods[0];

    // Create payment intent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(invoice.amount * 100), // Convert to cents
      currency: 'usd',
      customer: lead.stripeCustomerId,
      payment_method: paymentMethod.stripePaymentMethodId,
      off_session: true,
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
      await base44.asServiceRole.entities.Invoice.update(invoice.id, {
        status: 'paid',
        paidDate: new Date().toISOString(),
        stripePaymentIntentId: paymentIntent.id,
        paymentAttempts: updatedAttempts
      });

      // Update lead
      await base44.asServiceRole.entities.Lead.update(lead.id, {
        lastPaymentDate: new Date().toISOString()
      });

      // Send success notification
      try {
        await base44.asServiceRole.functions.invoke('sendBillingNotification', {
          leadId: lead.id,
          notificationType: 'autopay_success',
          invoiceId: invoice.id
        });
      } catch (notifyError) {
        console.error('Failed to send success notification:', notifyError);
      }

      return Response.json({ 
        success: true,
        message: 'Payment processed successfully',
        paymentIntent
      });
    } else {
      // Update invoice with failed attempt
      await base44.asServiceRole.entities.Invoice.update(invoice.id, {
        status: 'past_due',
        paymentAttempts: updatedAttempts
      });

      // Send failure notification
      try {
        await base44.asServiceRole.functions.invoke('sendBillingNotification', {
          leadId: lead.id,
          notificationType: 'autopay_failure',
          invoiceId: invoice.id
        });
      } catch (notifyError) {
        console.error('Failed to send failure notification:', notifyError);
      }

      return Response.json({ 
        success: false,
        message: 'Payment failed',
        reason: paymentIntent.last_payment_error?.message
      }, { status: 402 });
    }

  } catch (error) {
    console.error('Process autopayment error:', error);
    
    // Record failed attempt
    if (error.invoiceId) {
      try {
        const invoice = await base44.asServiceRole.entities.Invoice.get(error.invoiceId);
        const updatedAttempts = [...(invoice.paymentAttempts || []), {
          attemptDate: new Date().toISOString(),
          success: false,
          failureReason: error.message,
          processorResponse: 'error'
        }];
        
        await base44.asServiceRole.entities.Invoice.update(error.invoiceId, {
          status: 'past_due',
          paymentAttempts: updatedAttempts
        });
      } catch (updateError) {
        console.error('Failed to update invoice with error:', updateError);
      }
    }

    return Response.json({ 
      error: error.message || 'Failed to process autopayment'
    }, { status: 500 });
  }
});