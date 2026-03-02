import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Trash2, AlertTriangle, Shield } from 'lucide-react';
import { toast } from 'sonner';

const DOWNSTREAM_CHECKS = [
  { entity: 'Quote', label: 'Quotes', filterKey: 'clientEmail' },
  { entity: 'CalendarEvent', label: 'Calendar Events', filterKey: 'leadId' },
  { entity: 'Invoice', label: 'Invoices', filterKey: 'leadId' },
  { entity: 'ChemTestRecord', label: 'Chem Test Records', filterKey: 'leadId' },
  { entity: 'Pool', label: 'Pools', filterKey: 'leadId' },
  { entity: 'DosePlan', label: 'Dose Plans', filterKey: 'leadId' },
  { entity: 'RetestRecord', label: 'Retest Records', filterKey: 'leadId' },
  { entity: 'ChemistryRiskEvent', label: 'Risk Events', filterKey: 'leadId' },
  { entity: 'FrequencyRecommendation', label: 'Frequency Recs', filterKey: 'leadId' },
  { entity: 'CustomerNotificationLog', label: 'Notification Logs', filterKey: 'leadId' },
  { entity: 'MessageThread', label: 'Message Threads', filterKey: 'leadId' },
  { entity: 'Message', label: 'Messages', filterKey: 'leadId' }
];

export default function RemoveLeadPanel({ lead, onClose, onRemoved }) {
  const queryClient = useQueryClient();
  const [reason, setReason] = useState('');
  const [downstreamCounts, setDownstreamCounts] = useState(null);
  const [checking, setChecking] = useState(false);

  const checkDownstream = async () => {
    setChecking(true);
    const counts = {};
    for (const check of DOWNSTREAM_CHECKS) {
      try {
        const filter = check.filterKey === 'clientEmail'
          ? { clientEmail: lead.email }
          : { leadId: lead.id };
        const records = await base44.entities[check.entity].filter(filter, '-created_date', 1);
        counts[check.entity] = records.length;
      } catch {
        counts[check.entity] = 0;
      }
    }
    setDownstreamCounts(counts);
    setChecking(false);
  };

  useEffect(() => {
    checkDownstream();
  }, [lead.id]);

  const hasDownstream = downstreamCounts && Object.values(downstreamCounts).some(c => c > 0);
  const blockedEntities = downstreamCounts
    ? DOWNSTREAM_CHECKS.filter(c => downstreamCounts[c.entity] > 0)
    : [];

  const softDeleteMutation = useMutation({
    mutationFn: async () => {
      const response = await base44.functions.invoke('softDeleteLeadV2', {
        leadId: lead.id,
        reason: reason || undefined
      });
      return response.data;
    },
    onSuccess: (data) => {
      if (data.success) {
        toast.success(`Lead removed: ${data.leadId}`);
        queryClient.invalidateQueries({ queryKey: ['leads'] });
        queryClient.invalidateQueries({ queryKey: ['calendarEvents'] });
        queryClient.invalidateQueries({ queryKey: ['inspections'] });
        if (onRemoved) onRemoved();
        onClose();
      } else {
        toast.error(data.error || 'Failed to remove lead');
      }
    },
    onError: (error) => {
      toast.error(`Error: ${error.message || 'Failed to remove lead'}`);
    }
  });

  const hardDeleteMutation = useMutation({
    mutationFn: () => base44.entities.Lead.delete(lead.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      if (onRemoved) onRemoved();
      onClose();
    }
  });

  return (
    <div className="border border-red-200 rounded-lg p-4 bg-red-50 space-y-4">
      <div className="flex items-center gap-2 text-red-800 font-semibold">
        <Trash2 className="w-5 h-5" />
        Remove Lead
      </div>

      <div className="text-xs text-red-700 bg-red-100 rounded p-2">
        <strong>Soft delete</strong> hides this lead from all pipelines without affecting downstream records. It does <em>not</em> mark the lead as "lost".
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">Reason (optional)</label>
        <input
          type="text"
          value={reason}
          onChange={e => setReason(e.target.value)}
          placeholder="e.g. Duplicate, test lead, customer withdrew..."
          className="w-full border rounded px-3 py-2 text-sm"
        />
      </div>

      <div className="flex gap-2">
        <Button
          size="sm"
          onClick={() => softDeleteMutation.mutate()}
          disabled={softDeleteMutation.isPending}
          className="bg-red-600 hover:bg-red-700 text-white"
        >
          {softDeleteMutation.isPending ? 'Removing...' : 'Remove Lead (Soft Delete)'}
        </Button>
        <Button size="sm" variant="outline" onClick={onClose}>Cancel</Button>
      </div>

      {/* Hard Delete Section */}
      <div className="border-t pt-4 mt-2">
        <div className="flex items-center gap-2 text-xs font-semibold text-gray-600 mb-2">
          <Shield className="w-4 h-4" />
          Hard Delete (Permanent)
        </div>

        {checking && (
          <p className="text-xs text-gray-500">Checking downstream records...</p>
        )}

        {downstreamCounts && hasDownstream && (
          <div className="bg-gray-100 rounded p-3 space-y-1">
            <p className="text-xs font-medium text-gray-700 mb-2">
              <AlertTriangle className="w-3 h-3 inline mr-1 text-orange-600" />
              Hard delete blocked — downstream records exist:
            </p>
            {blockedEntities.map(c => (
              <div key={c.entity} className="text-xs text-gray-600 flex gap-2">
                <span className="text-orange-600">•</span>
                <span>{c.label}</span>
              </div>
            ))}
            <p className="text-xs text-gray-500 mt-2">Use soft delete instead, or manually remove all linked records first.</p>
          </div>
        )}

        {downstreamCounts && !hasDownstream && (
          <div className="space-y-2">
            <p className="text-xs text-green-700 bg-green-50 border border-green-200 rounded p-2">
              ✓ No downstream records found. Hard delete is available.
            </p>
            <Button
              size="sm"
              variant="outline"
              className="border-red-300 text-red-700 hover:bg-red-50"
              onClick={() => {
                if (window.confirm(`Permanently delete lead "${lead.firstName} ${lead.lastName}"? This cannot be undone.`)) {
                  hardDeleteMutation.mutate();
                }
              }}
              disabled={hardDeleteMutation.isPending}
            >
              {hardDeleteMutation.isPending ? 'Deleting...' : 'Permanently Delete'}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}