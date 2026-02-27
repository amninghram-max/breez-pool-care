import React, { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { ChevronDown, ChevronUp, CheckCircle, Info } from 'lucide-react';
import { format } from 'date-fns';

const CHEMICAL_TYPE_LABELS = {
  LIQUID_CHLORINE: 'Chlorine', MURIATIC_ACID: 'pH Reducer',
  ALKALINITY_UP: 'Alkalinity Increaser', CALCIUM_INCREASER: 'Calcium Increaser',
  STABILIZER_CYA: 'Stabilizer', SALT: 'Salt'
};

const DISPLAY_FIELDS = [
  { key: 'freeChlorine', label: 'Free Chlorine', unit: 'ppm' },
  { key: 'pH', label: 'pH', unit: '' },
  { key: 'totalAlkalinity', label: 'Alkalinity', unit: 'ppm' },
  { key: 'calciumHardness', label: 'Calcium', unit: 'ppm' },
  { key: 'cyanuricAcid', label: 'Stabilizer (CYA)', unit: 'ppm' },
  { key: 'waterTemp', label: 'Water Temp', unit: '°F' },
];

function getSanitationLabel(record) {
  const fc = record?.freeChlorine;
  if (fc == null) return 'Monitoring';
  if (fc >= 1 && fc <= 3) return 'Optimal';
  return 'Adjusting';
}

function getWaterBalanceLabel(record) {
  const ph = record?.pH;
  const ta = record?.totalAlkalinity;
  if (ph == null || ta == null) return 'Monitoring';
  if (ph >= 7.2 && ph <= 7.8 && ta >= 80 && ta <= 120) return 'Balanced';
  return 'Actively Balancing';
}

export default function VisitHistoryCard({ record, dosePlan, retestRecord }) {
  const [expanded, setExpanded] = useState(false);

  const chemicalsAdded = dosePlan?.actions?.filter(a => a.applied !== false) || [];
  const chemicalTypeLabels = [...new Set(chemicalsAdded.map(a => CHEMICAL_TYPE_LABELS[a.chemicalType] || a.chemicalType))];
  const needsMonitoring = dosePlan?.retestRequired || dosePlan?.revisitEligible || (retestRecord && !retestRecord.resolved);

  return (
    <Card className="border-gray-100">
      <CardContent className="pt-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="font-semibold text-gray-900 text-sm">
              {record.testDate ? format(new Date(record.testDate), 'EEEE, MMMM d') : 'Service Visit'}
            </p>
            {record.technicianId && (
              <p className="text-xs text-gray-500 mt-0.5">
                Technician: {record.technicianName || record.technicianId}
              </p>
            )}
          </div>
          <div className="text-right space-y-1">
            <p className={`text-xs font-medium ${getSanitationLabel(record) === 'Optimal' ? 'text-green-600' : 'text-orange-500'}`}>
              {getSanitationLabel(record)}
            </p>
            <p className={`text-xs font-medium ${getWaterBalanceLabel(record) === 'Balanced' ? 'text-green-600' : 'text-orange-500'}`}>
              {getWaterBalanceLabel(record)}
            </p>
          </div>
        </div>

        {/* Chemicals adjusted — types only, no amounts, no brand names */}
        {chemicalTypeLabels.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            <p className="text-xs text-gray-400 w-full">Chemicals adjusted:</p>
            {chemicalTypeLabels.map(label => (
              <span key={label} className="text-xs bg-teal-50 text-teal-700 px-2 py-0.5 rounded-full">{label}</span>
            ))}
          </div>
        ) : (
          <p className="text-xs text-gray-400">No chemical adjustment needed</p>
        )}

        {/* Monitoring message */}
        {needsMonitoring && (
          <div className="flex items-start gap-2 bg-blue-50 rounded-lg px-3 py-2">
            <Info className="w-3.5 h-3.5 text-blue-400 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-blue-700">
              Our team is monitoring your water levels following this visit to ensure everything is tracking well.
            </p>
          </div>
        )}

        {/* Expandable measured values */}
        <button
          className="flex items-center gap-1 text-xs text-teal-600 font-medium"
          onClick={() => setExpanded(v => !v)}
        >
          {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          {expanded ? 'Hide' : 'View'} measured values
        </button>

        {expanded && (
          <div className="grid grid-cols-3 gap-2 pt-1">
            {DISPLAY_FIELDS.map(f => {
              const val = record[f.key];
              if (val == null) return null;
              return (
                <div key={f.key} className="bg-gray-50 rounded p-2 text-center">
                  <p className="text-xs text-gray-400">{f.label}</p>
                  <p className="font-mono font-bold text-xs text-gray-800">
                    {val}{f.unit ? ` ${f.unit}` : ''}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}