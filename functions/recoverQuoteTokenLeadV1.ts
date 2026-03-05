import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * recoverQuoteTokenLeadV1
 * Admin-only recovery tool for deleted-lead quote tokens (LEAD_UNAVAILABLE case).
 *
 * Resolves a token to its Quote + QuoteRequests, checks if linked lead is deleted,
 * and applies recovery in two modes:
 * - undelete_existing: restore the original (soft-)deleted lead
 * - create_replacement: create new lead, rebind token to it
 *
 * Input:  { token, mode: "undelete_existing" | "create_replacement", reason: string }
 * Output: { success, code, leadId?, oldLeadId?, message?, build }
 *
 * Audit: Immutable AnalyticsEvent written for all recoveries
 * Idempotency: Safe to re-run (detects prior recovery via lead state)
 */

const BUILD = "RECOVER_TOKEN_V1-2026-03-03-A";

const json200 = (data) => new Response(
  JSON.stringify(data),
  { status: 200, headers: { "content-type": "application/json; charset=utf-8" } }
);

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const payload = await req.json();
    const { token, mode, reason } = payload || {};

    // ── Auth: Admin/Staff only ──
    let user = null;
    try {
      user = await base44.auth.me();
    } catch (e) {
      console.warn('RECOVER_TOKEN_V1_AUTH_FAILED', { error: e.message });
      return json200({
        success: false,
        code: 'FORBIDDEN',
        message: 'Not authenticated',
        build: BUILD
      });
    }

    if (!user || !['admin', 'staff'].includes(user.role)) {
      console.warn('RECOVER_TOKEN_V1_AUTH_DENIED', { userRole: user?.role });
      return json200({
        success: false,
        code: 'FORBIDDEN',
        message: 'Admin/staff access required',
        build: BUILD
      });
    }

    // ── Input validation ──
    if (!token || typeof token !== 'string' || !token.trim()) {
      return json200({
        success: false,
        code: 'INVALID_INPUT',
        message: 'token is required',
        build: BUILD
      });
    }

    if (!mode || !['undelete_existing', 'create_replacement'].includes(mode)) {
      return json200({
        success: false,
        code: 'INVALID_MODE',
        message: 'mode must be "undelete_existing" or "create_replacement"',
        build: BUILD
      });
    }

    if (!reason || typeof reason !== 'string' || !reason.trim()) {
      return json200({
        success: false,
        code: 'INVALID_INPUT',
        message: 'reason is required for audit',
        build: BUILD
      });
    }

    const cleanToken = token.trim();
    const cleanReason = reason.trim();

    // ── Step 1: Resolve token ──
    let quoteRequest = null;
    let quote = null;
    try {
      const requests = await base44.asServiceRole.entities.QuoteRequests.filter({ token: cleanToken }, null, 1);
      if (requests && requests.length > 0) quoteRequest = requests[0];
    } catch (e) {
      console.error('RECOVER_TOKEN_V1_QUERY_FAILED', { error: e.message });
      return json200({
        success: false,
        code: 'QUERY_ERROR',
        message: 'Failed to resolve token',
        build: BUILD
      });
    }

    if (!quoteRequest) {
      console.log('RECOVER_TOKEN_V1_TOKEN_NOT_FOUND', { token: cleanToken.slice(0, 8) });
      return json200({
        success: false,
        code: 'TOKEN_NOT_FOUND',
        message: 'Token not found',
        build: BUILD
      });
    }

    // Fetch Quote (may be missing, but useful for recovery data)
    try {
      const quotes = await base44.asServiceRole.entities.Quote.filter({ quoteToken: cleanToken }, '-created_date', 1);
      if (quotes && quotes.length > 0) quote = quotes[0];
    } catch (e) {
      console.warn('RECOVER_TOKEN_V1_QUOTE_FETCH_FAILED', { error: e.message });
    }

    const linkedLeadId = quoteRequest.leadId || quote?.leadId || null;

    // ── Step 2: Check if lead is actually deleted ──
    let currentLead = null;
    let leadIsDeleted = false;
    if (linkedLeadId) {
      try {
        const leads = await base44.asServiceRole.entities.Lead.filter({ id: linkedLeadId }, null, 1);
        if (leads && leads.length > 0) {
          currentLead = leads[0];
          leadIsDeleted = currentLead.isDeleted === true;
        }
      } catch (e) {
        console.warn('RECOVER_TOKEN_V1_LEAD_CHECK_FAILED', { error: e.message });
        return json200({
          success: false,
          code: 'QUERY_ERROR',
          message: 'Failed to check lead status',
          build: BUILD
        });
      }
    }

    // If lead is not deleted, nothing to do
    if (currentLead && !leadIsDeleted) {
      console.log('RECOVER_TOKEN_V1_NO_ACTION', { linkedLeadId, reason: 'lead_not_deleted' });
      return json200({
        success: true,
        code: 'NO_ACTION_REQUIRED',
        leadId: linkedLeadId,
        message: 'Lead is active; no recovery needed',
        build: BUILD
      });
    }

    // ── Step 3: Recovery logic ──
    let recoveryCode = null;
    let finalLeadId = linkedLeadId;

    if (mode === 'undelete_existing') {
      // ── Mode A: Restore original lead ──
      if (!currentLead) {
        console.log('RECOVER_TOKEN_V1_CANNOT_UNDELETE', { reason: 'lead_not_found' });
        return json200({
          success: false,
          code: 'TOKEN_NOT_FOUND',
          message: 'Original lead not found; cannot undelete',
          build: BUILD
        });
      }

      if (!leadIsDeleted) {
        // Already active (idempotency guard)
        recoveryCode = 'NO_ACTION_REQUIRED';
      } else {
        // Undelete: clear soft-delete flags
        try {
          await base44.asServiceRole.entities.Lead.update(linkedLeadId, {
            isDeleted: false,
            deletedAt: null,
            deletedBy: null,
            deleteReason: null
          });
          console.log('RECOVER_TOKEN_V1_UNDELETED', { leadId: linkedLeadId, operator: user.email });
          recoveryCode = 'RECOVERED_UNDELETED';
        } catch (e) {
          console.error('RECOVER_TOKEN_V1_UNDELETE_FAILED', { error: e.message });
          return json200({
            success: false,
            code: 'RECOVERY_FAILED',
            message: 'Failed to undelete lead',
            build: BUILD
          });
        }
      }
    } else if (mode === 'create_replacement') {
      // ── Mode B: Create new lead, rebind token ──
      // Extract contact info from available sources
      const contactEmail = quoteRequest.email || quote?.clientEmail || null;
      const contactFirstName = quoteRequest.firstName || quote?.clientFirstName || null;

      if (!contactEmail) {
        return json200({
          success: false,
          code: 'INSUFFICIENT_DATA',
          message: 'Cannot create replacement lead: no email available',
          build: BUILD
        });
      }

      try {
        // Check for existing non-deleted lead with same email (avoid duplicates)
        const existing = await base44.asServiceRole.entities.Lead.filter(
          { email: contactEmail, isDeleted: false },
          '-created_date',
          1
        );
        
        if (existing && existing.length > 0) {
          // Reuse existing active lead
          finalLeadId = existing[0].id;
          console.log('RECOVER_TOKEN_V1_REUSED_EXISTING', { newLeadId: finalLeadId, email: contactEmail.slice(0, 5) });
          recoveryCode = 'RECOVERED_REBOUND';
        } else {
          // Create new lead
          const newLead = await base44.asServiceRole.entities.Lead.create({
            email: contactEmail,
            firstName: contactFirstName || 'Customer',
            stage: 'quote_sent',
            quoteGenerated: true,
            isEligible: true,
            isDeleted: false
          });
          finalLeadId = newLead.id;
          console.log('RECOVER_TOKEN_V1_CREATED_NEW', { newLeadId: finalLeadId, email: contactEmail.slice(0, 5) });
          recoveryCode = 'RECOVERED_REBOUND';
        }

        // Update QuoteRequests linkage
        try {
          await base44.asServiceRole.entities.QuoteRequests.update(quoteRequest.id, {
            leadId: finalLeadId
          });
        } catch (e) {
          console.warn('RECOVER_TOKEN_V1_UPDATE_QUOTEREQUEST_FAILED', { error: e.message });
        }

        // Update Quote linkage (if quote exists)
        if (quote) {
          try {
            await base44.asServiceRole.entities.Quote.update(quote.id, {
              leadId: finalLeadId
            });
          } catch (e) {
            console.warn('RECOVER_TOKEN_V1_UPDATE_QUOTE_FAILED', { error: e.message });
          }
        }

      } catch (e) {
        console.error('RECOVER_TOKEN_V1_CREATE_REPLACEMENT_FAILED', { error: e.message });
        return json200({
          success: false,
          code: 'RECOVERY_FAILED',
          message: 'Failed to create replacement lead',
          build: BUILD
        });
      }
    }

    // ── Step 4: Write audit event (immutable) ──
    try {
      await base44.asServiceRole.entities.AnalyticsEvent.create({
        eventName: 'admin_recover_quote_token_lead',
        properties: {
          token_prefix: cleanToken.slice(0, 8),
          old_lead_id: linkedLeadId ? linkedLeadId.slice(0, 8) : null,
          new_lead_id: finalLeadId ? finalLeadId.slice(0, 8) : null,
          mode,
          operator: user.email,
          reason: cleanReason,
          recovery_code: recoveryCode,
          timestamp: new Date().toISOString()
        }
      });
      console.log('RECOVER_TOKEN_V1_AUDIT_LOGGED', { token: cleanToken.slice(0, 8), code: recoveryCode });
    } catch (e) {
      console.warn('RECOVER_TOKEN_V1_AUDIT_FAILED', { error: e.message });
      // Non-fatal: continue even if audit fails
    }

    console.log('RECOVER_TOKEN_V1_SUCCESS', {
      token: cleanToken.slice(0, 8),
      code: recoveryCode,
      operator: user.email
    });

    return json200({
      success: true,
      code: recoveryCode,
      leadId: finalLeadId,
      oldLeadId: linkedLeadId,
      message: `Recovery complete: ${recoveryCode}. Customer can now retry their scheduling link.`,
      build: BUILD
    });

  } catch (error) {
    console.error('RECOVER_TOKEN_V1_CRASH', { error: error?.message });
    return json200({
      success: false,
      code: 'SERVER_ERROR',
      message: 'Recovery failed unexpectedly',
      build: BUILD
    });
  }
});