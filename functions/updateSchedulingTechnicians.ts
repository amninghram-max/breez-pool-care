import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

const BUILD = 'updateSchedulingTechnicians-v1';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Forbidden: admin role required' }, { status: 403 });
    }

    const body = await req.json();
    const { technicians } = body;

    if (!Array.isArray(technicians)) {
      return Response.json({ error: 'technicians must be an array' }, { status: 400 });
    }

    // Normalize and validate each technician entry
    const normalized = [];
    for (let i = 0; i < technicians.length; i++) {
      const t = technicians[i];
      const name = typeof t.name === 'string' ? t.name.trim() : '';
      if (!name) {
        return Response.json({ error: `Technician at index ${i} is missing a name` }, { status: 400 });
      }
      normalized.push({
        name,
        email: typeof t.email === 'string' ? t.email.trim() : '',
        phone: typeof t.phone === 'string' ? t.phone.trim() : '',
        active: t.active !== false, // default true
      });
    }

    // Find existing default SchedulingSettings record
    const existing = await base44.asServiceRole.entities.SchedulingSettings.filter({ settingKey: 'default' });
    let saved;

    if (existing && existing.length > 0) {
      // Update only the technicians field on the existing record
      saved = await base44.asServiceRole.entities.SchedulingSettings.update(existing[0].id, {
        technicians: normalized,
      });
    } else {
      // Create the default record with the technicians array
      saved = await base44.asServiceRole.entities.SchedulingSettings.create({
        settingKey: 'default',
        technicians: normalized,
      });
    }

    return Response.json({
      success: true,
      build: BUILD,
      record: saved,
    });
  } catch (error) {
    console.error('[updateSchedulingTechnicians] error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});