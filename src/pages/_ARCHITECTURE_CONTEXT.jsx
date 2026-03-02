export const AI_BOOTSTRAP_CONTEXT = `# AI_BOOTSTRAP_CONTEXT — Breez Pool Care App

> ⚠️ **Non-negotiable invariants for all code generation. Do not deviate.**

---

## Session Rules

### Repository Facts Only
- Use **repo facts only** — no web search, external assumptions, or speculative patterns.
- Verify all architecture claims against actual implemented code.
- When in doubt, check the codebase before implementing.

---

## Invariants

### Pricing
- **Do not modify pricing invariants.** Pricing logic lives in \`AdminSettings\` and is versioned via \`pricingEngineVersion\`. Any pricing changes require explicit admin approval.

### Production Defaults
- **Do not introduce production defaults.** All configuration must be explicitly set by admins. No auto-seeding in production.

### Row Level Security (RLS)
- \`Lead.rls.update\` must **NOT** be \`true\`. Leads cannot be updated directly by clients.
- **No client-side Lead mutations.** Never use \`base44.entities.Lead.create/update/delete\` in UI code.

### Service Role
- **No service_role bypass assumptions.** Never assume \`asServiceRole\` will bypass RLS. Use service role only when explicitly required and after verifying user authentication.

### AdminSettings
- **Single source of truth:** Query via \`base44.entities.AdminSettings.list('-created_date', 1)\`.
- **No auto-seeding in production.** Seed only in dev/test via explicit function calls (never auto-exec on app startup).

### Lead Deletion
- **\`softDeleteLeadV2\`** is the **canonical Lead deletion path**.
- UI must use \`RemoveLeadPanel\` component everywhere.
- Hard delete is blocked when downstream records exist.

### Lead Meta Updates
- Use **\`updateLeadMeta\`** to update \`email\`, \`notes\`, and other mutable metadata fields.
- Never patch Lead directly; use \`updateLeadMeta\` backend function.

### Activation Links
- \`/activate\` links use \`leadId\` query parameter.
- Links user ↔ lead **deterministically** via \`linkUserToLead\` function.

### Public Quote Requests
- **Buffer entity:** \`PublicQuoteRequest\` holds pending intake requests (status: pending, converted_to_lead, expired, spam, duplicate).
- **\`publicSubmitQuoteRequest\`** writes intake submissions to \`PublicQuoteRequest\`; does not create Leads.
- **\`publicGetQuote\`** computes pricing/quote output for the public questionnaire and must not create/update Lead. It may call \`publicSubmitQuoteRequest\` to record intake.
- **\`convertQuoteRequestToLead\`** (staff-only, no service role) converts pending requests to Leads; idempotent; updates request status.
- **Admin queue:** \`QuoteRequestQueuePanel\` on \`AdminHome\` displays pending requests; staff converts via modal.

### Test Data Cleanup
- **\`bulkSoftDeleteTestLeadsV2\`** is dev-only; requires explicit \`data_env: "dev"\`.
- Never auto-execute; staff must trigger explicitly from \`BulkTestDataCleanup\` component.
- No heuristic detection; no auto-cleanup on production.

---

## Canonical Flows

### Public Quote Request Intake (PublicQuoteRequest Buffer)
1. Unauthenticated user fills questionnaire on landing/pre-qualification page
2. Frontend calls \`publicSubmitQuoteRequest\` → writes to \`PublicQuoteRequest\` entity (status: pending)
3. Optional: \`publicGetQuote\` generates quote details for preview (does not persist Lead)
4. Admin/staff reviews pending queue in \`QuoteRequestQueuePanel\`
5. Staff converts selected request via \`convertQuoteRequestToLead\` → creates Lead, updates request status to converted_to_lead
6. Lead enters normal pipeline (inspection → quote → service)

### Lead Creation (Backend Function Only)
- **From quote:** \`createLeadFromQuote\` — called after quote acceptance by customer
- **From inspection:** \`createLeadFromInspection\` — called after inspection finalization by staff
- **Manual:** Staff uses \`NewLeadModal\` → calls \`processLead\` backend function
- UI never calls \`base44.entities.Lead.create()\` directly

### Lead Stage Update (Backend Function Only)
- Use \`updateLeadStageV1\` for admin-triggered stage changes
- Use \`updateLeadStagePublicV1\` for customer-triggered changes (quote acceptance, scheduling)
- UI never calls \`base44.entities.Lead.update()\` for stage changes

### Lead Metadata Updates
- Use \`updateLeadMeta\` to update email, phone, notes, and non-stage fields
- Backend function validates and applies changes atomically

### Lead Deletion (Soft Delete)
1. User clicks delete → \`RemoveLeadPanel\` opens
2. User confirms → calls \`softDeleteLeadV2\` backend function
3. Function sets \`isDeleted: true\`, \`deletedAt\`, \`deletedBy\`, optional \`deleteReason\`
4. Function cancels downstream CalendarEvents with \`cancelReason: "lead_deleted"\`
5. UI invalidates \`['leads']\` query → row disappears

### Activation/Linking
1. Unlinked customer visits \`/activate?leadId=xxx\`
2. Backend verifies lead exists and is not deleted
3. If no user exists → invite sent, user registers
4. If user exists → call \`linkUserToLead\` function
5. User's \`linkedLeadId\` set to lead.id

### Test Data Handling
- Dev/test workflows that operate on test data must pass \`data_env: "dev"\` and must never mix environments in a single operation.
- Production queries use default (no \`data_env\` or \`data_env: "prod"\`)
- Never mix environments in a single operation
- Test cleanup via \`bulkSoftDeleteTestLeadsV2\` with \`data_env: "dev"\` only

---

**Last updated:** 2026-03-02  
**Enforced by:** Architecture review required for any deviation.
`;

export default function ArchitectureContextPage() {
  return null;
}