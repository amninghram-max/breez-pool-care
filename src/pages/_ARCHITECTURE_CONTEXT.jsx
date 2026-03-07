export const AI_BOOTSTRAP_CONTEXT = `# AI_BOOTSTRAP_CONTEXT — Breez Pool Care App

> ⚠️ Non-negotiable invariants for all code generation. Do not deviate.

---

## Session Rules

### Repository Facts Only
- Use repo facts only — no web search, external assumptions, or speculative patterns.
- Verify all architecture claims against actual implemented code.
- When in doubt, check the codebase before implementing.

### Execution Discipline
- Discussion Mode first for audits, planning, routing checks, payload checks, and invariant validation.
- Implementation Mode only after the exact change is validated.
- No speculative refactors.
- No expanding scope beyond what was explicitly approved.

---

## Core Invariants

### Pricing
- Do not modify pricing invariants without explicit approval.
- Pricing is admin-configured.
- AdminSettings is the single source of truth for pricing config.
- Config must load via \`AdminSettings.list('-created_date', 1)\`.
- Production pricing must not run on hardcoded defaults.
- If no AdminSettings record exists, pricing must fail rather than silently fallback.
- Partial or malformed AdminSettings must not trigger field-level hardcoded fallback in production.
- Pricing engine must remain deterministic, versioned, and auditable.
- Historical quotes must remain immutable.

### Production Defaults
- Do not introduce production defaults.
- No auto-seeding in production.
- No hidden fallback pricing.
- No silent config substitution.

### Row Level Security (RLS)
- \`Lead.rls.update\` must NOT be \`true\`.
- Leads cannot be updated directly by clients.
- No client-side Lead mutations for protected operational fields.
- Backend service-context operations must be used for stage and operational mutations.

### Backend Function Rule
- No backend function may call another backend function.
- Release readiness logic must remain inline.
- Scheduling/token resolution/stage update/email semantics must remain inline within the owning function.

### AdminSettings
- Single source of truth: \`AdminSettings.list('-created_date', 1)\`
- No auto-seeding in production
- If AdminSettings.create() appears successful but is not immediately readable, treat it as a platform defect
- Never bypass AdminSettings failures with production defaults

### Lead Safety
- Soft delete only in normal operations.
- \`softDeleteLeadV2\` is the canonical deletion path.
- Hard delete is not the normal operational path.
- Deleted leads must be excluded from default admin views.

---

## Main Routing / Provider Workflow

- Main page is \`Home\`, NOT \`PublicHome\`. Role-based redirect logic lives in \`pages/Home.jsx\` and must run first.
- \`ServiceVisitFlow\` is a protected provider page and must remain listed in \`PAGE_ACCESS\`.
- Full/live URL navigation has been more reliable than SPA bounce paths for launching \`ServiceVisitFlow\`.
- Provider nav groupings (locked): Operations, Customers, Chemistry, Pricing, Team, Support.
- Do not reintroduce role-based home duplication.

---

## Customer Hub / Provider Admin Structure

- \`CustomerTimeline?leadId=<id>\` is the provider/admin customer hub — treat as "Customer Profile Lookup".
- Pool record management belongs in \`CustomerTimeline\`.
- \`EquipmentProfileAdmin\` is equipment-only — not a customer hub.
- Provider/admin navigation labels:
  - Customer Profile Lookup → CustomerTimeline
  - Equipment Directory → EquipmentProfileAdmin
- If no leadId: show searchable converted-customer picker.
- If leadId present: render customer hub view.

---

## Entity Permission Reality (Repo-Proven)

- Direct frontend entity writes have been unreliable for several provider/admin workflows.
- Preferred pattern: guarded backend helper → asServiceRole entity operation → targeted RLS relaxation only if repo-proven necessary.
- Do NOT assume \`asServiceRole\` will satisfy entity \`user_condition.role\` create/read/update checks.
- When a helper already correctly uses \`base44.asServiceRole.entities.<Entity>.*\` but still gets permission denied, prefer targeted entity-operation RLS relaxation (\`create: true\`, \`read: true\`, or \`update: true\` only as needed) rather than rewriting working helper logic.
- Proven entities affected by this pattern in this repo:
  - Pool
  - ChemTestRecord
  - ChemistryRiskEvent
  - ServiceVisit
  - WaterLevelLog
  - DosePlan

---

## Service Visit Flow (Current — Authoritative)

### Canonical Step Sequence
\`\`\`
arrive → photos_before → test → analyze → dose → trichlor → wait → retest → checklist → water_level → photos_after → close
\`\`\`

### Step Invariants
- \`filter_psi\` has been merged into \`StepChecklist\` and is no longer its own step. Do not reintroduce it as a separate step.
- After photos (\`photos_after\`) must always be the final step before closeout. Do not move it earlier.
- Retest must occur before final photos unless explicitly skipped.
- \`wait\` and \`retest\` appear only when \`retestRequired\` is true.
- \`photosAfter\` and service activities (checklist, water level) must persist across timer/retest callbacks.

### Skip Retest (Manual Override)
- "Skip Retest" means skip ONLY the retest step, NOT remaining service workflow.
- After skip-retest is confirmed, the path continues normally:
  \`checklist → water_level → photos_after → close\`
- Skip-retest must NOT jump directly to closeout or bypass service tasks.
- \`retestRequired\` must be explicitly cleared (\`advance({ retestRequired: false })\`) before navigating.
- Skip paths exist in both \`StepWaitTimer\` and \`StepPhotosAfterService\`; both must route to \`goTo('checklist')\`.
- Manual override must be explicit and confirmed via modal.
- Logs required: skip-retest confirmed, retestRequired cleared, navigation to checklist.

### Access Issue Workflow
- \`access_wait\` is NOT part of the normal linear step sequence.
- Normal visit path: \`arrive → photos_before\`
- Explicit access issue path: \`StepArrive → AccessIssueModal → access_wait\`
- \`AccessIssueModal\` requires: reason selection, call attempted checkbox, text attempted checkbox.
- \`access_wait\` is a dedicated timer step for access issues only.
- Accidental entry into \`access_wait\` without \`accessIssueReason\` should redirect safely into normal flow.
- Access-issue reschedule flow:
  - \`handleAccessReschedule\` computes next day excluding Sunday
  - preserves \`originalScheduledDate\`
  - updates CalendarEvent \`scheduledDate\` / \`rescheduleReason\` / \`status\`
  - sends customer notification
- Reopen flow for access-issue reschedules exists via \`EventDetailsModal\` and \`reopenAccessIssueVisit\`.

### Notification / Event Status
- \`updateEventStatus\` for arrived/\`sendNotification:false\` should stay minimal.
- Intermittent frontend 502/TIME_LIMIT on lightweight functions may require bounded frontend retry for transient failures.

---

## Chemistry Testing / Recommendation (Current)

### StepTest Fields Supported
- freeChlorine, combinedChlorine, pH, totalAlkalinity, calciumHardness, cyanuricAcid, waterTemp, salt

### Analysis Rules
- \`StepAnalyze\` must consider both \`riskEvents\` and \`outOfRange\`, not just \`riskEvents\`.
- \`StepDoseConfirm\` must NOT gate calculation only on \`riskEvents\` length.
- \`generateChemistryRiskEvents\` identifies issues; dose recommendation flow is separate.
- First-visit full baseline requirement is a product requirement but is not yet fully implemented in workflow logic.

---

## Dosing / Canonical Unit Conventions (Current)

- Canonical liquid storage/calculation unit = **gallons**
- Canonical dry storage/calculation unit = **lbs**
- Tabs remain tabs
- Technician-facing display/input units:
  - liquids: gallons, qts, cups, fl oz
  - dry: lbs, oz
- UI conversion is display/input only; canonical save must convert back before persistence/comparison.
- Partial-apply comparison must not trigger on display-rounding noise.
- Main dose page and modal must use the same technician-facing unit logic.
- Closeout mapping must convert DosePlan actions into \`ServiceVisit.chemicalsAdded\` key-based object shape.

### Liquid Chemistry Baseline (Current)
- Liquid chlorine baseline is currently aligned to a 12% product-strength assumption.
- Current liquid formula behavior:
  - chlorine: \`flOzNeeded = deficit × (poolGallons / 1000) × chlorinePerPpm\` → \`gallonsNeeded = flOzNeeded / 128\`
  - acid: \`flOzNeeded = (excess / 0.2) × (poolGallons / 1000) × acidPerPH\` → \`gallonsNeeded = flOzNeeded / 128\`
- Default estimation constants (fl oz per 1000 gallons):
  - chlorinePerPpm = 1.3
  - acidPerPH = 1.2
  - bakingSodaPerTA = 1.5
- These are admin-managed via \`AdminSettings\`; do not hardcode in production.

---

## Product Profile Conventions (Current)

- \`ProductProfile\` entity exists; \`DosePlan\` actions already carry \`productProfileId\` and \`productProfileVersion\`.
- Built-in 12% liquid chlorine ProductProfile is seeded; \`LIQUID_CHLORINE\` dose actions should carry that metadata.
- Calculator is not yet fully profile-driven; estimation constants remain in \`AdminSettings\`.
- Intended expansion: more built-in strengths, profile selection UI, custom admin-created profiles.
- Other chemical types remain unchanged until explicitly expanded.

---

## Trichlor Conventions (Current)

- Trichlor is closeout/workflow accounting, not immediate dose/retest chemistry.
- Editable trichlor entry occurs in a dedicated step (\`StepTrichlor\`) after dose, not on final closeout.
- Final closeout must show trichlor as read-only summary only.
- Trichlor must NOT trigger immediate retest logic.

---

## Canonical Pricing / Quote Flow

### Public Quote Flow
1. Public user completes quote wizard
2. Frontend calls \`publicGetQuote\` for preview / pricing step behavior
3. Frontend calls \`finalizePrequalQuoteV2\` to persist quote + ensure lead linkage + send quote email
4. Quote email includes:
   - quote view link
   - Schedule Free Inspection link with token
5. Finalize replay with same token must be idempotent:
   - no duplicate lead
   - no duplicate quote
   - no duplicate quote email

### finalizePrequalQuoteV2 Invariants
- Must support firstName + email-only public contact collection without account creation
- Must receive sufficient quote inputs to deterministically finalize pricing
- If leadId is missing at finalize time, Lead must be created deterministically and linked
- QuoteRequests and Quote must resolve to the same leadId + quoteToken after finalize
- Quote must persist:
  - pricingEngineVersion
  - configRecordId
  - correctly mapped persisted input fields
- Replay with same token must be idempotent

### Token Resolution Invariants
- Public token resolution must return explicit failure codes only:
  - INVALID_TOKEN
  - TOKEN_NOT_FOUND
  - INCOMPLETE_DATA
  - LEAD_LOOKUP_FAILED
- If QuoteRequests.leadId is missing and Quote has leadId for the same token, deterministic repair is allowed
- Missing or soft-deleted Lead resolves as INCOMPLETE_DATA
- Platform/read failure during lead lookup resolves as LEAD_LOOKUP_FAILED

---

## Canonical Scheduling / Inspection Flow

### Scheduling Authority
- \`scheduleFirstInspectionPublicV2\` is the primary public scheduling path.
- V1 fallback is transitional and allowed only for platform/deployment failures.
- V1 fallback must never be used for business-rule failures.

### Scheduling Source of Truth
- InspectionRecord is authoritative for appointment time.
- CalendarEvent is a projection of InspectionRecord.
- Lead mirror fields must stay synced with InspectionRecord.

After any schedule change, these must match:
- InspectionRecord appointment fields
- CalendarEvent appointment fields
- Lead mirror appointment fields

If these drift, it is a defect: SPLIT_BRAIN_APPOINTMENT_TIME

### Single Active Inspection Guarantee
- A Lead must never have more than one active inspection appointment.
- Enforcement is at the application layer.
- Scheduling/reschedule logic must ensure only one active appointment remains.

### scheduleFirstInspectionPublicV2 Invariants
- Must not invoke other backend functions
- Must inline: token resolution, stage update semantics, confirmation email send
- Must preserve: InspectionRecord authority, CalendarEvent projection sync, Lead mirror sync, duplicate cancellation, deterministic duplicate-submit protection

### Duplicate Submit Invariant
For an exact duplicate first-scheduling request (same lead, same date, same time slot):
- return existing appointment details
- return \`alreadyScheduled: true\`
- return \`emailStatus: "skipped"\`
- not create a new InspectionRecord or CalendarEvent
- not cancel the current active appointment
- not send another confirmation email

### Scheduling Error UX Contract
- Public scheduling UI must map backend codes to user-friendly messages
- Raw backend codes must never be shown to customers
- Missing token state must show recovery guidance
- Error state must provide direct recovery CTA: Start New Quote, Go Home

### Allowed Non-Fatal Warnings
- Stage update failure: scheduling may still succeed; log warning
- Confirmation email failure: scheduling may still succeed; return \`emailStatus: "failed"\`
- Projection write failure: InspectionRecord remains authoritative; replay/idempotency must still hold

---

## Canonical Lead Operations

### Lead Creation
- Lead creation must happen through backend-controlled flow only
- UI must not directly create operational Leads through entity writes

### Lead Stage Updates
- Use backend functions for stage changes
- Public path uses backend-controlled non-regressive stage transitions
- Client UI must not directly patch Lead stage

### Lead Deletion
1. Canonical backend path: \`softDeleteLeadV2\`
2. Sets: \`isDeleted: true\`, \`deletedAt\`, \`deletedBy\`, optional \`deleteReason\`
3. Linked downstream scheduling artifacts are cancelled with explicit reason
4. Default admin queries exclude deleted leads

---

## Test Data / Smoke Test Rules

- Do not rely on \`data_env: "dev"\` as the primary mechanism for current test harness flows
- Use deterministic tagged test runs and/or Base44 Test Database workflows
- Test cleanup must be explicit, never automatic in production
- \`seedTestRunV1\` creates deterministic test fixtures; \`cleanupTestRunV1\` removes tagged test-run data
- Test flows must be explicit and operator-invoked
- No backend function runner may call other backend functions

---

## Platform Integrity Requirements

### AdminSettings Persistence
- If AdminSettings.create() returns success but record is not immediately readable, treat as ADMIN_SETTINGS_MISSING / PLATFORM_GHOST_WRITE defect
- Never bypass with defaults

### Service Role Safety
- Service-context writes must persist deterministically
- Service-context writes must be readable immediately through expected read paths
- Never assume service role magically fixes bad RLS without verification

---

## Chemistry Architecture (Phase 1)

### Core Chemistry Invariants
- Chemistry engine must remain deterministic
- AdminSettings is the single source of truth for chemistry policy
- No production defaults
- Missing chemistry config must block dose planning with explicit reasons
- Seasonality may affect thresholds only, not chemistry targets
- FrequencyRecommendation is advisory-only
- No automatic billing mutation
- No mutation of immutable chemistry records

### Immutable Chemistry Records
- ChemTestRecord, DosePlan, RetestRecord, ChemistryRiskEvent, CustomerNotificationLog

### Dose Plan Requirements
DosePlan must include: calculatorVersion, adminSettingsId, adminSettingsSnapshot, planHash, readiness, blockedReasons[], warnings[], ordered actions[].
Identical inputs must yield identical planHash.

### Chemistry Priority Rules (Order of Operations)
1. Sanitation (Breakpoint if CC >= threshold)
2. Total Alkalinity correction
3. pH correction (acid demand required; no estimation)
4. CH / CYA / Salt adjustments

### LSI Policy
- LSI must be calculated from configured chemistry inputs
- Salt-specific events apply only for saltwater pools

### Chemistry Golden Tests
At minimum:
- Balanced pool → no actions
- Low FC → LC dose only
- High CC → breakpoint workflow + retest required
- TA low + pH high → TA action first
- Acid demand missing while pH high → acid blocked
- Low CH + low LSI → calcium recommendation
- High CYA → advisory/risk event
- Salt pool low salt → salt action + salt risk event
- Seasonal offset month → threshold adjusted only
- 3 consecutive above-threshold visits → FrequencyRecommendation pending_review

---

## UI / Performance Rules

### Navigation Integrity
- Buttons must be real \`<button>\` or \`<Link>\`
- Must pass explicit \`leadId\`
- Must not rely on silent redirects
- Must not bounce users into loops

### Performance
- Do not load heavy historical feeds on initial render
- Initial load should show recent visits only
- Picker mode must debounce search and avoid heavy queries
- Timeline queries must be parallelized, limited, memoized, and stale-time tuned

---

## Data / Architecture Rules

Do not:
- duplicate pricing logic in frontend
- duplicate chemistry logic
- create alternate config loaders
- introduce default pricing fallback
- auto-finalize inspections
- auto-mutate billing
- mutate immutable historical quote/chemistry records
- rely on hidden fallback behavior

All status transitions must be explicit.
All immutable records must remain immutable.
All alerts must be event-based.

---

## Build Guardrails — Do Not Reintroduce

- filter_psi as a separate step
- access_wait as a normal linear step
- direct frontend entity writes where a helper pattern is already repo-proven
- after-photos before retest
- skip-retest paths that bypass remaining service workflow (checklist → water_level → photos_after → close)
- retest triggering on trichlor entry
- production default chemistry constants (must come from AdminSettings)
- hardcoded pricing fallback

---

**Last updated:** 2026-03-07
**Enforced by:** architecture review required for any deviation.
`;

export default function ArchitectureContextPage() {
  return null;
}