# Base44 Next Prompt — Quote Email + Scheduling Validation

Use this as the next **single prompt** in Base44.


Before running the prompt in Base44, set these required secrets in the function environment:
- `APP_ORIGIN` (application origin used for redirects/links, e.g., `https://breezpoolcare.com`)
- `BASE_URL` (backend base URL used by legacy link builders)

```txt
DISCUSSION MODE ONLY (NO CODE CHANGES)

Great progress. Now run a strict post-implementation audit and return proof-level evidence that the fix is production-safe.

Scope:
- functions/finalizePrequalQuoteV2*
- functions/resolveQuoteTokenPublicV1*
- any email template/module touched
- QuoteResultDisplay (or equivalent post-quote CTA component)

Return the following:

1) Code-level diff summary
- Exact before/after snippets (small, targeted) showing:
  - lead creation path when leadId missing
  - QuoteRequests linkage update
  - inline email send (without calling other backend functions)
  - idempotency replay guard
  - resolve repair path behavior

2) Invariant compliance checklist (pass/fail + one-line evidence)
- No backend function calls another backend function
- Token-based public scheduling works pre-account
- No account creation requirement before inspection
- No silent fallback that masks missing token/lead linkage
- Deterministic behavior on replay

3) Runtime proof logs (redacted)
Provide structured sample outputs for:
- first finalize call (new lead created + email sent)
- second finalize replay (no duplicate lead/email)
- resolve call success with leadId/email/firstName populated
- resolve call truly-invalid token returning explicit failure

4) Edge-case gap analysis (top 5)
For each edge case include:
- risk
- whether currently handled
- exact fix recommendation if not handled

Required edge cases:
- token exists in QuoteRequests but Quote missing
- Quote exists but lead record soft-deleted
- email provider failure after quote persistence
- concurrent finalize requests with same token
- quote generated with missing firstName or malformed email

5) Final recommendation
- “Ready for production” or “Needs one more patch”
- If patch needed, provide one minimal implementation prompt only.

Constraints:
- Keep response under 650 words.
- No code changes in this step.
```
