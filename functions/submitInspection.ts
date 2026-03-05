import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

/**
 * submitInspection
 * Technician submits inspection data → creates immutable InspectionRecord.
 * Marks CalendarEvent as completed and Lead stage as inspection_confirmed.
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const allowedRoles = ['admin', 'staff', 'technician'];
    if (!allowedRoles.includes(user.role)) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json();
    const {
      leadId,
      calendarEventId,
      confirmedPoolSize,
      confirmedPoolType,
      confirmedEnclosure,
      confirmedFilterType,
      confirmedChlorinationMethod,
      confirmedSpaPresent,
      confirmedTreesOverhead,
      confirmedPoolCondition,
      confirmedUsageFrequency,
      greenSeverity,
      equipmentNotes,
      techNotes,
      photoBefore,
      accessInstructions,
      freeChlorine,
      pH,
      totalAlkalinity,
      salt,
    } = body;

    if (!leadId || !confirmedPoolCondition) {
      return Response.json({ error: 'leadId and confirmedPoolCondition required' }, { status: 400 });
    }

    // Look up scheduling fields from existing InspectionRecord or CalendarEvent
    let scheduledDate = new Date().toISOString().split('T')[0];
    let startTime = '09:00';
    let timeWindow = 'Morning (8:00 AM - 11:00 AM)';

    const existingRecords = await base44.asServiceRole.entities.InspectionRecord.filter({ leadId }, '-created_date', 5);
    // Find the most recent scheduled (not submitted) record
    const scheduledRecord = existingRecords?.find(r => r.scheduledDate && r.finalizationStatus !== 'finalized');
    if (scheduledRecord) {
      scheduledDate = scheduledRecord.scheduledDate || scheduledDate;
      startTime = scheduledRecord.startTime || startTime;
      timeWindow = scheduledRecord.timeWindow || timeWindow;
    } else {
      // Fall back to CalendarEvent
      const events = await base44.asServiceRole.entities.CalendarEvent.filter(
        { leadId, eventType: 'inspection' }, '-created_date', 1
      );
      if (events?.length > 0) {
        scheduledDate = events[0].scheduledDate || scheduledDate;
        startTime = events[0].startTime || startTime;
        timeWindow = events[0].timeWindow || timeWindow;
      }
    }

    const recordData = {
      leadId,
      scheduledDate,
      startTime,
      timeWindow,
      calendarEventId: calendarEventId || null,
      submittedByUserId: user.id,
      submittedByName: user.full_name || user.email,
      submittedAt: new Date().toISOString(),
      confirmedPoolSize: confirmedPoolSize || null,
      confirmedPoolType: confirmedPoolType || null,
      confirmedEnclosure: confirmedEnclosure || null,
      confirmedFilterType: confirmedFilterType || null,
      confirmedChlorinationMethod: confirmedChlorinationMethod || null,
      confirmedSpaPresent: confirmedSpaPresent === true,
      confirmedTreesOverhead: confirmedTreesOverhead || null,
      confirmedPoolCondition,
      greenSeverity: confirmedPoolCondition === 'green' ? (greenSeverity || null) : null,
      equipmentNotes: equipmentNotes || null,
      techNotes: techNotes || null,
      photoBefore: photoBefore || [],
      customerPresent: customerPresent !== false,
      finalizationStatus: 'pending_finalization',
      appointmentStatus: 'completed',
    };

    console.log('[submitInspection] Creating record for leadId:', leadId, 'by:', user.email, 'role:', user.role);

    const record = await base44.asServiceRole.entities.InspectionRecord.create(recordData);
    console.log('[submitInspection] Created InspectionRecord, id:', record.id);

    // Mark calendar event completed
    if (calendarEventId) {
      await base44.asServiceRole.entities.CalendarEvent.update(calendarEventId, {
        status: 'completed',
        completedAt: new Date().toISOString(),
      });
    }

    // Advance lead stage to inspection_confirmed (only if not already further along)
    const lead = await base44.asServiceRole.entities.Lead.get(leadId);
    const advancedStages = ['quote_sent', 'converted', 'lost'];
    if (lead && !advancedStages.includes(lead.stage)) {
      await base44.asServiceRole.entities.Lead.update(leadId, {
        stage: 'inspection_confirmed',
      });
    }

    console.log(`[submitInspection] Success: recordId=${record.id}, leadId=${leadId}, by=${user.email}`);

    return Response.json({ success: true, inspectionRecordId: record.id });
  } catch (error) {
    console.error('[submitInspection] error:', error.message, error?.data || '');
    return Response.json({ error: error.message }, { status: 500 });
  }
});