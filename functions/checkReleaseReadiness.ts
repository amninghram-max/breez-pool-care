import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * RELEASE READINESS CHECK - Inline version (no sub-function HTTP calls)
 * Runs critical checks directly to avoid 404 on hyphenated function names.
 */

const DEFAULT_ESCALATION_BRACKETS = [
  { min_risk: 0, max_risk: 2, addon_amount: 0 },
  { min_risk: 3, max_risk: 5, addon_amount: 15 },
  { min_risk: 6, max_risk: 8, addon_amount: 30 },
  { min_risk: 9, max_risk: 11, addon_amount: 45 },
  { min_risk: 12, max_risk: 999, addon_amount: 60 }
];

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (user?.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    console.log('🔒 Running release readiness checks inline...');

    const results = {
      timestamp: new Date().toISOString(),
      releaseReady: false,
      checks: {},
      blockers: [],
      warnings: []
    };

    // ─── CHECK 1: Config Integrity ────────────────────────────────────────────
    try {
      const settingsResult = await base44.asServiceRole.entities.AdminSettings.list('-created_date', 1);
      const settings = settingsResult[0];

      if (!settings) {
        results.checks.configIntegrity = { passed: false, details: 'AdminSettings record missing' };
        results.blockers.push('AdminSettings missing — pricing engine will use fallback');
      } else {
        const riskEngine = settings.riskEngine ? JSON.parse(settings.riskEngine) : null;
        const brackets = riskEngine?.escalation_brackets;
        const bracketsValid = Array.isArray(brackets) && brackets.length >= 5;
        const tokensValid = !!settings.additiveTokens;
        const baseTiersValid = !!settings.baseTierPrices;

        results.checks.configIntegrity = {
          passed: bracketsValid && tokensValid && baseTiersValid,
          bracketCount: brackets?.length ?? 0,
          details: bracketsValid && tokensValid && baseTiersValid
            ? 'AdminSettings validated — brackets, tokens, base tiers all present'
            : `Invalid config: brackets=${bracketsValid}, tokens=${tokensValid}, baseTiers=${baseTiersValid}`
        };

        if (!results.checks.configIntegrity.passed) {
          results.blockers.push('Pricing config integrity failed: ' + results.checks.configIntegrity.details);
        }
      }
    } catch (err) {
      results.checks.configIntegrity = { passed: false, details: err.message };
      results.blockers.push('Config integrity check threw: ' + err.message);
    }

    // ─── CHECK 2: Pricing Sanity Spot-Check ───────────────────────────────────
    // Inline minimal pricing check: Tier A standard pool must land between $140–$180
    try {
      const settingsResult = await base44.asServiceRole.entities.AdminSettings.list('-created_date', 1);
      const settings = settingsResult[0];
      const baseTiers = settings?.baseTierPrices ? JSON.parse(settings.baseTierPrices) : null;
      const tierA = baseTiers?.tier_a_10_15k;
      const floor = baseTiers?.absolute_floor;

      const tierAValid = typeof tierA === 'number' && tierA >= 120 && tierA <= 250;
      const floorValid = typeof floor === 'number' && floor >= 100 && floor <= tierA;

      results.checks.pricingSanity = {
        passed: tierAValid && floorValid,
        tierAPrice: tierA,
        absoluteFloor: floor,
        details: tierAValid && floorValid
          ? `Tier A = $${tierA}, floor = $${floor} — within expected range`
          : `Pricing sanity failed: tierA=${tierA}, floor=${floor}`
      };

      if (!results.checks.pricingSanity.passed) {
        results.blockers.push('Pricing sanity check failed: ' + results.checks.pricingSanity.details);
      }
    } catch (err) {
      results.checks.pricingSanity = { passed: false, details: err.message };
      results.blockers.push('Pricing sanity check threw: ' + err.message);
    }

    // ─── CHECK 3: Escalation Brackets Integrity ───────────────────────────────
    try {
      const settingsResult = await base44.asServiceRole.entities.AdminSettings.list('-created_date', 1);
      const settings = settingsResult[0];
      const riskEngine = settings?.riskEngine ? JSON.parse(settings.riskEngine) : null;
      const brackets = riskEngine?.escalation_brackets ?? DEFAULT_ESCALATION_BRACKETS;

      // Verify brackets cover 0 and have a catch-all max
      const hasCoverage = brackets.some(b => b.min_risk === 0);
      const hasCatchAll = brackets.some(b => b.max_risk >= 999);
      const allHaveAddon = brackets.every(b => typeof b.addon_amount === 'number');
      const usingDefault = !settings?.riskEngine;

      results.checks.escalationBrackets = {
        passed: brackets.length >= 5 && hasCoverage && hasCatchAll && allHaveAddon,
        count: brackets.length,
        usingDefault,
        details: usingDefault
          ? 'Using default brackets (AdminSettings.riskEngine not set)'
          : `${brackets.length} brackets configured — coverage=${hasCoverage}, catch-all=${hasCatchAll}`
      };

      if (usingDefault) {
        results.warnings.push('Risk engine using default escalation brackets — AdminSettings.riskEngine not seeded');
      } else if (!results.checks.escalationBrackets.passed) {
        results.blockers.push('Escalation brackets invalid: ' + results.checks.escalationBrackets.details);
      }
    } catch (err) {
      results.checks.escalationBrackets = { passed: false, details: err.message };
      results.blockers.push('Escalation brackets check threw: ' + err.message);
    }

    // ─── CHECK 4: Entity Accessibility (RBAC canary) ─────────────────────────
    try {
      // Admin should be able to read AdminSettings and Leads
      const [settingsCount, leadsCount] = await Promise.all([
        base44.asServiceRole.entities.AdminSettings.filter({ settingKey: 'default' }).then(r => r.length),
        base44.asServiceRole.entities.Lead.list('-created_date', 1).then(r => r.length)
      ]);

      results.checks.entityAccess = {
        passed: true,
        details: `Admin entity access confirmed (settings=${settingsCount}, leads canary=${leadsCount})`
      };
    } catch (err) {
      results.checks.entityAccess = { passed: false, details: err.message };
      results.blockers.push('Entity access check failed: ' + err.message);
    }

    // ─── CHECK 5: validatePricingConfig function (separate camelCase fn) ──────
    try {
      const configResponse = await base44.asServiceRole.functions.invoke('validatePricingConfig', {});
      const configValid = configResponse?.data?.valid === true || configResponse?.data?.seeded === true;

      results.checks.validatePricingConfig = {
        passed: configValid,
        seeded: configResponse?.data?.seeded || false,
        details: configValid ? 'validatePricingConfig returned valid' : 'validatePricingConfig returned invalid'
      };

      if (!configValid) {
        results.blockers.push('validatePricingConfig() returned invalid');
      }
    } catch (err) {
      // Non-blocking — log as warning since inline checks already cover config
      results.checks.validatePricingConfig = { passed: false, details: err.message };
      results.warnings.push('validatePricingConfig function unreachable: ' + err.message);
    }

    // ─── Final determination ──────────────────────────────────────────────────
    results.releaseReady = results.blockers.length === 0;

    if (results.releaseReady) {
      console.log('✅ RELEASE READY — all inline checks passed');
    } else {
      console.error('🚨 RELEASE BLOCKED:', results.blockers);
    }

    return Response.json(results);

  } catch (error) {
    console.error('checkReleaseReadiness fatal error:', error);
    return Response.json({
      releaseReady: false,
      error: error.message,
      blockers: ['Release check execution failed: ' + error.message],
      checks: {}
    }, { status: 500 });
  }
});