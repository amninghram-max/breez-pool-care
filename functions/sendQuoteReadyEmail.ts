import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * sendQuoteReadyEmail
 * Sends Email #1: "Your quote is ready → Schedule Free Inspection"
 * Includes tokenized link for passwordless scheduling.
 * Called after Quote is persisted in calculateQuote.
 * 
 * Idempotent: Only sends if quoteEmailSent !== true
 * Sets quoteEmailSent=true and quoteEmailSentAt after successful send
 */

import { getAppOrigin } from './_getAppOrigin.js';

function generateScheduleToken() {
  // Use cryptographically secure random bytes
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { quoteId } = await req.json();

    if (!quoteId) {
      return Response.json({ error: 'quoteId required' }, { status: 400 });
    }

    // Load quote
    const quote = await base44.asServiceRole.entities.Quote.get(quoteId);
    if (!quote) {
      return Response.json({ error: 'Quote not found' }, { status: 404 });
    }

    // Idempotency: only send if not already sent
    if (quote.quoteEmailSent) {
      console.log(`⏭️ Quote email already sent: quoteId=${quoteId}`);
      return Response.json({ success: true, alreadySent: true });
    }

    const { clientEmail, clientFirstName, outputMonthlyPrice, outputFrequency, outputOneTimeFees } = quote;

    if (!clientEmail) {
      return Response.json({ error: 'clientEmail required' }, { status: 400 });
    }

    // Generate schedule token + expiry (7 days)
    const scheduleToken = generateScheduleToken();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    // The scheduling page resolves via QuoteRequests.token (quoteToken), not scheduleToken.
    // We store scheduleToken on Quote for lifecycle tracking, but the link uses quoteToken.
    let schedulingToken = quote.quoteToken || null;

    // If no quoteToken on the Quote record, fall back to scheduleToken stored in QuoteRequests
    if (!schedulingToken) {
      try {
        const qrs = await base44.asServiceRole.entities.QuoteRequests.filter({ leadId: quote.leadId }, '-created_date', 1);
        if (qrs?.[0]?.token) schedulingToken = qrs[0].token;
      } catch (e) {
        console.warn('Could not find QuoteRequests token, using generated scheduleToken');
      }
    }

    // Fallback: use the generated scheduleToken (store it in QuoteRequests too)
    if (!schedulingToken) {
      schedulingToken = scheduleToken;
    }

    // Update quote with schedule token lifecycle fields
    await base44.asServiceRole.entities.Quote.update(quoteId, {
      scheduleToken,
      scheduleTokenExpiresAt: expiresAt,
      quoteEmailSent: true,
      quoteEmailSentAt: new Date().toISOString()
    });

    const appOrigin = getAppOrigin(req);
    const scheduleLink = `${appOrigin}/ScheduleInspection?token=${encodeURIComponent(schedulingToken)}`;

    const subject = 'Your Breez Quote Is Ready!';
    const body = `
Hi ${clientFirstName || 'there'},

Great news — your personalized pool cleaning quote is ready!

**Your Quote:**
- Monthly: $${outputMonthlyPrice?.toFixed(2) || 'TBD'} (${outputFrequency || 'weekly'})
- First month total: $${((outputMonthlyPrice || 0) + (outputOneTimeFees || 0)).toFixed(2)}

**Next step:** Schedule your free pool inspection with Matt. This is where he'll confirm the quote and answer any questions.

<a href="${scheduleLink}" style="display: inline-block; background: #1B9B9F; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: bold; margin: 20px 0;">Schedule Your Free Inspection →</a>

**What to expect during the inspection:**
• Initial pool assessment & water chemistry test
• Equipment review
• Customized service recommendations
• Answer all your questions

**Disclaimer:** This quote is an estimate based on the information you provided. The final price may change slightly after inspection based on actual pool conditions. All pricing is transparent with no surprises.

Questions? Reply to this email or call us anytime.

— The Breez Team
    `.trim();

    await base44.asServiceRole.integrations.Core.SendEmail({
      to: clientEmail,
      subject,
      body,
      from_name: 'Breez Pool Care'
    });

    console.log(`✅ Quote ready email sent: quoteId=${quoteId}, email=${clientEmail}, token=${token.slice(0, 16)}...`);

    return Response.json({ success: true, quoteId, tokenExpiresAt: expiresAt });
  } catch (error) {
    console.error('sendQuoteReadyEmail error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});