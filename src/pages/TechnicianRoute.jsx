import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Navigation, MapPin, Clock, CheckCircle, AlertCircle, Phone, Key, FileText } from 'lucide-react';

export default function TechnicianRoute() {
  const [selectedEvent, setSelectedEvent] = useState(null);
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

  const updateStatusMutation = useMutation({
    mutationFn: async ({ eventId, status, sendNotification }) => {
      const response = await base44.functions.invoke('updateEventStatus', {
        eventId,
        status,
        sendNotification
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

  const nextStop = events.find(e => e.status === 'scheduled');
  const completedCount = events.filter(e => e.status === 'completed').length;

  const handleNavigate = (event) => {
    const url = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(event.serviceAddress)}`;
    window.open(url, '_blank');
  };

  const handleUpdateStatus = (eventId, status) => {
    updateStatusMutation.mutate({
      eventId,
      status,
      sendNotification: status === 'en_route' || status === 'completed'
    });
  };

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-4 pb-20">
      {/* Header */}
      <div className="bg-gradient-to-r from-teal-500 to-teal-600 text-white rounded-lg p-6">
        <h1 className="text-2xl font-bold mb-2">Today's Route</h1>
        <div className="flex items-center gap-4 text-teal-100">
          <span>{events.length} stops total</span>
          <span>•</span>
          <span>{completedCount} completed</span>
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
          const isNext = event.id === nextStop?.id;
          const isCompleted = event.status === 'completed';
          const isExpanded = selectedEvent?.id === event.id;

          return (
            <Card 
              key={event.id}
              className={`${isNext ? 'border-teal-500 border-2' : ''} ${isCompleted ? 'opacity-60' : ''}`}
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    {/* Position Badge */}
                    <div className={`flex items-center justify-center w-10 h-10 rounded-full ${
                      isCompleted ? 'bg-green-100 text-green-700' : 
                      isNext ? 'bg-teal-100 text-teal-700' :
                      'bg-gray-100 text-gray-700'
                    } font-bold`}>
                      {isCompleted ? <CheckCircle className="w-5 h-5" /> : event.routePosition || idx + 1}
                    </div>

                    {/* Address */}
                    <div className="flex-1">
                      <div className="font-semibold">{event.serviceAddress}</div>
                      {event.timeWindow && (
                        <div className="text-sm text-gray-600 flex items-center gap-1 mt-1">
                          <Clock className="w-4 h-4" />
                          {event.timeWindow}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Status Badge */}
                  <Badge className={
                    isCompleted ? 'bg-green-100 text-green-800' :
                    event.status === 'en_route' ? 'bg-blue-100 text-blue-800' :
                    'bg-gray-100 text-gray-800'
                  }>
                    {event.status.replace('_', ' ')}
                  </Badge>
                </div>
              </CardHeader>

              <CardContent className="space-y-3">
                {/* Navigate Button */}
                {!isCompleted && (
                  <Button
                    className="w-full bg-teal-600 hover:bg-teal-700"
                    onClick={() => handleNavigate(event)}
                  >
                    <Navigation className="w-4 h-4 mr-2" />
                    Navigate
                  </Button>
                )}

                {/* Expandable Details */}
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() => setSelectedEvent(isExpanded ? null : event)}
                >
                  {isExpanded ? 'Hide Details' : 'View Details & Notes'}
                </Button>

                {isExpanded && (
                  <div className="space-y-3 pt-3 border-t">
                    {/* Access Notes */}
                    {event.accessNotes && (
                      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                        <div className="flex items-center gap-2 text-sm font-semibold text-yellow-900 mb-1">
                          <Key className="w-4 h-4" />
                          Access Instructions
                        </div>
                        <div className="text-sm text-yellow-800">{event.accessNotes}</div>
                      </div>
                    )}

                    {/* Customer Notes */}
                    {event.customerNotes && (
                      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                        <div className="flex items-center gap-2 text-sm font-semibold text-blue-900 mb-1">
                          <FileText className="w-4 h-4" />
                          Customer Notes
                        </div>
                        <div className="text-sm text-blue-800">{event.customerNotes}</div>
                      </div>
                    )}

                    {/* Service Details */}
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <span className="text-gray-600">Event Type:</span>
                        <div className="font-medium capitalize">{event.eventType.replace('_', ' ')}</div>
                      </div>
                      <div>
                        <span className="text-gray-600">Duration:</span>
                        <div className="font-medium">{event.estimatedDuration} min</div>
                      </div>
                    </div>

                    {/* Status Actions */}
                    {!isCompleted && (
                      <div className="space-y-2 pt-3 border-t">
                        <div className="text-sm font-semibold text-gray-700">Update Status:</div>
                        <div className="grid grid-cols-2 gap-2">
                          {event.status === 'scheduled' && (
                            <Button
                              size="sm"
                              onClick={() => handleUpdateStatus(event.id, 'en_route')}
                              disabled={updateStatusMutation.isPending}
                              className="bg-blue-600 hover:bg-blue-700"
                            >
                              On the Way
                            </Button>
                          )}
                          {(event.status === 'scheduled' || event.status === 'en_route') && (
                            <Button
                              size="sm"
                              onClick={() => handleUpdateStatus(event.id, 'arrived')}
                              disabled={updateStatusMutation.isPending}
                              className="bg-indigo-600 hover:bg-indigo-700"
                            >
                              Arrived
                            </Button>
                          )}
                          {event.status !== 'scheduled' && (
                            <Button
                              size="sm"
                              onClick={() => handleUpdateStatus(event.id, 'completed')}
                              disabled={updateStatusMutation.isPending}
                              className="bg-green-600 hover:bg-green-700 col-span-2"
                            >
                              <CheckCircle className="w-4 h-4 mr-2" />
                              Mark Complete
                            </Button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Drive Time to Next */}
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