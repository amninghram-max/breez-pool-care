import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Droplet, ChevronRight, ChevronDown, ChevronUp, AlertTriangle } from 'lucide-react';
import LockBanner from './LockBanner';

const REQUIRED_FIELDS = [
  { key: 'freeChlorine',   label: 'Free Chlorine',    unit: 'ppm', step: '0.1', min: 0,   max: 20,  rangeMin: 1,   rangeMax: 3   },
  { key: 'pH',             label: 'pH',               unit: '',    step: '0.01', min: 6,   max: 9,   rangeMin: 7.2, rangeMax: 7.8 },
  { key: 'totalAlkalinity',label: 'Total Alkalinity', unit: 'ppm', step: '1',   min: 0,   max: 300, rangeMin: 80,  rangeMax: 120 },
];

const EXPANDED_FIELDS = [
  { key: 'calciumHardness', label: 'Calcium Hardness', unit: 'ppm', step: '1', min: 0, max: 1000, rangeMin: 200, rangeMax: 500 },
  { key: 'cyanuricAcid',   label: 'Cyanuric Acid (CYA)', unit: 'ppm', step: '1', min: 0, max: 300, rangeMin: 30, rangeMax: 100 },
  { key: 'waterTemp',      label: 'Water Temp', unit: '°F', step: '0.5', min: 50, max: 105, rangeMin: null, rangeMax: null },
];

const SALT_FIELD = { key: 'salt', label: 'Salt', unit: 'ppm', step: '1', min: 0, max: 6000, rangeMin: 2700, rangeMax: 3400 };

// Extreme entry thresholds — warn tech but don't block
const EXTREME_FLAGS = {
  freeChlorine:    { low: 0,  high: 10, msg: (v, h) => v > h ? 'FC very high — verify reading' : 'FC critically low' },
  pH:              { low: 6.8, high: 8.2, msg: (v, h) => v > h ? 'pH very high — verify' : 'pH critically low — corrosion risk' },
  totalAlkalinity: { low: 40,  high: 200, msg: (v, h) => v > h ? 'TA very high' : 'TA very low — pH instability risk' },
  calciumHardness: { low: 100, high: 600, msg: (v, h) => v > h ? 'CH very high — scaling risk' : 'CH very low — etching risk' },
  cyanuricAcid:    { low: 0,   high: 150, msg: (v, h) => v > h ? 'CYA very high — chlorine lock risk' : null },
  salt:            { low: 2000, high: 4000, msg: (v, h) => v > h ? 'Salt very high' : 'Salt very low — cell damage risk' },
};

function RangeHint({ field, value }) {
  if (field.rangeMin == null) return null;
  return (
    <p className="text-xs text-gray-400 mt-0.5">
      Target: {field.rangeMin}–{field.rangeMax} {field.unit}
    </p>
  );
}

function ExtremeFlag({ fieldKey, value }) {
  const rule = EXTREME_FLAGS[fieldKey];
  if (!rule || value == null || isNaN(value)) return null;
  let msg = null;
  if (value > rule.high) msg = rule.msg(value, rule.high);
  else if (value < rule.low) msg = rule.msg(value, rule.low);
  if (!msg) return null;
  return (
    <div className="flex items-center gap-1.5 mt-1 text-xs text-orange-700">
      <AlertTriangle className="w-3 h-3 flex-shrink-0" />
      {msg}
    </div>
  );
}

export default function StepTest({ visitData, user, advance }) {
  const [readings, setReadings] = useState({});
  const [notes, setNotes] = useState('');
  const [showExpanded, setShowExpanded] = useState(true);
  const [showSalt, setShowSalt] = useState(false);

  // Lock derivation: prefer loaded dosePlan actions, fall back to visitData.dosePlan, then flag
  const { data: liveDosePlan } = useQuery({
    queryKey: ['dosePlanForLock', visitData.testRecordId],
    queryFn: () => base44.entities.DosePlan.filter({ testRecordId: visitData.testRecordId }, '-created_date', 1).then(r => r[0] || null),
    enabled: !!visitData.testRecordId
  });
  const locked =
    liveDosePlan?.actions?.some(a => a.applied) ??
    visitData.dosePlan?.actions?.some(a => a.applied) ??
    visitData.firstChemApplied === true;

  const { data: pool } = useQuery({
    queryKey: ['pool', visitData.poolId],
    queryFn: () => base44.entities.Pool.filter({ id: visitData.poolId }).then(r => r[0]),
    enabled: !!visitData.poolId
  });

  const isSaltwater = pool?.chlorinationMethod === 'saltwater';

  const setValue = (key, val) => setReadings(prev => ({ ...prev, [key]: val === '' ? undefined : parseFloat(val) }));

  const canAdvance = REQUIRED_FIELDS.every(f => readings[f.key] != null && !isNaN(readings[f.key]));

  const createTestMutation = useMutation({
    mutationFn: async () => {
      const createRes = await base44.functions.invoke('createChemTestRecordV1', {
        poolId: visitData.poolId,
        leadId: pool?.leadId,
        testDate: new Date().toISOString(),
        technicianId: user.id,
        ...readings,
        notes: notes || undefined
      });

      if (!createRes.data?.ok) {
        throw new Error(createRes.data?.error || 'Failed to save readings');
      }

      const testRecord = createRes.data.testRecord;

      const riskResult = await base44.functions.invoke('generateChemistryRiskEvents', {
        testRecordId: testRecord.id,
        testRecord
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

  const renderField = (f) => (
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
        disabled={locked}
      />
      <RangeHint field={f} value={readings[f.key]} />
      <ExtremeFlag fieldKey={f.key} value={readings[f.key]} />
    </div>
  );

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Test</h2>
        <p className="text-gray-500 text-sm mt-1">Enter water chemistry readings</p>
      </div>

      {locked && <LockBanner />}

      {pool && (
        <div className="flex items-center gap-2 text-sm text-gray-600 bg-gray-50 rounded-lg px-3 py-2">
          <Droplet className="w-4 h-4 text-teal-500" />
          <span>{pool.volumeGallons?.toLocaleString()} gal · {pool.chlorinationMethod}</span>
        </div>
      )}

      {/* Required */}
      <Card>
        <CardContent className="pt-5 space-y-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Required</p>
          {REQUIRED_FIELDS.map(renderField)}
        </CardContent>
      </Card>

      {/* Expanded: CH, CYA, Temp — open by default */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <button
            className="flex items-center justify-between w-full text-xs font-semibold text-gray-500 uppercase tracking-wider"
            onClick={() => setShowExpanded(v => !v)}
          >
            <span>Extended (CH, CYA, Temp)</span>
            {showExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          {showExpanded && (
            <div className="space-y-4 mt-4">
              {EXPANDED_FIELDS.map(renderField)}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Salt — shown by default only for saltwater; otherwise behind toggle */}
      {isSaltwater ? (
        <Card>
          <CardContent className="pt-5 space-y-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Salt</p>
            {renderField(SALT_FIELD)}
          </CardContent>
        </Card>
      ) : (
        <div>
          {!showSalt ? (
            <button
              className="text-sm text-teal-600 underline underline-offset-2"
              onClick={() => setShowSalt(true)}
            >
              Salt pool? Tap to add salt reading
            </button>
          ) : (
            <Card>
              <CardContent className="pt-5 space-y-4">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Salt</p>
                {renderField(SALT_FIELD)}
              </CardContent>
            </Card>
          )}
        </div>
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
          disabled={locked}
        />
      </div>

      {!locked && (
        <>
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
        </>
      )}
    </div>
  );
}