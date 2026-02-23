import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Droplet, 
  TrendingDown, 
  TrendingUp, 
  AlertTriangle, 
  Loader2,
  DollarSign,
  Clock,
  Target,
  Settings
} from 'lucide-react';

export default function ChemicalAnalytics() {
  const [analyticsData, setAnalyticsData] = useState(null);
  const [adjustmentMode, setAdjustmentMode] = useState(false);
  const [riskPointAdjustments, setRiskPointAdjustments] = useState({});
  const [bracketAdjustments, setBracketAdjustments] = useState([]);

  const queryClient = useQueryClient();

  const { data: user } = useQuery({
    queryKey: ['user'],
    queryFn: () => base44.auth.me()
  });

  const { data: config } = useQuery({
    queryKey: ['adminSettings'],
    queryFn: async () => {
      const settings = await base44.entities.AdminSettings.filter({ settingKey: 'default' });
      return settings[0];
    }
  });

  const loadAnalytics = useMutation({
    mutationFn: async () => {
      const response = await base44.functions.invoke('chemicalUsageAnalytics', {});
      return response.data;
    },
    onSuccess: (data) => {
      setAnalyticsData(data);
      
      // Initialize adjustment fields from current config
      if (config) {
        const riskEngine = JSON.parse(config.riskEngine);
        setRiskPointAdjustments(riskEngine.points || {});
        setBracketAdjustments(riskEngine.escalation_brackets || []);
      }
    }
  });

  const saveAdjustments = useMutation({
    mutationFn: async () => {
      const riskEngine = JSON.parse(config.riskEngine);
      riskEngine.points = riskPointAdjustments;
      riskEngine.escalation_brackets = bracketAdjustments;

      await base44.entities.AdminSettings.update(config.id, {
        riskEngine: JSON.stringify(riskEngine)
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminSettings'] });
      setAdjustmentMode(false);
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

  const analytics = analyticsData?.analytics;

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Chemical Usage Analytics</h1>
          <p className="text-gray-600 mt-2">
            Real-world cost tracking and pricing feedback loop
          </p>
        </div>
        <Button
          onClick={() => loadAnalytics.mutate()}
          disabled={loadAnalytics.isPending}
          className="bg-[var(--color-primary)] hover:bg-[var(--color-primary)]/90"
        >
          {loadAnalytics.isPending ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Analyzing...
            </>
          ) : (
            <>
              <Droplet className="w-4 h-4 mr-2" />
              Run Analysis
            </>
          )}
        </Button>
      </div>

      {analyticsData && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Total Pools</p>
                  <p className="text-2xl font-bold">{analyticsData.totalPools}</p>
                </div>
                <Target className="w-8 h-8 text-blue-500" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Service Visits</p>
                  <p className="text-2xl font-bold">{analyticsData.totalVisits}</p>
                </div>
                <Clock className="w-8 h-8 text-green-500" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Data Points</p>
                  <p className="text-2xl font-bold">{analyticsData.totalVisits}</p>
                </div>
                <Droplet className="w-8 h-8 text-teal-500" />
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {analytics && (
        <Tabs defaultValue="brackets" className="space-y-6">
          <TabsList>
            <TabsTrigger value="brackets">By Risk Bracket</TabsTrigger>
            <TabsTrigger value="tiers">By Size Tier</TabsTrigger>
            <TabsTrigger value="frequency">By Frequency</TabsTrigger>
            <TabsTrigger value="underpriced">Underpriced</TabsTrigger>
            <TabsTrigger value="overperforming">Overperforming</TabsTrigger>
            <TabsTrigger value="adjustments">Adjustments</TabsTrigger>
          </TabsList>

          {/* By Risk Bracket */}
          <TabsContent value="brackets">
            <Card>
              <CardHeader>
                <CardTitle>Cost Analysis by Risk Bracket</CardTitle>
                <CardDescription>
                  Average chemical and labor costs per risk tier
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {Object.entries(analytics.byRiskBracket).map(([bracket, data]) => (
                    <div key={bracket} className="border rounded-lg p-4">
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <h4 className="font-semibold text-lg">
                            Risk {bracket}
                          </h4>
                          <p className="text-sm text-gray-600">{data.count} pools</p>
                        </div>
                        <div className={`text-right ${
                          data.avgMarginPct >= 50 ? 'text-green-600' : 'text-red-600'
                        }`}>
                          <p className="text-2xl font-bold">{data.avgMarginPct.toFixed(1)}%</p>
                          <p className="text-sm">Avg margin</p>
                        </div>
                      </div>
                      <div className="grid grid-cols-4 gap-4 text-sm">
                        <div>
                          <p className="text-gray-600">Chemical Cost</p>
                          <p className="font-semibold">${data.avgChemicalCost.toFixed(0)}/mo</p>
                        </div>
                        <div>
                          <p className="text-gray-600">Labor Time</p>
                          <p className="font-semibold">{data.avgLaborMinutes.toFixed(0)} min/mo</p>
                        </div>
                        <div>
                          <p className="text-gray-600">Revenue</p>
                          <p className="font-semibold">${data.avgRevenue.toFixed(0)}/mo</p>
                        </div>
                        <div>
                          <p className="text-gray-600">Margin</p>
                          <p className="font-semibold">${data.avgMargin.toFixed(0)}/mo</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* By Size Tier */}
          <TabsContent value="tiers">
            <Card>
              <CardHeader>
                <CardTitle>Cost Analysis by Pool Size</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {Object.entries(analytics.bySizeTier).map(([tier, data]) => (
                    <div key={tier} className="border rounded-lg p-4">
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <h4 className="font-semibold text-lg capitalize">
                            {tier.replace('_', ' ')}
                          </h4>
                          <p className="text-sm text-gray-600">{data.count} pools</p>
                        </div>
                        <div className="text-right">
                          <p className="text-2xl font-bold">{data.avgMarginPct.toFixed(1)}%</p>
                        </div>
                      </div>
                      <div className="grid grid-cols-4 gap-4 text-sm">
                        <div>
                          <p className="text-gray-600">Chemical Cost</p>
                          <p className="font-semibold">${data.avgChemicalCost.toFixed(0)}/mo</p>
                        </div>
                        <div>
                          <p className="text-gray-600">Labor Time</p>
                          <p className="font-semibold">{data.avgLaborMinutes.toFixed(0)} min/mo</p>
                        </div>
                        <div>
                          <p className="text-gray-600">Revenue</p>
                          <p className="font-semibold">${data.avgRevenue.toFixed(0)}/mo</p>
                        </div>
                        <div>
                          <p className="text-gray-600">Margin</p>
                          <p className="font-semibold">${data.avgMargin.toFixed(0)}/mo</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* By Frequency */}
          <TabsContent value="frequency">
            <Card>
              <CardHeader>
                <CardTitle>Cost Analysis by Service Frequency</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {Object.entries(analytics.byFrequency).map(([freq, data]) => (
                    <div key={freq} className="border rounded-lg p-4">
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <h4 className="font-semibold text-lg capitalize">
                            {freq.replace('_', ' ')}
                          </h4>
                          <p className="text-sm text-gray-600">{data.count} pools</p>
                        </div>
                        <div className="text-right">
                          <p className="text-2xl font-bold">{data.avgMarginPct.toFixed(1)}%</p>
                        </div>
                      </div>
                      <div className="grid grid-cols-4 gap-4 text-sm">
                        <div>
                          <p className="text-gray-600">Chemical Cost</p>
                          <p className="font-semibold">${data.avgChemicalCost.toFixed(0)}/mo</p>
                        </div>
                        <div>
                          <p className="text-gray-600">Labor Time</p>
                          <p className="font-semibold">{data.avgLaborMinutes.toFixed(0)} min/mo</p>
                        </div>
                        <div>
                          <p className="text-gray-600">Revenue</p>
                          <p className="font-semibold">${data.avgRevenue.toFixed(0)}/mo</p>
                        </div>
                        <div>
                          <p className="text-gray-600">Margin</p>
                          <p className="font-semibold">${data.avgMargin.toFixed(0)}/mo</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Underpriced Pools */}
          <TabsContent value="underpriced">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingDown className="w-5 h-5 text-red-500" />
                  Underpriced Pools (Margin &lt; 40%)
                </CardTitle>
                <CardDescription>
                  Pools with high costs relative to revenue
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {analytics.underpricedPools.map((pool, idx) => (
                    <div key={pool.leadId} className="border-l-4 border-red-500 bg-red-50 p-3 rounded">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-semibold">{pool.customerName}</p>
                          <p className="text-sm text-gray-600">
                            {pool.sizeTier.toUpperCase()} • Risk {pool.riskBracket} (score: {pool.riskScore})
                          </p>
                          <p className="text-xs text-gray-500 mt-1">
                            {pool.visitCount} visits • ${pool.avgChemicalCostPerVisit} avg chemical/visit
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-xl font-bold text-red-600">{pool.marginPct}%</p>
                          <p className="text-sm text-gray-600">
                            ${pool.monthlyRevenue} - ${pool.monthlyCost.toFixed(0)}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Overperforming Pools */}
          <TabsContent value="overperforming">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-green-500" />
                  Overperforming Pools (Margin &gt; 60%)
                </CardTitle>
                <CardDescription>
                  Pools with low costs relative to revenue
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {analytics.overperformingPools.map((pool) => (
                    <div key={pool.leadId} className="border-l-4 border-green-500 bg-green-50 p-3 rounded">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-semibold">{pool.customerName}</p>
                          <p className="text-sm text-gray-600">
                            {pool.sizeTier.toUpperCase()} • Risk {pool.riskBracket} (score: {pool.riskScore})
                          </p>
                          <p className="text-xs text-gray-500 mt-1">
                            {pool.visitCount} visits • ${pool.avgChemicalCostPerVisit} avg chemical/visit
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-xl font-bold text-green-600">{pool.marginPct}%</p>
                          <p className="text-sm text-gray-600">
                            ${pool.monthlyRevenue} - ${pool.monthlyCost.toFixed(0)}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Adjustment Recommendations */}
          <TabsContent value="adjustments">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Settings className="w-5 h-5 text-blue-500" />
                  Pricing Adjustments
                </CardTitle>
                <CardDescription>
                  Modify risk points and escalation brackets based on real data
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Recommendations */}
                {analytics.adjustmentRecommendations.length > 0 && (
                  <div className="space-y-3">
                    <h3 className="font-semibold">Automated Recommendations</h3>
                    {analytics.adjustmentRecommendations.map((rec, idx) => (
                      <div key={idx} className="border-l-4 border-blue-500 bg-blue-50 p-4 rounded">
                        <p className="font-semibold text-gray-900 mb-2">
                          {rec.type === 'increase_bracket_addon' && `Increase ${rec.bracket} bracket addon`}
                          {rec.type === 'adjust_risk_points' && 'Adjust risk points'}
                        </p>
                        <p className="text-sm text-gray-700 mb-2">
                          <strong>Issue:</strong> {rec.issue}
                        </p>
                        {rec.suggestedIncrease && (
                          <p className="text-sm text-blue-700 font-semibold">
                            Suggested: +${rec.suggestedIncrease}/month
                          </p>
                        )}
                        {rec.suggestion && (
                          <p className="text-sm text-blue-700">{rec.suggestion}</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Manual Adjustments */}
                <div className="border-t pt-6">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="font-semibold">Manual Adjustments</h3>
                    <Button
                      variant="outline"
                      onClick={() => setAdjustmentMode(!adjustmentMode)}
                    >
                      {adjustmentMode ? 'Cancel' : 'Edit Settings'}
                    </Button>
                  </div>

                  {adjustmentMode && config && (
                    <div className="space-y-6">
                      {/* Risk Points */}
                      <div>
                        <h4 className="font-medium mb-3">Risk Points</h4>
                        <div className="grid grid-cols-2 gap-4">
                          {Object.entries(riskPointAdjustments).map(([key, value]) => (
                            <div key={key} className="space-y-2">
                              <Label>{key.replace(/_/g, ' ')}</Label>
                              <Input
                                type="number"
                                step="0.5"
                                value={value}
                                onChange={(e) => setRiskPointAdjustments({
                                  ...riskPointAdjustments,
                                  [key]: parseFloat(e.target.value)
                                })}
                              />
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Escalation Brackets */}
                      <div>
                        <h4 className="font-medium mb-3">Escalation Brackets</h4>
                        <div className="space-y-3">
                          {bracketAdjustments.map((bracket, idx) => (
                            <div key={idx} className="grid grid-cols-3 gap-4 items-end">
                              <div className="space-y-2">
                                <Label>Min Risk</Label>
                                <Input
                                  type="number"
                                  value={bracket.min_risk}
                                  onChange={(e) => {
                                    const updated = [...bracketAdjustments];
                                    updated[idx].min_risk = parseInt(e.target.value);
                                    setBracketAdjustments(updated);
                                  }}
                                />
                              </div>
                              <div className="space-y-2">
                                <Label>Max Risk</Label>
                                <Input
                                  type="number"
                                  value={bracket.max_risk}
                                  onChange={(e) => {
                                    const updated = [...bracketAdjustments];
                                    updated[idx].max_risk = parseInt(e.target.value);
                                    setBracketAdjustments(updated);
                                  }}
                                />
                              </div>
                              <div className="space-y-2">
                                <Label>Add-on $</Label>
                                <Input
                                  type="number"
                                  value={bracket.addon_amount}
                                  onChange={(e) => {
                                    const updated = [...bracketAdjustments];
                                    updated[idx].addon_amount = parseInt(e.target.value);
                                    setBracketAdjustments(updated);
                                  }}
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      <Button
                        onClick={() => saveAdjustments.mutate()}
                        disabled={saveAdjustments.isPending}
                        className="w-full bg-[var(--color-primary)]"
                      >
                        {saveAdjustments.isPending ? 'Saving...' : 'Save Adjustments'}
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}