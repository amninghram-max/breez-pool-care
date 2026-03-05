import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';
import { Resend } from 'npm:resend@4.0.0';
import Stripe from 'npm:stripe@17.5.0';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY'), {
  apiVersion: '2024-12-18.acacia',
});

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    const { sessionId } = await req.json();

    if (!sessionId) {
      return Response.json({ error: 'Session ID required' }, { status: 400 });
    }

    // Retrieve session from Stripe
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (session.payment_status !== 'paid') {
      return Response.json({ 
        error: 'Payment not completed',
        status: session.payment_status 
      }, { status: 400 });
    }

    const leadId = session.metadata.lead_id;
    const autopayEnabled = session.metadata.autopay_enabled === 'true';

    // Get lead
    const lead = await base44.asServiceRole.entities.Lead.get(leadId);

    if (!lead) {
      return Response.json({ error: 'Lead not found' }, { status: 404 });
    }

    // Update lead to Active Customer
    await base44.asServiceRole.entities.Lead.update(leadId, {
      stage: 'converted',
      accountStatus: 'active',
      autopayEnabled: autopayEnabled,
      lastPaymentDate: new Date().toISOString(),
      nextBillingDate: getNextBillingDate(),
      monthlyServiceAmount: lead.monthlyServiceAmount || 0
    });

    // Create first invoice record
    await base44.asServiceRole.entities.Invoice.create({
      leadId: leadId,
      invoiceType: 'bundle',
      status: 'paid',
      amount: session.amount_total / 100,
      stripePaymentIntentId: session.payment_intent,
      issueDate: new Date().toISOString(),
      paidDate: new Date().toISOString()
    });

    // Log analytics events
    await base44.asServiceRole.entities.AnalyticsEvent.create({
      eventType: 'PaymentSucceeded',
      leadId: leadId,
      source: 'client_app',
      amount: session.amount_total / 100,
      metadata: {
        session_id: sessionId,
        autopay_enabled: autopayEnabled
      },
      timestamp: new Date().toISOString()
    });

    await base44.asServiceRole.entities.AnalyticsEvent.create({
      eventType: 'ServiceStarted',
      leadId: leadId,
      source: 'system',
      metadata: {
        autopay: autopayEnabled
      },
      timestamp: new Date().toISOString()
    });

    // Schedule first service with route-efficient day assignment
    let scheduleResult = null;
    try {
      scheduleResult = await base44.asServiceRole.functions.invoke('scheduleNewCustomer', { leadId });
      console.log('[handleActivationPayment] scheduleNewCustomer result:', JSON.stringify(scheduleResult));
    } catch (schedErr) {
      console.warn('[handleActivationPayment] scheduleNewCustomer failed (non-fatal):', schedErr.message);
    }

    // Send welcome email with payment receipt via Resend
    const resend = new Resend(Deno.env.get('RESEND_API_KEY'));
    const amountPaid = (session.amount_total / 100).toFixed(2);
    const firstName = lead.firstName || 'there';
    const TEAL = '#1B9B9F';

    const welcomeHtml = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f4f7f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1f2937;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f7f8;padding:32px 16px;">
    <tr><td align="center">
      <table width="100%" style="max-width:600px;background-color:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.08);">
        <tr>
          <td style="background-color:${TEAL};padding:32px 40px;text-align:center;">
            <img src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/699a2b2056054b0207cea969/0b0c31666_Breez2.png" alt="Breez Pool Care" height="48" style="display:block;margin:0 auto 16px;" />
            <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;">Welcome to Breez! 🎉</h1>
            <p style="margin:6px 0 0;color:rgba(255,255,255,0.85);font-size:14px;">Your pool service is now active</p>
          </td>
        </tr>
        <tr>
          <td style="padding:32px 40px 0;">
            <p style="margin:0;font-size:16px;">Hi <strong>${firstName}</strong>,</p>
            <p style="margin:12px 0 0;font-size:15px;color:#374151;line-height:1.7;">Great news — your account is active and we're scheduling your first service visit. Here's your payment receipt and a summary of what's next.</p>
          </td>
        </tr>
        <!-- Payment Receipt -->
        <tr>
          <td style="padding:24px 40px 0;">
            <h2 style="margin:0 0 12px;font-size:16px;font-weight:700;color:#1f2937;border-bottom:2px solid #e5e7eb;padding-bottom:8px;">Payment Receipt</h2>
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0fdfd;border:2px solid ${TEAL};border-radius:12px;padding:20px;">
              <tr><td style="padding:8px 20px;">
                <table width="100%">
                  <tr>
                    <td style="font-size:14px;color:#374151;">Activation + First Month</td>
                    <td align="right" style="font-size:14px;font-weight:700;color:#1f2937;">$${amountPaid}</td>
                  </tr>
                  <tr>
                    <td style="font-size:13px;color:#6b7280;padding-top:4px;">Date</td>
                    <td align="right" style="font-size:13px;color:#6b7280;padding-top:4px;">${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</td>
                  </tr>
                  ${autopayEnabled ? `<tr><td colspan="2" style="padding-top:12px;font-size:13px;color:${TEAL};font-weight:600;">✓ AutoPay enabled — $10/mo savings applied</td></tr>` : ''}
                </table>
              </td></tr>
            </table>
          </td>
        </tr>
        <!-- What's Next -->
        <tr>
          <td style="padding:24px 40px 0;">
            <h2 style="margin:0 0 12px;font-size:16px;font-weight:700;color:#1f2937;border-bottom:2px solid #e5e7eb;padding-bottom:8px;">What's Next</h2>
            <table cellpadding="0" cellspacing="0" width="100%">
              <tr><td style="padding:6px 0;font-size:14px;color:#374151;line-height:1.6;"><span style="color:${TEAL};font-weight:700;margin-right:8px;">•</span>We're scheduling your <strong>first service visit</strong> — you'll receive confirmation shortly</td></tr>
              <tr><td style="padding:6px 0;font-size:14px;color:#374151;line-height:1.6;"><span style="color:${TEAL};font-weight:700;margin-right:8px;">•</span>Make sure your <strong>pool area is accessible</strong> on service day</td></tr>
              <tr><td style="padding:6px 0;font-size:14px;color:#374151;line-height:1.6;"><span style="color:${TEAL};font-weight:700;margin-right:8px;">•</span>Have your <strong>gate code ready</strong> if applicable</td></tr>
              <tr><td style="padding:6px 0;font-size:14px;color:#374151;line-height:1.6;"><span style="color:${TEAL};font-weight:700;margin-right:8px;">•</span>Log in to your <strong>customer portal</strong> to view service history and reports</td></tr>
            </table>
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="padding:28px 40px 32px;">
            <p style="margin:0 0 16px;font-size:14px;color:#374151;">Questions? Call or text us at <strong>(321) 524-3838</strong>.</p>
            <table width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #e5e7eb;padding-top:20px;">
              <tr><td style="text-align:center;">
                <p style="margin:0;font-size:13px;color:#6b7280;"><strong style="color:#374151;">Breez Pool Care LLC</strong> &nbsp;|&nbsp; (321) 524-3838 &nbsp;|&nbsp; <a href="https://breezpoolcare.com" style="color:${TEAL};text-decoration:none;">breezpoolcare.com</a></p>
                <p style="margin:4px 0 0;font-size:12px;color:#9ca3af;">Space Coast, FL · Mon–Sat 8am–6pm</p>
              </td></tr>
            </table>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

    try {
      await resend.emails.send({
        from: 'Breez Pool Care <noreply@breezpoolcare.com>',
        to: lead.email,
        subject: `Welcome to Breez, ${firstName}! — Your Service is Active`,
        html: welcomeHtml,
        text: `Hi ${firstName},\n\nYour Breez Pool Care service is now active!\n\nPayment Receipt:\n- Amount Paid: $${amountPaid}\n- Date: ${new Date().toLocaleDateString()}\n${autopayEnabled ? '- AutoPay enabled\n' : ''}\nWhat's Next:\n- We're scheduling your first service visit\n- Make sure your pool area is accessible\n- Log in to your customer portal for updates\n\nQuestions? Call (321) 524-3838.\n\n— Breez Pool Care`
      });
      console.log('[handleActivationPayment] Welcome email sent to', lead.email);
    } catch (emailErr) {
      console.warn('[handleActivationPayment] Welcome email failed:', emailErr.message);
    }

    return Response.json({
      success: true,
      message: 'Customer activated successfully',
      leadId,
      firstServiceDate: scheduleResult?.firstServiceDate || null,
      scheduledDayOfWeek: scheduleResult?.scheduledDayOfWeek || null,
    });

  } catch (error) {
    console.error('Handle activation payment error:', error);
    return Response.json(
      { error: error.message || 'Failed to process activation' },
      { status: 500 }
    );
  }
});

function getNextBillingDate() {
  const date = new Date();
  date.setMonth(date.getMonth() + 1);
  return date.toISOString().split('T')[0];
}