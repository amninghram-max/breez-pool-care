import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * finalizeInspection
 * Admin (always) or technician with canFinalizeInspections=true.
 * Sets locked monthly rate, optional green-to-clean fee, and outcome.
 * 
 * If outcome = new_customer: sends final quote email with agreement link.
 * If outcome = open_lead: marks lead as open for follow-up.
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Permission check: admin always, or technician/staff with canFinalizeInspections flag
    const isAdmin = user.role === 'admin';
    const isAuthorizedFinalizer = (user.role === 'technician' || user.role === 'staff') && user.canFinalizeInspections === true;

    if (!isAdmin && !isAuthorizedFinalizer) {
      return Response.json({ error: 'Forbidden: Admin or Inspection Finalizer permission required' }, { status: 403 });
    }

    const {
      inspectionRecordId,
      lockedMonthlyRate,
      lockedFrequency,
      greenToCleanFee,
      finalizationNotes,
      outcome, // 'new_customer' | 'open_lead'
    } = await req.json();

    if (!inspectionRecordId || !lockedMonthlyRate || !outcome) {
      return Response.json({ error: 'inspectionRecordId, lockedMonthlyRate, and outcome required' }, { status: 400 });
    }

    if (!['new_customer', 'open_lead'].includes(outcome)) {
      return Response.json({ error: 'outcome must be new_customer or open_lead' }, { status: 400 });
    }

    const record = await base44.asServiceRole.entities.InspectionRecord.get(inspectionRecordId);
    if (!record) {
      return Response.json({ error: 'InspectionRecord not found' }, { status: 404 });
    }
    if (record.finalizationStatus === 'finalized') {
      return Response.json({ error: 'Already finalized' }, { status: 409 });
    }

    const now = new Date().toISOString();
    const cleanedGreenFee = parseFloat(greenToCleanFee) || 0;
    const cleanedRate = parseFloat(lockedMonthlyRate);

    // Update inspection record
    await base44.asServiceRole.entities.InspectionRecord.update(inspectionRecordId, {
      finalizationStatus: 'finalized',
      finalizedByUserId: user.id,
      finalizedByName: user.full_name || user.email,
      finalizedAt: now,
      lockedMonthlyRate: cleanedRate,
      lockedFrequency: lockedFrequency || 'weekly',
      greenToCleanFee: cleanedGreenFee,
      finalizationNotes: finalizationNotes || '',
      outcome,
    });

    const lead = await base44.asServiceRole.entities.Lead.get(record.leadId);
    if (!lead) {
      return Response.json({ error: 'Lead not found' }, { status: 404 });
    }

    if (outcome === 'new_customer') {
      // Update lead: store locked pricing, advance stage to quote_sent
      await base44.asServiceRole.entities.Lead.update(record.leadId, {
        stage: 'quote_sent',
        monthlyServiceAmount: cleanedRate,
      });

      // Send final quote email with agreement link
      await base44.asServiceRole.functions.invoke('sendFinalQuoteEmail', {
        inspectionRecordId,
        leadId: record.leadId,
      });

      console.log(`✅ Finalized as new_customer: inspectionId=${inspectionRecordId}, leadId=${record.leadId}`);
      return Response.json({ success: true, outcome: 'new_customer', inspectionRecordId });

    } else {
      // Open lead: keep for follow-up
      await base44.asServiceRole.entities.Lead.update(record.leadId, {
        stage: 'contacted',
      });

      console.log(`✅ Finalized as open_lead: inspectionId=${inspectionRecordId}, leadId=${record.leadId}`);
      return Response.json({ success: true, outcome: 'open_lead', inspectionRecordId });
    }
  } catch (error) {
    console.error('finalizeInspection error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});