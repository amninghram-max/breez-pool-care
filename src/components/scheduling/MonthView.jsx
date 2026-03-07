import React from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { createPageUrl } from '@/utils';

const EVENT_TYPE_STYLES = {
  inspection:     { badge: 'bg-green-100 text-green-800',  cell: 'border-l-2 border-green-400' },
  service:        { badge: 'bg-blue-100 text-blue-800',    cell: 'border-l-2 border-blue-400' },
  cleanup:        { badge: 'bg-gray-100 text-gray-700',    cell: 'border-l-2 border-gray-400' },
  green_recovery: { badge: 'bg-orange-100 text-orange-800', cell: 'border-l-2 border-orange-400' },
};

function getEventStyle(eventType) {
  return EVENT_TYPE_STYLES[eventType] || EVENT_TYPE_STYLES.service;
}

export default function MonthView({ startDate, technicianFilter }) {
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

  const leadMap = React.useMemo(() => {
    const m = {};
    for (const l of leads) m[l.id] = l;
    return m;
  }, [leads]);

  // Group events by scheduledDate
  const eventsByDay = React.useMemo(() => {
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
              className={`min-h-[140px] ${isToday ? 'border-teal-500 border-2' : ''}`}
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
    </div>
  );
}