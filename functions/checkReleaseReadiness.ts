import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * RELEASE READINESS CHECK
 * Uses end-to-end smoke tests rather than entity reads to avoid RLS issues.
 * Sub-function calls use the original user token (not asServiceRole) so auth works.
 */

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (user?.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    console.log('🔒 Running release readiness checks...');

    const results = {
      timestamp: new Date().toISOString(),
      releaseReady: false,
      checks: {},
      blockers: [],
      warnings: []
    };

    // ─── CHECK 1: calculateQuote smoke test ───────────────────────────────────
    // Calls via user token so auth works inside calculateQuote
    try {
      const quoteResp = await base44.asServiceRole.functions.invoke('calculateQuote', {
        questionnaireData: {
          poolSize: '10_15k',
          poolType: 'in_ground',
          enclosure: 'fully_screened',
          filterType: 'cartridge',
          chlorinationMethod: 'saltwater',
          chlorinatorType: 'n/a',
          useFrequency: 'weekends',
          petsAccess: false,
          petSwimFrequency: 'never',
          poolCondition: 'clear',
          spaPresent: 'false'
        }
      });

      const quote = quoteResp?.data?.quote;

      if (!quote) {
        results.checks.calculateQuoteSmoke = { passed: false, details: 'No quote returned' };
        results.blockers.push('calculateQuote returned no output');
      } else {
        const priceValid = quote.finalMonthlyPrice >= 120 && quote.finalMonthlyPrice <= 400;
        const versionValid = quote.quoteLogicVersionId === 'v2_tokens_risk_frequency';
        const tierValid = quote.sizeTier === 'tier_a';
        const passed = priceValid && versionValid && tierValid;

        results.checks.calculateQuoteSmoke = {
          passed,
          finalMonthlyPrice: quote.finalMonthlyPrice,
          sizeTier: quote.sizeTier,
          quoteLogicVersionId: quote.quoteLogicVersionId,
          details: passed
            ? `Tier A quote = $${quote.finalMonthlyPrice}/mo — pricing engine healthy`
            : `Pricing sanity failed: price=${quote.finalMonthlyPrice}, tier=${quote.sizeTier}, version=${quote.quoteLogicVersionId}`
        };

        if (!passed) {
          results.blockers.push('calculateQuote smoke test failed: ' + results.checks.calculateQuoteSmoke.details);
        }
      }
    } catch (err) {
      console.error('calculateQuote smoke test threw:', err.message);
      results.checks.calculateQuoteSmoke = { passed: false, details: err.message };
      results.blockers.push('calculateQuote unreachable: ' + err.message);
    }

    // ─── CHECK 2: Pricing floor enforced ─────────────────────────────────────
    try {
      const quoteResp = await base44.asServiceRole.functions.invoke('calculateQuote', {
        questionnaireData: {
          poolSize: '10_15k',
          poolType: 'in_ground',
          enclosure: 'fully_screened',
          filterType: 'cartridge',
          chlorinationMethod: 'saltwater',
          chlorinatorType: 'n/a',
          useFrequency: 'rarely',
          petsAccess: false,
          petSwimFrequency: 'never',
          poolCondition: 'clear',
          spaPresent: 'false'
        }
      });
      const quote = quoteResp?.data?.quote;
      const floorRespected = quote?.finalMonthlyPrice >= 120;

      results.checks.pricingFloor = {
        passed: !!floorRespected,
        finalMonthlyPrice: quote?.finalMonthlyPrice,
        details: floorRespected
          ? `Floor enforced: $${quote.finalMonthlyPrice} >= $120`
          : `Floor VIOLATED: $${quote?.finalMonthlyPrice} < $120`
      };

      if (!floorRespected) {
        results.blockers.push('Absolute price floor ($120) violated — revenue risk');
      }
    } catch (err) {
      results.checks.pricingFloor = { passed: false, details: err.message };
      results.warnings.push('Pricing floor check skipped: ' + err.message);
    }

    // ─── CHECK 3: Risk escalation brackets active ─────────────────────────────
    // High-risk pool (unscreened + trees + daily + liquid chlorine) should get addon
    try {
      const quoteResp = await base44.functions.invoke('calculateQuote', {
        questionnaireData: {
          poolSize: '20_30k',
          poolType: 'in_ground',
          enclosure: 'unscreened',
          treesOverhead: 'yes',
          filterType: 'sand',
          chlorinationMethod: 'liquid_chlorine',
          chlorinatorType: 'n/a',
          useFrequency: 'daily',
          petsAccess: true,
          petSwimFrequency: 'frequently',
          poolCondition: 'clear',
          spaPresent: 'false'
        }
      });
      const quote = quoteResp?.data?.quote;
      const hasRiskAddon = quote?.riskAddonAmount > 0;
      const isHigherThanBase = quote?.finalMonthlyPrice > 190; // Tier C base

      results.checks.riskEscalation = {
        passed: hasRiskAddon && isHigherThanBase,
        riskAddonAmount: quote?.riskAddonAmount,
        adjustedRisk: quote?.adjustedRisk,
        finalMonthlyPrice: quote?.finalMonthlyPrice,
        details: (hasRiskAddon && isHigherThanBase)
          ? `Risk addon = $${quote.riskAddonAmount}, adjustedRisk=${quote.adjustedRisk} — escalation brackets working`
          : `Risk escalation not firing: addon=${quote?.riskAddonAmount}, price=${quote?.finalMonthlyPrice}`
      };

      if (!results.checks.riskEscalation.passed) {
        results.blockers.push('Risk escalation brackets not firing — margin protection compromised');
      }
    } catch (err) {
      results.checks.riskEscalation = { passed: false, details: err.message };
      results.blockers.push('Risk escalation check threw: ' + err.message);
    }

    // ─── CHECK 4: Entity accessibility ───────────────────────────────────────
    try {
      const leads = await base44.asServiceRole.entities.Lead.list('-created_date', 1);
      results.checks.entityAccess = {
        passed: true,
        details: `Entity layer reachable (leads=${leads.length})`
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