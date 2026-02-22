import React from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { MapPin, Navigation, Clock, CheckCircle, AlertCircle, Phone } from 'lucide-react';

export default function TechnicianRoute() {
  const queryClient = useQueryClient();
  const today = new Date().toISOString().split('T')[0];

  const { data: user } = useQuery({
    queryKey: ['user'],
    queryFn: () => base44.auth.me()
  });

  const { data: events = [] } = useQuery({
    queryKey: ['myRouteEvents', today],
    queryFn: async () => {
      const allEvents = await base44.entities.CalendarEvent.filter({ 
        date: today,
        assignedTechnician: user?.full_name || 'Matt'
      });
      return allEvents.sort((a, b) => (a.routeSequence || 0) - (b.routeSequence || 0));
    },
    enabled: !!user
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ eventId, status, reason }) => {
      const response = await base44.functions.invoke('updateEventStatus', {
        eventId,
        status,
        reason
      });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['myRouteEvents'] });
    }
  });

  const getStatusBadge = (status) => {
    const config = {
      scheduled: { label: 'Scheduled', className: 'bg-gray-100 text-gray-800' },
      en_route: { label: 'On the way', className: 'bg-blue-100 text-blue-800' },
      arrived: { label: 'Arrived', className: 'bg-purple-100 text-purple-800' },
      in_progress: { label: 'In progress', className: 'bg-yellow-100 text-yellow-800' },
      completed: { label: 'Completed', className: 'bg-green-100 text-green-800' },
      could_not_access: { label: 'Could not access', className: 'bg-red-100 text-red-800' }
    };
    const { label, className } = config[status] || config.scheduled;
    return <Badge className={className}>{label}</Badge>;
  };

  const completedCount = events.filter(e => e.status === 'completed').length;
  const nextStop = events.find(e => !['completed', 'could_not_access', 'cancelled'].includes(e.status));

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Today's Route</h1>
        <p className="text-gray-600 mt-1">{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</p>
      </div>

      {/* Progress */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="text-lg font-medium">Progress</div>
            <div className="text-2xl font-bold text-teal-600">
              {completedCount} / {events.length}
            </div>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-3">
            <div 
              className="bg-teal-600 h-3 rounded-full transition-all"
              style={{ width: `${events.length > 0 ? (completedCount / events.length) * 100 : 0}%` }}
            />
          </div>
        </CardContent>
      </Card>

      {/* Next Stop */}
      {nextStop && (
        <Card className="bg-teal-50 border-teal-200">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-teal-900">
              <Navigation className="w-5 h-5" />
              Next Stop
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="font-medium text-lg">Stop #{nextStop.routeSequence}</div>
              <div className="text-teal-900">{nextStop.address}</div>
            </div>
            {nextStop.estimatedArrival && (
              <div className="flex items-center gap-2 text-sm">
                <Clock className="w-4 h-4" />
                <span>ETA: {nextStop.estimatedArrival}</span>
              </div>
            )}
            <Button
              onClick={() => window.open(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(nextStop.address)}`, '_blank')}
              className="w-full bg-teal-600 hover:bg-teal-700"
            >
              <Navigation className="w-4 h-4 mr-2" />
              Navigate
            </Button>
          </CardContent>
        </Card>
      )}

      {/* All Stops */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapPin className="w-5 h-5 text-teal-600" />
            All Stops ({events.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {events.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <MapPin className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p>No stops scheduled for today</p>
            </div>
          ) : (
            events.map((event) => (
              <StopCard 
                key={event.id} 
                event={event} 
                getStatusBadge={getStatusBadge}
                updateStatus={updateStatusMutation.mutate}
                isUpdating={updateStatusMutation.isPending}
              />
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StopCard({ event, getStatusBadge, updateStatus, isUpdating }) {
  const [expanded, setExpanded] = React.useState(false);
  const [showActions, setShowActions] = React.useState(false);

  const canProgress = !['completed', 'could_not_access', 'cancelled'].includes(event.status);

  const getNextStatus = () => {
    if (event.status === 'scheduled') return 'en_route';
    if (event.status === 'en_route') return 'arrived';
    if (event.status === 'arrived') return 'in_progress';
    if (event.status === 'in_progress') return 'completed';
    return event.status;
  };

  return (
    <div className="border rounded-lg p-4">
      <div className="flex items-start justify-between mb-2">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-bold text-lg">#{event.routeSequence}</span>
            {getStatusBadge(event.status)}
          </div>
          <div className="font-medium">{event.address}</div>
          {event.estimatedArrival && (
            <div className="text-sm text-gray-500 flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {event.estimatedArrival}
            </div>
          )}
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? 'Hide' : 'Details'}
        </Button>
      </div>

      {expanded && (
        <div className="mt-4 space-y-3 border-t pt-3">
          {event.customerNotes && (
            <div>
              <div className="text-xs text-gray-600 font-medium">Customer Notes:</div>
              <div className="text-sm">{event.customerNotes}</div>
            </div>
          )}
          {event.accessNotes && (
            <div>
              <div className="text-xs text-gray-600 font-medium">Access:</div>
              <div className="text-sm">{event.accessNotes}</div>
            </div>
          )}
          
          <Button
            onClick={() => window.open(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(event.address)}`, '_blank')}
            variant="outline"
            className="w-full"
            size="sm"
          >
            <Navigation className="w-4 h-4 mr-2" />
            Navigate
          </Button>

          {canProgress && !showActions && (
            <Button
              onClick={() => setShowActions(true)}
              className="w-full bg-teal-600 hover:bg-teal-700"
              size="sm"
            >
              Update Status
            </Button>
          )}

          {showActions && (
            <div className="space-y-2">
              <Button
                onClick={() => {
                  updateStatus({ eventId: event.id, status: getNextStatus() });
                  setShowActions(false);
                }}
                disabled={isUpdating}
                className="w-full bg-green-600 hover:bg-green-700"
                size="sm"
              >
                <CheckCircle className="w-4 h-4 mr-2" />
                {getNextStatus() === 'completed' ? 'Mark Complete' : `Mark as ${getNextStatus().replace(/_/g, ' ')}`}
              </Button>
              <Button
                onClick={() => {
                  const reason = prompt('Reason for inability to access:');
                  if (reason) {
                    updateStatus({ eventId: event.id, status: 'could_not_access', reason });
                  }
                  setShowActions(false);
                }}
                disabled={isUpdating}
                variant="destructive"
                className="w-full"
                size="sm"
              >
                <AlertCircle className="w-4 h-4 mr-2" />
                Could Not Access
              </Button>
              <Button
                onClick={() => setShowActions(false)}
                variant="outline"
                className="w-full"
                size="sm"
              >
                Cancel
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}