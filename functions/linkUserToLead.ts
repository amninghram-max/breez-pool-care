import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const { userId, leadId } = await req.json();

    if (!userId || !leadId) {
      return Response.json({ error: 'userId and leadId are required' }, { status: 400 });
    }

    // Verify Lead exists
    const lead = await base44.asServiceRole.entities.Lead.get(leadId);
    if (!lead) {
      return Response.json({ error: 'Lead not found' }, { status: 404 });
    }

    // Verify User exists
    const targetUser = await base44.asServiceRole.entities.User.get(userId);
    if (!targetUser) {
      return Response.json({ error: 'User not found' }, { status: 404 });
    }

    // Build update payload — only set role to 'customer' if role is empty/undefined
    const updatePayload = { linkedLeadId: leadId };
    if (!targetUser.role || targetUser.role === '') {
      updatePayload.role = 'customer';
    }

    await base44.asServiceRole.entities.User.update(userId, updatePayload);

    return Response.json({ success: true, userId, leadId });
  } catch (error) {
    console.error('linkUserToLead error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});