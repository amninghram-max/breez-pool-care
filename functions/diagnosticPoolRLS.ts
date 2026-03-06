/**
 * diagnosticPoolRLS
 * Temporary diagnostic function to test Base44 asServiceRole / user_condition role resolution.
 * 
 * Purpose: Prove whether Pool create failures are caused by service-role user context issues.
 * 
 * Input: {
 *   leadId: string (required for create test),
 *   chlorinationMethod?: string (optional, defaults to "liquid_chlorine")
 * }
 * 
 * Output: {
 *   operator: string,
 *   authContext: { regularMe, asServiceRoleMe },
 *   poolRead: { success, count?, error? },
 *   poolCreate: { success, poolId?, error?, skipped? },
 *   build: string
 * }
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

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

    // Verify admin/staff only
    const user = await base44.auth.me();
    if (!user || !['admin', 'staff'].includes(user.role)) {
      return json200({
        success: false,
        error: 'Unauthorized: admin/staff role required',
        build: 'diagnosticPoolRLS.2025-03-06.1'
      });
    }

    const results = {
      operator: user.email,
      authContext: {
        regularMe: { success: false },
        asServiceRoleMe: { success: false }
      },
      poolRead: { success: false },
      poolCreate: { success: false }
    };

    // Test 1: Regular auth context
    try {
      const regularUser = await base44.auth.me();
      results.authContext.regularMe = {
        success: true,
        email: regularUser?.email,
        role: regularUser?.role
      };
    } catch (e) {
      results.authContext.regularMe = {
        success: false,
        error: e.message
      };
    }

    // Test 2: asServiceRole auth context
    try {
      const serviceUser = await base44.asServiceRole.auth.me();
      results.authContext.asServiceRoleMe = {
        success: true,
        email: serviceUser?.email,
        role: serviceUser?.role,
        note: 'if null/undefined, service role may not have user context'
      };
    } catch (e) {
      results.authContext.asServiceRoleMe = {
        success: false,
        error: e.message
      };
    }

    // Test 3: Pool read using service role (minimal safe read)
    try {
      const pools = await base44.asServiceRole.entities.Pool.list();
      results.poolRead = {
        success: true,
        count: pools?.length || 0
      };
    } catch (e) {
      results.poolRead = {
        success: false,
        error: e.message
      };
    }

    // Test 3b: Pool filter by leadId using service role
    try {
      const poolsByLead = await base44.asServiceRole.entities.Pool.filter({ leadId });
      results.poolFilterByLead = {
        success: true,
        count: poolsByLead?.length || 0,
        records: (poolsByLead || []).map(p => ({
          id: p.id,
          leadId: p.leadId,
          chlorinationMethod: p.chlorinationMethod,
          surfaceType: p.surfaceType,
          poolType: p.poolType
        }))
      };
    } catch (e) {
      results.poolFilterByLead = {
        success: false,
        error: e.message
      };
    }

    // Test 4: Pool create using service role
    if (leadId) {
      try {
        const poolData = {
          leadId,
          surfaceType: 'CONCRETE_PLASTER',
          chlorinationMethod: chlorinationMethod || 'liquid_chlorine',
          poolType: 'not_sure'
        };

        const createdPool = await base44.asServiceRole.entities.Pool.create(poolData);
        results.poolCreate = {
          success: true,
          poolId: createdPool.id
        };
      } catch (e) {
        results.poolCreate = {
          success: false,
          error: e.message
        };
      }
    } else {
      results.poolCreate = {
        skipped: true,
        reason: 'leadId not provided in payload'
      };
    }

    return json200({
      ...results,
      build: 'diagnosticPoolRLS.2025-03-06.1'
    });
  } catch (err) {
    return json200({
      success: false,
      error: err.message,
      build: 'diagnosticPoolRLS.2025-03-06.1'
    });
  }
});