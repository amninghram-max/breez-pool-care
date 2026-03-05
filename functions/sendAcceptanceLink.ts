import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const user = await base44.auth.me();
    if (!user || (user.role !== 'staff' && user.role !== 'admin')) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { leadId } = await req.json();
    if (!leadId) {
      return Response.json({ error: 'leadId required' }, { status: 400 });
    }

    // Use filter instead of get to avoid Base44-App-Id header issue
    const leads = await base44.asServiceRole.entities.Lead.filter({ id: leadId }, null, 1);
    const lead = leads?.[0];
    if (!lead) {
      return Response.json({ error: 'Lead not found' }, { status: 404 });
    }

    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    if (!resendApiKey) {
      return Response.json({ error: 'RESEND_API_KEY not configured' }, { status: 500 });
    }

    const email = lead.email;
    if (!email) {
      return Response.json({ error: 'Lead has no email' }, { status: 400 });
    }

    // Derive app origin from request headers
    const proto = req.headers.get('x-forwarded-proto') ?? 'https';
    const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? '';
    const appOrigin = `${proto}://${host}`;
    const acceptanceUrl = `${appOrigin}/Activate?leadId=${leadId}`;

    const firstName = lead.firstName || 'there';

    // Look up their accepted quote for price snapshot
    let quoteSnapshot = null;
    try {
      if (lead.acceptedQuoteId) {
        const quotes = await base44.asServiceRole.entities.Quote.filter({ id: lead.acceptedQuoteId }, null, 1);
        quoteSnapshot = quotes?.[0] ?? null;
      }
      // Fallback: find latest quote_sent or inspection_verified quote for this email
      if (!quoteSnapshot) {
        const allQuotes = await base44.asServiceRole.entities.Quote.filter(
          { clientEmail: email },
          '-created_date',
          5
        );
        quoteSnapshot = allQuotes?.find(q => q.status === 'inspection_verified' || q.status === 'quoted') ?? allQuotes?.[0] ?? null;
      }
    } catch (e) {
      console.warn('[sendAcceptanceLink] quote lookup failed:', e.message);
    }

    // Build price summary HTML block
    let priceSummaryHtml = '';
    let priceSummaryText = '';
    if (quoteSnapshot) {
      const monthly = quoteSnapshot.outputMonthlyPrice ? `$${quoteSnapshot.outputMonthlyPrice}/mo` : null;
      const freq = quoteSnapshot.outputFrequency === 'twice_weekly' ? 'Twice Weekly' : 'Weekly';
      const oneTime = quoteSnapshot.outputOneTimeFees && quoteSnapshot.outputOneTimeFees > 0
        ? `$${quoteSnapshot.outputOneTimeFees}` : null;
      const firstMonth = quoteSnapshot.outputFirstMonthTotal ? `$${quoteSnapshot.outputFirstMonthTotal}` : null;

      if (monthly) {
        priceSummaryHtml = `
    <div style="background:#f0fdfd;border:1px solid #1B9B9F;border-radius:8px;padding:20px;margin:24px 0;text-align:center;">
      <p style="margin:0 0 8px 0;font-size:13px;color:#666;text-transform:uppercase;letter-spacing:0.05em;">Your Confirmed Quote</p>
      <p style="margin:0;font-size:28px;font-weight:700;color:#1B9B9F;">${monthly}</p>
      <p style="margin:4px 0 0 0;font-size:14px;color:#555;">${freq} service</p>
      ${oneTime ? `<p style="margin:8px 0 0 0;font-size:13px;color:#777;">One-time fee: ${oneTime}</p>` : ''}
      ${firstMonth ? `<p style="margin:4px 0 0 0;font-size:13px;color:#777;">First month total: ${firstMonth}</p>` : ''}
    </div>`;
        priceSummaryText = `\nYour confirmed quote: ${monthly} (${freq})${oneTime ? ` + ${oneTime} one-time fee` : ''}${firstMonth ? `. First month: ${firstMonth}` : ''}.\n`;
      }
    }

    const htmlBody = `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;line-height:1.6;color:#333;">
  <div style="max-width:600px;margin:0 auto;padding:20px;">
    <div style="text-align:center;margin-bottom:30px;">
      <h2 style="color:#1B9B9F;margin:0;font-size:24px;">Breez Pool Care</h2>
    </div>
    <p style="font-size:16px;">Hi ${firstName},</p>
    <p style="font-size:15px;margin-bottom:20px;">Thanks for meeting with us! We're ready to start taking care of your pool.</p>
    ${priceSummaryHtml}
    <p style="font-size:15px;margin-bottom:24px;"><strong>Next step:</strong> Review and accept our service agreements, then set up your first payment to activate service.</p>
    <div style="text-align:center;margin-bottom:24px;">
      <a href="${acceptanceUrl}" style="display:inline-block;background-color:#1B9B9F;color:white;padding:14px 32px;text-decoration:none;border-radius:6px;font-weight:600;font-size:16px;">Review &amp; Activate Service</a>
    </div>
    <p style="font-size:13px;text-align:center;color:#666;">Or copy and paste: <a href="${acceptanceUrl}" style="color:#1B9B9F;word-break:break-all;">${acceptanceUrl}</a></p>
    <div style="border-top:1px solid #eee;padding-top:20px;text-align:center;color:#666;font-size:13px;margin-top:30px;">
      <p>Questions? Call us at <strong>(321) 524-3838</strong><br><strong>Breez Pool Care Team</strong></p>
    </div>
  </div>
</body>
</html>`;

    const emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${resendApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'Breez Pool Care <info@breezpoolcare.com>',
        to: [email],
        subject: 'Welcome to Breez — Let\'s Get Your Service Started',
        html: htmlBody,
        text: `Hi ${firstName},\n\nThanks for meeting with us!${priceSummaryText}\nReview and activate your service here:\n\n${acceptanceUrl}\n\nQuestions? Call (321) 524-3838.\n\n— Breez Pool Care`
      })
    });

    if (!emailRes.ok) {
      const body = await emailRes.text();
      console.error('[sendAcceptanceLink] Resend error:', emailRes.status, body);
      return Response.json({ error: 'Failed to send email', detail: body }, { status: 500 });
    }

    // Only update lastContactedAt — do NOT change stage; lead stays until agreements + payment done
    await base44.asServiceRole.entities.Lead.update(leadId, {
      lastContactedAt: new Date().toISOString()
    });

    console.log(`[sendAcceptanceLink] Sent to ${email} for lead ${leadId} by ${user.email}`);
    return Response.json({ success: true });

  } catch (error) {
    console.error('[sendAcceptanceLink] error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});