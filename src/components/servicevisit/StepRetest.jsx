import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useMutation, useQuery } from '@tanstack/react-query';
import { CheckCircle, AlertTriangle, ChevronRight } from 'lucide-react';

const RETEST_FIELDS = [
  { key: 'freeChlorine', label: 'Free Chlorine', unit: 'ppm', step: '0.1' },
  { key: 'pH', label: 'pH', unit: '', step: '0.01' },
  { key: 'totalAlkalinity', label: 'Total Alkalinity', unit: 'ppm', step: '1' },
  { key: 'combinedChlorine', label: 'Combined Chlorine', unit: 'ppm', step: '0.1' },
];

const DEFAULT_TARGETS = {
  freeChlorine: { min: 1, max: 3 },
  pH: { min: 7.2, max: 7.8 },
  totalAlkalinity: { min: 80, max: 120 },
  combinedChlorine: { min: 0, max: 0.5 }
};

export default function StepRetest({ visitData, user, advance, goTo }) {
  const [readings, setReadings] = useState({});

  const { data: pool } = useQuery({
    queryKey: ['pool', visitData.poolId],
    queryFn: () => base44.entities.Pool.filter({ id: visitData.poolId }).then(r => r[0]),
    enabled: !!visitData.poolId
  });

  const retestFields = visitData.dosePlan?.retestFields?.length
    ? RETEST_FIELDS.filter(f => visitData.dosePlan.retestFields.includes(f.key))
    : RETEST_FIELDS.slice(0, 2); // default: FC and pH

  const canAdvance = retestFields.every(f => readings[f.key] != null && !isNaN(readings[f.key]));

  const inTarget = (key, val) => {
    const t = DEFAULT_TARGETS[key];
    return t ? val >= t.min && val <= t.max : true;
  };

  const allResolved = retestFields.every(f => readings[f.key] != null && inTarget(f.key, readings[f.key]));

  const submitMutation = useMutation({
    mutationFn: async () => {
      const record = await base44.entities.RetestRecord.create({
        poolId: visitData.poolId,
        leadId: pool?.leadId,
        originalTestId: visitData.testRecordId,
        dosePlanId: visitData.dosePlan?.id || null,
        retestDate: new Date().toISOString(),
        technicianId: user.id,
        reasonForRetest: 'post_treatment',
        ...readings,
        resolved: allResolved
      });
      return record;
    },
    onSuccess: (record) => {
      console.log('[StepRetest] saved retest, routing to photos_after', { retestRecordId: record.id, resolved: allResolved });
      advance({ retestRecordId: record.id, retestResolved: allResolved, retestReadings: readings });
      goTo('photos_after');
    }
  });

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Retest</h2>
        <p className="text-gray-500 text-sm mt-1">Verify chemical levels after treatment</p>
      </div>

      <Card>
        <CardContent className="pt-5 space-y-4">
          {retestFields.map(f => {
            const val = readings[f.key];
            const ok = val != null && inTarget(f.key, val);
            const bad = val != null && !inTarget(f.key, val);
            return (
              <div key={f.key}>
                <div className="flex items-center justify-between mb-1">
                  <Label className="text-sm font-medium text-gray-700">
                    {f.label} {f.unit && <span className="text-gray-400 font-normal">({f.unit})</span>}
                  </Label>
                  {ok && <span className="text-xs text-green-600 font-medium flex items-center gap-1"><CheckCircle className="w-3 h-3" />In range</span>}
                  {bad && <span className="text-xs text-orange-600 font-medium flex items-center gap-1"><AlertTriangle className="w-3 h-3" />Out of range</span>}
                </div>
                <Input
                  type="number"
                  step={f.step}
                  placeholder="—"
                  value={readings[f.key] ?? ''}
                  onChange={e => setReadings(prev => ({ ...prev, [f.key]: e.target.value === '' ? undefined : parseFloat(e.target.value) }))}
                  className={`text-lg font-mono ${ok ? 'border-green-400' : bad ? 'border-orange-400' : ''}`}
                />
                {DEFAULT_TARGETS[f.key] && (
                  <p className="text-xs text-gray-400 mt-1">
                    Target: {DEFAULT_TARGETS[f.key].min}–{DEFAULT_TARGETS[f.key].max} {f.unit}
                  </p>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      {canAdvance && (
        allResolved ? (
          <Card className="border-green-200 bg-green-50">
            <CardContent className="pt-4 flex items-center gap-3">
              <CheckCircle className="w-6 h-6 text-green-600 flex-shrink-0" />
              <p className="text-sm font-semibold text-green-800">Treatment successful — all levels in range</p>
            </CardContent>
          </Card>
        ) : (
          <Card className="border-orange-200 bg-orange-50">
            <CardContent className="pt-4 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-orange-600 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-semibold text-orange-800">Some levels still out of range</p>
                <p className="text-sm text-orange-700 mt-1">This visit will be logged. A follow-up revisit may be scheduled.</p>
              </div>
            </CardContent>
          </Card>
        )
      )}

      <Button
        className="w-full bg-teal-600 hover:bg-teal-700 h-14 text-base"
        disabled={!canAdvance || submitMutation.isPending}
        onClick={() => submitMutation.mutate()}
      >
        <ChevronRight className="w-5 h-5 mr-2" />
        {submitMutation.isPending ? 'Saving retest…' : 'Save Retest → After Photos'}
      </Button>

      {!canAdvance && (
        <p className="text-xs text-center text-gray-400">Enter all retest readings to continue</p>
      )}
    </div>
  );
}