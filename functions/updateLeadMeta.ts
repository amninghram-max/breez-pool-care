import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    // Require admin/staff role
    if (!user || !['admin', 'staff'].includes(user.role)) {
      return Response.json(
        { error: 'Forbidden: Admin/Staff access required' },
        { status: 403 }
      );
    }

    const { leadId, email, noteTag, noteText } = await req.json();

    // Validate required fields
    if (!leadId) {
      return Response.json({ error: 'leadId is required' }, { status: 400 });
    }
    if (!noteTag) {
      return Response.json({ error: 'noteTag is required' }, { status: 400 });
    }

    // Load lead
    const lead = await base44.asServiceRole.entities.Lead.get(leadId);
    if (!lead) {
      return Response.json({ error: 'Lead not found' }, { status: 404 });
    }
    if (lead.isDeleted) {
      return Response.json(
        { error: 'Lead has been deleted' },
        { status: 410 }
      );
    }

    const updated = { email: false, notes: false };
    const updateData = {};

    // Update email if provided and different
    if (email && email !== lead.email) {
      updateData.email = email;
      updated.email = true;
    }

    // Append to notes with timestamp
    const timestamp = new Date().toISOString();
    const newNote = `[${noteTag}] ${timestamp}${noteText ? ' — ' + noteText : ''}`;
    const existingNotes = lead.notes || '';
    updateData.notes = existingNotes ? existingNotes + '\n' + newNote : newNote;
    updated.notes = true;

    // Perform update
    await base44.asServiceRole.entities.Lead.update(leadId, updateData);

    return Response.json({
      success: true,
      leadId,
      updated
    });
  } catch (error) {
    console.error('updateLeadMeta error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});