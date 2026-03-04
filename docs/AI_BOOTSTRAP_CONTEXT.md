# Breez Pool Care – AI Bootstrap Context

This file mirrors pages/_ARCHITECTURE_CONTEXT.jsx.
Source of truth lives inside the app.
If mismatch occurs, the JSX file is authoritative.

---
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

MonthlyPrice = (BaseTier + AdditiveTokens + RiskAddon) × FrequencyMultiplier
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
  Weekends (1–2x/week) or Several per week (3–4x/week): +10
  Daily: +20

Chlorination:
  Inline / Salt: 0
  Floater / Skimmer: +5 × TierIndex (A=0, B=1, C=2, D=3)
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
  configHash
  timestamp

Rule:
- usingDefaults must be false in production. If defaults would be used, set releaseReady=false and add blocker DEFAULTS_NOT_ALLOWED.

------------------------------------------------------------------
ARCHITECTURAL CONSTRAINTS
------------------------------------------------------------------
- No backend function invoking other backend functions.
- No divergent config loaders.
- No RLS rules blocking AdminSettings reads.
- No nondeterministic pricing logic.
- Quotes must be stateless and regenerable.
- Quotes should expire (recommended 14 days).

  INSPECTION SCHEDULING + CALENDAR + PIPELINE (2026-03 Stabilization)

This section governs lead stage progression, inspection scheduling, calendar events, rescheduling, and deletion behavior. It MUST NOT modify pricing engine math or chemistry invariants.

CORE SCHEDULING INVARIANTS

Public scheduling is token-based. No login required until post-inspection.

All backend responses are HTTP 200 with application/json; charset=utf-8.

Backend functions are versioned. Use V2 for scheduling/reschedule/delete flows.

Side effects are idempotent (emails, stage updates, event creation, request creation).

Lead deletion is soft delete (Lead.isDeleted + deletedAt/by/reason). No hard delete in normal ops.

Admin schedule views must exclude cancelled events and exclude deleted leads by default.

SOURCE OF TRUTH (NO SPLIT-BRAIN)

InspectionRecord is the authoritative source for inspection appointment time.

CalendarEvent is a projection of InspectionRecord, not authoritative.

Lead mirror fields (requested/confirmed inspection date/time + inspectionEventId) must be synced from InspectionRecord when scheduling or rescheduling.

After any schedule change, these three MUST match:

InspectionRecord appointment fields

CalendarEvent appointment fields

Lead mirror appointment fields

If these drift, it is a defect: SPLIT_BRAIN_APPOINTMENT_TIME.

SINGLE ACTIVE INSPECTION EVENT GUARANTEE

A Lead must not have more than one active inspection CalendarEvent at a time.

Enforcement is at the application layer (Base44 may not support DB unique constraints).

Scheduling and reschedule approval must:

Query active inspection events for the lead

Cancel duplicates (status="cancelled", cancelReason="duplicate_inspection_event")

Update existing event rather than creating new ones

REQUIRED ENTITIES (CURRENT MODEL)

Lead

stage (pipeline stage enum)

inspectionEventId (internal CalendarEvent.id)

soft delete fields: isDeleted, deletedAt, deletedBy, deleteReason

InspectionRecord (authoritative)

leadId

appointment fields: scheduledDate, startTime, timeWindow, appointmentStatus

calendarEventId

cancellation fields: cancelledAt, cancelReason

CalendarEvent (projection)

leadId

eventType (inspection/service/etc.)

status (active/cancelled)

cancellation fields: cancelledAt, cancelReason

RescheduleRequest

leadId, calendarEventId, inspectionId

requestedStart

status (pending/approved/denied/cancelled)

idempotencyKey = resched:${leadId}:${calendarEventId}:${requestedStart}

No external calendar provider IDs are required for Phase 1 (internal CalendarEvent only).

VERSIONED BACKEND FUNCTIONS (REQUIRED)

Scheduling / rescheduling / deletion MUST use V2:

scheduleFirstInspectionPublicV2

Creates/ensures InspectionRecord first (idempotent single-per-lead)

Creates/updates CalendarEvent projection

Syncs Lead mirror fields

Cancels duplicate active inspection events

Updates pipeline stage via public stage updater

requestReschedulePublicV2

Token-based (no login)

Resolves appointment via InspectionRecord first; fallback to Lead.inspectionEventId only if needed

Creates idempotent RescheduleRequest (pending)

approveRescheduleV2 / denyRescheduleV2

Approval updates InspectionRecord (authoritative) → CalendarEvent (projection) → Lead mirrors (no drift)

Must remain idempotent

softDeleteLeadV2

Soft-deletes Lead and cancels all linked InspectionRecords and CalendarEvents with reason lead_deleted

LEAD PIPELINE STAGE INVARIANTS

Lead stage field: Lead.stage

Stage updates must be done via backend functions (service role), not client-side entity writes.

Public milestone mapping (minimum):

Prequal quote persisted → quote_sent

Inspection scheduled → inspection_scheduled

Stage update functions:

updateLeadStagePublicV1 (token → leadId → stage)

updateLeadStageV1 (admin/staff/manual)

Non-regression rule:

Public updates must not move backwards.

Admin may override regressions only with explicit allowRegression=true.

LEAD RLS SAFETY REQUIREMENT

Lead entity update RLS must NOT be wide open.

Admin/staff can update.

Customers can only update their own lead (linkedLeadId/email/created_by).

Backend service role must be able to update stage and operational fields via service-context behavior.

Any attempt to set Lead.rls.update = true is a security defect: LEAD_UPDATE_RLS_TOO_PERMISSIVE.

ADMIN SCHEDULE VIEW FILTERING

Default schedule/calendar views must hide:

CalendarEvent.status="cancelled"

Leads where Lead.isDeleted=true

Optional: an admin-only toggle “Show cancelled” for audit.

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

## Platform Integrity Requirements

AdminSettings persistence is mandatory.

If AdminSettings.create() returns 200 + id but the record is not immediately readable via:
AdminSettings.list('-created_date', 1)

→ Treat as ADMIN_SETTINGS_MISSING
→ Raise PLATFORM_GHOST_WRITE defect
→ Do NOT assume write success

Service-role writes must:
- Persist deterministically
- Be readable immediately via user-scoped read (admin role)
- Return 403 if blocked (never synthetic success)

AdminSettings seeding must:
- Use backend service role
- Verify via user-scoped read
- Display created record id in UI
- Fail loudly if unreadable

Never introduce production defaults to bypass platform failure.

UI + WORKFLOW IMPLEMENTATION

(UI + Workflow Implementation Phase) Must comply with invariants above and must not modify them.

Use docs/AI_BOOTSTRAP_CONTEXT.md as authoritative architecture context.
Do not modify pricing invariants.
Do not introduce production defaults.
Do not bypass AdminSettings loading via AdminSettings.list('-created_date', 1).
No backend function may call another backend function.
All pricing and chemistry determinism rules must remain intact.

This build phase is UI + workflow only.

1️⃣ PUBLIC LANDING PAGE

Header:
Effortless Pool Care. Total Transparency.

Subline:
Everything your pool needs — accessible anytime.

Primary CTA:
Get Free Instant Quote

Secondary CTA:
Schedule Free Inspection

Hero reassurance text:
Free instant quote. No payment info. No commitment. Just your first name and email.

Trust strip:
Licensed & Insured
Digital Service Logs
Transparent Pricing
Private & Secure
Owner Operated

Sections required:

How It Works (3 step flow)

Digital Service Experience

Why Water Balance Matters

Service Area: Melbourne (growing service area)

FAQ

Final CTA

Footer with owner/operator info

No competitor comparison language.

2️⃣ QUOTE FLOW (Extremely Minimal + Frictionless)

One-question-per-screen wizard.

Step 1:
Pool Size:

Under 10k

10–15k

15–20k

20–30k

Over 30k

Not Sure

If Not Sure:
Return a price range.

Step 2:
Screened or Unscreened

Step 3:
Sanitation type (Salt / Traditional / Not Sure)

Step 4:
Usage frequency + trees (conditional) + pets

Step 5:
Condition (Clear / Cloudy / Green / Heavy algae)

Step 6:
Contact (First name + Email only)

Pricing display:
Monthly price OR price range
Asterisk note:

*Final pricing is based on confirmation of pool size, condition, and equipment during inspection to ensure accuracy and consistency.

Immediately display:
Schedule Free Inspection

Auto-send quote email with identical information.

No phone required at quote stage.

Quote expiry is an ops/UI policy only and must not affect pricing determinism or historical quote immutability.

3️⃣ INSPECTION FLOW

Technician submits inspection.

Admin or authorized technician must finalize.

Admin-only fields:

Final Monthly Service Rate

Green-to-Clean (if applicable)

Admin marks:

New Customer
OR

Keep as Open Lead

If New Customer:
Send Final Plan Email with:
Monthly price
Per-visit average
One-time recovery if applicable
Service agreement
Payment activation link

Customer must:
Create account
Submit payment
Then status becomes Active
Then added to schedule

No payment → not scheduled.

Usage input policy: If usage frequency is not collected in the quote wizard, it must be recorded explicitly as "unknown" and the pricing token must be 0 only if "unknown" is a defined option in the pricing-input schema. Production must never silently assume a usage value. If "unknown" is not present, release readiness must block with MISSING_INPUT_USAGE.

4️⃣ CUSTOMER DASHBOARD

Homepage sections:

Section 1:
Pool Status (no color indicators)
Last Service
Next Visit Scheduled

Section 2:
Water Snapshot
No numbers unless expanded
Disclaimer:

Water levels can shift due to weather, usage, rainfall, and equipment runtime. These variations are expected and monitored. Any necessary adjustments are handled as part of routine service.

Section 3:
Service Record
Photos
Notes
Small button:
Download Full Service Report

Section 4:
Equipment Overview (view-only)
Manual access allowed

Section 5:
Communication panel

Section 6:
Safety & Incident Reporting
Report Fecal Incident button
Trigger top banner:
POOL STATUS: UNSAFE TO SWIM — DISINFECTION PENDING
Banner remains until admin clears.
Then show:
POOL STATUS: SAFE TO SWIM

Section 7:
Small link:
Interested in how your pool functions?
→ Education page

No exposure of internal thresholds or PSI baselines.

5️⃣ TECHNICIAN DASHBOARD (Separate from Admin)

Focus:
Route + Visit workflow

Route View:
Start time
Estimated finish time
All services complete by 6 PM
No hard per-visit cut times

Visit Workflow:
Arrival confirmation
Water test entry
Filter PSI entry
If PSI ≥ Normal+10:
Sand → prompt backwash
Cartridge → inspect + photo + clean if needed

Water level entry:
Normal / Slightly low / Low / High

If water added:
Require shutoff plan:

Tech return

Customer shutoff time

Auto shutoff device used

If repeated water additions:
Flag Excessive Water Loss (internal alert)

Pump section:
Single-speed:
Timer schedule structured fields

Variable-speed:
Program blocks (RPM/GPM, schedule)

Heat systems:
Solar (enabled/schedule)
Heat pump/gas/electric (mode, setpoint, schedule)

Change history immutable.

Recurring Messages:
Per-customer
Options:

Next visit only

Every visit

X weeks/months

Technician can create/edit own.
Admin can delete any.

Technician cannot:

Modify pricing

Modify AdminSettings

Finalize inspections unless granted permission

Delete immutable records

6️⃣ ADMIN DASHBOARD

Operational command center.

Sections:

Today Overview

Schedule View

Lead Pipeline

Inspection Finalization Queue

Safety Panel

Payment Status

System Health (AdminSettings loaded status)

Admin can:

Finalize inspections

Activate technician inspection permissions

Clear safety banner

Manage recurring messages

Upload equipment manuals

Override health status

Switch into technician view

7️⃣ CUSTOMER EQUIPMENT PROFILE

Only serviceable equipment types.

Equipment items support:

Label photo

Admin manual upload (PDF)

Manual link (URL)

Quick reference notes

Change history

Pump:
Single-speed or VS
Structured schedule fields

Filter:
Type
Normal PSI
Auto backwash threshold display

Heating:
Solar / Heat Pump / Gas / Electric
Enabled
Schedule or setpoint

Water Level:
Normal range definition
Water addition logging
Excessive water loss monitoring

No customer exposure of internal PSI thresholds.

8️⃣ DATA & ARCHITECTURE RULES

Do not:

Duplicate pricing logic in frontend

Duplicate chemistry logic

Create alternate config loaders

Introduce default pricing fallback

Auto-finalize inspections

Auto-mutate billing

All status transitions must be explicit.

All immutable records must remain immutable.

All alerts must be event-based.

End of UI build phase scope.

UI WORKFLOW ARCHITECTURE – CUSTOMER HUB MODEL (2026-03 Stabilization)

Purpose:
Prevent navigation loops, dead-end overview pages, and performance regressions.
This section governs routing and workflow structure only.
It MUST NOT modify pricing, chemistry, or schema invariants above.

CORE WORKFLOW PRINCIPLE

All provider workflows must be CUSTOMER-SCOPED.
Every operational action must originate from a specific leadId.

No unscoped management pages may serve as primary entry points.

CUSTOMER HUB

CustomerTimeline is the provider workflow hub.

Route:
CustomerTimeline?leadId=<id>

Behavior:
If no leadId → show searchable customer picker (converted leads only).
If leadId present → render customer hub view.

Timeline must not load full historical feeds by default.
Initial load should display:

- Last 4 visits (newest first)
- Expandable visit summaries
- “View older visit” dropdown (lazy-loaded)

Heavy historical aggregation is prohibited on initial render.

EQUIPMENT MANAGEMENT RULE

Equipment management must always be customer-scoped.

Valid route:
EquipmentProfileAdmin?leadId=<id>

Invalid pattern:
EquipmentProfiles (unscoped overview) as primary management entry.

All “Manage Equipment” links must pass leadId.
No circular navigation between overview pages and leads.

PICKER PERFORMANCE RULES

Customer picker must:

- Use compact list rows (no heavy cards)
- Debounce search (150–250ms)
- Render max 30 results
- Disable heavy timeline queries until leadId exists
- Use enabled: !!leadId gating for all visit-related queries

No full-entity aggregation while in picker mode.

QUERY PERFORMANCE CONSTRAINTS

Timeline queries must:

- Execute in parallel
- Be limited (max 25–50 records per entity)
- Use staleTime to prevent refetch on rapid navigation
- Memoize normalization and sorting

No sequential await chains.
No rebuilding normalized arrays on every render.

NAVIGATION INTEGRITY RULES

All navigation buttons must:

- Be real <button type="button"> or <Link>
- Pass explicit leadId
- Not rely on silent redirects
- Not bounce to dashboard unintentionally

Click handlers must never be blocked by overlays or pointer-events.

PROVIDER NAV STRUCTURE (LOCKED GROUPING)

Operations
Customers
Chemistry
Pricing
Team
Support

Do not reintroduce role-based home duplication.
Role-based landing is handled by redirect, not nav links.

NO LOOP GUARANTEE

The following must never happen:

Leads → Equipment → Leads
Timeline → Equipment → Overview → Leads
Picker → dead-end

All flows must terminate in a customer-scoped page.

END WORKFLOW STABILIZATION RULES

## AI Interaction Protocol (Base44 Execution Discipline)

To maintain architectural integrity, cost control, and deterministic behavior, all Base44 interactions must follow a strict two-mode workflow:

### Modes

1. Discussion Mode (Default)
- Used for planning, architecture decisions, audits, debugging analysis, and validation.
- No code changes are allowed.
- Used to:
  - Confirm understanding of constraints.
  - Identify affected files.
  - Validate routing, payload shapes, and prop interfaces.
  - Detect invariant violations before implementation.
- Preferred whenever possible to reduce cost and prevent unintended code mutations.

2. Implementation Mode (Explicit)
- Used only after Discussion Mode confirms the exact required changes.
- Must include:
  - Explicit constraints reminder.
  - Explicit scope control (which files may be edited).
  - Clear deliverables.
- No speculative refactoring.
- No expanding scope beyond what was explicitly approved.

### Switching Rules

- Never enter Implementation Mode without first validating architecture in Discussion Mode (unless change is trivial and isolated).
- If unexpected issues are discovered mid-implementation, halt and return to Discussion Mode.
- Avoid bulk edits across multiple files unless explicitly audited first.
- All route changes must be confirmed against actual existing pages before modifying links.
- Shared utilities must be preferred over duplicated inline logic whenever platform constraints allow.

### Safety Principles

- No production defaults.
- No hidden fallbacks.
- Deterministic behavior only.
- No backend function may call another backend function.
- AdminSettings must always load via AdminSettings.list('-created_date', 1).
- Pricing and chemistry logic must remain versioned and immutable.

### Scope Discipline

When updating multiple files:
1. Update one file.
2. Confirm behavior.
3. Expand to additional files only after confirmation.

This protocol prevents:
- Silent route mismatches
- Env-variable fragility
- Prop/payload mismatch bugs
- Undetected invariant violations
- Scope creep in implementation mode

- ------------------------------------------------------------------
QUOTE → SCHEDULE HARDENING ADDENDUM (2026-03-03)
------------------------------------------------------------------

Purpose:
Lock the public pre-account quote-to-inspection workflow so it remains deterministic, user-safe, and architecture-compliant.

QUOTE FINALIZATION INVARIANTS (PUBLIC)
- finalizePrequalQuoteV2 must support firstName + email-only submissions (no account required).
- If leadId is missing at finalize time, a Lead must be created deterministically and linked.
- QuoteRequests and Quote must both be linked to the same leadId + quoteToken after finalize.
- Quote summary email must be sent from finalize flow and include:
  - quote view link
  - Schedule Free Inspection link with token
- Finalize replay with same token must be idempotent:
  - no duplicate lead
  - no duplicate quote email

TOKEN RESOLUTION INVARIANTS
- resolveQuoteTokenPublicV1 must return explicit failure codes only (no silent fallback):
  - INVALID_TOKEN
  - TOKEN_NOT_FOUND
  - INCOMPLETE_DATA
  - LEAD_LOOKUP_FAILED
- If QuoteRequests.leadId is missing and Quote has leadId for same token, deterministic repair is allowed.
- Soft-deleted or missing Lead must resolve as INCOMPLETE_DATA.
- Lead lookup platform/read failures must resolve as LEAD_LOOKUP_FAILED (not INCOMPLETE_DATA).

PUBLIC SCHEDULING INVARIANTS (LOCKED)
- Public schedule UI must call scheduleFirstInspectionPublicV2 (not V1).
- scheduleFirstInspectionPublicV2 must not invoke other backend functions.
- V2 must inline:
  - token resolution semantics
  - stage update semantics (non-regression for public path)
  - inspection confirmation email send
- V2 must preserve:
  - InspectionRecord authoritative source
  - CalendarEvent projection sync
  - Lead mirror sync
  - duplicate active event cancellation
  - idempotent alreadyScheduled behavior

FRONTEND ERROR UX CONTRACT (PUBLIC)
- ScheduleInspection must map backend error codes to user-friendly messages.
- Raw backend codes must never be displayed to customers.
- Error state must include direct recovery CTA:
  - Start New Quote (public quote entry)
  - Go Home
- Missing token param must show clear recovery guidance.

NON-FATAL WARNING BEHAVIOR (ALLOWED)
- Stage update failure: scheduling remains successful; log warning.
- Confirmation email failure: scheduling remains successful; return emailStatus="failed" and show warning UX.
- CalendarEvent projection write failure: InspectionRecord remains authoritative; replay/idempotency must still hold.

OPERATIONS + MONITORING (FIRST 72 HOURS)
Track warning/error events:
- SFI_V2_STAGE_UPDATE_FAILED
- SFI_V2_EMAIL_FAILED
- SFI_V2_CANCELLED_DUPLICATE
- SFI_V2_TOKEN_REPAIR_WRITE_FAILED
- SFI_V2_TOKEN_REPAIR_FAILED
Escalate on sustained spikes above baseline.
