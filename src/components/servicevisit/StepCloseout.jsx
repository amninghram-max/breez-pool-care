import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useMutation } from '@tanstack/react-query';
import { CheckCircle, Droplet, FlaskConical, CalendarCheck, AlertTriangle, Shield, Lock } from 'lucide-react';
import { createPageUrl } from '@/utils';
import { Link } from 'react-router-dom';

const CHEMICAL_LABELS = {
  LIQUID_CHLORINE: 'Liquid Chlorine', MURIATIC_ACID: 'Muriatic Acid',
  ALKALINITY_UP: 'Alkalinity Up', CALCIUM_INCREASER: 'Calcium Increaser',
  STABILIZER_CYA: 'Stabilizer / CYA', SALT: 'Pool Salt'
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

  const { readings = {}, riskEvents = [], dosePlan, retestResolved, retestReadings = {} } = visitData;
  const chemicalsAdded = dosePlan?.actions?.filter(a => a.applied !== false) || [];
  const retestScheduled = retestResolved === false;

  const sanitation = getSanitationStatus(readings);
  const waterBalance = getWaterBalanceStatus(readings);
  const surfaceProtection = getSurfaceProtectionStatus(readings);

  const needsNotes = notesRequired(visitData);
  const canClose = !needsNotes || internalNotes.trim().length > 0;

  const closeMutation = useMutation({
    mutationFn: async () => {
      if (visitData.eventId) {
        await base44.functions.invoke('updateEventStatus', {
          eventId: visitData.eventId, status: 'completed', sendNotification: true
        });
      }
      // Persist internal notes on dosePlan if one exists
      if (visitData.dosePlan?.id && internalNotes.trim()) {
        await base44.entities.DosePlan.update(visitData.dosePlan.id, {
          closeoutNotes: internalNotes.trim()
        });
      }
    },
    onSuccess: () => setDone(true)
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

      {/* What we added — shows appliedAmount if partial */}
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
                return (
                  <div key={i} className="flex items-center justify-between py-1 border-b border-gray-100 last:border-0">
                    <span className="text-sm text-gray-700">{CHEMICAL_LABELS[action.chemicalType] || action.chemicalType}</span>
                    <span className={`text-sm font-mono font-bold ${isPartial ? 'text-orange-600' : 'text-teal-700'}`}>
                      {action.appliedAmount ?? action.dosePrimary} {action.primaryUnit}
                      {isPartial && ' ⚠'}
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
                    <p className="font-mono font-bold text-sm">{val}{FIELD_UNITS[key] ? ` ${FIELD_UNITS[key]}` : ''}</p>
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
        <p className="text-xs text-center text-orange-500">Add internal notes before closing this visit</p>
      )}
    </div>
  );
}