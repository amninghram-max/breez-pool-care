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
      confirmedUsageFrequency: confirmedUsageFrequency || null,
      greenSeverity: confirmedPoolCondition === 'green' ? (greenSeverity || null) : null,
      equipmentNotes: equipmentNotes || null,
      techNotes: techNotes || null,
      photoBefore: photoBefore || [],
      finalizationStatus: 'pending_finalization',
      appointmentStatus: 'completed',
      // Chemistry readings
      ...(freeChlorine ? { freeChlorineAtInspection: parseFloat(freeChlorine) } : {}),
      ...(pH ? { pHAtInspection: parseFloat(pH) } : {}),
      ...(totalAlkalinity ? { totalAlkalinityAtInspection: parseFloat(totalAlkalinity) } : {}),
      ...(salt ? { saltAtInspection: parseFloat(salt) } : {}),
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

    // Advance lead stage and save access instructions to customer profile
    const lead = await base44.asServiceRole.entities.Lead.get(leadId);
    const advancedStages = ['quote_sent', 'converted', 'lost'];
    const leadUpdate = {};
    if (!advancedStages.includes(lead?.stage || '')) {
      leadUpdate.stage = 'inspection_confirmed';
    }
    if (accessInstructions) {
      leadUpdate.gateCode = accessInstructions;
    }
    if (Object.keys(leadUpdate).length > 0) {
      await base44.asServiceRole.entities.Lead.update(leadId, leadUpdate);
    }

    // Also mark any open inspection CalendarEvent for this lead as completed (in case calendarEventId wasn't passed)
    if (!calendarEventId) {
      const openEvents = await base44.asServiceRole.entities.CalendarEvent.filter(
        { leadId, eventType: 'inspection', status: 'scheduled' }, '-created_date', 5
      );
      if (openEvents?.length > 0) {
        for (const ev of openEvents) {
          await base44.asServiceRole.entities.CalendarEvent.update(ev.id, {
            status: 'completed',
            completedAt: new Date().toISOString(),
          });
        }
      }
    }

    // Build a quick price snapshot based on the confirmed inspection data + existing quote
    let priceSnapshot = null;
    try {
      const quotes = await base44.asServiceRole.entities.Quote.filter({ clientEmail: lead?.email }, '-created_date', 1);
      const latestQuote = quotes?.[0];
      if (latestQuote) {
        // Map confirmed chlorination back
        const sanitizer = confirmedChlorinationMethod === 'saltwater' ? 'saltwater' : 'tablets';
        const invokeResult = await base44.asServiceRole.functions.invoke('calculateQuoteOnly', {
          questionnaireData: {
            poolSize: confirmedPoolSize || latestQuote.inputPoolSize,
            poolType: confirmedPoolType || latestQuote.inputPoolType,
            spaPresent: confirmedSpaPresent ? 'true' : 'false',
            enclosure: confirmedEnclosure || latestQuote.inputEnclosure,
            treesOverhead: confirmedTreesOverhead || latestQuote.inputTreesOverhead,
            filterType: confirmedFilterType || latestQuote.inputFilterType,
            chlorinationMethod: confirmedChlorinationMethod || latestQuote.inputChlorinationMethod || 'tablets',
            chlorinatorType: latestQuote.inputChlorinatorType || 'n/a',
            useFrequency: confirmedUsageFrequency || latestQuote.inputUseFrequency || 'weekends',
            petsAccess: latestQuote.inputPetsAccess || false,
            petSwimFrequency: latestQuote.inputPetSwimFrequency || 'never',
            poolCondition: confirmedPoolCondition || 'clear',
            greenPoolSeverity: (confirmedPoolCondition === 'green' || confirmedPoolCondition === 'green_algae') ? (greenSeverity || 'moderate') : null,
          }
        });
        const quote = invokeResult?.data?.quote || invokeResult?.quote;
        if (quote) {
          // Force weekly frequency for inspection snapshot — admins can manually escalate based on chemical trends
          const weeklyPrice = (quote.finalMonthlyPrice / quote.frequencyMultiplier) * 1.0; // Normalize to weekly
          priceSnapshot = {
            monthly: weeklyPrice,
            frequency: 'weekly',
            oneTimeFees: quote.estimatedOneTimeFees,
            outputMonthlyPrice: weeklyPrice,
            outputFrequency: 'weekly',
            outputOneTimeFees: quote.estimatedOneTimeFees,
          };
        } else {
          priceSnapshot = null;
        }
      }
    } catch (e) {
      console.warn('[submitInspection] priceSnapshot failed (non-fatal):', e.message);
    }

    console.log(`[submitInspection] Success: recordId=${record.id}, leadId=${leadId}, by=${user.email}`);

    return Response.json({ success: true, inspectionRecordId: record.id, priceSnapshot });
  } catch (error) {
    console.error('[submitInspection] error:', error.message, error?.data || '');
    return Response.json({ error: error.message }, { status: 500 });
  }
});