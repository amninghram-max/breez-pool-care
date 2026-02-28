import React from 'react';
import { CheckCircle, XCircle, AlertTriangle, Info } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

function CheckRow({ label, result }) {
  const passed = result?.passed;
  return (
    <div className="flex items-start gap-3 py-3 border-b last:border-0">
      <div className="mt-0.5">
        {passed
          ? <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
          : <XCircle className="w-4 h-4 text-red-500 shrink-0" />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-800">{label}</p>
        {result?.details && (
          <p className="text-xs text-gray-500 mt-0.5 break-words">{result.details}</p>
        )}
        {result?.finalMonthlyPrice !== undefined && (
          <p className="text-xs text-gray-400 mt-0.5">
            Monthly: ${result.finalMonthlyPrice} · Base: ${result.baseMonthly}
            {result.riskAddon > 0 && ` · Risk addon: +$${result.riskAddon}`}
            {result.adjustedRisk !== undefined && ` · Adj. risk: ${result.adjustedRisk}`}
          </p>
        )}
      </div>
    </div>
  );
}

const CHECK_LABELS = {
  adminSettingsPresent: 'AdminSettings record exists',
  configIntegrity: 'Config integrity (brackets, multipliers, tokens)',
  pricingFloor: 'Absolute price floor enforced',
  tierAPricing: 'Tier A base price in valid range ($120–$250)',
  riskEscalation: 'Risk escalation brackets firing',
  entityAccess: 'Entity layer reachable',
};

export default function ReadinessCheckPanel({ readiness }) {
  if (!readiness) return null;

  const { releaseReady, blockers = [], warnings = [], checks = {}, configRecordId, configUpdatedAt, usingDefaults } = readiness;

  return (
    <div className="space-y-4">
      {/* Summary banner */}
      <div className={`rounded-lg p-4 flex items-center gap-3 ${releaseReady ? 'bg-emerald-50 border border-emerald-200' : 'bg-red-50 border border-red-200'}`}>
        {releaseReady
          ? <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0" />
          : <XCircle className="w-5 h-5 text-red-500 shrink-0" />}
        <div>
          <p className={`font-semibold ${releaseReady ? 'text-emerald-800' : 'text-red-800'}`}>
            {releaseReady ? 'Release Ready — all checks passed' : `Release Blocked — ${blockers.length} blocker${blockers.length !== 1 ? 's' : ''}`}
          </p>
          {configRecordId && (
            <p className="text-xs text-gray-500 mt-0.5">Config ID: {configRecordId} · Created: {configUpdatedAt ? new Date(configUpdatedAt).toLocaleString() : '—'}</p>
          )}
        </div>
      </div>

      {/* Blockers */}
      {blockers.length > 0 && (
        <Card className="border-red-200">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm font-semibold text-red-700 flex items-center gap-2">
              <XCircle className="w-4 h-4" /> Blockers
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <ul className="space-y-1">
              {blockers.map((b, i) => (
                <li key={i} className="text-sm text-red-700 flex items-start gap-2">
                  <span className="mt-1 shrink-0">•</span> {b}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Warnings */}
      {warnings.length > 0 && (
        <Card className="border-amber-200">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm font-semibold text-amber-700 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" /> Warnings
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <ul className="space-y-1">
              {warnings.map((w, i) => (
                <li key={i} className="text-sm text-amber-700 flex items-start gap-2">
                  <span className="mt-1 shrink-0">•</span> {w}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Individual checks */}
      {Object.keys(checks).length > 0 && (
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <Info className="w-4 h-4" /> Check Details
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-2">
            {Object.entries(checks).map(([key, result]) => (
              <CheckRow key={key} label={CHECK_LABELS[key] || key} result={result} />
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}