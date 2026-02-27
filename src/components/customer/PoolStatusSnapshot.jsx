import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { CheckCircle, AlertCircle } from 'lucide-react';

function getSanitationStatus(record) {
  const fc = record?.freeChlorine;
  if (fc == null) return { label: 'Monitoring', ok: null };
  if (fc >= 1 && fc <= 3) return { label: 'Optimal', ok: true };
  return { label: 'Adjusting', ok: false };
}

function getWaterBalanceStatus(record) {
  const ph = record?.pH;
  const ta = record?.totalAlkalinity;
  if (ph == null || ta == null) return { label: 'Monitoring', ok: null };
  const phOk = ph >= 7.2 && ph <= 7.8;
  const taOk = ta >= 80 && ta <= 120;
  if (phOk && taOk) return { label: 'Balanced', ok: true };
  return { label: 'Actively Balancing', ok: false };
}

function getSurfaceProtectionStatus(record) {
  const cya = record?.cyanuricAcid;
  const ch = record?.calciumHardness;
  if (cya == null && ch == null) return { label: 'Not Measured Last Visit', ok: null };
  const cyaOk = cya == null || (cya >= 30 && cya <= 100);
  const chOk = ch == null || (ch >= 200 && ch <= 500);
  if (cyaOk && chOk) return { label: 'Protected', ok: true };
  return { label: 'Adjustment in Progress', ok: false };
}

function StatusRow({ label, status }) {
  const icon = status.ok === true
    ? <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
    : status.ok === false
    ? <AlertCircle className="w-4 h-4 text-orange-400 flex-shrink-0" />
    : <div className="w-4 h-4 rounded-full border-2 border-gray-300 flex-shrink-0" />;

  const color = status.ok === true ? 'text-green-700' : status.ok === false ? 'text-orange-600' : 'text-gray-500';

  return (
    <div className="flex items-center justify-between py-2.5 border-b border-gray-100 last:border-0">
      <span className="text-sm text-gray-600">{label}</span>
      <div className="flex items-center gap-2">
        {icon}
        <span className={`text-sm font-semibold ${color}`}>{status.label}</span>
      </div>
    </div>
  );
}

export default function PoolStatusSnapshot({ lastRecord }) {
  const sanitation = getSanitationStatus(lastRecord);
  const waterBalance = getWaterBalanceStatus(lastRecord);
  const surfaceProtection = getSurfaceProtectionStatus(lastRecord);

  return (
    <Card>
      <CardContent className="pt-5 space-y-1">
        <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Pool Status</p>

        <StatusRow label="Sanitation" status={sanitation} />
        <StatusRow label="Water Balance" status={waterBalance} />
        <StatusRow label="Surface Protection" status={surfaceProtection} />

        {/* Key numbers — no CC, no LSI */}
        {lastRecord && (
          <div className="pt-3 grid grid-cols-3 gap-2">
            {[
              { key: 'freeChlorine', label: 'Free Chlorine', unit: 'ppm' },
              { key: 'pH', label: 'pH', unit: '' },
              { key: 'calciumHardness', label: 'Calcium', unit: 'ppm' },
            ].map(f => {
              const val = lastRecord[f.key];
              if (val == null) return null;
              return (
                <div key={f.key} className="bg-gray-50 rounded-lg p-2 text-center">
                  <p className="text-xs text-gray-400">{f.label}</p>
                  <p className="font-bold font-mono text-gray-800 text-sm">
                    {val}{f.unit ? ` ${f.unit}` : ''}
                  </p>
                </div>
              );
            })}
          </div>
        )}

        <p className="text-xs text-gray-400 pt-3 leading-relaxed">
          Pool chemistry naturally fluctuates due to weather, sunlight, and normal use. Our job is to monitor those changes and make precise adjustments to keep your water consistently safe, clear, and balanced.
        </p>
      </CardContent>
    </Card>
  );
}