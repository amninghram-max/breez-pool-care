import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

const BUILD = "GQPV1-2026-03-02-A";

const json200 = (data) => new Response(
  JSON.stringify(data),
  { status: 200, headers: { "content-type": "application/json; charset=utf-8" } }
);

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  let payload = null;
  try {
    const raw = await req.text();
    payload = raw ? JSON.parse(raw) : null;
  } catch {
    return json200({ success: false, error: "Invalid JSON body", build: BUILD });
  }

  const { quoteToken } = payload || {};

  if (!quoteToken || typeof quoteToken !== 'string' || !quoteToken.trim()) {
    return json200({ success: false, error: "quoteToken is required", build: BUILD });
  }

  try {
    const quotes = await base44.asServiceRole.entities.Quotes.filter({ quoteToken: quoteToken.trim() });
    const quote = quotes?.[0] ?? null;

    if (!quote) {
      return json200({ success: false, error: "Quote not found or expired", build: BUILD });
    }

    // Mark as viewed on first access
    if (!quote.viewedAt) {
      const updates = { viewedAt: new Date().toISOString() };
      if (quote.status === 'SENT') updates.status = 'VIEWED';
      try {
        await base44.asServiceRole.entities.Quotes.update(quote.id, updates);
        quote.viewedAt = updates.viewedAt;
        if (updates.status) quote.status = updates.status;
      } catch (stampErr) {
        console.error('GQPV1 viewedAt stamp failed:', stampErr?.message);
      }
    }

    console.log('GQPV1_SUCCESS', { quoteToken, status: quote.status, build: BUILD });

    return json200({
      success: true,
      quote: {
        quoteToken: quote.quoteToken,
        status: quote.status,
        quoteSnapshot: quote.quoteSnapshot ?? null
      },
      build: BUILD
    });

  } catch (err) {
    console.error('GQPV1 crash:', err?.message);
    return json200({ success: false, error: "Server error", message: String(err?.message ?? err), build: BUILD });
  }
});