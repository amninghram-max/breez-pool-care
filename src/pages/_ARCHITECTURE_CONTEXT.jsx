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

If these drift, it is a defect:
- SPLIT_BRAIN_APPOINTMENT_TIME

### Single Active Inspection Guarantee
- A Lead must never have more than one active inspection appointment.
- Enforcement is at the application layer.
- Scheduling/reschedule logic must ensure only one active appointment remains.

The system may either:
- update the active appointment in place, or
- create a replacement appointment and cancel the prior active appointment

But it must never leave multiple active inspection appointments for the same lead.

### scheduleFirstInspectionPublicV2 Invariants
- Must not invoke other backend functions
- Must inline:
  - token resolution
  - stage update semantics
  - confirmation email send
- Must preserve:
  - InspectionRecord authority
  - CalendarEvent projection sync
  - Lead mirror sync
  - duplicate active appointment cancellation when needed
  - deterministic duplicate-submit protection

### Duplicate Submit Invariant
For an exact duplicate first-scheduling request:
- same lead
- same date
- same time slot / same normalized effective time window

The function must:
- return existing appointment details
- return \`alreadyScheduled: true\`
- return \`emailStatus: "skipped"\`
- not create a new InspectionRecord
- not create a new CalendarEvent
- not cancel the current active appointment
- not send another confirmation email

### True Reschedule / Replacement Behavior
If the incoming appointment request differs from the current active appointment:
- replacement/reschedule behavior may continue
- a new confirmation email may be sent
- the previous active appointment may be cancelled/replaced
- only one active appointment may remain after completion

### Scheduling Error UX Contract
- Public scheduling UI must map backend codes to user-friendly messages
- Raw backend codes must never be shown to customers
- Missing token state must show recovery guidance
- Error state must provide direct recovery CTA:
  - Start New Quote
  - Go Home

### Allowed Non-Fatal Warnings
- Stage update failure: scheduling may still succeed; log warning
- Confirmation email failure: scheduling may still succeed; return \`emailStatus: "failed"\`
- Projection write failure: InspectionRecord remains authoritative; replay/idempotency must still hold

---

## Canonical Lead Operations

### Lead Creation
- Lead creation must happen through backend-controlled flow only
- UI must not directly create operational Leads through entity writes
- Public quote finalize may deterministically ensure/create lead linkage as part of quote finalization flow

### Lead Stage Updates
- Use backend functions for stage changes
- Public path uses backend-controlled non-regressive stage transitions
- Client UI must not directly patch Lead stage

### Lead Metadata Updates
- Use dedicated backend mutation paths for editable lead metadata
- Do not patch protected operational Lead fields directly from UI

### Lead Deletion
1. User initiates removal
2. Canonical backend path: \`softDeleteLeadV2\`
3. Function sets:
   - \`isDeleted: true\`
   - \`deletedAt\`
   - \`deletedBy\`
   - optional \`deleteReason\`
4. Linked downstream scheduling artifacts are cancelled with explicit reason
5. Default admin queries exclude deleted leads

---

## Test Data / Smoke Test Rules

### Test Data Handling
- Do not rely on \`data_env: "dev"\` as the primary mechanism for current test harness flows
- Use deterministic tagged test runs and/or Base44 Test Database workflows
- Test cleanup must be explicit, never automatic in production
- Seed and cleanup functions must never auto-execute

### Current Test Harness Pattern
- \`seedTestRunV1\` creates deterministic test fixtures
- \`cleanupTestRunV1\` removes tagged test-run data
- Test flows must be explicit and operator-invoked
- No backend function runner may call other backend functions

---

## Platform Integrity Requirements

### AdminSettings Persistence
- AdminSettings persistence is mandatory
- If AdminSettings.create() returns success but record is not immediately readable via \`AdminSettings.list('-created_date', 1)\`, treat as:
  - ADMIN_SETTINGS_MISSING
  - PLATFORM_GHOST_WRITE defect
- Never bypass this with defaults

### Service Role Safety
- Service-context writes must persist deterministically
- Service-context writes must be readable immediately through expected read paths
- Never assume service role magically fixes bad RLS without verification

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

## Chemistry Architecture (Phase 1)

### Core Chemistry Invariants
- Chemistry engine must remain deterministic
- AdminSettings is the single source of truth for chemistry policy
- AdminSettings must load via \`AdminSettings.list('-created_date', 1)\`
- No production defaults
- Missing chemistry config must block dose planning with explicit reasons
- Seasonality may affect thresholds only, not chemistry targets
- FrequencyRecommendation is advisory-only
- No automatic billing mutation
- No mutation of immutable chemistry records

### Immutable Chemistry Records
- ChemTestRecord
- DosePlan
- RetestRecord
- ChemistryRiskEvent
- CustomerNotificationLog

### Dose Plan Requirements
DosePlan must include:
- calculatorVersion
- adminSettingsId
- adminSettingsSnapshot
- planHash
- readiness
- blockedReasons[]
- warnings[]
- ordered actions[]

Identical inputs must yield identical planHash.

### Chemistry Priority Rules
Order of operations:
1. Sanitation (Breakpoint if CC >= threshold)
2. Total Alkalinity correction
3. pH correction (acid demand required; no estimation)
4. CH / CYA / Salt adjustments

### LSI Policy
- LSI must be calculated from configured chemistry inputs
- Salt-specific events apply only for saltwater pools

### Chemistry Release Readiness
Must verify:
- AdminSettings present
- chemistry fields present
- target ranges present
- LSI bounds + factor table present
- retest/revisit policies present
- required ProductProfiles present
- immutable entities protected via RLS
- no target mutation by seasonality
- FrequencyRecommendation cannot mutate quotes/billing

Every chemistry readiness response must include:
- releaseReady
- usingDefaults
- blockers[]
- warnings[]
- calculatorVersion
- configRecordId
- configUpdatedAt
- timestamp

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

## UI Workflow Architecture

### Customer-Scoped Provider Workflows
- All provider workflows must be customer-scoped
- Every operational action must originate from a specific \`leadId\`
- No unscoped management pages as primary workflow hubs

### Customer Hub
- \`CustomerTimeline?leadId=<id>\` is the provider workflow hub
- If no leadId:
  - show searchable converted-customer picker
- If leadId present:
  - render customer hub view

### Performance Rules
- Do not load heavy historical feeds on initial render
- Initial load should show recent visits only
- Picker mode must debounce search and avoid heavy queries
- Timeline queries must be parallelized, limited, memoized, and stale-time tuned

### Navigation Integrity
- Buttons must be real \`<button>\` or \`<Link>\`
- Must pass explicit \`leadId\`
- Must not rely on silent redirects
- Must not bounce users into loops

### Locked Provider Nav Grouping
- Operations
- Customers
- Chemistry
- Pricing
- Team
- Support

Do not reintroduce role-based home duplication.

---

## Public Landing / Quote / Dashboard UI Targets

### Public Landing Page
Must support:
- Hero with quote + inspection CTA
- trust strip
- how-it-works flow
- digital experience section
- water-balance explanation
- service area section
- FAQ
- final CTA
- footer

### Quote Flow
- one-question-per-screen
- pool size
- screened/unscreened
- sanitation type
- usage + trees + pets
- condition
- contact: first name + email only
- monthly price or price range
- immediate schedule CTA
- quote email sent automatically

### Inspection Flow
- technician submits inspection
- admin/authorized technician finalizes
- final plan email sent for converted customer path
- payment required before becoming active/scheduled service customer

### Customer Dashboard
Must support:
- pool status
- last/next service
- water snapshot
- service record
- equipment overview
- communication panel
- safety / fecal incident reporting
- education link

### Technician Dashboard
Must support:
- route workflow
- visit workflow
- PSI logic
- water level logging
- shutoff plan capture
- equipment runtime/schedule fields
- recurring messages
- immutable change history

Technicians must not:
- modify pricing
- modify AdminSettings
- finalize inspections unless authorized
- delete immutable records

### Admin Dashboard
Must support:
- today overview
- schedule view
- lead pipeline
- inspection finalization queue
- safety panel
- payment status
- system health
- technician permission management
- manual/document management
- technician-view switching

---

## Safety Principles

- No production defaults
- No hidden fallbacks
- Deterministic behavior only
- No backend function may call another backend function
- AdminSettings must load via \`AdminSettings.list('-created_date', 1)\`
- Pricing and chemistry logic must remain versioned and immutable

---

## Scope Discipline

When updating multiple files:
1. Update one file.
2. Confirm behavior.
3. Expand only after confirmation.

This protocol prevents:
- silent route mismatches
- env-variable fragility
- prop/payload mismatch bugs
- undetected invariant violations
- scope creep in implementation mode

**Last updated:** 2026-03-06
**Enforced by:** architecture review required for any deviation.
`;

export default function ArchitectureContextPage() {
  return null;
}