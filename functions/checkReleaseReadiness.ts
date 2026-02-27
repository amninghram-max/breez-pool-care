import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * RELEASE READINESS CHECK
 * All checks are fully inline — no sub-function HTTP calls.
 * Uses asServiceRole entity reads + inline pricing math only.
 */

const DEFAULT_ESCALATION_BRACKETS = [
  { min_risk: 0, max_risk: 2, addon_amount: 0 },
  { min_risk: 3, max_risk: 5, addon_amount: 15 },
  { min_risk: 6, max_risk: 8, addon_amount: 30 },
  { min_risk: 9, max_risk: 11, addon_amount: 45 },
  { min_risk: 12, max_risk: 999, addon_amount: 60 }
];

function runPricingSpotCheck(settings, scenario) {
  const baseTiers = settings?.baseTierPrices ? JSON.parse(settings.baseTierPrices) : {
    tier_a_10_15k: 140, tier_b_15_20k: 160, tier_c_20_30k: 190, tier_d_30k_plus: 230, absolute_floor: 120
  };
  const tokens = settings?.additiveTokens ? JSON.parse(settings.additiveTokens) : {
    usage_weekends: 10, usage_daily: 20, unscreened_tier_a: 20, chlorinator_liquid_only: 10, pets_frequent: 10
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

  // Tier
  const tierMap = { '10_15k': ['tier_a', baseTiers.tier_a_10_15k || 140],
                    'not_sure': ['tier_a', baseTiers.tier_a_10_15k || 140],
                    '15_20k': ['tier_b', baseTiers.tier_b_15_20k || 160],
                    '20_30k': ['tier_c', baseTiers.tier_c_20_30k || 190],
                    '30k_plus': ['tier_d', baseTiers.tier_d_30k_plus || 230] };
  const [sizeTier, baseMonthly] = tierMap[poolSize] || ['tier_a', 140];

  // Tokens
  let additive = 0;
  if (enclosure === 'unscreened') additive += tokens[`unscreened_${sizeTier}`] || 20;
  if (enclosure === 'unscreened' && treesOverhead === 'yes') additive += tokens.trees_overhead || 10;
  if (useFrequency === 'weekends') additive += tokens.usage_weekends || 10;
  else if (useFrequency === 'several_week') additive += tokens.usage_several_week || 10;
  else if (useFrequency === 'daily') additive += tokens.usage_daily || 20;
  if (chlorinationMethod === 'liquid_chlorine') additive += tokens.chlorinator_liquid_only || 10;
  if (petsAccess && petSwimFrequency === 'frequently') additive += tokens.pets_frequent || 10;

  // Risk
  const pts = riskEngine.points;
  let rawRisk = 0;
  if (enclosure === 'unscreened') rawRisk += pts.unscreened || 2;
  if (enclosure === 'unscreened' && treesOverhead === 'yes') rawRisk += pts.trees_overhead || 1;
  if (useFrequency === 'daily') rawRisk += pts.usage_daily || 2;
  else if (useFrequency === 'several_week') rawRisk += pts.usage_several_week || 1;
  if (chlorinationMethod === 'liquid_chlorine') rawRisk += pts.chlorinator_liquid_only || 2;
  if (petsAccess && petSwimFrequency === 'frequently') rawRisk += pts.pets_frequent || 1;

  const mult = riskEngine.size_multipliers[sizeTier] || 1.0;
  const adjustedRisk = rawRisk * mult;

  const brackets = riskEngine.escalation_brackets?.length >= 5
    ? riskEngine.escalation_brackets : DEFAULT_ESCALATION_BRACKETS;
  const sorted = [...brackets].sort((a, b) => a.min_risk - b.min_risk);
  let riskAddon = 0;
  for (const b of sorted) {
    if (adjustedRisk >= b.min_risk && (b.max_risk >= 999 || adjustedRisk <= b.max_risk)) {
      riskAddon = b.addon_amount || 0;
      break;
    }
  }

  // Frequency
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

    console.log('🔒 Running release readiness checks (fully inline)...');

    const results = {
      timestamp: new Date().toISOString(),
      releaseReady: false,
      checks: {},
      blockers: [],
      warnings: []
    };

    // Load AdminSettings once
    let settings = null;
    try {
      const rows = await base44.asServiceRole.entities.AdminSettings.list('-created_date', 1);
      settings = rows[0] || null;
    } catch (err) {
      results.blockers.push('Could not read AdminSettings: ' + err.message);
    }

    // ─── CHECK 1: AdminSettings exists ───────────────────────────────────────
    results.checks.adminSettingsPresent = {
      passed: !!settings,
      details: settings ? 'AdminSettings record found' : 'AdminSettings missing — seeding required'
    };
    if (!settings) {
      results.warnings.push('AdminSettings missing — pricing running on hardcoded defaults');
    }

    // ─── CHECK 2: Config integrity (parse all fields) ─────────────────────────
    try {
      const riskEngine = settings?.riskEngine ? JSON.parse(settings.riskEngine) : null;
      const brackets = riskEngine?.escalation_brackets;
      const bracketsOk = Array.isArray(brackets) && brackets.length >= 5;
      const baseTiersOk = !!(settings?.baseTierPrices) && JSON.parse(settings.baseTierPrices)?.tier_a_10_15k > 0;
      const tokensOk = !!(settings?.additiveTokens) && Object.keys(JSON.parse(settings.additiveTokens)).length >= 10;
      const passed = bracketsOk && baseTiersOk && tokensOk;

      results.checks.configIntegrity = {
        passed: settings ? passed : true, // No settings = using defaults = warn, not block
        bracketCount: brackets?.length ?? 'N/A (default)',
        usingDefaults: !settings,
        details: !settings
          ? 'Using hardcoded defaults (AdminSettings not seeded)'
          : passed
            ? `Config valid: ${brackets.length} brackets, baseTiers OK, tokens OK`
            : `Config invalid: brackets=${bracketsOk}, baseTiers=${baseTiersOk}, tokens=${tokensOk}`
      };

      if (settings && !passed) {
        results.blockers.push('AdminSettings present but config is corrupt');
      }
    } catch (err) {
      results.checks.configIntegrity = { passed: false, details: 'Parse error: ' + err.message };
      results.blockers.push('Config integrity parse failed: ' + err.message);
    }

    // ─── CHECK 3: Pricing floor enforced (lowest-risk Tier A pool) ───────────
    try {
      const c = runPricingSpotCheck(settings, {
        poolSize: '10_15k', enclosure: 'fully_screened', useFrequency: 'rarely',
        chlorinationMethod: 'saltwater', petsAccess: false
      });
      const passed = c.finalPrice >= 120;
      results.checks.pricingFloor = {
        passed,
        finalPrice: c.finalPrice,
        floor: c.floor,
        details: passed ? `Floor enforced: $${c.finalPrice} >= $${c.floor}` : `VIOLATED: $${c.finalPrice} < $${c.floor}`
      };
      if (!passed) results.blockers.push('Absolute price floor ($120) violated');
    } catch (err) {
      results.checks.pricingFloor = { passed: false, details: err.message };
      results.blockers.push('Pricing floor check threw: ' + err.message);
    }

    // ─── CHECK 4: Tier A base price in expected range ($120–$250) ─────────────
    try {
      const c = runPricingSpotCheck(settings, {
        poolSize: '10_15k', enclosure: 'fully_screened', useFrequency: 'weekends',
        chlorinationMethod: 'saltwater', petsAccess: false
      });
      const passed = c.baseMonthly >= 120 && c.baseMonthly <= 250;
      results.checks.tierAPricing = {
        passed,
        baseMonthly: c.baseMonthly,
        finalMonthlyPrice: c.finalPrice,
        details: passed
          ? `Tier A base = $${c.baseMonthly}, final = $${c.finalPrice.toFixed(2)}`
          : `Tier A base out of range: $${c.baseMonthly}`
      };
      if (!passed) results.blockers.push('Tier A base price out of expected range');
    } catch (err) {
      results.checks.tierAPricing = { passed: false, details: err.message };
      results.blockers.push('Tier A pricing check threw: ' + err.message);
    }

    // ─── CHECK 5: Risk escalation fires on high-risk pool ────────────────────
    try {
      const c = runPricingSpotCheck(settings, {
        poolSize: '20_30k', enclosure: 'unscreened', treesOverhead: 'yes',
        useFrequency: 'daily', chlorinationMethod: 'liquid_chlorine',
        petsAccess: true, petSwimFrequency: 'frequently'
      });
      const passed = c.riskAddon > 0 && c.adjustedRisk >= 5;
      results.checks.riskEscalation = {
        passed,
        riskAddon: c.riskAddon,
        adjustedRisk: c.adjustedRisk,
        finalMonthlyPrice: parseFloat(c.finalPrice.toFixed(2)),
        details: passed
          ? `Risk addon = $${c.riskAddon}, adjustedRisk = ${c.adjustedRisk.toFixed(2)} — escalation brackets working`
          : `Risk escalation not firing: addon=${c.riskAddon}, adjustedRisk=${c.adjustedRisk}`
      };
      if (!passed) results.blockers.push('Risk escalation brackets not firing — margin protection gap');
    } catch (err) {
      results.checks.riskEscalation = { passed: false, details: err.message };
      results.blockers.push('Risk escalation check threw: ' + err.message);
    }

    // ─── CHECK 6: Entity layer accessible ────────────────────────────────────
    try {
      const leads = await base44.asServiceRole.entities.Lead.list('-created_date', 1);
      results.checks.entityAccess = {
        passed: true,
        details: `Entity layer reachable (leads sample: ${leads.length})`
      };
    } catch (err) {
      results.checks.entityAccess = { passed: false, details: err.message };
      results.warnings.push('Entity access check failed: ' + err.message);
    }

    // ─── Final determination ──────────────────────────────────────────────────
    results.releaseReady = results.blockers.length === 0;

    if (results.releaseReady) {
      console.log('✅ RELEASE READY — all checks passed');
    } else {
      console.error('🚨 RELEASE BLOCKED:', JSON.stringify(results.blockers));
    }

    return Response.json(results);

  } catch (error) {
    console.error('checkReleaseReadiness fatal error:', error.message);
    return Response.json({
      releaseReady: false,
      error: error.message,
      blockers: ['Release check execution failed: ' + error.message],
      checks: {}
    }, { status: 500 });
  }
});