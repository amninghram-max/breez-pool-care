export const AI_BOOTSTRAP_CONTEXT = `# AI_BOOTSTRAP_CONTEXT — Breez Pool Care App

> ⚠️ **Non-negotiable invariants for all code generation. Do not deviate.**

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
- **No auto-seeding in production.** Seed only in dev/test via explicit function calls.

### Lead Deletion
- **\`softDeleteLeadV2\`** is the **canonical Lead deletion path**.
- UI must use \`RemoveLeadPanel\` component everywhere.
- Hard delete is blocked when downstream records exist.

### Activation Links
- \`/activate\` links use \`leadId\` query parameter.
- Links user ↔ lead **deterministically** via \`linkUserToLead\` function.

---

## Canonical Flows

### Lead Creation (Backend Function Only)
- **Quote flow:** \`createLeadFromQuote\` — called after quote acceptance
- **Inspection flow:** \`createLeadFromInspection\` — called after inspection finalization
- **Manual:** Staff uses \`NewLeadModal\` → calls \`processLead\` backend function
- UI never calls \`base44.entities.Lead.create()\` directly

### Lead Stage Update (Backend Function Only)
- Use \`updateLeadStageV1\` for admin-triggered stage changes
- Use \`updateLeadStagePublicV1\` for customer-triggered changes (quote acceptance, scheduling)
- UI never calls \`base44.entities.Lead.update()\` for stage changes

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
- All database queries in test mode **must** pass \`data_env: "dev"\`
- Production queries use default (no \`data_env\` or \`data_env: "prod"\`)
- Never mix environments in a single operation

---

**Last updated:** 2026-03-02  
**Enforced by:** Architecture review required for any deviation.
`;