import React from 'react';
import { Card, CardContent } from '@/components/ui/card';

function getSanitationStatus(record) {
  const fc = record?.freeChlorine;
  if (fc == null) return 'Monitoring';
  if (fc >= 1 && fc <= 3) return 'Within Target';
  if (fc > 3) return 'Stable';
  return 'Adjustment Scheduled';
}

function getWaterBalanceStatus(record) {
  const ph = record?.pH;
  const ta = record?.totalAlkalinity;
  if (ph == null || ta == null) return 'Monitoring';
  const phOk = ph >= 7.2 && ph <= 7.8;
  const taOk = ta >= 80 && ta <= 120;
  if (phOk && taOk) return 'Balanced';
  return 'Adjustment in Progress';
}

function getSurfaceProtectionStatus(record) {
  const cya = record?.cyanuricAcid;
  const ch = record?.calciumHardness;
  if (cya == null && ch == null) return 'Monitoring';
  const cyaOk = cya == null || (cya >= 30 && cya <= 100);
  const chOk = ch == null || (ch >= 200 && ch <= 500);
  if (cyaOk && chOk) return 'Protected';
  return 'Adjustment Scheduled';
}

function getOverallStatus(record) {
  if (!record) return 'Monitoring';
  const san = getSanitationStatus(record);
  const bal = getWaterBalanceStatus(record);
  const surf = getSurfaceProtectionStatus(record);
  const allGood = [san, bal, surf].every(s => ['Within Target', 'Balanced', 'Protected', 'Stable'].includes(s));
  const anyAdjusting = [san, bal, surf].some(s => s.includes('Adjustment') || s.includes('Progress'));
  if (allGood) return 'Balanced';
  if (anyAdjusting) return 'Adjustment in Progress';
  return 'Monitoring';
}

function StatusRow({ label, status }) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-gray-100 last:border-0">
      <span className="text-sm text-gray-500">{label}</span>
      <span className="text-sm font-medium text-gray-700">{status}</span>
    </div>
  );
}

export default function PoolStatusSnapshot({ lastRecord }) {
  const sanitation = getSanitationStatus(lastRecord);
  const waterBalance = getWaterBalanceStatus(lastRecord);
  const surfaceProtection = getSurfaceProtectionStatus(lastRecord);
  const overall = getOverallStatus(lastRecord);

  return (
    <Card className="border-gray-100">
      <CardContent className="pt-5 space-y-1">
        <div className="flex items-baseline justify-between mb-3">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Water Snapshot</p>
          <p className="text-sm font-semibold text-gray-700">{overall}</p>
        </div>

        <StatusRow label="Sanitation" status={sanitation} />
        <StatusRow label="Water Balance" status={waterBalance} />
        <StatusRow label="Surface Protection" status={surfaceProtection} />

        <p className="text-xs text-gray-400 pt-4 leading-relaxed border-t border-gray-50 mt-2">
          Water levels can shift due to weather, usage, rainfall, and equipment runtime. These variations are expected and monitored. Any necessary adjustments are handled as part of routine service.
        </p>
      </CardContent>
    </Card>
  );
}