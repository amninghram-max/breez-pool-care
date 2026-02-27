import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * scheduleInspectionByToken
 * Passwordless inspection scheduling (token-gated).
 *
 * Params: { scheduleToken, requestedDate, requestedTimeSlot }
 * - Validates token via validateScheduleToken
 * - Creates CalendarEvent
 * - Sets scheduleTokenUsedAt=now (idempotent via token check)
 * - Returns confirmation with assigned inspector
 *
 * Never accepts quoteId alone — token-only flow.
 */

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { scheduleToken, requestedDate, requestedTimeSlot } = await req.json();

    if (!scheduleToken) {
      return Response.json({ error: 'scheduleToken required' }, { status: 400 });
    }

    // Validate token via helper (or inline validation)
    const quotes = await base44.asServiceRole.entities.Quote.filter(
      { scheduleToken },
      '-created_date',
      1
    );

    if (!quotes || quotes.length === 0) {
      return Response.json({ error: 'Invalid token' }, { status: 401 });
    }

    const quote = quotes[0];
    const now = new Date().toISOString();

    // Token validation checks
    if (quote.scheduleTokenUsedAt) {
      return Response.json({ error: 'Token already used — inspection already scheduled' }, { status: 401 });
    }

    if (quote.scheduleTokenRevokedAt) {
      return Response.json({ error: 'Token revoked' }, { status: 401 });
    }

    if (quote.scheduleTokenExpiresAt && now > quote.scheduleTokenExpiresAt) {
      return Response.json({ error: 'Token expired' }, { status: 401 });
    }

    // Load or create Lead
    let lead = null;
    if (quote.clientEmail) {
      const leads = await base44.asServiceRole.entities.Lead.filter(
        { email: quote.clientEmail },
        '-created_date',
        1
      );
      lead = leads?.[0];

      if (!lead) {
        lead = await base44.asServiceRole.entities.Lead.create({
          firstName: quote.clientFirstName || 'Customer',
          lastName: quote.clientLastName || '',
          email: quote.clientEmail,
          mobilePhone: quote.clientPhone || '',
          acceptedQuoteId: quote.id,
          stage: 'inspection_scheduled',
          isEligible: true,
          quoteGenerated: true
        });
        console.log(`✅ Lead created from quote token: leadId=${lead.id}, email=${quote.clientEmail}`);
      }
    }

    if (!lead) {
      return Response.json({ error: 'Unable to locate or create lead' }, { status: 400 });
    }

    // Create CalendarEvent
    const serviceAddress = lead.serviceAddress || `${lead.streetAddress}, ${lead.city}, ${lead.state} ${lead.zipCode}`;

    const event = await base44.asServiceRole.entities.CalendarEvent.create({
      leadId: lead.id,
      eventType: 'inspection',
      scheduledDate: requestedDate || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      timeWindow: requestedTimeSlot || 'morning',
      startTime: '09:00',
      endTime: '10:00',
      estimatedDuration: 60,
      assignedTechnician: lead.assignedInspector || 'Matt',
      status: 'scheduled',
      serviceAddress,
      accessNotes: lead.gateCode ? `Gate code: ${lead.gateCode}` : '',
      customerNotes: lead.notes || ''
    });

    // Mark token as used
    await base44.asServiceRole.entities.Quote.update(quote.id, {
      scheduleTokenUsedAt: now
    });

    // Update Lead
    await base44.asServiceRole.entities.Lead.update(lead.id, {
      inspectionScheduled: true,
      inspectionEventId: event.id,
      confirmedInspectionDate: new Date(requestedDate || event.scheduledDate).toISOString(),
      stage: 'inspection_scheduled'
    });

    console.log(`✅ Inspection scheduled: leadId=${lead.id}, quoteId=${quote.id}, eventId=${event.id}, date=${event.scheduledDate}, tokenMarkedUsed`);

    return Response.json({
      success: true,
      leadId: lead.id,
      quoteId: quote.id,
      eventId: event.id,
      scheduledDate: event.scheduledDate,
      assignedInspector: event.assignedTechnician,
      inspectorPhoto: lead.inspectorPhoto || null,
      confirmationMessage: `Your pool inspection is confirmed for ${event.scheduledDate}. ${event.assignedTechnician} will meet you then.`
    });
  } catch (error) {
    console.error('scheduleInspectionByToken error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});