import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * RELEASE READINESS CHECK v1.0.0
 * Fully inline — zero sub-function invocations.
 * Policy: AdminSettings MUST exist in DB; missing = deployment blocker.
 */

const VERSION = '1.0.0';
const PRICING_ENGINE_VERSION = 'v2_tokens_risk_frequency';

const DEFAULT_ESCALATION_BRACKETS = [
  { min_risk: 0,  max_risk: 2,   addon_amount: 0  },
  { min_risk: 3,  max_risk: 5,   addon_amount: 15 },
  { min_risk: 6,  max_risk: 8,   addon_amount: 30 },
  { min_risk: 9,  max_risk: 11,  addon_amount: 45 },
  { min_risk: 12, max_risk: 999, addon_amount: 60 }
];

function runPricingSpotCheck(settings, scenario) {
  const baseTiers = settings?.baseTierPrices ? JSON.parse(settings.baseTierPrices) : {
    tier_a_10_15k: 140, tier_b_15_20k: 160, tier_c_20_30k: 190, tier_d_30k_plus: 230, absolute_floor: 120
  };
  const tokens = settings?.additiveTokens ? JSON.parse(settings.additiveTokens) : {
    usage_weekends: 10, usage_daily: 20, unscreened_tier_a: 20,
    unscreened_tier_b: 25, unscreened_tier_c: 30, unscreened_tier_d: 40,
    trees_overhead: 10, chlorinator_liquid_only: 10, pets_frequent: 10
  };
  const riskEngine = settings?.riskEngine ? JSON.parse(settings.riskEngine) : {
    points: { unscreened: 2, trees_overhead: 1, usage_daily: 2, usage_several_week: 1,
              chlorinator_liquid_only: 2, pets_frequent: 1, pets_occasional: 0.5 },
    size_multipliers: { tier_a: 1.0, tier_b: 1.1, tier_c: 1.2, tier_d: 1.3 },
    escalation_brackets: DEFAULT_ESCALATION_BRACKETS
  };
  const freqLogic = settings?.frequencyLogic ? JSON.parse(settings.frequencyLogic) : {
    twice_weekly_multiplier: 1.8, auto_require_threshold: 9
  };

  const { poolSize, enclosure, treesOverhead, useFrequency, chlorinationMethod, petsAccess, petSwimFrequency } = scenario;

  const tierMap = {
    '10_15k': ['tier_a', baseTiers.tier_a_10_15k || 140],
    'not_sure': ['tier_a', baseTiers.tier_a_10_15k || 140],
    '15_20k':  ['tier_b', baseTiers.tier_b_15_20k || 160],
    '20_30k':  ['tier_c', baseTiers.tier_c_20_30k || 190],
    '30k_plus':['tier_d', baseTiers.tier_d_30k_plus || 230]
  };
  const [sizeTier, baseMonthly] = tierMap[poolSize] || ['tier_a', 140];

  let additive = 0;
  if (enclosure === 'unscreened') additive += tokens[`unscreened_${sizeTier}`] || 20;
  if (enclosure === 'unscreened' && treesOverhead === 'yes') additive += tokens.trees_overhead || 10;
  if (useFrequency === 'weekends') additive += tokens.usage_weekends || 10;
  else if (useFrequency === 'several_week') additive += tokens.usage_several_week || 10;
  else if (useFrequency === 'daily') additive += tokens.usage_daily || 20;
  if (chlorinationMethod === 'liquid_chlorine') additive += tokens.chlorinator_liquid_only || 10;
  if (petsAccess && petSwimFrequency === 'frequently') additive += tokens.pets_frequent || 10;

  const pts = riskEngine.points;
  let rawRisk = 0;
  if (enclosure === 'unscreened') rawRisk += pts.unscreened || 2;
  if (enclosure === 'unscreened' && treesOverhead === 'yes') rawRisk += pts.trees_overhead || 1;
  if (useFrequency === 'daily') rawRisk += pts.usage_daily || 2;
  else if (useFrequency === 'several_week') rawRisk += pts.usage_several_week || 1;
  if (chlorinationMethod === 'liquid_chlorine') rawRisk += pts.chlorinator_liquid_only || 2;
  if (petsAccess && petSwimFrequency === 'frequently') rawRisk += pts.pets_frequent || 1;

  const sizeMultiplier = (riskEngine.size_multipliers || {})[sizeTier] || 1.0;
  const adjustedRisk = rawRisk * sizeMultiplier;

  const brackets = Array.isArray(riskEngine.escalation_brackets) && riskEngine.escalation_brackets.length >= 5
    ? riskEngine.escalation_brackets : DEFAULT_ESCALATION_BRACKETS;
  const sorted = [...brackets].sort((a, b) => a.min_risk - b.min_risk);
  let riskAddon = 0;
  for (const b of sorted) {
    if (adjustedRisk >= b.min_risk && (b.max_risk >= 999 || adjustedRisk <= b.max_risk)) {
      riskAddon = b.addon_amount || 0;
      break;
    }
  }

  let freqMult = 1.0;
  if (adjustedRisk >= (freqLogic.auto_require_threshold || 9)) {
    freqMult = freqLogic.twice_weekly_multiplier || 1.8;
  }

  let finalPrice = (baseMonthly + additive + riskAddon) * freqMult;
  const floor = baseTiers.absolute_floor || 120;
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

    // ─── Load AdminSettings via list() (avoids filter/RLS issues) ────────────
    let settings = null;
    let usingDefaults = true;
    try {
      const rows = await base44.asServiceRole.entities.AdminSettings.list('-created_date', 1);
      settings = rows[0] || null;
      usingDefaults = !settings;
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
      console.log('✅ RELEASE READY — all checks passed');
    } else {
      console.error('🚨 RELEASE BLOCKED:', JSON.stringify(blockers));
    }

    return Response.json({
      releaseReady,
      usingDefaults,
      version: VERSION,
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
      blockers: ['Release check execution failed: ' + error.message],
      warnings: [],
      checks: {}
    }, { status: 500 });
  }
});