import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useMutation, useQuery } from '@tanstack/react-query';
import { FlaskConical, ChevronRight, AlertTriangle, Clock, Lock, X } from 'lucide-react';

const CHEMICAL_LABELS = {
  LIQUID_CHLORINE: 'Liquid Chlorine',
  MURIATIC_ACID: 'Muriatic Acid',
  ALKALINITY_UP: 'Alkalinity Up (Baking Soda)',
  CALCIUM_INCREASER: 'Calcium Increaser',
  STABILIZER_CYA: 'Stabilizer / CYA',
  SALT: 'Pool Salt'
};

// Pre-apply confirmation modal
function PreApplyModal({ action, actionIndex, onConfirm, onCancel }) {
  const [amount, setAmount] = useState(action.dosePrimary);
  const isPartial = parseFloat(amount) < action.dosePrimary;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/40">
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-xl p-6 space-y-4">
        <div className="flex items-start justify-between">
          <h3 className="font-bold text-gray-900 text-lg">Confirm Application</h3>
          <button onClick={onCancel} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="bg-teal-50 border border-teal-200 rounded-lg p-4">
          <p className="text-sm text-teal-900 font-semibold">
            {CHEMICAL_LABELS[action.chemicalType] || action.chemicalType}
          </p>
          <p className="text-xs text-teal-700 mt-1">
            Planned dose: {action.dosePrimary} {action.primaryUnit}
          </p>
        </div>

        <div>
          <Label className="text-sm text-gray-700">Actual Amount Applied</Label>
          <div className="flex items-center gap-2 mt-1">
            <Input
              type="number"
              step="0.1"
              min={0}
              value={amount}
              onChange={e => setAmount(e.target.value)}
              className="text-lg font-mono"
            />
            <span className="text-sm text-gray-500 whitespace-nowrap">{action.primaryUnit}</span>
          </div>
          {isPartial && parseFloat(amount) > 0 && (
            <p className="text-xs text-orange-600 mt-1 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" />
              Partial apply — reason may be required at closeout
            </p>
          )}
        </div>

        <p className="text-xs text-gray-500">
          This will lock the Arrive, Test, and Analyze steps for audit accuracy.
        </p>

        <Button
          className="w-full bg-teal-600 hover:bg-teal-700 h-12"
          onClick={() => onConfirm({ actionIndex, appliedAmount: parseFloat(amount) || action.dosePrimary })}
        >
          Confirm & Apply
        </Button>
      </div>
    </div>
  );
}

export default function StepDoseConfirm({ visitData, user, settings, advance }) {
  const [appliedActions, setAppliedActions] = useState([]); // array of {index, appliedAmount, appliedAt}
  const [pendingConfirm, setPendingConfirm] = useState(null); // action awaiting modal confirmation

  const { data: pool } = useQuery({
    queryKey: ['pool', visitData.poolId],
    queryFn: () => base44.entities.Pool.filter({ id: visitData.poolId }).then(r => r[0]),
    enabled: !!visitData.poolId
  });

  const { data: dosePlan, isLoading } = useQuery({
    queryKey: ['dosePlan', visitData.testRecordId],
    queryFn: async () => {
      const existing = await base44.entities.DosePlan.filter({ testRecordId: visitData.testRecordId });
      if (existing[0]) return existing[0];
      const result = await base44.functions.invoke('calculateChemicalSuggestions', {
        poolId: visitData.poolId,
        testRecordId: visitData.testRecordId,
        readings: visitData.readings
      });
      return result.data?.dosePlan ?? null;
    },
    enabled: !!visitData.testRecordId && visitData.riskEvents?.length > 0
  });

  const confirmMutation = useMutation({
    mutationFn: async () => {
      const actions = dosePlan?.actions || [];
      const enrichedActions = actions.map((a, i) => {
        const applied = appliedActions.find(ap => ap.index === i);
        return applied
          ? { ...a, applied: true, appliedAmount: applied.appliedAmount, appliedAt: applied.appliedAt }
          : { ...a, applied: false };
      });

      const appliedDosePlan = await base44.entities.DosePlan.create({
        poolId: visitData.poolId,
        leadId: pool?.leadId,
        testRecordId: visitData.testRecordId,
        technicianId: user.id,
        createdDate: new Date().toISOString(),
        calculatorVersion: 'v1_chemistry_engine',
        adminSettingsId: settings?.id || 'default',
        planHash: dosePlan?.planHash || 'manual',
        readiness: 'ready',
        retestRequired: true,
        retestFields: dosePlan?.retestFields || [],
        retestWaitMinutes: dosePlan?.retestWaitMinutes || 30,
        actions: enrichedActions,
        appliedAt: new Date().toISOString(),
        appliedBy: user.id,
        verificationStatus: 'pending'
      });
      return appliedDosePlan;
    },
    onSuccess: (plan) => {
      advance({
        dosePlan: plan,
        retestRequired: true,
        retestWaitMinutes: plan.retestWaitMinutes || 30
      });
    }
  });

  const handleMarkApplied = (action, index) => {
    setPendingConfirm({ action, index });
  };

  const handleConfirmApply = ({ actionIndex, appliedAmount }) => {
    const now = new Date().toISOString();
    setAppliedActions(prev => [...prev, { index: actionIndex, appliedAmount, appliedAt: now }]);
    setPendingConfirm(null);

    // Signal to parent flow that first chemical was applied (triggers lock on Arrive/Test/Analyze)
    if (appliedActions.length === 0) {
      advance({ firstChemApplied: true });
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-48">
        <div className="text-center space-y-2">
          <div className="animate-spin w-8 h-8 border-4 border-teal-500 border-t-transparent rounded-full mx-auto" />
          <p className="text-sm text-gray-500">Calculating dose plan…</p>
        </div>
      </div>
    );
  }

  if (!dosePlan || !dosePlan.actions?.length) {
    return (
      <div className="space-y-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Dose Plan</h2>
        </div>
        <Card className="border-gray-200">
          <CardContent className="pt-5 text-center space-y-2">
            <FlaskConical className="w-10 h-10 text-gray-300 mx-auto" />
            <p className="font-medium text-gray-700">No chemical treatment required</p>
            <p className="text-sm text-gray-500">Pool is within acceptable ranges</p>
          </CardContent>
        </Card>
        <Button className="w-full bg-teal-600 hover:bg-teal-700 h-14 text-base"
          onClick={() => advance({ dosePlan: null, retestRequired: false })}>
          <ChevronRight className="w-5 h-5 mr-2" />
          Skip to Closeout
        </Button>
      </div>
    );
  }

  const actions = dosePlan.actions || [];
  const allApplied = actions.length > 0 && appliedActions.length >= actions.length;

  return (
    <div className="space-y-4">
      {pendingConfirm && (
        <PreApplyModal
          action={pendingConfirm.action}
          actionIndex={pendingConfirm.index}
          onConfirm={handleConfirmApply}
          onCancel={() => setPendingConfirm(null)}
        />
      )}

      <div>
        <h2 className="text-2xl font-bold text-gray-900">Dose Plan</h2>
        <p className="text-gray-500 text-sm mt-1">Apply each chemical in order — steps must be completed sequentially</p>
      </div>

      {dosePlan.blockedReasons?.length > 0 && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-4 space-y-1">
            {dosePlan.blockedReasons.map((r, i) => (
              <div key={i} className="flex items-start gap-2 text-sm text-red-800">
                <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                {r}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {dosePlan.warnings?.length > 0 && (
        <Card className="border-yellow-200 bg-yellow-50">
          <CardContent className="pt-4 space-y-1">
            {dosePlan.warnings.map((w, i) => (
              <div key={i} className="flex items-start gap-2 text-sm text-yellow-800">
                <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                {w}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {actions.map((action, i) => {
        const appliedEntry = appliedActions.find(ap => ap.index === i);
        const isApplied = !!appliedEntry;
        const isLocked = i > 0 && !appliedActions.find(ap => ap.index === i - 1);
        const isPartial = isApplied && appliedEntry.appliedAmount < action.dosePrimary;
        // Critical: use action.critical flag or reasonCode if present
        const isCritical = action.critical === true ||
          ['breakpoint_chlorination', 'shock', 'elevated_sanitation'].includes(action.reasonCode);

        return (
          <Card key={i} className={`border-2 transition-colors ${
            isApplied ? (isPartial ? 'border-orange-300 bg-orange-50' : 'border-green-400 bg-green-50') :
            isLocked ? 'border-gray-100 bg-gray-50 opacity-60' :
            'border-gray-200'
          }`}>
            <CardContent className="pt-4 space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline" className="text-xs">Step {action.order ?? i + 1}</Badge>
                    <span className="font-semibold text-gray-900">{CHEMICAL_LABELS[action.chemicalType] || action.chemicalType}</span>
                    {isCritical && <Badge className="bg-orange-100 text-orange-800 text-xs">Critical</Badge>}
                    {isLocked && <Lock className="w-3.5 h-3.5 text-gray-400" />}
                  </div>
                  <p className="text-2xl font-bold font-mono text-teal-700 mt-1">
                    {isApplied ? appliedEntry.appliedAmount : action.dosePrimary} {action.primaryUnit}
                    {action.safetyCapEnforced && <span className="text-sm text-orange-600 font-normal ml-2">(capped)</span>}
                  </p>
                  {isPartial && (
                    <p className="text-xs text-orange-700 mt-0.5 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" />
                      Partial apply — {appliedEntry.appliedAmount} of {action.dosePrimary} {action.primaryUnit}
                      {isCritical && ' · Critical: complete before leaving or trigger revisit'}
                    </p>
                  )}
                </div>
                {isApplied && <span className={`text-2xl ${isPartial ? 'text-orange-500' : 'text-green-600'}`}>{isPartial ? '~' : '✓'}</span>}
              </div>

              {action.instructions && (
                <p className="text-sm text-gray-600 bg-white rounded p-2 border">{action.instructions}</p>
              )}

              {action.safetyWarnings?.length > 0 && (
                <div className="space-y-1">
                  {action.safetyWarnings.map((w, j) => (
                    <div key={j} className="flex items-start gap-1.5 text-xs text-orange-700">
                      <AlertTriangle className="w-3 h-3 mt-0.5 flex-shrink-0" />
                      {w}
                    </div>
                  ))}
                </div>
              )}

              {action.waitTimeMinutes > 0 && (
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <Clock className="w-3.5 h-3.5" />
                  Wait {action.waitTimeMinutes} min before next step
                </div>
              )}

              {!isApplied && !isLocked && (
                <Button
                  className="w-full"
                  variant="outline"
                  onClick={() => handleMarkApplied(action, i)}
                >
                  <FlaskConical className="w-4 h-4 mr-2" />
                  Mark Applied
                </Button>
              )}

              {isLocked && (
                <p className="text-xs text-center text-gray-400 flex items-center justify-center gap-1">
                  <Lock className="w-3 h-3" />
                  Complete Step {action.order != null ? action.order - 1 : i} first
                </p>
              )}
            </CardContent>
          </Card>
        );
      })}

      <Button
        className="w-full bg-teal-600 hover:bg-teal-700 h-14 text-base"
        disabled={!allApplied || confirmMutation.isPending}
        onClick={() => confirmMutation.mutate()}
      >
        <Clock className="w-5 h-5 mr-2" />
        {confirmMutation.isPending ? 'Confirming…' : 'All Applied → Start Wait Timer'}
      </Button>

      {!allApplied && (
        <p className="text-xs text-center text-gray-400">Apply all steps in order to continue</p>
      )}
    </div>
  );
}