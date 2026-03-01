import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    // Admin-only endpoint
    if (user?.role !== 'admin') {
      return Response.json({ success: false, error: 'FORBIDDEN', message: 'Admin access required' }, { status: 403 });
    }

    const { leadId } = await req.json();

    if (!leadId) {
      return Response.json({ success: false, error: 'INVALID_INPUT', message: 'leadId is required' }, { status: 400 });
    }

    // Load lead via service role
    const leads = await base44.asServiceRole.entities.Lead.list();
    const lead = leads.find(l => l.id === leadId);

    if (!lead) {
      return Response.json({ success: false, error: 'NOT_FOUND', message: 'Lead not found' }, { status: 404 });
    }

    // Only NEW leads can be deleted
    if (lead.stage !== 'new_lead') {
      return Response.json(
        {
          success: false,
          error: 'DELETE_NOT_ALLOWED',
          message: 'Only NEW leads can be deleted. Use Mark Lost instead.'
        },
        { status: 400 }
      );
    }

    // Delete lead permanently
    await base44.asServiceRole.entities.Lead.delete(leadId);

    console.log('🗑️ Lead deleted permanently:', { leadId, email: lead.email, firstName: lead.firstName });

    return Response.json({ success: true });
  } catch (error) {
    console.error('❌ deleteNewLeadPermanently error:', error.message);
    return Response.json({ success: false, error: 'SERVER_ERROR', message: error.message }, { status: 500 });
  }
});