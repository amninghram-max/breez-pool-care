import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * RELEASE READINESS CHECK v1.0.0
 * Fully inline — zero sub-function invocations.
 * Policy: AdminSettings MUST exist in DB; missing = deployment blocker.
 */

const VERSION = '1.0.0';
const PRICING_ENGINE_VERSION = 'v2_tokens_risk_frequency';

// NO PRODUCTION DEFAULTS — AdminSettings is the sole source of truth.
// runPricingSpotCheck requires a valid settings object; callers must guard for null.

function runPricingSpotCheck(settings, scenario) {
  // Parse strictly — no fallbacks; if settings is missing caller should have blocked already
  const baseTiers = JSON.parse(settings.baseTierPrices);
  const tokens = JSON.parse(settings.additiveTokens);
  const riskEngine = JSON.parse(settings.riskEngine);
  const freqLogic = JSON.parse(settings.frequencyLogic);

  const { poolSize, enclosure, treesOverhead, useFrequency, chlorinationMethod, petsAccess, petSwimFrequency } = scenario;

  const tierMap = {
    '10_15k': ['tier_a', baseTiers.tier_a_10_15k],
    'not_sure': ['tier_a', baseTiers.tier_a_10_15k],
    '15_20k':  ['tier_b', baseTiers.tier_b_15_20k],
    '20_30k':  ['tier_c', baseTiers.tier_c_20_30k],
    '30k_plus':['tier_d', baseTiers.tier_d_30k_plus]
  };
  const [sizeTier, baseMonthly] = tierMap[poolSize] || ['tier_a', baseTiers.tier_a_10_15k];

  let additive = 0;
  if (enclosure === 'unscreened') additive += tokens[`unscreened_${sizeTier}`];
  if (enclosure === 'unscreened' && treesOverhead === 'yes') additive += tokens.trees_overhead;
  if (useFrequency === 'weekends') additive += tokens.usage_weekends;
  else if (useFrequency === 'several_week') additive += tokens.usage_several_week;
  else if (useFrequency === 'daily') additive += tokens.usage_daily;
  if (chlorinationMethod === 'liquid_chlorine') additive += tokens.chlorinator_liquid_only;
  if (petsAccess && petSwimFrequency === 'frequently') additive += tokens.pets_frequent;

  const pts = riskEngine.points;
  let rawRisk = 0;
  if (enclosure === 'unscreened') rawRisk += pts.unscreened;
  if (enclosure === 'unscreened' && treesOverhead === 'yes') rawRisk += pts.trees_overhead;
  if (useFrequency === 'daily') rawRisk += pts.usage_daily;
  else if (useFrequency === 'several_week') rawRisk += pts.usage_several_week;
  if (chlorinationMethod === 'liquid_chlorine') rawRisk += pts.chlorinator_liquid_only;
  if (petsAccess && petSwimFrequency === 'frequently') rawRisk += pts.pets_frequent;

  const sizeMultiplier = riskEngine.size_multipliers[sizeTier];
  const adjustedRisk = rawRisk * sizeMultiplier;

  if (!Array.isArray(riskEngine.escalation_brackets) || riskEngine.escalation_brackets.length < 5) {
    throw new Error('AdminSettings riskEngine.escalation_brackets invalid');
  }
  const sorted = [...riskEngine.escalation_brackets].sort((a, b) => a.min_risk - b.min_risk);
  let riskAddon = 0;
  for (const b of sorted) {
    if (adjustedRisk >= b.min_risk && (b.max_risk >= 999 || adjustedRisk <= b.max_risk)) {
      riskAddon = b.addon_amount;
      break;
    }
  }

  let freqMult = 1.0;
  if (adjustedRisk >= freqLogic.auto_require_threshold) {
    freqMult = freqLogic.twice_weekly_multiplier;
  }

  let finalPrice = (baseMonthly + additive + riskAddon) * freqMult;
  const floor = baseTiers.absolute_floor;
  if (finalPrice < floor) finalPrice = floor;

  return { finalPrice, sizeTier, baseMonthly, additive, riskAddon, adjustedRisk, freqMult, floor };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (user?.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    console.log(`🔒 checkReleaseReadiness v${VERSION} — fully inline`);

    const blockers = [];
    const warnings = [];
    const checks = {};
    let configRecordId = null;
    let configUpdatedAt = null;

    // ─── Load AdminSettings via list() (avoids filter/RLS issues) ────────────
    let settings = null;
    let usingDefaults = true;
    try {
      const rows = await base44.asServiceRole.entities.AdminSettings.list('-created_date', 1);
      settings = rows[0] || null;
      usingDefaults = !settings;
      if (settings) {
        configRecordId = settings.id || null;
        configUpdatedAt = settings.created_date || null;
        console.log(`📋 Config record: id=${configRecordId}, created=${configUpdatedAt}`);
      }
    } catch (err) {
      blockers.push('Could not read AdminSettings: ' + err.message);
    }

    // ─── CHECK 1: AdminSettings must exist (BLOCKER if missing) ─────────────
    if (usingDefaults) {
      checks.adminSettingsPresent = {
        passed: false,
        details: 'AdminSettings not found in DB — run seedAdminSettingsDefault first'
      };
      blockers.push('AdminSettings missing — production requires seeded config');
    } else {
      checks.adminSettingsPresent = {
        passed: true,
        details: `AdminSettings record found (id: ${settings.id})`
      };
    }

    // ─── CHECK 2: Config integrity (only if settings exist) ──────────────────
    if (settings) {
      try {
        const riskEngine = JSON.parse(settings.riskEngine);
        const baseTiers  = JSON.parse(settings.baseTierPrices);
        const tokens     = JSON.parse(settings.additiveTokens);

        const brackets      = riskEngine?.escalation_brackets;
        const bracketsOk    = Array.isArray(brackets) && brackets.length >= 5;
        const multipliersOk = riskEngine?.size_multipliers && Object.keys(riskEngine.size_multipliers).length >= 4;
        const baseTiersOk   = baseTiers?.tier_a_10_15k > 0 && baseTiers?.absolute_floor > 0;
        const tokensOk      = Object.keys(tokens).length >= 10;
        const passed        = bracketsOk && multipliersOk && baseTiersOk && tokensOk;

        checks.configIntegrity = {
          passed,
          bracketCount:    brackets?.length ?? 0,
          multipliersCount: Object.keys(riskEngine?.size_multipliers || {}).length,
          tokensCount:     Object.keys(tokens).length,
          details: passed
            ? `Config valid: ${brackets.length} brackets, ${Object.keys(tokens).length} tokens, baseTiers OK`
            : `Config corrupt: brackets=${bracketsOk}, multipliers=${multipliersOk}, baseTiers=${baseTiersOk}, tokens=${tokensOk}`
        };

        if (!passed) blockers.push('AdminSettings present but config data is corrupt or incomplete');
      } catch (err) {
        checks.configIntegrity = { passed: false, details: 'Parse error: ' + err.message };
        blockers.push('Config integrity parse failed: ' + err.message);
      }
    } else {
      checks.configIntegrity = { passed: false, details: 'Skipped — AdminSettings missing' };
    }

    // ─── CHECK 3: Pricing floor (min-risk Tier A) ────────────────────────────
    try {
      const c = runPricingSpotCheck(settings, {
        poolSize: '10_15k', enclosure: 'fully_screened',
        useFrequency: 'rarely', chlorinationMethod: 'saltwater', petsAccess: false
      });
      const passed = c.finalPrice >= c.floor;
      checks.pricingFloor = {
        passed,
        finalPrice: c.finalPrice,
        floor: c.floor,
        details: passed
          ? `Floor enforced: $${c.finalPrice} >= $${c.floor}`
          : `VIOLATED: $${c.finalPrice} < $${c.floor}`
      };
      if (!passed) blockers.push(`Absolute price floor ($${c.floor}) violated — got $${c.finalPrice}`);
    } catch (err) {
      checks.pricingFloor = { passed: false, details: err.message };
      blockers.push('Pricing floor check threw: ' + err.message);
    }

    // ─── CHECK 4: Tier A base price in expected range ─────────────────────────
    try {
      const c = runPricingSpotCheck(settings, {
        poolSize: '10_15k', enclosure: 'fully_screened',
        useFrequency: 'weekends', chlorinationMethod: 'saltwater', petsAccess: false
      });
      const passed = c.baseMonthly >= 120 && c.baseMonthly <= 250;
      checks.tierAPricing = {
        passed,
        baseMonthly: c.baseMonthly,
        finalMonthlyPrice: parseFloat(c.finalPrice.toFixed(2)),
        details: passed
          ? `Tier A base = $${c.baseMonthly}, final = $${c.finalPrice.toFixed(2)}`
          : `Tier A base out of range [$120–$250]: $${c.baseMonthly}`
      };
      if (!passed) blockers.push('Tier A base price out of expected range [$120–$250]');
    } catch (err) {
      checks.tierAPricing = { passed: false, details: err.message };
      blockers.push('Tier A pricing check threw: ' + err.message);
    }

    // ─── CHECK 5: Risk escalation fires on high-risk pool ────────────────────
    try {
      const c = runPricingSpotCheck(settings, {
        poolSize: '20_30k', enclosure: 'unscreened', treesOverhead: 'yes',
        useFrequency: 'daily', chlorinationMethod: 'liquid_chlorine',
        petsAccess: true, petSwimFrequency: 'frequently'
      });
      const passed = c.riskAddon > 0 && c.adjustedRisk >= 5;
      checks.riskEscalation = {
        passed,
        riskAddon: c.riskAddon,
        adjustedRisk: parseFloat(c.adjustedRisk.toFixed(2)),
        finalMonthlyPrice: parseFloat(c.finalPrice.toFixed(2)),
        details: passed
          ? `Risk addon = $${c.riskAddon}, adjustedRisk = ${c.adjustedRisk.toFixed(2)} — brackets working`
          : `Risk escalation not firing: addon=${c.riskAddon}, adjustedRisk=${c.adjustedRisk}`
      };
      if (!passed) blockers.push('Risk escalation brackets not firing — margin protection gap');
    } catch (err) {
      checks.riskEscalation = { passed: false, details: err.message };
      blockers.push('Risk escalation check threw: ' + err.message);
    }

    // ─── CHECK 6: Entity layer accessible ────────────────────────────────────
    try {
      const leads = await base44.asServiceRole.entities.Lead.list('-created_date', 1);
      checks.entityAccess = {
        passed: true,
        details: `Entity layer reachable (Lead count sample: ${leads.length})`
      };
    } catch (err) {
      checks.entityAccess = { passed: false, details: err.message };
      warnings.push('Entity access check failed: ' + err.message);
    }

    // ─── Final determination ──────────────────────────────────────────────────
    const releaseReady = blockers.length === 0;

    if (releaseReady) {
      console.log(`✅ RELEASE READY — pricingEngine=${PRICING_ENGINE_VERSION}, configId=${configRecordId}`);
    } else {
      console.error('🚨 RELEASE BLOCKED:', JSON.stringify(blockers));
    }

    return Response.json({
      releaseReady,
      usingDefaults,
      version: VERSION,
      pricingEngineVersion: PRICING_ENGINE_VERSION,
      configRecordId,
      configUpdatedAt,
      timestamp: new Date().toISOString(),
      blockers,
      warnings,
      checks
    });

  } catch (error) {
    console.error('checkReleaseReadiness fatal:', error.message);
    return Response.json({
      releaseReady: false,
      usingDefaults: true,
      version: VERSION,
      pricingEngineVersion: PRICING_ENGINE_VERSION,
      configRecordId: null,
      configUpdatedAt: null,
      blockers: ['Release check execution failed: ' + error.message],
      warnings: [],
      checks: {}
    }, { status: 500 });
  }
});