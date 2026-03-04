import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

const BUILD = 'batchFollowUpEmailV1';

// Email template definitions
const TEMPLATES = {
  new_lead_followup: {
    subject: "Don't miss your free pool inspection — schedule today",
    bodyTemplate: (firstName) => `Hi ${firstName},

We'd love to get your pool in perfect condition! A free professional inspection is the first step.

[Schedule Your Free Inspection Now]

It takes just 15 minutes and we'll give you a personalized quote.

Questions? Reply to this email or call us.

Best,
Breez Pool Care`
  },
  quoted_followup: {
    subject: "Your personalized pool service quote is ready",
    bodyTemplate: (firstName) => `Hi ${firstName},

We've reviewed your pool details and prepared a custom service plan just for you.

[View Your Quote]

Schedule your inspection to lock in your pricing.

Questions about your quote? We're here to help.

Best,
Breez Pool Care`
  }
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const { leadIds = [], templateType, initiatedBy } = await req.json();

    // Validation
    if (!Array.isArray(leadIds) || leadIds.length === 0) {
      return Response.json({ error: 'leadIds array required and must not be empty' }, { status: 400 });
    }
    if (!['new_lead_followup', 'quoted_followup'].includes(templateType)) {
      return Response.json({ error: `Invalid templateType: ${templateType}` }, { status: 400 });
    }

    const template = TEMPLATES[templateType];
    if (!template) {
      return Response.json({ error: 'Template not found' }, { status: 400 });
    }

    // Fetch leads
    const leads = await Promise.all(
      leadIds.map(id => base44.asServiceRole.entities.Lead.filter({ id }))
    ).then(results => results.flat());

    const leadMap = {};
    leads.forEach(l => { leadMap[l.id] = l; });

    // Initialize result tracking
    const sent = [];
    const skipped = [];
    const failed = [];

    // Process each lead
    for (const leadId of leadIds) {
      const lead = leadMap[leadId];

      // Validation: lead exists
      if (!lead) {
        skipped.push({ leadId, reason: 'lead_not_found' });
        continue;
      }

      // Validation: email present
      if (!lead.email) {
        skipped.push({ leadId: lead.id, reason: 'no_email', leadName: `${lead.firstName} ${lead.lastName}` });
        continue;
      }

      // Dedup check: has this template been sent in last 24h?
      try {
        const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const recentNotifs = await base44.asServiceRole.entities.NotificationLog.filter({
          leadId: lead.id,
          notificationType: templateType,
          sentAt: { $gte: last24h }
        });

        if (recentNotifs.length > 0) {
          skipped.push({
            leadId: lead.id,
            reason: 'recent_send',
            leadName: `${lead.firstName} ${lead.lastName}`,
            lastSent: recentNotifs[0].sentAt
          });
          continue;
        }
      } catch (dedupErr) {
        console.warn(`Dedup check failed for lead ${lead.id}:`, dedupErr);
        // Proceed with send (fail-open on dedup)
      }

      // Send email
      try {
        const messageBody = template.bodyTemplate(lead.firstName || 'Friend');
        
        // Send via Resend (existing pattern)
        const resendResponse = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${Deno.env.get('RESEND_API_KEY')}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            from: 'Breez <noreply@breez.local>',
            to: lead.email,
            subject: template.subject,
            text: messageBody
          })
        });

        if (!resendResponse.ok) {
          const errorText = await resendResponse.text();
          throw new Error(`Resend error: ${resendResponse.status} ${errorText}`);
        }

        const resendData = await resendResponse.json();
        const emailId = resendData.id;

        // Log to NotificationLog
        await base44.asServiceRole.entities.NotificationLog.create({
          leadId: lead.id,
          notificationType: templateType,
          channel: 'email',
          recipient: lead.email,
          message: messageBody,
          sentAt: new Date().toISOString(),
          status: 'sent',
          metadata: {
            template: templateType,
            resendEmailId: emailId,
            initiatedBy: initiatedBy || user.email
          }
        });

        sent.push({
          leadId: lead.id,
          leadName: `${lead.firstName} ${lead.lastName}`,
          email: lead.email,
          resendId: emailId
        });
      } catch (sendErr) {
        console.error(`Send error for lead ${lead.id}:`, sendErr);

        // Attempt to log failure
        try {
          await base44.asServiceRole.entities.NotificationLog.create({
            leadId: lead.id,
            notificationType: templateType,
            channel: 'email',
            recipient: lead.email || 'unknown',
            message: '',
            sentAt: new Date().toISOString(),
            status: 'failed',
            metadata: {
              template: templateType,
              error: sendErr.message,
              initiatedBy: initiatedBy || user.email
            }
          });
        } catch (logErr) {
          console.error(`Failed to log error for lead ${lead.id}:`, logErr);
        }

        failed.push({
          leadId: lead.id,
          leadName: `${lead.firstName} ${lead.lastName}`,
          email: lead.email,
          error: sendErr.message
        });
      }
    }

    // Audit log
    try {
      await base44.asServiceRole.entities.AnalyticsEvent.create({
        eventName: 'batch_followup_email',
        properties: {
          templateType,
          requestedCount: leadIds.length,
          sentCount: sent.length,
          skippedCount: skipped.length,
          failedCount: failed.length
        },
        metadata: {
          initiatedBy: initiatedBy || user.email,
          timestamp: new Date().toISOString(),
          summary: {
            sent: sent.map(s => s.leadId),
            skipped: skipped.map(s => s.leadId),
            failed: failed.map(f => f.leadId)
          }
        }
      });
    } catch (auditErr) {
      console.error('Audit log error:', auditErr);
    }

    return Response.json({
      success: sent.length > 0,
      sentCount: sent.length,
      skippedCount: skipped.length,
      failedCount: failed.length,
      sent,
      skipped,
      failed,
      summary: {
        message: `Sent ${sent.length}, skipped ${skipped.length}, failed ${failed.length}`
      }
    });
  } catch (error) {
    console.error(`[${BUILD}] Unhandled error:`, error);
    return Response.json({
      success: false,
      error: error.message || 'Internal server error',
      build: BUILD
    }, { status: 500 });
  }
});