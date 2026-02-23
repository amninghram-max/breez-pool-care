import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  AlertTriangle, 
  Loader2,
  BarChart3,
  Target,
  Activity
} from 'lucide-react';

export default function MarginStressTest() {
  const [targetMargin, setTargetMargin] = useState(50);
  const [poolCount, setPoolCount] = useState(500);
  const [simulationResults, setSimulationResults] = useState(null);

  const { data: user } = useQuery({
    queryKey: ['user'],
    queryFn: () => base44.auth.me()
  });

  const runSimulation = useMutation({
    mutationFn: async () => {
      const response = await base44.functions.invoke('marginStressTest', {
        targetMargin,
        poolCount
      });
      return response.data;
    },
    onSuccess: (data) => {
      setSimulationResults(data);
    }
  });

  if (user?.role !== 'admin') {
    return (
      <Alert>
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>Admin access required</AlertDescription>
      </Alert>
    );
  }

  const analytics = simulationResults?.analytics;

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Margin Stress-Test Simulation</h1>
        <p className="text-gray-600 mt-2">
          Simulate 500 synthetic pools to analyze pricing margins and cost structures
        </p>
      </div>

      {/* Configuration */}
      <Card>
        <CardHeader>
          <CardTitle>Simulation Parameters</CardTitle>
          <CardDescription>Configure target margin and pool count</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-2">
              <Label htmlFor="targetMargin">Target Margin %</Label>
              <Input
                id="targetMargin"
                type="number"
                value={targetMargin}
                onChange={(e) => setTargetMargin(parseInt(e.target.value))}
                min="0"
                max="100"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="poolCount">Pool Count</Label>
              <Input
                id="poolCount"
                type="number"
                value={poolCount}
                onChange={(e) => setPoolCount(parseInt(e.target.value))}
                min="100"
                max="1000"
                step="100"
              />
            </div>
            <div className="flex items-end">
              <Button
                onClick={() => runSimulation.mutate()}
                disabled={runSimulation.isPending}
                className="w-full bg-[var(--color-primary)] hover:bg-[var(--color-primary)]/90"
              >
                {runSimulation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Running...
                  </>
                ) : (
                  <>
                    <Activity className="w-4 h-4 mr-2" />
                    Run Simulation
                  </>
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {runSimulation.isError && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{runSimulation.error.message}</AlertDescription>
        </Alert>
      )}

      {analytics && (
        <>
          {/* Overall Stats */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">Avg Revenue</p>
                    <p className="text-2xl font-bold text-gray-900">
                      ${analytics.overall.avgRevenue.toFixed(0)}
                    </p>
                  </div>
                  <DollarSign className="w-8 h-8 text-green-500" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">Avg Cost</p>
                    <p className="text-2xl font-bold text-gray-900">
                      ${analytics.overall.avgCost.toFixed(0)}
                    </p>
                  </div>
                  <TrendingDown className="w-8 h-8 text-red-500" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">Avg Margin</p>
                    <p className="text-2xl font-bold text-gray-900">
                      ${analytics.overall.avgMargin.toFixed(0)}
                    </p>
                  </div>
                  <BarChart3 className="w-8 h-8 text-blue-500" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">Margin %</p>
                    <p className={`text-2xl font-bold ${
                      analytics.overall.meetsTarget ? 'text-green-600' : 'text-red-600'
                    }`}>
                      {analytics.overall.avgMarginPct.toFixed(1)}%
                    </p>
                  </div>
                  <Target className={`w-8 h-8 ${
                    analytics.overall.meetsTarget ? 'text-green-500' : 'text-red-500'
                  }`} />
                </div>
                {!analytics.overall.meetsTarget && (
                  <p className="text-xs text-red-600 mt-2">
                    Below target ({targetMargin}%)
                  </p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* By Tier Analysis */}
          <Card>
            <CardHeader>
              <CardTitle>Margin by Size Tier</CardTitle>
              <CardDescription>Performance across different pool sizes</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {Object.entries(analytics.byTier).map(([tier, stats]) => (
                  <div key={tier} className="border rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <h4 className="font-semibold text-lg capitalize">
                          {tier.replace('_', ' ')}
                        </h4>
                        <p className="text-sm text-gray-600">{stats.count} pools</p>
                      </div>
                      <div className={`text-right ${
                        stats.meetsTarget ? 'text-green-600' : 'text-red-600'
                      }`}>
                        <p className="text-2xl font-bold">{stats.avgMarginPct.toFixed(1)}%</p>
                        <p className="text-sm">
                          {stats.meetsTarget ? '✓ Meets target' : '✗ Below target'}
                        </p>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-4 mt-3 text-sm">
                      <div>
                        <p className="text-gray-600">Avg Revenue</p>
                        <p className="font-semibold">${stats.avgRevenue.toFixed(0)}</p>
                      </div>
                      <div>
                        <p className="text-gray-600">Avg Cost</p>
                        <p className="font-semibold">${stats.avgCost.toFixed(0)}</p>
                      </div>
                      <div>
                        <p className="text-gray-600">Avg Margin</p>
                        <p className="font-semibold">${stats.avgMargin.toFixed(0)}</p>
                      </div>
                    </div>
                    <div className="mt-3 bg-gray-200 rounded-full h-2">
                      <div
                        className={`h-2 rounded-full ${
                          stats.meetsTarget ? 'bg-green-500' : 'bg-red-500'
                        }`}
                        style={{ width: `${Math.min(stats.avgMarginPct, 100)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Worst Case Scenarios */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-red-500" />
                Worst-Case Scenarios (Top 10)
              </CardTitle>
              <CardDescription>Pools with lowest margins</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {analytics.worstCase.map((scenario, idx) => (
                  <div key={idx} className="border-l-4 border-red-500 bg-red-50 p-3 rounded">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-semibold">
                          {scenario.sizeTier.replace('_', ' ').toUpperCase()} - {scenario.profile.enclosure}
                        </p>
                        <p className="text-sm text-gray-600">
                          {scenario.profile.usage} usage, {scenario.profile.chlorination}, {scenario.frequency}
                        </p>
                        <p className="text-xs text-gray-500 mt-1">
                          Risk score: {scenario.risk.toFixed(1)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-2xl font-bold text-red-600">
                          {scenario.marginPct.toFixed(1)}%
                        </p>
                        <p className="text-sm text-gray-600">
                          ${scenario.revenue} - ${scenario.cost} = ${scenario.margin.toFixed(0)}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* High-Risk Clusters */}
          {analytics.highRiskClusters.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>High-Risk Margin Clusters</CardTitle>
                <CardDescription>Pool profiles with consistently low margins</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {analytics.highRiskClusters.map((cluster, idx) => (
                    <div key={idx} className="border rounded-lg p-4 bg-amber-50">
                      <div className="flex justify-between items-center">
                        <div>
                          <p className="font-semibold">
                            {cluster.profile.sizeTier.replace('_', ' ').toUpperCase()}
                          </p>
                          <p className="text-sm text-gray-600">
                            {cluster.profile.enclosure}, {cluster.profile.usage} usage
                          </p>
                          <p className="text-xs text-gray-500 mt-1">
                            {cluster.count} pools, avg risk: {cluster.avgRisk.toFixed(1)}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-xl font-bold text-amber-700">
                            {cluster.avgMarginPct.toFixed(1)}%
                          </p>
                          <p className="text-sm text-gray-600">Avg margin</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Recommendations */}
          {analytics.recommendations.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-blue-500" />
                  Recommended Adjustments
                </CardTitle>
                <CardDescription>
                  Suggested changes to improve margins to {targetMargin}% target
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {analytics.recommendations.map((rec, idx) => (
                    <div key={idx} className="border-l-4 border-blue-500 bg-blue-50 p-4 rounded">
                      <div className="flex items-start gap-3">
                        <div className="bg-blue-500 text-white rounded-full w-8 h-8 flex items-center justify-center flex-shrink-0 font-bold">
                          {idx + 1}
                        </div>
                        <div className="flex-1">
                          <p className="font-semibold text-gray-900 mb-1">
                            {rec.tier === 'all' ? 'All Tiers' : rec.tier.toUpperCase()}
                          </p>
                          <p className="text-sm text-gray-700 mb-2">
                            <strong>Issue:</strong> {rec.issue}
                          </p>
                          <p className="text-sm text-gray-700 mb-2">
                            <strong>Action:</strong> {rec.action.replace(/_/g, ' ')}
                          </p>
                          {rec.suggestedIncrease && (
                            <p className="text-sm text-blue-700 font-semibold">
                              Suggested increase: +${rec.suggestedIncrease}/month
                            </p>
                          )}
                          {rec.suggestedChange && (
                            <p className="text-sm text-blue-700 font-semibold">
                              {rec.suggestedChange}
                            </p>
                          )}
                          <p className="text-xs text-gray-600 mt-2 italic">
                            💡 {rec.impact}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}