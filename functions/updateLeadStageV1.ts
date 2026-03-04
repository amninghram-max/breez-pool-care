/**
 * updateLeadStageV1
 * Admin/internal backend function to update a Lead's pipeline stage.
 * 
 * Purpose: Single source of truth for stage updates with idempotency + non-regression logic.
 * 
 * Input: {
 *   leadId: string,
 *   newStage: string (enum: new_lead, contacted, quote_sent, inspection_scheduled, inspection_confirmed, converted, lost),
 *   context: string (source of change: 'prequal-completion', 'schedule-success', 'admin-manual', 'inspection-completion'),
 *   allowRegression?: boolean (admin override to allow backwards movement; default false)
 * }
 * 
 * Output: { success: boolean, leadId: string, oldStage: string, newStage: string, changed: boolean, error?: string, code?: string, build: string }
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

const BUILD = 'updateLeadStageV1.2025-03-02.1';

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
    const { leadId, newStage, context, allowRegression } = payload || {};

    // Validate admin access
    const user = await base44.auth.me();
    if (!user || !['admin', 'staff'].includes(user.role)) {
      console.warn('[updateLeadStageV1] Unauthorized attempt', { email: user?.email, role: user?.role });
      return json200({
        success: false,
        error: 'Unauthorized: admin/staff role required',
        code: 'UNAUTHORIZED',
        build: BUILD
      });
    }

    // Validate inputs
    if (!leadId || typeof leadId !== 'string') {
      return json200({
        success: false,
        error: 'leadId is required',
        code: 'INVALID_LEAD_ID',
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
      console.info('[updateLeadStageV1] Idempotent (no change)', { leadId, stage: newStage, context });
      return json200({
        success: true,
        leadId,
        oldStage,
        newStage,
        changed: false,
        build: BUILD
      });
    }

    // Non-regression check (unless allowed)
    const oldOrder = STAGE_PROGRESSION[oldStage] ?? -999;
    const newOrder = STAGE_PROGRESSION[newStage] ?? -999;
    const isRegression = newOrder < oldOrder && newStage !== 'lost';

    if (isRegression && !allowRegression) {
      console.warn('[updateLeadStageV1] Regression blocked', { leadId, oldStage, newStage, context });
      return json200({
        success: false,
        error: `Cannot move backwards: ${oldStage} → ${newStage}. Use allowRegression=true if intentional.`,
        code: 'REGRESSION_BLOCKED',
        build: BUILD
      });
    }

    // Perform update (use authenticated admin context for Lead write)
    try {
      console.log('LEAD_UPDATE_CONTEXT_AUTH_USER', { path: 'base44.entities.Lead.update', operator: user.email, leadId: leadId.slice(0, 8) });
      await base44.entities.Lead.update(leadId, { stage: newStage });
      console.info('[updateLeadStageV1] Stage updated', { 
        leadId, 
        oldStage, 
        newStage, 
        context, 
        allowRegression,
        admin: user.email
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
      console.error('[updateLeadStageV1] Update failed', { leadId, newStage, error: e.message });
      return json200({
        success: false,
        error: `Failed to update stage: ${e.message}`,
        code: 'UPDATE_FAILED',
        build: BUILD
      });
    }
  } catch (err) {
    console.error('[updateLeadStageV1] Outer error', { error: err.message });
    return json200({
      success: false,
      error: err.message,
      code: 'SERVER_ERROR',
      build: BUILD
    });
  }
});