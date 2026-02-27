import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, AlertTriangle } from 'lucide-react';

const SEVERITY_POINTS = {
  LOW_FC: 3, LOW_FC_CRITICAL: 5, HIGH_FC: 2, HIGH_FC_CRITICAL: 4,
  LOW_PH: 2, LOW_PH_CRITICAL: 4, HIGH_PH: 2, HIGH_PH_CRITICAL: 4,
  LOW_TA: 3, HIGH_TA: 2, LOW_CYA: 2, HIGH_CYA: 3,
  LOW_CH: 2, HIGH_CH: 2, LOW_SALT: 3, HIGH_SALT: 2,
  CC_HIGH: 4, CC_CRITICAL: 5, GREEN_ALGAE: 5
};

const EVENT_LABELS = {
  LOW_FC: 'FC Low', LOW_FC_CRITICAL: 'FC Critical Low', HIGH_FC: 'FC High', HIGH_FC_CRITICAL: 'FC Critical High',
  LOW_PH: 'pH Low', LOW_PH_CRITICAL: 'pH Critical Low', HIGH_PH: 'pH High', HIGH_PH_CRITICAL: 'pH Critical High',
  LOW_TA: 'Alkalinity Low', HIGH_TA: 'Alkalinity High', LOW_CYA: 'CYA Low', HIGH_CYA: 'CYA High',
  LOW_CH: 'Calcium Low', HIGH_CH: 'Calcium High', LOW_SALT: 'Salt Low', HIGH_SALT: 'Salt High',
  CC_HIGH: 'CC Elevated', CC_CRITICAL: 'CC Critical', GREEN_ALGAE: 'Green Algae'
};

export default function ReviewRiskEvents({ events = [], leads = [] }) {
  const leadMap = Object.fromEntries(leads.map(l => [l.id, l]));

  // Group by pool, show most severe first
  const byPool = events.reduce((acc, e) => {
    if (!acc[e.poolId]) acc[e.poolId] = [];
    acc[e.poolId].push(e);
    return acc;
  }, {});

  const poolEntries = Object.entries(byPool)
    .map(([poolId, evts]) => ({
      poolId,
      lead: leadMap[evts[0]?.leadId],
      events: evts,
      totalScore: evts.reduce((s, e) => s + (SEVERITY_POINTS[e.eventType] ?? 0), 0)
    }))
    .sort((a, b) => b.totalScore - a.totalScore);

  if (poolEntries.length === 0) {
    return (
      <div className="text-center py-8 text-gray-400 text-sm">No active risk events in the last 30 days</div>
    );
  }

  return (
    <div className="space-y-3">
      {poolEntries.map(({ poolId, lead, events: evts, totalScore }) => {
        const isCritical = totalScore >= 5;
        return (
          <Card key={poolId} className={`border ${isCritical ? 'border-red-200' : 'border-orange-200'}`}>
            <CardContent className="pt-4 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-sm text-gray-900">
                    {lead ? `${lead.firstName} ${lead.lastName || ''}`.trim() : `Pool ${poolId.slice(-6)}`}
                  </p>
                  {lead?.serviceAddress && (
                    <p className="text-xs text-gray-500">{lead.serviceAddress}</p>
                  )}
                </div>
                <Badge className={isCritical ? 'bg-red-100 text-red-800' : 'bg-orange-100 text-orange-800'}>
                  Score: {totalScore}
                </Badge>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {evts.map((e, i) => {
                  const pts = SEVERITY_POINTS[e.eventType] ?? 0;
                  const isCrit = pts >= 5;
                  const Icon = isCrit ? AlertCircle : AlertTriangle;
                  return (
                    <span key={i} className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${
                      isCrit ? 'bg-red-50 text-red-700' : pts >= 3 ? 'bg-orange-50 text-orange-700' : 'bg-yellow-50 text-yellow-700'
                    }`}>
                      <Icon className="w-3 h-3" />
                      {EVENT_LABELS[e.eventType] || e.eventType}
                    </span>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}