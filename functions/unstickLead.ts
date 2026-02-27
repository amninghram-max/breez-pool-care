import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// Admin-only: unstick a lead from inspection_scheduled
// Actions: reset_stage, mark_not_scheduled, archive, force_create_event

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (user?.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    const { leadId, action, targetStage, inspectionDate, inspectionTime, assignedTechnicianId } = await req.json();

    if (!leadId || !action) {
      return Response.json({ error: 'leadId and action required' }, { status: 400 });
    }

    const lead = await base44.asServiceRole.entities.Lead.get(leadId);
    if (!lead) {
      return Response.json({ error: 'Lead not found' }, { status: 404 });
    }

    const auditPrefix = `[${new Date().toISOString()}] Admin ${user.email}:`;
    let auditNote = '';
    let updateData = {};

    if (action === 'reset_stage') {
      const allowedStages = ['new_lead', 'contacted'];
      const newStage = allowedStages.includes(targetStage) ? targetStage : 'contacted';
      auditNote = `${auditPrefix} UNSTICK reset_stage → ${newStage}.`;
      updateData = {
        stage: newStage,
        inspectionScheduled: false,
        inspectionEventId: null,
        notes: lead.notes ? `${lead.notes}\n${auditNote}` : auditNote
      };

    } else if (action === 'mark_not_scheduled') {
      auditNote = `${auditPrefix} UNSTICK mark_not_scheduled — cleared inspection data, returned to contacted.`;
      updateData = {
        stage: 'contacted',
        inspectionScheduled: false,
        inspectionEventId: null,
        requestedInspectionDate: null,
        requestedInspectionTime: null,
        notes: lead.notes ? `${lead.notes}\n${auditNote}` : auditNote
      };

    } else if (action === 'archive') {
      auditNote = `${auditPrefix} UNSTICK archive — lead soft-archived.`;
      updateData = {
        stage: 'lost',
        lostReason: `Archived by admin (unstick). Previous stage: ${lead.stage}`,
        notes: lead.notes ? `${lead.notes}\n${auditNote}` : auditNote
      };

    } else if (action === 'force_create_event') {
      if (!inspectionDate) {
        return Response.json({ error: 'inspectionDate required for force_create_event' }, { status: 400 });
      }

      // Cancel any existing stale inspection events for this lead
      const existingEvents = await base44.asServiceRole.entities.CalendarEvent.filter({
        leadId: leadId,
        eventType: 'inspection'
      });
      for (const ev of existingEvents) {
        if (ev.status === 'scheduled') {
          await base44.asServiceRole.entities.CalendarEvent.update(ev.id, { status: 'cancelled' });
        }
      }

      // Create new CalendarEvent
      const newEvent = await base44.asServiceRole.entities.CalendarEvent.create({
        leadId: leadId,
        eventType: 'inspection',
        scheduledDate: inspectionDate,
        timeWindow: inspectionTime || '',
        assignedTechnician: assignedTechnicianId || null,
        status: 'scheduled',
        serviceAddress: lead.serviceAddress || ''
      });

      auditNote = `${auditPrefix} UNSTICK force_create_event — new CalendarEvent ${newEvent.id} on ${inspectionDate}.`;
      updateData = {
        stage: 'inspection_scheduled',
        inspectionScheduled: true,
        inspectionEventId: newEvent.id,
        requestedInspectionDate: inspectionDate,
        requestedInspectionTime: inspectionTime || '',
        notes: lead.notes ? `${lead.notes}\n${auditNote}` : auditNote
      };

    } else {
      return Response.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }

    await base44.asServiceRole.entities.Lead.update(leadId, updateData);

    return Response.json({
      success: true,
      leadId,
      action,
      auditNote
    });

  } catch (error) {
    console.error('Unstick lead error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});