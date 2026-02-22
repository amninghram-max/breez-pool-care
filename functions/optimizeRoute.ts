import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const { date, technicianName } = await req.json();

    // Get scheduling settings
    const settings = await base44.asServiceRole.entities.SchedulingSettings.filter({ settingKey: 'default' });
    const config = settings[0] || {};

    // Get all events for this date and technician
    const events = await base44.asServiceRole.entities.CalendarEvent.filter({
      scheduledDate: date,
      assignedTechnician: technicianName,
      status: 'scheduled'
    });

    if (events.length === 0) {
      return Response.json({ success: true, message: 'No events to optimize' });
    }

    // Separate fixed and flexible events
    const fixedEvents = events.filter(e => e.isFixed);
    const flexibleEvents = events.filter(e => !e.isFixed);

    const apiKey = Deno.env.get('GOOGLE_MAPS_API_KEY');
    if (!apiKey) {
      return Response.json({ error: 'Google Maps API key not configured' }, { status: 500 });
    }

    // Build waypoints for Distance Matrix API
    const startLocation = config.technicianStartLocation || { latitude: 0, longitude: 0 };
    const waypoints = flexibleEvents.map(e => `${e.latitude},${e.longitude}`);

    if (waypoints.length === 0) {
      // Only fixed events, just update route positions
      let position = 1;
      for (const event of fixedEvents.sort((a, b) => (a.routePosition || 0) - (b.routePosition || 0))) {
        await base44.asServiceRole.entities.CalendarEvent.update(event.id, {
          routePosition: position++
        });
      }
      return Response.json({ success: true, optimizedCount: 0 });
    }

    // Use Google Distance Matrix API for all pairwise distances
    const origins = [
      `${startLocation.latitude},${startLocation.longitude}`,
      ...waypoints
    ];
    const destinations = waypoints;

    const distanceUrl = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${origins.join('|')}&destinations=${destinations.join('|')}&key=${apiKey}`;
    
    const distanceResponse = await fetch(distanceUrl);
    const distanceData = await distanceResponse.json();

    if (distanceData.status !== 'OK') {
      return Response.json({ 
        error: 'Distance Matrix API error',
        details: distanceData.status 
      }, { status: 400 });
    }

    // Simple nearest-neighbor optimization
    const optimizedOrder = [];
    const unvisited = [...flexibleEvents];
    let currentPosition = 0; // Start from tech start location

    while (unvisited.length > 0) {
      let nearestIndex = 0;
      let shortestTime = Infinity;

      for (let i = 0; i < unvisited.length; i++) {
        const eventIndex = flexibleEvents.indexOf(unvisited[i]);
        const element = distanceData.rows[currentPosition]?.elements?.[eventIndex];
        
        if (element && element.status === 'OK') {
          const travelTime = element.duration.value / 60; // Convert to minutes
          if (travelTime < shortestTime) {
            shortestTime = travelTime;
            nearestIndex = i;
          }
        }
      }

      const nextStop = unvisited.splice(nearestIndex, 1)[0];
      optimizedOrder.push(nextStop);
      currentPosition = flexibleEvents.indexOf(nextStop) + 1; // +1 because origins includes start location
    }

    // Update route positions and travel times
    let position = 1;
    
    // Handle fixed events first (if any)
    const sortedFixed = fixedEvents.sort((a, b) => (a.routePosition || 0) - (b.routePosition || 0));
    for (const event of sortedFixed) {
      await base44.asServiceRole.entities.CalendarEvent.update(event.id, {
        routePosition: position++
      });
    }

    // Update optimized flexible events
    for (let i = 0; i < optimizedOrder.length; i++) {
      const event = optimizedOrder[i];
      const updates = {
        routePosition: position++
      };

      // Calculate drive time to next stop
      if (i < optimizedOrder.length - 1) {
        const currentIdx = flexibleEvents.indexOf(event);
        const nextIdx = flexibleEvents.indexOf(optimizedOrder[i + 1]);
        const element = distanceData.rows[currentIdx + 1]?.elements?.[nextIdx];

        if (element && element.status === 'OK') {
          updates.drivingTimeToNext = Math.round(element.duration.value / 60);
          updates.drivingDistanceToNext = Math.round(element.distance.value / 1609.34 * 10) / 10; // Convert meters to miles
        }
      }

      await base44.asServiceRole.entities.CalendarEvent.update(event.id, updates);
    }

    return Response.json({
      success: true,
      optimizedCount: optimizedOrder.length,
      totalStops: events.length
    });

  } catch (error) {
    console.error('Optimize route error:', error);
    return Response.json({ 
      error: error.message || 'Failed to optimize route'
    }, { status: 500 });
  }
});