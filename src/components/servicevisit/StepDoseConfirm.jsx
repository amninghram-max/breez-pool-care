import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useMutation, useQuery } from '@tanstack/react-query';
import { FlaskConical, ChevronRight, AlertTriangle, Clock } from 'lucide-react';

const CHEMICAL_LABELS = {
  LIQUID_CHLORINE: 'Liquid Chlorine',
  MURIATIC_ACID: 'Muriatic Acid',
  ALKALINITY_UP: 'Alkalinity Up (Baking Soda)',
  CALCIUM_INCREASER: 'Calcium Increaser',
  STABILIZER_CYA: 'Stabilizer / CYA',
  SALT: 'Pool Salt'
};

export default function StepDoseConfirm({ visitData, user, settings, advance, goTo }) {
  const [appliedActions, setAppliedActions] = useState({});
  const [generating, setGenerating] = useState(false);

  const { data: pool } = useQuery({
    queryKey: ['pool', visitData.poolId],
    queryFn: () => base44.entities.Pool.filter({ id: visitData.poolId }).then(r => r[0]),
    enabled: !!visitData.poolId
  });

  // Load or generate DosePlan
  const { data: dosePlan, isLoading } = useQuery({
    queryKey: ['dosePlan', visitData.testRecordId],
    queryFn: async () => {
      // Check if one already exists for this test record
      const existing = await base44.entities.DosePlan.filter({ testRecordId: visitData.testRecordId });
      if (existing[0]) return existing[0];

      // Generate via function
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
      // Record applied actions on the dose plan (new DosePlan creation is the apply record)
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
        retestFields: Object.keys(appliedActions),
        retestWaitMinutes: dosePlan?.retestWaitMinutes || 30,
        actions: dosePlan?.actions || [],
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

  // No dose plan or no actions — skip to close
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
  const allApplied = actions.length > 0 && actions.every((_, i) => appliedActions[i]);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Dose Plan</h2>
        <p className="text-gray-500 text-sm mt-1">Confirm each chemical as you add it</p>
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
        const applied = appliedActions[i];
        return (
          <Card key={i} className={`border-2 transition-colors ${applied ? 'border-green-400 bg-green-50' : 'border-gray-200'}`}>
            <CardContent className="pt-4 space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">Step {action.order}</Badge>
                    <span className="font-semibold text-gray-900">{CHEMICAL_LABELS[action.chemicalType] || action.chemicalType}</span>
                  </div>
                  <p className="text-2xl font-bold font-mono text-teal-700 mt-1">
                    {action.dosePrimary} {action.primaryUnit}
                    {action.safetyCapEnforced && <span className="text-sm text-orange-600 font-normal ml-2">(capped)</span>}
                  </p>
                </div>
                {applied && <span className="text-green-600 text-2xl">✓</span>}
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

              {!applied && (
                <Button
                  className="w-full"
                  variant="outline"
                  onClick={() => setAppliedActions(prev => ({ ...prev, [i]: true }))}
                >
                  <FlaskConical className="w-4 h-4 mr-2" />
                  Mark Applied
                </Button>
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
        <p className="text-xs text-center text-gray-400">Mark all steps applied to continue</p>
      )}
    </div>
  );
}