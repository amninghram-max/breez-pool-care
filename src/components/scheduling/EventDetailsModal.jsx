import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { MapPin, Clock, User, Lock, Navigation } from 'lucide-react';

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
  const queryClient = useQueryClient();

  const updateEventMutation = useMutation({
    mutationFn: async (updates) => {
      await base44.entities.CalendarEvent.update(event.id, updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calendarEvents'] });
      setIsEditing(false);
      onClose();
    }
  });

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
            <div className="flex gap-2 pt-4 border-t">
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