import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Clock, MapPin, User, Navigation, Lock, Edit, Plus, GripVertical } from 'lucide-react';
import EventDetailsModal from './EventDetailsModal';
import CreateServiceEventModal from './CreateServiceEventModal';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';

const isDraggable = (event) =>
  event.eventType === 'service' &&
  event.isFixed !== true &&
  event.status === 'scheduled';

export default function DayView({ date, technicianFilter, userRole }) {
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [showCancelled, setShowCancelled] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [dragError, setDragError] = useState(null);
  const queryClient = useQueryClient();
  const dateStr = date.toISOString().split('T')[0];

  const { data: events = [], isLoading } = useQuery({
    queryKey: ['calendarEvents', dateStr, technicianFilter],
    queryFn: async () => {
      const query = { scheduledDate: dateStr };
      if (technicianFilter && technicianFilter !== 'all') {
        query.assignedTechnician = technicianFilter;
      }
      const result = await base44.entities.CalendarEvent.filter(query);
      return result.sort((a, b) => (a.routePosition || 0) - (b.routePosition || 0));
    }
  });

  const { data: leads = [] } = useQuery({
    queryKey: ['leads-slim'],
    queryFn: () => base44.entities.Lead.list('-created_date', 200),
  });

  const { data: settings } = useQuery({
    queryKey: ['schedulingSettings'],
    queryFn: async () => {
      const result = await base44.entities.SchedulingSettings.filter({ settingKey: 'default' });
      return result[0] || {};
    }
  });

  // Build lead map — must be called unconditionally before any early returns
  const leadMap = React.useMemo(() => {
    const m = {};
    for (const l of leads) m[l.id] = l;
    return m;
  }, [leads]);

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-12 text-center">
          <p className="text-gray-600">Loading schedule...</p>
        </CardContent>
      </Card>
    );
  }

  // Group events by technician, filtering cancelled + deleted leads
  const eventsByTechnician = {};
  events.forEach(event => {
    // Skip cancelled events unless toggled
    if (event.status === 'cancelled' && !showCancelled) return;
    
    // Skip events for deleted leads
    const lead = leadMap[event.leadId];
    if (lead?.isDeleted) return;
    
    const tech = event.assignedTechnician || 'Unassigned';
    if (!eventsByTechnician[tech]) {
      eventsByTechnician[tech] = [];
    }
    eventsByTechnician[tech].push(event);
  });

  const getStatusBadge = (status) => {
    const configs = {
      scheduled: { label: 'Scheduled', className: 'bg-blue-100 text-blue-800' },
      en_route: { label: 'En Route', className: 'bg-purple-100 text-purple-800' },
      arrived: { label: 'Arrived', className: 'bg-indigo-100 text-indigo-800' },
      in_progress: { label: 'In Progress', className: 'bg-yellow-100 text-yellow-800' },
      completed: { label: 'Completed', className: 'bg-green-100 text-green-800' },
      could_not_access: { label: 'Could Not Access', className: 'bg-red-100 text-red-800' },
      needs_reschedule: { label: 'Needs Reschedule', className: 'bg-orange-100 text-orange-800' },
      storm_impacted: { label: 'Storm Impacted', className: 'bg-gray-100 text-gray-800' }
    };
    const config = configs[status] || configs.scheduled;
    return <Badge className={config.className}>{config.label}</Badge>;
  };

  const getEventTypeIcon = (type) => {
    const configs = {
      service: { icon: '🏊', label: 'Service' },
      inspection: { icon: '🔍', label: 'Inspection' },
      cleanup: { icon: '🧹', label: 'Cleanup' },
      green_recovery: { icon: '🌱', label: 'Recovery' }
    };
    return configs[type] || configs.service;
  };

  return (
    <>
      {/* Admin: Add single service event */}
      {userRole === 'admin' && (
        <div className="flex justify-end mb-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowCreateModal(true)}
            className="border-teal-300 text-teal-700 hover:bg-teal-50"
          >
            <Plus className="w-4 h-4 mr-1" />
            Add Service Event
          </Button>
        </div>
      )}

      {showCreateModal && (
        <CreateServiceEventModal
          date={date}
          onClose={() => setShowCreateModal(false)}
        />
      )}

      {/* Show cancelled toggle */}
      <div className="flex items-center justify-end mb-4">
        <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer hover:text-gray-900">
          <input
            type="checkbox"
            checked={showCancelled}
            onChange={(e) => setShowCancelled(e.target.checked)}
            className="rounded border-gray-300"
          />
          Show cancelled events
        </label>
      </div>

      <div className="space-y-6">
        {Object.keys(eventsByTechnician).length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center">
              <Clock className="w-16 h-16 mx-auto mb-4 text-gray-400" />
              <p className="text-gray-600">No scheduled events for this date</p>
            </CardContent>
          </Card>
        ) : (
          Object.entries(eventsByTechnician).map(([technician, techEvents]) => (
            <Card key={technician}>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <User className="w-5 h-5 text-teal-600" />
                    {technician}
                  </span>
                  <span className="text-sm font-normal text-gray-600">
                    {techEvents.length} stops
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {techEvents.map((event, idx) => {
                    const eventType = getEventTypeIcon(event.eventType);
                    return (
                      <div
                        key={event.id}
                        className="flex items-start gap-4 p-4 border rounded-lg hover:bg-gray-50 cursor-pointer transition-colors"
                        onClick={() => setSelectedEvent(event)}
                      >
                        {/* Position */}
                        <div className="flex items-center justify-center w-8 h-8 rounded-full bg-teal-100 text-teal-700 font-bold text-sm">
                          {event.routePosition || idx + 1}
                        </div>

                        {/* Event Details */}
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-lg">{eventType.icon}</span>
                            <span className="font-medium">{event.serviceAddress}</span>
                            {event.isFixed && (
                              <Lock className="w-4 h-4 text-gray-400" title="Fixed position" />
                            )}
                          </div>
                          
                          <div className="text-sm text-gray-600 space-y-1">
                            {event.timeWindow && (
                              <div className="flex items-center gap-2">
                                <Clock className="w-4 h-4" />
                                {event.timeWindow}
                              </div>
                            )}
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{eventType.label}</span>
                              <span>•</span>
                              <span>{event.estimatedDuration} min</span>
                            </div>
                            {event.drivingTimeToNext > 0 && (
                              <div className="flex items-center gap-2 text-teal-600">
                                <Navigation className="w-4 h-4" />
                                {event.drivingTimeToNext} min to next stop ({event.drivingDistanceToNext?.toFixed(1)} mi)
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Status */}
                        <div className="flex flex-col items-end gap-2">
                          {getStatusBadge(event.status)}
                          <Button size="sm" variant="ghost" onClick={(e) => {
                            e.stopPropagation();
                            setSelectedEvent(event);
                          }}>
                            <Edit className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Route Summary */}
                <div className="mt-4 pt-4 border-t">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">Total route time:</span>
                    <span className="font-semibold">
                      {techEvents.reduce((sum, e) => sum + (e.estimatedDuration || 0) + (e.drivingTimeToNext || 0), 0)} min
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm mt-1">
                    <span className="text-gray-600">Total distance:</span>
                    <span className="font-semibold">
                      {techEvents.reduce((sum, e) => sum + (e.drivingDistanceToNext || 0), 0).toFixed(1)} mi
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {selectedEvent && (
        <EventDetailsModal
          event={selectedEvent}
          onClose={() => setSelectedEvent(null)}
        />
      )}
    </>
  );
}