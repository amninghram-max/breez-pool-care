import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * convertQuoteRequestToLead
 * Staff/admin endpoint: converts a PublicQuoteRequest to a Lead.
 * 
 * Requirements:
 * - Auth: admin/staff only
 * - Read PublicQuoteRequest using normal authenticated client
 * - Idempotency: if already converted, return existing leadId
 * - Map questionnaireData fields to Lead entity
 * - Create Lead using normal authenticated client (NOT asServiceRole)
 * - Update PublicQuoteRequest with conversion metadata
 */

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // ── Auth check: admin/staff only ──
    const user = await base44.auth.me();
    if (!user || !['admin', 'staff'].includes(user.role)) {
      return Response.json(
        { success: false, error: 'Forbidden: admin or staff role required' },
        { status: 403 }
      );
    }

    const { requestId } = await req.json();
    if (!requestId) {
      return Response.json(
        { success: false, error: 'requestId is required' },
        { status: 400 }
      );
    }

    // ── Load PublicQuoteRequest (normal authenticated client) ──
    let request;
    try {
      request = await base44.entities.PublicQuoteRequest.get(requestId);
    } catch (e) {
      return Response.json(
        { success: false, error: 'Quote request not found' },
        { status: 404 }
      );
    }

    if (!request) {
      return Response.json(
        { success: false, error: 'Quote request not found' },
        { status: 404 }
      );
    }

    // ── Idempotency: check if already converted ──
    if (request.status === 'converted_to_lead') {
      return Response.json({
        success: true,
        leadId: request.convertedLeadId,
        idempotent: true
      });
    }

    // ── Validate status ──
    if (request.status === 'expired' || request.status === 'spam') {
      return Response.json(
        { success: false, error: `Cannot convert ${request.status} request` },
        { status: 400 }
      );
    }

    // ── Parse questionnaireData ──
    let questionnaire;
    try {
      questionnaire = typeof request.questionnaireData === 'string'
        ? JSON.parse(request.questionnaireData)
        : request.questionnaireData;
    } catch (e) {
      return Response.json(
        { success: false, error: 'Invalid questionnaireData JSON', detail: e.message },
        { status: 400 }
      );
    }

    // ── Map questionnaireData to Lead (reuse publicGetQuote logic) ──
    // All enums and undefined behavior match publicGetQuote mappings
    const leadData = {
      firstName: questionnaire.clientFirstName,
      lastName: questionnaire.clientLastName || null,
      email: request.email,
      mobilePhone: request.phone || null,
      poolType: questionnaire.poolType || 'not_sure',
      spaPresent: questionnaire.spaPresent || 'unknown',
      screenedArea: questionnaire.enclosure || 'unscreened',
      treesOverhead: questionnaire.treesOverhead || 'not_sure',
      filterType: questionnaire.filterType || 'not_sure',
      sanitizerType: questionnaire.chlorinationMethod || 'not_sure',
      tabletFeederType: questionnaire.chlorinatorType || 'n/a',
      usageFrequency: questionnaire.useFrequency || 'rarely',
      hasPets: questionnaire.petsAccess || false,
      petsSwimInPool: questionnaire.petsAccess && questionnaire.petSwimFrequency !== 'never',
      petSwimFrequency: questionnaire.petSwimFrequency || 'never',
      poolCondition: questionnaire.poolCondition || 'not_sure',
      stage: 'new_lead',
      emailSent: false,
      smsSent: false,
      isDeleted: false
    };

    // ── Create Lead (normal authenticated client) ──
    let lead;
    try {
      lead = await base44.entities.Lead.create(leadData);
    } catch (e) {
      console.error('Lead creation failed:', e);
      return Response.json(
        { success: false, error: 'Failed to create lead', detail: e.message },
        { status: 500 }
      );
    }

    // ── Update PublicQuoteRequest with conversion metadata (normal client) ──
    try {
      await base44.entities.PublicQuoteRequest.update(requestId, {
        status: 'converted_to_lead',
        convertedLeadId: lead.id,
        convertedAt: new Date().toISOString(),
        convertedBy: user.email
      });
    } catch (e) {
      console.error('PublicQuoteRequest update failed:', e);
      // Note: Lead was already created; this is a secondary update failure
      // Return success but log the issue
    }

    console.log('CONVERT_QUOTE_REQUEST_SUCCESS', {
      requestId,
      leadId: lead.id,
      email: request.email,
      convertedBy: user.email
    });

    return Response.json({
      success: true,
      leadId: lead.id
    });
  } catch (error) {
    console.error('CONVERT_QUOTE_REQUEST_ERROR', {
      error: error?.message,
      stack: error?.stack?.slice(0, 300)
    });
    return Response.json(
      { success: false, error: 'Conversion failed', detail: error?.message },
      { status: 500 }
    );
  }
});