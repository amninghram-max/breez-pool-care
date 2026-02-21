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
        <TabsList className="grid grid-cols-5 w-full bg-gray-100 p-1 rounded-lg">
          <TabsTrigger value="pricing">Pricing</TabsTrigger>
          <TabsTrigger value="seasonality">Seasonality</TabsTrigger>
          <TabsTrigger value="risk">Risk</TabsTrigger>
          <TabsTrigger value="chemistry">Chemistry</TabsTrigger>
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
              <CardTitle>Peak Season</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <Label>Start Month (MM)</Label>
                  <Input
                    type="number"
                    min="1"
                    max="12"
                    defaultValue={settings.peakSeasonStart || '03'}
                    className="mt-2"
                  />
                </div>
                <div>
                  <Label>End Month (MM)</Label>
                  <Input
                    type="number"
                    min="1"
                    max="12"
                    defaultValue={settings.peakSeasonEnd || '10'}
                    className="mt-2"
                  />
                </div>
                <div>
                  <Label>Chemical Multiplier</Label>
                  <Input
                    type="number"
                    step="0.01"
                    defaultValue={settings.peakSeasonMultiplier || 1.18}
                    className="mt-2"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Winter Season</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <Label>Chemical Multiplier</Label>
                <Input
                  type="number"
                  step="0.01"
                  defaultValue={settings.winterSeasonMultiplier || 0.95}
                  className="mt-2"
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Rainy Season</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <Label>Start Month (MM)</Label>
                  <Input
                    type="number"
                    min="1"
                    max="12"
                    defaultValue={settings.rainySeasonStart || '06'}
                    className="mt-2"
                  />
                </div>
                <div>
                  <Label>End Month (MM)</Label>
                  <Input
                    type="number"
                    min="1"
                    max="12"
                    defaultValue={settings.rainySeasonEnd || '09'}
                    className="mt-2"
                  />
                </div>
                <div>
                  <Label>Additional Multiplier</Label>
                  <Input
                    type="number"
                    step="0.01"
                    defaultValue={settings.rainySeasonMultiplier || 0.05}
                    className="mt-2"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Pollen Season</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <Label>Start Month (MM)</Label>
                  <Input
                    type="number"
                    min="1"
                    max="12"
                    defaultValue={settings.pollenSeasonStart || '02'}
                    className="mt-2"
                  />
                </div>
                <div>
                  <Label>End Month (MM)</Label>
                  <Input
                    type="number"
                    min="1"
                    max="12"
                    defaultValue={settings.pollenSeasonEnd || '05'}
                    className="mt-2"
                  />
                </div>
                <div>
                  <Label>Multiplier (if pollen selected)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    defaultValue={settings.pollenSeasonMultiplier || 0.04}
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
              <CardTitle>Risk Scoring</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <Label>Baseline Risk Score</Label>
                  <Input
                    type="number"
                    defaultValue={settings.baselineRiskScore || 40}
                    className="mt-2"
                  />
                </div>
                <div>
                  <Label>Rainy Season Risk Boost</Label>
                  <Input
                    type="number"
                    defaultValue={settings.rainySeasonRiskBoost || 6}
                    className="mt-2"
                  />
                </div>
                <div>
                  <Label>Pollen Season Risk Boost</Label>
                  <Input
                    type="number"
                    defaultValue={settings.pollenSeasonRiskBoost || 3}
                    className="mt-2"
                  />
                </div>
                <div>
                  <Label>Unscreened Pool Risk Boost</Label>
                  <Input
                    type="number"
                    defaultValue={settings.unscreenedPoolRiskBoost || 5}
                    className="mt-2"
                  />
                </div>
              </div>

              <div className="border-t pt-6">
                <h4 className="font-semibold text-gray-900 mb-4">Frequency Thresholds</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <Label>Peak Season Weekly Threshold</Label>
                    <Input
                      type="number"
                      defaultValue={settings.peakSeasonWeeklyThreshold || 55}
                      className="mt-2"
                    />
                    <p className="text-xs text-gray-500 mt-2">Weekly if RiskScore or ChemDemand ≥ this</p>
                  </div>
                  <div>
                    <Label>Winter Season Weekly Threshold</Label>
                    <Input
                      type="number"
                      defaultValue={settings.winterSeasonWeeklyThreshold || 65}
                      className="mt-2"
                    />
                  </div>
                </div>
              </div>

              <Button onClick={() => handleSave(settings)}>
                Save Risk Settings
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