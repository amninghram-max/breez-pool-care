import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useMutation } from '@tanstack/react-query';
import { CheckCircle, Droplet, FlaskConical, CalendarCheck, AlertTriangle, Shield, Lock, CalendarPlus } from 'lucide-react';

import { createPageUrl } from '@/utils';
import { Link } from 'react-router-dom';

const CHEMICAL_LABELS = {
  LIQUID_CHLORINE: 'Liquid Chlorine', MURIATIC_ACID: 'Muriatic Acid',
  ALKALINITY_UP: 'Alkalinity Up', CALCIUM_INCREASER: 'Calcium Increaser',
  STABILIZER_CYA: 'Stabilizer / CYA', SALT: 'Pool Salt'
};

// Normalize canonical schema units to internal conversion keys
const normalizeCanonicalUnit = (unit) => {
  const map = { 'gallons': 'gal', 'lbs': 'lb', 'oz': 'oz_wt', 'oz_wt': 'oz_wt', 'gal': 'gal', 'lb': 'lb', 'tabs': 'tabs' };
  return map[unit] || unit;
};

// Unit conversion for technician-friendly display (matches StepDoseConfirm)
const UnitConversion = {
  convertVolume: (amount, fromUnit, toUnit) => {
    if (fromUnit === toUnit) return amount;
    const toFlOz = { 'gal': amount * 128, 'qt': amount * 32, 'cup': amount * 8, 'fl_oz': amount };
    const flOz = toFlOz[fromUnit];
    if (flOz === undefined) return undefined;
    return { 'gal': flOz / 128, 'qt': flOz / 32, 'cup': flOz / 8, 'fl_oz': flOz }[toUnit];
  },
  convertWeight: (amount, fromUnit, toUnit) => {
    if (fromUnit === toUnit) return amount;
    const toOzWt = { 'lb': amount * 16, 'oz_wt': amount };
    const ozWt = toOzWt[fromUnit];
    if (ozWt === undefined) return undefined;
    return { 'lb': ozWt / 16, 'oz_wt': ozWt }[toUnit];
  },
  getDefaultDisplayUnit: (canonicalAmount, normalizedUnit) => {
    if (normalizedUnit === 'gal') {
      if (canonicalAmount < 0.25) return 'fl_oz';
      if (canonicalAmount < 2)    return 'qt';
      return 'gal';
    }
    if (normalizedUnit === 'lb') return canonicalAmount < 1 ? 'oz_wt' : 'lb';
    return normalizedUnit;
  },
  isLiquidUnit: (unit) => ['gal', 'cup', 'fl_oz'].includes(unit),
};

const unitLabels = {
  'gal': 'gallons',
  'qt': 'qts',
  'cup': 'cups',
  'fl_oz': 'fl oz',
  'lb': 'lbs',
  'oz_wt': 'oz',
  'gallons': 'gallons',
  'lbs': 'lbs'
};

const DISPLAY_FIELDS = ['freeChlorine', 'pH', 'totalAlkalinity', 'calciumHardness', 'cyanuricAcid', 'waterTemp'];

const FIELD_LABELS = {
  freeChlorine: 'Free Chlorine', pH: 'pH', totalAlkalinity: 'Total Alkalinity',
  calciumHardness: 'Calcium Hardness', cyanuricAcid: 'CYA', waterTemp: 'Water Temp'
};

const FIELD_UNITS = {
  freeChlorine: 'ppm', pH: '', totalAlkalinity: 'ppm',
  calciumHardness: 'ppm', cyanuricAcid: 'ppm', waterTemp: '°F'
};

const formatDose = (val) => parseFloat(val).toFixed(3).replace(/\.?0+$/, '');

function getSanitationStatus(readings) {
  const fc = readings.freeChlorine;
  if (fc == null) return { label: 'Monitoring', color: 'text-yellow-600' };
  if (fc >= 1 && fc <= 3) return { label: 'Optimal', color: 'text-green-600' };
  if (fc > 0.5) return { label: 'Adjusting', color: 'text-orange-600' };
  return { label: 'Treatment Applied', color: 'text-orange-600' };
}

function getWaterBalanceStatus(readings) {
  const ph = readings.pH;
  const ta = readings.totalAlkalinity;
  if (ph == null || ta == null) return { label: 'Monitoring', color: 'text-yellow-600' };
  const phOk = ph >= 7.2 && ph <= 7.8;
  const taOk = ta >= 80 && ta <= 120;
  if (phOk && taOk) return { label: 'Balanced', color: 'text-green-600' };
  return { label: 'Actively Balancing', color: 'text-orange-600' };
}

function getSurfaceProtectionStatus(readings) {
  const cya = readings.cyanuricAcid;
  const ch = readings.calciumHardness;
  if (cya == null && ch == null) return { label: 'Not Measured Today', color: 'text-gray-400' };
  const cyaOk = cya == null || (cya >= 30 && cya <= 100);
  const chOk = ch == null || (ch >= 200 && ch <= 500);
  if (cyaOk && chOk) return { label: 'Protected', color: 'text-green-600' };
  return { label: 'Adjustment in Progress', color: 'text-orange-600' };
}

const CRITICAL_REASON_CODES = ['breakpoint_chlorination', 'shock', 'elevated_sanitation'];

function isCriticalAction(action) {
  return action.critical === true || CRITICAL_REASON_CODES.includes(action.reasonCode);
}

function getCriticalPartials(visitData) {
  const actions = visitData.dosePlan?.actions || [];
  return actions.filter(a =>
    a.applied &&
    a.appliedAmount != null &&
    a.appliedAmount < a.dosePrimary &&
    isCriticalAction(a)
  );
}

function notesRequired(visitData) {
  const { dosePlan, riskEvents = [], retestResolved } = visitData;
  const actions = dosePlan?.actions || [];
  const hasPartial = actions.some(a => a.applied && a.appliedAmount != null && a.appliedAmount < a.dosePrimary);
  const hasCriticalEvent = riskEvents.some(e => e.severityPoints >= 5);
  const revisitFlagged = dosePlan?.revisitEligible || retestResolved === false;
  return hasPartial || hasCriticalEvent || revisitFlagged || visitData.customerInteractionFlagged;
}

export default function StepCloseout({ visitData, user }) {
  const [done, setDone] = useState(false);
  const [internalNotes, setInternalNotes] = useState('');
  // "completed_now" | "follow_up_triggered" | null
  const [criticalPartialResolution, setCriticalPartialResolution] = useState(null);
  
  // Trichlor closeout accounting
  const [trichlorTabletCount, setTrichlorTabletCount] = useState(
    visitData.chemicalsAdded?.chlorineTablets || ''
  );
  const [trichlorPlacement, setTrichlorPlacement] = useState(
    visitData.chemicalsAdded?.trichlorPlacement || ''
  );

  const { readings = {}, riskEvents = [], dosePlan, retestResolved, retestReadings = {} } = visitData;
  const chemicalsAdded = dosePlan?.actions?.filter(a => a.applied !== false) || [];
  const retestScheduled = retestResolved === false;

  const sanitation = getSanitationStatus(readings);
  const waterBalance = getWaterBalanceStatus(readings);
  const surfaceProtection = getSurfaceProtectionStatus(readings);

  const criticalPartials = getCriticalPartials(visitData);
  const hasCriticalPartials = criticalPartials.length > 0;

  const needsNotes = notesRequired(visitData);
  const canClose =
    (!needsNotes || internalNotes.trim().length > 0) &&
    (!hasCriticalPartials || criticalPartialResolution !== null);

  // Map DosePlan chemicalType → ServiceVisit.chemicalsAdded key
  // Canonical units: LIQUID_CHLORINE/MURIATIC_ACID stored as gallons, dry as lbs, tabs as tabs
  const DOSE_PLAN_TO_SERVICE_VISIT_KEY = {
    LIQUID_CHLORINE: 'liquidChlorine',  // gallons canonical
    MURIATIC_ACID: 'acid',              // gallons canonical
    ALKALINITY_UP: 'bakingSoda',        // lbs canonical
    CALCIUM_INCREASER: 'calciumIncreaser', // lbs canonical
    STABILIZER_CYA: 'stabilizer',       // lbs canonical
    SALT: 'salt',                       // lbs canonical
  };

  const closeMutation = useMutation({
    mutationFn: async () => {
      // 1. Map applied DosePlan actions → canonical ServiceVisit.chemicalsAdded object shape
      //    appliedAmount is stored in canonical units by StepDoseConfirm (gallons for liquids, lbs for dry)
      const dosePlanChemicals = {};
      const appliedActions = visitData.dosePlan?.actions?.filter(a => a.applied === true) || [];
      for (const action of appliedActions) {
        const serviceVisitKey = DOSE_PLAN_TO_SERVICE_VISIT_KEY[action.chemicalType];
        if (!serviceVisitKey) continue; // unknown type — skip rather than corrupt
        const amount = action.appliedAmount ?? action.dosePrimary;
        if (amount != null && amount > 0) {
          // Sum if same key appears more than once (defensive)
          dosePlanChemicals[serviceVisitKey] = (dosePlanChemicals[serviceVisitKey] || 0) + amount;
        }
      }
      console.log('[StepCloseout] DOSE_PLAN_CHEMICALS_MAPPED', {
        appliedActionCount: appliedActions.length,
        mapped: dosePlanChemicals
      });

      // 2. Merge with manual trichlor closeout accounting (preserved as-is)
      const chemicalsAdded = { ...dosePlanChemicals };
      if (trichlorTabletCount) {
        chemicalsAdded.chlorineTablets = parseFloat(trichlorTabletCount);
        console.log('[StepCloseout] TRICHLOR_TABLET_ENTRY', {
          tabletCount: trichlorTabletCount,
          placement: trichlorPlacement
        });
      }
      if (trichlorPlacement) {
        chemicalsAdded.trichlorPlacement = trichlorPlacement;
      }

      console.log('[StepCloseout] CHEMICALS_ADDED_FINAL', { chemicalsAdded });

      // 3. Create the canonical ServiceVisit record via processServiceVisit
      await base44.functions.invoke('processServiceVisit', {
        visitData: {
          ...visitData,
          // Flatten readings into top-level fields as processServiceVisit expects
          ...(visitData.readings || {}),
          // Audit chain links already in visitData; make dosePlanId explicit
          dosePlanId: visitData.dosePlan?.id || visitData.dosePlanId || undefined,
          // Closeout context
          notes: internalNotes.trim() || visitData.notes || undefined,
          criticalPartialResolution: criticalPartialResolution || undefined,
          // Trichlor accounting
          chemicalsAdded,
          // Required ServiceVisit fields: propertyId is Lead.id — consistent with CustomerTimeline
          // and ChemistryDashboard which both query ServiceVisit.filter({ propertyId: leadId }).
          propertyId: visitData.leadId,
          visitDate: new Date().toISOString(),
          technicianName: user?.full_name || user?.email || '',
        }
      });

      // 2. Mark the calendar event as completed
      if (visitData.eventId) {
        await base44.functions.invoke('updateEventStatus', {
          eventId: visitData.eventId, status: 'completed', sendNotification: true
        });
      }

      // 3. Persist internal notes on dosePlan if one exists
      if (visitData.dosePlan?.id && internalNotes.trim()) {
        await base44.entities.DosePlan.update(visitData.dosePlan.id, {
          closeoutNotes: internalNotes.trim()
        });
      }
    },
    onSuccess: () => {
      // Clean up all persisted flow state for this visit
      if (visitData.eventId) {
        localStorage.removeItem(`breez_flow_${visitData.eventId}`);
        localStorage.removeItem(`breez_timer_${visitData.eventId}`);
        localStorage.removeItem(`breez_checklist_${visitData.eventId}`);
      }
      setDone(true);
    }
  });

  if (done) {
    return (
      <div className="space-y-6 text-center pt-8">
        <CheckCircle className="w-20 h-20 text-green-500 mx-auto" />
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Visit Complete</h2>
          <p className="text-gray-500 mt-2">Service record saved successfully</p>
        </div>
        <Link to={createPageUrl('TechnicianHome')}>
          <Button className="w-full bg-teal-600 hover:bg-teal-700 h-12">
            Back to Route
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Visit Summary</h2>
        <p className="text-gray-500 text-sm mt-1">Review and close out this visit</p>
      </div>

      {/* Pool Status */}
      <Card>
        <CardContent className="pt-5 space-y-3">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-teal-600" />
            <p className="text-sm font-bold text-gray-700 uppercase tracking-wide">Pool Status</p>
          </div>
          <div className="space-y-2">
            {[
              { label: 'Sanitation', status: sanitation },
              { label: 'Water Balance', status: waterBalance },
              { label: 'Surface Protection', status: surfaceProtection },
            ].map(({ label, status }) => (
              <div key={label} className="flex items-center justify-between py-1.5 border-b border-gray-100 last:border-0">
                <span className="text-sm text-gray-600">{label}</span>
                <span className={`text-sm font-semibold ${status.color}`}>{status.label}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* What we measured */}
      <Card>
        <CardContent className="pt-5 space-y-3">
          <div className="flex items-center gap-2">
            <Droplet className="w-4 h-4 text-teal-600" />
            <p className="text-sm font-bold text-gray-700 uppercase tracking-wide">What We Measured</p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {DISPLAY_FIELDS.map(key => {
              const val = readings[key];
              if (val == null) return null;
              const wasOor = visitData.outOfRange?.includes(key);
              return (
                <div key={key} className={`p-2 rounded border ${wasOor ? 'border-orange-200 bg-orange-50' : 'border-gray-100 bg-gray-50'}`}>
                  <p className="text-xs text-gray-500">{FIELD_LABELS[key]}</p>
                  <p className="font-mono font-bold text-sm">
                    {val}{FIELD_UNITS[key] ? ` ${FIELD_UNITS[key]}` : ''}
                    {wasOor && <span className="text-orange-500 ml-1">⚠</span>}
                  </p>
                </div>
              );
            })}
          </div>
          {riskEvents.length === 0 && (
            <div className="flex items-center gap-2 text-sm text-green-700">
              <CheckCircle className="w-4 h-4" />
              All readings within target range
            </div>
          )}
        </CardContent>
      </Card>

      {/* What we added — shows appliedAmount if partial, with technician-friendly units */}
      <Card>
        <CardContent className="pt-5 space-y-3">
          <div className="flex items-center gap-2">
            <FlaskConical className="w-4 h-4 text-teal-600" />
            <p className="text-sm font-bold text-gray-700 uppercase tracking-wide">What We Added</p>
          </div>
          {chemicalsAdded.length > 0 ? (
            <div className="space-y-2">
              {chemicalsAdded.map((action, i) => {
                    const isPartial = action.appliedAmount != null && action.appliedAmount < action.dosePrimary;
                    // Normalize schema unit strings (e.g. 'gallons' → 'gal', 'lbs' → 'lb')
                    const normUnit = normalizeCanonicalUnit(action.primaryUnit);
                    const appliedCanonical = action.appliedAmount ?? action.dosePrimary;

                    if (normUnit === 'tabs') {
                      return (
                        <div key={i} className="flex items-center justify-between py-1 border-b border-gray-100 last:border-0">
                          <span className="text-sm text-gray-700">{CHEMICAL_LABELS[action.chemicalType] || action.chemicalType}</span>
                          <span className="text-sm font-mono font-bold text-teal-700">{formatDose(appliedCanonical)} tabs</span>
                        </div>
                      );
                    }

                    const defaultDisplay = UnitConversion.getDefaultDisplayUnit(appliedCanonical, normUnit);
                    const isLiquid = UnitConversion.isLiquidUnit(normUnit);
                    const converter = isLiquid ? UnitConversion.convertVolume : UnitConversion.convertWeight;
                    const appliedDisplay = converter(appliedCanonical, normUnit, defaultDisplay);
                    const plannedDisplay = converter(action.dosePrimary, normUnit, defaultDisplay);

                    // Safe fallback: if conversion failed, show canonical value + unit
                    const safeApplied = appliedDisplay != null && !isNaN(appliedDisplay) ? appliedDisplay : appliedCanonical;
                    const safeAppliedUnit = appliedDisplay != null && !isNaN(appliedDisplay) ? defaultDisplay : normUnit;
                    const safePlanned = plannedDisplay != null && !isNaN(plannedDisplay) ? plannedDisplay : action.dosePrimary;

                    return (
                      <div key={i} className="flex items-center justify-between py-1 border-b border-gray-100 last:border-0">
                        <span className="text-sm text-gray-700">{CHEMICAL_LABELS[action.chemicalType] || action.chemicalType}</span>
                        <span className={`text-sm font-mono font-bold ${isPartial ? 'text-orange-600' : 'text-teal-700'}`}>
                          {formatDose(safeApplied)} {unitLabels[safeAppliedUnit] || safeAppliedUnit}
                          {isPartial && ` ⚠ (${formatDose(safePlanned)} planned)`}
                        </span>
                      </div>
                    );
                  })}
            </div>
          ) : (
            <p className="text-sm text-gray-500">No chemicals added — pool was in balance</p>
          )}
        </CardContent>
      </Card>

      {/* Trichlor tablets — read-only summary (recorded in StepTrichlor before this step) */}
      {(visitData.chemicalsAdded?.chlorineTablets != null || visitData.chemicalsAdded?.trichlorPlacement) && (
        <Card>
          <CardContent className="pt-5 space-y-2">
            <div className="flex items-center gap-2">
              <FlaskConical className="w-4 h-4 text-teal-600" />
              <p className="text-sm font-bold text-gray-700 uppercase tracking-wide">Trichlor Tablets</p>
            </div>
            <div className="p-2 rounded bg-teal-50 border border-teal-200">
              <p className="text-xs text-teal-700">
                ✓ {visitData.chemicalsAdded.chlorineTablets} tablet{visitData.chemicalsAdded.chlorineTablets !== 1 ? 's' : ''}{' '}
                {visitData.chemicalsAdded.trichlorPlacement
                  ? `placed in ${{ skimmer: 'skimmer', floater: 'floater', inline_feeder: 'inline feeder' }[visitData.chemicalsAdded.trichlorPlacement] || visitData.chemicalsAdded.trichlorPlacement}`
                  : ''}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Retest results */}
      {Object.keys(retestReadings).length > 0 && (
        <Card>
          <CardContent className="pt-5 space-y-3">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-teal-600" />
              <p className="text-sm font-bold text-gray-700 uppercase tracking-wide">Post-Treatment Verification</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(retestReadings).map(([key, val]) => {
                if (val == null || !FIELD_LABELS[key]) return null;
                return (
                  <div key={key} className="p-2 rounded border border-green-100 bg-green-50">
                    <p className="text-xs text-gray-500">{FIELD_LABELS[key]}</p>
                    <p className="font-mono font-bold text-sm">{formatDose(val)}{FIELD_UNITS[key] ? ` ${FIELD_UNITS[key]}` : ''}</p>
                  </div>
                );
              })}
            </div>
            <Badge className={visitData.retestResolved ? 'bg-green-100 text-green-800' : 'bg-orange-100 text-orange-800'}>
              {visitData.retestResolved ? '✓ Levels verified in range' : '⚠ Follow-up may be needed'}
            </Badge>
          </CardContent>
        </Card>
      )}

      {/* What to expect */}
      <Card className="border-blue-100 bg-blue-50">
        <CardContent className="pt-5 space-y-2">
          <div className="flex items-center gap-2">
            <CalendarCheck className="w-4 h-4 text-blue-600" />
            <p className="text-sm font-bold text-blue-900 uppercase tracking-wide">What to Expect</p>
          </div>
          {chemicalsAdded.length > 0 ? (
            <ul className="text-sm text-blue-800 space-y-1 list-disc list-inside">
              <li>Allow 4–6 hours before swimming</li>
              <li>Chemicals will fully circulate within 24 hours</li>
              <li>Water clarity may temporarily appear hazy — this is normal</li>
              {retestScheduled && <li>A follow-up visit has been flagged for verification</li>}
            </ul>
          ) : (
            <p className="text-sm text-blue-800">Pool is in great shape — no changes needed. Enjoy!</p>
          )}
        </CardContent>
      </Card>

      {retestScheduled && (
        <Card className="border-orange-200 bg-orange-50">
          <CardContent className="pt-4 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-orange-600 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm font-semibold text-orange-800">Revisit / Verification Flagged</p>
              <p className="text-sm text-orange-700 mt-1">Some readings were still out of range after treatment. Your service manager will schedule a follow-up verification.</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Critical partial enforcement — must choose a branch to unlock closeout */}
      {hasCriticalPartials && (
        <Card className={`border-2 ${criticalPartialResolution ? 'border-green-300 bg-green-50' : 'border-red-300 bg-red-50'}`}>
          <CardContent className="pt-4 space-y-3">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-red-800 text-sm">Critical Chemical — Partial Apply</p>
                <ul className="mt-1 space-y-0.5">
                  {criticalPartials.map((a, i) => (
                    <li key={i} className="text-xs text-red-700">
                      {CHEMICAL_LABELS[a.chemicalType] || a.chemicalType}: {formatDose(a.appliedAmount)} of {formatDose(a.dosePrimary)} {a.primaryUnit} applied
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-red-700 mt-2 font-medium">Select one before closing:</p>
              </div>
            </div>

            {criticalPartialResolution === null ? (
              <div className="flex flex-col gap-2">
                <Button
                  className="w-full bg-teal-600 hover:bg-teal-700 h-11"
                  onClick={() => setCriticalPartialResolution('completed_now')}
                >
                  <CheckCircle className="w-4 h-4 mr-2" />
                  Full dose completed — ready to close
                </Button>
                <Button
                  variant="outline"
                  className="w-full border-orange-400 text-orange-700 hover:bg-orange-50 h-11"
                  onClick={() => setCriticalPartialResolution('follow_up_triggered')}
                >
                  <CalendarPlus className="w-4 h-4 mr-2" />
                  Trigger Follow-up / Revisit Required
                </Button>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-600" />
                  <span className="text-sm font-medium text-green-800">
                    {criticalPartialResolution === 'completed_now'
                      ? 'Marked as fully completed'
                      : 'Follow-up / revisit flagged'}
                  </span>
                </div>
                <button
                  className="text-xs text-gray-400 underline"
                  onClick={() => setCriticalPartialResolution(null)}
                >
                  Change
                </button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Internal-only closeout notes */}
      <Card className={`border-2 ${needsNotes ? 'border-orange-300' : 'border-gray-200'}`}>
        <CardContent className="pt-4 pb-4">
          <div className="flex items-center gap-2 mb-2">
            <Lock className="w-4 h-4 text-gray-500" />
            <Label className="text-sm font-semibold text-gray-700">
              Internal Notes {needsNotes && <span className="text-orange-600">*</span>}
            </Label>
            <span className="text-xs text-gray-400 ml-auto">Not shown to customer</span>
          </div>
          <Textarea
            placeholder={needsNotes
              ? 'Required: describe partial apply, critical reading, or revisit reason…'
              : 'Optional: add any internal notes for this visit…'}
            value={internalNotes}
            onChange={e => setInternalNotes(e.target.value)}
            rows={3}
          />
          {needsNotes && !internalNotes.trim() && (
            <p className="text-xs text-orange-600 mt-1">
              Notes required due to: partial apply, critical event, or unresolved retest.
            </p>
          )}
        </CardContent>
      </Card>

      <div className="px-1 pb-1">
        <p className="text-xs text-gray-400 leading-relaxed">
          Pool chemistry naturally fluctuates due to weather, sunlight, and normal use. Our job is to monitor those changes and make precise adjustments to keep your water consistently safe, clear, and balanced.
        </p>
      </div>

      <Button
        className="w-full bg-teal-600 hover:bg-teal-700 h-14 text-base"
        disabled={!canClose || closeMutation.isPending}
        onClick={() => closeMutation.mutate()}
      >
        <CheckCircle className="w-5 h-5 mr-2" />
        {closeMutation.isPending ? 'Closing visit…' : 'Close Visit & Finish'}
      </Button>

      {!canClose && (
        <p className="text-xs text-center text-orange-500">
          {hasCriticalPartials && criticalPartialResolution === null
            ? 'Resolve critical partial chemical before closing'
            : 'Add internal notes before closing this visit'}
        </p>
      )}
    </div>
  );
}