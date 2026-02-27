import React from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, TrendingUp, FlaskConical, RefreshCw } from 'lucide-react';
import { subDays } from 'date-fns';
import ReviewRiskEvents from '../components/admin/ReviewRiskEvents';
import ReviewFrequencyRecs from '../components/admin/ReviewFrequencyRecs';
import ReviewPendingDosePlans from '../components/admin/ReviewPendingDosePlans';

export default function AdminReviewDashboard() {
  const thirtyDaysAgo = subDays(new Date(), 30).toISOString();

  const { data: leads = [] } = useQuery({
    queryKey: ['leads'],
    queryFn: () => base44.entities.Lead.list(),
  });

  const { data: riskEvents = [], isLoading: loadingRisk } = useQuery({
    queryKey: ['riskEvents30d'],
    queryFn: () => base44.entities.ChemistryRiskEvent.list('-createdDate', 200),
  });

  const { data: freqRecs = [], isLoading: loadingRecs } = useQuery({
    queryKey: ['freqRecs'],
    queryFn: () => base44.entities.FrequencyRecommendation.filter({ status: { $in: ['pending_review', 'monitoring', 'contacted'] } }),
  });

  const { data: dosePlans = [], isLoading: loadingPlans } = useQuery({
    queryKey: ['pendingDosePlans'],
    queryFn: () => base44.entities.DosePlan.filter({ verificationStatus: 'pending' }, '-createdDate', 50),
  });

  // Only show active (non-expired) risk events
  const activeRiskEvents = riskEvents.filter(e => !e.expiresAt || new Date(e.expiresAt) > new Date());

  // Summary counts for header
  const criticalCount = activeRiskEvents.filter(e => {
    const pts = { LOW_FC_CRITICAL: 5, HIGH_FC_CRITICAL: 4, LOW_PH_CRITICAL: 4, HIGH_PH_CRITICAL: 4, CC_CRITICAL: 5, GREEN_ALGAE: 5 };
    return (pts[e.eventType] ?? 0) >= 5;
  }).length;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Chemistry Review</h1>
          <p className="text-sm text-gray-500 mt-1">Active risk events, frequency recommendations, and pending dose plan verifications</p>
        </div>
        {criticalCount > 0 && (
          <Badge className="bg-red-100 text-red-800 text-sm px-3 py-1">
            <AlertCircle className="w-3.5 h-3.5 mr-1" />
            {criticalCount} critical
          </Badge>
        )}
      </div>

      {/* Summary bar */}
      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="pt-4 pb-4 flex items-center gap-3">
            <div className="p-2 bg-red-100 rounded-lg">
              <AlertCircle className="w-4 h-4 text-red-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500">Active Risk Events</p>
              <p className="text-xl font-bold text-gray-900">{activeRiskEvents.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4 flex items-center gap-3">
            <div className="p-2 bg-yellow-100 rounded-lg">
              <TrendingUp className="w-4 h-4 text-yellow-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500">Freq. Recs Open</p>
              <p className="text-xl font-bold text-gray-900">{freqRecs.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4 flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <FlaskConical className="w-4 h-4 text-blue-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500">Pending Dose Plans</p>
              <p className="text-xl font-bold text-gray-900">{dosePlans.length}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Three columns on desktop, stacked on mobile */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Active Risk Events */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-500" />
            <h2 className="font-semibold text-gray-900">Active Risk Events</h2>
            {!loadingRisk && activeRiskEvents.length > 0 && (
              <Badge variant="outline" className="text-xs">{activeRiskEvents.length}</Badge>
            )}
          </div>
          {loadingRisk ? (
            <div className="flex items-center justify-center h-24">
              <RefreshCw className="w-5 h-5 text-gray-400 animate-spin" />
            </div>
          ) : (
            <ReviewRiskEvents events={activeRiskEvents} leads={leads} />
          )}
        </div>

        {/* Frequency Recommendations */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-yellow-500" />
            <h2 className="font-semibold text-gray-900">Frequency Recommendations</h2>
            {!loadingRecs && freqRecs.length > 0 && (
              <Badge variant="outline" className="text-xs">{freqRecs.length}</Badge>
            )}
          </div>
          {loadingRecs ? (
            <div className="flex items-center justify-center h-24">
              <RefreshCw className="w-5 h-5 text-gray-400 animate-spin" />
            </div>
          ) : (
            <ReviewFrequencyRecs recs={freqRecs} leads={leads} />
          )}
        </div>

        {/* Pending Dose Plan Verifications */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <FlaskConical className="w-4 h-4 text-blue-500" />
            <h2 className="font-semibold text-gray-900">Dose Plan Verifications</h2>
            {!loadingPlans && dosePlans.length > 0 && (
              <Badge variant="outline" className="text-xs">{dosePlans.length}</Badge>
            )}
          </div>
          {loadingPlans ? (
            <div className="flex items-center justify-center h-24">
              <RefreshCw className="w-5 h-5 text-gray-400 animate-spin" />
            </div>
          ) : (
            <ReviewPendingDosePlans dosePlans={dosePlans} leads={leads} />
          )}
        </div>

      </div>
    </div>
  );
}