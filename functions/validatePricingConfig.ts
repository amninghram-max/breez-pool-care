import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * validatePricingConfig
 * Validates AdminSettings integrity. DOES NOT auto-seed or call other functions.
 * Returns valid=true if settings exist and parse correctly; valid=false with details otherwise.
 * AdminSettings is the sole source of truth — no fallbacks, no silent recovery.
 */

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (user?.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    const rows = await base44.asServiceRole.entities.AdminSettings.list('-created_date', 1);
    const settings = rows[0] || null;

    if (!settings) {
      return Response.json({
        valid: false,
        seeded: false,
        error: 'AdminSettings not found in DB — seed required before pricing'
      });
    }

    // Parse and validate all required fields
    let riskEngine, escalationBrackets, sizeMultipliers, tokens;
    try {
      riskEngine = JSON.parse(settings.riskEngine);
      escalationBrackets = riskEngine?.escalation_brackets || [];
      sizeMultipliers = riskEngine?.size_multipliers || {};
      tokens = JSON.parse(settings.additiveTokens || '{}');
      JSON.parse(settings.baseTierPrices);
      JSON.parse(settings.frequencyLogic);
      JSON.parse(settings.initialFees);
    } catch (e) {
      return Response.json({
        valid: false,
        seeded: false,
        error: 'AdminSettings JSON parse failed: ' + e.message
      });
    }

    const bracketsValid = Array.isArray(escalationBrackets) && escalationBrackets.length === 5;
    const multipliersValid = Object.keys(sizeMultipliers).length === 4;
    const tokensValid = Object.keys(tokens).length >= 10;

    if (!bracketsValid || !multipliersValid || !tokensValid) {
      return Response.json({
        valid: false,
        seeded: false,
        error: `Config integrity check failed: brackets=${bracketsValid}(${escalationBrackets.length}/5), multipliers=${multipliersValid}(${Object.keys(sizeMultipliers).length}/4), tokens=${tokensValid}(${Object.keys(tokens).length})`
      });
    }

    return Response.json({ valid: true, seeded: false, configRecordId: settings.id });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});