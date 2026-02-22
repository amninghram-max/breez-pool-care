import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    // Admin only
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const { requestId, decision, reinstatementFee, adminNotes } = await req.json();

    // Get reinstatement request
    const request = await base44.asServiceRole.entities.ReinstatementRequest.get(requestId);
    if (!request) {
      return Response.json({ error: 'Request not found' }, { status: 404 });
    }

    // Get lead
    const lead = await base44.asServiceRole.entities.Lead.get(request.leadId);
    if (!lead) {
      return Response.json({ error: 'Lead not found' }, { status: 404 });
    }

    if (decision === 'reinstate') {
      // Create reinstatement invoice
      const invoiceResponse = await base44.asServiceRole.functions.invoke('generateMonthlyInvoice', {
        leadId: lead.id
      });
      
      const monthlyInvoice = invoiceResponse.data.invoice;

      // Add reinstatement fee if applicable
      let totalAmount = monthlyInvoice.amount;
      const lineItems = [...monthlyInvoice.lineItems];

      if (reinstatementFee && reinstatementFee > 0) {
        lineItems.push({
          description: 'Reinstatement Fee',
          amount: reinstatementFee,
          quantity: 1
        });
        totalAmount += reinstatementFee;
      }

      // Update invoice
      await base44.asServiceRole.entities.Invoice.update(monthlyInvoice.id, {
        invoiceType: 'reinstatement',
        lineItems,
        amount: totalAmount
      });

      // Update reinstatement request
      await base44.asServiceRole.entities.ReinstatementRequest.update(requestId, {
        status: 'approved',
        adminDecision: 'reinstate',
        reinstatementFee: reinstatementFee || 0,
        adminNotes,
        decisionDate: new Date().toISOString(),
        decisionBy: user.email,
        reinstatementInvoiceId: monthlyInvoice.id
      });

      // Update lead - keep suspended until payment received
      await base44.asServiceRole.entities.Lead.update(lead.id, {
        strictLatePolicy: true // Apply strict policy after reinstatement
      });

      // Send approval notification
      await base44.asServiceRole.functions.invoke('sendBillingNotification', {
        leadId: lead.id,
        notificationType: 'reinstatement_approved',
        invoiceId: monthlyInvoice.id
      });

      return Response.json({ 
        success: true,
        message: 'Reinstatement approved',
        invoiceId: monthlyInvoice.id
      });

    } else if (decision === 'cancel') {
      // Update reinstatement request
      await base44.asServiceRole.entities.ReinstatementRequest.update(requestId, {
        status: 'denied',
        adminDecision: 'cancel',
        adminNotes,
        decisionDate: new Date().toISOString(),
        decisionBy: user.email
      });

      // Update lead to cancelled
      await base44.asServiceRole.entities.Lead.update(lead.id, {
        accountStatus: 'cancelled_nonpayment',
        stage: 'lost'
      });

      // Send denial notification
      await base44.asServiceRole.functions.invoke('sendBillingNotification', {
        leadId: lead.id,
        notificationType: 'reinstatement_denied'
      });

      return Response.json({ 
        success: true,
        message: 'Service cancelled'
      });
    } else {
      return Response.json({ error: 'Invalid decision' }, { status: 400 });
    }

  } catch (error) {
    console.error('Process reinstatement decision error:', error);
    return Response.json({ 
      error: error.message || 'Failed to process decision'
    }, { status: 500 });
  }
});