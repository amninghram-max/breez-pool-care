/**
 * createPoolForLeadV1 
 * Admin/staff-only backend function to create a Pool record for a Lead.
 * 
 * Purpose: Bypass Pool create RLS by using service role after admin/staff auth check.
 * 
 * Input: {
 *   leadId: string,
 *   chlorinationMethod: string (enum),
 * }
 * 
 * Output: { success: boolean, poolId?: string, error?: string, code?: string, build: string }
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

const BUILD = 'createPoolForLeadV1.2025-03-06.1';

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
    const { leadId, chlorinationMethod } = payload || {};

    // Validate admin/staff access
    const user = await base44.auth.me();
    console.log('[createPoolForLeadV1] Auth check', { email: user?.email, role: user?.role, passes: user && ['admin', 'staff'].includes(user.role) });
    if (!user || !['admin', 'staff'].includes(user.role)) {
      console.warn('[createPoolForLeadV1] Unauthorized attempt', { email: user?.email, role: user?.role });
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

    if (!chlorinationMethod || typeof chlorinationMethod !== 'string') {
      return json200({
        success: false,
        error: 'chlorinationMethod is required',
        code: 'INVALID_METHOD',
        build: BUILD
      });
    }

    // Create Pool using service role (after admin/staff auth check)
    try {
      console.log('POOL_CREATE_CONTEXT_SERVICE_ROLE', { 
        path: 'base44.asServiceRole.entities.Pool.create', 
        operator: user.email, 
        leadId: leadId.slice(0, 8) 
      });
      
      const poolData = {
        leadId,
        surfaceType: 'CONCRETE_PLASTER',
        chlorinationMethod,
        poolType: 'not_sure',
      };

      const createdPool = await base44.asServiceRole.entities.Pool.create(poolData);
      
      console.info('[createPoolForLeadV1] Pool created', { 
        poolId: createdPool.id, 
        leadId,
        admin: user.email
      });

      return json200({
        success: true,
        poolId: createdPool.id,
        build: BUILD
      });
    } catch (e) {
      console.error('[createPoolForLeadV1] Create failed', { leadId, error: e.message });
      return json200({
        success: false,
        error: `Failed to create Pool: ${e.message}`,
        code: 'CREATE_FAILED',
        build: BUILD
      });
    }
  } catch (err) {
    console.error('[createPoolForLeadV1] Outer error', { error: err.message });
    return json200({
      success: false,
      error: err.message,
      code: 'SERVER_ERROR',
      build: BUILD
    });
  }
});