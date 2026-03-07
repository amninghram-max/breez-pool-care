import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent } from '@/components/ui/card';
import { MapPin, Clock, User, Lock, Navigation, AlertCircle, CheckCircle } from 'lucide-react';

export default function EventDetailsModal({ event, onClose }) {
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState({
    timeWindow: event.timeWindow || '',
    estimatedDuration: event.estimatedDuration || 30,
    assignedTechnician: event.assignedTechnician || '',
    isFixed: event.isFixed || false,
    accessNotes: event.accessNotes || '',
    customerNotes: event.customerNotes || ''
  });
  const [reopenSuccess, setReopenSuccess] = useState(false);
  const queryClient = useQueryClient();

  const updateEventMutation = useMutation({
    mutationFn: async (updates) => {
      const response = await base44.functions.invoke('updateCalendarEventAdmin', {
        eventId: event.id,
        ...updates,
      });
      if (!response.data?.success) {
        throw new Error(response.data?.error || 'Failed to update event');
      }
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['calendarEvents'] });
      if (data?.warning) {
        toast.warning(data.warning);
      }
      setIsEditing(false);
      onClose();
    }
  });

  const reopenMutation = useMutation({
    mutationFn: async () => {
      console.log('[EventDetailsModal] reopen-visit action triggered', { eventId: event.id });
      const result = await base44.functions.invoke('reopenAccessIssueVisit', {
        eventId: event.id
      });
      console.log('[EventDetailsModal] reopen-visit mutation success', { eventId: event.id, newStatus: result.data?.status });
      return result.data;
    },
    onSuccess: (data) => {
      console.log('[EventDetailsModal] reopen complete, showing success state', { newStatus: data?.status });
      queryClient.invalidateQueries({ queryKey: ['calendarEvents'] });
      setReopenSuccess(true);
      setTimeout(() => onClose(), 2000);
    },
    onError: (error) => {
      console.error('[EventDetailsModal] reopen-visit mutation failed', { error: error?.message });
    },
  });

  const handleReopenVisit = () => {
    console.log('[EventDetailsModal] reopen button clicked, initiating mutation');
    reopenMutation.mutate();
  };

  const handleSave = () => {
    updateEventMutation.mutate(formData);
  };

  const handleOpenMaps = () => {
    const url = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(event.serviceAddress)}`;
    window.open(url, '_blank');
  };

  return (
    <Dialog open={!!event} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span>Service Details</span>
            {!isEditing && (
              <Button size="sm" variant="outline" onClick={() => setIsEditing(true)}>
                Edit
              </Button>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Address */}
          <div>
            <Label className="text-xs text-gray-600">Service Address</Label>
            <div className="flex items-start gap-2 mt-1">
              <MapPin className="w-4 h-4 text-gray-400 mt-1" />
              <span className="font-medium">{event.serviceAddress}</span>
            </div>
            <Button size="sm" variant="outline" className="mt-2" onClick={handleOpenMaps}>
              <Navigation className="w-4 h-4 mr-2" />
              Open in Maps
            </Button>
          </div>

          {/* Event Type & Status */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-xs text-gray-600">Event Type</Label>
              <div className="mt-1 capitalize">{event.eventType.replace('_', ' ')}</div>
            </div>
            <div>
              <Label className="text-xs text-gray-600">Status</Label>
              <div className="mt-1">
                <Badge>{event.status.replace('_', ' ')}</Badge>
              </div>
            </div>
          </div>

          {/* Time Window */}
          <div>
            <Label>Time Window</Label>
            {isEditing ? (
              <Input
                value={formData.timeWindow}
                onChange={(e) => setFormData({...formData, timeWindow: e.target.value})}
                placeholder="e.g. 9:00 AM - 11:00 AM"
              />
            ) : (
              <div className="flex items-center gap-2 mt-1">
                <Clock className="w-4 h-4 text-gray-400" />
                <span>{event.timeWindow || 'Not set'}</span>
              </div>
            )}
          </div>

          {/* Duration */}
          <div>
            <Label>Estimated Duration (minutes)</Label>
            {isEditing ? (
              <Input
                type="number"
                value={formData.estimatedDuration}
                onChange={(e) => setFormData({...formData, estimatedDuration: parseInt(e.target.value)})}
              />
            ) : (
              <div className="mt-1">{event.estimatedDuration} minutes</div>
            )}
          </div>

          {/* Technician */}
          <div>
            <Label>Assigned Technician</Label>
            {isEditing ? (
              <Input
                value={formData.assignedTechnician}
                onChange={(e) => setFormData({...formData, assignedTechnician: e.target.value})}
              />
            ) : (
              <div className="flex items-center gap-2 mt-1">
                <User className="w-4 h-4 text-gray-400" />
                <span>{event.assignedTechnician || 'Unassigned'}</span>
              </div>
            )}
          </div>

          {/* Fixed Position */}
          {isEditing && (
            <div className="flex items-center justify-between">
              <div>
                <Label>Lock Position</Label>
                <p className="text-xs text-gray-500">Prevent automatic route optimization</p>
              </div>
              <Switch
                checked={formData.isFixed}
                onCheckedChange={(checked) => setFormData({...formData, isFixed: checked})}
              />
            </div>
          )}

          {/* Route Info */}
          {event.routePosition && (
            <div>
              <Label className="text-xs text-gray-600">Route Position</Label>
              <div className="mt-1">Stop #{event.routePosition}</div>
              {event.drivingTimeToNext > 0 && (
                <div className="text-sm text-teal-600 mt-1">
                  {event.drivingTimeToNext} min drive to next stop ({event.drivingDistanceToNext?.toFixed(1)} mi)
                </div>
              )}
            </div>
          )}

          {/* Access Notes */}
          <div>
            <Label>Access Notes (Gate Codes, etc.)</Label>
            {isEditing ? (
              <Textarea
                value={formData.accessNotes}
                onChange={(e) => setFormData({...formData, accessNotes: e.target.value})}
                placeholder="Gate codes, parking instructions..."
                rows={3}
              />
            ) : (
              <div className="mt-1 p-3 bg-gray-50 rounded text-sm">
                {event.accessNotes || 'None'}
              </div>
            )}
          </div>

          {/* Customer Notes */}
          <div>
            <Label>Customer Notes</Label>
            {isEditing ? (
              <Textarea
                value={formData.customerNotes}
                onChange={(e) => setFormData({...formData, customerNotes: e.target.value})}
                placeholder="Special instructions..."
                rows={3}
              />
            ) : (
              <div className="mt-1 p-3 bg-gray-50 rounded text-sm">
                {event.customerNotes || 'None'}
              </div>
            )}
          </div>

          {/* Reopen Success State */}
          {reopenSuccess && (
            <Card className="border-green-200 bg-green-50">
              <CardContent className="pt-4 pb-4">
                <div className="flex items-start gap-3">
                  <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-green-900">Visit reopened</p>
                    <p className="text-sm text-green-800 mt-1">
                      Technician can now continue service.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Reopen Error State */}
          {reopenMutation.isError && (
            <Card className="border-red-200 bg-red-50">
              <CardContent className="pt-4 pb-4">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-red-900">Reopen failed</p>
                    <p className="text-sm text-red-800 mt-1">
                      {reopenMutation.error?.message || 'Unable to reopen visit'}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Actions */}
          {isEditing ? (
            <div className="flex gap-2 pt-4 border-t">
              <Button
                onClick={handleSave}
                disabled={updateEventMutation.isPending}
                className="flex-1"
              >
                {updateEventMutation.isPending ? 'Saving...' : 'Save Changes'}
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setIsEditing(false);
                  setFormData({
                    timeWindow: event.timeWindow || '',
                    estimatedDuration: event.estimatedDuration || 30,
                    assignedTechnician: event.assignedTechnician || '',
                    isFixed: event.isFixed || false,
                    accessNotes: event.accessNotes || '',
                    customerNotes: event.customerNotes || ''
                  });
                }}
              >
                Cancel
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-2 pt-4 border-t">
              {event.rescheduleReason === 'access_issue' && event.status === 'scheduled' && !reopenSuccess && (
                <Button
                  onClick={handleReopenVisit}
                  disabled={reopenMutation.isPending}
                  className="bg-teal-600 hover:bg-teal-700"
                >
                  {reopenMutation.isPending ? 'Reopening...' : 'Reopen Visit'}
                </Button>
              )}
              <Button variant="outline" onClick={onClose} className="flex-1">
                Close
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}