import React, { useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { createPageUrl } from '@/utils';
import { User, MapPin, Clock, AlertTriangle, X } from 'lucide-react';

const EVENT_TYPE_STYLES = {
  inspection:     { badge: 'bg-green-100 text-green-800',  cell: 'border-l-2 border-green-400' },
  service:        { badge: 'bg-blue-100 text-blue-800',    cell: 'border-l-2 border-blue-400' },
  cleanup:        { badge: 'bg-gray-100 text-gray-700',    cell: 'border-l-2 border-gray-400' },
  green_recovery: { badge: 'bg-orange-100 text-orange-800', cell: 'border-l-2 border-orange-400' },
};

function getEventStyle(eventType) {
  return EVENT_TYPE_STYLES[eventType] || EVENT_TYPE_STYLES.service;
}

const STATUS_LABELS = {
  scheduled: { label: 'Scheduled', className: 'bg-blue-100 text-blue-800' },
  en_route: { label: 'En Route', className: 'bg-purple-100 text-purple-800' },
  arrived: { label: 'Arrived', className: 'bg-indigo-100 text-indigo-800' },
  in_progress: { label: 'In Progress', className: 'bg-yellow-100 text-yellow-800' },
  completed: { label: 'Completed', className: 'bg-green-100 text-green-800' },
  could_not_access: { label: 'Could Not Access', className: 'bg-red-100 text-red-800' },
  needs_reschedule: { label: 'Needs Reschedule', className: 'bg-orange-100 text-orange-800' },
  storm_impacted: { label: 'Storm Impacted', className: 'bg-gray-100 text-gray-800' },
  cancelled: { label: 'Cancelled', className: 'bg-gray-100 text-gray-500' },
};

function DayDetailModal({ dayStr, dayEvents, leadMap, onClose }) {
  // Group by assignedTechnician
  const byTech = useMemo(() => {
    const map = {};
    for (const e of dayEvents) {
      const tech = e.assignedTechnician || 'Unassigned';
      if (!map[tech]) map[tech] = [];
      map[tech].push(e);
    }
    // Sort each group by routePosition, then creation order
    for (const tech of Object.keys(map)) {
      map[tech].sort((a, b) => (a.routePosition || 999) - (b.routePosition || 999));
    }
    return map;
  }, [dayEvents]);

  const date = new Date(dayStr + 'T00:00:00');
  const dateLabel = date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between pr-6">
            <span>{dateLabel}</span>
            <Badge className="bg-gray-100 text-gray-700 text-sm font-normal">
              {dayEvents.length} stop{dayEvents.length !== 1 ? 's' : ''}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        {dayEvents.length === 0 ? (
          <p className="text-sm text-gray-500 py-4 text-center">No events scheduled for this day.</p>
        ) : (
          <div className="space-y-5 mt-2">
            {Object.entries(byTech).map(([tech, events]) => (
              <div key={tech}>
                {/* Technician header */}
                <div className="flex items-center gap-2 mb-2 pb-1 border-b border-gray-100">
                  <User className="w-4 h-4 text-teal-600" />
                  <span className="font-semibold text-sm text-gray-800">{tech}</span>
                  <span className="text-xs text-gray-400">{events.length} stop{events.length !== 1 ? 's' : ''}</span>
                </div>

                <div className="space-y-2">
                  {events.map(event => {
                    const lead = leadMap[event.leadId];
                    const customerName = lead
                      ? `${lead.firstName || ''}${lead.lastName ? ' ' + lead.lastName : ''}`.trim() || null
                      : null;
                    const style = getEventStyle(event.eventType);
                    const statusCfg = STATUS_LABELS[event.status] || STATUS_LABELS.scheduled;

                    return (
                      <div
                        key={event.id}
                        className={`p-3 rounded-lg bg-gray-50 ${style.cell}`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            {/* Name / address */}
                            <div className="font-medium text-sm text-gray-900 truncate">
                              {customerName || event.serviceAddress?.split(',')[0] || '—'}
                            </div>
                            {customerName && (
                              <div className="flex items-center gap-1 text-xs text-gray-500 mt-0.5 truncate">
                                <MapPin className="w-3 h-3 shrink-0" />
                                {event.serviceAddress}
                              </div>
                            )}

                            {/* Time window */}
                            {event.timeWindow && (
                              <div className="flex items-center gap-1 text-xs text-gray-500 mt-0.5">
                                <Clock className="w-3 h-3 shrink-0" />
                                {event.timeWindow}
                              </div>
                            )}
                          </div>

                          {/* Position badge */}
                          {event.routePosition && (
                            <span className="text-xs bg-teal-100 text-teal-700 font-bold rounded-full w-6 h-6 flex items-center justify-center shrink-0">
                              {event.routePosition}
                            </span>
                          )}
                        </div>

                        {/* Tags row */}
                        <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                          <Badge className={`text-xs px-1.5 py-0 ${style.badge}`}>
                            {event.eventType.replace('_', ' ')}
                          </Badge>
                          <Badge className={`text-xs px-1.5 py-0 ${statusCfg.className}`}>
                            {statusCfg.label}
                          </Badge>
                          {event.stormImpacted && (
                            <Badge className="text-xs px-1.5 py-0 bg-orange-100 text-orange-700 flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3" />
                              Storm
                            </Badge>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function MonthView({ startDate, technicianFilter }) {
  const [selectedDay, setSelectedDay] = useState(null);
  // Generate 28 days from startDate, filter out Sundays — same pattern as WeekView
  const visibleDays = Array.from({ length: 28 }, (_, i) => {
    const d = new Date(startDate);
    d.setDate(d.getDate() + i);
    return d;
  }).filter(d => d.getDay() !== 0);

  const minDate = visibleDays[0].toISOString().split('T')[0];
  const maxDate = visibleDays[visibleDays.length - 1].toISOString().split('T')[0];

  // Fetch all events for visible range in one query
  const { data: allEvents = [], isLoading: eventsLoading } = useQuery({
    queryKey: ['calendarEventsMonth', minDate, maxDate, technicianFilter],
    queryFn: async () => {
      const query = {};
      if (technicianFilter && technicianFilter !== 'all') {
        query.assignedTechnician = technicianFilter;
      }
      const result = await base44.entities.CalendarEvent.filter(query);
      return result.filter(e =>
        e.scheduledDate >= minDate &&
        e.scheduledDate <= maxDate &&
        e.status !== 'cancelled'
      );
    }
  });

  // Fetch leads once — same pattern as DayView/WeekView
  const { data: leads = [] } = useQuery({
    queryKey: ['leads-slim'],
    queryFn: () => base44.entities.Lead.list('-created_date', 200),
  });

  const leadMap = useMemo(() => {
    const m = {};
    for (const l of leads) m[l.id] = l;
    return m;
  }, [leads]);

  // Group events by scheduledDate
  const eventsByDay = useMemo(() => {
    const map = {};
    for (const event of allEvents) {
      if (!map[event.scheduledDate]) map[event.scheduledDate] = [];
      map[event.scheduledDate].push(event);
    }
    return map;
  }, [allEvents]);

  const todayStr = new Date().toISOString().split('T')[0];

  if (eventsLoading) {
    return (
      <Card>
        <CardContent className="p-12 text-center">
          <p className="text-gray-600">Loading month schedule…</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-6 gap-3">
        {visibleDays.map(day => {
          const dayStr = day.toISOString().split('T')[0];
          const dayEvents = eventsByDay[dayStr] || [];
          const isToday = dayStr === todayStr;
          const showStartRoute = technicianFilter && technicianFilter !== 'all';

          return (
            <Card
              key={dayStr}
              className={`min-h-[140px] cursor-pointer hover:shadow-md transition-shadow ${isToday ? 'border-teal-500 border-2' : ''}`}
              onClick={() => setSelectedDay(dayStr)}
            >
              <CardHeader className="pb-1 pt-3 px-3">
                <div className="flex items-start justify-between gap-1">
                  <div>
                    <div className="text-xs text-gray-500">
                      {day.toLocaleDateString('en-US', { weekday: 'short' })}
                    </div>
                    <div className={`text-base font-bold leading-tight ${isToday ? 'text-teal-600' : 'text-gray-900'}`}>
                      {day.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </div>
                  </div>
                  {dayEvents.length > 0 && (
                    <Badge className="bg-gray-100 text-gray-700 text-xs shrink-0">
                      {dayEvents.length}
                    </Badge>
                  )}
                </div>

                {showStartRoute && (
                  <a
                    href={createPageUrl(`TechnicianRoute?date=${dayStr}&technician=${encodeURIComponent(technicianFilter)}`)}
                    className="mt-1 block"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full text-xs h-7 border-teal-300 text-teal-700 hover:bg-teal-50"
                    >
                      Start Route
                    </Button>
                  </a>
                )}
              </CardHeader>

              <CardContent className="px-3 pb-3 pt-0 space-y-1">
                {dayEvents.length === 0 ? (
                  <p className="text-xs text-gray-400">No events</p>
                ) : (
                  <>
                    {dayEvents.slice(0, 2).map(event => {
                      const lead = leadMap[event.leadId];
                      const customerName = lead
                        ? `${lead.firstName || ''}${lead.lastName ? ' ' + lead.lastName : ''}`.trim()
                        : event.serviceAddress?.split(',')[0] || '—';
                      const style = getEventStyle(event.eventType);

                      return (
                        <div
                          key={event.id}
                          className={`text-xs p-1.5 rounded bg-gray-50 ${style.cell}`}
                        >
                          <div className="font-medium truncate">{customerName}</div>
                          <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                            <Badge className={`text-xs px-1 py-0 ${style.badge}`}>
                              {event.eventType}
                            </Badge>
                            {event.stormImpacted && (
                              <Badge className="text-xs px-1 py-0 bg-orange-100 text-orange-700">
                                Storm
                              </Badge>
                            )}
                          </div>
                        </div>
                      );
                    })}
                    {dayEvents.length > 2 && (
                      <p className="text-xs text-gray-500 pl-1">+{dayEvents.length - 2} more</p>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {selectedDay && (
        <DayDetailModal
          dayStr={selectedDay}
          dayEvents={eventsByDay[selectedDay] || []}
          leadMap={leadMap}
          onClose={() => setSelectedDay(null)}
        />
      )}
    </div>
  );
}