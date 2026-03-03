import React, { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Cloud, AlertTriangle, Send, Eye, EyeOff, ChevronRight, Info, History, RotateCcw } from 'lucide-react';

const EVENT_TYPES = [
  { value: 'inspection', label: 'Inspection', icon: '🔍', priority: 'high' },
  { value: 'service', label: 'Service', icon: '🏊', priority: 'normal' },
  { value: 'cleanup', label: 'Cleanup', icon: '🧹', priority: 'normal' },
  { value: 'green_recovery', label: 'Green Recovery', icon: '🌱', priority: 'normal' },
];

const POLICY_OPTIONS = [
  { value: 'shift_day', label: 'Shift +1 Day', description: 'Move all events to next day' },
  { value: 'next_available', label: 'Next Available', description: 'Find next open slot per event' },
  { value: 'manual_review', label: 'Mark Manual Review', description: 'Flag events for supervisor action' },
];

function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().split('T')[0];
}

function todayStr() {
  return new Date().toISOString().split('T')[0];
}

export default function StormModeTools({ currentDate, onClose }) {
  const today = currentDate.toISOString().split('T')[0];

  // --- Storm marking state ---
  const [stormDate, setStormDate] = useState(today);
  const [severity, setSeverity] = useState('advisory');
  const [reason, setReason] = useState('Severe weather conditions');
  const [sendNotifications, setSendNotifications] = useState(true);

  // --- Planning range + filters ---
  const [fromDate, setFromDate] = useState(today);
  const [toDate, setToDate] = useState(addDays(today, 3));
  const [selectedEventTypes, setSelectedEventTypes] = useState(
    EVENT_TYPES.map(t => t.value)
  );
  const [technicianFilter, setTechnicianFilter] = useState('all');

  // --- Dry run + action ---
  const [dryRun, setDryRun] = useState(true);
  const [selectedPolicy, setSelectedPolicy] = useState('shift_day');
  const [rescheduleToDate, setRescheduleToDate] = useState('');

  // --- Confirmation modal ---
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showAuditModal, setShowAuditModal] = useState(false);
  const [undoConfirmData, setUndoConfirmData] = useState(null);

  const queryClient = useQueryClient();

  // Load settings for technician list
  const { data: settings } = useQuery({
    queryKey: ['schedulingSettings'],
    queryFn: async () => {
      const result = await base44.entities.SchedulingSettings.filter({ settingKey: 'default' });
      return result[0] || {};
    }
  });
  const technicians = settings?.technicians?.filter(t => t.active) || [];

  // Load audit log entries
  const { data: auditEntries = [], isLoading: auditLoading, error: auditError, refetch: refetchAudit } = useQuery({
    queryKey: ['stormBatchAudit'],
    queryFn: async () => {
      try {
        const entries = await base44.asServiceRole.entities.AnalyticsEvent.filter({
          eventName: 'storm_batch_audit'
        }, '-created_date', 50);
        return entries;
      } catch (err) {
        console.error('Failed to load audit log:', err);
        throw err;
      }
    },
    enabled: showAuditModal
  });

  // Load events in the selected date range
  const { data: allEvents = [], isLoading: eventsLoading } = useQuery({
    queryKey: ['stormRangeEvents', fromDate, toDate],
    queryFn: async () => {
      // Fetch all events in range by querying each date (simple, no new API needed)
      const days = [];
      let d = new Date(fromDate + 'T00:00:00');
      const end = new Date(toDate + 'T00:00:00');
      while (d <= end) {
        days.push(d.toISOString().split('T')[0]);
        d.setDate(d.getDate() + 1);
      }
      const results = await Promise.all(
        days.map(day => base44.entities.CalendarEvent.filter({ scheduledDate: day }))
      );
      return results.flat();
    },
    enabled: !!fromDate && !!toDate
  });

  // Load events for the storm-marking date (existing behavior)
  const { data: eventsOnStormDate = [] } = useQuery({
    queryKey: ['stormDayEvents', stormDate],
    queryFn: () => base44.entities.CalendarEvent.filter({ scheduledDate: stormDate })
  });

  // --- Derived preview counts ---
  const filteredEvents = useMemo(() => {
    return allEvents.filter(e => {
      if (e.status === 'cancelled') return false;
      if (selectedEventTypes.length > 0 && !selectedEventTypes.includes(e.eventType)) return false;
      if (technicianFilter !== 'all' && e.assignedTechnician !== technicianFilter) return false;
      return true;
    });
  }, [allEvents, selectedEventTypes, technicianFilter]);

  const inspectionCount = filteredEvents.filter(e => e.eventType === 'inspection').length;
  const hasInspections = inspectionCount > 0;
  // Simple estimate: pending reschedule events are skipped in bulk
  const estimatedApply = filteredEvents.filter(e => e.status !== 'needs_reschedule').length;
  const estimatedSkipped = filteredEvents.length - estimatedApply;
  const warnings = [
    hasInspections && `${inspectionCount} inspection event${inspectionCount > 1 ? 's' : ''} included — verify next-available slots before apply.`,
    estimatedSkipped > 0 && `${estimatedSkipped} event${estimatedSkipped > 1 ? 's' : ''} with pending reschedule will be skipped.`,
  ].filter(Boolean);

  // --- Mutations (unchanged from original) ---
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
      queryClient.invalidateQueries({ queryKey: ['stormRangeEvents'] });
      alert(`Successfully rescheduled ${data.rescheduledCount} events!`);
      setRescheduleToDate('');
    }
  });

  const undoBatchMutation = useMutation({
    mutationFn: async (batchEventId) => {
      const response = await base44.functions.invoke('undoStormBatchV1', {
        batchEventId
      });
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['stormBatchAudit'] });
      queryClient.invalidateQueries({ queryKey: ['calendarEvents'] });
      setUndoConfirmData(null);
      alert(`Undo complete: ${data.undoneCount} restored, ${data.skippedCount} skipped.`);
    },
    onError: (error) => {
      console.error('Undo failed:', error);
      alert(`Undo failed: ${error.message}`);
    }
  });

  const toggleEventType = (type) => {
    setSelectedEventTypes(prev =>
      prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]
    );
  };

  const handleActionClick = (policy) => {
    setSelectedPolicy(policy);
    if (dryRun) {
      // Dry run: just show preview (no write)
      // Preview panel is always visible; this highlights the selected policy
      return;
    }
    // Non-dry run: open confirmation modal
    setShowConfirmModal(true);
  };

  const handleConfirmApply = () => {
    setShowConfirmModal(false);
    // Only shift_day uses existing bulkReschedule backend; others show alert for now
    if (selectedPolicy === 'shift_day') {
      // Use stormDate as fromDate and rescheduleToDate as toDate for existing backend
      bulkRescheduleMutation.mutate();
    } else {
      alert(`Policy "${selectedPolicy}" will be wired in Phase 2. No changes made.`);
    }
  };

  const policyLabel = POLICY_OPTIONS.find(p => p.value === selectedPolicy)?.label || selectedPolicy;

  return (
    <Card className="border-orange-200 bg-orange-50">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Cloud className="w-5 h-5 text-orange-600" />
            Storm/Weather Reschedule Mode
          </CardTitle>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowAuditModal(true)}
              className="p-1.5 text-gray-500 hover:bg-orange-100 rounded-lg transition-colors"
              title="View storm batch audit log"
              aria-label="View audit log"
            >
              <History className="w-5 h-5" />
            </button>
            <button
              onClick={onClose}
              aria-label="Close Storm Mode"
              className="text-gray-400 hover:text-gray-700 text-lg leading-none"
            >
              ✕
            </button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <Alert className="bg-orange-100 border-orange-300">
          <AlertTriangle className="h-5 w-5 text-orange-600" />
          <AlertDescription className="text-orange-900">
            Use these tools to mark storm days and bulk reschedule affected appointments.
            Customers will be notified automatically.
          </AlertDescription>
        </Alert>

        {/* ── SECTION 1: Mark Storm Day ───────────────────────────── */}
        <div className="space-y-4 border-b border-orange-200 pb-6">
          <h3 className="font-semibold text-lg">1. Mark Storm Day</h3>

          <div>
            <Label htmlFor="storm-date">Date</Label>
            <Input
              id="storm-date"
              type="date"
              value={stormDate}
              onChange={(e) => setStormDate(e.target.value)}
            />
          </div>

          <div>
            <Label htmlFor="storm-severity">Severity</Label>
            <select
              id="storm-severity"
              value={severity}
              onChange={(e) => setSeverity(e.target.value)}
              className="w-full border rounded px-3 py-2 bg-white"
            >
              <option value="advisory">Advisory</option>
              <option value="warning">Warning</option>
              <option value="severe">Severe</option>
            </select>
          </div>

          <div>
            <Label htmlFor="storm-reason">Reason</Label>
            <Textarea
              id="storm-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Hurricane warning, Severe thunderstorms..."
              rows={2}
            />
          </div>

          <label className="flex items-center gap-2 cursor-pointer text-sm">
            <input
              type="checkbox"
              checked={sendNotifications}
              onChange={(e) => setSendNotifications(e.target.checked)}
              className="rounded"
            />
            Send storm advisory to affected customers
          </label>

          {eventsOnStormDate.length > 0 && (
            <Alert>
              <AlertDescription>
                <strong>{eventsOnStormDate.length} events</strong> scheduled on this date will be marked as storm impacted.
              </AlertDescription>
            </Alert>
          )}

          <Button
            onClick={() => markStormDayMutation.mutate()}
            disabled={markStormDayMutation.isPending || !stormDate}
            className="w-full bg-orange-600 hover:bg-orange-700"
          >
            {markStormDayMutation.isPending ? 'Marking…' : 'Mark as Storm Day'}
          </Button>
        </div>

        {/* ── SECTION 2: Planning Range + Filters ─────────────────── */}
        <div className="space-y-4 border-b border-orange-200 pb-6">
          <h3 className="font-semibold text-lg">2. Plan Reschedule</h3>

          {/* Date range */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label htmlFor="from-date">From Date</Label>
              <Input
                id="from-date"
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="to-date">To Date</Label>
              <Input
                id="to-date"
                type="date"
                value={toDate}
                min={fromDate}
                onChange={(e) => setToDate(e.target.value)}
              />
            </div>
          </div>

          {/* Event type checkboxes + technician filter in one row */}
          <div className="flex flex-wrap items-start gap-4">
            <div className="flex-1 min-w-[220px]">
              <Label className="block mb-1">Event Types</Label>
              <div className="flex flex-wrap gap-2">
                {EVENT_TYPES.map(et => (
                  <label
                    key={et.value}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border cursor-pointer text-sm transition-colors ${
                      selectedEventTypes.includes(et.value)
                        ? 'bg-orange-100 border-orange-400 text-orange-900'
                        : 'bg-white border-gray-300 text-gray-600'
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="sr-only"
                      checked={selectedEventTypes.includes(et.value)}
                      onChange={() => toggleEventType(et.value)}
                      aria-label={et.label}
                    />
                    {et.icon} {et.label}
                    {et.priority === 'high' && (
                      <Badge className="ml-1 bg-red-100 text-red-700 text-xs px-1 py-0">High</Badge>
                    )}
                  </label>
                ))}
              </div>
            </div>

            <div className="min-w-[160px]">
              <Label htmlFor="tech-filter">Technician</Label>
              <select
                id="tech-filter"
                value={technicianFilter}
                onChange={(e) => setTechnicianFilter(e.target.value)}
                className="w-full border rounded px-3 py-2 bg-white text-sm"
              >
                <option value="all">All Technicians</option>
                {technicians.map(t => (
                  <option key={t.name} value={t.name}>{t.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Inspection helper text */}
          {hasInspections && (
            <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
              <Info className="w-4 h-4 mt-0.5 shrink-0" />
              <span>Inspection events are higher priority; verify next-available slots before apply.</span>
            </div>
          )}
        </div>

        {/* ── SECTION 3: Dry Run Toggle + Preview ─────────────────── */}
        <div className="space-y-4 border-b border-orange-200 pb-6">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-lg">3. Preview & Apply</h3>
            <label className="flex items-center gap-2 cursor-pointer text-sm font-medium">
              <span className="text-gray-600">Dry Run</span>
              <button
                role="switch"
                aria-checked={dryRun}
                onClick={() => setDryRun(v => !v)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-orange-400 ${
                  dryRun ? 'bg-orange-500' : 'bg-gray-300'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    dryRun ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
              {dryRun ? (
                <span className="text-orange-700 flex items-center gap-1"><Eye className="w-4 h-4" /> Preview Only</span>
              ) : (
                <span className="text-gray-500 flex items-center gap-1"><EyeOff className="w-4 h-4" /> Live Apply</span>
              )}
            </label>
          </div>

          {/* Preview panel — always visible */}
          <div className="bg-white border border-orange-200 rounded-xl p-4 space-y-3">
            <p className="text-xs text-gray-400 italic">Preview estimate (final conflicts checked on apply)</p>
            {eventsLoading ? (
              <p className="text-sm text-gray-500">Loading events…</p>
            ) : (
              <>
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div className="bg-gray-50 rounded-lg p-2">
                    <div className="text-2xl font-bold text-gray-800">{filteredEvents.length}</div>
                    <div className="text-xs text-gray-500">Selected</div>
                  </div>
                  <div className="bg-green-50 rounded-lg p-2">
                    <div className="text-2xl font-bold text-green-700">{estimatedApply}</div>
                    <div className="text-xs text-gray-500">Est. Apply</div>
                  </div>
                  <div className="bg-yellow-50 rounded-lg p-2">
                    <div className="text-2xl font-bold text-yellow-700">{estimatedSkipped}</div>
                    <div className="text-xs text-gray-500">Est. Skip</div>
                  </div>
                </div>
                {warnings.length > 0 && (
                  <div className="space-y-1.5">
                    {warnings.map((w, i) => (
                      <div key={i} className="flex items-start gap-2 text-sm text-amber-700 bg-amber-50 rounded p-2">
                        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                        {w}
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Policy action buttons */}
          <div className="space-y-2">
            {POLICY_OPTIONS.map(policy => (
              <button
                key={policy.value}
                onClick={() => handleActionClick(policy.value)}
                disabled={filteredEvents.length === 0}
                className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border-2 text-left transition-all disabled:opacity-40 ${
                  selectedPolicy === policy.value && !dryRun
                    ? 'border-orange-500 bg-orange-50'
                    : 'border-gray-200 bg-white hover:border-orange-300'
                }`}
                aria-label={policy.label}
              >
                <div>
                  <div className="font-medium text-gray-900 text-sm">{policy.label}</div>
                  <div className="text-xs text-gray-500">{policy.description}</div>
                </div>
                <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />
              </button>
            ))}
          </div>

          {dryRun && filteredEvents.length > 0 && (
            <p className="text-xs text-center text-orange-700 bg-orange-100 rounded-lg p-2">
              Dry Run is ON — clicking an action shows a preview only. Toggle off to apply changes.
            </p>
          )}
        </div>

        {/* ── SECTION 4: Legacy Bulk Reschedule (non-dry-run path) ── */}
        {!dryRun && (
          <div className="space-y-4">
            <h3 className="font-semibold text-lg">4. Reschedule Target Date</h3>
            <div>
              <Label htmlFor="reschedule-to">Reschedule TO Date</Label>
              <Input
                id="reschedule-to"
                type="date"
                value={rescheduleToDate}
                onChange={(e) => setRescheduleToDate(e.target.value)}
                min={stormDate}
              />
              <p className="text-xs text-gray-600 mt-1">
                Jobs will be rescheduled to this date, respecting customer preferences.
              </p>
            </div>
          </div>
        )}

        <Button variant="outline" onClick={onClose} className="w-full">
          Close Storm Tools
        </Button>
      </CardContent>

      {/* ── Confirmation Modal ──────────────────────────────────── */}
      <Dialog open={showConfirmModal} onOpenChange={setShowConfirmModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-orange-600" />
              Confirm Bulk Reschedule
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <div className="bg-gray-50 rounded-lg p-3 space-y-1.5">
              <div className="flex justify-between">
                <span className="text-gray-500">Events to reschedule</span>
                <strong>{filteredEvents.length}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Estimated apply</span>
                <strong className="text-green-700">{estimatedApply}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Estimated skip</span>
                <strong className="text-yellow-700">{estimatedSkipped}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Policy</span>
                <strong>{policyLabel}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Date range</span>
                <strong>{fromDate} → {toDate}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Filters</span>
                <span className="text-right">{selectedEventTypes.join(', ')} · {technicianFilter === 'all' ? 'All techs' : technicianFilter}</span>
              </div>
            </div>
            {warnings.length > 0 && (
              <div className="space-y-1">
                {warnings.map((w, i) => (
                  <div key={i} className="flex items-start gap-2 text-amber-700 bg-amber-50 rounded p-2">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    {w}
                  </div>
                ))}
              </div>
            )}
            <p className="text-gray-500 text-xs">This action will write to the database. Notifications will be sent if enabled above.</p>
          </div>
          <DialogFooter className="flex gap-2">
            <Button variant="outline" onClick={() => setShowConfirmModal(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleConfirmApply}
              disabled={bulkRescheduleMutation.isPending || !rescheduleToDate}
              className="bg-orange-600 hover:bg-orange-700 text-white"
            >
              <Send className="w-4 h-4 mr-2" />
              {bulkRescheduleMutation.isPending ? 'Applying…' : 'Confirm Apply'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Audit Log Modal ──────────────────────────────────── */}
      <Dialog open={showAuditModal} onOpenChange={setShowAuditModal}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="w-5 h-5 text-orange-600" />
              Storm Batch Audit Log
            </DialogTitle>
          </DialogHeader>

          {auditLoading && (
            <div className="flex items-center justify-center py-8">
              <p className="text-gray-500">Loading audit entries…</p>
            </div>
          )}

          {auditError && (
            <div className="space-y-3">
              <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-lg p-4">
                <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-red-900">Failed to load audit log</p>
                  <p className="text-sm text-red-700 mt-1">{auditError?.message || 'Unknown error'}</p>
                </div>
              </div>
              <Button onClick={() => refetchAudit()} variant="outline" className="w-full">
                <RotateCcw className="w-4 h-4 mr-2" />
                Retry
              </Button>
            </div>
          )}

          {!auditLoading && !auditError && auditEntries.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12">
              <History className="w-12 h-12 text-gray-300 mb-3" />
              <p className="text-gray-500 text-center">No storm audit entries yet.</p>
              <p className="text-sm text-gray-400 text-center mt-1">Storm batch operations will appear here.</p>
            </div>
          )}

          {!auditLoading && !auditError && auditEntries.length > 0 && (
            <div className="space-y-3">
              <div className="text-xs text-gray-500">Showing {auditEntries.length} entries</div>
              <div className="space-y-2 overflow-y-auto max-h-[60vh]">
                {auditEntries.map((entry) => {
                  const meta = entry.data?.metadata || {};
                  const counts = meta.responseBody?.summary || {};
                  const hasWarnings = (meta.responseBody?.warnings || []).length > 0;
                  const hasErrors = (meta.responseBody?.applied || []).some(a => a.status === 'error');

                  return (
                    <div key={entry.id} className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 space-y-2">
                          {/* Row 1: Timestamp + Operator */}
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-gray-600">
                              {new Date(entry.created_date).toLocaleString('en-US', {
                                month: 'short',
                                day: 'numeric',
                                year: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                                second: '2-digit'
                              })}
                            </span>
                            <span className="text-xs text-gray-500">
                              {entry.created_by || 'System'}
                            </span>
                          </div>

                          {/* Row 2: Policy + Date Range */}
                          <div className="flex flex-wrap gap-4 text-sm">
                            <div>
                              <span className="text-gray-500">Policy:</span>
                              <span className="font-semibold ml-2">{meta.paramPolicy || '—'}</span>
                            </div>
                            <div>
                              <span className="text-gray-500">Range:</span>
                              <span className="font-semibold ml-2">{meta.paramFromDate} → {meta.paramToDate}</span>
                            </div>
                          </div>

                          {/* Row 3: Counts */}
                          <div className="flex flex-wrap gap-4 text-sm">
                            <div className="bg-gray-50 px-3 py-1 rounded">
                              <span className="text-gray-500">Selected:</span>
                              <strong className="ml-1">{counts.selectedCount || 0}</strong>
                            </div>
                            <div className="bg-green-50 px-3 py-1 rounded">
                              <span className="text-gray-500">Applied:</span>
                              <strong className="ml-1 text-green-700">{counts.applyEligibleCount || 0}</strong>
                            </div>
                            <div className="bg-yellow-50 px-3 py-1 rounded">
                              <span className="text-gray-500">Skipped:</span>
                              <strong className="ml-1 text-yellow-700">{counts.skippedCount || 0}</strong>
                            </div>
                          </div>
                        </div>

                        {/* Status badge */}
                        <div>
                          {hasErrors ? (
                            <Badge className="bg-red-100 text-red-800">Errors</Badge>
                          ) : hasWarnings ? (
                            <Badge className="bg-amber-100 text-amber-800">Warnings</Badge>
                          ) : (
                            <Badge className="bg-green-100 text-green-800">Success</Badge>
                          )}
                        </div>
                      </div>

                      {/* Expandable warnings/errors */}
                      {(hasWarnings || hasErrors) && (
                        <div className="mt-3 pt-3 border-t border-gray-200">
                          {hasWarnings && meta.responseBody?.warnings?.length > 0 && (
                            <div className="mb-2">
                              <p className="text-xs font-semibold text-amber-700 mb-1">Warnings:</p>
                              <ul className="text-xs text-amber-700 space-y-0.5 ml-4 list-disc">
                                {meta.responseBody.warnings.map((w, i) => (
                                  <li key={i}>{w}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                          {hasErrors && (
                            <div>
                              <p className="text-xs font-semibold text-red-700 mb-1">Errors:</p>
                              <div className="text-xs text-red-700 bg-red-50 p-2 rounded font-mono whitespace-pre-wrap overflow-auto max-h-24">
                                {JSON.stringify(meta.responseBody.applied.filter(a => a.status === 'error'), null, 2)}
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Undo button for live batches (not undo records) */}
                      {entry.data?.eventName !== 'storm_batch_undo_audit' && meta.operationType === 'live' && (
                        <div className="mt-3 pt-3 border-t border-gray-200">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setUndoConfirmData({ batchId: entry.id, entry })}
                            className="text-orange-600 hover:bg-orange-50 border-orange-200 hover:border-orange-300"
                          >
                            <RotateCcw className="w-3 h-3 mr-1" />
                            Undo Batch
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAuditModal(false)} className="w-full">
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}