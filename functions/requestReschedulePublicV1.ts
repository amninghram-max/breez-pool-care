import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * requestReschedulePublicV1
 * 
 * Customer-initiated reschedule request (public, token-based).
 * Creates RescheduleRequest with idempotency.
 * 
 * Input: { token, requestedStart, note? }
 * Output: { success, requestId, status, build }
 */

const BUILD = "REQUEST_RESCHEDULE_PUBLIC_V1_2026_03_02";

const json200 = (data) => new Response(
  JSON.stringify(data),
  { status: 200, headers: { "content-type": "application/json; charset=utf-8" } }
);

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const payload = await req.json();
    const { token, requestedStart, note } = payload || {};

    // Validate inputs
    if (!token || typeof token !== 'string') {
      return json200({
        success: false,
        error: 'token is required',
        build: BUILD
      });
    }

    if (!requestedStart || typeof requestedStart !== 'string') {
      return json200({
        success: false,
        error: 'requestedStart is required (ISO datetime)',
        build: BUILD
      });
    }

    // Resolve token to leadId via QuoteRequests
    let leadId = null;
    let email = null;
    try {
      const requests = await base44.asServiceRole.entities.QuoteRequests.filter(
        { token: token.trim() },
        null,
        1
      );
      if (requests && requests.length > 0) {
        leadId = requests[0].leadId;
        email = requests[0].email;
      }
    } catch (e) {
      console.warn('REQUEST_RESCHEDULE_PUBLIC_V1_TOKEN_RESOLUTION_FAILED', { error: e.message });
    }

    if (!leadId || !email) {
      return json200({
        success: false,
        code: 'INVALID_TOKEN',
        error: 'Token not found or invalid',
        build: BUILD
      });
    }

    // Load Lead
    let lead = null;
    try {
      const leads = await base44.asServiceRole.entities.Lead.filter({ id: leadId }, null, 1);
      if (leads && leads.length > 0) {
        lead = leads[0];
      }
    } catch (e) {
      console.warn('REQUEST_RESCHEDULE_PUBLIC_V1_LEAD_LOAD_FAILED', { error: e.message });
    }

    if (!lead) {
      return json200({
        success: false,
        code: 'LEAD_NOT_FOUND',
        error: 'Lead not found',
        build: BUILD
      });
    }

    // Check if Lead is soft-deleted
    if (lead.isDeleted) {
      return json200({
        success: false,
        code: 'LEAD_DELETED',
        error: 'This account is closed.',
        build: BUILD
      });
    }

    // Require inspectionEventId
    if (!lead.inspectionEventId) {
      return json200({
        success: false,
        code: 'NO_APPOINTMENT',
        error: 'No scheduled inspection to reschedule.',
        build: BUILD
      });
    }

    const calendarEventId = lead.inspectionEventId;

    // Build idempotency key: resched:${leadId}:${calendarEventId}:${requestedStart}
    const idempotencyKey = `resched:${leadId}:${calendarEventId}:${requestedStart}`;

    // Check if request already exists (idempotency)
    let existingRequest = null;
    try {
      const existing = await base44.asServiceRole.entities.RescheduleRequest.filter(
        { idempotencyKey },
        '-created_date',
        1
      );
      if (existing && existing.length > 0) {
        existingRequest = existing[0];
        console.log('REQUEST_RESCHEDULE_PUBLIC_V1_IDEMPOTENCY_HIT', { idempotencyKey, requestId: existingRequest.id });
      }
    } catch (e) {
      console.warn('REQUEST_RESCHEDULE_PUBLIC_V1_IDEMPOTENCY_CHECK_FAILED', { error: e.message });
    }

    // If exists, return existing
    if (existingRequest) {
      return json200({
        success: true,
        requestId: existingRequest.id,
        status: existingRequest.status,
        persisted: false,
        build: BUILD
      });
    }

    // Create RescheduleRequest
    let rescheduleRequest = null;
    try {
      rescheduleRequest = await base44.asServiceRole.entities.RescheduleRequest.create({
        leadId,
        calendarEventId,
        requestedStart,
        note: note || null,
        status: 'pending',
        idempotencyKey
      });
      console.log('REQUEST_RESCHEDULE_PUBLIC_V1_CREATED', { 
        requestId: rescheduleRequest.id, 
        leadId, 
        requestedStart 
      });
    } catch (e) {
      console.error('REQUEST_RESCHEDULE_PUBLIC_V1_CREATE_FAILED', { error: e.message });
      return json200({
        success: false,
        error: 'Failed to create reschedule request',
        detail: e.message,
        build: BUILD
      });
    }

    return json200({
      success: true,
      requestId: rescheduleRequest.id,
      status: 'pending',
      persisted: true,
      build: BUILD
    });

  } catch (error) {
    console.error('REQUEST_RESCHEDULE_PUBLIC_V1_CRASH', { error: error?.message });
    return json200({
      success: false,
      error: 'Reschedule request failed',
      detail: error?.message,
      build: BUILD
    });
  }
});