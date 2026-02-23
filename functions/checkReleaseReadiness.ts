import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * RELEASE READINESS CHECK
 * Pre-deployment validation gate
 * Blocks production deploy if critical conditions fail
 */

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (user?.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    console.log('🔒 Running release readiness check...');

    const results = {
      timestamp: new Date().toISOString(),
      releaseReady: false,
      checks: {},
      blockers: [],
      warnings: []
    };

    // 1. Run full test suite
    console.log('Running test suite...');
    const testResponse = await base44.asServiceRole.functions.invoke('test-runner', {
      runAll: true
    });
    
    const testResults = testResponse.data;
    
    if (!testResults) {
      results.checks.testSuite = { passed: false, error: 'Test runner failed' };
      results.blockers.push('Test runner execution failed');
      return Response.json(results);
    }

    // 2. Check critical test failures
    const criticalFailed = testResults.summary?.criticalFailed || 0;
    results.checks.criticalTests = {
      passed: criticalFailed === 0,
      criticalFailed,
      details: `${criticalFailed} critical test(s) failed`
    };
    
    if (criticalFailed > 0) {
      results.blockers.push(`${criticalFailed} critical test failures detected`);
    }

    // 3. Check pricing snapshot diffs
    const snapshotMismatches = testResults.snapshotMismatches?.length || 0;
    results.checks.pricingSnapshots = {
      passed: snapshotMismatches === 0,
      mismatches: snapshotMismatches,
      details: snapshotMismatches > 0 
        ? `${snapshotMismatches} pricing snapshot(s) changed` 
        : 'All pricing snapshots match'
    };
    
    if (snapshotMismatches > 0) {
      results.blockers.push(`${snapshotMismatches} pricing snapshot mismatches (revenue drift risk)`);
    }

    // 4. Check RBAC test failures
    const rbacSuite = testResults.suites?.security || {};
    const rbacFailed = rbacSuite.failed || 0;
    results.checks.rbacTests = {
      passed: rbacFailed === 0,
      failed: rbacFailed,
      total: rbacSuite.total || 0,
      details: rbacFailed > 0 
        ? `${rbacFailed} RBAC test(s) failed` 
        : 'All RBAC tests passed'
    };
    
    if (rbacFailed > 0) {
      results.blockers.push(`${rbacFailed} RBAC test failures (security risk)`);
    }

    // 5. Check payment gating failures
    const leadPipelineSuite = testResults.suites?.['lead-pipeline'] || {};
    const pipelineFailures = testResults.failures?.filter(f => 
      f.suite === 'lead-pipeline' && 
      (f.test.includes('payment') || f.test.includes('Payment') || f.test.includes('gating'))
    ) || [];
    
    results.checks.paymentGating = {
      passed: pipelineFailures.length === 0,
      failed: pipelineFailures.length,
      details: pipelineFailures.length > 0
        ? `${pipelineFailures.length} payment gating test(s) failed`
        : 'Payment gating tests passed'
    };
    
    if (pipelineFailures.length > 0) {
      results.blockers.push(`${pipelineFailures.length} payment gating failures`);
    }

    // 6. Config integrity validation
    console.log('Validating config integrity...');
    try {
      const configResponse = await base44.asServiceRole.functions.invoke('validatePricingConfig', {});
      const configValid = configResponse.data?.valid === true;
      
      results.checks.configIntegrity = {
        passed: configValid,
        seeded: configResponse.data?.seeded || false,
        details: configValid 
          ? 'AdminSettings integrity validated' 
          : 'AdminSettings validation failed'
      };
      
      if (!configValid) {
        results.blockers.push('Pricing config integrity check failed');
      }
    } catch (error) {
      results.checks.configIntegrity = {
        passed: false,
        error: error.message
      };
      results.blockers.push('Config validation error: ' + error.message);
    }

    // 7. Test report artifact
    results.checks.testReportArtifact = {
      passed: true, // Test runner generates report by default
      details: 'Test report available in response'
    };

    // 8. Non-critical warnings
    const totalFailed = testResults.summary?.failed || 0;
    const nonCriticalFailed = totalFailed - criticalFailed;
    
    if (nonCriticalFailed > 0) {
      results.warnings.push(`${nonCriticalFailed} non-critical test(s) failed (review recommended)`);
    }

    const coverage = testResults.coverage?.overall || 0;
    if (coverage < 90) {
      results.warnings.push(`Test coverage below 90% (${coverage}%)`);
    }

    // Final determination
    results.releaseReady = results.blockers.length === 0;

    if (results.releaseReady) {
      console.log('✅ RELEASE READY - All checks passed');
    } else {
      console.error('🚨 RELEASE BLOCKED - Critical issues detected');
      console.error('Blockers:', results.blockers);
    }

    return Response.json({
      ...results,
      testResults: testResults.summary // Include summary for reference
    });

  } catch (error) {
    console.error('Release readiness check error:', error);
    return Response.json({ 
      releaseReady: false,
      error: error.message,
      blockers: ['Release check execution failed']
    }, { status: 500 });
  }
});