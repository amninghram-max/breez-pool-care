import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * acceptQuote
 * Customer accepts a specific Quote version post-inspection.
 * Creates Lead (if not exists) or links Lead to accepted quote.
 * Stores acceptedQuoteId on Lead for payment invariants.
 * Next step: Payment setup.
 */

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

    if (quote.status === 'converted') {
      return Response.json({ error: 'Quote already converted' }, { status: 409 });
    }

    // Find or create Lead
    let lead = null;
    if (quote.clientEmail) {
      const existingLeads = await base44.asServiceRole.entities.Lead.filter({
        email: quote.clientEmail
      }, '-created_date', 1);
      lead = existingLeads[0];
    }

    if (!lead && quote.clientEmail) {
      // Create lead from quote
      lead = await base44.asServiceRole.entities.Lead.create({
        firstName: quote.clientFirstName || 'Customer',
        lastName: quote.clientLastName || '',
        email: quote.clientEmail,
        mobilePhone: quote.clientPhone || '',
        stage: 'quote_sent',
        isEligible: true,
        quoteGenerated: true,
        acceptedQuoteId: quoteId
      });
      console.log(`✅ Lead created from quote: leadId=${lead.id}, email=${quote.clientEmail}, acceptedQuoteId=${quoteId}`);
    } else if (lead) {
      // Update existing lead with accepted quote ID
      await base44.asServiceRole.entities.Lead.update(lead.id, {
        acceptedQuoteId: quoteId
      });
      console.log(`✅ Lead updated with acceptedQuoteId: leadId=${lead.id}, acceptedQuoteId=${quoteId}`);
    }

    // Update quote status
    await base44.asServiceRole.entities.Quote.update(quoteId, {
      status: 'converted'
    });

    return Response.json({
      success: true,
      quoteId,
      leadId: lead?.id,
      clientEmail: quote.clientEmail,
      monthlyPrice: quote.outputMonthlyPrice,
      oneTimeFees: quote.outputOneTimeFees,
      frequency: quote.outputFrequency,
      firstMonthTotal: quote.outputFirstMonthTotal
    });
  } catch (error) {
    console.error('acceptQuote error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});