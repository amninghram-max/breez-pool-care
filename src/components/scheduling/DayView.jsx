import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Clock, MapPin, User, Navigation, Lock, Edit, Plus, GripVertical, CalendarDays } from 'lucide-react';
import EventDetailsModal from './EventDetailsModal';
import CreateServiceEventModal from './CreateServiceEventModal';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';

// Droppable ID prefixes
const TECH_PREFIX = 'tech::';
const DATE_PREFIX = 'date::';

const makeTechDropId = (technician) => `${TECH_PREFIX}${technician}`;
const makeDateDropId = (dateStr) => `${DATE_PREFIX}${dateStr}`;

// Generate ±3 weekdays (Mon-Sat) around a given dateStr for cross-day targets
function getNearbyDates(dateStr) {
  const base = new Date(dateStr + 'T00:00:00');
  const results = [];
  let offset = -3;
  while (results.length < 7 && offset <= 7) {
    const d = new Date(base);
    d.setDate(base.getDate() + offset);
    const dow = d.getDay();
    if (dow !== 0) { // exclude Sundays
      const s = d.toISOString().split('T')[0];
      if (s !== dateStr) results.push(s);
      if (results.length === 6) break;
    }
    offset++;
  }
  return results;
}

const isDraggable = (event) =>
  event.eventType === 'service' &&
  event.isFixed !== true &&
  event.status === 'scheduled';

export default function DayView({ date, technicianFilter, userRole }) {
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [showCancelled, setShowCancelled] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [dragError, setDragError] = useState(null);
  const [showDateTargets, setShowDateTargets] = useState(false);
  const [selectedEventIds, setSelectedEventIds] = useState(new Set());
  const [bulkAssignTech, setBulkAssignTech] = useState('');
  const [bulkError, setBulkError] = useState(null);
  const queryClient = useQueryClient();
  const dateStr = date.toISOString().split('T')[0];
  const nearbyDates = React.useMemo(() => getNearbyDates(dateStr), [dateStr]);

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

  const moveMutation = useMutation({
    mutationFn: ({ eventId, assignedTechnician, scheduledDate }) =>
      base44.functions.invoke('updateCalendarEventAdmin', {
        eventId,
        ...(assignedTechnician !== undefined ? { assignedTechnician } : {}),
        ...(scheduledDate !== undefined ? { scheduledDate } : {}),
      }),
    onSuccess: () => {
      setDragError(null);
      setShowDateTargets(false);
      queryClient.invalidateQueries({ queryKey: ['calendarEvents'] });
    },
    onError: (err) => {
      setDragError(err?.response?.data?.error || err?.message || 'Move failed');
    }
  });

  const reorderMutation = useMutation({
    mutationFn: ({ technician, orderedEventIds }) =>
      base44.functions.invoke('reorderRouteEvents', {
        date: dateStr,
        technician,
        orderedEventIds,
      }),
    onSuccess: () => {
      setDragError(null);
      queryClient.invalidateQueries({ queryKey: ['calendarEvents'] });
    },
    onError: (err) => {
      setDragError(err?.response?.data?.error || err?.message || 'Reorder failed');
    }
  });

  const handleDragEnd = (result) => {
    const { draggableId, source, destination } = result;
    setShowDateTargets(false);
    if (!destination) return;

    const event = events.find(e => e.id === draggableId);
    if (!event || !isDraggable(event)) return;

    const destId = destination.droppableId;
    const srcId = source.droppableId;

    // Same-column reorder
    if (destId === srcId && destId.startsWith(TECH_PREFIX)) {
      if (source.index === destination.index) return; // no-op
      const technician = destId.slice(TECH_PREFIX.length);
      const techEvents = eventsByTechnician[technician] || [];
      // Build reordered eligible ID list for this column
      const reordered = Array.from(techEvents.map(e => e.id));
      reordered.splice(source.index, 1);
      reordered.splice(destination.index, 0, draggableId);
      reorderMutation.mutate({ technician, orderedEventIds: reordered });
      return;
    }

    if (destId.startsWith(DATE_PREFIX)) {
      // Cross-day move
      const destDate = destId.slice(DATE_PREFIX.length);
      if (destDate === event.scheduledDate) return; // no-op
      moveMutation.mutate({ eventId: draggableId, scheduledDate: destDate });
    } else if (destId.startsWith(TECH_PREFIX)) {
      // Same-day cross-technician reassignment
      const destTech = destId.slice(TECH_PREFIX.length);
      if (destTech === event.assignedTechnician) return; // no-op
      moveMutation.mutate({ eventId: draggableId, assignedTechnician: destTech });
    }
  };

  const handleDragStart = () => {
    setShowDateTargets(true);
    setDragError(null);
  };

  // Build lead map — must be called unconditionally before any early returns
  const leadMap = React.useMemo(() => {
    const m = {};
    for (const l of leads) m[l.id] = l;
    return m;
  }, [leads]);

  // Build eventsByTechnician unconditionally so handleDragEnd can reference it
  const eventsByTechnician = React.useMemo(() => {
    const map = {};
    events.forEach(event => {
      if (event.status === 'cancelled' && !showCancelled) return;
      const lead = leadMap[event.leadId];
      if (lead?.isDeleted) return;
      const tech = event.assignedTechnician || 'Unassigned';
      if (!map[tech]) map[tech] = [];
      map[tech].push(event);
    });
    return map;
  }, [events, leadMap, showCancelled]);

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-12 text-center">
          <p className="text-gray-600">Loading schedule...</p>
        </CardContent>
      </Card>
    );
  }

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

      {dragError && (
        <div className="mb-3 px-4 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {dragError}
        </div>
      )}

      <DragDropContext onDragEnd={handleDragEnd} onDragStart={handleDragStart}>
        {/* Cross-day drop targets — shown only while dragging an eligible event */}
        {showDateTargets && (
          <div className="mb-4 p-3 border border-dashed border-teal-300 rounded-lg bg-teal-50">
            <div className="flex items-center gap-2 mb-2 text-xs text-teal-700 font-medium">
              <CalendarDays className="w-4 h-4" />
              Move to another day
            </div>
            <div className="flex flex-wrap gap-2">
              {nearbyDates.map(d => (
                <Droppable key={d} droppableId={makeDateDropId(d)}>
                  {(prov, snap) => (
                    <div
                      ref={prov.innerRef}
                      {...prov.droppableProps}
                      className={`px-3 py-2 rounded-md border text-xs font-medium min-w-[90px] text-center transition-colors
                        ${snap.isDraggingOver
                          ? 'bg-teal-600 text-white border-teal-600'
                          : 'bg-white text-teal-700 border-teal-300 hover:bg-teal-100'}`}
                    >
                      {new Date(d + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                      {prov.placeholder}
                    </div>
                  )}
                </Droppable>
              ))}
            </div>
          </div>
        )}

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
                  <Droppable droppableId={makeTechDropId(technician)}>
                    {(provided, snapshot) => (
                      <div
                        className={`space-y-3 min-h-[2px] rounded-lg transition-colors ${snapshot.isDraggingOver ? 'bg-teal-50' : ''}`}
                        ref={provided.innerRef}
                        {...provided.droppableProps}
                      >
                        {techEvents.map((event, idx) => {
                          const eventType = getEventTypeIcon(event.eventType);
                          const draggable = isDraggable(event);
                          return (
                            <Draggable
                              key={event.id}
                              draggableId={event.id}
                              index={idx}
                              isDragDisabled={!draggable}
                            >
                              {(dragProvided, dragSnapshot) => (
                                <div
                                  ref={dragProvided.innerRef}
                                  {...dragProvided.draggableProps}
                                  className={`flex items-start gap-4 p-4 border rounded-lg transition-colors
                                    ${dragSnapshot.isDragging ? 'shadow-lg border-teal-400 bg-white' : 'hover:bg-gray-50'}
                                    ${draggable ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'}
                                  `}
                                  onClick={() => setSelectedEvent(event)}
                                >
                                  {/* Drag handle — only for eligible events */}
                                  <div
                                    {...(draggable ? dragProvided.dragHandleProps : {})}
                                    className={`flex items-center self-center ${draggable ? 'text-gray-400 hover:text-teal-500' : 'invisible pointer-events-none'}`}
                                    onClick={e => e.stopPropagation()}
                                  >
                                    <GripVertical className="w-4 h-4" />
                                  </div>

                                  {/* Position */}
                                  <div className="flex items-center justify-center w-8 h-8 rounded-full bg-teal-100 text-teal-700 font-bold text-sm flex-shrink-0">
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
                              )}
                            </Draggable>
                          );
                        })}
                        {provided.placeholder}
                      </div>
                    )}
                  </Droppable>

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
      </DragDropContext>

      {selectedEvent && (
        <EventDetailsModal
          event={selectedEvent}
          onClose={() => setSelectedEvent(null)}
        />
      )}
    </>
  );
}