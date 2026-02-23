import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    const { leadId, inspectionDate, inspectionTime } = await req.json();

    if (!leadId) {
      return Response.json({ error: 'Lead ID required' }, { status: 400 });
    }

    // Get lead
    const lead = await base44.asServiceRole.entities.Lead.get(leadId);

    if (!lead) {
      return Response.json({ error: 'Lead not found' }, { status: 404 });
    }

    // Update lead with inspection info
    await base44.asServiceRole.entities.Lead.update(leadId, {
      inspectionScheduled: true,
      requestedInspectionDate: inspectionDate,
      requestedInspectionTime: inspectionTime,
      stage: 'inspection_scheduled'
    });

    // Log analytics
    await base44.asServiceRole.entities.AnalyticsEvent.create({
      eventType: 'InspectionScheduled',
      leadId: leadId,
      source: 'client_app',
      metadata: {
        requested_date: inspectionDate,
        requested_time: inspectionTime
      },
      timestamp: new Date().toISOString()
    });

    return Response.json({
      success: true,
      leadId: leadId
    });

  } catch (error) {
    console.error('Create lead from inspection error:', error);
    return Response.json(
      { error: error.message || 'Failed to update lead with inspection' },
      { status: 500 }
    );
  }
});