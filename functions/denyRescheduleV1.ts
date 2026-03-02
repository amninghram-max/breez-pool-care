import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * denyRescheduleV1
 * 
 * Admin denies a reschedule request.
 * 
 * Input: { requestId, decisionNote? }
 * Output: { success, requestId, status, build }
 */

const BUILD = "DENY_RESCHEDULE_V1_2026_03_02";

const json200 = (data) => new Response(
  JSON.stringify(data),
  { status: 200, headers: { "content-type": "application/json; charset=utf-8" } }
);

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    // Admin-only
    if (user?.role !== 'admin') {
      return json200({
        success: false,
        error: 'Forbidden: Admin access required',
        build: BUILD
      });
    }

    const payload = await req.json();
    const { requestId, decisionNote } = payload || {};

    if (!requestId || typeof requestId !== 'string') {
      return json200({
        success: false,
        error: 'requestId is required',
        build: BUILD
      });
    }

    // Load RescheduleRequest
    let rescheduleRequest = null;
    try {
      const requests = await base44.asServiceRole.entities.RescheduleRequest.filter(
        { id: requestId },
        null,
        1
      );
      if (requests && requests.length > 0) {
        rescheduleRequest = requests[0];
      }
    } catch (e) {
      return json200({
        success: false,
        error: 'Failed to load reschedule request',
        detail: e.message,
        build: BUILD
      });
    }

    if (!rescheduleRequest) {
      return json200({
        success: false,
        error: 'Reschedule request not found',
        build: BUILD
      });
    }

    // Check if already denied (idempotency)
    if (rescheduleRequest.status === 'denied') {
      console.log('DENY_RESCHEDULE_V1_ALREADY_DENIED', { requestId });
      return json200({
        success: true,
        requestId,
        status: 'denied',
        alreadyDenied: true,
        build: BUILD
      });
    }

    // Only pending can be denied
    if (rescheduleRequest.status !== 'pending') {
      return json200({
        success: false,
        error: `Cannot deny reschedule with status: ${rescheduleRequest.status}`,
        build: BUILD
      });
    }

    // Mark as denied
    try {
      await base44.asServiceRole.entities.RescheduleRequest.update(requestId, {
        status: 'denied',
        deniedAt: new Date().toISOString(),
        deniedBy: user.email,
        decisionNote: decisionNote || null
      });
      console.log('DENY_RESCHEDULE_V1_DENIED', { 
        requestId, 
        deniedBy: user.email 
      });
    } catch (e) {
      console.error('DENY_RESCHEDULE_V1_UPDATE_FAILED', { error: e.message });
      return json200({
        success: false,
        error: 'Failed to deny reschedule request',
        detail: e.message,
        build: BUILD
      });
    }

    return json200({
      success: true,
      requestId,
      status: 'denied',
      build: BUILD
    });

  } catch (error) {
    console.error('DENY_RESCHEDULE_V1_CRASH', { error: error?.message });
    return json200({
      success: false,
      error: 'Denial failed',
      detail: error?.message,
      build: BUILD
    });
  }
});