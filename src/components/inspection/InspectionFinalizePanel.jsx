import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, Lock, Loader2, User, ClipboardList } from 'lucide-react';
import { toast } from 'sonner';
import { format, parseISO } from 'date-fns';

const TEAL = '#1B9B9F';

function InfoRow({ label, value }) {
  return (
    <div className="flex justify-between text-sm py-1 border-b border-gray-50 last:border-0">
      <span className="text-gray-500">{label}</span>
      <span className="font-medium text-gray-800 capitalize">{String(value || '—').replace(/_/g, ' ')}</span>
    </div>
  );
}

export default function InspectionFinalizePanel({ inspectionRecord, lead, onFinalized }) {
  const [lockedRate, setLockedRate] = useState(
    inspectionRecord.lockedMonthlyRate ? String(inspectionRecord.lockedMonthlyRate) : ''
  );
  const [frequency, setFrequency] = useState(inspectionRecord.lockedFrequency || 'weekly');
  const [greenFee, setGreenFee] = useState(
    inspectionRecord.greenToCleanFee ? String(inspectionRecord.greenToCleanFee) : '0'
  );
  const [outcome, setOutcome] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const { data: user } = useQuery({
    queryKey: ['user'],
    queryFn: () => base44.auth.me(),
  });

  const canFinalize = user?.role === 'admin' || user?.canFinalizeInspections === true;

  const monthlyRate = parseFloat(lockedRate) || 0;
  const visitsPerMonth = frequency === 'twice_weekly' ? 8 : 4;
  const perVisit = monthlyRate > 0 ? (monthlyRate / visitsPerMonth) : 0;
  const greenFeeNum = parseFloat(greenFee) || 0;
  const firstMonthTotal = monthlyRate + greenFeeNum;

  const handleFinalize = async () => {
    if (!outcome) { toast.error('Select an outcome'); return; }
    if (!lockedRate || monthlyRate <= 0) { toast.error('Enter a valid monthly rate'); return; }

    setSubmitting(true);
    const result = await base44.functions.invoke('finalizeInspection', {
      inspectionRecordId: inspectionRecord.id,
      lockedMonthlyRate: monthlyRate,
      lockedFrequency: frequency,
      greenToCleanFee: greenFeeNum,
      finalizationNotes: notes,
      outcome,
    });
    setSubmitting(false);

    if (result.data?.success) {
      setDone(true);
      toast.success(outcome === 'new_customer' ? 'Finalized — agreement email sent' : 'Marked as Open Lead');
      if (onFinalized) onFinalized(outcome);
    } else {
      toast.error(result.data?.error || 'Finalization failed');
    }
  };

  if (!canFinalize) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
        This inspection is pending finalization by an admin or authorized finalizer.
      </div>
    );
  }

  if (done) {
    return (
      <div className="text-center py-8 space-y-3">
        <div className="w-14 h-14 rounded-full bg-teal-100 flex items-center justify-center mx-auto">
          <CheckCircle2 className="w-7 h-7 text-teal-600" />
        </div>
        <h3 className="font-bold text-gray-900">Finalized</h3>
        <p className="text-sm text-gray-500">
          {outcome === 'new_customer' ? 'Agreement email sent to customer.' : 'Lead kept open for follow-up.'}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Inspection Summary */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <ClipboardList className="w-4 h-4 text-gray-500" />
            Inspection Data
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-0.5 text-sm">
          <InfoRow label="Submitted by" value={inspectionRecord.submittedByName} />
          <InfoRow label="Submitted at" value={inspectionRecord.submittedAt ? format(parseISO(inspectionRecord.submittedAt), 'MMM d, yyyy h:mm a') : '—'} />
          <InfoRow label="Pool size" value={inspectionRecord.confirmedPoolSize} />
          <InfoRow label="Enclosure" value={inspectionRecord.confirmedEnclosure} />
          <InfoRow label="Filter" value={inspectionRecord.confirmedFilterType} />
          <InfoRow label="Chlorination" value={inspectionRecord.confirmedChlorinationMethod} />
          <InfoRow label="Condition" value={inspectionRecord.confirmedPoolCondition} />
          {inspectionRecord.confirmedPoolCondition === 'green' && (
            <InfoRow label="Green severity" value={inspectionRecord.greenSeverity} />
          )}
          {inspectionRecord.techNotes && (
            <div className="pt-2">
              <p className="text-xs text-gray-400 mb-1">Tech Notes</p>
              <p className="text-gray-700 text-sm">{inspectionRecord.techNotes}</p>
            </div>
          )}
          {inspectionRecord.equipmentNotes && (
            <div className="pt-2">
              <p className="text-xs text-gray-400 mb-1">Equipment Notes</p>
              <p className="text-gray-700 text-sm">{inspectionRecord.equipmentNotes}</p>
            </div>
          )}
          {inspectionRecord.photoBefore?.length > 0 && (
            <div className="pt-2">
              <p className="text-xs text-gray-400 mb-1">Photos</p>
              <div className="flex flex-wrap gap-2">
                {inspectionRecord.photoBefore.map((url, i) => (
                  <a key={i} href={url} target="_blank" rel="noreferrer">
                    <img src={url} alt="inspection" className="w-14 h-14 object-cover rounded-lg border" />
                  </a>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pricing Lock */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Lock className="w-4 h-4 text-gray-500" />
            Lock Pricing
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Monthly Rate ($) *</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={lockedRate}
                onChange={e => setLockedRate(e.target.value)}
                placeholder="e.g. 149.00"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Frequency</Label>
              <Select value={frequency} onValueChange={setFrequency}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="twice_weekly">Twice Weekly</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {inspectionRecord.confirmedPoolCondition === 'green' && (
            <div className="space-y-1.5">
              <Label>Green-to-Clean Fee (first month, one-time) ($)</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={greenFee}
                onChange={e => setGreenFee(e.target.value)}
                placeholder="0.00"
              />
            </div>
          )}

          {/* Live preview */}
          {monthlyRate > 0 && (
            <div className="bg-gray-50 rounded-lg p-3 space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Monthly rate</span>
                <span className="font-semibold">${monthlyRate.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">≈ Per visit ({visitsPerMonth}/mo)</span>
                <span className="font-semibold">${perVisit.toFixed(2)}</span>
              </div>
              {greenFeeNum > 0 && (
                <div className="flex justify-between text-orange-700">
                  <span>Green-to-clean (once)</span>
                  <span className="font-semibold">+${greenFeeNum.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between font-bold border-t pt-1 mt-1">
                <span>First month total</span>
                <span style={{ color: TEAL }}>${firstMonthTotal.toFixed(2)}</span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Outcome */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <User className="w-4 h-4 text-gray-500" />
            Outcome
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => setOutcome('new_customer')}
              className={`rounded-xl border-2 p-4 text-left transition-all ${outcome === 'new_customer' ? 'border-teal-500 bg-teal-50' : 'border-gray-200 hover:border-gray-300'}`}
            >
              <p className="font-semibold text-sm text-gray-900">New Customer</p>
              <p className="text-xs text-gray-500 mt-0.5">Send agreement + payment email</p>
            </button>
            <button
              onClick={() => setOutcome('open_lead')}
              className={`rounded-xl border-2 p-4 text-left transition-all ${outcome === 'open_lead' ? 'border-amber-500 bg-amber-50' : 'border-gray-200 hover:border-gray-300'}`}
            >
              <p className="font-semibold text-sm text-gray-900">Open Lead</p>
              <p className="text-xs text-gray-500 mt-0.5">Keep for follow-up, no activation</p>
            </button>
          </div>
          <div className="space-y-1.5">
            <Label>Finalization Notes (optional)</Label>
            <Textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Any notes about this decision..."
              rows={2}
            />
          </div>
        </CardContent>
      </Card>

      <Button
        onClick={handleFinalize}
        disabled={submitting || !outcome || monthlyRate <= 0}
        className="w-full h-12 text-white"
        style={{ backgroundColor: outcome === 'open_lead' ? '#d97706' : TEAL }}
      >
        {submitting
          ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Finalizing...</>
          : outcome === 'open_lead'
            ? 'Mark as Open Lead'
            : 'Finalize & Send Agreement'
        }
      </Button>
    </div>
  );
}