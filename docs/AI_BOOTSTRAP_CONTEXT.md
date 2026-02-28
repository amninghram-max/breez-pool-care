# Breez Pool Care – AI Bootstrap Context
# Authoritative architecture constraints for pricing + release system

SYSTEM_NAME: Breez Pool Care Platform

------------------------------------------------------------------
CORE INVARIANTS (DO NOT MODIFY WITHOUT EXPLICIT APPROVAL)
------------------------------------------------------------------

1. Production pricing MUST NOT run on hardcoded defaults.
2. AdminSettings is the single source of truth for pricing config.
3. Config must be loaded using:
   AdminSettings.list('-created_date', 1)
4. If no AdminSettings record exists:
   - calculateQuote returns 503
   - checkReleaseReadiness returns releaseReady=false
5. No silent fallback in production.
6. Release readiness must be fully inline (no backend function calling other backend functions).
7. Pricing engine must remain deterministic.
8. Historical quotes must remain immutable and auditable.

------------------------------------------------------------------
PRICING ENGINE MODEL
------------------------------------------------------------------

MonthlyPrice =
    BaseTier
  + AdditiveTokens
  + RiskAddon
  × FrequencyMultiplier

------------------------------------------------------------------
SIZE TIERS (Base Monthly)
------------------------------------------------------------------

Tier A (10–15k): 140
Tier B: 160
Tier C: 190
Tier D: 230

------------------------------------------------------------------
ADDITIVE TOKENS
------------------------------------------------------------------

Unscreened:
  Tier A: +20
  Tier B: +25
  Tier C: +30
  Tier D: +40

Trees (only if unscreened): +10

Usage:
  Rarely: 0
  Weekends / Several per week: +10
  Daily: +20

Chlorination:
  Inline / Salt: 0
  Floater / Skimmer: +5 per tier step
  Liquid only: +10

Pets:
  Occasional: +5
  Frequent: +10

------------------------------------------------------------------
RISK ENGINE
------------------------------------------------------------------

rawRisk × size multiplier:

Tier B: 1.1
Tier C: 1.2
Tier D: 1.3

Risk Brackets:

0–2     → 0
3–5     → 15
6–8     → 30
9–11    → 45
12+     → 60

If adjustedRisk >= 9:
  frequency = twice_weekly
  multiplier = 1.8

Twice weekly overrides weekly.

------------------------------------------------------------------
GREEN-TO-CLEAN MATRIX
------------------------------------------------------------------

Light:
  Small: 60
  Medium: 100
  Large: 150

Moderate:
  Small: 100
  Medium: 150
  Large: 200

Black:
  Small: 250
  Medium: 350
  Large: 450

Slightly Cloudy: 25

------------------------------------------------------------------
VERSIONING
------------------------------------------------------------------

PRICING_ENGINE_VERSION = "v2_tokens_risk_frequency"

Every checkReleaseReadiness response must include:
  pricingEngineVersion
  configRecordId
  configUpdatedAt
  timestamp

Every Quote record must store:
  pricingEngineVersion
  configRecordId

Customer must NOT see internal version or config fields.

------------------------------------------------------------------
RELEASE READINESS REQUIREMENTS
------------------------------------------------------------------

Must verify:

- AdminSettings present
- Risk bracket count = 5
- Multipliers exist
- Token definitions valid
- Pricing floor enforced (>= 120)
- Risk escalation functioning
- Entity layer reachable

Return structure must include:
  releaseReady
  usingDefaults
  blockers[]
  warnings[]
  pricingEngineVersion
  configRecordId
  configUpdatedAt

------------------------------------------------------------------
ARCHITECTURAL CONSTRAINTS
------------------------------------------------------------------

- No backend function invoking other backend functions.
- No divergent config loaders.
- No RLS rules blocking AdminSettings reads.
- No nondeterministic pricing logic.
- Quotes must be stateless and regenerable.
- Quotes should expire (recommended 14 days).

------------------------------------------------------------------
FUTURE EXPANSION (MUST NOT BREAK ABOVE RULES)
------------------------------------------------------------------

Planned systems:
- Weather-based adjustments
- Chemical dosing intelligence
- Pump runtime optimization
- Pool performance learning

Future systems must:
- Not modify historical quotes
- Not bypass versioning
- Not bypass AdminSettings config loading
- Not bypass release gating

CHEMISTRY ENGINE MODULE (Phase 1)

Authoritative architecture constraints for chemical dosing, risk scoring, revisit logic, and advisory frequency escalation.

CHEMISTRY_CORE_INVARIANTS (DO NOT MODIFY WITHOUT EXPLICIT APPROVAL)

Chemistry engine must remain deterministic.
ChemTestRecord, DosePlan, RetestRecord, ChemistryRiskEvent, CustomerNotificationLog are immutable.
AdminSettings is the single source of truth for chemistry policy.
AdminSettings must be loaded using: AdminSettings.list('-created_date', 1)
No production defaults.
If required chemistry configuration is missing:
DosePlan.readiness = "blocked"
blockedReasons[] must explicitly state missing fields.

Seasonality must NOT modify chemistry targets.
Seasonality affects frequency recommendation threshold only.

FrequencyRecommendation is advisory-only.
No automatic billing changes.
No automatic frequency mutation.
Only new Quote version may change billing.

All risk scoring must be event-based.
Risk score = sum(severityPoints of active ChemistryRiskEvent)
Active event = expiresAt > now
No decay model. No mutation. Expiration only.

DOSE PLAN MODEL

DosePlan must include:
calculatorVersion
adminSettingsId
adminSettingsSnapshot (subset used for calculation)
planHash (SHA-256 of testRecordId + adminSettingsId + ordered actions including productProfileVersion and safety flags)
readiness ("ready" | "blocked" | "partial")
blockedReasons[]
warnings[]
ordered actions[]

DosePlan must be fully regenerable from:
ChemTestRecord
AdminSettings snapshot
ProductProfile potency snapshot

If identical inputs are provided, identical planHash must be produced.

CHEMISTRY PRIORITY RULES

Order of operations:

Sanitation (Breakpoint if CC >= threshold)

Total Alkalinity correction

pH correction (acid demand required; no estimation)

CH / CYA / Salt adjustments

Acid dosing requires Taylor Acid Demand input.
No linear acid estimation allowed.

Breakpoint Logic:
If CC >= breakpoint threshold:
FC_target = breakpointMultiplier × CC_current
Breakpoint overrides normal FC target.

LSI POLICY

AdjustedAlkalinity = TA − (CYA × 0.33)
LSI must be calculated using:
pH + log10(CH) + log10(AdjustedAlkalinity) + TempFactor − 12.3

Policy bounds:
min = -0.3
max = +0.3
softTarget ≈ -0.1

Salt events apply only when chlorinationMethod = saltwater.

RISK ENGINE – CHEMISTRY EVENTS

Severity points are fixed per event type.
No arbitrary weighting.
Multiple events may trigger per test.
Events expire at createdDate + 30 days (configurable).
Events are immutable.

FrequencyRecommendation is triggered only when:
consecutiveVisitsAboveThreshold >= minVisitsRequired (default 3)
AND current 30-day score >= effectiveThreshold

effectiveThreshold = baseThreshold + seasonalOffset

Auto-dismiss rule:
If consecutiveVisitsAboveThreshold < minVisitsRequired
AND currentScore < effectiveThreshold
→ status = dismissed

REVISIT LOGIC

Wait/retest logic must follow AdminSettings timing policies.
If waitTime >= long_wait_min_hours:
schedule next-day verification (no same-day revisit).

Revisit scheduling must:
not violate route optimization constraints
not create time paradox overlaps
not auto-notify customer without admin action

CUSTOMER COMMUNICATION

ContactCustomerAction is manual-only.
Must log immutable CustomerNotificationLog record.
Must include reversible language:
"Service frequency adjustments may be temporary and can revert when chemical demand reduces."

ARCHITECTURAL CONSTRAINTS

No backend function invoking other backend functions.
No mutation of immutable entities.
No silent config fallbacks.
No billing mutation from chemistry module.
No nondeterministic hash generation.
No editing of past DosePlans.

FUTURE EXPANSION (MUST NOT BREAK ABOVE RULES)

Predictive chemistry learning
Weather integration
Demand forecasting
Automated chemical cost optimization
Dynamic visit optimization

Future systems must:
Not modify historical DosePlans
Not modify historical RiskEvents
Not bypass AdminSettings
Not alter pricing engine determinism
Not auto-mutate billing

CHEMISTRY RELEASE READINESS REQUIREMENTS (INLINE ONLY)
Must verify:

AdminSettings present (loaded via AdminSettings.list('-created_date', 1))

Chemistry policy fields present:

FC ratios + CC breakpoint fields + multiplier

Target ranges: pH/TA/CH/CYA

LSI bounds + TF table

Retest timetable + revisit policy fields

At least 1 active ProductProfile exists for each required chemical type:

LIQUID_CHLORINE, MURIATIC_ACID, ALKALINITY_UP, CALCIUM_INCREASER, STABILIZER_CYA, SALT

All immutable entities have update/delete disabled via RLS

Seasonality affects threshold only (no target mutation)

FrequencyRecommendation cannot mutate billing/quotes

ContactCustomerAction requires admin/staff and writes immutable CustomerNotificationLog

Every chemistry readiness response must include:
releaseReady usingDefaults blockers[] warnings[] calculatorVersion configRecordId configUpdatedAt timestamp

That one block prevents half of all “oops we shipped it broken” situations.

2) Create a “Golden Test Suite” list (no code, just cases)

This becomes the acceptance checklist you and Base44 can use. Add this as a short section in the same doc:

CHEMISTRY GOLDEN TESTS (DETERMINISM + EDGE CASES)
For each test case, same inputs must yield identical DosePlan.actions[] + identical planHash.

Minimum cases:

Balanced pool → no actions

Low FC → LC dose only

High CC → breakpoint workflow + retest required

TA low + pH high → TA action first; acid only after TA and only with acid demand input

Acid demand missing while pH high → acid blocked with reason

Low CH + LSI < -0.3 → calcium recommendation

High CYA > max → risk event emitted; advisory recommendation only

Salt pool low salt → salt action + salt risk event (salt pools only)

Seasonal offset month → effectiveThreshold higher; recommendation not prematurely triggered

3 consecutive above-threshold visits → FrequencyRecommendation pending_review created

Keep it short. These are your “unit tests on paper.”
