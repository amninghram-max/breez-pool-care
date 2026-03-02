import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * convertInPersonSalesSessionToLead
 * Staff/admin endpoint: converts an in-person sales session to a Lead.
 * 
 * Requirements:
 * - Auth: admin/staff only
 * - Load session; require quoteSnapshot (must be locked)
 * - Parse pricingInputs + inspectionDraft to map to Lead fields
 * - Create Lead via direct entity call (normal authenticated client, NOT asServiceRole)
 * - Set stage="new_lead", isDeleted=false explicitly
 * - Update session: status="converted_to_lead", convertedLeadId, activationLink
 * - Return leadId and activationLink
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

    const { sessionId, contact } = await req.json();
    
    if (!sessionId) {
      return Response.json(
        { success: false, error: 'sessionId is required' },
        { status: 400 }
      );
    }

    if (!contact || !contact.firstName || !contact.email) {
      return Response.json(
        { success: false, error: 'contact.firstName and contact.email are required' },
        { status: 400 }
      );
    }

    // ── Load session ──
    let session;
    try {
      session = await base44.entities.InPersonSalesSession.get(sessionId);
    } catch (e) {
      return Response.json(
        { success: false, error: 'Session not found' },
        { status: 404 }
      );
    }

    // ── Validate quote is locked ──
    if (!session.quoteSnapshot) {
      return Response.json(
        { success: false, error: 'Quote snapshot not locked; cannot convert to lead' },
        { status: 400 }
      );
    }

    // ── Parse pricingInputs and inspectionDraft ──
    let pricingData = {};
    let inspectionData = {};
    
    if (session.pricingInputs) {
      try {
        pricingData = typeof session.pricingInputs === 'string'
          ? JSON.parse(session.pricingInputs)
          : session.pricingInputs;
      } catch (e) {
        console.error('Failed to parse pricingInputs:', e);
      }
    }

    if (session.inspectionDraft) {
      try {
        inspectionData = typeof session.inspectionDraft === 'string'
          ? JSON.parse(session.inspectionDraft)
          : session.inspectionDraft;
      } catch (e) {
        console.error('Failed to parse inspectionDraft:', e);
      }
    }

    // ── Map pricingInputs to Lead fields (reuse convertQuoteRequestToLead mappings) ──
    const leadData = {
      firstName: contact.firstName,
      lastName: contact.lastName || null,
      email: contact.email,
      mobilePhone: contact.phone || null,
      
      // Pool characteristics from pricingInputs
      poolType: pricingData.poolType || 'not_sure',
      spaPresent: pricingData.spaPresent || 'unknown',
      screenedArea: pricingData.enclosure || 'unscreened',
      treesOverhead: pricingData.treesOverhead || 'not_sure',
      filterType: pricingData.filterType || 'not_sure',
      sanitizerType: pricingData.chlorinationMethod || 'not_sure',
      tabletFeederType: pricingData.chlorinatorType || 'n/a',
      usageFrequency: pricingData.useFrequency || 'rarely',
      
      // Pet/debris info
      hasPets: pricingData.petsAccess || false,
      petsSwimInPool: pricingData.petsAccess && pricingData.petSwimFrequency !== 'never',
      petSwimFrequency: pricingData.petSwimFrequency || 'never',
      
      // Pool condition
      poolCondition: pricingData.poolCondition || 'not_sure',
      
      // Lead stage and deletion flags (EXPLICITLY SET)
      stage: 'new_lead',
      isDeleted: false,
      
      // Contact defaults
      emailSent: false,
      smsSent: false
    };

    // ── Create Lead (normal authenticated client, NOT asServiceRole) ──
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

    // ── Generate activation link ──
    const activationLink = `/activate?leadId=${lead.id}`;

    // ── Update session with conversion metadata ──
    try {
      await base44.entities.InPersonSalesSession.update(sessionId, {
        status: 'converted_to_lead',
        convertedLeadId: lead.id,
        activationLink
      });
    } catch (e) {
      console.error('InPersonSalesSession conversion update failed:', e);
      // Note: Lead was already created; this is a secondary update failure
      // Return success but log the issue
      console.warn('Session update failed but Lead was created; returning partial success');
    }

    console.log('CONVERT_IN_PERSON_SALES_SESSION_TO_LEAD_SUCCESS', {
      sessionId,
      leadId: lead.id,
      email: contact.email,
      staffEmail: user.email
    });

    return Response.json({
      success: true,
      leadId: lead.id,
      activationLink
    });
  } catch (error) {
    console.error('CONVERT_IN_PERSON_SALES_SESSION_TO_LEAD_ERROR', {
      error: error?.message,
      stack: error?.stack?.slice(0, 300)
    });
    return Response.json(
      { success: false, error: 'Conversion failed', detail: error?.message },
      { status: 500 }
    );
  }
});