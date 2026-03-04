# Base44 Next Prompt — Soft-Deleted Lead Guard Patch

Use this as the next **single prompt** in Base44.


Before running the prompt in Base44, set these required secrets in the function environment:
- `APP_ORIGIN` (application origin used for redirects/links, e.g., `https://breezpoolcare.com`)
- `BASE_URL` (backend base URL used by legacy link builders)

```txt
IMPLEMENTATION MODE (MINIMAL PATCH ONLY)

Apply one focused fix in `functions/resolveQuoteTokenPublicV1` to block scheduling with deleted leads.

Problem:
- Current resolve path can return a leadId that points to a soft-deleted Lead.
- This violates scheduling integrity and can break downstream flows.

Required change:
1) In `resolveQuoteTokenPublicV1`, after leadId is obtained (from QuoteRequests or Quote repair path), validate the Lead record:
   - Query Lead by id via service role.
   - If Lead missing OR `isDeleted === true`, treat token as incomplete by nulling lead linkage and returning explicit failure.

2) Error behavior:
   - Return:
     - `success: false`
     - `code: "INCOMPLETE_DATA"`
     - `error: "Token does not have complete lead information"`
   - Do NOT silently remap to another lead (no email-based fallback).

3) Preserve current invariants:
   - No backend function calling another backend function.
   - Keep existing repair path for QuoteRequests missing leadId but Quote has leadId.
   - Keep deterministic/idempotent behavior.

4) Add concise structured logs:
   - `RQT_V1_LEAD_DELETED_OR_MISSING` with token + leadId (redacted/trimmed as currently done in this codebase).

5) Return report:
- Exact lines changed
- Before/after snippet for the new guard
- Manual test evidence for:
  a) valid token + active lead => success true
  b) valid token + soft-deleted lead => INCOMPLETE_DATA
  c) invalid token => TOKEN_NOT_FOUND

Constraints:
- Edit only `functions/resolveQuoteTokenPublicV1` unless strictly necessary.
- No refactors, no unrelated changes.
```
