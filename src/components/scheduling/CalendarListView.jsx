import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Calendar, Clock, MapPin, User } from 'lucide-react';
import { format, addDays, parseISO, isValid } from 'date-fns';

const STATUS_COLORS = {
  scheduled: 'bg-blue-100 text-blue-800',
  en_route: 'bg-yellow-100 text-yellow-800',
  arrived: 'bg-purple-100 text-purple-800',
  in_progress: 'bg-indigo-100 text-indigo-800',
  completed: 'bg-green-100 text-green-800',
  could_not_access: 'bg-red-100 text-red-800',
  needs_reschedule: 'bg-orange-100 text-orange-800',
  cancelled: 'bg-gray-100 text-gray-800',
  storm_impacted: 'bg-orange-100 text-orange-800'
};

const EVENT_TYPE_LABELS = {
  service: 'Service',
  inspection: 'Inspection',
  cleanup: 'Cleanup',
  green_recovery: 'Green Recovery'
};

export default function CalendarListView({ startDate, technicianFilter, searchQuery }) {
  const endDate = addDays(startDate, 30);

  const { data: events = [], isLoading } = useQuery({
    queryKey: ['calendarEvents', 'list', format(startDate, 'yyyy-MM-dd'), technicianFilter],
    queryFn: () => base44.entities.CalendarEvent.list('-scheduledDate', 200)
  });

  const { data: leads = [] } = useQuery({
    queryKey: ['leads-slim'],
    queryFn: () => base44.entities.Lead.list('-created_date', 200)
  });

  // Build a lead lookup map
  const leadMap = React.useMemo(() => {
    const m = {};
    for (const l of leads) m[l.id] = l;
    return m;
  }, [leads]);

  // Filter events to next 30 days
  const filtered = React.useMemo(() => {
    const startStr = format(startDate, 'yyyy-MM-dd');
    const endStr = format(endDate, 'yyyy-MM-dd');

    return events
      .filter(ev => {
        if (!ev.scheduledDate) return false;
        if (ev.scheduledDate < startStr || ev.scheduledDate > endStr) return false;
        if (technicianFilter && technicianFilter !== 'all' && ev.assignedTechnician !== technicianFilter) return false;

        if (searchQuery && searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const lead = leadMap[ev.leadId];
          const name = lead ? `${lead.firstName || ''} ${lead.lastName || ''}`.toLowerCase() : '';
          const addr = (ev.serviceAddress || '').toLowerCase();
          if (!name.includes(q) && !addr.includes(q)) return false;
        }

        return true;
      })
      .sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate) || (a.startTime || '').localeCompare(b.startTime || ''));
  }, [events, leads, leadMap, startDate, endDate, technicianFilter, searchQuery]);

  // Group by date
  const grouped = React.useMemo(() => {
    const groups = {};
    for (const ev of filtered) {
      if (!groups[ev.scheduledDate]) groups[ev.scheduledDate] = [];
      groups[ev.scheduledDate].push(ev);
    }
    return groups;
  }, [filtered]);

  if (isLoading) {
    return <div className="text-center py-12 text-gray-500">Loading events...</div>;
  }

  if (filtered.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-gray-500">
          <Calendar className="w-10 h-10 mx-auto mb-3 text-gray-300" />
          <p>No events found for the next 30 days.</p>
          {searchQuery && <p className="text-sm mt-1">Try clearing the search filter.</p>}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {Object.entries(grouped).map(([dateStr, dayEvents]) => {
        const dateObj = parseISO(dateStr);
        const dateLabel = isValid(dateObj) ? format(dateObj, 'EEEE, MMMM d, yyyy') : dateStr;

        return (
          <div key={dateStr}>
            <div className="flex items-center gap-3 mb-3">
              <div className="font-semibold text-gray-800">{dateLabel}</div>
              <div className="h-px flex-1 bg-gray-200" />
              <Badge variant="outline" className="text-xs">{dayEvents.length} event{dayEvents.length !== 1 ? 's' : ''}</Badge>
            </div>

            <div className="space-y-2">
              {dayEvents.map(ev => {
                const lead = leadMap[ev.leadId];
                return (
                  <Card key={ev.id} className="hover:shadow-sm transition-shadow">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0 space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge className={STATUS_COLORS[ev.status] || 'bg-gray-100 text-gray-800'}>
                              {ev.status?.replace(/_/g, ' ')}
                            </Badge>
                            <Badge variant="outline" className="text-xs">
                              {EVENT_TYPE_LABELS[ev.eventType] || ev.eventType}
                            </Badge>
                          </div>

                          {lead && (
                            <p className="font-medium text-gray-900">
                              {lead.firstName} {lead.lastName}
                            </p>
                          )}

                          <div className="flex items-center gap-1 text-sm text-gray-600">
                            <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
                            <span className="truncate">{ev.serviceAddress}</span>
                          </div>

                          {(ev.timeWindow || ev.startTime) && (
                            <div className="flex items-center gap-1 text-sm text-gray-600">
                              <Clock className="w-3.5 h-3.5" />
                              <span>{ev.timeWindow || `${ev.startTime}${ev.endTime ? ` – ${ev.endTime}` : ''}`}</span>
                            </div>
                          )}

                          {ev.assignedTechnician && (
                            <div className="flex items-center gap-1 text-sm text-gray-500">
                              <User className="w-3.5 h-3.5" />
                              <span>{ev.assignedTechnician}</span>
                            </div>
                          )}
                        </div>

                        {ev.routePosition && (
                          <div className="w-8 h-8 rounded-full bg-teal-100 text-teal-800 flex items-center justify-center text-sm font-bold flex-shrink-0">
                            {ev.routePosition}
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}