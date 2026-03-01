import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Calendar, Clock, MapPin, User, Phone, Navigation, ChevronDown, ChevronRight, CheckCircle2 } from 'lucide-react';
import { format, addDays, parseISO, isValid } from 'date-fns';

const STATUS_COLORS = {
  scheduled:       'bg-blue-100 text-blue-800',
  en_route:        'bg-yellow-100 text-yellow-800',
  arrived:         'bg-purple-100 text-purple-800',
  in_progress:     'bg-indigo-100 text-indigo-800',
  completed:       'bg-green-100 text-green-800',
  could_not_access:'bg-red-100 text-red-800',
  needs_reschedule:'bg-orange-100 text-orange-800',
  cancelled:       'bg-gray-100 text-gray-800',
  storm_impacted:  'bg-orange-100 text-orange-800',
};

const EVENT_TYPE_LABELS = {
  service:         'Service',
  inspection:      'Inspection',
  cleanup:         'Cleanup',
  green_recovery:  'Green Recovery',
};

function TechnicianGroup({ techName, dayGroups, leadMap, onMarkComplete, onReschedule }) {
  const [open, setOpen] = useState(true);
  const totalStops = Object.values(dayGroups).flat().length;

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      {/* Tech header */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors"
      >
        <div className="flex items-center gap-2">
          <User className="w-4 h-4 text-teal-600" />
          <span className="font-semibold text-gray-800">{techName}</span>
          <Badge variant="outline" className="text-xs">{totalStops} stop{totalStops !== 1 ? 's' : ''}</Badge>
        </div>
        {open ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
      </button>

      {open && (
        <div className="divide-y divide-gray-100">
          {Object.entries(dayGroups).map(([dateStr, events]) => {
            const dateObj = parseISO(dateStr);
            const dateLabel = isValid(dateObj) ? format(dateObj, 'EEEE, MMMM d') : dateStr;

            return (
              <div key={dateStr}>
                <div className="px-4 py-2 bg-white border-b border-gray-100 flex items-center gap-2">
                  <Calendar className="w-3.5 h-3.5 text-gray-400" />
                  <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{dateLabel}</span>
                  <span className="text-xs text-gray-400">· {events.length} stop{events.length !== 1 ? 's' : ''}</span>
                </div>

                {events.map((ev, idx) => {
                  const lead = leadMap[ev.leadId];
                  const mapsQuery = encodeURIComponent(ev.serviceAddress || '');
                  const phone = lead?.mobilePhone;
                  const isComplete = ev.status === 'completed';

                  return (
                    <div
                      key={ev.id}
                      className={`flex items-start gap-4 px-4 py-3 hover:bg-gray-50 transition-colors ${isComplete ? 'opacity-60' : ''}`}
                    >
                      {/* Stop number */}
                      <div className="flex-shrink-0 w-7 h-7 rounded-full bg-teal-100 text-teal-700 flex items-center justify-center text-xs font-bold mt-0.5">
                        {ev.routePosition || idx + 1}
                      </div>

                      {/* Details */}
                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-gray-900 text-sm">
                            {lead ? `${lead.firstName} ${lead.lastName}` : 'Unknown Customer'}
                          </span>
                          <Badge className={`text-xs ${STATUS_COLORS[ev.status] || 'bg-gray-100 text-gray-800'}`}>
                            {ev.status?.replace(/_/g, ' ')}
                          </Badge>
                          <Badge variant="outline" className="text-xs">
                            {EVENT_TYPE_LABELS[ev.eventType] || ev.eventType}
                          </Badge>
                        </div>

                        <div className="flex items-center gap-1 text-xs text-gray-500">
                          <MapPin className="w-3 h-3 flex-shrink-0" />
                          <span className="truncate">{ev.serviceAddress || '—'}</span>
                        </div>

                        {(ev.timeWindow || ev.startTime) && (
                          <div className="flex items-center gap-1 text-xs text-gray-500">
                            <Clock className="w-3 h-3" />
                            <span>{ev.timeWindow || `${ev.startTime}${ev.endTime ? ` – ${ev.endTime}` : ''}`}</span>
                          </div>
                        )}
                      </div>

                      {/* Quick actions */}
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        {phone && (
                          <a href={`tel:${phone}`} title="Call customer">
                            <Button size="icon" variant="ghost" className="w-7 h-7">
                              <Phone className="w-3.5 h-3.5 text-gray-500" />
                            </Button>
                          </a>
                        )}
                        {ev.serviceAddress && (
                          <a
                            href={`https://www.google.com/maps/dir/?api=1&destination=${mapsQuery}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="Navigate"
                          >
                            <Button size="icon" variant="ghost" className="w-7 h-7">
                              <Navigation className="w-3.5 h-3.5 text-teal-600" />
                            </Button>
                          </a>
                        )}
                        {!isComplete && (
                          <>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-xs h-7 px-2 text-orange-600 hover:bg-orange-50"
                              onClick={() => onReschedule(ev)}
                            >
                              Reschedule
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-xs h-7 px-2 text-green-700 hover:bg-green-50"
                              onClick={() => onMarkComplete(ev)}
                            >
                              <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                              Done
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function CalendarListView({ startDate, technicianFilter, searchQuery }) {
  const endDate = addDays(startDate, 30);
  const queryClient = useQueryClient();

  const { data: events = [], isLoading } = useQuery({
    queryKey: ['calendarEvents', 'list', format(startDate, 'yyyy-MM-dd'), technicianFilter],
    queryFn: () => base44.entities.CalendarEvent.list('-scheduledDate', 200),
  });

  const { data: leads = [] } = useQuery({
    queryKey: ['leads-slim'],
    queryFn: () => base44.entities.Lead.list('-created_date', 200),
  });

  const markCompleteMutation = useMutation({
    mutationFn: (ev) => base44.entities.CalendarEvent.update(ev.id, { status: 'completed' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['calendarEvents'] }),
  });

  const leadMap = React.useMemo(() => {
    const m = {};
    for (const l of leads) m[l.id] = l;
    return m;
  }, [leads]);

  // Filter events
  const filtered = React.useMemo(() => {
    const startStr = format(startDate, 'yyyy-MM-dd');
    const endStr = format(endDate, 'yyyy-MM-dd');
    return events
      .filter(ev => {
        if (!ev.scheduledDate) return false;
        if (ev.scheduledDate < startStr || ev.scheduledDate > endStr) return false;
        if (technicianFilter && technicianFilter !== 'all' && ev.assignedTechnician !== technicianFilter) return false;
        if (searchQuery?.trim()) {
          const q = searchQuery.toLowerCase();
          const lead = leadMap[ev.leadId];
          const name = lead ? `${lead.firstName || ''} ${lead.lastName || ''}`.toLowerCase() : '';
          const addr = (ev.serviceAddress || '').toLowerCase();
          if (!name.includes(q) && !addr.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) =>
        a.scheduledDate.localeCompare(b.scheduledDate) ||
        (a.startTime || '').localeCompare(b.startTime || '') ||
        (a.routePosition || 99) - (b.routePosition || 99)
      );
  }, [events, leads, leadMap, startDate, endDate, technicianFilter, searchQuery]);

  // Group: technician → date → events[]
  const techGroups = React.useMemo(() => {
    const groups = {};
    for (const ev of filtered) {
      const tech = ev.assignedTechnician || 'Unassigned';
      if (!groups[tech]) groups[tech] = {};
      if (!groups[tech][ev.scheduledDate]) groups[tech][ev.scheduledDate] = [];
      groups[tech][ev.scheduledDate].push(ev);
    }
    return groups;
  }, [filtered]);

  const handleReschedule = (ev) => {
    // Open calendar page for this event date — simplest no-modal approach
    window.location.href = createPageUrl ? `/${window.location.pathname.split('/')[1]}?date=${ev.scheduledDate}` : '#';
  };

  const handleMarkComplete = (ev) => {
    if (confirm(`Mark visit for ${leadMap[ev.leadId]?.firstName || 'this customer'} as completed?`)) {
      markCompleteMutation.mutate(ev);
    }
  };

  if (isLoading) return <div className="text-center py-12 text-gray-500">Loading events...</div>;

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
    <div className="space-y-4">
      {Object.entries(techGroups).map(([techName, dayGroups]) => (
        <TechnicianGroup
          key={techName}
          techName={techName}
          dayGroups={dayGroups}
          leadMap={leadMap}
          onMarkComplete={handleMarkComplete}
          onReschedule={handleReschedule}
        />
      ))}
    </div>
  );
}