# Production Release Lock Checklist

## Overview

This document defines the **mandatory** release readiness criteria for production deployments. Any failure in these checks **BLOCKS** the release until resolved.

---

## Release Readiness Conditions

### 🔴 CRITICAL - Deployment Blockers

These conditions **MUST** pass before any production deploy:

#### 1. ✅ Critical Tests Passing
- **Check:** `criticalFailed === 0`
- **Suites:** `pricing`, `pricing-snapshots`, `security`
- **Why Critical:** Revenue drift, security vulnerabilities
- **Command:** `POST /test-runner { "runAll": true }`

#### 2. ✅ No Pricing Snapshot Diffs
- **Check:** `snapshotMismatches.length === 0`
- **Source:** `pricing-snapshots.test.js`
- **Why Critical:** Any change to pricing fixtures indicates potential revenue drift
- **Action if Failed:** Review snapshot deltas, verify intentional changes, get admin approval before updating baselines

#### 3. ✅ No RBAC Test Failures
- **Check:** `suites.security.failed === 0`
- **Source:** `security-rbac.test.js`
- **Why Critical:** Security vulnerabilities, unauthorized access
- **Action if Failed:** Fix access control logic before deploying

#### 4. ✅ No Payment Gating Test Failures
- **Check:** No failures in `lead-pipeline` suite with "payment" or "gating" in test name
- **Source:** `lead-pipeline.test.js`
- **Why Critical:** Customers could access services without payment
- **Action if Failed:** Fix payment activation logic

#### 5. ✅ Config Integrity Validation Passes
- **Check:** `validatePricingConfig()` returns `valid: true`
- **Source:** `validatePricingConfig.js`
- **Why Critical:** Pricing engine could run with invalid config, causing margin loss
- **Action if Failed:** Re-seed AdminSettings or fix config corruption

#### 6. ✅ Test Report Artifact Generated
- **Check:** Test runner completes successfully
- **Source:** `test-runner.js`
- **Why Critical:** Audit trail for deployment decisions
- **Action if Failed:** Fix test runner infrastructure

---

## Release Readiness Workflow

### 1. Automated Check (CI Pipeline)

```bash
# CI runs release readiness check
curl -X POST "$BASE44_APP_URL/checkReleaseReadiness" \
  -H "Authorization: Bearer $BASE44_ADMIN_TOKEN" \
  -H "Content-Type: application/json"

# Response:
{
  "releaseReady": true,  // or false
  "blockers": [],        // List of blocking issues
  "warnings": [],        // Non-blocking concerns
  "checks": { ... }
}
```

### 2. GitHub Actions Integration

```yaml
- name: Check Release Readiness
  id: release_check
  run: |
    response=$(curl -s -X POST "$BASE44_APP_URL/checkReleaseReadiness" \
      -H "Authorization: Bearer $BASE44_ADMIN_TOKEN" \
      -H "Content-Type: application/json")
    
    ready=$(echo "$response" | jq -r '.releaseReady')
    blockers=$(echo "$response" | jq -r '.blockers | length')
    
    if [ "$ready" != "true" ]; then
      echo "🚨 RELEASE BLOCKED"
      echo "$response" | jq -r '.blockers[]'
      exit 1
    fi
    
    echo "✅ RELEASE READY"
```

### 3. Manual Pre-Deploy Check

Admin dashboard includes release readiness check:

1. Navigate to **Admin Home** or **Test Dashboard**
2. Click **"Check Release Readiness"**
3. Review results
4. Only proceed with deploy if `releaseReady: true`

---

## Blocker Resolution Guide

### Blocker: Critical Test Failures

**Symptoms:**
- `criticalFailed > 0`
- Failures in `pricing`, `pricing-snapshots`, or `security` suites

**Resolution:**
1. Review test failure details in test report
2. Fix code causing test failures
3. Re-run tests: `POST /test-runner`
4. Verify `criticalFailed === 0`

---

### Blocker: Pricing Snapshot Mismatches

**Symptoms:**
- `snapshotMismatches.length > 0`
- Pricing engine output differs from golden fixtures

**Resolution:**

**Option A: Unintentional Change (Bug)**
1. Review snapshot delta in test report
2. Identify root cause (e.g., config typo, logic error)
3. Fix code
4. Re-run tests
5. Verify snapshots match

**Option B: Intentional Change (Pricing Update)**
1. Get admin approval for pricing changes
2. Document reason for fixture update
3. Update `pricing-fixtures.js` with new expected values
4. Commit updated fixtures
5. Re-run tests to confirm

**Example Delta:**
```
Fixture: tier-a-moderate-load
Field: finalMonthlyPrice
Expected: 205
Actual: 210
Delta: +5 (+2.4%)
```

**CRITICAL:** Any snapshot mismatch = potential revenue drift. Always verify intentionality.

---

### Blocker: RBAC Test Failures

**Symptoms:**
- `suites.security.failed > 0`
- Unauthorized access detected

**Resolution:**
1. Review RBAC failure details
2. Check role definitions in `components/auth/roleCapabilities.js`
3. Verify RLS policies on entities
4. Fix access control logic
5. Re-run security tests

---

### Blocker: Payment Gating Failures

**Symptoms:**
- Failures in `lead-pipeline` with "payment" or "gating" in test name
- Service activated without payment

**Resolution:**
1. Review payment activation logic in `Agreements.js`, `PaymentSetup.js`
2. Verify `activationPaymentStatus === 'paid'` check
3. Check Stripe webhook handling
4. Fix payment gating logic
5. Re-run lead-pipeline tests

---

### Blocker: Config Integrity Failure

**Symptoms:**
- `validatePricingConfig()` returns `valid: false`
- Missing or corrupted `escalation_brackets`

**Resolution:**
1. Check AdminSettings entity for `settingKey: 'default'`
2. Verify `escalation_brackets` has 5 entries
3. If missing: `POST /seedAdminSettingsDefault`
4. Re-run validation: `POST /validatePricingConfig`

---

## CI/CD Pipeline Configuration

### Required Secrets

```
BASE44_APP_URL=https://your-app.base44.app
BASE44_ADMIN_TOKEN=Bearer_eyJhbG...
```

### GitHub Actions Workflow

**.github/workflows/production-deploy.yml:**

```yaml
name: Production Deploy

on:
  push:
    branches: [ main ]

jobs:
  release-gate:
    name: Release Readiness Gate
    runs-on: ubuntu-latest
    
    steps:
      - name: Check Release Readiness
        id: release_check
        run: |
          response=$(curl -s -X POST "${{ secrets.BASE44_APP_URL }}/checkReleaseReadiness" \
            -H "Authorization: ${{ secrets.BASE44_ADMIN_TOKEN }}" \
            -H "Content-Type: application/json")
          
          echo "$response" > release-check.json
          
          ready=$(echo "$response" | jq -r '.releaseReady')
          
          if [ "$ready" != "true" ]; then
            echo "::error::Release blocked - Critical issues detected"
            echo "$response" | jq -r '.blockers[]' | while read line; do
              echo "::error::$line"
            done
            exit 1
          fi
          
          echo "::notice::Release readiness check passed"
      
      - name: Upload Release Check Report
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: release-check-report
          path: release-check.json
      
      # Only runs if release check passes
      - name: Deploy to Production
        run: |
          echo "Deploying to production..."
          # Your deploy steps here
```

---

## Release Approval Process

### Automated (CI)
- PR merged to `main` → Triggers release readiness check
- If `releaseReady: true` → Deploy proceeds
- If `releaseReady: false` → Deploy blocked, PR author notified

### Manual (Admin Dashboard)
1. Admin runs release check manually
2. Reviews detailed report
3. If blocked: Resolves issues
4. If clear: Approves deploy

---

## Monitoring & Alerts

### Post-Deploy Validation

After successful deploy, verify:

1. **Pricing Engine:**
   - Run sample quotes
   - Verify output matches pre-deploy

2. **Payment Flow:**
   - Test payment activation
   - Verify gating works

3. **Access Control:**
   - Test role-based access
   - Verify RBAC enforcement

4. **Config Integrity:**
   - Check AdminSettings in production
   - Verify escalation brackets exist

### Rollback Triggers

Immediate rollback if:
- Critical test failures post-deploy
- Pricing discrepancies reported
- Payment gating bypass detected
- Security vulnerability exposed

---

## Version History

| Date       | Change                                | Author |
|------------|---------------------------------------|--------|
| 2026-02-23 | Initial release checklist created     | Admin  |

---

## Summary

**Release Readiness = ALL conditions GREEN**

```
✅ Critical tests: 0 failed
✅ Pricing snapshots: 0 mismatches
✅ RBAC tests: 0 failed
✅ Payment gating: 0 failed
✅ Config integrity: Valid
✅ Test report: Generated

→ DEPLOY ALLOWED
```

**Any RED = DEPLOY BLOCKED**

```
❌ Critical tests: 2 failed
❌ Pricing snapshots: 3 mismatches
✅ RBAC tests: 0 failed
✅ Payment gating: 0 failed
✅ Config integrity: Valid
✅ Test report: Generated

→ DEPLOY BLOCKED
→ FIX CRITICAL ISSUES BEFORE RETRY
``