import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * getQuoteByTokenPublicV1
 * Retrieves an existing quote snapshot by token.
 * Used to check if a quote was already computed/persisted.
 * 
 * Input: { token }
 * Output: { success, quote?, error?, build }
 */

const BUILD = "GQT-V1-2026-03-02";

const json200 = (data) => new Response(
  JSON.stringify(data),
  { status: 200, headers: { "content-type": "application/json; charset=utf-8" } }
);

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const payload = await req.json();
    const { token } = payload || {};

    // Validate input
    if (!token || typeof token !== 'string') {
      return json200({
        success: false,
        error: 'token is required',
        build: BUILD
      });
    }

    // Look up quote by token
    let quote = null;
    try {
      const results = await base44.asServiceRole.entities.Quote.filter(
        { quoteToken: token.trim() },
        '-created_date',
        1
      );
      if (results && results.length > 0) {
        quote = results[0];
        console.log('GQBT_FOUND', { token: token.trim().slice(0, 8), quoteId: quote.id });
      }
    } catch (e) {
      console.warn('GQBT_QUERY_FAILED', { error: e.message });
      return json200({
        success: false,
        error: 'Failed to retrieve quote',
        detail: e.message,
        build: BUILD
      });
    }

    if (!quote) {
      return json200({
        success: false,
        error: 'Quote not found',
        build: BUILD
      });
    }

    // Build price summary from persisted quote
    const priceSummary = {
      monthlyPrice: quote.outputMonthlyPrice ? `$${quote.outputMonthlyPrice}` : 'TBD',
      visitFrequency: quote.outputFrequency === 'weekly' ? 'Weekly' : 'Twice Weekly',
      planName: 'Your Quote',
      oneTimeFees: quote.outputOneTimeFees && quote.outputOneTimeFees > 0 ? `$${quote.outputOneTimeFees}` : null,
      frequencyAutoRequired: quote.outputFrequencyAutoRequired || false
    };

    return json200({
      success: true,
      quote: {
        id: quote.id,
        quoteToken: quote.quoteToken,
        leadId: quote.leadId,
        clientEmail: quote.clientEmail,
        clientFirstName: quote.clientFirstName,
        status: quote.status,
        priceSummary,
        createdAt: quote.created_date
      },
      build: BUILD
    });

  } catch (error) {
    console.error('GQBT_CRASH', { error: error?.message });
    return json200({
      success: false,
      error: 'Failed to retrieve quote',
      detail: error?.message,
      build: BUILD
    });
  }
});