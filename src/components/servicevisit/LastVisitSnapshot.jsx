import React from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { History } from 'lucide-react';
import { format } from 'date-fns';

const CHEMICAL_LABELS = {
  LIQUID_CHLORINE: 'Liquid Chlorine', MURIATIC_ACID: 'Muriatic Acid',
  ALKALINITY_UP: 'Alkalinity Up', CALCIUM_INCREASER: 'Calcium Increaser',
  STABILIZER_CYA: 'Stabilizer / CYA', SALT: 'Pool Salt'
};

function getSanitationLabel(fc) {
  if (fc == null) return 'Monitoring';
  if (fc >= 1 && fc <= 3) return 'Optimal';
  if (fc > 0.5) return 'Adjusting';
  return 'Treatment Applied';
}

function getWaterBalanceLabel(pH, ta) {
  if (pH == null || ta == null) return 'Monitoring';
  if (pH >= 7.2 && pH <= 7.8 && ta >= 80 && ta <= 120) return 'Balanced';
  return 'Actively Balancing';
}

function getSurfaceLabel(cya, ch) {
  if (cya == null && ch == null) return 'Not Measured';
  const cyaOk = cya == null || (cya >= 30 && cya <= 100);
  const chOk = ch == null || (ch >= 200 && ch <= 500);
  return cyaOk && chOk ? 'Protected' : 'Adjustment in Progress';
}

export default function LastVisitSnapshot({ poolId }) {
  const { data: lastTest } = useQuery({
    queryKey: ['lastTest', poolId],
    queryFn: async () => {
      const records = await base44.entities.ChemTestRecord.filter({ poolId }, '-testDate', 2);
      // Return second record (index 1) if it exists, otherwise the most recent
      // (index 0 is the current visit's record which may already be saved)
      return records[1] || records[0] || null;
    },
    enabled: !!poolId
  });

  const { data: lastDosePlan } = useQuery({
    queryKey: ['lastDosePlan', lastTest?.id],
    queryFn: () => lastTest?.id
      ? base44.entities.DosePlan.filter({ testRecordId: lastTest.id }, '-createdDate', 1).then(r => r[0] || null)
      : null,
    enabled: !!lastTest?.id
  });

  if (!lastTest) return null;

  const r = lastTest;
  const chemicalsAdded = lastDosePlan?.actions?.filter(a => a.applied !== false) || [];

  return (
    <Card className="border-gray-200 bg-gray-50">
      <CardContent className="pt-4 pb-4">
        <div className="flex items-center gap-2 mb-3">
          <History className="w-4 h-4 text-gray-500" />
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Last Visit Snapshot</p>
          <span className="ml-auto text-xs text-gray-400">
            {r.testDate ? format(new Date(r.testDate), 'MMM d') : '—'}
          </span>
        </div>

        {/* Status Labels */}
        <div className="grid grid-cols-3 gap-1.5 mb-3">
          {[
            { label: 'Sanitation', val: getSanitationLabel(r.freeChlorine) },
            { label: 'Balance', val: getWaterBalanceLabel(r.pH, r.totalAlkalinity) },
            { label: 'Surface', val: getSurfaceLabel(r.cyanuricAcid, r.calciumHardness) },
          ].map(({ label, val }) => (
            <div key={label} className="bg-white rounded border border-gray-100 p-2 text-center">
              <p className="text-xs text-gray-400">{label}</p>
              <p className="text-xs font-semibold text-gray-700 mt-0.5 leading-tight">{val}</p>
            </div>
          ))}
        </div>

        {/* Key Numbers */}
        <div className="flex gap-3 text-xs font-mono mb-3">
          {r.freeChlorine != null && (
            <span className="text-gray-600">FC <strong className="text-gray-900">{r.freeChlorine}</strong></span>
          )}
          {r.pH != null && (
            <span className="text-gray-600">pH <strong className="text-gray-900">{r.pH}</strong></span>
          )}
          {r.totalAlkalinity != null && (
            <span className="text-gray-600">TA <strong className="text-gray-900">{r.totalAlkalinity}</strong></span>
          )}
        </div>

        {/* Chemicals added */}
        {chemicalsAdded.length > 0 && (
          <div className="text-xs text-gray-500">
            <span className="font-medium">Adjusted: </span>
            {chemicalsAdded.map(a => CHEMICAL_LABELS[a.chemicalType] || a.chemicalType).join(', ')}
          </div>
        )}

        {/* Internal closeout note */}
        {lastDosePlan?.closeoutNotes && (
          <div className="mt-2 text-xs text-gray-500 italic border-t border-gray-200 pt-2">
            Note: {lastDosePlan.closeoutNotes}
          </div>
        )}
      </CardContent>
    </Card>
  );
}