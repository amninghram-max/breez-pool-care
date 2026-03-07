import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Clock, AlertCircle, Play, CheckCircle } from 'lucide-react';
import RouteStopCard from '../components/servicevisit/RouteStopCard';
import { format, addMinutes, parse, isAfter } from 'date-fns';

const CUTOFF_HOUR = 18; // 6 PM

function getWaitTimer(eventId) {
  const stored = localStorage.getItem(`breez_timer_${eventId}`);
  if (!stored) return null;
  const { startTs, waitMinutes } = JSON.parse(stored);
  const elapsed = Math.floor((Date.now() - startTs) / 1000);
  const remaining = Math.max(0, waitMinutes * 60 - elapsed);
  return { remaining, waitMinutes };
}

function getFlow(eventId) {
  const stored = localStorage.getItem(`breez_flow_${eventId}`);
  if (!stored) return null;
  try { return JSON.parse(stored); } catch { return null; }
}

function getVisitState(event) {
  if (event.status === 'completed') return 'completed';
  const flow = getFlow(event.id);
  if (flow?.step === 'close') return 'completed';
  const timer = getWaitTimer(event.id);
  if (timer && timer.remaining > 0) return 'waiting';
  if (flow) return 'in_progress';
  return 'not_started';
}

// Estimate finish time based on start + duration per stop + drive times
function estimateFinish(events, startTime) {
  if (!events.length || !startTime) return null;
  let current = startTime;
  for (const ev of events) {
    const duration = ev.estimatedDuration || 35; // default 35 min per stop
    const drive = ev.drivingTimeToNext || 0;
    current = addMinutes(current, duration + drive);
  }
  return current;
}

export default function TechnicianRoute() {
  const [, forceUpdate] = useState(0);
  const queryClient = useQueryClient();
  const today = new Date().toISOString().split('T')[0];

  // Parse query params
  const urlParams = new URLSearchParams(window.location.search);
  const dateParam = urlParams.get('date');
  const technicianParam = urlParams.get('technician');
  const effectiveDate = dateParam || today;

  const { data: user } = useQuery({
    queryKey: ['user'],
    queryFn: () => base44.auth.me()
  });

  // Admin can view any technician via param; all others see only their own route
  const effectiveTechnician = (user?.role === 'admin' && technicianParam)
    ? technicianParam
    : user?.full_name;

  const { data: events = [], isLoading } = useQuery({
    queryKey: ['myRoute', effectiveDate, effectiveTechnician],
    queryFn: async () => {
      const result = await base44.entities.CalendarEvent.filter({
        scheduledDate: effectiveDate,
        assignedTechnician: effectiveTechnician
      });
      return result.sort((a, b) => (a.routePosition || 0) - (b.routePosition || 0));
    },
    enabled: !!user && !!effectiveTechnician
  });

  useEffect(() => {
    const interval = setInterval(() => forceUpdate(n => n + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  const updateStatusMutation = useMutation({
    mutationFn: async ({ eventId, status }) => {
      const response = await base44.functions.invoke('updateEventStatus', { eventId, status, sendNotification: false });
      return response.data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['myRoute'] })
  });

  // Compute route timing
  const now = new Date();
  const startTime = events[0]?.scheduledStartTime
    ? parse(events[0].scheduledStartTime, 'HH:mm', now)
    : events[0]?.scheduledDate
      ? now // use now as start if no specific time
      : null;

  const estimatedFinish = estimateFinish(events, startTime || now);
  const cutoff = new Date(now);
  cutoff.setHours(CUTOFF_HOUR, 0, 0, 0);
  const exceedsCutoff = estimatedFinish && isAfter(estimatedFinish, cutoff);

  const completedCount = events.filter(e => getVisitState(e) === 'completed').length;
  const remaining = events.length - completedCount;

  if (isLoading) {
    return (
      <div className="max-w-2xl mx-auto p-4">
        <Card>
          <CardContent className="p-12 text-center">
            <p className="text-gray-600">Loading your route…</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-4 pb-20">
      {/* Header */}
      <div className="bg-gradient-to-r from-teal-500 to-teal-600 text-white rounded-xl p-5">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-bold">
              {effectiveTechnician ? `${effectiveTechnician}'s Route` : 'Route'}
            </h1>
            <p className="text-teal-100 text-sm mt-0.5">
              {effectiveDate !== today
                ? new Date(effectiveDate + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
                : 'Today'
              } · {events.length} stops · {completedCount} done · {remaining} remaining
            </p>
          </div>
          {/* Timing */}
          {estimatedFinish && (
            <div className="text-right">
              <div className="flex items-center gap-1 text-teal-100 text-xs">
                <Clock className="w-3.5 h-3.5" />
                Est. finish
              </div>
              <p className={`font-bold text-lg ${exceedsCutoff ? 'text-red-300' : 'text-white'}`}>
                {format(estimatedFinish, 'h:mm a')}
              </p>
            </div>
          )}
        </div>

        {/* Next stop preview + Start Route button */}
        {(() => {
          const next = events.find(e => getVisitState(e) !== 'completed');
          if (!next) {
            return (
              <div className="mt-4 flex items-center gap-2 bg-white/20 rounded-lg px-3 py-2">
                <CheckCircle className="w-4 h-4 text-teal-200" />
                <p className="font-semibold text-sm">Route Complete</p>
              </div>
            );
          }
          const pageName = next.eventType === 'inspection' ? 'InspectionSubmit' : 'ServiceVisitFlow';
          const startUrl = `https://breezpoolcare.com/${pageName}?eventId=${next.id}&poolId=${next.poolId || ''}`;
          const stopLabel = next.routePosition ? `Stop #${next.routePosition}` : `Stop ${events.indexOf(next) + 1}`;
          return (
            <div className="mt-4 space-y-2">
              <div className="bg-white/20 rounded-lg px-3 py-2">
                <p className="text-xs text-teal-100">Next Stop</p>
                <p className="font-semibold">{next.customerName || next.serviceAddress?.split(',')[0]}</p>
                <p className="text-xs text-teal-100 truncate">{next.serviceAddress}</p>
              </div>
              <a href={startUrl} className="block">
                <Button className="w-full bg-white text-teal-700 hover:bg-teal-50 font-bold h-11">
                  <Play className="w-4 h-4 mr-2" />
                  Start Route · {stopLabel}
                </Button>
              </a>
            </div>
          );
        })()}
      </div>

      {/* 6 PM warning — visible to tech, implies dispatch alert */}
      {exceedsCutoff && (
        <Alert className="bg-red-50 border-red-300">
          <AlertCircle className="h-5 w-5 text-red-600" />
          <AlertDescription className="text-red-900 font-medium">
            ⚠ Estimated finish is {format(estimatedFinish, 'h:mm a')} — past the 6:00 PM cutoff. Contact dispatch.
          </AlertDescription>
        </Alert>
      )}

      {/* Storm warning */}
      {events.some(e => e.stormImpacted) && (
        <Alert className="bg-orange-50 border-orange-200">
          <AlertCircle className="h-5 w-5 text-orange-600" />
          <AlertDescription className="text-orange-900">
            Some stops may be affected by weather conditions. Check with dispatch if needed.
          </AlertDescription>
        </Alert>
      )}

      {/* Route stops */}
      <div className="space-y-3">
        {events.map((event, idx) => (
          <RouteStopCard
            key={event.id}
            event={event}
            idx={idx}
            visitState={getVisitState(event)}
            user={user}
            getTimer={getWaitTimer}
            onNavigate={(ev) => window.open(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(ev.serviceAddress)}`, '_blank')}
            onUpdateStatus={(eventId, status) => updateStatusMutation.mutate({ eventId, status })}
          />
        ))}
      </div>

      {events.length === 0 && (
        <Card>
          <CardContent className="p-12 text-center">
            <Clock className="w-16 h-16 mx-auto mb-4 text-gray-400" />
            <p className="text-gray-600">No stops scheduled for today</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}