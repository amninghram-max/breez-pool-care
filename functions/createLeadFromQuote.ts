import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    const { quoteId } = await req.json();

    if (!quoteId) {
      return Response.json({ error: 'Quote ID required' }, { status: 400 });
    }

    // Get quote
    const quote = await base44.asServiceRole.entities.PoolQuestionnaire.get(quoteId);

    if (!quote) {
      return Response.json({ error: 'Quote not found' }, { status: 404 });
    }

    // Check if lead already exists for this customer
    const existingLeads = await base44.asServiceRole.entities.Lead.filter({
      email: quote.clientEmail
    });

    if (existingLeads.length > 0) {
      // Update existing lead with quote info
      const lead = existingLeads[0];
      await base44.asServiceRole.entities.Lead.update(lead.id, {
        quoteGenerated: true,
        stage: quote.quoteStatus === 'generated' ? 'quote_sent' : lead.stage,
        isEligible: !quote.poolCondition || quote.poolCondition !== 'disqualified',
        disqualificationReason: quote.poolCondition === 'disqualified' ? 'Pool condition not serviceable' : undefined
      });

      // Log analytics
      await base44.asServiceRole.entities.AnalyticsEvent.create({
        eventType: 'LeadUpdated',
        leadId: lead.id,
        source: 'system',
        metadata: {
          trigger: 'quote_completed',
          quote_id: quoteId
        },
        timestamp: new Date().toISOString()
      });

      return Response.json({
        success: true,
        leadId: lead.id,
        isNew: false
      });
    }

    // Create new lead from quote
    const newLead = await base44.asServiceRole.entities.Lead.create({
      firstName: quote.clientEmail.split('@')[0], // Temporary, should be captured in quote
      email: quote.clientEmail,
      mobilePhone: quote.clientPhone || '',
      stage: 'new_lead',
      quoteGenerated: true,
      isEligible: !quote.poolCondition || quote.poolCondition !== 'disqualified',
      disqualificationReason: quote.poolCondition === 'disqualified' ? 'Pool condition not serviceable' : undefined,
      poolType: quote.poolType,
      poolSurface: quote.poolSurface || 'not_sure',
      filterType: quote.filterType,
      sanitizerType: quote.chlorinationMethod,
      screenedArea: quote.enclosure,
      poolCondition: quote.poolCondition,
      usageFrequency: quote.useFrequency,
      petSwimFrequency: quote.petSwimFrequency || 'never',
      monthlyServiceAmount: quote.estimatedMonthlyPrice
    });

    // Log analytics
    await base44.asServiceRole.entities.AnalyticsEvent.create({
      eventType: 'LeadCreated',
      leadId: newLead.id,
      source: 'client_app',
      metadata: {
        trigger: 'quote_completed',
        quote_id: quoteId
      },
      timestamp: new Date().toISOString()
    });

    return Response.json({
      success: true,
      leadId: newLead.id,
      isNew: true
    });

  } catch (error) {
    console.error('Create lead from quote error:', error);
    return Response.json(
      { error: error.message || 'Failed to create lead' },
      { status: 500 }
    );
  }
});