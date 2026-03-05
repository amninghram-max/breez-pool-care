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
      priceSnapshot, // Optional: pre-calculated snapshot from submitInspection
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
      // Update lead with verified inspection inputs, store locked pricing, advance stage to quote_sent
      const inspectionData = await base44.asServiceRole.entities.InspectionRecord.get(inspectionRecordId);
      const leadUpdateData = {
        stage: 'quote_sent',
        monthlyServiceAmount: cleanedRate,
      };
      
      // Overwrite pool questions with confirmed inspection inputs
      if (inspectionData?.confirmedPoolType) leadUpdateData.poolType = inspectionData.confirmedPoolType;
      if (inspectionData?.confirmedFilterType) leadUpdateData.filterType = inspectionData.confirmedFilterType;
      if (inspectionData?.confirmedEnclosure) leadUpdateData.screenedArea = inspectionData.confirmedEnclosure;
      if (inspectionData?.confirmedTreesOverhead) leadUpdateData.treesOverhead = inspectionData.confirmedTreesOverhead;
      if (inspectionData?.confirmedUsageFrequency) leadUpdateData.usageFrequency = inspectionData.confirmedUsageFrequency;
      if (inspectionData?.confirmedPoolCondition) leadUpdateData.poolCondition = inspectionData.confirmedPoolCondition;
      // Map simplified chlorination back to sanitizerType
      if (inspectionData?.confirmedChlorinationMethod === 'saltwater') leadUpdateData.sanitizerType = 'saltwater';
      else if (inspectionData?.confirmedChlorinationMethod === 'regular_chlorine') leadUpdateData.sanitizerType = 'tablets';
      
      // Ensure stage progresses forward (new_customer flow typically goes to converted)
      const curStage = lead.stage || 'new_lead';
      if (curStage !== 'quote_sent') {
        leadUpdateData.stage = 'quote_sent';
        console.log(`FI_STAGE_PROGRESSED_NEW_CUSTOMER: ${curStage} -> quote_sent`);
      }
      await base44.asServiceRole.entities.Lead.update(record.leadId, leadUpdateData);

       // Send final quote email with agreement link (pass priceSnapshot if available)
       await base44.asServiceRole.functions.invoke('sendFinalQuoteEmail', {
         inspectionRecordId,
         leadId: record.leadId,
         priceSnapshot,
       });

       console.log(`✅ Finalized as new_customer: inspectionId=${inspectionRecordId}, leadId=${record.leadId}, stage=${leadUpdateData.stage}`);
       return Response.json({ success: true, outcome: 'new_customer', inspectionRecordId });

    } else {
      // Open lead: keep for follow-up
      // Ensure stage transitions forward or stays at inspection_scheduled
      const leadUpdate = {};
      const curStage = lead.stage || 'new_lead';
      if (curStage === 'inspection_scheduled' || curStage === 'inspection_confirmed') {
        // Already at or past inspection_scheduled; stay there or move forward to inspection_confirmed
        leadUpdate.stage = 'inspection_confirmed';
        console.log(`FI_STAGE_PROGRESSED_OPEN_LEAD: ${curStage} -> inspection_confirmed`);
      } else {
        // For other stages, be conservative: don't regress
        leadUpdate.stage = Math.max(curStage, 'inspection_confirmed') > curStage ? 'inspection_confirmed' : curStage;
        console.log(`FI_STAGE_NO_REGRESSION_OPEN_LEAD: ${curStage} unchanged`);
      }
      await base44.asServiceRole.entities.Lead.update(record.leadId, leadUpdate);

      console.log(`✅ Finalized as open_lead: inspectionId=${inspectionRecordId}, leadId=${record.leadId}, stage=${leadUpdate.stage}`);
      return Response.json({ success: true, outcome: 'open_lead', inspectionRecordId });
    }
  } catch (error) {
    console.error('finalizeInspection error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});