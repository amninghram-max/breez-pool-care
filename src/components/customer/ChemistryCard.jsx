import React from 'react';
import { format, formatDistance } from 'date-fns';
import { Badge } from '@/components/ui/badge';

const RANGES = {
  freeChlorine: { min: 1, max: 5 },
  pH: { min: 7.2, max: 7.8 },
  totalAlkalinity: { min: 60, max: 150 },
  cyanuricAcid: { min: 30, max: 80 },
  calciumHardness: { min: 200, max: 400 },
  salt: { min: 2700, max: 3400 }
};

const isOutOfRange = (key, value) => {
  if (!RANGES[key] || value === null || value === undefined) return false;
  return value < RANGES[key].min || value > RANGES[key].max;
};

const getTrendArrow = (currentValue, previousValue) => {
  if (previousValue === null || previousValue === undefined) {
    return null;
  }
  if (currentValue > previousValue) return '↑';
  if (currentValue < previousValue) return '↓';
  return '→';
};

const ChemistryRow = ({ label, value, unit = '', dataKey = null, allVisits = [], currentVisitIndex = 0 }) => {
  if (value === null || value === undefined) return null;

  // Find previous non-null value for this metric
  let previousValue = null;
  if (allVisits && currentVisitIndex >= 0) {
    for (let i = currentVisitIndex + 1; i < allVisits.length; i++) {
      if (allVisits[i][dataKey] !== null && allVisits[i][dataKey] !== undefined) {
        previousValue = allVisits[i][dataKey];
        break;
      }
    }
  }

  const outOfRange = dataKey ? isOutOfRange(dataKey, value) : false;
  const textColor = outOfRange ? 'text-red-600 font-semibold' : 'text-gray-700';
  const trend = dataKey ? getTrendArrow(value, previousValue) : null;

  return (
    <div className="flex items-center justify-between py-1.5 border-b border-gray-100 last:border-b-0">
      <span className="text-sm text-gray-600">{label}</span>
      <div className="flex items-center gap-1">
        <span className={`text-sm font-medium ${textColor}`}>
          {value}{unit && ` ${unit}`}
        </span>
        {trend && <span className="text-xs text-gray-500">{trend}</span>}
      </div>
    </div>
  );
};

export default function ChemistryCard({ visit, allVisits = [], visitIndex = 0 }) {
  const daysAgo = formatDistance(new Date(visit.visitDate), new Date(), { addSuffix: true });

  const chemistryFields = [
    { label: 'FC (ppm)', value: visit.freeChlorine, dataKey: 'freeChlorine' },
    { label: 'pH', value: visit.pH, dataKey: 'pH' },
    { label: 'TA (ppm)', value: visit.totalAlkalinity, dataKey: 'totalAlkalinity' },
    { label: 'CYA (ppm)', value: visit.cyanuricAcid, dataKey: 'cyanuricAcid' },
    { label: 'CH (ppm)', value: visit.calciumHardness, dataKey: 'calciumHardness' },
    { label: 'Salt (ppm)', value: visit.salt, dataKey: 'salt' },
    { label: 'Phosphates (ppb)', value: visit.phosphates },
    { label: 'Water Temp (°F)', value: visit.waterTemp }
  ];

  const presentFields = chemistryFields.filter(f => f.value !== null && f.value !== undefined);

  if (presentFields.length === 0) {
    return null;
  }

  return (
    <div className="border border-gray-200 rounded-lg p-4 bg-white">
      {/* Header */}
      <div className="flex items-center justify-between mb-3 pb-3 border-b border-gray-200">
        <div>
          <p className="font-medium text-gray-900">
            {format(new Date(visit.visitDate), 'MMM d, yyyy')}
          </p>
          <p className="text-xs text-gray-500">{daysAgo}</p>
        </div>
        <div className="flex items-center gap-2">
          {visit.technicianName && (
            <Badge className="bg-blue-100 text-blue-800 text-xs">
              {visit.technicianName}
            </Badge>
          )}
        </div>
      </div>

      {/* Chemistry Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {presentFields.map((field) => (
          <ChemistryRow
            key={field.label}
            label={field.label}
            value={field.value}
            dataKey={field.dataKey}
            allVisits={allVisits}
            currentVisitIndex={visitIndex}
          />
        ))}
      </div>
    </div>
  );
}