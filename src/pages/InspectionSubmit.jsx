import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Users, ClipboardList } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import InspectionSubmitForm from '../components/inspection/InspectionSubmitForm';

/**
 * Technician / staff / admin page to submit inspection data for a lead.
 * Shows today's inspection events and allows picking one to submit.
 */
export default function InspectionSubmit() {
  const [selectedLead, setSelectedLead] = useState(null);
  const [selectedEvent, setSelectedEvent] = useState(null);

  const queryClient = useQueryClient();

  const { data: user } = useQuery({
    queryKey: ['user'],
    queryFn: () => base44.auth.me(),
  });

  // Load scheduled inspection events
  const { data: inspectionEvents = [], isLoading: loadingEvents } = useQuery({
    queryKey: ['inspectionEvents'],
    queryFn: () =>
      base44.entities.CalendarEvent.filter(
        { eventType: 'inspection', status: 'scheduled' },
        'scheduledDate',
        50
      ),
    refetchInterval: 10000,
  });

  const { data: leads = [] } = useQuery({
    queryKey: ['leadsForInspection'],
    queryFn: () => base44.entities.Lead.list('-created_date', 200),
  });

  const allowedRoles = ['admin', 'staff', 'technician'];
  if (user && !allowedRoles.includes(user.role)) {
    return (
      <div className="max-w-xl mx-auto py-20 text-center">
        <p className="text-gray-500">Access denied.</p>
      </div>
    );
  }

  const handleSelect = (event) => {
    const lead = leads.find(l => l.id === event.leadId);
    setSelectedEvent(event);
    setSelectedLead(lead || null);
  };

  if (selectedLead) {
    return (
      <div className="max-w-xl mx-auto space-y-4">
        <button
          onClick={() => { setSelectedLead(null); setSelectedEvent(null); }}
          className="text-sm text-teal-600 hover:underline"
        >
          ← Back to inspection list
        </button>
        <InspectionSubmitForm
          lead={selectedLead}
          calendarEvent={selectedEvent}
          onSubmitted={() => {
            // Invalidate queries so the list & admin dashboard refresh
            queryClient.invalidateQueries({ queryKey: ['inspectionEvents'] });
            queryClient.invalidateQueries({ queryKey: ['pendingInspections'] });
            queryClient.invalidateQueries({ queryKey: ['leadsMinimal'] });
            queryClient.invalidateQueries({ queryKey: ['leadsForInspection'] });
            // Don't navigate away – show success screen within the form
          }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Submit Inspection</h1>
        <p className="text-sm text-gray-500 mt-0.5">Select an inspection to submit data</p>
      </div>

      {loadingEvents ? (
        <p className="text-gray-400 text-sm">Loading...</p>
      ) : inspectionEvents.length === 0 ? (
        <Card className="border-dashed border-2">
          <CardContent className="py-16 text-center">
            <ClipboardList className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-400 text-sm">No scheduled inspections found</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {inspectionEvents.map(event => {
            const lead = leads.find(l => l.id === event.leadId);
            return (
              <Card
                key={event.id}
                className="cursor-pointer hover:shadow-md transition-all"
                onClick={() => handleSelect(event)}
              >
                <CardContent className="p-4 flex items-center justify-between">
                  <div className="space-y-1">
                    <p className="font-semibold text-gray-900">
                      {lead ? `${lead.firstName} ${lead.lastName}` : 'Unknown Lead'}
                    </p>
                    <p className="text-sm text-gray-500">{lead?.serviceAddress}</p>
                    <p className="text-xs text-gray-400">
                      {event.scheduledDate ? format(parseISO(event.scheduledDate), 'EEE, MMM d') : 'Date TBD'}
                      {event.timeWindow ? ` · ${event.timeWindow}` : ''}
                    </p>
                  </div>
                  <Badge className="bg-teal-100 text-teal-800">Submit</Badge>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}