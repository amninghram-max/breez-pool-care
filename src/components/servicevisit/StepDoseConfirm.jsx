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

// Normalization: convert canonical schema units to internal conversion format
const normalizeCanonicalUnit = (unit) => {
  const map = {
    'gallons': 'gal',
    'gal': 'gal',
    'lbs': 'lb',
    'lb': 'lb',
    'oz': 'oz_wt',  // weight ounces
    'oz_wt': 'oz_wt',
    'tabs': 'tabs'  // non-convertible, pass-through
  };
  return map[unit] || unit;
};

// Conversion helpers for technician-friendly unit display
const UnitConversion = {
  // Volume conversions: canonical stored as gallons (normalized to 'gal')
  convertVolume: (amount, fromUnit, toUnit) => {
    if (fromUnit === toUnit) return amount;
    const toGal = { 'gal': amount, 'cup': amount / 8, 'fl_oz': amount / 128 };
    const gals = toGal[fromUnit];
    if (gals === undefined) return undefined;  // guard: unknown unit
    return { 'gal': gals, 'cup': gals * 8, 'fl_oz': gals * 128 }[toUnit];
  },
  
  // Weight conversions: canonical stored as lbs (normalized to 'lb')
  convertWeight: (amount, fromUnit, toUnit) => {
    if (fromUnit === toUnit) return amount;
    const toLbs = { 'lb': amount, 'oz_wt': amount / 16 };
    const lbs = toLbs[fromUnit];
    if (lbs === undefined) return undefined;  // guard: unknown unit
    return { 'lb': lbs, 'oz_wt': lbs * 16 }[toUnit];
  },
  
  // Choose default display unit by chemical type (always smallest practical unit)
  getDefaultDisplayUnit: (_canonicalAmount, canonicalUnit, chemicalType) => {
    if (canonicalUnit === 'tabs') return 'tabs';
    // Liquid chemicals → fl oz
    if (canonicalUnit === 'gal') return 'fl_oz';
    // Dry chemicals → oz_wt
    if (canonicalUnit === 'lb') return 'oz_wt';
    return canonicalUnit;  // fallback
  },
  
  // Determine if unit is liquid or dry
  isTechnicianDisplayUnit: (unit) => ['gal', 'cup', 'fl_oz', 'lb', 'oz_wt'].includes(unit),
  
  isLiquidUnit: (unit) => ['gal', 'cup', 'fl_oz'].includes(unit),
};

const formatAmount = (val) => parseFloat(val).toFixed(3).replace(/\.?0+$/, '');

// Pre-apply confirmation modal with unit switching
function PreApplyModal({ action, actionIndex, onConfirm, onCancel }) {
  // Determine canonical unit from action and normalize it
  const canonicalUnitRaw = action.primaryUnit; // stored canonical: 'gallons', 'lbs', 'oz', 'tabs', etc.
  const canonicalUnit = normalizeCanonicalUnit(canonicalUnitRaw);
  const canonicalAmount = action.dosePrimary;
  
  // Choose default display unit by chemical type (smallest practical unit)
  let defaultDisplayUnit = UnitConversion.getDefaultDisplayUnit(canonicalAmount, canonicalUnit, action.chemicalType);
  
  // Map normalized canonical to display unit names
  const displayUnitMap = {
    'gal': ['gal', 'cup', 'fl_oz'],
    'lb': ['lb', 'oz_wt'],
    'oz_wt': ['oz_wt', 'lb'],
    'tabs': ['tabs']
  };
  const availableDisplayUnits = displayUnitMap[canonicalUnit] || [canonicalUnit];
  
  const [displayUnit, setDisplayUnit] = useState(defaultDisplayUnit);
  
  // Safely convert or fallback to canonical amount
  const safeConvertedAmount = (() => {
    if (canonicalUnit === 'tabs') return canonicalAmount;  // tabs bypass conversion
    const converter = UnitConversion.isLiquidUnit(canonicalUnit) ? 'convertVolume' : 'convertWeight';
    const converted = UnitConversion[converter](canonicalAmount, canonicalUnit, displayUnit);
    return converted !== undefined ? converted : canonicalAmount;
  })();
  
  // Format to max 3 decimals, trim trailing zeros
  const formattedInitialAmount = parseFloat(safeConvertedAmount).toFixed(3).replace(/\.?0+$/, '');
  
  const [appliedAmountDisplay, setAppliedAmountDisplay] = useState(formattedInitialAmount);

  const isPartial = (() => {
    const tolerance = 0.0005; // ~half of 3-decimal display precision
    if (canonicalUnit === 'tabs') return parseFloat(appliedAmountDisplay) < canonicalAmount - tolerance;
    const converter = UnitConversion.isLiquidUnit(canonicalUnit) ? 'convertVolume' : 'convertWeight';
    const fullAmount = UnitConversion[converter](canonicalAmount, canonicalUnit, displayUnit);
    const comparisonAmount = fullAmount !== undefined ? fullAmount : canonicalAmount;
    return parseFloat(appliedAmountDisplay) < (comparisonAmount - tolerance);
  })();

  const handleConfirm = () => {
    // Convert display input back to canonical for storage
    let appliedAmountCanonical;
    if (canonicalUnit === 'tabs') {
      appliedAmountCanonical = parseFloat(appliedAmountDisplay) || canonicalAmount;
    } else {
      const converter = UnitConversion.isLiquidUnit(canonicalUnit) ? 'convertVolume' : 'convertWeight';
      const converted = UnitConversion[converter](
        parseFloat(appliedAmountDisplay) || canonicalAmount,
        displayUnit,
        canonicalUnit
      );
      appliedAmountCanonical = converted !== undefined ? converted : (parseFloat(appliedAmountDisplay) || canonicalAmount);
    }
    
    console.log('[PreApplyModal] unit conversion', {
      displayUnit,
      appliedDisplay: parseFloat(appliedAmountDisplay),
      canonicalUnit,
      appliedCanonical: appliedAmountCanonical
    });
    
    onConfirm({ actionIndex, appliedAmount: appliedAmountCanonical });
  };

  // Display unit labels for UI
  const unitLabels = {
    'gal': 'gallons',
    'cup': 'cups',
    'fl_oz': 'fl oz',
    'lb': 'lbs',
    'oz_wt': 'oz'
  };

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
           Planned dose: {formatAmount(
             (() => {
               if (canonicalUnit === 'tabs') return canonicalAmount;
               const converter = UnitConversion.isLiquidUnit(canonicalUnit) ? 'convertVolume' : 'convertWeight';
               const converted = UnitConversion[converter](canonicalAmount, canonicalUnit, displayUnit);
               return converted !== undefined ? converted : canonicalAmount;
             })()
           )} {unitLabels[displayUnit] || displayUnit}
         </p>
        </div>

        <div>
          <Label className="text-sm text-gray-700">Actual Amount Applied</Label>
          <div className="flex items-center gap-2 mt-1">
            <Input
              type="number"
              step="0.001"
              min={0}
              value={appliedAmountDisplay}
              onChange={e => setAppliedAmountDisplay(e.target.value)}
              onBlur={e => {
                // Format to max 3 decimals on blur
                const val = e.target.value.trim();
                if (val) {
                  const formatted = parseFloat(val).toFixed(3).replace(/\.?0+$/, '');
                  setAppliedAmountDisplay(formatted);
                }
              }}
              className="text-lg font-mono"
            />
            <select
              value={displayUnit}
              onChange={e => {
                const newUnit = e.target.value;
                // Convert current input to new unit
                if (canonicalUnit === 'tabs') {
                  setDisplayUnit(newUnit);
                  setAppliedAmountDisplay(appliedAmountDisplay);
                  return;
                }
                const converter = UnitConversion.isLiquidUnit(canonicalUnit) ? 'convertVolume' : 'convertWeight';
                const currentCanonical = UnitConversion[converter](
                  parseFloat(appliedAmountDisplay) || 0,
                  displayUnit,
                  canonicalUnit
                );
                const newDisplay = UnitConversion[converter](
                  currentCanonical,
                  canonicalUnit,
                  newUnit
                );
                setDisplayUnit(newUnit);
                setAppliedAmountDisplay(newDisplay !== undefined ? newDisplay : parseFloat(appliedAmountDisplay) || 0);
                console.log('[PreApplyModal] unit switched', { from: displayUnit, to: newUnit, newDisplay });
              }}
              className="text-sm px-2 py-1 border border-gray-300 rounded bg-white"
            >
              {availableDisplayUnits.map(u => (
                <option key={u} value={u}>{unitLabels[u]}</option>
              ))}
            </select>
          </div>
          {isPartial && parseFloat(appliedAmountDisplay) > 0 && (
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
          onClick={handleConfirm}
        >
          Confirm & Apply
        </Button>
      </div>
    </div>
  );
}

export default function StepDoseConfirm({ visitData, user, settings, advance, goTo }) {
  const [appliedActions, setAppliedActions] = useState([]); // array of {index, appliedAmount, appliedAt}
  const [pendingConfirm, setPendingConfirm] = useState(null); // action awaiting modal confirmation

  const { data: pool } = useQuery({
    queryKey: ['pool', visitData.poolId],
    queryFn: () => base44.entities.Pool.filter({ id: visitData.poolId }).then(r => r[0]),
    enabled: !!visitData.poolId
  });

  const [volumeWarning, setVolumeWarning] = useState(null); // null | 'estimated' | 'missing'

  const { data: dosePlan, isLoading } = useQuery({
    queryKey: ['dosePlan', visitData.testRecordId],
    queryFn: async () => {
      console.log('[StepDoseConfirm] query start', {
        testRecordId: visitData.testRecordId,
        poolId: visitData.poolId,
        hasReadings: !!visitData.readings
      });

      const existing = await base44.entities.DosePlan.filter({ testRecordId: visitData.testRecordId });
      if (existing[0]) {
        console.log('[StepDoseConfirm] existing dosePlan found', existing[0].id);
        return existing[0];
      }

      const result = await base44.functions.invoke('calculateChemicalSuggestions', {
        poolId: visitData.poolId,
        readings: visitData.readings
      });

      const data = result.data;
      console.log('[StepDoseConfirm] calculateChemicalSuggestions response', {
        success: data?.success,
        adjustmentsCount: data?.adjustments?.length,
        volumeMissing: data?.volumeMissing,
        volumeConfirmed: data?.volumeConfirmed,
        error: data?.error
      });

      if (data?.volumeMissing) {
        setVolumeWarning('missing');
        return null;
      }
      if (data?.volumeConfirmed === false) {
        setVolumeWarning('estimated');
      }

      // Handle function failure (e.g., chemistry targets not configured)
      if (!data?.success) {
        console.warn('[StepDoseConfirm] suggestion calculation failed', data?.error);
        return { error: data?.error, actions: [] };
      }

      // Normalize adjustments array into dosePlan-style actions
      const actions = (data?.adjustments || []).map((adj, idx) => ({
        order: idx + 1,
        chemicalType: normalizeChemicalType(adj.chemical),
        dosePrimary: parseFloat(adj.amount),
        primaryUnit: normalizeUnit(adj.unit),
        instructions: adj.reason,
        applied: false
      }));

      console.log('[StepDoseConfirm] normalized actions', {
        count: actions.length,
        actions: actions.map(a => ({ chemical: a.chemicalType, dose: `${a.dosePrimary} ${a.primaryUnit}` }))
      });

      return { actions, success: true };
    },
    enabled: !!visitData.testRecordId && !!visitData.readings
  });

  // Helper: map adjustment chemical names to DosePlan chemicalType enums
  const normalizeChemicalType = (chemName) => {
    const map = {
      'Liquid Chlorine': 'LIQUID_CHLORINE',
      'Muriatic Acid': 'MURIATIC_ACID',
      'Baking Soda': 'ALKALINITY_UP',
      'Alkalinity Up': 'ALKALINITY_UP',
      'Calcium Increaser': 'CALCIUM_INCREASER',
      'Stabilizer': 'STABILIZER_CYA',
      'CYA': 'STABILIZER_CYA',
      'Pool Salt': 'SALT'
    };
    return map[chemName] || 'LIQUID_CHLORINE';
  };

  // Helper: normalize unit strings
  const normalizeUnit = (unit) => {
    const map = {
      'gallons': 'gallons',
      'gal': 'gallons',
      'oz': 'oz',
      'lbs': 'lbs',
      'tabs': 'tabs'
    };
    return map[unit] || unit;
  };

  const confirmMutation = useMutation({
    mutationFn: async () => {
      const actions = dosePlan?.actions || [];
      const enrichedActions = actions.map((a, i) => {
        const applied = appliedActions.find(ap => ap.index === i);
        return applied
          ? { ...a, applied: true, appliedAmount: applied.appliedAmount, appliedAt: applied.appliedAt }
          : { ...a, applied: false };
      });

      const payload = {
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
      };

      console.log('[StepDoseConfirm] CREATE_DOSE_PLAN_PAYLOAD', {
        poolId: payload.poolId,
        leadId: payload.leadId,
        testRecordId: payload.testRecordId,
        actionsCount: payload.actions.length
      });

      const response = await base44.functions.invoke('createDosePlanV1', payload);

      console.log('[StepDoseConfirm] CREATE_DOSE_PLAN_RESPONSE', {
        ok: response.data.ok,
        dosePlanId: response.data.dosePlan?.id,
        error: response.data.error
      });

      if (!response.data.ok) {
        throw new Error(response.data.error || 'Failed to create dose plan');
      }

      return response.data.dosePlan;
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
    const isFirst = appliedActions.length === 0;
    setAppliedActions(prev => [...prev, { index: actionIndex, appliedAmount, appliedAt: now }]);
    setPendingConfirm(null);

    // On first chemical applied, write firstChemApplied into the flow's persisted state
    // without advancing the step — we update localStorage directly so the route
    // page and other steps read the lock correctly on resume.
    if (isFirst && visitData.eventId) {
      const flowKey = `breez_flow_${visitData.eventId}`;
      const existing = (() => { try { return JSON.parse(localStorage.getItem(flowKey) || 'null'); } catch { return null; } })();
      if (existing) {
        existing.visitData = { ...(existing.visitData || {}), firstChemApplied: true };
        localStorage.setItem(flowKey, JSON.stringify(existing));
      }
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
        {volumeWarning === 'missing' && (
          <Card className="border-red-300 bg-red-50">
            <CardContent className="pt-4">
              <div className="flex items-start gap-2 text-sm text-red-800">
                <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold">Pool volume not set</p>
                  <p className="mt-0.5 text-red-700">Chemical suggestions cannot be calculated. An admin must set the confirmed pool volume before dose plans can be generated.</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
        {dosePlan?.error && (
          <Card className="border-red-300 bg-red-50">
            <CardContent className="pt-4">
              <div className="flex items-start gap-2 text-sm text-red-800">
                <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold">Treatment suggestions unavailable</p>
                  <p className="mt-0.5 text-red-700">{dosePlan.error}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
        {!dosePlan?.error && !volumeWarning && (
          <Card className="border-gray-200">
            <CardContent className="pt-5 text-center space-y-2">
              <FlaskConical className="w-10 h-10 text-gray-300 mx-auto" />
              <p className="font-medium text-gray-700">No chemical treatment required</p>
              <p className="text-sm text-gray-500">Pool is within acceptable ranges</p>
            </CardContent>
          </Card>
        )}
        {!dosePlan?.error && !volumeWarning && (
          <Button className="w-full bg-teal-600 hover:bg-teal-700 h-14 text-base"
            onClick={() => advance({ dosePlan: null, retestRequired: false })}>
            <ChevronRight className="w-5 h-5 mr-2" />
            Skip to Closeout
          </Button>
        )}
      </div>
    );
  }

  const actions = dosePlan.actions || [];
  const allApplied = actions.length > 0 && appliedActions.length >= actions.length;
  
  // Helper to convert action display amount for closeout summary
  const getDisplayedAppliedAmount = (action, appliedEntry) => {
    const isLiquid = UnitConversion.isLiquidUnit(action.primaryUnit);
    const converter = isLiquid ? UnitConversion.convertVolume : UnitConversion.convertWeight;
    const defaultDisplay = UnitConversion.getDefaultDisplayUnit(action.dosePrimary, action.primaryUnit);
    return converter(
      appliedEntry.appliedAmount,
      action.primaryUnit,
      defaultDisplay
    );
  };

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

      {volumeWarning === 'estimated' && (
        <Card className="border-yellow-200 bg-yellow-50">
          <CardContent className="pt-3 pb-3">
            <div className="flex items-start gap-2 text-sm text-yellow-800">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <p><strong>Estimated volume</strong> — Pool volume has not been confirmed. Doses are approximate and based on pool size category.</p>
            </div>
          </CardContent>
        </Card>
      )}

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
                    {(isApplied ? appliedEntry.appliedAmount : action.dosePrimary).toFixed(3).replace(/\.?0+$/, '')} {action.primaryUnit}
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