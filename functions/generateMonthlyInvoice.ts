import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    const { leadId } = await req.json();

    // Get lead
    const lead = await base44.asServiceRole.entities.Lead.get(leadId);
    if (!lead) {
      return Response.json({ error: 'Lead not found' }, { status: 404 });
    }

    if (!lead.monthlyServiceAmount) {
      return Response.json({ error: 'No monthly service amount set' }, { status: 400 });
    }

    // Get billing settings
    const settings = await base44.asServiceRole.entities.BillingSettings.filter({ settingKey: 'default' });
    const billingSettings = settings[0] || {};

    // Calculate amounts
    const subtotal = lead.monthlyServiceAmount;
    const autopayDiscount = (lead.autopayEnabled && billingSettings.autopayEnabled) 
      ? (billingSettings.autopayDiscountAmount || 10) 
      : 0;
    const totalAmount = subtotal - autopayDiscount;

    // Calculate dates
    const today = new Date();
    const dueDate = today.toISOString();
    const graceEndDate = new Date(today.getTime() + (billingSettings.gracePeriodHours || 72) * 60 * 60 * 1000).toISOString();
    
    // Service period: next month
    const servicePeriodStart = new Date(today.getFullYear(), today.getMonth() + 1, 1);
    const servicePeriodEnd = new Date(today.getFullYear(), today.getMonth() + 2, 0);

    // Generate invoice number
    const invoiceNumber = `INV-${Date.now()}-${leadId.slice(-6)}`;

    // Create line items
    const lineItems = [
      {
        description: `Pool Service - ${servicePeriodStart.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`,
        amount: subtotal,
        quantity: 1
      }
    ];

    if (autopayDiscount > 0) {
      lineItems.push({
        description: 'AutoPay Discount',
        amount: -autopayDiscount,
        quantity: 1
      });
    }

    // Create invoice
    const invoice = await base44.asServiceRole.entities.Invoice.create({
      leadId,
      invoiceNumber,
      status: 'open',
      invoiceType: 'monthly_service',
      amount: totalAmount,
      subtotal,
      autopayDiscount,
      lineItems,
      servicePeriodStart: servicePeriodStart.toISOString().split('T')[0],
      servicePeriodEnd: servicePeriodEnd.toISOString().split('T')[0],
      issueDate: dueDate,
      dueDate,
      graceEndDate,
      paymentAttempts: []
    });

    // Update lead's next billing date
    const nextBillingDate = new Date(servicePeriodStart);
    nextBillingDate.setMonth(nextBillingDate.getMonth() + 1);
    
    await base44.asServiceRole.entities.Lead.update(leadId, {
      nextBillingDate: nextBillingDate.toISOString().split('T')[0]
    });

    // Send notification if not autopay
    if (!lead.autopayEnabled && billingSettings.notificationSettings?.sendPaymentDue) {
      try {
        await base44.asServiceRole.functions.invoke('sendBillingNotification', {
          leadId,
          notificationType: 'payment_due',
          invoiceId: invoice.id
        });
      } catch (notifyError) {
        console.error('Failed to send payment due notification:', notifyError);
      }
    }

    return Response.json({ 
      success: true,
      invoice
    });

  } catch (error) {
    console.error('Generate monthly invoice error:', error);
    return Response.json({ 
      error: error.message || 'Failed to generate invoice'
    }, { status: 500 });
  }
});