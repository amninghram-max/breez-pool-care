import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogTitle } = '@/components/ui/alert-dialog';
import { Save, DollarSign, TrendingUp, Zap, RotateCcw, AlertCircle, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';

// Helper: detect unsaved changes
const hasUnsavedChanges = (local, persisted) => {
  if (!local || !persisted) return false;
  return JSON.stringify(local) !== JSON.stringify(persisted);
};

// Helper: format currency
const formatCurrency = (val) => {
  const num = parseFloat(val);
  return isNaN(num) ? '$0.00' : `$${num.toFixed(2)}`;
};

// Helper: format percentage
const formatPercent = (val) => {
  const num = parseFloat(val);
  return isNaN(num) ? '0%' : `${(num * 100).toFixed(1)}%`;
};

// Helper: format timestamp
const formatTimestamp = (dateString) => {
  if (!dateString) return 'Never';
  const date = new Date(dateString);
  return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

export default function AdminPricingConfig() {
  const queryClient = useQueryClient();
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showNavigateConfirm, setShowNavigateConfirm] = useState(false);

  const { data: user } = useQuery({
    queryKey: ['user'],
    queryFn: () => base44.auth.me()
  });

  const settingsQuery = useQuery({
    queryKey: ['adminSettings'],
    queryFn: async () => {
      const result = await base44.entities.AdminSettings.filter({ settingKey: 'default' });
      return result[0] || null;
    }
  });
  const settings = settingsQuery.data;

  const [localSettings, setLocalSettings] = useState(null);
  const unsaved = hasUnsavedChanges(localSettings, settings);

  useEffect(() => {
    if (settings && !localSettings) {
      setLocalSettings(settings);
    }
  }, [settings]);

  const saveSettingsMutation = useMutation({
    mutationFn: async () => {
      // Build payload and stringify JSON fields
      const fieldsToStringify = ['baseTierPrices', 'additiveTokens', 'riskEngine', 'initialFees', 'frequencyLogic', 'chemistryTargets', 'seasonalPeriods'];
      const payload = { ...localSettings };

      try {
        fieldsToStringify.forEach(field => {
          if (field in payload) {
            const value = payload[field];
            // If already a string, leave unchanged
            if (typeof value === 'string') {
              // Already stringified
            } else if (value === null || value === undefined) {
              // Pass through as-is
            } else if (typeof value === 'object') {
              // Stringify objects/arrays
              payload[field] = JSON.stringify(value);
            }
          }
        });
      } catch (err) {
        throw new Error(`Failed to serialize pricing data: ${err.message}`);
      }

      if (settings?.id) {
        await base44.entities.AdminSettings.update(settings.id, payload);
      } else {
        await base44.entities.AdminSettings.create(payload);
      }
    },
    onSuccess: async () => {
      // Refetch fresh settings from DB and sync localSettings
      const { data: freshSettings } = await settingsQuery.refetch();
      if (freshSettings) {
        setLocalSettings(freshSettings);
      }
      toast.success('Pricing configuration saved and persisted');
    },
    onError: (error) => {
      toast.error('Failed to save: ' + error.message);
      // Do NOT reset localSettings on error
    }
  });

  const handleSave = () => {
    saveSettingsMutation.mutate();
  };

  const handleReset = () => {
    setLocalSettings(settings);
    setShowResetConfirm(false);
    toast.success('Changes reverted to last saved state');
  };

  const updateField = (path, value) => {
    setLocalSettings(prev => {
      const updated = { ...prev };
      const keys = path.split('.');
      let current = updated;
      
      for (let i = 0; i < keys.length - 1; i++) {
        if (!current[keys[i]]) current[keys[i]] = {};
        current = current[keys[i]];
      }
      
      current[keys[keys.length - 1]] = parseFloat(value) || 0;
      return updated;
    });
  };

  if (user?.role !== 'admin') {
    return (
      <Card className="border-red-200 bg-red-50">
        <CardContent className="pt-6">
          <p className="text-red-800">Access denied. Admin role required.</p>
        </CardContent>
      </Card>
    );
  }

  if (!localSettings) {
    return <div className="flex items-center justify-center py-12"><p>Loading...</p></div>;
  }

  // Compute summary values
  const baseTierA = localSettings.baseTierPrices?.tier_a_10_15k || 140;
  const baseTierD = localSettings.baseTierPrices?.tier_d_30k_plus || 230;
  const avgBasePrice = ((baseTierA + baseTierD) / 2).toFixed(2);
  const riskEnabled = localSettings.riskEngine?.points ? 'Enabled' : 'Disabled';

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Sticky Header with Action Bar */}
      <div className="sticky top-0 z-40 bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Pricing Settings</h1>
          </div>
          <div className="flex items-center gap-3">
            {unsaved && (
              <Badge variant="outline" className="bg-amber-50 border-amber-200 text-amber-800">
                <AlertCircle className="w-3 h-3 mr-1" />
                Unsaved changes
              </Badge>
            )}
            <span className="text-sm text-gray-600">
              Last saved: {formatTimestamp(settings?.updated_date || settings?.created_date)}
            </span>
            <Button
              variant="outline"
              onClick={() => setShowResetConfirm(true)}
              disabled={!unsaved || saveSettingsMutation.isPending}
              size="sm"
            >
              <RotateCcw className="w-4 h-4 mr-1" />
              Reset
            </Button>
            <Button
              onClick={handleSave}
              disabled={!unsaved || saveSettingsMutation.isPending}
              className="bg-teal-600 hover:bg-teal-700"
            >
              <Save className="w-4 h-4 mr-2" />
              {saveSettingsMutation.isPending ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-6 py-8 space-y-8">

      <Tabs defaultValue="tiers" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="tiers">Base Tiers</TabsTrigger>
          <TabsTrigger value="tokens">Additive Tokens</TabsTrigger>
          <TabsTrigger value="risk">Risk Engine</TabsTrigger>
          <TabsTrigger value="fees">Initial Fees</TabsTrigger>
        </TabsList>

        {/* Base Tier Prices */}
        <TabsContent value="tiers" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <DollarSign className="w-5 h-5" />
                Base Monthly Pricing Tiers
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Tier A (10k-15k gallons)</Label>
                  <Input
                    type="number"
                    value={localSettings.baseTierPrices?.tier_a_10_15k || 140}
                    onChange={(e) => updateField('baseTierPrices.tier_a_10_15k', e.target.value)}
                    className="mt-2"
                  />
                </div>
                <div>
                  <Label>Tier B (15k-20k gallons)</Label>
                  <Input
                    type="number"
                    value={localSettings.baseTierPrices?.tier_b_15_20k || 160}
                    onChange={(e) => updateField('baseTierPrices.tier_b_15_20k', e.target.value)}
                    className="mt-2"
                  />
                </div>
                <div>
                  <Label>Tier C (20k-30k gallons)</Label>
                  <Input
                    type="number"
                    value={localSettings.baseTierPrices?.tier_c_20_30k || 190}
                    onChange={(e) => updateField('baseTierPrices.tier_c_20_30k', e.target.value)}
                    className="mt-2"
                  />
                </div>
                <div>
                  <Label>Tier D (30k+ gallons)</Label>
                  <Input
                    type="number"
                    value={localSettings.baseTierPrices?.tier_d_30k_plus || 230}
                    onChange={(e) => updateField('baseTierPrices.tier_d_30k_plus', e.target.value)}
                    className="mt-2"
                  />
                </div>
              </div>
              <div className="border-t pt-4">
                <Label>Absolute Monthly Floor</Label>
                <Input
                  type="number"
                  value={localSettings.baseTierPrices?.absolute_floor || 120}
                  onChange={(e) => updateField('baseTierPrices.absolute_floor', e.target.value)}
                  className="mt-2"
                />
                <p className="text-xs text-gray-500 mt-1">Minimum monthly price regardless of calculations</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Additive Tokens */}
        <TabsContent value="tokens" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Zap className="w-5 h-5" />
                Environmental Tokens
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-gray-600 mb-4">Unscreened pool add-ons (by tier)</p>
              <div className="grid grid-cols-4 gap-4">
                <div>
                  <Label>Tier A</Label>
                  <Input
                    type="number"
                    value={localSettings.additiveTokens?.unscreened_tier_a || 20}
                    onChange={(e) => updateField('additiveTokens.unscreened_tier_a', e.target.value)}
                    className="mt-2"
                  />
                </div>
                <div>
                  <Label>Tier B</Label>
                  <Input
                    type="number"
                    value={localSettings.additiveTokens?.unscreened_tier_b || 25}
                    onChange={(e) => updateField('additiveTokens.unscreened_tier_b', e.target.value)}
                    className="mt-2"
                  />
                </div>
                <div>
                  <Label>Tier C</Label>
                  <Input
                    type="number"
                    value={localSettings.additiveTokens?.unscreened_tier_c || 30}
                    onChange={(e) => updateField('additiveTokens.unscreened_tier_c', e.target.value)}
                    className="mt-2"
                  />
                </div>
                <div>
                  <Label>Tier D</Label>
                  <Input
                    type="number"
                    value={localSettings.additiveTokens?.unscreened_tier_d || 40}
                    onChange={(e) => updateField('additiveTokens.unscreened_tier_d', e.target.value)}
                    className="mt-2"
                  />
                </div>
              </div>

              <div className="border-t pt-4">
                <Label>Trees Overhead (unscreened only)</Label>
                <Input
                  type="number"
                  value={localSettings.additiveTokens?.trees_overhead || 10}
                  onChange={(e) => updateField('additiveTokens.trees_overhead', e.target.value)}
                  className="mt-2"
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Usage Tokens</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label>Weekends</Label>
                  <Input
                    type="number"
                    value={localSettings.additiveTokens?.usage_weekends || 10}
                    onChange={(e) => updateField('additiveTokens.usage_weekends', e.target.value)}
                    className="mt-2"
                  />
                </div>
                <div>
                  <Label>Several/Week</Label>
                  <Input
                    type="number"
                    value={localSettings.additiveTokens?.usage_several_week || 10}
                    onChange={(e) => updateField('additiveTokens.usage_several_week', e.target.value)}
                    className="mt-2"
                  />
                </div>
                <div>
                  <Label>Daily</Label>
                  <Input
                    type="number"
                    value={localSettings.additiveTokens?.usage_daily || 20}
                    onChange={(e) => updateField('additiveTokens.usage_daily', e.target.value)}
                    className="mt-2"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Chlorination Tokens</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-gray-600 mb-4">Floater/Skimmer add-ons (by tier)</p>
              <div className="grid grid-cols-4 gap-4">
                <div>
                  <Label>Tier A</Label>
                  <Input
                    type="number"
                    value={localSettings.additiveTokens?.chlorinator_floater_tier_a || 5}
                    onChange={(e) => updateField('additiveTokens.chlorinator_floater_tier_a', e.target.value)}
                    className="mt-2"
                  />
                </div>
                <div>
                  <Label>Tier B</Label>
                  <Input
                    type="number"
                    value={localSettings.additiveTokens?.chlorinator_floater_tier_b || 10}
                    onChange={(e) => updateField('additiveTokens.chlorinator_floater_tier_b', e.target.value)}
                    className="mt-2"
                  />
                </div>
                <div>
                  <Label>Tier C</Label>
                  <Input
                    type="number"
                    value={localSettings.additiveTokens?.chlorinator_floater_tier_c || 15}
                    onChange={(e) => updateField('additiveTokens.chlorinator_floater_tier_c', e.target.value)}
                    className="mt-2"
                  />
                </div>
                <div>
                  <Label>Tier D</Label>
                  <Input
                    type="number"
                    value={localSettings.additiveTokens?.chlorinator_floater_tier_d || 20}
                    onChange={(e) => updateField('additiveTokens.chlorinator_floater_tier_d', e.target.value)}
                    className="mt-2"
                  />
                </div>
              </div>

              <div className="border-t pt-4">
                <Label>Liquid Chlorine Only</Label>
                <Input
                  type="number"
                  value={localSettings.additiveTokens?.chlorinator_liquid_only || 10}
                  onChange={(e) => updateField('additiveTokens.chlorinator_liquid_only', e.target.value)}
                  className="mt-2"
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Pet Tokens</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Occasionally</Label>
                  <Input
                    type="number"
                    value={localSettings.additiveTokens?.pets_occasional || 5}
                    onChange={(e) => updateField('additiveTokens.pets_occasional', e.target.value)}
                    className="mt-2"
                  />
                </div>
                <div>
                  <Label>Frequently</Label>
                  <Input
                    type="number"
                    value={localSettings.additiveTokens?.pets_frequent || 10}
                    onChange={(e) => updateField('additiveTokens.pets_frequent', e.target.value)}
                    className="mt-2"
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Risk Engine */}
        <TabsContent value="risk" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5" />
                Risk Points (Raw)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label>Unscreened</Label>
                  <Input
                    type="number"
                    step="0.5"
                    value={localSettings.riskEngine?.points?.unscreened || 2}
                    onChange={(e) => updateField('riskEngine.points.unscreened', e.target.value)}
                    className="mt-2"
                  />
                </div>
                <div>
                  <Label>Trees Overhead</Label>
                  <Input
                    type="number"
                    step="0.5"
                    value={localSettings.riskEngine?.points?.trees_overhead || 1}
                    onChange={(e) => updateField('riskEngine.points.trees_overhead', e.target.value)}
                    className="mt-2"
                  />
                </div>
                <div>
                  <Label>Daily Usage</Label>
                  <Input
                    type="number"
                    step="0.5"
                    value={localSettings.riskEngine?.points?.usage_daily || 2}
                    onChange={(e) => updateField('riskEngine.points.usage_daily', e.target.value)}
                    className="mt-2"
                  />
                </div>
                <div>
                  <Label>Several/Week Usage</Label>
                  <Input
                    type="number"
                    step="0.5"
                    value={localSettings.riskEngine?.points?.usage_several_week || 1}
                    onChange={(e) => updateField('riskEngine.points.usage_several_week', e.target.value)}
                    className="mt-2"
                  />
                </div>
                <div>
                  <Label>Floater/Skimmer</Label>
                  <Input
                    type="number"
                    step="0.5"
                    value={localSettings.riskEngine?.points?.chlorinator_floater_skimmer || 1}
                    onChange={(e) => updateField('riskEngine.points.chlorinator_floater_skimmer', e.target.value)}
                    className="mt-2"
                  />
                </div>
                <div>
                  <Label>Liquid Only</Label>
                  <Input
                    type="number"
                    step="0.5"
                    value={localSettings.riskEngine?.points?.chlorinator_liquid_only || 2}
                    onChange={(e) => updateField('riskEngine.points.chlorinator_liquid_only', e.target.value)}
                    className="mt-2"
                  />
                </div>
                <div>
                  <Label>Pets Frequent</Label>
                  <Input
                    type="number"
                    step="0.5"
                    value={localSettings.riskEngine?.points?.pets_frequent || 1}
                    onChange={(e) => updateField('riskEngine.points.pets_frequent', e.target.value)}
                    className="mt-2"
                  />
                </div>
                <div>
                  <Label>Pets Occasional</Label>
                  <Input
                    type="number"
                    step="0.5"
                    value={localSettings.riskEngine?.points?.pets_occasional || 0.5}
                    onChange={(e) => updateField('riskEngine.points.pets_occasional', e.target.value)}
                    className="mt-2"
                  />
                </div>
                <div>
                  <Label>Green Condition</Label>
                  <Input
                    type="number"
                    step="0.5"
                    value={localSettings.riskEngine?.points?.condition_green || 2}
                    onChange={(e) => updateField('riskEngine.points.condition_green', e.target.value)}
                    className="mt-2"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Size Multipliers</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-4 gap-4">
                <div>
                  <Label>Tier A</Label>
                  <Input
                    type="number"
                    step="0.1"
                    value={localSettings.riskEngine?.size_multipliers?.tier_a || 1.0}
                    onChange={(e) => updateField('riskEngine.size_multipliers.tier_a', e.target.value)}
                    className="mt-2"
                  />
                </div>
                <div>
                  <Label>Tier B</Label>
                  <Input
                    type="number"
                    step="0.1"
                    value={localSettings.riskEngine?.size_multipliers?.tier_b || 1.1}
                    onChange={(e) => updateField('riskEngine.size_multipliers.tier_b', e.target.value)}
                    className="mt-2"
                  />
                </div>
                <div>
                  <Label>Tier C</Label>
                  <Input
                    type="number"
                    step="0.1"
                    value={localSettings.riskEngine?.size_multipliers?.tier_c || 1.2}
                    onChange={(e) => updateField('riskEngine.size_multipliers.tier_c', e.target.value)}
                    className="mt-2"
                  />
                </div>
                <div>
                  <Label>Tier D</Label>
                  <Input
                    type="number"
                    step="0.1"
                    value={localSettings.riskEngine?.size_multipliers?.tier_d || 1.3}
                    onChange={(e) => updateField('riskEngine.size_multipliers.tier_d', e.target.value)}
                    className="mt-2"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Risk Escalation Brackets</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-600 mb-4">Monthly add-ons based on adjusted risk (hidden from customers)</p>
              <div className="space-y-3">
                {(localSettings.riskEngine?.escalation_brackets || []).map((bracket, index) => (
                  <div key={index} className="grid grid-cols-3 gap-4 items-center p-3 bg-gray-50 rounded-lg">
                    <div className="text-sm">
                      Risk {bracket.min_risk} - {bracket.max_risk}
                    </div>
                    <div>
                      <Input
                        type="number"
                        value={bracket.addon_amount}
                        onChange={(e) => {
                          const updated = [...localSettings.riskEngine.escalation_brackets];
                          updated[index].addon_amount = parseFloat(e.target.value) || 0;
                          setLocalSettings({ ...localSettings, riskEngine: { ...localSettings.riskEngine, escalation_brackets: updated } });
                        }}
                      />
                    </div>
                    <div className="text-sm text-gray-600">+${bracket.addon_amount}/month</div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Frequency Override</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Twice/Week Multiplier</Label>
                  <Input
                    type="number"
                    step="0.1"
                    value={localSettings.frequencyLogic?.twice_weekly_multiplier || 1.8}
                    onChange={(e) => updateField('frequencyLogic.twice_weekly_multiplier', e.target.value)}
                    className="mt-2"
                  />
                  <p className="text-xs text-gray-500 mt-1">Applied to final monthly total</p>
                </div>
                <div>
                  <Label>Auto-Require Threshold</Label>
                  <Input
                    type="number"
                    step="0.5"
                    value={localSettings.frequencyLogic?.auto_require_threshold || 9}
                    onChange={(e) => updateField('frequencyLogic.auto_require_threshold', e.target.value)}
                    className="mt-2"
                  />
                  <p className="text-xs text-gray-500 mt-1">Adjusted risk ≥ this → twice/week</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>AutoPay Discount</CardTitle>
            </CardHeader>
            <CardContent>
              <Label>Monthly Discount Amount</Label>
              <Input
                type="number"
                value={localSettings.autopayDiscount || 10}
                onChange={(e) => updateField('autopayDiscount', e.target.value)}
                className="mt-2"
              />
              <p className="text-xs text-gray-500 mt-1">Applied after all other calculations</p>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Initial Fees */}
        <TabsContent value="fees" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Water Condition Fees</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Slightly Cloudy</Label>
                <Input
                  type="number"
                  value={localSettings.initialFees?.slightly_cloudy || 25}
                  onChange={(e) => updateField('initialFees.slightly_cloudy', e.target.value)}
                  className="mt-2"
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Green-to-Clean Pricing</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <p className="text-sm font-semibold text-gray-700 mb-3">Light Algae</p>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <Label>Small (Tier A)</Label>
                    <Input
                      type="number"
                      value={localSettings.initialFees?.green_light_small || 60}
                      onChange={(e) => updateField('initialFees.green_light_small', e.target.value)}
                      className="mt-2"
                    />
                  </div>
                  <div>
                    <Label>Medium (Tier B/C)</Label>
                    <Input
                      type="number"
                      value={localSettings.initialFees?.green_light_medium || 100}
                      onChange={(e) => updateField('initialFees.green_light_medium', e.target.value)}
                      className="mt-2"
                    />
                  </div>
                  <div>
                    <Label>Large (Tier D)</Label>
                    <Input
                      type="number"
                      value={localSettings.initialFees?.green_light_large || 150}
                      onChange={(e) => updateField('initialFees.green_light_large', e.target.value)}
                      className="mt-2"
                    />
                  </div>
                </div>
              </div>

              <div>
                <p className="text-sm font-semibold text-gray-700 mb-3">Moderate Algae</p>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <Label>Small</Label>
                    <Input
                      type="number"
                      value={localSettings.initialFees?.green_moderate_small || 100}
                      onChange={(e) => updateField('initialFees.green_moderate_small', e.target.value)}
                      className="mt-2"
                    />
                  </div>
                  <div>
                    <Label>Medium</Label>
                    <Input
                      type="number"
                      value={localSettings.initialFees?.green_moderate_medium || 150}
                      onChange={(e) => updateField('initialFees.green_moderate_medium', e.target.value)}
                      className="mt-2"
                    />
                  </div>
                  <div>
                    <Label>Large</Label>
                    <Input
                      type="number"
                      value={localSettings.initialFees?.green_moderate_large || 200}
                      onChange={(e) => updateField('initialFees.green_moderate_large', e.target.value)}
                      className="mt-2"
                    />
                  </div>
                </div>
              </div>

              <div>
                <p className="text-sm font-semibold text-gray-700 mb-3">Black Swamp</p>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <Label>Small</Label>
                    <Input
                      type="number"
                      value={localSettings.initialFees?.green_black_small || 250}
                      onChange={(e) => updateField('initialFees.green_black_small', e.target.value)}
                      className="mt-2"
                    />
                  </div>
                  <div>
                    <Label>Medium</Label>
                    <Input
                      type="number"
                      value={localSettings.initialFees?.green_black_medium || 350}
                      onChange={(e) => updateField('initialFees.green_black_medium', e.target.value)}
                      className="mt-2"
                    />
                  </div>
                  <div>
                    <Label>Large</Label>
                    <Input
                      type="number"
                      value={localSettings.initialFees?.green_black_large || 450}
                      onChange={(e) => updateField('initialFees.green_black_large', e.target.value)}
                      className="mt-2"
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}