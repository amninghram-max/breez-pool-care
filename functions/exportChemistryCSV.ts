import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { propertyId } = await req.json();

    const visits = await base44.asServiceRole.entities.ServiceVisit.filter(
      { propertyId },
      '-visitDate'
    );

    // Generate CSV
    const headers = [
      'Date',
      'Technician',
      'FC (ppm)',
      'pH',
      'TA (ppm)',
      'CYA (ppm)',
      'Temp (F)',
      'Liquid Chlorine (gal)',
      'Acid (gal)',
      'Baking Soda (lbs)',
      'Notes'
    ];

    const rows = visits.map(v => [
      new Date(v.visitDate).toLocaleDateString(),
      v.technicianName,
      v.freeChlorine,
      v.pH,
      v.totalAlkalinity,
      v.cyanuricAcid || '',
      v.waterTemp || '',
      v.chemicalsAdded?.liquidChlorine || '',
      v.chemicalsAdded?.acid || '',
      v.chemicalsAdded?.bakingSoda || '',
      v.notes || ''
    ]);

    const csv = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    return Response.json({
      success: true,
      csv
    });
  } catch (error) {
    console.error('Export CSV error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});