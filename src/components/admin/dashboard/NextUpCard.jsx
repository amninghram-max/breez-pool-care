import React from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertCircle, ArrowRight, CheckCircle2, Zap } from 'lucide-react';

function BlockerRow({ label, count, linkPath, linkLabel, severity }) {
  const colors = {
    critical: 'border-l-red-500 bg-red-50',
    warning:  'border-l-amber-400 bg-amber-50',
    info:     'border-l-blue-400 bg-blue-50',
  };
  const textColors = {
    critical: 'text-red-700',
    warning:  'text-amber-700',
    info:     'text-blue-700',
  };

  return (
    <div className={`flex items-center justify-between px-3 py-2.5 border-l-4 rounded-r-lg ${colors[severity]}`}>
      <div className="flex items-center gap-2">
        <AlertCircle className={`w-4 h-4 flex-shrink-0 ${textColors[severity]}`} />
        <span className={`text-sm font-medium ${textColors[severity]}`}>{label}</span>
        {count > 0 && (
          <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full bg-white/60 ${textColors[severity]}`}>
            {count}
          </span>
        )}
      </div>
      <Link
        to={createPageUrl(linkPath)}
        className={`flex items-center gap-1 text-xs font-semibold hover:underline ${textColors[severity]}`}
      >
        {linkLabel}
        <ArrowRight className="w-3 h-3" />
      </Link>
    </div>
  );
}

export default function NextUpCard() {
  const { data: adminSettings = [] } = useQuery({
    queryKey: ['adminSettingsHealth'],
    queryFn: () => base44.entities.AdminSettings.list()
  });

  const { data: pendingInspections = [] } = useQuery({
    queryKey: ['pendingInspectionsCount'],
    queryFn: () => base44.entities.InspectionRecord.filter({ finalizationStatus: 'pending_finalization' }, '-submittedAt', 50)
  });

  const { data: allLeads = [] } = useQuery({
    queryKey: ['leads-nextup'],
    queryFn: () => base44.entities.Lead.filter({ activationPaymentStatus: 'pending' }, '-created_date', 100)
  });

  const { data: safetyIncidents = [] } = useQuery({
    queryKey: ['openFecalIncidents'],
    queryFn: () => base44.entities.FecalIncident.filter({ status: 'open' }, '-reportedAt', 20)
  });

  const settingsMissing = adminSettings.length === 0;
  const pendingCount = pendingInspections.length;
  const pendingPaymentsCount = allLeads.filter(l =>
    ['converted', 'inspection_confirmed', 'quote_sent'].includes(l.stage)
  ).length;
  const safetyCount = safetyIncidents.length;

  const blockers = [
    settingsMissing && { label: 'AdminSettings not configured — pricing engine blocked', count: 0, linkPath: 'AdminSettingsSetup', linkLabel: 'Configure', severity: 'critical' },
    safetyCount > 0 && { label: 'Open safety incidents', count: safetyCount, linkPath: 'AdminHome', linkLabel: 'Review', severity: 'critical' },
    pendingCount > 0 && { label: 'Inspections pending finalization', count: pendingCount, linkPath: 'InspectionFinalization', linkLabel: 'Finalize', severity: 'warning' },
    pendingPaymentsCount > 0 && { label: 'Activation payments pending', count: pendingPaymentsCount, linkPath: 'LeadsPipeline', linkLabel: 'View Leads', severity: 'info' },
  ].filter(Boolean);

  if (blockers.length === 0) {
    return (
      <Card className="border-green-200 bg-green-50">
        <CardContent className="p-4 flex items-center gap-3">
          <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
          <p className="text-sm font-medium text-green-700">All clear — no action items right now.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-amber-200">
      <CardHeader className="pb-2 pt-3 px-4">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold text-gray-700">
          <Zap className="w-4 h-4 text-amber-500" />
          Next Up — {blockers.length} action item{blockers.length !== 1 ? 's' : ''}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4 space-y-2">
        {blockers.map((b, i) => (
          <BlockerRow key={i} {...b} />
        ))}
      </CardContent>
    </Card>
  );
}