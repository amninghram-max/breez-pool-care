import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ChevronRight, Droplet, Clock, CheckCircle, AlertTriangle } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';

const WATER_LEVELS = [
  { value: 'normal', label: 'Normal', description: 'Water level looks good', color: 'border-green-200 bg-green-50', textColor: 'text-green-800' },
  { value: 'slightly_low', label: 'Slightly Low', description: 'A little below mid-skimmer', color: 'border-yellow-200 bg-yellow-50', textColor: 'text-yellow-800' },
  { value: 'low', label: 'Low — Water Added', description: 'Added water this visit', color: 'border-orange-200 bg-orange-50', textColor: 'text-orange-800' },
  { value: 'high', label: 'High', description: 'Water level is above normal', color: 'border-blue-200 bg-blue-50', textColor: 'text-blue-800' },
];

const SHUTOFF_PLANS = [
  { value: 'customer_will_shutoff', label: 'Customer will shut off', description: 'Customer confirms they will turn off at a specific time' },
  { value: 'auto_shutoff', label: 'Auto shutoff device used', description: 'An automatic shutoff device is installed and in use' },
  { value: 'tech_returns', label: 'Tech returns to shut off', description: 'Technician will return to shut off (rare — requires confirmation)' },
];

export default function StepWaterLevel({ visitData, user, advance }) {
  const [level, setLevel] = useState('');
  const [shutoffPlan, setShutoffPlan] = useState('');
  const [shutoffTime, setShutoffTime] = useState('');
  const [notes, setNotes] = useState('');

  const waterAdded = level === 'low';
  const canAdvance = level && (!waterAdded || (shutoffPlan && (shutoffPlan !== 'customer_will_shutoff' || shutoffTime)));

  // Determine safetyFlag based on level
  function getSafetyFlag(lvl) {
    if (lvl === 'low') return 'below_skimmer_risk';
    if (lvl === 'high') return 'above_weir_risk';
    return undefined;
  }

  // Map shutoff plan values to WaterLevelLog enum values
  const SHUTOFF_MAP = {
    customer_will_shutoff: 'customer_shutoff',
    auto_shutoff: 'auto_shutoff',
    tech_returns: 'tech_returns',
  };

  const logMutation = useMutation({
    mutationFn: async (payload) => {
      return base44.entities.WaterLevelLog.create(payload);
    }
  });

  const handleContinue = async () => {
    const waterLevelData = {
      waterLevel: level,
      waterAdded,
      shutoffPlan: waterAdded ? shutoffPlan : undefined,
      shutoffTime: waterAdded && shutoffPlan === 'customer_will_shutoff' ? shutoffTime : undefined,
      waterLevelNotes: notes || undefined,
    };

    // Persist to WaterLevelLog if we have the required linking fields.
    // poolId and leadId come from visitData (set via URL params in ServiceVisitFlow).
    // technicianId is the authenticated user's id.
    // Creation happens here (step-level, same pattern as ChemTestRecord / RetestRecord)
    // rather than at closeout so the record exists even if the visit is interrupted.
    // Dedup limitation: if the tech navigates back to this step and re-submits,
    // a second WaterLevelLog record will be created for the same visit.
    // Full deduplication (e.g. by eventId) is out of scope for this slice.
    if (visitData.poolId && visitData.leadId) {
      const safetyFlag = getSafetyFlag(level);
      const logPayload = {
        poolId: visitData.poolId,
        leadId: visitData.leadId,
        visitDate: new Date().toISOString(),
        technicianId: user?.id || '',
        technicianName: user?.full_name || '',
        waterLevel: level,
        waterAdded,
        ...(waterAdded && shutoffPlan ? { shutoffPlan: SHUTOFF_MAP[shutoffPlan] || shutoffPlan } : {}),
        ...(waterAdded && shutoffPlan === 'customer_will_shutoff' && shutoffTime ? { shutoffTime } : {}),
        ...(safetyFlag ? { safetyFlag } : {}),
        ...(notes ? { notes } : {}),
      };
      try {
        const log = await logMutation.mutateAsync(logPayload);
        waterLevelData.waterLevelLogId = log.id;
      } catch (err) {
        // Non-fatal: log creation failure does not block the visit flow
        console.error('[StepWaterLevel] WaterLevelLog create failed:', err?.message);
      }
    }

    advance(waterLevelData);
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Water Level</h2>
        <p className="text-gray-500 text-sm mt-1">Check and record the pool water level</p>
      </div>

      <div className="space-y-2">
        {WATER_LEVELS.map(opt => (
          <button
            key={opt.value}
            onClick={() => { setLevel(opt.value); setShutoffPlan(''); setShutoffTime(''); }}
            className={`w-full text-left rounded-xl border-2 p-4 transition-all ${
              level === opt.value
                ? `${opt.color} border-opacity-100 ring-2 ring-teal-400`
                : 'border-gray-200 bg-white hover:border-gray-300'
            }`}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className={`font-semibold text-sm ${level === opt.value ? opt.textColor : 'text-gray-800'}`}>{opt.label}</p>
                <p className="text-xs text-gray-500 mt-0.5">{opt.description}</p>
              </div>
              {level === opt.value && <CheckCircle className="w-5 h-5 text-teal-600 flex-shrink-0" />}
            </div>
          </button>
        ))}
      </div>

      {/* Shutoff plan — required when water was added */}
      {waterAdded && (
        <Card className="border-orange-200">
          <CardContent className="pt-4 space-y-4">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-orange-600 mt-0.5 flex-shrink-0" />
              <p className="text-sm font-semibold text-orange-900">Shutoff Plan Required</p>
            </div>
            <p className="text-xs text-gray-500">Since water was added, a shutoff plan must be confirmed to prevent overflow.</p>

            <div className="space-y-2">
              {SHUTOFF_PLANS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => { setShutoffPlan(opt.value); setShutoffTime(''); }}
                  className={`w-full text-left rounded-lg border p-3 transition-all ${
                    shutoffPlan === opt.value
                      ? 'border-teal-400 bg-teal-50 ring-1 ring-teal-400'
                      : 'border-gray-200 bg-white hover:border-gray-300'
                  }`}
                >
                  <p className="font-medium text-sm text-gray-800">{opt.label}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{opt.description}</p>
                </button>
              ))}
            </div>

            {shutoffPlan === 'customer_will_shutoff' && (
              <div>
                <Label className="text-sm font-medium text-gray-700">What time will customer shut off?</Label>
                <input
                  type="time"
                  value={shutoffTime}
                  onChange={e => setShutoffTime(e.target.value)}
                  className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-teal-400"
                />
                {shutoffTime && (
                  <div className="mt-2 flex items-center gap-2 text-xs text-blue-700 bg-blue-50 rounded p-2">
                    <Clock className="w-3.5 h-3.5 flex-shrink-0" />
                    A reminder will be logged for customer shutoff at {shutoffTime}
                  </div>
                )}
              </div>
            )}

            {shutoffPlan === 'tech_returns' && (
              <div className="flex items-start gap-2 text-xs text-orange-700 bg-orange-50 rounded p-2">
                <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                Confirm with dispatch that a return trip is scheduled.
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <div>
        <Label className="text-sm font-medium text-gray-700">Notes (optional)</Label>
        <Textarea
          placeholder="Any water level observations…"
          value={notes}
          onChange={e => setNotes(e.target.value)}
          className="mt-1"
          rows={2}
        />
      </div>

      <Button
        className="w-full bg-teal-600 hover:bg-teal-700 h-14 text-base"
        disabled={!canAdvance || logMutation.isPending}
        onClick={handleContinue}
      >
        <ChevronRight className="w-5 h-5 mr-2" />
        {logMutation.isPending ? 'Saving…' : 'Continue'}
      </Button>

      {!canAdvance && waterAdded && (
        <p className="text-xs text-center text-orange-500">
          Select a shutoff plan{shutoffPlan === 'customer_will_shutoff' ? ' and enter shutoff time' : ''} before continuing
        </p>
      )}
    </div>
  );
}