import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    const { leadId, inspectionDate, inspectionTime, assignedTechnicianId } = await req.json();

    if (!leadId) {
      return Response.json({ error: 'Lead ID required' }, { status: 400 });
    }

    if (!inspectionDate) {
      return Response.json({ error: 'Inspection date required' }, { status: 400 });
    }

    // Get lead
    const lead = await base44.asServiceRole.entities.Lead.get(leadId);

    if (!lead) {
      return Response.json({ error: 'Lead not found' }, { status: 404 });
    }

    // PIPELINE INTEGRITY: Create CalendarEvent FIRST
    // Only advance stage to inspection_scheduled after CalendarEvent exists
    let inspectionEvent;
    try {
      inspectionEvent = await base44.asServiceRole.entities.CalendarEvent.create({
        leadId: leadId,
        eventType: 'inspection',
        scheduledDate: inspectionDate,
        timeWindow: inspectionTime || '',
        assignedTechnician: assignedTechnicianId || null,
        status: 'scheduled',
        serviceAddress: lead.serviceAddress || ''
      });
    } catch (eventError) {
      console.error('CalendarEvent creation failed:', eventError);
      return Response.json(
        { error: 'Failed to create inspection calendar event. Stage not updated.' },
        { status: 500 }
      );
    }

    // CalendarEvent created successfully — now update lead
    await base44.asServiceRole.entities.Lead.update(leadId, {
      inspectionScheduled: true,
      requestedInspectionDate: inspectionDate,
      requestedInspectionTime: inspectionTime || '',
      stage: 'inspection_scheduled',
      inspectionEventId: inspectionEvent.id
    });

    // Log analytics
    try {
      await base44.asServiceRole.entities.AnalyticsEvent.create({
        eventType: 'InspectionScheduled',
        leadId: leadId,
        source: 'client_app',
        metadata: {
          requested_date: inspectionDate,
          requested_time: inspectionTime,
          calendar_event_id: inspectionEvent.id
        },
        timestamp: new Date().toISOString()
      });
    } catch (analyticsError) {
      console.error('Analytics log failed (non-fatal):', analyticsError);
    }

    return Response.json({
      success: true,
      leadId: leadId,
      inspectionEventId: inspectionEvent.id
    });

  } catch (error) {
    console.error('Create lead from inspection error:', error);
    return Response.json(
      { error: error.message || 'Failed to update lead with inspection' },
      { status: 500 }
    );
  }
});