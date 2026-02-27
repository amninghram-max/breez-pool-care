import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * contactCustomerAction
 * Manual-only action triggered by admin/staff.
 * Reads pool + lead contact info, sends notification,
 * creates immutable CustomerNotificationLog,
 * and updates FrequencyRecommendation.status → 'contacted'.
 *
 * Uses reversible language — notification does NOT commit the customer
 * to a billing change. Advisory only.
 *
 * Input:  { recommendationId: string }
 * Output: { success, notificationLogId, recommendationId, sentTo }
 */

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || !['admin', 'staff'].includes(user.role)) {
      return Response.json({ error: 'Unauthorized — admin or staff only' }, { status: 403 });
    }

    const { recommendationId } = await req.json();
    if (!recommendationId) {
      return Response.json({ error: 'recommendationId is required' }, { status: 400 });
    }

    // Load recommendation
    const recs = await base44.asServiceRole.entities.FrequencyRecommendation.filter({ id: recommendationId });
    const rec = recs[0];
    if (!rec) {
      return Response.json({ error: 'FrequencyRecommendation not found' }, { status: 404 });
    }

    if (rec.status === 'dismissed') {
      return Response.json({ error: 'Recommendation is dismissed — cannot contact' }, { status: 400 });
    }

    // Load lead for contact info
    const leads = await base44.asServiceRole.entities.Lead.filter({ id: rec.leadId });
    const lead = leads[0];
    if (!lead) {
      return Response.json({ error: 'Lead not found for this recommendation' }, { status: 404 });
    }

    // Load pool for context
    const pools = await base44.asServiceRole.entities.Pool.filter({ id: rec.poolId });
    const pool = pools[0];

    const recipientEmail = lead.email;
    const recipientName = lead.firstName || 'valued customer';
    const poolDesc = pool?.poolSize ? `your ${pool.poolSize.replace('_', '-').replace('k', 'K gallon')} pool` : 'your pool';

    if (!recipientEmail) {
      return Response.json({ error: 'Lead has no email address' }, { status: 400 });
    }

    const now = new Date().toISOString();

    // Reversible advisory language — no billing commitment
    const subject = `A quick update about your Breez pool service`;
    const body = `Hi ${recipientName},

Your Breez team has been monitoring the chemistry trends for ${poolDesc} over the past several weeks.

Based on recent readings, we believe your pool may benefit from an increased service frequency. We'd like to discuss what that could look like and whether it makes sense for you.

This is just an advisory note — no changes have been made to your service or billing. We'll reach out to walk you through the options and answer any questions.

If you'd like to chat sooner, feel free to reply to this email or call us directly.

Thanks for being a Breez customer.

— The Breez Team`;

    // Send email notification
    let emailSent = false;
    let emailError = null;

    try {
      await base44.integrations.Core.SendEmail({
        to: recipientEmail,
        subject,
        body,
        from_name: 'Breez Pool Care'
      });
      emailSent = true;
      console.log(`contactCustomerAction: email sent to ${recipientEmail} for recommendation ${recommendationId}`);
    } catch (emailErr) {
      emailError = emailErr.message;
      console.error(`contactCustomerAction: email failed for ${recipientEmail}:`, emailErr.message);
    }

    // Create immutable CustomerNotificationLog
    const logEntry = await base44.asServiceRole.entities.CustomerNotificationLog.create({
      poolId: rec.poolId,
      leadId: rec.leadId,
      recommendationId,
      channel: 'email',
      recipient: recipientEmail,
      subject,
      body,
      sentAt: now,
      status: emailSent ? 'sent' : 'failed',
      errorMessage: emailError ?? null,
      sentBy: user.id
    });

    // Update recommendation status — only if email succeeded
    if (emailSent) {
      await base44.asServiceRole.entities.FrequencyRecommendation.update(recommendationId, {
        status: 'contacted',
        contactedAt: now,
        contactedBy: user.id
      });
    }

    console.log(`contactCustomerAction complete: logId=${logEntry.id}, success=${emailSent}`);

    return Response.json({
      success: emailSent,
      notificationLogId: logEntry.id,
      recommendationId,
      sentTo: recipientEmail,
      ...(emailError ? { error: emailError } : {})
    });

  } catch (error) {
    console.error('contactCustomerAction error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});