import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Calendar, MapPin, Clock, AlertCircle, RefreshCw, Cloud } from 'lucide-react';
import ScheduleCalendar from '@/components/scheduling/ScheduleCalendar';
import StormManager from '@/components/scheduling/StormManager';
import RouteOptimizer from '@/components/scheduling/RouteOptimizer';

export default function AdminSchedule() {
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedTechnician, setSelectedTechnician] = useState('Matt');
  const [view, setView] = useState('calendar'); // calendar, storm, routes
  const queryClient = useQueryClient();

  const { data: user } = useQuery({
    queryKey: ['user'],
    queryFn: () => base44.auth.me()
  });

  const { data: events = [] } = useQuery({
    queryKey: ['calendarEvents', selectedDate],
    queryFn: () => base44.entities.CalendarEvent.filter({ date: selectedDate })
  });

  const { data: routePlans = [] } = useQuery({
    queryKey: ['routePlans', selectedDate],
    queryFn: () => base44.entities.RoutePlan.filter({ date: selectedDate })
  });

  const { data: stormDays = [] } = useQuery({
    queryKey: ['stormDays'],
    queryFn: () => base44.entities.StormDay.filter({})
  });

  const optimizeRouteMutation = useMutation({
    mutationFn: async () => {
      const response = await base44.functions.invoke('optimizeRoute', {
        date: selectedDate,
        technician: selectedTechnician
      });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calendarEvents'] });
      queryClient.invalidateQueries({ queryKey: ['routePlans'] });
      alert('Route optimized successfully!');
    }
  });

  // Check admin access
  if (user && user.role !== 'admin') {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <Card>
          <CardContent className="p-12 text-center">
            <AlertCircle className="w-16 h-16 mx-auto mb-4 text-gray-400" />
            <h2 className="text-xl font-bold mb-2">Access Denied</h2>
            <p className="text-gray-600">This page is only accessible to administrators.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const todayEvents = events.filter(e => e.date === selectedDate);
  const isStormDay = stormDays.some(s => s.date === selectedDate);

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Schedule Management</h1>
          <p className="text-gray-600 mt-1">Manage routes, optimize schedules, and handle weather impacts</p>
        </div>
        <div className="flex gap-2">
          <Button 
            variant={view === 'calendar' ? 'default' : 'outline'} 
            onClick={() => setView('calendar')}
          >
            <Calendar className="w-4 h-4 mr-2" />
            Calendar
          </Button>
          <Button 
            variant={view === 'storm' ? 'default' : 'outline'} 
            onClick={() => setView('storm')}
          >
            <Cloud className="w-4 h-4 mr-2" />
            Storm Mode
          </Button>
          <Button 
            variant={view === 'routes' ? 'default' : 'outline'} 
            onClick={() => setView('routes')}
          >
            <MapPin className="w-4 h-4 mr-2" />
            Routes
          </Button>
        </div>
      </div>

      {/* Date and Technician Selector */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <label className="text-sm font-medium mb-2 block">Date</label>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="w-full p-2 border rounded-lg"
              />
            </div>
            <div className="flex-1">
              <label className="text-sm font-medium mb-2 block">Technician</label>
              <select
                value={selectedTechnician}
                onChange={(e) => setSelectedTechnician(e.target.value)}
                className="w-full p-2 border rounded-lg"
              >
                <option value="Matt">Matt</option>
                <option value="All">All Technicians</option>
              </select>
            </div>
            <div className="pt-6">
              <Button 
                onClick={() => optimizeRouteMutation.mutate()}
                disabled={optimizeRouteMutation.isPending}
                className="bg-teal-600 hover:bg-teal-700"
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Optimize Route
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Storm Alert */}
      {isStormDay && (
        <Card className="bg-yellow-50 border-yellow-200">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <AlertCircle className="w-6 h-6 text-yellow-600" />
              <div>
                <div className="font-medium text-yellow-900">Storm Day Active</div>
                <div className="text-sm text-yellow-700">
                  {stormDays.find(s => s.date === selectedDate)?.reason}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-gray-600">Scheduled Jobs</div>
            <div className="text-2xl font-bold">{todayEvents.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-gray-600">Completed</div>
            <div className="text-2xl font-bold text-green-600">
              {todayEvents.filter(e => e.status === 'completed').length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-gray-600">In Progress</div>
            <div className="text-2xl font-bold text-blue-600">
              {todayEvents.filter(e => ['en_route', 'arrived', 'in_progress'].includes(e.status)).length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-gray-600">Issues</div>
            <div className="text-2xl font-bold text-red-600">
              {todayEvents.filter(e => e.status === 'could_not_access').length}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Content based on view */}
      {view === 'calendar' && (
        <ScheduleCalendar 
          date={selectedDate} 
          technician={selectedTechnician}
          events={todayEvents}
        />
      )}

      {view === 'storm' && (
        <StormManager 
          selectedDate={selectedDate}
          events={todayEvents}
        />
      )}

      {view === 'routes' && (
        <RouteOptimizer 
          date={selectedDate}
          technician={selectedTechnician}
          routePlans={routePlans}
          events={todayEvents}
        />
      )}
    </div>
  );
}