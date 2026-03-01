import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, Cloud, Navigation, AlertTriangle, List, Search } from 'lucide-react';
import DayView from '@/components/scheduling/DayView';
import WeekView from '@/components/scheduling/WeekView';
import StormModeTools from '@/components/scheduling/StormModeTools';
import CalendarListView from '@/components/scheduling/CalendarListView';

export default function Calendar() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState('day'); // 'day', 'week', 'list'
  const [selectedTechnician, setSelectedTechnician] = useState('all');
  const [showStormTools, setShowStormTools] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [jumpDate, setJumpDate] = useState('');
  const queryClient = useQueryClient();

  const { data: user } = useQuery({
    queryKey: ['user'],
    queryFn: () => base44.auth.me()
  });

  const { data: settings } = useQuery({
    queryKey: ['schedulingSettings'],
    queryFn: async () => {
      const result = await base44.entities.SchedulingSettings.filter({ settingKey: 'default' });
      return result[0] || {};
    }
  });

  const { data: stormDays = [] } = useQuery({
    queryKey: ['stormDays'],
    queryFn: () => base44.entities.StormDay.filter({})
  });

  const [optimizeResult, setOptimizeResult] = useState(null);

  const optimizeRouteMutation = useMutation({
    mutationFn: async ({ date, technicianName }) => {
      const response = await base44.functions.invoke('optimizeRoute', {
        date,
        technicianName
      });
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['calendarEvents'] });
      setOptimizeResult(data);
    }
  });

  // Check admin access
  if (user && user.role !== 'admin') {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <Card>
          <CardContent className="p-12 text-center">
            <AlertTriangle className="w-16 h-16 mx-auto mb-4 text-gray-400" />
            <h2 className="text-xl font-bold mb-2">Access Denied</h2>
            <p className="text-gray-600">This page is only accessible to administrators.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const technicians = settings?.technicians || [{ name: 'Matt', active: true }];
  const activeTechnicians = technicians.filter(t => t.active);

  const handlePrevious = () => {
    const newDate = new Date(currentDate);
    if (viewMode === 'day') {
      newDate.setDate(newDate.getDate() - 1);
    } else {
      newDate.setDate(newDate.getDate() - 7);
    }
    setCurrentDate(newDate);
  };

  const handleNext = () => {
    const newDate = new Date(currentDate);
    if (viewMode === 'day') {
      newDate.setDate(newDate.getDate() + 1);
    } else {
      newDate.setDate(newDate.getDate() + 7);
    }
    setCurrentDate(newDate);
  };

  const handleJumpDate = (e) => {
    const val = e.target.value;
    setJumpDate(val);
    if (val) {
      const d = new Date(val + 'T00:00:00');
      if (!isNaN(d)) setCurrentDate(d);
    }
  };

  const handleToday = () => {
    setCurrentDate(new Date());
  };

  const handleOptimizeRoute = () => {
    const dateStr = currentDate.toISOString().split('T')[0];
    optimizeRouteMutation.mutate({
      date: dateStr,
      technicianName: selectedTechnician === 'all' ? activeTechnicians[0]?.name : selectedTechnician
    });
  };

  const isStormDay = stormDays.some(sd => sd.date === currentDate.toISOString().split('T')[0]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Schedule & Routes</h1>
          <p className="text-gray-600 mt-1">Manage service scheduling and optimize routes</p>
        </div>
        <Button
          onClick={() => setShowStormTools(!showStormTools)}
          variant={showStormTools ? 'default' : 'outline'}
          className={showStormTools ? 'bg-orange-600 hover:bg-orange-700' : ''}
        >
          <Cloud className="w-4 h-4 mr-2" />
          Storm Mode
        </Button>
      </div>

      {/* Optimize Route Result Banner */}
      {optimizeResult && (
        <div className={`rounded-xl border px-4 py-3 flex items-start justify-between gap-4 ${
          optimizeResult.warningAfter6pm
            ? 'bg-amber-50 border-amber-300'
            : 'bg-teal-50 border-teal-300'
        }`}>
          <div className="space-y-1 text-sm">
            <p className={`font-semibold ${optimizeResult.warningAfter6pm ? 'text-amber-800' : 'text-teal-800'}`}>
              {optimizeResult.warningAfter6pm ? '⚠️ Route optimized — late finish warning' : '✓ Route optimized successfully'}
            </p>
            {optimizeResult.warningAfter6pm && (
              <p className="text-amber-700 text-xs">Estimated finish time is past 6:00 PM. Consider reducing stops or adjusting start times.</p>
            )}
            {(optimizeResult.beforeEstimate || optimizeResult.afterEstimate) && (
              <div className="flex items-center gap-4 text-xs text-gray-600 mt-1">
                {optimizeResult.beforeEstimate && <span>Before: <strong>{optimizeResult.beforeEstimate}</strong></span>}
                {optimizeResult.afterEstimate && <span>After: <strong>{optimizeResult.afterEstimate}</strong></span>}
              </div>
            )}
            {optimizeResult.stopsReordered != null && (
              <p className="text-xs text-gray-500">{optimizeResult.stopsReordered} stop{optimizeResult.stopsReordered !== 1 ? 's' : ''} reordered</p>
            )}
          </div>
          <button onClick={() => setOptimizeResult(null)} className="text-gray-400 hover:text-gray-600 text-xs mt-0.5">✕</button>
        </div>
      )}

      {/* Storm Tools */}
      {showStormTools && (
        <StormModeTools 
          currentDate={currentDate}
          onClose={() => setShowStormTools(false)}
        />
      )}

      {/* Controls */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between flex-wrap gap-4">
            {/* Navigation */}
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={handlePrevious}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <Button variant="outline" size="sm" onClick={handleToday}>
                Today
              </Button>
              <Button variant="outline" size="sm" onClick={handleNext}>
                <ChevronRight className="w-4 h-4" />
              </Button>
              <div className="text-lg font-semibold ml-4">
                {currentDate.toLocaleDateString('en-US', { 
                  weekday: 'long',
                  month: 'long', 
                  day: 'numeric', 
                  year: 'numeric' 
                })}
                {isStormDay && (
                  <Badge className="ml-2 bg-orange-100 text-orange-800">
                    <AlertTriangle className="w-3 h-3 mr-1" />
                    Storm Day
                  </Badge>
                )}
              </div>
            </div>

            {/* View Mode */}
            <div className="flex items-center gap-2">
              <Button
                variant={viewMode === 'day' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setViewMode('day')}
              >
                Day
              </Button>
              <Button
                variant={viewMode === 'week' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setViewMode('week')}
              >
                Week
              </Button>
              <Button
                variant={viewMode === 'list' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setViewMode('list')}
              >
                <List className="w-4 h-4 mr-1" />
                List
              </Button>
            </div>

            {/* Search + Date Jump */}
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-2.5 top-2 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search name or address..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="border rounded pl-8 pr-3 py-1.5 text-sm w-48"
                />
              </div>
              <input
                type="date"
                value={jumpDate}
                onChange={handleJumpDate}
                title="Jump to date"
                className="border rounded px-3 py-1.5 text-sm"
              />
            </div>

            {/* Technician Filter */}
            <div className="flex items-center gap-2">
              <select
                value={selectedTechnician}
                onChange={(e) => setSelectedTechnician(e.target.value)}
                className="border rounded px-3 py-2 text-sm"
              >
                <option value="all">All Technicians</option>
                {activeTechnicians.map(tech => (
                  <option key={tech.name} value={tech.name}>{tech.name}</option>
                ))}
              </select>

              <Button
                size="sm"
                onClick={handleOptimizeRoute}
                disabled={optimizeRouteMutation.isPending}
                className="bg-teal-600 hover:bg-teal-700"
              >
                <Navigation className="w-4 h-4 mr-2" />
                {optimizeRouteMutation.isPending ? 'Optimizing...' : 'Optimize Route'}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Calendar View */}
      {viewMode === 'day' && (
        <DayView 
          date={currentDate} 
          technicianFilter={selectedTechnician}
        />
      )}
      {viewMode === 'week' && (
        <WeekView 
          startDate={currentDate}
          technicianFilter={selectedTechnician}
        />
      )}
      {viewMode === 'list' && (
        <CalendarListView
          startDate={currentDate}
          technicianFilter={selectedTechnician}
          searchQuery={searchQuery}
        />
      )}
    </div>
  );
}