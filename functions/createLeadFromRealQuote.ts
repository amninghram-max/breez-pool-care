import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * createLeadFromRealQuote — staff/admin only
 * Called by RealQuoteModal to create a Lead without client-side mutations.
 * Mirrors the exact payload structure from the modal.
 */

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    // Admin/staff only
    if (!user || !['admin', 'staff'].includes(user.role)) {
      return Response.json({ error: 'Forbidden: Admin/staff access required' }, { status: 403 });
    }

    const payload = await req.json();
    const {
      firstName,
      lastName,
      email,
      mobilePhone,
      poolType,
      poolSurface,
      filterType,
      sanitizerType,
      screenedArea,
      treesOverhead,
      usageFrequency,
      hasPets,
      petSwimFrequency,
      poolCondition,
      spaPresent
    } = payload;

    // Validate required fields
    if (!firstName || !email) {
      return Response.json({ error: 'Missing required fields: firstName, email' }, { status: 400 });
    }

    // Create Lead with exact payload from modal
    const lead = await base44.asServiceRole.entities.Lead.create({
      firstName,
      lastName: lastName || null,
      email,
      mobilePhone: mobilePhone || null,
      stage: 'new_lead',
      isEligible: true,
      isDeleted: false,
      quoteGenerated: false,
      poolType: poolType || null,
      poolSurface: poolSurface || null,
      filterType: filterType || null,
      sanitizerType: sanitizerType || null,
      screenedArea: screenedArea || null,
      treesOverhead: treesOverhead || null,
      usageFrequency: usageFrequency || null,
      hasPets: hasPets || false,
      petSwimFrequency: petSwimFrequency || 'never',
      poolCondition: poolCondition || null,
      spaPresent: spaPresent || null
    });

    // Update lead to mark quote as generated and move to contacted stage
    await base44.asServiceRole.entities.Lead.update(lead.id, {
      quoteGenerated: true,
      stage: 'contacted'
    });

    console.log(`✅ Lead created from real quote: id=${lead.id}, email=${email}`);

    return Response.json({
      success: true,
      leadId: lead.id
    });
  } catch (error) {
    console.error('createLeadFromRealQuote error:', error);
    return Response.json({
      error: error.message,
      code: 'LEAD_CREATION_FAILED'
    }, { status: 500 });
  }
});