import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * requestReschedulePublicV2
 * 
 * Customer-initiated reschedule request (public, token-based).
 * Resolves appointment via InspectionRecord first (preferred), falls back to Lead.inspectionEventId.
 * Creates RescheduleRequest with inspectionId reference.
 * 
 * Input: { token, requestedStart, note? }
 * Output: { success, requestId, status, build }
 */

const BUILD = "REQUEST_RESCHEDULE_PUBLIC_V2_2026_03_02";

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
      return json200({ success: false, error: 'token is required', build: BUILD });
    }

    if (!requestedStart || typeof requestedStart !== 'string') {
      return json200({ success: false, error: 'requestedStart is required (ISO datetime)', build: BUILD });
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
      console.warn('REQUEST_RESCHEDULE_PUBLIC_V2_TOKEN_RESOLUTION_FAILED', { error: e.message });
    }

    if (!leadId || !email) {
      return json200({ success: false, code: 'INVALID_TOKEN', error: 'Token not found or invalid', build: BUILD });
    }

    // Load Lead
    let lead = null;
    try {
      const leads = await base44.asServiceRole.entities.Lead.filter({ id: leadId }, null, 1);
      if (leads && leads.length > 0) {
        lead = leads[0];
      }
    } catch (e) {
      console.warn('REQUEST_RESCHEDULE_PUBLIC_V2_LEAD_LOAD_FAILED', { error: e.message });
    }

    if (!lead) {
      return json200({ success: false, code: 'LEAD_NOT_FOUND', error: 'Lead not found', build: BUILD });
    }

    // Check if Lead is soft-deleted
    if (lead.isDeleted) {
      return json200({ success: false, code: 'LEAD_DELETED', error: 'This account is closed.', build: BUILD });
    }

    // RESOLVE APPOINTMENT: Prefer InspectionRecord, fall back to Lead.inspectionEventId
    let calendarEventId = null;
    let inspectionId = null;
    try {
      const inspections = await base44.asServiceRole.entities.InspectionRecord.filter(
        { leadId, appointmentStatus: { $ne: 'cancelled' } },
        '-created_date',
        1
      );
      if (inspections && inspections.length > 0) {
        const inspection = inspections[0];
        inspectionId = inspection.id;
        calendarEventId = inspection.calendarEventId;
        console.log('REQUEST_RESCHEDULE_PUBLIC_V2_RESOLVED_VIA_INSPECTION', { leadId, inspectionId });
      }
    } catch (e) {
      console.warn('REQUEST_RESCHEDULE_PUBLIC_V2_INSPECTION_QUERY_FAILED', { error: e.message });
    }

    // Fallback: Use Lead.inspectionEventId
    if (!calendarEventId && lead.inspectionEventId) {
      calendarEventId = lead.inspectionEventId;
      console.log('REQUEST_RESCHEDULE_PUBLIC_V2_RESOLVED_VIA_LEAD', { leadId, calendarEventId });
    }

    if (!calendarEventId) {
      return json200({ success: false, code: 'NO_APPOINTMENT', error: 'No scheduled inspection to reschedule.', build: BUILD });
    }

    // Build idempotency key
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
        console.log('REQUEST_RESCHEDULE_PUBLIC_V2_IDEMPOTENCY_HIT', { idempotencyKey, requestId: existingRequest.id });
      }
    } catch (e) {
      console.warn('REQUEST_RESCHEDULE_PUBLIC_V2_IDEMPOTENCY_CHECK_FAILED', { error: e.message });
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
        inspectionId: inspectionId || null,
        requestedStart,
        note: note || null,
        status: 'pending',
        idempotencyKey
      });
      console.log('REQUEST_RESCHEDULE_PUBLIC_V2_CREATED', {
        requestId: rescheduleRequest.id,
        leadId,
        inspectionId,
        requestedStart
      });
    } catch (e) {
      console.error('REQUEST_RESCHEDULE_PUBLIC_V2_CREATE_FAILED', { error: e.message });
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
    console.error('REQUEST_RESCHEDULE_PUBLIC_V2_CRASH', { error: error?.message });
    return json200({
      success: false,
      error: 'Reschedule request failed',
      detail: error?.message,
      build: BUILD
    });
  }
});