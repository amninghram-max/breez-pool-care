import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * schedulePublicInspection
 * Public (no auth required). Called from the landing page or quote result flow.
 *
 * Params: { leadId, clientEmail, clientFirstName, requestedDate, requestedTimeSlot }
 * - Upserts Lead stage to inspection_scheduled
 * - Creates CalendarEvent of type 'inspection'
 * - Sends confirmation email with what-to-expect info
 */

Deno.serve(async (req) => {
  const headers = { 'Content-Type': 'application/json' };
  try {
    const base44 = createClientFromRequest(req);
    const { leadId, clientEmail, clientFirstName, requestedDate, requestedTimeSlot } = await req.json();

    if (!clientEmail || !requestedDate || !requestedTimeSlot) {
      return new Response(JSON.stringify({ error: 'clientEmail, requestedDate, and requestedTimeSlot are required' }), { status: 400, headers });
    }

    // ── Find lead ──
    let lead = null;
    if (leadId) {
      lead = await base44.asServiceRole.entities.Lead.get(leadId).catch(() => null);
    }
    if (!lead && clientEmail) {
      const rows = await base44.asServiceRole.entities.Lead.filter({ email: clientEmail }, '-created_date', 1);
      lead = rows[0] || null;
    }
    if (!lead) {
      // Create minimal lead if none exists
      lead = await base44.asServiceRole.entities.Lead.create({
        firstName: clientFirstName || 'Customer',
        email: clientEmail,
        stage: 'new_lead',
        quoteGenerated: false,
      });
    }

    const firstName = clientFirstName || lead.firstName || 'Customer';

    // ── Time slot → display string ──
    const slotLabels = {
      morning:   '8:00 AM – 11:00 AM',
      midday:    '11:00 AM – 2:00 PM',
      afternoon: '2:00 PM – 5:00 PM',
    };
    const timeDisplay = slotLabels[requestedTimeSlot] || requestedTimeSlot;

    // ── Create CalendarEvent ──
    const serviceAddress = lead.serviceAddress || (lead.streetAddress ? `${lead.streetAddress}, ${lead.city || ''}, ${lead.state || 'FL'} ${lead.zipCode || ''}`.trim() : 'To be confirmed at inspection');

    const event = await base44.asServiceRole.entities.CalendarEvent.create({
      leadId: lead.id,
      eventType: 'inspection',
      scheduledDate: requestedDate,
      timeWindow: timeDisplay,
      startTime: requestedTimeSlot === 'morning' ? '08:00' : requestedTimeSlot === 'midday' ? '11:00' : '14:00',
      endTime: requestedTimeSlot === 'morning' ? '11:00' : requestedTimeSlot === 'midday' ? '14:00' : '17:00',
      estimatedDuration: 30,
      assignedTechnician: lead.assignedInspector || 'Matt',
      status: 'scheduled',
      serviceAddress,
    });

    // ── Update Lead ──
    await base44.asServiceRole.entities.Lead.update(lead.id, {
      inspectionScheduled: true,
      inspectionEventId: event.id,
      confirmedInspectionDate: new Date(requestedDate + 'T00:00:00').toISOString(),
      confirmedInspectionTimeWindow: timeDisplay,
      stage: 'inspection_scheduled',
    });

    // ── Send confirmation email via centralized function ──
    try {
      await base44.functions.invoke('sendInspectionConfirmation', {
        leadId: lead.id,
        force: false
      });
    } catch (e) {
      console.warn('Confirmation email failed (non-blocking):', e.message);
    }

    return new Response(JSON.stringify({
      success: true,
      eventId: event.id,
      leadId: lead.id,
      scheduledDate: requestedDate,
      timeWindow: timeDisplay,
      assignedTechnician: event.assignedTechnician,
    }), { status: 200, headers });

  } catch (error) {
    console.error('schedulePublicInspection error:', error.message, error.stack);
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers });
  }
});