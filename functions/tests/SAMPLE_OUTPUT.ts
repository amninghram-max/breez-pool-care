# Sample Test Suite Output

## Full Run - 2026-02-23T10:30:45.123Z

### Console Output
```
🏊 Breez Test Suite - Starting Full Run
========================================

[10:30:45] Running pricing tests...
[10:30:46] ✅ Base Tier A (10-15k) = $140
[10:30:46] ✅ Base Tier B (15-20k) = $160
[10:30:46] ✅ Base Tier C (20-30k) = $190
[10:30:46] ✅ Base Tier D (30k+) = $230
[10:30:46] ✅ Unscreened Tier A adds $20
[10:30:46] ✅ Trees overhead adds $10 (only if unscreened)
[10:30:46] ✅ Trees overhead ignored if screened
[10:30:46] ✅ Daily usage adds $20
[10:30:46] ✅ Floater Tier A adds $5
[10:30:46] ✅ Liquid only adds $10
[10:30:46] ✅ Pets frequent adds $10
[10:30:46] ✅ Slightly cloudy adds $25
[10:30:46] ✅ Green light small = $60
[10:30:46] ✅ Risk points calculated correctly
[10:30:46] ✅ Risk multiplier Tier A = 1.0x
[10:30:46] ✅ Risk bracket 3-5 adds $15
[10:30:47] ✅ High risk (≥9) forces Twice/Week
[10:30:47] ✅ Twice/Week multiplies by 1.8x
[10:30:47] ✅ Final monthly never below $120
Pricing tests: 18/18 passed (100%)

[10:30:47] Running lead-pipeline tests...
[10:30:47] ✅ Quote creation generates PoolQuestionnaire record
[10:30:47] ✅ Lead created/updated when quote generated
[10:30:47] ✅ Agreements acceptance stored with timestamp
[10:30:48] ✅ Payment success moves lead to converted stage
[10:30:48] ✅ Inspection scheduled updates lead stage
Lead pipeline tests: 5/5 passed (100%)

[10:30:48] Running billing tests...
[10:30:48] ✅ AutoPay discount (-$10) applied when enabled
[10:30:48] ✅ Grace period = 72 hours after payment failure
[10:30:48] ✅ Default reinstatement fee = $50
[10:30:48] ✅ Suspension changes account status
Billing tests: 4/4 passed (100%)

[10:30:48] Running security tests...
[10:30:48] ✅ Customer cannot access admin pricing config
[10:30:48] ✅ Risk scoring fields hidden from customer quote output
[10:30:48] ✅ Gate codes stored in Lead entity are encrypted
[10:30:48] ✅ Customer cannot view other customers data
[10:30:48] ✅ Staff cannot access admin-only AdminSettings
[10:30:48] ✅ Technician cannot access billing data
Security tests: 6/6 passed (100%)

[10:30:48] Running scheduling tests...
[10:30:48] ✅ Customer scheduled Mon-Sat only (not Sunday)
[10:30:48] ✅ Service duration varies by pool size
[10:30:48] ✅ Storm day reschedule logic exists
[10:30:48] ✅ Customer constraints stored correctly
Scheduling tests: 4/4 passed (100%)

========================================
🎉 TEST SUITE COMPLETE
========================================
Duration: 2.85 seconds
Total Tests: 37
Passed: 37 ✅
Failed: 0 ❌
Skipped: 0 ⏭️
Overall Coverage: 100%
```

## JSON Report (Abbreviated)
```json
{
  "summary": {
    "timestamp": "2026-02-23T10:30:45.123Z",
    "totalTests": 37,
    "passed": 37,
    "failed": 0,
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
    "lead-pipeline": {
      "total": 5,
      "passed": 5,
      "failed": 0,
      "skipped": 0
    },
    "billing": {
      "total": 4,
      "passed": 4,
      "failed": 0,
      "skipped": 0
    },
    "security": {
      "total": 6,
      "passed": 6,
      "failed": 0,
      "skipped": 0
    },
    "scheduling": {
      "total": 4,
      "passed": 4,
      "failed": 0,
      "skipped": 0
    }
  },
  "coverage": {
    "overall": 100,
    "pricing": 100,
    "lead-pipeline": 100,
    "billing": 100,
    "security": 100,
    "scheduling": 100
  },
  "failures": []
}
```

## Example with Failures

### Console Output
```
[10:32:15] Running pricing tests...
[10:32:16] ✅ Base Tier A (10-15k) = $140
[10:32:16] ✅ Base Tier B (15-20k) = $160
...
[10:32:17] ❌ Risk bracket 6-8 adds $30
   Expected: { riskAddon: 30 }
   Actual: { riskAddon: 25 }
...
[10:32:18] ❌ Green light medium = $100
   Expected: { oneTimeFee: 100 }
   Actual: { oneTimeFee: 95 }
Pricing tests: 16/18 passed (89%)

========================================
⚠️ TEST SUITE COMPLETED WITH FAILURES
========================================
Duration: 2.91 seconds
Total Tests: 37
Passed: 35 ✅
Failed: 2 ❌
Skipped: 0 ⏭️
Overall Coverage: 95%

CRITICAL FAILURES: 2
⛔ Build blocked - pricing discrepancies detected
```

### JSON Report (Failures)
```json
{
  "summary": {
    "timestamp": "2026-02-23T10:32:15.456Z",
    "totalTests": 37,
    "passed": 35,
    "failed": 2,
    "skipped": 0,
    "duration": 2912
  },
  "failures": [
    {
      "suite": "pricing",
      "test": "Risk bracket 6-8 adds $30",
      "expected": { "riskAddon": 30 },
      "actual": { "riskAddon": 25 },
      "stack": null
    },
    {
      "suite": "pricing",
      "test": "Green light medium = $100",
      "expected": { "oneTimeFee": 100 },
      "actual": { "oneTimeFee": 95 },
      "stack": null
    }
  ],
  "coverage": {
    "overall": 95,
    "pricing": 89,
    "lead-pipeline": 100,
    "billing": 100,
    "security": 100,
    "scheduling": 100
  }
}
```

## Performance Benchmarks

### By Test Suite
| Suite | Tests | Duration | Avg per Test |
|-------|-------|----------|--------------|
| Pricing | 18 | 1.2s | 67ms |
| Lead Pipeline | 5 | 0.8s | 160ms |
| Billing | 4 | 0.3s | 75ms |
| Security | 6 | 0.4s | 67ms |
| Scheduling | 4 | 0.15s | 38ms |
| **Total** | **37** | **2.85s** | **77ms** |

### Trends
- ✅ All tests complete in under 3 seconds
- ✅ No individual test exceeds 200ms
- ✅ Consistent performance across runs (±5%)

## CI/CD Integration Output

### GitHub Actions Summary
```
✅ Breez Test Suite - PASSED

Duration: 2.85s
Coverage: 100%

📊 Test Results:
- Total: 37
- Passed: 37 ✅
- Failed: 0 ❌

🔍 Coverage by Module:
- Pricing Engine: 100%
- Lead Pipeline: 100%
- Billing: 100%
- Security/RBAC: 100%
- Scheduling: 100%

📎 Artifacts:
- test-report-20260223-103045.json (uploaded)
- test-report-20260223-103045.html (uploaded)

✅ All critical paths verified
✅ Build approved for deployment
```

### Artifact Download
```bash
# Download from GitHub Actions
gh run download 12345678 -n test-reports-42

# Files downloaded:
# - test-report-20260223-103045.json
# - test-report-20260223-103045.html
```

## Pricing Snapshot Comparison

### When pricing config changes
```
⚠️ PRICING SNAPSHOT DIFFS DETECTED

Canonical Quote: Tier B, Unscreened, Daily Usage, Floater
├─ OLD: $195/month (base $160 + unscreened $25 + daily $20 + floater $10, risk bracket $0)
└─ NEW: $210/month (base $160 + unscreened $25 + daily $20 + floater $10, risk bracket $15)
   
   Risk bracket changed: 0→1 (adjusted risk 3.3 now falls in bracket [3,5])
   
Canonical Quote: Tier D, High Risk (≥9)
├─ OLD: $441/month (weekly, risk 9.1)
└─ NEW: $486/month (twice-weekly forced, risk 9.1)
   
   Frequency override now applies at risk ≥9 (was ≥10)
   Base $230 → $414 (after tokens+risk) → $486 (×1.8 freq multiplier)

⚠️ Manual review required before deploying pricing changes
``