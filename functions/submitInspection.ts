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

    // Create immutable inspection record
    const record = await base44.asServiceRole.entities.InspectionRecord.create({
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