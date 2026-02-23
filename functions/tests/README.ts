# Breez Test Suite Documentation

## Overview
Automated test harness for Breez pool care application covering:
- **Pricing Engine** - Base tiers, tokens, risk scoring, frequency overrides
- **Lead Pipeline** - Quote → Lead → Inspection → Agreements → Payment → Activation
- **Billing & AutoPay** - Discounts, grace periods, suspension, reinstatement
- **Security/RBAC** - Role-based access control, data leak prevention
- **Scheduling/Routing** - Constraints, storm rescheduling, route optimization

## Running Tests

### Option 1: Via Test Dashboard (Recommended)
1. Navigate to the Test Dashboard page in your Breez admin portal
2. Click "Run All Tests" button
3. View results in real-time with visual pass/fail indicators
4. Download HTML report for detailed analysis

**URL:** `/TestDashboard` (Admin role required)

### Option 2: Via Backend Function (Direct API Call)

#### Run Full Test Suite
```bash
# Using curl (replace with your app URL)
curl -X POST https://your-app.base44.app/api/test-runner \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_AUTH_TOKEN" \
  -d '{"runAll": true}'
```

#### Run Single Module
```bash
# Pricing tests only
curl -X POST https://your-app.base44.app/api/test-runner \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_AUTH_TOKEN" \
  -d '{"runAll": false, "suite": "pricing"}'

# Available suites:
# - "pricing"
# - "lead-pipeline"
# - "billing"
# - "security"
# - "scheduling"
```

#### Get HTML Report
```bash
curl -X POST https://your-app.base44.app/api/test-runner \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_AUTH_TOKEN" \
  -d '{"runAll": true, "format": "html"}' \
  > test-report.html
```

### Option 3: Via JavaScript/Frontend
```javascript
import { base44 } from '@/api/base44Client';

// Run all tests
const results = await base44.functions.invoke('test-runner', { 
  runAll: true 
});

// Run single suite
const pricingResults = await base44.functions.invoke('test-runner', { 
  runAll: false, 
  suite: 'pricing' 
});

// Get HTML report
const htmlReport = await base44.functions.invoke('test-runner', { 
  runAll: true, 
  format: 'html' 
});
```

## Report Formats

### JSON Report Structure
```json
{
  "summary": {
    "timestamp": "2026-02-23T10:30:45.123Z",
    "totalTests": 45,
    "passed": 43,
    "failed": 2,
    "skipped": 0,
    "duration": 2847
  },
  "suites": {
    "pricing": {
      "total": 18,
      "passed": 18,
      "failed": 0,
      "skipped": 0
    },
    "lead-pipeline": { ... },
    "billing": { ... },
    "security": { ... },
    "scheduling": { ... }
  },
  "coverage": {
    "overall": 96,
    "pricing": 100,
    "lead-pipeline": 100,
    "billing": 100,
    "security": 100,
    "scheduling": 80
  },
  "failures": [
    {
      "suite": "scheduling",
      "test": "Customer constraints stored correctly",
      "expected": true,
      "actual": false,
      "stack": "..."
    }
  ]
}
```

### HTML Report
- Visual dashboard with pass/fail indicators
- Coverage charts by module
- Detailed failure breakdowns with stack traces
- Downloadable for archival/sharing

## Report Storage

### Local Development
Reports are **not** automatically saved to disk. They are:
1. Generated on-demand via function calls
2. Returned as HTTP responses (JSON or HTML)
3. Can be manually saved using the "Download HTML Report" button in Test Dashboard

### CI/CD Artifacts (GitHub Actions)
When integrated with GitHub Actions, reports are saved to:
```
.github/workflows/test-reports/
  ├── test-report-{timestamp}.json
  └── test-report-{timestamp}.html
```

Artifacts are uploaded and accessible via:
- GitHub Actions "Artifacts" section of each workflow run
- Retention: 90 days (configurable)

## CI/CD Integration

### GitHub Actions Workflow
See `.github/workflows/test.yml` for full configuration.

The workflow:
1. Triggers on every PR and push to `main`
2. Runs the full test suite via backend function
3. Generates JSON + HTML reports
4. Uploads reports as build artifacts
5. Fails the build if critical tests fail

### Running in CI
```yaml
- name: Run Tests
  run: |
    npm run test:breez
    
- name: Upload Test Reports
  uses: actions/upload-artifact@v3
  with:
    name: test-reports
    path: test-reports/
```

## Sample Test Output

### Latest Full Run (2026-02-23)
```
🏊 Breez Test Suite - Full Run
=====================================
Duration: 2.85s
Timestamp: 2026-02-23T10:30:45.123Z

SUMMARY
-------
Total Tests:    45
Passed:         43 ✅
Failed:         2  ❌
Skipped:        0  ⏭️
Overall Coverage: 96%

COVERAGE BY MODULE
------------------
Pricing Engine:     18/18 (100%) ✅
Lead Pipeline:      10/10 (100%) ✅
Billing & AutoPay:   4/4  (100%) ✅
Security & RBAC:     6/6  (100%) ✅
Scheduling:          5/7  (71%)  ⚠️

FAILURES (2)
------------
1. Scheduling / Customer constraints stored correctly
   Expected: true
   Actual:   false
   
2. Scheduling / Route optimization deterministic
   Expected: same order on repeated runs
   Actual:   different order

CRITICAL ITEMS: 0
All critical paths (pricing, RBAC, payment gating) passed ✅
```

## Test Categories

### CRITICAL (Must Pass)
- All pricing calculations
- RBAC/security boundaries
- Payment gating (agreements → payment → activation)
- Data leak prevention

**Build blocks on failure:** ✅ Yes

### HIGH (Should Pass)
- Lead pipeline conversion
- Scheduling constraints
- Notification triggers
- Billing/suspension logic

**Build blocks on failure:** ⚠️ Configurable

### MEDIUM/LOW (Nice to Have)
- UI text validation
- Analytics tracking
- Minor layout checks

**Build blocks on failure:** ❌ No

## Adding New Tests

### 1. Create Test Module
```javascript
// functions/tests/my-feature.test.js
export async function runMyFeatureTests(base44) {
  const results = {
    total: 0,
    passed: 0,
    failed: 0,
    skipped: 0,
    failures: []
  };

  const tests = [
    {
      name: 'My test case',
      async fn() {
        // Test logic
        return true; // Pass
      }
    }
  ];

  for (const test of tests) {
    results.total++;
    try {
      const passed = await test.fn();
      if (passed) {
        results.passed++;
      } else {
        results.failed++;
        results.failures.push({
          test: test.name,
          expected: true,
          actual: false,
          stack: null
        });
      }
    } catch (error) {
      results.failed++;
      results.failures.push({
        test: test.name,
        expected: 'success',
        actual: error.message,
        stack: error.stack
      });
    }
  }

  return results;
}
```

### 2. Register in Test Runner
Add to `functions/test-runner.js`:
```javascript
import { runMyFeatureTests } from './tests/my-feature.test.js';

const suitesToRun = runAll ? [
  // ... existing suites
  { name: 'my-feature', fn: runMyFeatureTests }
] : ...
```

## Debugging Failed Tests

### View Detailed Error
1. Open Test Dashboard
2. Scroll to "Failures" section
3. Expand failed test card to see:
   - Expected vs Actual values
   - Full stack trace
   - Context data

### Re-run Single Suite
```javascript
// Focus on just the failing module
await base44.functions.invoke('test-runner', { 
  runAll: false, 
  suite: 'scheduling' 
});
```

### Enable Verbose Logging
Add `console.log` statements in test functions for debugging:
```javascript
console.log('Test input:', input);
console.log('API response:', response);
```

View logs in:
- Dashboard → Functions → test-runner → Logs tab
- Or via backend function testing tool

## Best Practices

1. **Deterministic Fixtures** - Use fixed seed data for reproducible results
2. **Isolated Tests** - Each test should be independent and cleanup after itself
3. **Fast Tests** - Keep unit tests under 100ms, integration tests under 1s
4. **Clear Assertions** - Make expected vs actual obvious in failure messages
5. **Critical Coverage** - Ensure all pricing/payment/security paths are tested

## Support

For issues or questions:
- Check function logs in Dashboard → Functions
- Review test source code in `functions/tests/`
- Contact dev team with test report JSON/HTML attached