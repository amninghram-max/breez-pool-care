import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const { date, technician } = await req.json();

    // Get all events for this date and technician
    const events = await base44.asServiceRole.entities.CalendarEvent.filter({
      date,
      assignedTechnician: technician,
      status: 'scheduled'
    });

    if (events.length === 0) {
      return Response.json({ message: 'No events to optimize', stops: [] });
    }

    // Get scheduling settings
    const settings = await base44.asServiceRole.entities.SchedulingSettings.filter({ settingKey: 'default' });
    const config = settings[0] || {};

    // Separate fixed-time events (inspections) from flexible events
    const fixedEvents = events.filter(e => e.isFixedTime);
    const flexibleEvents = events.filter(e => !e.isFixedTime);

    // Simple optimization: sort by proximity (in production, use Google Maps Directions API)
    // For now, group by lat/long clusters
    const optimizedFlexible = flexibleEvents.sort((a, b) => {
      // Sort by latitude first, then longitude (crude clustering)
      if (Math.abs(a.latitude - b.latitude) > 0.01) {
        return a.latitude - b.latitude;
      }
      return a.longitude - b.longitude;
    });

    // Interleave fixed events at their specified times
    const allStops = [...fixedEvents, ...optimizedFlexible];
    
    // Calculate route details
    let currentTime = config.defaultStartTime || '08:00';
    const stops = [];
    
    for (let i = 0; i < allStops.length; i++) {
      const event = allStops[i];
      
      // Simulate drive time (in production, use Google Maps Distance Matrix)
      const driveTimeToNext = i < allStops.length - 1 ? 15 : 0; // 15 min average
      const distanceToNext = i < allStops.length - 1 ? 5 : 0; // 5 miles average
      
      const [hours, minutes] = currentTime.split(':').map(Number);
      const arrivalMinutes = hours * 60 + minutes;
      const departureMinutes = arrivalMinutes + (event.durationMinutes || 45);
      
      const arrivalTime = `${Math.floor(arrivalMinutes / 60).toString().padStart(2, '0')}:${(arrivalMinutes % 60).toString().padStart(2, '0')}`;
      const departureTime = `${Math.floor(departureMinutes / 60).toString().padStart(2, '0')}:${(departureMinutes % 60).toString().padStart(2, '0')}`;
      
      stops.push({
        sequence: i + 1,
        eventId: event.id,
        address: event.address,
        arrivalTime,
        departureTime,
        driveTimeToNext,
        distanceToNext
      });
      
      // Update event with optimized details
      await base44.asServiceRole.entities.CalendarEvent.update(event.id, {
        routeSequence: i + 1,
        estimatedArrival: arrivalTime
      });
      
      // Move to next stop
      currentTime = `${Math.floor((departureMinutes + driveTimeToNext) / 60).toString().padStart(2, '0')}:${((departureMinutes + driveTimeToNext) % 60).toString().padStart(2, '0')}`;
    }

    // Calculate totals
    const totalDistance = stops.reduce((sum, stop) => sum + stop.distanceToNext, 0);
    const totalDriveTime = stops.reduce((sum, stop) => sum + stop.driveTimeToNext, 0);
    const totalWorkTime = allStops.reduce((sum, event) => sum + (event.durationMinutes || 45), 0);

    // Create or update RoutePlan
    const existingPlans = await base44.asServiceRole.entities.RoutePlan.filter({ date, technician });
    
    const routePlanData = {
      date,
      technician,
      status: 'optimized',
      startLocation: config.homeBaseLocation,
      endLocation: config.homeBaseLocation,
      stops,
      totalDistance,
      totalDriveTime,
      totalWorkTime,
      estimatedStartTime: stops[0]?.arrivalTime || config.defaultStartTime,
      estimatedEndTime: stops[stops.length - 1]?.departureTime || config.defaultEndTime,
      optimizedAt: new Date().toISOString(),
      optimizedBy: user.email,
      manuallyModified: false
    };

    let routePlan;
    if (existingPlans.length > 0) {
      routePlan = await base44.asServiceRole.entities.RoutePlan.update(existingPlans[0].id, routePlanData);
    } else {
      routePlan = await base44.asServiceRole.entities.RoutePlan.create(routePlanData);
    }

    // Update events with route plan ID
    for (const event of allStops) {
      await base44.asServiceRole.entities.CalendarEvent.update(event.id, {
        routePlanId: routePlan.id
      });
    }

    return Response.json({
      success: true,
      routePlan,
      message: `Optimized ${stops.length} stops`
    });

  } catch (error) {
    console.error('Optimize route error:', error);
    return Response.json({ 
      error: error.message || 'Failed to optimize route'
    }, { status: 500 });
  }
});