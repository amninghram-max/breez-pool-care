import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    // Admin only
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    // Get all open or past_due invoices
    const invoices = await base44.asServiceRole.entities.Invoice.filter({});
    const overdueInvoices = invoices.filter(inv => 
      (inv.status === 'open' || inv.status === 'past_due') && 
      inv.graceEndDate
    );

    const now = new Date();
    const suspendedAccounts = [];
    const warningsSent = [];

    // Get billing settings
    const settings = await base44.asServiceRole.entities.BillingSettings.filter({ settingKey: 'default' });
    const billingSettings = settings[0] || {};

    for (const invoice of overdueInvoices) {
      const graceEnd = new Date(invoice.graceEndDate);
      const timeUntilSuspension = graceEnd.getTime() - now.getTime();
      const hoursUntilSuspension = timeUntilSuspension / (1000 * 60 * 60);

      const lead = await base44.asServiceRole.entities.Lead.get(invoice.leadId);
      if (!lead) continue;

      // Check if grace period has expired
      if (now >= graceEnd && lead.accountStatus === 'active') {
        // Suspend account
        await base44.asServiceRole.entities.Lead.update(lead.id, {
          accountStatus: lead.strictLatePolicy ? 'suspended_strict' : 'suspended_billing',
          suspensionDate: now.toISOString()
        });

        // Send suspension notification
        if (billingSettings.notificationSettings?.sendSuspensionNotice) {
          try {
            await base44.asServiceRole.functions.invoke('sendBillingNotification', {
              leadId: lead.id,
              notificationType: 'service_suspended',
              invoiceId: invoice.id
            });
          } catch (notifyError) {
            console.error('Failed to send suspension notification:', notifyError);
          }
        }

        suspendedAccounts.push({ leadId: lead.id, invoiceId: invoice.id });
      }
      // Send 24-hour warning
      else if (hoursUntilSuspension > 0 && hoursUntilSuspension <= 24 && lead.accountStatus === 'active') {
        // Check if warning already sent (avoid duplicate warnings)
        const existingWarnings = invoice.paymentAttempts?.filter(a => 
          a.failureReason === 'grace_warning_24h'
        ) || [];

        if (existingWarnings.length === 0 && billingSettings.notificationSettings?.sendGraceWarning24h) {
          try {
            await base44.asServiceRole.functions.invoke('sendBillingNotification', {
              leadId: lead.id,
              notificationType: 'grace_warning',
              invoiceId: invoice.id
            });

            // Mark warning as sent
            await base44.asServiceRole.entities.Invoice.update(invoice.id, {
              paymentAttempts: [...(invoice.paymentAttempts || []), {
                attemptDate: now.toISOString(),
                success: false,
                failureReason: 'grace_warning_24h',
                processorResponse: 'notification_sent'
              }]
            });

            warningsSent.push({ leadId: lead.id, invoiceId: invoice.id });
          } catch (notifyError) {
            console.error('Failed to send grace warning:', notifyError);
          }
        }
      }
    }

    return Response.json({ 
      success: true,
      suspendedCount: suspendedAccounts.length,
      warningsCount: warningsSent.length,
      suspendedAccounts,
      warningsSent
    });

  } catch (error) {
    console.error('Check grace period error:', error);
    return Response.json({ 
      error: error.message || 'Failed to check grace period'
    }, { status: 500 });
  }
});