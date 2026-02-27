import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// Admin-only repair function:
// Finds leads in inspection_scheduled with no valid CalendarEvent and resets them.
// Enforces invariant: inspection_scheduled implies a scheduled CalendarEvent exists.

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (user?.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    // Find all inspection_scheduled leads
    const leads = await base44.asServiceRole.entities.Lead.filter({
      stage: 'inspection_scheduled'
    });

    console.log(`Found ${leads.length} leads in inspection_scheduled`);

    const results = {
      checked: leads.length,
      intact: [],
      repaired: [],
      errors: []
    };

    for (const lead of leads) {
      try {
        // Check for a valid CalendarEvent
        const events = await base44.asServiceRole.entities.CalendarEvent.filter({
          leadId: lead.id,
          eventType: 'inspection'
        });

        const validEvent = events.find(e =>
          e.scheduledDate && ['scheduled', 'en_route', 'arrived', 'in_progress'].includes(e.status)
        );

        if (validEvent) {
          // Ensure inspectionEventId is linked
          if (!lead.inspectionEventId) {
            await base44.asServiceRole.entities.Lead.update(lead.id, {
              inspectionEventId: validEvent.id
            });
          }
          results.intact.push({ leadId: lead.id, eventId: validEvent.id });
        } else {
          // No valid event — reset to contacted (or new_lead if never contacted)
          const resetStage = lead.lastContactedAt ? 'contacted' : 'new_lead';
          const auditNote = `[${new Date().toISOString()}] AUTO-REPAIR by ${user.email}: Reset from inspection_scheduled to ${resetStage} — no valid CalendarEvent found.`;

          await base44.asServiceRole.entities.Lead.update(lead.id, {
            stage: resetStage,
            inspectionScheduled: false,
            inspectionEventId: null,
            notes: lead.notes ? `${lead.notes}\n${auditNote}` : auditNote
          });

          results.repaired.push({
            leadId: lead.id,
            name: `${lead.firstName} ${lead.lastName}`,
            resetTo: resetStage
          });
          console.log(`Repaired lead ${lead.id} (${lead.firstName} ${lead.lastName}) → ${resetStage}`);
        }
      } catch (leadError) {
        console.error(`Error processing lead ${lead.id}:`, leadError);
        results.errors.push({ leadId: lead.id, error: leadError.message });
      }
    }

    return Response.json({
      success: true,
      summary: {
        checked: results.checked,
        intact: results.intact.length,
        repaired: results.repaired.length,
        errors: results.errors.length
      },
      repaired: results.repaired,
      errors: results.errors
    });

  } catch (error) {
    console.error('Repair function error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});