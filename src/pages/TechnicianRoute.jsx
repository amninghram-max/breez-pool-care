import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Navigation, MapPin, Clock, CheckCircle, AlertCircle, Key, FileText, ChevronRight, Timer } from 'lucide-react';
import { createPageUrl } from '@/utils';
import { Link } from 'react-router-dom';

// Read the persisted timer for a visit (if any)
function getWaitTimer(eventId) {
  const stored = localStorage.getItem(`breez_timer_${eventId}`);
  if (!stored) return null;
  const { startTs, waitMinutes } = JSON.parse(stored);
  const elapsed = Math.floor((Date.now() - startTs) / 1000);
  const remaining = Math.max(0, waitMinutes * 60 - elapsed);
  return { remaining, waitMinutes };
}

function fmt(s) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

// Read persisted flow for a visit
function getFlow(eventId) {
  const stored = localStorage.getItem(`breez_flow_${eventId}`);
  if (!stored) return null;
  try { return JSON.parse(stored); } catch { return null; }
}

// Derive display state deterministically:
//  completed  → event.status=completed OR flow.step=close
//  waiting    → timer key exists with remaining > 0
//  in_progress → flow key exists (any step other than close)
//  not_started → no flow key
function getVisitState(event) {
  if (event.status === 'completed') return 'completed';
  const flow = getFlow(event.id);
  if (flow?.step === 'close') return 'completed';
  const timer = getWaitTimer(event.id);
  if (timer && timer.remaining > 0) return 'waiting';
  if (flow) return 'in_progress';
  return 'not_started';
}

function WaitCountdown({ eventId }) {
  const [remaining, setRemaining] = useState(() => {
    const t = getWaitTimer(eventId);
    return t ? t.remaining : 0;
  });

  useEffect(() => {
    if (remaining <= 0) return;
    const interval = setInterval(() => {
      const t = getWaitTimer(eventId);
      setRemaining(t ? t.remaining : 0);
    }, 1000);
    return () => clearInterval(interval);
  }, [eventId, remaining]);

  if (remaining <= 0) return (
    <span className="text-xs font-semibold text-green-700">Timer complete — ready to retest</span>
  );
  return (
    <span className="text-xs font-semibold text-yellow-700">Waiting: {fmt(remaining)} remaining</span>
  );
}

export default function TechnicianRoute() {
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [, forceUpdate] = useState(0);
  const queryClient = useQueryClient();
  const today = new Date().toISOString().split('T')[0];

  const { data: user } = useQuery({
    queryKey: ['user'],
    queryFn: () => base44.auth.me()
  });

  const { data: events = [], isLoading } = useQuery({
    queryKey: ['myRoute', today],
    queryFn: async () => {
      const result = await base44.entities.CalendarEvent.filter({
        scheduledDate: today,
        assignedTechnician: user.full_name
      });
      return result.sort((a, b) => (a.routePosition || 0) - (b.routePosition || 0));
    },
    enabled: !!user
  });

  // Re-render every second so countdown timers update
  useEffect(() => {
    const interval = setInterval(() => forceUpdate(n => n + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  const updateStatusMutation = useMutation({
    mutationFn: async ({ eventId, status, sendNotification }) => {
      const response = await base44.functions.invoke('updateEventStatus', {
        eventId, status, sendNotification
      });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['myRoute'] });
      setSelectedEvent(null);
    }
  });

  if (isLoading) {
    return (
      <div className="max-w-2xl mx-auto p-4">
        <Card>
          <CardContent className="p-12 text-center">
            <p className="text-gray-600">Loading your route...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const completedCount = events.filter(e => e.status === 'completed').length;
  const waitingCount = events.filter(e => getVisitState(e) === 'waiting').length;
  const nextStop = events.find(e => getVisitState(e) !== 'completed');

  const handleNavigate = (event) => {
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(event.serviceAddress)}`, '_blank');
  };

  const handleUpdateStatus = (eventId, status) => {
    updateStatusMutation.mutate({
      eventId, status,
      sendNotification: status === 'en_route' || status === 'completed'
    });
  };

  const getStartVisitUrl = (event) => {
    return `${createPageUrl('ServiceVisitFlow')}?eventId=${event.id}&poolId=${event.poolId || ''}`;
  };

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-4 pb-20">
      {/* Header */}
      <div className="bg-gradient-to-r from-teal-500 to-teal-600 text-white rounded-lg p-6">
        <h1 className="text-2xl font-bold mb-2">Today's Route</h1>
        <div className="flex items-center gap-4 text-teal-100 flex-wrap">
          <span>{events.length} stops</span>
          <span>•</span>
          <span className="text-green-200">{completedCount} completed</span>
          {waitingCount > 0 && (
            <>
              <span>•</span>
              <span className="text-yellow-200">{waitingCount} waiting</span>
            </>
          )}
        </div>
        {nextStop && (
          <div className="mt-4 bg-white/20 rounded-lg p-3">
            <div className="text-sm text-teal-100">Next Stop:</div>
            <div className="font-semibold text-lg">{nextStop.serviceAddress}</div>
          </div>
        )}
      </div>

      {/* Storm Warning */}
      {events.some(e => e.stormImpacted) && (
        <Alert className="bg-orange-50 border-orange-200">
          <AlertCircle className="h-5 w-5 text-orange-600" />
          <AlertDescription className="text-orange-900">
            Some stops may be affected by weather conditions. Check with dispatch if needed.
          </AlertDescription>
        </Alert>
      )}

      {/* Route Stops */}
      <div className="space-y-3">
        {events.map((event, idx) => {
          const visitState = getVisitState(event);
          const isCompleted = visitState === 'completed';
          const isWaiting = visitState === 'waiting';
          const isInProgress = visitState === 'in_progress';
          const isExpanded = selectedEvent?.id === event.id;

          return (
            <Card
              key={event.id}
              className={`border-2 transition-colors ${
                isCompleted   ? 'border-green-200 opacity-70' :
                isWaiting     ? 'border-yellow-400' :
                isInProgress  ? 'border-teal-400' :
                'border-gray-200'
              }`}
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-3">
                    {/* Position / state badge */}
                    <div className={`flex items-center justify-center w-10 h-10 rounded-full flex-shrink-0 font-bold ${
                      isCompleted   ? 'bg-green-100 text-green-700' :
                      isWaiting     ? 'bg-yellow-100 text-yellow-700' :
                      isInProgress  ? 'bg-teal-100 text-teal-700' :
                      'bg-gray-100 text-gray-700'
                    }`}>
                      {isCompleted   ? <CheckCircle className="w-5 h-5" /> :
                       isWaiting     ? <Timer className="w-5 h-5" /> :
                       isInProgress  ? <ChevronRight className="w-5 h-5" /> :
                       event.routePosition || idx + 1}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-gray-900 truncate">{event.serviceAddress}</div>
                      {event.timeWindow && (
                        <div className="text-sm text-gray-500 flex items-center gap-1 mt-0.5">
                          <Clock className="w-3.5 h-3.5" />
                          {event.timeWindow}
                        </div>
                      )}
                      {isWaiting && (
                        <div className="mt-1">
                          <WaitCountdown eventId={event.id} />
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Status Badge */}
                  <Badge className={
                    isCompleted   ? 'bg-green-100 text-green-800' :
                    isWaiting     ? 'bg-yellow-100 text-yellow-800' :
                    isInProgress  ? 'bg-teal-100 text-teal-800' :
                    'bg-gray-100 text-gray-800'
                  }>
                    {isCompleted  ? 'Done' :
                     isWaiting    ? 'Waiting' :
                     isInProgress ? 'In Progress' :
                     'Not Started'}
                  </Badge>
                </div>
              </CardHeader>

              <CardContent className="space-y-3">
                {/* Primary CTA */}
                {!isCompleted && (
                  <Link to={getStartVisitUrl(event)}>
                    <Button className={`w-full ${
                      isWaiting ? 'bg-yellow-600 hover:bg-yellow-700' : 'bg-teal-600 hover:bg-teal-700'
                    } h-11`}>
                      <ChevronRight className="w-4 h-4 mr-1" />
                      {isWaiting ? 'Resume Visit' : 'Start Visit'}
                    </Button>
                  </Link>
                )}

                {/* Navigate + Details row */}
                <div className="flex gap-2">
                  {!isCompleted && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={() => handleNavigate(event)}
                    >
                      <Navigation className="w-3.5 h-3.5 mr-1" />
                      Navigate
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => setSelectedEvent(isExpanded ? null : event)}
                  >
                    {isExpanded ? 'Hide' : 'Details'}
                  </Button>
                </div>

                {/* Expandable details */}
                {isExpanded && (
                  <div className="space-y-3 pt-3 border-t">
                    {event.accessNotes && (
                      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                        <div className="flex items-center gap-2 text-sm font-semibold text-yellow-900 mb-1">
                          <Key className="w-4 h-4" />
                          Access Instructions
                        </div>
                        <div className="text-sm text-yellow-800">{event.accessNotes}</div>
                      </div>
                    )}
                    {event.customerNotes && (
                      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                        <div className="flex items-center gap-2 text-sm font-semibold text-blue-900 mb-1">
                          <FileText className="w-4 h-4" />
                          Customer Notes
                        </div>
                        <div className="text-sm text-blue-800">{event.customerNotes}</div>
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <span className="text-gray-500">Type:</span>
                        <div className="font-medium capitalize">{event.eventType?.replace('_', ' ')}</div>
                      </div>
                      <div>
                        <span className="text-gray-500">Duration:</span>
                        <div className="font-medium">{event.estimatedDuration} min</div>
                      </div>
                    </div>

                    {/* Status Actions (non-visit-flow status changes) */}
                    {!isCompleted && (
                      <div className="space-y-2 pt-2 border-t">
                        <p className="text-xs text-gray-500 font-medium">Quick status update:</p>
                        <div className="grid grid-cols-2 gap-2">
                          {event.status === 'scheduled' && (
                            <Button size="sm" onClick={() => handleUpdateStatus(event.id, 'en_route')}
                              disabled={updateStatusMutation.isPending} className="bg-blue-600 hover:bg-blue-700">
                              On the Way
                            </Button>
                          )}
                          {(event.status === 'scheduled' || event.status === 'en_route') && (
                            <Button size="sm" onClick={() => handleUpdateStatus(event.id, 'arrived')}
                              disabled={updateStatusMutation.isPending} className="bg-indigo-600 hover:bg-indigo-700">
                              Arrived
                            </Button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Drive time to next */}
                {event.drivingTimeToNext > 0 && !isCompleted && (
                  <div className="text-xs text-teal-600 flex items-center gap-1">
                    <Navigation className="w-3 h-3" />
                    {event.drivingTimeToNext} min to next stop
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
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