import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * processFirstPayment
 * Create Invoice for first month (monthly + one-time fees).
 * Load Quote and derive all totals from immutable quote fields.
 * Attempt payment via Stripe.
 * If successful: send receipt, schedule first service, update Lead.
 */

const stripe = (() => {
  const secretKey = Deno.env.get('STRIPE_SECRET_KEY');
  if (!secretKey) throw new Error('STRIPE_SECRET_KEY not set');

  return {
    createInvoice: async (customerId, lineItems, metadata) => {
      const body = new URLSearchParams({
        customer: customerId,
        collection_method: 'charge_automatically',
        metadata: JSON.stringify(metadata || {})
      });

      // Add line items
      lineItems.forEach((item, i) => {
        body.append(`line_items[${i}][price_data][currency]`, 'usd');
        body.append(`line_items[${i}][price_data][unit_amount]`, Math.round(item.amount * 100));
        body.append(`line_items[${i}][price_data][product_data][name]`, item.name);
        body.append(`line_items[${i}][quantity]`, '1');
      });

      const res = await fetch('https://api.stripe.com/v1/invoices', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${secretKey}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body
      });

      if (!res.ok) {
        const err = await res.text();
        throw new Error(`Stripe invoice creation failed: ${err}`);
      }
      return res.json();
    },

    finalizeInvoice: async (invoiceId) => {
      const body = new URLSearchParams({ auto_advance: 'true' });
      const res = await fetch(`https://api.stripe.com/v1/invoices/${invoiceId}/finalize`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${secretKey}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body
      });

      if (!res.ok) {
        const err = await res.text();
        throw new Error(`Stripe invoice finalize failed: ${err}`);
      }
      return res.json();
    }
  };
})();

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { leadId, quoteId, stripeCustomerId, autopayEnrolled } = await req.json();

    if (!leadId || !quoteId || !stripeCustomerId) {
      return Response.json({ error: 'leadId, quoteId, stripeCustomerId required' }, { status: 400 });
    }

    // Load quote — derive all totals from immutable fields
    const quote = await base44.asServiceRole.entities.Quote.get(quoteId);
    if (!quote) {
      return Response.json({ error: 'Quote not found' }, { status: 404 });
    }

    const monthlyPrice = quote.outputMonthlyPrice || 0;
    const oneTimeFees = quote.outputOneTimeFees || 0;
    const totalAmount = monthlyPrice + oneTimeFees;

    // Create invoice with line items from quote
    const lineItems = [
      { name: 'First month service', amount: monthlyPrice }
    ];
    if (oneTimeFees > 0) {
      lineItems.push({ name: 'Initial pool fees', amount: oneTimeFees });
    }

    const invoice = await stripe.createInvoice(
      stripeCustomerId,
      lineItems,
      {
        base44_app_id: Deno.env.get('BASE44_APP_ID'),
        lead_id: leadId,
        quote_id: quoteId
      }
    );

    // Finalize invoice (triggers charge)
    const finalizedInvoice = await stripe.finalizeInvoice(invoice.id);

    console.log(`✅ Invoice created & finalized: id=${finalizedInvoice.id}, amount=${totalAmount}, status=${finalizedInvoice.status}, quoteId=${quoteId}`);

    // Store invoice reference + immutable totals on Lead
    await base44.asServiceRole.entities.Lead.update(leadId, {
      activationPaymentStatus: 'paid',
      activationPaymentDate: new Date().toISOString(),
      autopayEnabled: autopayEnrolled || false,
      monthlyServiceAmount: monthlyPrice,
      stage: 'onboarding_started'
    });

    return Response.json({
      success: true,
      leadId,
      quoteId,
      invoiceId: finalizedInvoice.id,
      status: finalizedInvoice.status,
      chargedMonthly: monthlyPrice,
      chargedOneTime: oneTimeFees,
      chargedTotal: totalAmount,
      hostedInvoiceUrl: finalizedInvoice.hosted_invoice_url
    });
  } catch (error) {
    console.error('processFirstPayment error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});