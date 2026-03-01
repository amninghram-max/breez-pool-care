import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * sendFinalQuoteEmail
 * Sends locked quote + service agreement link to customer after finalization.
 * Idempotent — only sends once.
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { inspectionRecordId, leadId } = await req.json();

    if (!inspectionRecordId || !leadId) {
      return Response.json({ error: 'inspectionRecordId and leadId required' }, { status: 400 });
    }

    const [record, lead] = await Promise.all([
      base44.asServiceRole.entities.InspectionRecord.get(inspectionRecordId),
      base44.asServiceRole.entities.Lead.get(leadId),
    ]);

    if (!record || !lead) {
      return Response.json({ error: 'Record or Lead not found' }, { status: 404 });
    }

    if (record.finalQuoteEmailSent) {
      return Response.json({ success: true, alreadySent: true });
    }

    const monthlyRate = record.lockedMonthlyRate || 0;
    const frequency = record.lockedFrequency || 'weekly';
    const visitsPerMonth = frequency === 'twice_weekly' ? 8 : 4;
    const perVisit = visitsPerMonth > 0 ? (monthlyRate / visitsPerMonth) : 0;
    const greenFee = record.greenToCleanFee || 0;
    const firstName = lead.firstName || 'there';
    const email = lead.email;

    if (!email) {
      return Response.json({ error: 'Lead has no email' }, { status: 400 });
    }

    // Links
    const appBase = Deno.env.get('APP_URL') || 'https://app.base44.com/app/breezpoolcare';
    const agreementLink = `${appBase}/agreements?inspectionId=${inspectionRecordId}`;
    const activationLink = `${appBase}/activate?leadId=${leadId}`;

    const greenFeeSection = greenFee > 0
      ? `\n• Green-to-Clean Recovery (first month, one-time): $${greenFee.toFixed(2)}`
      : '';

    const firstMonthTotal = monthlyRate + greenFee;

    const subject = 'Your Breez Service Agreement Is Ready';
    const body = `
Hi ${firstName},

Your pool inspection is complete — thank you for having us out! Based on what we observed, here are your final service details:

─────────────────────────────
Monthly Service Rate: $${monthlyRate.toFixed(2)}/month
Average per visit: approximately $${perVisit.toFixed(2)}${greenFeeSection}
First month total: $${firstMonthTotal.toFixed(2)}
─────────────────────────────

To get started, please review and accept your service agreement, then complete your initial payment:

<a href="${agreementLink}" style="display:inline-block;background:#1B9B9F;color:white;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:bold;margin:20px 0;">Review & Accept Agreement →</a>

Once your agreement is accepted and payment is processed, we'll place you on the schedule and your service will begin.

Questions? Call or text us at (321) 524-3838.

— Matt & The Breez Team
    `.trim();

    await base44.asServiceRole.integrations.Core.SendEmail({
      to: email,
      subject,
      body,
      from_name: 'Breez Pool Care',
    });

    // Mark sent
    await base44.asServiceRole.entities.InspectionRecord.update(inspectionRecordId, {
      finalQuoteEmailSent: true,
      finalQuoteEmailSentAt: new Date().toISOString(),
    });

    await base44.asServiceRole.entities.Lead.update(leadId, {
      quoteEmailSent: true,
    });

    console.log(`✅ Final quote email sent: inspectionId=${inspectionRecordId}, email=${email}`);
    return Response.json({ success: true });
  } catch (error) {
    console.error('sendFinalQuoteEmail error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});