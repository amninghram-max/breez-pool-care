import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { propertyId } = await req.json();

    // Get recent visits
    const visits = await base44.asServiceRole.entities.ServiceVisit.filter(
      { propertyId },
      '-visitDate',
      10
    );

    if (visits.length < 3) {
      return Response.json({ insights: [] });
    }

    const insights = [];

    // Check pH trend
    const recentPH = visits.slice(0, 4).map(v => v.pH);
    if (recentPH.every((val, i, arr) => i === 0 || val > arr[i - 1])) {
      insights.push({
        title: 'pH drifting upward',
        description: 'pH has increased over the last 4 visits. Monitor acid additions.',
        severity: 'warning'
      });
    }

    // Check FC frequently low
    const targetsResult = await base44.asServiceRole.entities.ChemistryTargets.filter({
      settingKey: 'default'
    });
    const targets = targetsResult[0] || {};

    if (targets.freeChlorine) {
      const lowFCCount = visits.filter(v => v.freeChlorine < targets.freeChlorine.min).length;
      if (lowFCCount >= 3) {
        insights.push({
          title: 'FC frequently below target',
          description: `Free chlorine below ${targets.freeChlorine.min} ppm in ${lowFCCount} recent visits. Consider weekly service or larger chlorine additions.`,
          severity: 'high'
        });
      }
    }

    // Check CYA rising
    const recentCYA = visits.filter(v => v.cyanuricAcid).slice(0, 4).map(v => v.cyanuricAcid);
    if (recentCYA.length >= 3 && recentCYA.every((val, i, arr) => i === 0 || val > arr[i - 1])) {
      insights.push({
        title: 'CYA rising steadily',
        description: 'Stabilizer increasing over time (possible tablet overuse). May need partial drain.',
        severity: 'warning'
      });
    }

    // Limit to 3 insights
    return Response.json({
      success: true,
      insights: insights.slice(0, 3)
    });
  } catch (error) {
    console.error('Calculate insights error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});