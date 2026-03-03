import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

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
      greenSeverity,
      equipmentNotes,
      techNotes,
      photoBefore,
      customerPresent,
    } = await req.json();

    if (!leadId || !confirmedPoolCondition) {
      return Response.json({ error: 'leadId and confirmedPoolCondition required' }, { status: 400 });
    }

    // Look up existing InspectionRecord for this lead to get required scheduling fields
    let scheduledDate = new Date().toISOString().split('T')[0];
    let startTime = '09:00';
    let timeWindow = 'Morning (8:00 AM – 11:00 AM)';

    const existingRecords = await base44.asServiceRole.entities.InspectionRecord.filter({ leadId }, '-created_date', 1);
    if (existingRecords?.length > 0) {
      const existing = existingRecords[0];
      scheduledDate = existing.scheduledDate || scheduledDate;
      startTime = existing.startTime || startTime;
      timeWindow = existing.timeWindow || timeWindow;
    } else if (calendarEventId) {
      // Fall back to calendar event if available
      const events = await base44.asServiceRole.entities.CalendarEvent.filter({ leadId }, '-created_date', 1);
      if (events?.length > 0) {
        scheduledDate = events[0].scheduledDate || scheduledDate;
        startTime = events[0].startTime || startTime;
        timeWindow = events[0].timeWindow || timeWindow;
      }
    }

    // Create immutable inspection record (use user-scoped client since user is authenticated as allowed role)
    const record = await base44.entities.InspectionRecord.create({
      scheduledDate,
      startTime,
      timeWindow,
      leadId,
      calendarEventId: calendarEventId || null,
      submittedByUserId: user.id,
      submittedByName: user.full_name || user.email,
      submittedAt: new Date().toISOString(),
      confirmedPoolSize,
      confirmedPoolType,
      confirmedEnclosure,
      confirmedFilterType,
      confirmedChlorinationMethod,
      confirmedSpaPresent,
      confirmedTreesOverhead,
      confirmedPoolCondition,
      greenSeverity: confirmedPoolCondition === 'green' ? greenSeverity : null,
      equipmentNotes,
      techNotes,
      photoBefore: photoBefore || [],
      customerPresent: customerPresent !== false,
      finalizationStatus: 'pending_finalization',
    });

    // Mark calendar event completed
    if (calendarEventId) {
      await base44.asServiceRole.entities.CalendarEvent.update(calendarEventId, {
        status: 'completed',
        completedAt: new Date().toISOString(),
      });
    }

    // Advance lead stage to inspection_confirmed
    await base44.asServiceRole.entities.Lead.update(leadId, {
      stage: 'inspection_confirmed',
    });

    console.log(`✅ Inspection submitted: recordId=${record.id}, leadId=${leadId}, by=${user.email}`);

    return Response.json({ success: true, inspectionRecordId: record.id });
  } catch (error) {
    console.error('submitInspection error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});