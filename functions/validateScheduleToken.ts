import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * validateScheduleToken
 * Validates a schedule token and returns quote/lead context.
 * 
 * Validates:
 * - Token exists on a Quote
 * - Token not expired (now < scheduleTokenExpiresAt)
 * - Token not used (scheduleTokenUsedAt is null)
 * - Token not revoked (scheduleTokenRevokedAt is null)
 * 
 * Returns quote + lead context for inspection scheduling.
 */

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { scheduleToken } = await req.json();

    if (!scheduleToken) {
      return Response.json({ error: 'scheduleToken required' }, { status: 400 });
    }

    // Find quote by token
    const quotes = await base44.asServiceRole.entities.Quote.filter(
      { scheduleToken },
      '-created_date',
      1
    );

    if (!quotes || quotes.length === 0) {
      return Response.json({ error: 'Invalid token' }, { status: 401 });
    }

    const quote = quotes[0];
    const now = new Date().toISOString();

    // Validate token state
    if (quote.scheduleTokenUsedAt) {
      return Response.json({ error: 'Token already used' }, { status: 401 });
    }

    if (quote.scheduleTokenRevokedAt) {
      return Response.json({ error: 'Token revoked' }, { status: 401 });
    }

    if (quote.scheduleTokenExpiresAt && now > quote.scheduleTokenExpiresAt) {
      return Response.json({ error: 'Token expired' }, { status: 401 });
    }

    // Load lead (if exists)
    let lead = null;
    if (quote.clientEmail) {
      const leads = await base44.asServiceRole.entities.Lead.filter(
        { email: quote.clientEmail },
        '-created_date',
        1
      );
      lead = leads?.[0] || null;
    }

    console.log(`✅ Schedule token validated: quoteId=${quote.id}, email=${quote.clientEmail}`);

    return Response.json({
      success: true,
      quote: {
        id: quote.id,
        clientFirstName: quote.clientFirstName,
        clientEmail: quote.clientEmail,
        clientPhone: quote.clientPhone,
        outputMonthlyPrice: quote.outputMonthlyPrice,
        outputFrequency: quote.outputFrequency,
        outputOneTimeFees: quote.outputOneTimeFees
      },
      lead: lead ? {
        id: lead.id,
        streetAddress: lead.streetAddress,
        city: lead.city,
        state: lead.state,
        zipCode: lead.zipCode,
        serviceAddress: lead.serviceAddress
      } : null
    });
  } catch (error) {
    console.error('validateScheduleToken error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});