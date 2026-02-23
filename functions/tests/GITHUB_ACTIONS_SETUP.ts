# GitHub Actions CI/CD Setup Guide

## Overview

The Breez test suite integrates with GitHub Actions to automatically run tests on every push and pull request. Test reports are uploaded as **workflow artifacts** (not committed to the repo).

---

## 1. Workflow File Location

**File:** `.github/workflows/ci-test.yml`

This is the **only** file that should exist in `.github/workflows/`. Test reports are uploaded as artifacts, **NOT** saved to `.github/workflows/test-reports/`.

---

## 2. Artifact Upload Configuration

### YAML Step (lines 56-63 in ci-test.yml):

```yaml
- name: Upload Test Reports as Artifacts
  if: always()
  uses: actions/upload-artifact@v4
  with:
    name: test-reports
    path: |
      test-report.json
      test-report.html
    retention-days: 30
```

### Key Details:

- **Artifact Name:** `test-reports`
- **Files Included:**
  - `test-report.json` (structured data for parsing)
  - `test-report.html` (formatted report for viewing)
- **Retention:** 30 days
- **Location:** Stored by GitHub Actions in cloud storage, **not** in the repository

---

## 3. Expected Artifact Structure

When you download the `test-reports` artifact from a GitHub Actions run, you get a ZIP file containing:

```
test-reports.zip
├── test-report.json
└── test-report.html
```

### test-report.json Structure:
```json
{
  "summary": {
    "timestamp": "2026-02-23T15:30:00Z",
    "totalTests": 89,
    "passed": 87,
    "failed": 2,
    "criticalFailed": 1,
    "duration": 4250
  },
  "suites": {
    "pricing": { "total": 42, "passed": 41, "failed": 1 },
    "security": { "total": 6, "passed": 6, "failed": 0 },
    "lead-pipeline": { "total": 11, "passed": 11, "failed": 0 }
  },
  "coverage": {
    "pricing": 98,
    "security": 100,
    "overall": 97
  },
  "failures": [...],
  "criticalFailures": [...],
  "snapshotMismatches": [...]
}
```

### test-report.html Structure:
- Styled HTML page with summary, coverage metrics, suite breakdowns, and failure details
- Can be opened directly in a browser for visual review

---

## 4. Accessing Artifacts in GitHub UI

### From Pull Request:
1. Navigate to the PR page
2. Scroll to "Checks" section at the bottom
3. Click on the "CI - Test Suite" workflow run
4. Scroll to the "Artifacts" section at the bottom of the run page
5. Click "test-reports" to download the ZIP file

### From Actions Tab:
1. Go to repository → Actions tab
2. Click on the workflow run you want to review
3. Scroll to "Artifacts" section
4. Download "test-reports"

### Example URL Structure:
```
https://github.com/your-org/breez-pool-care/actions/runs/12345678
```

Under "Artifacts" section:
- **test-reports** (2 files, ~50 KB)

---

## 5. Required Secrets

Add these to **Repository Settings → Secrets and variables → Actions**:

| Secret Name | Description | Example |
|-------------|-------------|---------|
| `BASE44_APP_URL` | Your published app URL | `https://breez-app.base44.app` |
| `BASE44_ADMIN_TOKEN` | Admin user auth token | `Bearer eyJhbG...` |

### How to Get Admin Token:
1. Log into your app as an admin user
2. Open browser DevTools → Application → Local Storage
3. Copy the auth token value
4. Add to GitHub secrets as `BASE44_ADMIN_TOKEN`

---

## 6. Workflow Triggers

```yaml
on:
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main ]
```

- **Push to `main` or `develop`:** Runs tests and blocks if critical failures
- **Pull Request to `main`:** Runs tests and posts results as PR comment

---

## 7. Critical Test Enforcement

### Step: Set Status Check (lines 106-116):

```yaml
- name: Set Status Check
  if: always()
  run: |
    if [ "${{ steps.run_tests.outputs.test_critical_failed }}" -gt 0 ]; then
      echo "❌ Critical tests failed - blocking merge"
      exit 1
    elif [ "${{ steps.run_tests.outputs.test_failed }}" -gt 0 ]; then
      echo "⚠️  Non-critical tests failed - review required"
      exit 0
    else
      echo "✅ All tests passed"
      exit 0
    fi
```

**Result:**
- `criticalFailed > 0` → Exit 1 (blocks merge via branch protection)
- `failed > 0` (non-critical) → Exit 0 (allows merge with review)
- All passed → Exit 0 (green checkmark)

---

## 8. Branch Protection Rules

To enforce test passing before merge, configure in **Repository Settings → Branches → Branch protection rules**:

**For `main` branch:**
- ✅ Require status checks to pass before merging
- ✅ Require branches to be up to date before merging
- Select: `Run Breez Test Suite` (the job name from the workflow)

**Result:** PRs cannot be merged if critical tests fail.

---

## 9. PR Comment Example

The workflow automatically posts a comment on PRs with test results:

```markdown
## ✅ Test Results

| Metric | Value |
|--------|-------|
| Total Tests | 89 |
| Passed | ✅ 87 |
| Failed | ❌ 2 |
| Critical Failures | ✅ 0 |
| Coverage | 97% |
| Duration | 4.25s |

📥 Download detailed reports from the [Actions artifacts](https://github.com/your-org/breez-pool-care/pull/42/checks).
```

---

## 10. Incorrect Configuration (DO NOT DO THIS)

### ❌ WRONG: Committing reports to repo

```yaml
# DON'T DO THIS
- name: Save Reports
  run: |
    mkdir -p .github/workflows/test-reports
    cp test-report.json .github/workflows/test-reports/
    cp test-report.html .github/workflows/test-reports/

- name: Commit Reports
  run: |
    git config user.name "GitHub Actions"
    git config user.email "actions@github.com"
    git add .github/workflows/test-reports/
    git commit -m "Add test reports"
    git push
```

**Why this is wrong:**
- `.github/workflows/` should only contain YAML workflow files
- Committing reports creates merge conflicts
- Reports bloat the repository history
- Violates separation of concerns (code vs. artifacts)

### ✅ CORRECT: Upload as artifacts

```yaml
- name: Upload Test Reports as Artifacts
  if: always()
  uses: actions/upload-artifact@v4
  with:
    name: test-reports
    path: |
      test-report.json
      test-report.html
    retention-days: 30
```

**Why this is correct:**
- Artifacts are stored by GitHub in cloud storage
- No repository pollution
- Automatic cleanup after retention period
- Accessible via GitHub UI

---

## 11. Verification Checklist

✅ **Workflow file exists:** `.github/workflows/ci-test.yml`  
✅ **Artifacts uploaded:** `actions/upload-artifact@v4` step present  
✅ **No reports in repo:** `.github/workflows/test-reports/` does NOT exist  
✅ **Secrets configured:** `BASE44_APP_URL` and `BASE44_ADMIN_TOKEN` set  
✅ **Branch protection enabled:** Status check required on `main` branch  
✅ **PR comments working:** Test results posted automatically  
✅ **Artifacts downloadable:** ZIP file appears in Actions run UI  

---

## 12. Example Actions Run UI

When you click on a workflow run, you should see:

```
┌─────────────────────────────────────────┐
│ CI - Test Suite                         │
│ Run #42 - main branch                   │
│ ✅ Completed in 15s                     │
├─────────────────────────────────────────┤
│ Jobs                                    │
│   ✅ Run Breez Test Suite (15s)        │
├─────────────────────────────────────────┤
│ Artifacts (1)                           │
│   📦 test-reports (2 files, 48 KB)     │
│      - test-report.json                 │
│      - test-report.html                 │
│      [Download]                         │
└─────────────────────────────────────────┘
```

Click **[Download]** to get `test-reports.zip` containing both JSON and HTML reports.

---

## 13. Local Testing (Before Pushing)

You can test the workflow locally using [act](https://github.com/nektos/act):

```bash
# Install act
brew install act  # macOS
# or
curl -s https://raw.githubusercontent.com/nektos/act/master/install.sh | sudo bash

# Run workflow locally
act push -s BASE44_APP_URL="https://your-app.base44.app" \
         -s BASE44_ADMIN_TOKEN="your-token"
```

---

## Summary

✅ **Artifacts are uploaded via `actions/upload-artifact@v4`**  
✅ **Reports are NOT committed to `.github/workflows/test-reports/`**  
✅ **Artifact name: `test-reports`**  
✅ **Contents: `test-report.json` + `test-report.html`**  
✅ **Downloadable from Actions run UI**  
✅ **Critical failures block PRs via exit code 1**  
✅ **30-day retention for debugging**