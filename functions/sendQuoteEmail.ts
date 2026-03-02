import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { quote, firstName, email } = await req.json();

    if (!quote || !firstName || !email) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const subject = "Your Breez Pool Quote";
    
    const body = `Hi ${firstName},

Thanks for requesting your pool service quote from Breez.

Here's your recommended plan: 

Monthly Service: $${quote.estimatedMonthlyPrice.toFixed(2)}
Per Visit: $${quote.estimatedPerVisitPrice.toFixed(2)}

Chemicals and routine maintenance are included.

Ready to schedule your FREE pool inspection?

Visit our website to schedule: ${Deno.env.get('BASE_URL') || 'https://breezpoolcare.com'}/Onboarding

We look forward to caring for your pool.

— Breez Pool Care`;

    await base44.asServiceRole.integrations.Core.SendEmail({
      to: email,
      subject: subject,
      body: body,
      from_name: 'Breez Pool Care'
    });

    return Response.json({ success: true });
  } catch (error) {
    console.error('Error sending quote email:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});