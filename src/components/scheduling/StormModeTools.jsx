import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Cloud, AlertTriangle, Calendar, Send } from 'lucide-react';

export default function StormModeTools({ currentDate, onClose }) {
  const [stormDate, setStormDate] = useState(currentDate.toISOString().split('T')[0]);
  const [severity, setSeverity] = useState('advisory');
  const [reason, setReason] = useState('Severe weather conditions');
  const [rescheduleToDate, setRescheduleToDate] = useState('');
  const [sendNotifications, setSendNotifications] = useState(true);
  const queryClient = useQueryClient();

  const { data: eventsOnDate = [] } = useQuery({
    queryKey: ['stormDayEvents', stormDate],
    queryFn: () => base44.entities.CalendarEvent.filter({ scheduledDate: stormDate })
  });

  const markStormDayMutation = useMutation({
    mutationFn: async () => {
      const response = await base44.functions.invoke('markStormDay', {
        date: stormDate,
        severity,
        reason,
        sendNotifications
      });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calendarEvents'] });
      queryClient.invalidateQueries({ queryKey: ['stormDays'] });
      alert('Storm day marked successfully!');
    }
  });

  const bulkRescheduleMutation = useMutation({
    mutationFn: async () => {
      const response = await base44.functions.invoke('bulkReschedule', {
        fromDate: stormDate,
        toDate: rescheduleToDate,
        sendNotifications
      });
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['calendarEvents'] });
      alert(`Successfully rescheduled ${data.rescheduledCount} events!`);
      setRescheduleToDate('');
    }
  });

  return (
    <Card className="border-orange-200 bg-orange-50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Cloud className="w-5 h-5 text-orange-600" />
          Storm/Weather Reschedule Mode
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <Alert className="bg-orange-100 border-orange-300">
          <AlertTriangle className="h-5 w-5 text-orange-600" />
          <AlertDescription className="text-orange-900">
            Use these tools to mark storm days and bulk reschedule affected appointments.
            Customers will be notified automatically.
          </AlertDescription>
        </Alert>

        {/* Mark Storm Day */}
        <div className="space-y-4 border-b pb-6">
          <h3 className="font-semibold text-lg">1. Mark Storm Day</h3>
          
          <div>
            <Label>Date</Label>
            <Input
              type="date"
              value={stormDate}
              onChange={(e) => setStormDate(e.target.value)}
            />
          </div>

          <div>
            <Label>Severity</Label>
            <select
              value={severity}
              onChange={(e) => setSeverity(e.target.value)}
              className="w-full border rounded px-3 py-2"
            >
              <option value="advisory">Advisory</option>
              <option value="warning">Warning</option>
              <option value="severe">Severe</option>
            </select>
          </div>

          <div>
            <Label>Reason</Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Hurricane warning, Severe thunderstorms..."
              rows={2}
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="sendNotifications"
              checked={sendNotifications}
              onChange={(e) => setSendNotifications(e.target.checked)}
              className="rounded"
            />
            <Label htmlFor="sendNotifications" className="font-normal">
              Send storm advisory to affected customers
            </Label>
          </div>

          {eventsOnDate.length > 0 && (
            <Alert>
              <AlertDescription>
                <strong>{eventsOnDate.length} events</strong> scheduled on this date will be marked as storm impacted.
              </AlertDescription>
            </Alert>
          )}

          <Button
            onClick={() => markStormDayMutation.mutate()}
            disabled={markStormDayMutation.isPending || !stormDate}
            className="w-full bg-orange-600 hover:bg-orange-700"
          >
            {markStormDayMutation.isPending ? 'Marking...' : 'Mark as Storm Day'}
          </Button>
        </div>

        {/* Bulk Reschedule */}
        <div className="space-y-4">
          <h3 className="font-semibold text-lg">2. Bulk Reschedule</h3>
          
          <div>
            <Label>Reschedule TO Date</Label>
            <Input
              type="date"
              value={rescheduleToDate}
              onChange={(e) => setRescheduleToDate(e.target.value)}
              min={stormDate}
            />
            <p className="text-xs text-gray-600 mt-1">
              Jobs will be rescheduled to this date or later, respecting customer preferences
            </p>
          </div>

          <Button
            onClick={() => bulkRescheduleMutation.mutate()}
            disabled={bulkRescheduleMutation.isPending || !rescheduleToDate}
            className="w-full bg-teal-600 hover:bg-teal-700"
          >
            <Send className="w-4 h-4 mr-2" />
            {bulkRescheduleMutation.isPending ? 'Rescheduling...' : 'Bulk Reschedule Storm Impacted Jobs'}
          </Button>
        </div>

        <Button variant="outline" onClick={onClose} className="w-full">
          Close Storm Tools
        </Button>
      </CardContent>
    </Card>
  );
}