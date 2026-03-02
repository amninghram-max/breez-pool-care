import React from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Calendar } from 'lucide-react';

export default function WeekView({ startDate, technicianFilter }) {
  const [showCancelled, setShowCancelled] = React.useState(false);

  // Generate 7 days starting from startDate
  const days = Array.from({ length: 7 }, (_, i) => {
    const date = new Date(startDate);
    date.setDate(date.getDate() + i);
    return date;
  }).filter(d => d.getDay() !== 0); // Exclude Sundays

  const { data: allEvents = [], isLoading } = useQuery({
    queryKey: ['calendarEventsWeek', startDate.toISOString(), technicianFilter],
    queryFn: async () => {
      const query = {};
      if (technicianFilter && technicianFilter !== 'all') {
        query.assignedTechnician = technicianFilter;
      }
      
      const startStr = days[0].toISOString().split('T')[0];
      const endStr = days[days.length - 1].toISOString().split('T')[0];
      
      const result = await base44.entities.CalendarEvent.filter(query);
      return result.filter(e => e.scheduledDate >= startStr && e.scheduledDate <= endStr);
    }
  });

  const { data: leads = [] } = useQuery({
    queryKey: ['leads-slim'],
    queryFn: () => base44.entities.Lead.list('-created_date', 200),
  });

  const leadMap = React.useMemo(() => {
    const m = {};
    for (const l of leads) m[l.id] = l;
    return m;
  }, [leads]);

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-12 text-center">
          <p className="text-gray-600">Loading week schedule...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Show cancelled toggle */}
      <div className="flex items-center justify-end">
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

      <div className="grid grid-cols-6 gap-4">
        {days.map(day => {
          const dateStr = day.toISOString().split('T')[0];
          const dayEvents = allEvents.filter(e => {
            if (e.scheduledDate !== dateStr) return false;
            // Skip cancelled unless toggled
            if (e.status === 'cancelled' && !showCancelled) return false;
            // Skip deleted leads
            const lead = leadMap[e.leadId];
            if (lead?.isDeleted) return false;
            return true;
          });
          const isToday = dateStr === new Date().toISOString().split('T')[0];

        return (
          <Card key={dateStr} className={isToday ? 'border-teal-500 border-2' : ''}>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">
                <div className="flex flex-col">
                  <span className="text-xs text-gray-600">
                    {day.toLocaleDateString('en-US', { weekday: 'short' })}
                  </span>
                  <span className="text-lg font-bold">
                    {day.getDate()}
                  </span>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {dayEvents.length === 0 ? (
                <p className="text-xs text-gray-400">No events</p>
              ) : (
                <>
                  <div className="text-xs font-semibold text-gray-700">
                    {dayEvents.length} stops
                  </div>
                  {dayEvents.slice(0, 3).map(event => (
                    <div key={event.id} className="text-xs p-2 bg-gray-50 rounded">
                      <div className="font-medium truncate">{event.serviceAddress.split(',')[0]}</div>
                      {event.timeWindow && (
                        <div className="text-gray-500">{event.timeWindow.split('-')[0]}</div>
                      )}
                    </div>
                  ))}
                  {dayEvents.length > 3 && (
                    <div className="text-xs text-gray-500">+{dayEvents.length - 3} more</div>
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