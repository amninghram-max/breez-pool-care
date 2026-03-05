import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

/**
 * getPublicInspectionDetails
 * Public endpoint: returns current scheduled inspection details for a lead (by token or leadId).
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { leadId, token } = await req.json();

    let resolvedLeadId = leadId;

    // If only token provided, resolve to leadId
    if (!resolvedLeadId && token) {
      try {
        const requests = await base44.asServiceRole.entities.QuoteRequests.filter({ token: token.trim() }, null, 1);
        resolvedLeadId = requests?.[0]?.leadId || null;
        if (!resolvedLeadId) {
          const quotes = await base44.asServiceRole.entities.Quote.filter({ quoteToken: token.trim() }, '-created_date', 1);
          resolvedLeadId = quotes?.[0]?.leadId || null;
        }
      } catch (e) {}
    }

    if (!resolvedLeadId) {
      return Response.json({ success: false, error: 'Could not resolve lead' }, { status: 400 });
    }

    const inspections = await base44.asServiceRole.entities.InspectionRecord.filter(
      { leadId: resolvedLeadId, appointmentStatus: { $ne: 'cancelled' } },
      '-created_date',
      1
    );
    const inspection = inspections?.[0];

    if (!inspection) {
      return Response.json({ success: true, found: false });
    }

    return Response.json({
      success: true,
      found: true,
      scheduledDate: inspection.scheduledDate,
      timeWindow: inspection.timeWindow,
      startTime: inspection.startTime
    });
  } catch (error) {
    console.error('getPublicInspectionDetails error:', error);
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
});