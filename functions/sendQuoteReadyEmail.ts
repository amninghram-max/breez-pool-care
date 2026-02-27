import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import crypto from 'crypto';

/**
 * sendQuoteReadyEmail
 * Sends Email #1: "Your quote is ready → Schedule Free Inspection"
 * Includes tokenized link for passwordless scheduling.
 * Called after Quote is persisted in calculateQuote.
 */

function createScheduleToken(quoteId, clientEmail) {
  // Simple token: base64(quoteId + '|' + clientEmail + '|' + timestamp)
  const payload = `${quoteId}|${clientEmail}|${Date.now()}`;
  return Buffer.from(payload).toString('base64');
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { quoteId, clientEmail, clientFirstName, monthlyPrice, frequency, onceTimeFees } = await req.json();

    if (!quoteId || !clientEmail) {
      return Response.json({ error: 'quoteId and clientEmail required' }, { status: 400 });
    }

    const token = createScheduleToken(quoteId, clientEmail);
    // Frontend will build: /schedule-inspection?token=<token>
    const scheduleLink = `${Deno.env.get('APP_URL') || 'https://breez.app'}/schedule-inspection?token=${token}`;

    const subject = 'Your Breez Quote Is Ready!';
    const body = `
Hi ${clientFirstName || 'there'},

Great news — your personalized pool cleaning quote is ready!

**Your Quote:**
- Monthly: $${monthlyPrice?.toFixed(2) || 'TBD'} (${frequency || 'weekly'})
- First month total: $${((monthlyPrice || 0) + (onceTimeFees || 0)).toFixed(2)}

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

    console.log(`✅ Quote ready email sent: quoteId=${quoteId}, email=${clientEmail}, token=${token.slice(0, 20)}...`);

    return Response.json({ success: true, token });
  } catch (error) {
    console.error('sendQuoteReadyEmail error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});