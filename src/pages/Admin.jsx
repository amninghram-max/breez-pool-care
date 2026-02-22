import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AlertCircle } from 'lucide-react';

export default function Admin() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('pricing');
  const [formData, setFormData] = useState({});

  const { data: user } = useQuery({
    queryKey: ['user'],
    queryFn: () => base44.auth.me(),
  });

  const { data: settings = {} } = useQuery({
    queryKey: ['adminSettings'],
    queryFn: async () => {
      const result = await base44.entities.AdminSettings.filter({
        settingKey: 'default'
      });
      return result[0] || {};
    },
  });

  const updateSettingsMutation = useMutation({
    mutationFn: async (updatedData) => {
      if (settings.id) {
        return base44.entities.AdminSettings.update(settings.id, updatedData);
      } else {
        return base44.entities.AdminSettings.create({
          settingKey: 'default',
          ...updatedData
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminSettings'] });
      alert('Settings updated successfully');
    },
  });

  // Check admin access
  if (user?.role !== 'admin') {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Card className="bg-red-50 border-red-200">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-red-600" />
              <p className="text-red-800 font-medium">Admin access required</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const handleSave = (formData) => {
    updateSettingsMutation.mutate(formData);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold text-gray-900">Admin Settings</h1>
        <p className="text-gray-600 mt-1">Configure pricing, seasonality, risk, and storm recovery parameters</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid grid-cols-7 w-full bg-gray-100 p-1 rounded-lg overflow-x-auto">
          <TabsTrigger value="pricing">Pricing</TabsTrigger>
          <TabsTrigger value="seasonality">Seasonality</TabsTrigger>
          <TabsTrigger value="risk">Risk</TabsTrigger>
          <TabsTrigger value="chemistry">Chemistry</TabsTrigger>
          <TabsTrigger value="margin">Margin</TabsTrigger>
          <TabsTrigger value="summer">Summer</TabsTrigger>
          <TabsTrigger value="storm">Storm</TabsTrigger>
        </TabsList>

        {/* PRICING TAB */}
        <TabsContent value="pricing" className="space-y-4 mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Base Pricing</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <Label>Base Monthly Price ($)</Label>
                  <Input
                    type="number"
                    defaultValue={settings.baseMonthlyPrice || 299}
                    onChange={(e) => setFormData(prev => ({
                      ...prev,
                      baseMonthlyPrice: parseFloat(e.target.value)
                    }))}
                    className="mt-2"
                  />
                </div>
                <div>
                  <Label>Target Gross Margin (%)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    defaultValue={(settings.targetGrossMargin || 0.55) * 100}
                    onChange={(e) => setFormData(prev => ({
                      ...prev,
                      targetGrossMargin: parseFloat(e.target.value) / 100
                    }))}
                    className="mt-2"
                  />
                  <p className="text-xs text-gray-500 mt-2">Recommended: 55% (0.45-0.70)</p>
                </div>
              </div>
              <Button onClick={() => handleSave({ 
                baseMonthlyPrice: settings.baseMonthlyPrice,
                targetGrossMargin: settings.targetGrossMargin
              })}>
                Save Pricing
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* SEASONALITY TAB */}
        <TabsContent value="seasonality" className="space-y-4 mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Region & Climate</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Region</Label>
                <Input
                  type="text"
                  defaultValue={settings.seasonality?.region || 'florida'}
                  className="mt-2"
                />
                <p className="text-xs text-gray-500 mt-2">Default: florida (affects season dates & defaults)</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Peak Season (Higher Chemical Demand)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <Label>Start Month (1-12)</Label>
                  <Input
                    type="number"
                    min="1"
                    max="12"
                    defaultValue={settings.seasonality?.peakSeasonStartMonth || 3}
                    onChange={(e) => setFormData(prev => ({
                      ...prev,
                      seasonality: {...(prev.seasonality || {}), peakSeasonStartMonth: parseInt(e.target.value)}
                    }))}
                    className="mt-2"
                  />
                </div>
                <div>
                  <Label>End Month (1-12)</Label>
                  <Input
                    type="number"
                    min="1"
                    max="12"
                    defaultValue={settings.seasonality?.peakSeasonEndMonth || 10}
                    onChange={(e) => setFormData(prev => ({
                      ...prev,
                      seasonality: {...(prev.seasonality || {}), peakSeasonEndMonth: parseInt(e.target.value)}
                    }))}
                    className="mt-2"
                  />
                </div>
                <div>
                  <Label>Chemical Multiplier</Label>
                  <Input
                    type="number"
                    step="0.01"
                    defaultValue={settings.seasonality?.peakSeasonChemicalMultiplier || 1.15}
                    onChange={(e) => setFormData(prev => ({
                      ...prev,
                      seasonality: {...(prev.seasonality || {}), peakSeasonChemicalMultiplier: parseFloat(e.target.value)}
                    }))}
                    className="mt-2"
                  />
                </div>
              </div>
              <div>
                <Label>Weekly Frequency Threshold (Risk Score)</Label>
                <Input
                  type="number"
                  defaultValue={settings.seasonality?.peakSeasonWeeklyThreshold || 55}
                  onChange={(e) => setFormData(prev => ({
                    ...prev,
                    seasonality: {...(prev.seasonality || {}), peakSeasonWeeklyThreshold: parseInt(e.target.value)}
                  }))}
                  className="mt-2"
                />
                <p className="text-xs text-gray-500 mt-2">Weekly if RiskScore ≥ this (peak season)</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Shoulder Season (Lower Chemical Demand)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <Label>Chemical Multiplier</Label>
                  <Input
                    type="number"
                    step="0.01"
                    defaultValue={settings.seasonality?.shoulderSeasonChemicalMultiplier || 0.95}
                    onChange={(e) => setFormData(prev => ({
                      ...prev,
                      seasonality: {...(prev.seasonality || {}), shoulderSeasonChemicalMultiplier: parseFloat(e.target.value)}
                    }))}
                    className="mt-2"
                  />
                </div>
                <div>
                  <Label>Weekly Frequency Threshold (Risk Score)</Label>
                  <Input
                    type="number"
                    defaultValue={settings.seasonality?.shoulderSeasonWeeklyThreshold || 65}
                    onChange={(e) => setFormData(prev => ({
                      ...prev,
                      seasonality: {...(prev.seasonality || {}), shoulderSeasonWeeklyThreshold: parseInt(e.target.value)}
                    }))}
                    className="mt-2"
                  />
                  <p className="text-xs text-gray-500 mt-2">Weekly if RiskScore ≥ this (shoulder season)</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Rainy Season (Additional Dilution/Refill)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <Label>Start Month (1-12)</Label>
                  <Input
                    type="number"
                    min="1"
                    max="12"
                    defaultValue={settings.seasonality?.rainySeasonStartMonth || 6}
                    onChange={(e) => setFormData(prev => ({
                      ...prev,
                      seasonality: {...(prev.seasonality || {}), rainySeasonStartMonth: parseInt(e.target.value)}
                    }))}
                    className="mt-2"
                  />
                </div>
                <div>
                  <Label>End Month (1-12)</Label>
                  <Input
                    type="number"
                    min="1"
                    max="12"
                    defaultValue={settings.seasonality?.rainySeasonEndMonth || 9}
                    onChange={(e) => setFormData(prev => ({
                      ...prev,
                      seasonality: {...(prev.seasonality || {}), rainySeasonEndMonth: parseInt(e.target.value)}
                    }))}
                    className="mt-2"
                  />
                </div>
                <div>
                  <Label>Additional COGS Adder</Label>
                  <Input
                    type="number"
                    step="0.01"
                    defaultValue={settings.seasonality?.rainySeasonChemicalAdder || 0.05}
                    onChange={(e) => setFormData(prev => ({
                      ...prev,
                      seasonality: {...(prev.seasonality || {}), rainySeasonChemicalAdder: parseFloat(e.target.value)}
                    }))}
                    className="mt-2"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <Label>Risk Score Boost</Label>
                  <Input
                    type="number"
                    defaultValue={settings.seasonality?.rainySeasonRiskBoost || 5}
                    onChange={(e) => setFormData(prev => ({
                      ...prev,
                      seasonality: {...(prev.seasonality || {}), rainySeasonRiskBoost: parseInt(e.target.value)}
                    }))}
                    className="mt-2"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Pollen Season (if Frequent Pollen Selected)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <Label>Start Month (1-12)</Label>
                  <Input
                    type="number"
                    min="1"
                    max="12"
                    defaultValue={settings.seasonality?.pollenSeasonStartMonth || 2}
                    onChange={(e) => setFormData(prev => ({
                      ...prev,
                      seasonality: {...(prev.seasonality || {}), pollenSeasonStartMonth: parseInt(e.target.value)}
                    }))}
                    className="mt-2"
                  />
                </div>
                <div>
                  <Label>End Month (1-12)</Label>
                  <Input
                    type="number"
                    min="1"
                    max="12"
                    defaultValue={settings.seasonality?.pollenSeasonEndMonth || 5}
                    onChange={(e) => setFormData(prev => ({
                      ...prev,
                      seasonality: {...(prev.seasonality || {}), pollenSeasonEndMonth: parseInt(e.target.value)}
                    }))}
                    className="mt-2"
                  />
                </div>
                <div>
                  <Label>Additional COGS Adder</Label>
                  <Input
                    type="number"
                    step="0.01"
                    defaultValue={settings.seasonality?.pollenSeasonChemicalAdder || 0.04}
                    onChange={(e) => setFormData(prev => ({
                      ...prev,
                      seasonality: {...(prev.seasonality || {}), pollenSeasonChemicalAdder: parseFloat(e.target.value)}
                    }))}
                    className="mt-2"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <Label>Risk Score Boost</Label>
                  <Input
                    type="number"
                    defaultValue={settings.seasonality?.pollenSeasonRiskBoost || 3}
                    onChange={(e) => setFormData(prev => ({
                      ...prev,
                      seasonality: {...(prev.seasonality || {}), pollenSeasonRiskBoost: parseInt(e.target.value)}
                    }))}
                    className="mt-2"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Button onClick={() => handleSave(settings)}>
            Save Seasonality Settings
          </Button>
        </TabsContent>

        {/* RISK TAB */}
        <TabsContent value="risk" className="space-y-4 mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Risk Scoring Weights</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <p className="text-sm text-gray-600">Weights determine how much each factor contributes to the risk score. Higher = more risky.</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <Label>Unscreened Pool</Label>
                  <Input
                    type="number"
                    defaultValue={settings.riskWeights?.enclosure_unscreened || 15}
                    className="mt-2"
                  />
                </div>
                <div>
                  <Label>Green Pool Condition</Label>
                  <Input
                    type="number"
                    defaultValue={settings.riskWeights?.condition_green_pool || 25}
                    className="mt-2"
                  />
                </div>
                <div>
                  <Label>Heavy Debris / Trees</Label>
                  <Input
                    type="number"
                    defaultValue={settings.riskWeights?.environment_heavy_debris || 12}
                    className="mt-2"
                  />
                </div>
                <div>
                  <Label>Leaks / Equipment Issues</Label>
                  <Input
                    type="number"
                    defaultValue={settings.riskWeights?.issue_leaks || 15}
                    className="mt-2"
                  />
                </div>
              </div>

              <Button onClick={() => handleSave(settings)}>
                Save Risk Weights
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* CHEMISTRY TAB */}
        <TabsContent value="chemistry" className="space-y-4 mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Chemical Multipliers</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <Label>UV Exposure Multiplier (Unscreened)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    defaultValue={settings.unscreenedPoolMultiplier || 0.06}
                    className="mt-2"
                  />
                  <p className="text-xs text-gray-500 mt-2">Applied year-round for unscreened pools</p>
                </div>
                <div>
                  <Label>Summer Algae Risk Baseline Boost</Label>
                  <Input
                    type="number"
                    defaultValue={settings.summerAlgaeBaselineBoost || 6}
                    className="mt-2"
                  />
                </div>
              </div>
              <Button onClick={() => handleSave(settings)}>
                Save Chemistry Settings
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* MARGIN TAB */}
        <TabsContent value="margin" className="space-y-4 mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Profit Margin Protection</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <p className="text-sm text-blue-900 font-semibold">
                    These settings ensure quotes meet profitability targets while framing adjustments as "high-maintenance conditions" to clients.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <Label>Target Gross Margin (%)</Label>
                    <Input
                      type="number"
                      step="0.1"
                      defaultValue={(settings.profitMargin?.target_margin_percent || 0.55) * 100}
                      onChange={(e) => setFormData(prev => ({
                        ...prev,
                        profitMargin: {...(prev.profitMargin || {}), target_margin_percent: parseFloat(e.target.value) / 100}
                      }))}
                      className="mt-2"
                    />
                    <p className="text-xs text-gray-500 mt-2">Recommended: 55%</p>
                  </div>
                  <div>
                    <Label>Minimum Gross Margin (%)</Label>
                    <Input
                      type="number"
                      step="0.1"
                      defaultValue={(settings.profitMargin?.minimum_margin_percent || 0.45) * 100}
                      onChange={(e) => setFormData(prev => ({
                        ...prev,
                        profitMargin: {...(prev.profitMargin || {}), minimum_margin_percent: parseFloat(e.target.value) / 100}
                      }))}
                      className="mt-2"
                    />
                    <p className="text-xs text-gray-500 mt-2">Hard floor: auto-adjust price to meet this</p>
                  </div>
                  <div>
                    <Label>Labor Cost Per Hour ($)</Label>
                    <Input
                      type="number"
                      defaultValue={settings.profitMargin?.labor_cost_per_hour || 50}
                      onChange={(e) => setFormData(prev => ({
                        ...prev,
                        profitMargin: {...(prev.profitMargin || {}), labor_cost_per_hour: parseFloat(e.target.value)}
                      }))}
                      className="mt-2"
                    />
                  </div>
                </div>
              </div>

              <div className="border-t pt-6">
                <h4 className="font-semibold text-gray-900 mb-4">Labor Minutes Per Visit by Pool Size</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {['under_10k', '10_15k', '15_20k', '20_30k', '30k_plus'].map(size => (
                    <div key={size}>
                      <Label>{size.replace(/_/g, '-')} gallons</Label>
                      <Input
                        type="number"
                        defaultValue={settings.profitMargin?.labor_minutes_per_visit?.[size] || 35}
                        className="mt-2"
                      />
                    </div>
                  ))}
                </div>
              </div>

              <Button onClick={() => handleSave(settings)}>
                Save Margin Settings
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* SUMMER ALGAE TAB */}
        <TabsContent value="summer" className="space-y-4 mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Summer Algae Bloom Prevention</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                <p className="text-sm text-yellow-900 font-semibold">
                  Increase preventive logic during high-risk algae months (May–September) without raising base prices.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <Label>Enabled</Label>
                  <div className="mt-2 flex items-center gap-2">
                    <input
                      type="checkbox"
                      defaultChecked={settings.summerAlgaeRisk?.enabled !== false}
                      onChange={(e) => setFormData(prev => ({
                        ...prev,
                        summerAlgaeRisk: {...(prev.summerAlgaeRisk || {}), enabled: e.target.checked}
                      }))}
                      className="w-4 h-4"
                    />
                    <Label className="font-normal">Enable summer algae logic</Label>
                  </div>
                </div>
                <div>
                  <Label>Start Month (1-12)</Label>
                  <Input
                    type="number"
                    min="1"
                    max="12"
                    defaultValue={settings.summerAlgaeRisk?.startMonth || 5}
                    onChange={(e) => setFormData(prev => ({
                      ...prev,
                      summerAlgaeRisk: {...(prev.summerAlgaeRisk || {}), startMonth: parseInt(e.target.value)}
                    }))}
                    className="mt-2"
                  />
                </div>
                <div>
                  <Label>End Month (1-12)</Label>
                  <Input
                    type="number"
                    min="1"
                    max="12"
                    defaultValue={settings.summerAlgaeRisk?.endMonth || 9}
                    onChange={(e) => setFormData(prev => ({
                      ...prev,
                      summerAlgaeRisk: {...(prev.summerAlgaeRisk || {}), endMonth: parseInt(e.target.value)}
                    }))}
                    className="mt-2"
                  />
                </div>
              </div>

              <div className="border-t pt-6">
                <h4 className="font-semibold text-gray-900 mb-4">Risk & Demand Adjustments</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <Label>Baseline Risk Boost</Label>
                    <Input
                      type="number"
                      defaultValue={settings.summerAlgaeRisk?.baselineRiskBoost || 6}
                      onChange={(e) => setFormData(prev => ({
                        ...prev,
                        summerAlgaeRisk: {...(prev.summerAlgaeRisk || {}), baselineRiskBoost: parseInt(e.target.value)}
                      }))}
                      className="mt-2"
                    />
                  </div>
                  <div>
                    <Label>Chemical Demand Multiplier</Label>
                    <Input
                      type="number"
                      step="0.01"
                      defaultValue={settings.summerAlgaeRisk?.chemicalDemandMultiplier || 1.05}
                      onChange={(e) => setFormData(prev => ({
                        ...prev,
                        summerAlgaeRisk: {...(prev.summerAlgaeRisk || {}), chemicalDemandMultiplier: parseFloat(e.target.value)}
                      }))}
                      className="mt-2"
                    />
                  </div>
                  <div>
                    <Label>Weekly Recommendation Threshold</Label>
                    <Input
                      type="number"
                      defaultValue={settings.summerAlgaeRisk?.weeklyRecommendationThreshold || 52}
                      onChange={(e) => setFormData(prev => ({
                        ...prev,
                        summerAlgaeRisk: {...(prev.summerAlgaeRisk || {}), weeklyRecommendationThreshold: parseInt(e.target.value)}
                      }))}
                      className="mt-2"
                    />
                    <p className="text-xs text-gray-500 mt-2">Weekly if RiskScore ≥ this (tighter than normal 55-65)</p>
                  </div>
                </div>
              </div>

              <div className="border-t pt-6">
                <h4 className="font-semibold text-gray-900 mb-4">Conditional Risk Boosts (if true during summer)</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>Unscreened Pool</Label>
                    <Input
                      type="number"
                      defaultValue={settings.summerAlgaeRisk?.unscreenedRiskBoost || 6}
                      className="mt-2"
                    />
                  </div>
                  <div>
                    <Label>Heavy Debris</Label>
                    <Input
                      type="number"
                      defaultValue={settings.summerAlgaeRisk?.heavyDebrisRiskBoost || 5}
                      className="mt-2"
                    />
                  </div>
                  <div>
                    <Label>Pets Swim Frequently</Label>
                    <Input
                      type="number"
                      defaultValue={settings.summerAlgaeRisk?.petsFrequentRiskBoost || 4}
                      className="mt-2"
                    />
                  </div>
                  <div>
                    <Label>Heavy Usage (several/week or daily)</Label>
                    <Input
                      type="number"
                      defaultValue={settings.summerAlgaeRisk?.heavyUsageRiskBoost || 4}
                      className="mt-2"
                    />
                  </div>
                  <div>
                    <Label>History of Algae Issues</Label>
                    <Input
                      type="number"
                      defaultValue={settings.summerAlgaeRisk?.algaeHistoryRiskBoost || 8}
                      className="mt-2"
                    />
                  </div>
                </div>
              </div>

              <Button onClick={() => handleSave(settings)}>
                Save Summer Algae Settings
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* STORM TAB */}
        <TabsContent value="storm" className="space-y-4 mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Storm Recovery Mode</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <Label className="text-blue-900 font-semibold">Activate Storm Mode</Label>
                  <p className="text-sm text-blue-800 mt-2">
                    When active, suspends service guarantees and allows schedule flexibility during severe weather.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <Label>Cleanup Light (+$)</Label>
                    <Input
                      type="number"
                      defaultValue={settings.stormCleanupLightPrice || 25}
                      className="mt-2"
                    />
                  </div>
                  <div>
                    <Label>Cleanup Moderate (+$)</Label>
                    <Input
                      type="number"
                      defaultValue={settings.stormCleanupModeratePrice || 45}
                      className="mt-2"
                    />
                  </div>
                  <div>
                    <Label>Cleanup Heavy (+$)</Label>
                    <Input
                      type="number"
                      defaultValue={settings.stormCleanupHeavyPrice || 75}
                      className="mt-2"
                    />
                  </div>
                  <div>
                    <Label>Damage Inspection (+$)</Label>
                    <Input
                      type="number"
                      defaultValue={settings.stormDamageInspectionPrice || 35}
                      className="mt-2"
                    />
                  </div>
                </div>
              </div>
              <Button onClick={() => handleSave(settings)}>
                Save Storm Settings
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}