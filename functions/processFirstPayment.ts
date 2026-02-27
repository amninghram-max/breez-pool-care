import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * processFirstPayment
 * Idempotent first payment processing.
 *
 * Params: { leadId, quoteId, autopayEnrolled }
 * - No stripeCustomerId from client; server loads or creates it
 * - Derive all totals from immutable Quote
 * - Create Invoice record with full audit trail
 * - Check idempotency: if Invoice exists with paidAt, return existing
 *
 * Flow:
 * 1. Load Quote (derive pricing from immutable fields)
 * 2. Load Lead (or fail)
 * 3. Check idempotency: existing Invoice for quoteId with paidAt?
 * 4. Load/create Stripe customer
 * 5. Create Stripe invoice
 * 6. Create Invoice entity record with all immutable fields
 * 7. Update Lead status
 */

const stripe = (() => {
  const secretKey = Deno.env.get('STRIPE_SECRET_KEY');
  if (!secretKey) throw new Error('STRIPE_SECRET_KEY not set');

  return {
    createCustomer: async (email, name, metadata) => {
      const body = new URLSearchParams({
        email,
        name,
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
        throw new Error(`Stripe customer creation failed: ${err}`);
      }
      return res.json();
    },

    createInvoice: async (customerId, lineItems, metadata) => {
      const body = new URLSearchParams({
        customer: customerId,
        collection_method: 'charge_automatically',
        metadata: JSON.stringify(metadata || {})
      });

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
    const { leadId, quoteId, autopayEnrolled } = await req.json();

    if (!leadId || !quoteId) {
      return Response.json({ error: 'leadId and quoteId required' }, { status: 400 });
    }

    // Load quote — derive all pricing from immutable fields
    const quote = await base44.asServiceRole.entities.Quote.get(quoteId);
    if (!quote) {
      return Response.json({ error: 'Quote not found' }, { status: 404 });
    }

    const monthlyPrice = quote.outputMonthlyPrice || 0;
    const oneTimeFees = quote.outputOneTimeFees || 0;
    const totalAmount = monthlyPrice + oneTimeFees;
    const pricingEngineVersion = quote.pricingEngineVersion || 'unknown';

    // Load lead
    const lead = await base44.asServiceRole.entities.Lead.get(leadId);
    if (!lead) {
      return Response.json({ error: 'Lead not found' }, { status: 404 });
    }

    // Idempotency check: existing Invoice for this quoteId with paidAt?
    const existingInvoices = await base44.asServiceRole.entities.Invoice.filter(
      { quoteId, leadId, status: 'paid' },
      '-created_date',
      1
    );

    if (existingInvoices && existingInvoices.length > 0) {
      const existing = existingInvoices[0];
      console.log(`⏭️ Invoice already paid: invoiceId=${existing.id}, quoteId=${quoteId}, amount=${existing.chargedTotal}`);
      return Response.json({
        success: true,
        alreadyPaid: true,
        invoiceId: existing.id,
        chargedMonthly: existing.chargedMonthly,
        chargedOneTime: existing.chargedOneTimeFees,
        chargedTotal: existing.chargedTotal,
        stripeInvoiceId: existing.stripeInvoiceId
      });
    }

    // Load or create Stripe customer
    let stripeCustomerId = lead.stripeCustomerId;
    if (!stripeCustomerId) {
      console.log(`📝 Creating Stripe customer for leadId=${leadId}, email=${lead.email}`);
      const customer = await stripe.createCustomer(
        lead.email,
        `${lead.firstName || ''} ${lead.lastName || ''}`.trim(),
        {
          base44_app_id: Deno.env.get('BASE44_APP_ID'),
          lead_id: leadId
        }
      );
      stripeCustomerId = customer.id;

      // Store on Lead
      await base44.asServiceRole.entities.Lead.update(leadId, {
        stripeCustomerId
      });
      console.log(`✅ Stripe customer created: customerId=${stripeCustomerId}`);
    }

    // Create Stripe invoice
    const lineItems = [
      { name: 'First month service', amount: monthlyPrice }
    ];
    if (oneTimeFees > 0) {
      lineItems.push({ name: 'Initial pool fees', amount: oneTimeFees });
    }

    const stripeInvoice = await stripe.createInvoice(
      stripeCustomerId,
      lineItems,
      {
        base44_app_id: Deno.env.get('BASE44_APP_ID'),
        lead_id: leadId,
        quote_id: quoteId
      }
    );

    // Finalize (charge)
    const finalizedInvoice = await stripe.finalizeInvoice(stripeInvoice.id);

    // Create Invoice entity record — immutable, audit trail
    const invoiceRecord = await base44.asServiceRole.entities.Invoice.create({
      leadId,
      quoteId,
      amount: totalAmount,
      subtotal: totalAmount,
      invoiceType: 'monthly_service',
      chargedMonthly: monthlyPrice,
      chargedOneTimeFees: oneTimeFees,
      chargedTotal: totalAmount,
      pricingEngineVersion,
      stripeInvoiceId: finalizedInvoice.id,
      stripePaymentIntentId: finalizedInvoice.payment_intent || '',
      paidAt: new Date().toISOString(),
      status: 'paid',
      issueDate: new Date().toISOString(),
      lineItems: [
        { description: 'First month service', amount: monthlyPrice },
        ...(oneTimeFees > 0 ? [{ description: 'Initial pool fees', amount: oneTimeFees }] : [])
      ]
    });

    // Update Lead status
    await base44.asServiceRole.entities.Lead.update(leadId, {
      activationPaymentStatus: 'paid',
      activationPaymentDate: new Date().toISOString(),
      autopayEnabled: autopayEnrolled || false,
      monthlyServiceAmount: monthlyPrice,
      stage: 'onboarding_started'
    });

    console.log(`✅ Payment processed: invoiceId=${invoiceRecord.id}, quoteId=${quoteId}, leadId=${leadId}, chargedTotal=${totalAmount}, stripeInvoiceId=${finalizedInvoice.id}`);

    return Response.json({
      success: true,
      invoiceId: invoiceRecord.id,
      quoteId,
      leadId,
      chargedMonthly: monthlyPrice,
      chargedOneTime: oneTimeFees,
      chargedTotal: totalAmount,
      stripeInvoiceId: finalizedInvoice.id,
      paidAt: invoiceRecord.paidAt,
      hostedInvoiceUrl: finalizedInvoice.hosted_invoice_url
    });
  } catch (error) {
    console.error('processFirstPayment error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});