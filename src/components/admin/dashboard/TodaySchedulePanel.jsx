import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Calendar, Clock } from 'lucide-react';
import { format, parseISO, isThisWeek, isToday } from 'date-fns';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';

const STATUS_COLORS = {
  completed: 'bg-green-100 text-green-800',
  cancelled: 'bg-red-100 text-red-800',
  scheduled: 'bg-blue-100 text-blue-800',
  rescheduled: 'bg-yellow-100 text-yellow-800',
};

const TYPE_COLORS = {
  service: 'bg-teal-100 text-teal-800',
  inspection: 'bg-purple-100 text-purple-800',
  recovery: 'bg-orange-100 text-orange-800',
  retest: 'bg-indigo-100 text-indigo-800',
};

export default function TodaySchedulePanel({ events, leads = [] }) {
  const [view, setView] = useState('today');

  // Build lead map for deleted check
  const leadMap = React.useMemo(() => {
    const m = {};
    for (const l of leads) m[l.id] = l;
    return m;
  }, [leads]);

  const filtered = events.filter(e => {
    if (!e.scheduledDate) return false;
    
    // Skip cancelled events
    if (e.status === 'cancelled') return false;
    
    // Skip deleted leads
    const lead = leadMap[e.leadId];
    if (lead?.isDeleted) return false;
    
    const d = new Date(e.scheduledDate + 'T12:00:00');
    return view === 'today' ? isToday(d) : isThisWeek(d, { weekStartsOn: 1 });
  }).sort((a, b) => a.routePosition - b.routePosition || a.scheduledDate.localeCompare(b.scheduledDate));

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Calendar className="w-4 h-4" /> Schedule
          </CardTitle>
          <div className="flex items-center gap-2">
            <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs">
              <button
                onClick={() => setView('today')}
                className={`px-3 py-1.5 transition-colors ${view === 'today' ? 'bg-teal-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}
              >Today</button>
              <button
                onClick={() => setView('week')}
                className={`px-3 py-1.5 transition-colors ${view === 'week' ? 'bg-teal-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}
              >This Week</button>
            </div>
            <Link to={createPageUrl('Calendar')} className="text-xs text-teal-600 hover:underline">Full →</Link>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {filtered.length === 0 ? (
          <p className="text-sm text-gray-500">No events {view === 'today' ? 'today' : 'this week'}.</p>
        ) : (
          <div className="space-y-2 max-h-72 overflow-y-auto">
            {filtered.map(ev => (
              <div key={ev.id} className="flex items-start gap-3 py-2 border-b border-gray-50 last:border-0">
                <div className="flex-shrink-0 text-center w-12">
                  {view === 'week' && ev.scheduledDate && (
                    <p className="text-xs text-gray-400 font-medium">{format(new Date(ev.scheduledDate + 'T12:00:00'), 'EEE')}</p>
                  )}
                  {ev.routePosition && (
                    <span className="text-xs text-gray-400">#{ev.routePosition}</span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{ev.customerName || ev.serviceAddress}</p>
                  {ev.assignedTechnician && (
                    <p className="text-xs text-gray-400">{ev.assignedTechnician}</p>
                  )}
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <Badge className={`text-xs ${TYPE_COLORS[ev.eventType] || 'bg-gray-100 text-gray-600'}`}>
                    {ev.eventType}
                  </Badge>
                  <Badge className={`text-xs ${STATUS_COLORS[ev.status] || 'bg-gray-100 text-gray-600'}`}>
                    {ev.status}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}