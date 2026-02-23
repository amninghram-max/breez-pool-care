import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * Test Runner - Executes all test suites and generates JSON + HTML reports
 * Invoke via: POST /test-runner with { runAll: true } or { suite: "pricing" }
 */

// Import test suites
import { runPricingTests } from './tests/pricing-engine.test.js';
import { runLeadPipelineTests } from './tests/lead-pipeline.test.js';
import { runBillingTests } from './tests/billing-autopay.test.js';
import { runSecurityTests } from './tests/security-rbac.test.js';
import { runSchedulingTests } from './tests/scheduling-routing.test.js';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    // Admin-only endpoint
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    const { runAll = true, suite, format = 'json' } = await req.json();

    const startTime = Date.now();
    const timestamp = new Date().toISOString();

    // Results aggregation
    const results = {
      summary: {
        timestamp,
        totalTests: 0,
        passed: 0,
        failed: 0,
        skipped: 0,
        duration: 0
      },
      suites: {},
      failures: [],
      coverage: {}
    };

    // Execute test suites
    const suitesToRun = runAll ? [
      { name: 'pricing', fn: runPricingTests },
      { name: 'lead-pipeline', fn: runLeadPipelineTests },
      { name: 'billing', fn: runBillingTests },
      { name: 'security', fn: runSecurityTests },
      { name: 'scheduling', fn: runSchedulingTests }
    ] : [{ name: suite, fn: getSuiteFunction(suite) }];

    for (const { name, fn } of suitesToRun) {
      if (!fn) continue;
      
      console.log(`Running ${name} tests...`);
      const suiteResult = await fn(base44);
      
      results.suites[name] = suiteResult;
      results.summary.totalTests += suiteResult.total;
      results.summary.passed += suiteResult.passed;
      results.summary.failed += suiteResult.failed;
      results.summary.skipped += suiteResult.skipped;

      // Collect failures
      if (suiteResult.failures) {
        results.failures.push(...suiteResult.failures.map(f => ({
          ...f,
          suite: name
        })));
      }
    }

    results.summary.duration = Date.now() - startTime;

    // Calculate coverage
    results.coverage = calculateCoverage(results.suites);

    // Return JSON or HTML
    if (format === 'html') {
      return new Response(generateHTMLReport(results), {
        headers: { 'Content-Type': 'text/html' }
      });
    }

    return Response.json(results);

  } catch (error) {
    console.error('Test runner error:', error);
    return Response.json({ 
      error: error.message,
      stack: error.stack 
    }, { status: 500 });
  }
});

function getSuiteFunction(suite) {
  const map = {
    'pricing': runPricingTests,
    'lead-pipeline': runLeadPipelineTests,
    'billing': runBillingTests,
    'security': runSecurityTests,
    'scheduling': runSchedulingTests
  };
  return map[suite];
}

function calculateCoverage(suites) {
  const coverage = {};
  
  for (const [name, suite] of Object.entries(suites)) {
    const total = suite.total || 0;
    const passed = suite.passed || 0;
    coverage[name] = total > 0 ? Math.round((passed / total) * 100) : 0;
  }

  const totalTests = Object.values(suites).reduce((sum, s) => sum + (s.total || 0), 0);
  const totalPassed = Object.values(suites).reduce((sum, s) => sum + (s.passed || 0), 0);
  coverage.overall = totalTests > 0 ? Math.round((totalPassed / totalTests) * 100) : 0;

  return coverage;
}

function generateHTMLReport(results) {
  const { summary, suites, failures, coverage } = results;
  
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Breez Test Report - ${summary.timestamp}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: system-ui, -apple-system, sans-serif; background: #f5f5f5; padding: 20px; }
    .container { max-width: 1200px; margin: 0 auto; background: white; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
    .header { background: linear-gradient(135deg, #1B9B9F 0%, #5DADE2 100%); color: white; padding: 30px; border-radius: 8px 8px 0 0; }
    .header h1 { font-size: 32px; margin-bottom: 10px; }
    .header p { opacity: 0.9; }
    .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; padding: 30px; border-bottom: 1px solid #e0e0e0; }
    .stat { text-align: center; }
    .stat-value { font-size: 36px; font-weight: bold; color: #1B9B9F; }
    .stat-label { font-size: 14px; color: #666; margin-top: 5px; }
    .passed { color: #10B981; }
    .failed { color: #EF4444; }
    .section { padding: 30px; border-bottom: 1px solid #e0e0e0; }
    .section h2 { font-size: 24px; margin-bottom: 20px; color: #333; }
    .suite-grid { display: grid; gap: 15px; }
    .suite-card { border: 1px solid #e0e0e0; border-radius: 8px; padding: 20px; }
    .suite-card h3 { font-size: 18px; margin-bottom: 10px; display: flex; justify-content: space-between; align-items: center; }
    .badge { display: inline-block; padding: 4px 12px; border-radius: 12px; font-size: 12px; font-weight: 600; }
    .badge-success { background: #D1FAE5; color: #065F46; }
    .badge-danger { background: #FEE2E2; color: #991B1B; }
    .progress-bar { height: 8px; background: #e0e0e0; border-radius: 4px; overflow: hidden; margin-top: 10px; }
    .progress-fill { height: 100%; background: #10B981; transition: width 0.3s; }
    .failure-card { background: #FEF2F2; border: 1px solid #FCA5A5; border-radius: 8px; padding: 20px; margin-bottom: 15px; }
    .failure-card h4 { color: #991B1B; margin-bottom: 10px; }
    .failure-card pre { background: white; padding: 15px; border-radius: 4px; overflow-x: auto; font-size: 12px; }
    .coverage-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 15px; }
    .coverage-item { border: 1px solid #e0e0e0; border-radius: 8px; padding: 15px; }
    .coverage-item h4 { font-size: 14px; color: #666; margin-bottom: 10px; }
    .coverage-value { font-size: 32px; font-weight: bold; color: #1B9B9F; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🏊 Breez Test Report</h1>
      <p>Generated: ${new Date(summary.timestamp).toLocaleString()}</p>
      <p>Duration: ${(summary.duration / 1000).toFixed(2)}s</p>
    </div>

    <div class="summary">
      <div class="stat">
        <div class="stat-value">${summary.totalTests}</div>
        <div class="stat-label">Total Tests</div>
      </div>
      <div class="stat">
        <div class="stat-value passed">${summary.passed}</div>
        <div class="stat-label">Passed</div>
      </div>
      <div class="stat">
        <div class="stat-value failed">${summary.failed}</div>
        <div class="stat-label">Failed</div>
      </div>
      <div class="stat">
        <div class="stat-value">${summary.skipped}</div>
        <div class="stat-label">Skipped</div>
      </div>
      <div class="stat">
        <div class="stat-value">${coverage.overall}%</div>
        <div class="stat-label">Overall Coverage</div>
      </div>
    </div>

    <div class="section">
      <h2>📊 Coverage by Module</h2>
      <div class="coverage-grid">
        ${Object.entries(coverage).filter(([k]) => k !== 'overall').map(([name, pct]) => `
          <div class="coverage-item">
            <h4>${name.replace('-', ' ').toUpperCase()}</h4>
            <div class="coverage-value">${pct}%</div>
            <div class="progress-bar">
              <div class="progress-fill" style="width: ${pct}%"></div>
            </div>
          </div>
        `).join('')}
      </div>
    </div>

    <div class="section">
      <h2>✅ Test Suites</h2>
      <div class="suite-grid">
        ${Object.entries(suites).map(([name, suite]) => `
          <div class="suite-card">
            <h3>
              ${name.replace('-', ' ').toUpperCase()}
              <span class="badge ${suite.failed === 0 ? 'badge-success' : 'badge-danger'}">
                ${suite.passed}/${suite.total}
              </span>
            </h3>
            <div class="progress-bar">
              <div class="progress-fill" style="width: ${(suite.passed / suite.total * 100)}%"></div>
            </div>
          </div>
        `).join('')}
      </div>
    </div>

    ${failures.length > 0 ? `
      <div class="section">
        <h2>❌ Failures (${failures.length})</h2>
        ${failures.map(f => `
          <div class="failure-card">
            <h4>${f.suite} / ${f.test}</h4>
            <p><strong>Expected:</strong> ${JSON.stringify(f.expected)}</p>
            <p><strong>Actual:</strong> ${JSON.stringify(f.actual)}</p>
            ${f.stack ? `<pre>${f.stack}</pre>` : ''}
          </div>
        `).join('')}
      </div>
    ` : ''}
  </div>
</body>
</html>`;
}