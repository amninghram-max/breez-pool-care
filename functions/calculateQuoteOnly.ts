import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { runPricingEngine } from './pricingEngine.js';

/**
 * calculateQuoteOnly — pure pricing engine, NO persistence.
 * Used by Demo mode and by verifyInspectionQuote for re-pricing.
 * Returns full quote breakdown without saving any records.
 */

Deno.serve(async (req) => {
  try {
    console.log("📊 calculateQuoteOnly — pure engine, no persistence");
    const base44 = createClientFromRequest(req);

    const payload = await req.json();
    const { questionnaireData } = payload;

    const rows = await base44.asServiceRole.entities.AdminSettings.list('-created_date', 1);
    const settings = rows[0] || null;

    if (!settings) {
      return Response.json({ error: 'AdminSettings not found', code: 'ADMIN_SETTINGS_MISSING' }, { status: 503 });
    }

    const result = runPricingEngine(questionnaireData, settings);

    return Response.json({ success: true, quote: { ...result, configRecordId: settings.id } });
  } catch (error) {
    console.error('calculateQuoteOnly error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});