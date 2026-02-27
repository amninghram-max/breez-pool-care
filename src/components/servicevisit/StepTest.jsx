import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Droplet, ChevronRight } from 'lucide-react';

const REQUIRED_FIELDS = [
  { key: 'freeChlorine', label: 'Free Chlorine', unit: 'ppm', step: '0.1', min: 0, max: 20 },
  { key: 'pH', label: 'pH', unit: '', step: '0.01', min: 6, max: 9 },
  { key: 'totalAlkalinity', label: 'Total Alkalinity', unit: 'ppm', step: '1', min: 0, max: 300 }
];

const OPTIONAL_FIELDS = [
  { key: 'combinedChlorine', label: 'Combined Chlorine', unit: 'ppm', step: '0.1', min: 0, max: 10 },
  { key: 'cyanuricAcid', label: 'Cyanuric Acid (CYA)', unit: 'ppm', step: '1', min: 0, max: 300 },
  { key: 'calciumHardness', label: 'Calcium Hardness', unit: 'ppm', step: '1', min: 0, max: 1000 },
  { key: 'salt', label: 'Salt', unit: 'ppm', step: '1', min: 0, max: 6000 },
  { key: 'waterTemp', label: 'Water Temp', unit: '°F', step: '0.5', min: 50, max: 105 }
];

export default function StepTest({ visitData, user, advance }) {
  const [readings, setReadings] = useState({});
  const [notes, setNotes] = useState('');
  const [showOptional, setShowOptional] = useState(false);

  const { data: pool } = useQuery({
    queryKey: ['pool', visitData.poolId],
    queryFn: () => base44.entities.Pool.filter({ id: visitData.poolId }).then(r => r[0]),
    enabled: !!visitData.poolId
  });

  const isSaltwater = pool?.chlorinationMethod === 'saltwater';
  const optionalFields = isSaltwater
    ? OPTIONAL_FIELDS
    : OPTIONAL_FIELDS.filter(f => f.key !== 'salt');

  const setValue = (key, val) => setReadings(prev => ({ ...prev, [key]: val === '' ? undefined : parseFloat(val) }));

  const canAdvance = REQUIRED_FIELDS.every(f => readings[f.key] != null && !isNaN(readings[f.key]));

  const createTestMutation = useMutation({
    mutationFn: async () => {
      const testRecord = await base44.entities.ChemTestRecord.create({
        poolId: visitData.poolId,
        leadId: pool?.leadId,
        testDate: new Date().toISOString(),
        technicianId: user.id,
        ...readings,
        notes: notes || undefined
      });

      // Trigger risk event generation (idempotent)
      const riskResult = await base44.functions.invoke('generateChemistryRiskEvents', {
        testRecordId: testRecord.id
      });

      return { testRecord, riskResult: riskResult.data };
    },
    onSuccess: ({ testRecord, riskResult }) => {
      advance({
        testRecordId: testRecord.id,
        readings: { ...readings },
        riskEvents: riskResult?.events || [],
        outOfRange: riskResult?.outOfRange || []
      });
    }
  });

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Test</h2>
        <p className="text-gray-500 text-sm mt-1">Enter water chemistry readings</p>
      </div>

      {pool && (
        <div className="flex items-center gap-2 text-sm text-gray-600 bg-gray-50 rounded-lg px-3 py-2">
          <Droplet className="w-4 h-4 text-teal-500" />
          <span>{pool.volumeGallons?.toLocaleString()} gal · {pool.chlorinationMethod}</span>
        </div>
      )}

      {/* Required readings */}
      <Card>
        <CardContent className="pt-5 space-y-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Required</p>
          {REQUIRED_FIELDS.map(f => (
            <div key={f.key}>
              <Label className="text-sm font-medium text-gray-700">
                {f.label} {f.unit && <span className="text-gray-400 font-normal">({f.unit})</span>}
              </Label>
              <Input
                type="number"
                step={f.step}
                min={f.min}
                max={f.max}
                placeholder="—"
                value={readings[f.key] ?? ''}
                onChange={e => setValue(f.key, e.target.value)}
                className="mt-1 text-lg font-mono"
              />
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Optional readings */}
      {!showOptional ? (
        <Button variant="outline" className="w-full" onClick={() => setShowOptional(true)}>
          + Add Optional Readings (CYA, CH, Salt…)
        </Button>
      ) : (
        <Card>
          <CardContent className="pt-5 space-y-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Optional</p>
            {optionalFields.map(f => (
              <div key={f.key}>
                <Label className="text-sm font-medium text-gray-700">
                  {f.label} {f.unit && <span className="text-gray-400 font-normal">({f.unit})</span>}
                </Label>
                <Input
                  type="number"
                  step={f.step}
                  min={f.min}
                  max={f.max}
                  placeholder="—"
                  value={readings[f.key] ?? ''}
                  onChange={e => setValue(f.key, e.target.value)}
                  className="mt-1 text-lg font-mono"
                />
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Notes */}
      <div>
        <Label className="text-sm font-medium text-gray-700">Field Notes (optional)</Label>
        <Textarea
          placeholder="Observations, pool condition, anything unusual…"
          value={notes}
          onChange={e => setNotes(e.target.value)}
          className="mt-1"
          rows={2}
        />
      </div>

      <Button
        className="w-full bg-teal-600 hover:bg-teal-700 h-14 text-base"
        disabled={!canAdvance || createTestMutation.isPending}
        onClick={() => createTestMutation.mutate()}
      >
        <ChevronRight className="w-5 h-5 mr-2" />
        {createTestMutation.isPending ? 'Saving & analyzing…' : 'Save Readings → Analyze'}
      </Button>

      {!canAdvance && (
        <p className="text-xs text-center text-gray-400">FC, pH, and TA are required to continue</p>
      )}
    </div>
  );
}