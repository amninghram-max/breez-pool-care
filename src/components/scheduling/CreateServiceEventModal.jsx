import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { createPageUrl } from '@/utils';

/**
 * Admin-only modal to create a single service CalendarEvent for a Lead.
 * Used exclusively for manual Scenario C test fixtures.
 * Does NOT create recurring schedules or apply any activation/payment gates.
 */
export default function CreateServiceEventModal({ date, onClose }) {
  const queryClient = useQueryClient();
  const [leadId, setLeadId] = useState('');
  const [scheduledDate, setScheduledDate] = useState(date?.toISOString().split('T')[0] || '');
  const [serviceAddress, setServiceAddress] = useState('');
  const [assignedTechnician, setAssignedTechnician] = useState('Matt');
  const [createdEvent, setCreatedEvent] = useState(null);

  const { data: leads = [] } = useQuery({
    queryKey: ['leads-slim'],
    queryFn: () => base44.entities.Lead.list('-created_date', 200),
  });

  // When a lead is selected, auto-fill service address
  const handleLeadChange = (e) => {
    const id = e.target.value;
    setLeadId(id);
    const lead = leads.find(l => l.id === id);
    if (lead) {
      const addr = lead.serviceAddress ||
        [lead.streetAddress, lead.city, lead.state, lead.zipCode].filter(Boolean).join(', ');
      setServiceAddress(addr);
    } else {
      setServiceAddress('');
    }
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      const response = await base44.functions.invoke('createCalendarEventAdmin', {
        leadId,
        scheduledDate,
        serviceAddress,
        assignedTechnician: assignedTechnician || 'Matt',
      });
      if (!response.data?.success) {
        throw new Error(response.data?.error || 'Failed to create event');
      }
      return response.data.event;
    },
    onSuccess: (event) => {
      queryClient.invalidateQueries({ queryKey: ['calendarEvents'] });
      setCreatedEvent(event);
    }
  });

  const canSubmit = leadId && scheduledDate && serviceAddress;

  // After creation: find the pool for this lead so we can show full launch URL
  const { data: pools = [] } = useQuery({
    queryKey: ['pools-for-lead', leadId],
    queryFn: () => base44.entities.Pool.filter({ leadId }),
    enabled: !!leadId && !!createdEvent,
  });
  const pool = pools[0];

  const launchUrl = createdEvent
    ? createPageUrl('ServiceVisitFlow') +
      `?eventId=${createdEvent.id}` +
      (pool ? `&poolId=${pool.id}` : '')
    : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Add Single Service Event</h2>
            <p className="text-xs text-gray-500 mt-0.5">Admin only — manual test fixture use</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl font-bold leading-none">×</button>
        </div>

        {!createdEvent ? (
          <div className="space-y-4">
            {/* Lead */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Lead *</label>
              <select
                value={leadId}
                onChange={handleLeadChange}
                className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              >
                <option value="">Select a lead...</option>
                {leads.filter(l => !l.isDeleted).map(l => (
                  <option key={l.id} value={l.id}>
                    {l.firstName} {l.lastName} — {l.serviceAddress || l.streetAddress || l.email}
                  </option>
                ))}
              </select>
            </div>

            {/* Date */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Scheduled Date *</label>
              <input
                type="date"
                value={scheduledDate}
                onChange={e => setScheduledDate(e.target.value)}
                className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>

            {/* Service Address */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Service Address *</label>
              <input
                type="text"
                value={serviceAddress}
                onChange={e => setServiceAddress(e.target.value)}
                placeholder="Auto-filled from lead"
                className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>

            {/* Technician */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Assigned Technician</label>
              <input
                type="text"
                value={assignedTechnician}
                onChange={e => setAssignedTechnician(e.target.value)}
                className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>

            {createMutation.isError && (
              <p className="text-sm text-red-600">Error: {createMutation.error?.message}</p>
            )}

            <div className="flex gap-2 pt-1">
              <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
              <Button
                className="flex-1 bg-teal-600 hover:bg-teal-700"
                disabled={!canSubmit || createMutation.isPending}
                onClick={() => createMutation.mutate()}
              >
                {createMutation.isPending ? 'Creating...' : 'Create Event'}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <p className="text-sm font-semibold text-green-800">Event created successfully</p>
              <p className="text-xs text-green-700 mt-1">Event ID: <code className="font-mono bg-green-100 px-1 rounded">{createdEvent.id}</code></p>
            </div>

            {launchUrl && (
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 space-y-2">
                <p className="text-sm font-semibold text-gray-800">Launch ServiceVisitFlow</p>
                <p className="text-xs text-gray-500 font-mono break-all">{launchUrl}</p>
                {!pool && (
                  <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1 mt-1">
                    ⚠️ No Pool record found for this Lead. Create a Pool first via Equipment Profile, then re-launch with poolId in the URL.
                  </p>
                )}
                <Button
                  className="w-full bg-teal-600 hover:bg-teal-700 mt-2"
                  onClick={() => window.open(launchUrl, '_blank')}
                >
                  Launch Visit Flow →
                </Button>
              </div>
            )}

            <Button variant="outline" className="w-full" onClick={onClose}>Done</Button>
          </div>
        )}
      </div>
    </div>
  );
}