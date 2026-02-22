import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    const { eventType, leadId, technicianName, source, metadata, amount } = await req.json();

    // Get lead details if provided
    let city, zipCode;
    if (leadId) {
      try {
        const lead = await base44.asServiceRole.entities.Lead.get(leadId);
        if (lead) {
          city = lead.city;
          zipCode = lead.zipCode;
        }
      } catch (e) {
        console.warn('Could not fetch lead details:', e);
      }
    }

    // Create analytics event
    const event = await base44.asServiceRole.entities.AnalyticsEvent.create({
      eventType,
      leadId: leadId || null,
      technicianName: technicianName || null,
      source: source || 'system',
      region: 'Space Coast',
      metadata: metadata || {},
      city: city || null,
      zipCode: zipCode || null,
      amount: amount || null,
      timestamp: new Date().toISOString()
    });

    return Response.json({
      success: true,
      eventId: event.id
    });

  } catch (error) {
    console.error('Log analytics event error:', error);
    return Response.json({ 
      error: error.message || 'Failed to log event'
    }, { status: 500 });
  }
});