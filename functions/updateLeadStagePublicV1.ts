/**
 * updateLeadStagePublicV1
 * Public backend function for token-based stage updates (no login required).
 * Resolves token → leadId, validates progression, updates stage.
 * 
 * Input: {
 *   token: string,
 *   newStage: string (enum: new_lead, contacted, quote_sent, inspection_scheduled, inspection_confirmed, converted, lost),
 *   context: string (source: 'prequal-completion', 'schedule-success', 'inspection-completion')
 * }
 * 
 * Output: { success: boolean, leadId: string, oldStage: string, newStage: string, changed: boolean, error?: string, code?: string, build: string }
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

const BUILD = 'updateLeadStagePublicV1.2025-03-02.1';

const VALID_STAGES = ['new_lead', 'contacted', 'quote_sent', 'inspection_scheduled', 'inspection_confirmed', 'converted', 'lost'];
const STAGE_PROGRESSION = {
  'new_lead': 0,
  'contacted': 1,
  'quote_sent': 2,
  'inspection_scheduled': 3,
  'inspection_confirmed': 4,
  'converted': 5,
  'lost': -1 // Lost can happen at any point
};

function json200(data) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { 'Content-Type': 'application/json; charset=utf-8' }
  });
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const payload = await req.json();
    const { token, newStage, context } = payload || {};

    // Validate inputs
    if (!token || typeof token !== 'string') {
      return json200({
        success: false,
        error: 'token is required',
        code: 'INVALID_TOKEN',
        build: BUILD
      });
    }

    if (!newStage || !VALID_STAGES.includes(newStage)) {
      return json200({
        success: false,
        error: `newStage must be one of: ${VALID_STAGES.join(', ')}`,
        code: 'INVALID_STAGE',
        build: BUILD
      });
    }

    // Resolve token → leadId via QuoteRequests
    let leadId = null;
    try {
      const requests = await base44.asServiceRole.entities.QuoteRequests.filter({ token: token.trim() }, null, 1);
      if (requests && requests.length > 0) {
        leadId = requests[0].leadId;
      }
    } catch (e) {
      console.warn('[updateLeadStagePublicV1] Token resolution failed', { error: e.message });
    }

    if (!leadId) {
      return json200({
        success: false,
        error: 'Token not found or invalid',
        code: 'TOKEN_NOT_FOUND',
        build: BUILD
      });
    }

    // Fetch current lead
    let lead = null;
    try {
      lead = await base44.asServiceRole.entities.Lead.get(leadId);
    } catch (e) {
      return json200({
        success: false,
        error: `Lead not found: ${leadId}`,
        code: 'LEAD_NOT_FOUND',
        build: BUILD
      });
    }

    const oldStage = lead.stage || 'new_lead';

    // If already at target stage, return idempotent success
    if (oldStage === newStage) {
      console.info('[updateLeadStagePublicV1] Idempotent (no change)', { token: token.slice(0, 8), leadId, stage: newStage, context });
      return json200({
        success: true,
        leadId,
        oldStage,
        newStage,
        changed: false,
        build: BUILD
      });
    }

    // Non-regression check: only allow forward progression in public flows
    const oldOrder = STAGE_PROGRESSION[oldStage] ?? -999;
    const newOrder = STAGE_PROGRESSION[newStage] ?? -999;
    const isRegression = newOrder < oldOrder && newStage !== 'lost';

    if (isRegression) {
      console.warn('[updateLeadStagePublicV1] Regression blocked (public)', { token: token.slice(0, 8), leadId, oldStage, newStage, context });
      return json200({
        success: false,
        error: `Cannot move backwards in public flow: ${oldStage} → ${newStage}`,
        code: 'REGRESSION_BLOCKED',
        build: BUILD
      });
    }

    // Perform update
    try {
      await base44.asServiceRole.entities.Lead.update(leadId, { stage: newStage });
      console.info('[updateLeadStagePublicV1] Stage updated', { 
        token: token.slice(0, 8),
        leadId, 
        oldStage, 
        newStage, 
        context
      });
      return json200({
        success: true,
        leadId,
        oldStage,
        newStage,
        changed: true,
        build: BUILD
      });
    } catch (e) {
      console.error('[updateLeadStagePublicV1] Update failed', { leadId, newStage, error: e.message });
      return json200({
        success: false,
        error: `Failed to update stage: ${e.message}`,
        code: 'UPDATE_FAILED',
        build: BUILD
      });
    }
  } catch (err) {
    console.error('[updateLeadStagePublicV1] Outer error', { error: err.message });
    return json200({
      success: false,
      error: err.message,
      code: 'SERVER_ERROR',
      build: BUILD
    });
  }
});