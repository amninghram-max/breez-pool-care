import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { base44 } from '@/api/base44Client';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { AlertTriangle, RotateCcw, XCircle, Archive, CalendarPlus, CheckCircle } from 'lucide-react';

export default function UnstickLeadPanel({ lead, onClose, onUpdated }) {
  const [action, setAction] = useState(null);
  const [targetStage, setTargetStage] = useState('contacted');
  const [inspectionDate, setInspectionDate] = useState('');
  const [inspectionTime, setInspectionTime] = useState('');
  const [result, setResult] = useState(null);
  const queryClient = useQueryClient();

  const unstickMutation = useMutation({
    mutationFn: (payload) => base44.functions.invoke('unstickLead', payload),
    onSuccess: (res) => {
      setResult({ success: true, note: res.data?.auditNote });
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      if (onUpdated) onUpdated();
    },
    onError: (err) => {
      setResult({ success: false, error: err.message });
    }
  });

  const handleExecute = () => {
    const payload = {
      leadId: lead.id,
      action,
      targetStage: action === 'reset_stage' ? targetStage : undefined,
      inspectionDate: action === 'force_create_event' ? inspectionDate : undefined,
      inspectionTime: action === 'force_create_event' ? inspectionTime : undefined
    };
    unstickMutation.mutate(payload);
  };

  if (result) {
    return (
      <div className="border rounded-lg p-4 bg-gray-50 space-y-3">
        <div className={`flex items-center gap-2 font-medium ${result.success ? 'text-green-700' : 'text-red-700'}`}>
          {result.success ? <CheckCircle className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
          {result.success ? 'Action completed' : 'Action failed'}
        </div>
        {result.note && <p className="text-xs text-gray-600 font-mono bg-white border rounded p-2">{result.note}</p>}
        {result.error && <p className="text-xs text-red-600">{result.error}</p>}
        <Button size="sm" variant="outline" onClick={onClose}>Close</Button>
      </div>
    );
  }

  return (
    <div className="border border-orange-200 rounded-lg p-4 bg-orange-50 space-y-4">
      <div className="flex items-center gap-2 text-orange-800 font-semibold">
        <AlertTriangle className="w-5 h-5" />
        Admin: Unstick Lead
      </div>

      <div className="text-xs text-orange-700 bg-orange-100 rounded p-2">
        Lead is in <strong>inspection_scheduled</strong>.
        {lead.inspectionEventId
          ? ` Linked event: ${lead.inspectionEventId}`
          : ' ⚠ No inspectionEventId — may be stuck.'}
      </div>

      {/* Action selection */}
      <div className="space-y-2">
        {[
          { key: 'reset_stage', label: 'Reset Stage', icon: RotateCcw, desc: 'Move back to a prior stage' },
          { key: 'mark_not_scheduled', label: 'Mark Not Scheduled', icon: XCircle, desc: 'Clear inspection data, return to Contacted' },
          { key: 'archive', label: 'Archive Lead', icon: Archive, desc: 'Soft-archive this lead (mark Lost)' },
          { key: 'force_create_event', label: 'Force Create Inspection Event', icon: CalendarPlus, desc: 'Create a new CalendarEvent and confirm scheduling' }
        ].map(({ key, label, icon: Icon, desc }) => (
          <button
            key={key}
            onClick={() => setAction(key)}
            className={`w-full text-left flex items-start gap-3 p-3 rounded-lg border transition-colors ${
              action === key
                ? 'border-orange-500 bg-white shadow-sm'
                : 'border-gray-200 bg-white hover:border-orange-300'
            }`}
          >
            <Icon className={`w-4 h-4 mt-0.5 flex-shrink-0 ${action === key ? 'text-orange-600' : 'text-gray-400'}`} />
            <div>
              <p className={`text-sm font-medium ${action === key ? 'text-orange-800' : 'text-gray-700'}`}>{label}</p>
              <p className="text-xs text-gray-500">{desc}</p>
            </div>
          </button>
        ))}
      </div>

      {/* Sub-options */}
      {action === 'reset_stage' && (
        <div className="space-y-1">
          <label className="text-xs font-medium text-gray-700">Reset to stage:</label>
          <select
            value={targetStage}
            onChange={(e) => setTargetStage(e.target.value)}
            className="w-full border rounded px-3 py-2 text-sm"
          >
            <option value="new_lead">New Lead</option>
            <option value="contacted">Contacted</option>
          </select>
        </div>
      )}

      {action === 'force_create_event' && (
        <div className="space-y-2">
          <div>
            <label className="text-xs font-medium text-gray-700">Inspection Date *</label>
            <input
              type="date"
              value={inspectionDate}
              onChange={(e) => setInspectionDate(e.target.value)}
              className="w-full border rounded px-3 py-2 text-sm mt-1"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-700">Time Window</label>
            <input
              type="text"
              placeholder="e.g. 9:00 AM - 11:00 AM"
              value={inspectionTime}
              onChange={(e) => setInspectionTime(e.target.value)}
              className="w-full border rounded px-3 py-2 text-sm mt-1"
            />
          </div>
        </div>
      )}

      {/* Execute */}
      <div className="flex gap-2 pt-2">
        <Button
          size="sm"
          onClick={handleExecute}
          disabled={
            !action ||
            unstickMutation.isPending ||
            (action === 'force_create_event' && !inspectionDate)
          }
          className="bg-orange-600 hover:bg-orange-700 text-white"
        >
          {unstickMutation.isPending ? 'Working...' : 'Execute Action'}
        </Button>
        <Button size="sm" variant="outline" onClick={onClose}>Cancel</Button>
      </div>
    </div>
  );
}