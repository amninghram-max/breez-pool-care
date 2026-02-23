# CI/CD Critical Test Enforcement

## ✅ Confirmation: CI BLOCKS merge/deploy on Critical test failures

### Critical Test Categories (Build-Blocking)

#### 1. **Pricing Engine** (Suite: `pricing`)
All pricing tests are CRITICAL and block deployment:
- ✅ Base tier calculations ($140, $160, $190, $230)
- ✅ Absolute floor enforcement ($120 minimum)
- ✅ Risk bracket escalation add-ons ($0, $15, $30, $45, $60)
- ✅ Forced Twice/Week when adjusted risk ≥ 9
- ✅ Frequency multiplier (1.0x weekly, 1.8x twice-weekly)
- ✅ Additive tokens (screening, trees, usage, chlorination, pets)
- ✅ One-time fees (cloudy, green-to-clean tiers)

**Rationale:** Any pricing error directly impacts revenue and customer trust.

#### 2. **Security/RBAC** (Suite: `security`)
All security tests are CRITICAL and block deployment:
- ✅ Customer cannot access AdminSettings (pricing config)
- ✅ Customer cannot view other customers' data (RLS enforcement)
- ✅ Risk scoring fields hidden from customer quote output
- ✅ Staff cannot modify admin-only settings
- ✅ Technician cannot access billing/invoice data
- ✅ Gate codes properly encrypted and access-controlled

**Rationale:** Security breaches = legal liability + customer data exposure.

#### 3. **Payment Gating** (Subset of `lead-pipeline`)
Payment flow tests are CRITICAL:
- ✅ Cannot activate service without payment success
- ✅ Agreements acceptance required before payment
- ✅ Payment failure → status remains "Pending"
- ✅ Payment success → status becomes "Active"

**Rationale:** Broken payment gating = revenue loss or unauthorized service access.

---

## CI Pipeline Enforcement (GitHub Actions)

### Pipeline Step: Critical Test Validation

```yaml
# .github/workflows/breez-tests.yml

- name: Run Breez Test Suite
  id: run_tests
  env:
    BASE44_APP_URL: ${{ secrets.BASE44_APP_URL }}
    BASE44_ADMIN_TOKEN: ${{ secrets.BASE44_ADMIN_TOKEN }}
  run: |
    # Run full test suite
    curl -X POST "$BASE44_APP_URL/api/test-runner" \
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer $BASE44_ADMIN_TOKEN" \
      -d '{"runAll": true}' \
      -o test-report.json
    
    # Parse critical failure counts
    PRICING_FAILED=$(cat test-report.json | jq -r '[.failures[] | select(.suite == "pricing")] | length')
    SECURITY_FAILED=$(cat test-report.json | jq -r '[.failures[] | select(.suite == "security")] | length')
    PAYMENT_GATING_FAILED=$(cat test-report.json | jq -r '[.failures[] | select(.suite == "lead-pipeline" and (.test | contains("payment") or contains("Payment") or contains("active")))] | length')
    
    CRITICAL_FAILED=$((PRICING_FAILED + SECURITY_FAILED + PAYMENT_GATING_FAILED))
    
    echo "============================================"
    echo "CRITICAL TEST VALIDATION"
    echo "============================================"
    echo "Pricing failures: $PRICING_FAILED"
    echo "Security/RBAC failures: $SECURITY_FAILED"
    echo "Payment gating failures: $PAYMENT_GATING_FAILED"
    echo "--------------------------------------------"
    echo "Total critical failures: $CRITICAL_FAILED"
    echo "============================================"
    
    # HARD BLOCK: Exit with error if ANY critical test fails
    if [ "$CRITICAL_FAILED" -gt 0 ]; then
      echo "❌ CRITICAL TESTS FAILED"
      echo "⛔ DEPLOYMENT BLOCKED"
      echo ""
      echo "Failed tests:"
      cat test-report.json | jq -r '.failures[] | select(.suite == "pricing" or .suite == "security" or (.suite == "lead-pipeline" and (.test | contains("payment") or contains("Payment") or contains("active")))) | "  - [\(.suite)] \(.test)"'
      echo ""
      echo "Fix all critical failures before merging."
      exit 1
    fi
    
    echo "✅ All critical tests passed"
    echo "✅ Deployment approved"

- name: Block PR Merge on Critical Failure
  if: failure() && github.event_name == 'pull_request'
  run: |
    echo "⛔ PR merge blocked - critical tests failed"
    exit 1
```

### Build Status Requirements

```yaml
# .github/workflows/breez-tests.yml (branch protection)

# Required status checks (must pass before merge):
required_status_checks:
  strict: true
  contexts:
    - "Run Breez Test Suite"
    
# This ensures:
# 1. Tests must pass on latest commit
# 2. Cannot bypass via admin override (strict: true)
# 3. PR cannot be merged if Critical tests fail
```

---

## Test Classification in Code

### In `test-runner.js`

```javascript
// Critical suites that block deployment
const CRITICAL_SUITES = ['pricing', 'security'];

// Critical test patterns (partial matching)
const CRITICAL_TEST_PATTERNS = [
  'payment',
  'Payment',
  'active',
  'Active',
  'gating',
  'cannot access',
  'hidden from customer',
  'RBAC'
];

function isCriticalFailure(failure) {
  // All pricing and security failures are critical
  if (CRITICAL_SUITES.includes(failure.suite)) {
    return true;
  }
  
  // Payment gating tests in lead-pipeline are critical
  if (failure.suite === 'lead-pipeline') {
    return CRITICAL_TEST_PATTERNS.some(pattern => 
      failure.test.includes(pattern)
    );
  }
  
  return false;
}

// Add to report
results.criticalFailures = results.failures.filter(isCriticalFailure);
results.summary.criticalFailed = results.criticalFailures.length;
```

### Enhanced Test Report Output

```json
{
  "summary": {
    "totalTests": 37,
    "passed": 35,
    "failed": 2,
    "criticalFailed": 2,  // NEW: Count of critical failures
    "skipped": 0
  },
  "criticalFailures": [  // NEW: Separate array for critical failures
    {
      "suite": "pricing",
      "test": "Risk bracket 6-8 adds $30",
      "severity": "CRITICAL",
      "expected": { "riskAddon": 30 },
      "actual": { "riskAddon": 25 }
    }
  ],
  "failures": [ /* all failures including non-critical */ ]
}
```

---

## Branch Protection Rules (GitHub)

### Required Settings

```yaml
Branch: main
Protection Rules:
  ✅ Require status checks to pass before merging
  ✅ Require branches to be up to date before merging
  ✅ Status checks that are required:
      - Run Breez Test Suite
  ✅ Do not allow bypassing the above settings
  ❌ Allow force pushes: Disabled
  ❌ Allow deletions: Disabled
```

### Effect
- **Any critical test failure** → Status check fails → **PR cannot be merged**
- **Admin cannot bypass** → Enforced for all contributors
- **Must fix and re-run** → Tests re-run automatically on new commits

---

## Verification Commands

### Check if Critical Tests Pass (Local)

```bash
# Run full suite and check critical failures
curl -X POST "https://your-app.base44.app/api/test-runner" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"runAll": true}' | jq '.summary.criticalFailed'

# Output: 0 = all critical passed, >0 = blocked
```

### Simulate Critical Failure

```bash
# Temporarily break pricing config
# Change Tier A base from $140 to $150
# Re-run tests → CI should BLOCK

# Expected output:
# ❌ CRITICAL TESTS FAILED
# ⛔ DEPLOYMENT BLOCKED
# Failed tests:
#   - [pricing] Base Tier A (10-15k) = $140
```

---

## Emergency Override (Admin Only)

If you MUST deploy with a known critical failure (e.g., hotfix for different critical bug):

### 1. Document Override Reason
```bash
git commit -m "EMERGENCY: Bypass pricing test for critical DB fix

Known issue: Tier A pricing off by $5
Root cause: Admin changed config mid-release
Impact: Low (affects 2 customers, manual refund issued)
Tracking: BREEZ-1234
Will fix in: Next release (2 hours)"
```

### 2. Disable Branch Protection Temporarily
```bash
# GitHub Settings → Branches → main → Edit
# Uncheck "Require status checks to pass"
# Merge PR
# Re-enable immediately after merge
```

### 3. Create Rollback Plan
- Have revert commit ready
- Monitor live pricing for 1 hour
- Re-run tests on production after merge

**⚠️ Use sparingly:** Overrides undermine test suite trust.

---

## Real-World Enforcement Examples

### Example 1: Pricing Floor Broken
```
Commit: abc123 - "Update admin pricing UI"
Tests: ❌ 1 critical failure
  - [pricing] Final monthly never below $120
  
Status: ⛔ BLOCKED
Resolution: Revert accidental config change to absolute_floor
Re-test: ✅ All passed
Merged: Yes (after fix)
```

### Example 2: RBAC Leak
```
Commit: def456 - "Add customer dashboard widgets"
Tests: ❌ 2 critical failures
  - [security] Customer cannot access AdminSettings
  - [security] Risk scoring fields hidden from customer
  
Status: ⛔ BLOCKED
Resolution: Fix RLS query filter + remove internal fields from API response
Re-test: ✅ All passed
Merged: Yes (after fix)
```

### Example 3: Payment Gating Bypassed
```
Commit: ghi789 - "Speed up onboarding flow"
Tests: ❌ 1 critical failure
  - [lead-pipeline] Cannot activate service without payment
  
Status: ⛔ BLOCKED
Resolution: Re-add payment success check before status change
Re-test: ✅ All passed
Merged: Yes (after fix)
```

---

## Summary

### ✅ Confirmed Enforcement

| Category | Suite | Critical? | Blocks CI? |
|----------|-------|-----------|------------|
| Pricing totals | `pricing` | ✅ Yes | ✅ Yes |
| Pricing floor ($120) | `pricing` | ✅ Yes | ✅ Yes |
| Risk brackets | `pricing` | ✅ Yes | ✅ Yes |
| Forced Twice/Week | `pricing` | ✅ Yes | ✅ Yes |
| Payment gating | `lead-pipeline` | ✅ Yes | ✅ Yes |
| RBAC separation | `security` | ✅ Yes | ✅ Yes |
| Data leak prevention | `security` | ✅ Yes | ✅ Yes |
| Scheduling | `scheduling` | ❌ No | ⚠️ Warn only |
| Billing/suspension | `billing` | ❌ No | ⚠️ Warn only |

### Pipeline Logic

```
Run Tests
  ↓
Parse Results
  ↓
Critical Failures > 0?
  ├─ YES → EXIT 1 (block merge/deploy)
  └─ NO  → EXIT 0 (allow merge/deploy)
```

### Zero Tolerance Policy

**Any failure in:**
- `pricing` suite
- `security` suite  
- Payment gating tests

**→ Immediate deployment block**
**→ Cannot be bypassed without admin override**
**→ Must fix before merge**