import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { createPageUrl } from '@/utils';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Save, DollarSign, TrendingUp, Zap, RotateCcw, AlertCircle, CheckCircle2, Info } from 'lucide-react';
import { toast } from 'sonner';

// Helper: detect unsaved changes
const hasUnsavedChanges = (local, persisted) => {
  if (!local || !persisted) return false;
  return JSON.stringify(local) !== JSON.stringify(persisted);
};

// Helper: format currency with commas
const formatCurrency = (val) => {
  const num = parseFloat(val);
  if (isNaN(num)) return '$0.00';
  return `$${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

// Helper: format percentage (clean, no trailing zeros)
const formatPercent = (val) => {
  const num = parseFloat(val);
  if (isNaN(num)) return '0%';
  const pct = num * 100;
  // Remove unnecessary decimals
  return pct === Math.round(pct) ? `${Math.round(pct)}%` : `${pct.toFixed(2)}%`.replace(/\.?0+%$/, '%');
};

// Helper: format timestamp
const formatTimestamp = (dateString) => {
  if (!dateString) return 'Never';
  const date = new Date(dateString);
  return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

// Helper: determine badge variant and label based on pricing configuration state
const getPricingConfigStatus = (baseTierPrices) => {
  // Check if base tiers are missing or zero
  const tierA = baseTierPrices?.tier_a_10_15k || 0;
  const tierB = baseTierPrices?.tier_b_15_20k || 0;
  const tierC = baseTierPrices?.tier_c_20_30k || 0;
  const tierD = baseTierPrices?.tier_d_30k_plus || 0;
  const floor = baseTierPrices?.absolute_floor || 0;
  
  // Not configured: if any tier is zero
  if (tierA === 0 || tierB === 0 || tierC === 0 || tierD === 0) {
    return { variant: 'destructive', label: 'Not Configured', className: 'bg-red-100 text-red-800 border-red-300' };
  }
  
  // Floor too high: if floor > lowest tier
  const lowestTier = Math.min(tierA, tierB, tierC, tierD);
  if (floor > lowestTier) {
    return { variant: 'secondary', label: 'Floor High', className: 'bg-amber-100 text-amber-800 border-amber-300' };
  }
  
  // All configured and healthy
  return { variant: 'default', label: 'Configured', className: 'bg-green-100 text-green-800 border-green-300' };
};

// Helper: determine risk scoring badge
const getRiskScoringStatus = (riskEngine) => {
  const enabled = riskEngine?.points && Object.keys(riskEngine.points).length > 0;
  return enabled
    ? { variant: 'default', label: 'Enabled', className: 'bg-green-100 text-green-800 border-green-300' }
    : { variant: 'secondary', label: 'Disabled', className: 'bg-gray-100 text-gray-700 border-gray-300' };
};

// Helper: determine frequency multiplier badge
const getFrequencyStatus = (multiplier) => {
  return multiplier > 1
    ? { variant: 'default', label: 'Active', className: 'bg-green-100 text-green-800 border-green-300' }
    : { variant: 'secondary', label: 'Standard', className: 'bg-gray-100 text-gray-700 border-gray-300' };
};

// Helper: determine autopay discount badge
const getAutopayStatus = (discount) => {
  return discount > 0
    ? { variant: 'default', label: 'Configured', className: 'bg-blue-100 text-blue-800 border-blue-300' }
    : { variant: 'secondary', label: 'None', className: 'bg-gray-100 text-gray-700 border-gray-300' };
};

// Helper: determine target gross margin badge
const getTargetMarginStatus = (margin) => {
  if (!margin || margin === 0) {
    return { variant: 'destructive', label: 'Not Set', className: 'bg-red-100 text-red-800 border-red-300' };
  }
  const marginPct = margin * 100;
  if (marginPct >= 45 && marginPct <= 70) {
    return { variant: 'default', label: 'Within Range', className: 'bg-green-100 text-green-800 border-green-300' };
  } else {
    return { variant: 'secondary', label: 'Outside Range', className: 'bg-amber-100 text-amber-800 border-amber-300' };
  }
};

export default function AdminPricingConfig() {
  const queryClient = useQueryClient();
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const [userAuthError, setUserAuthError] = useState(null);
  const [creatingDefault, setCreatingDefault] = useState(false);
  const [createError, setCreateError] = useState(null);

  const { data: user, isLoading: userIsLoading, isError: userIsError, error: userError } = useQuery({
    queryKey: ['user'],
    queryFn: () => base44.auth.me()
  });

  const settingsQuery = useQuery({
    queryKey: ['adminSettings', 'latest'],
    queryFn: async () => {
      if (typeof window !== 'undefined') {
        console.info('[AdminPricingConfig] settings query started');
      }
      const res = await base44.entities.AdminSettings.list('-created_date', 1);
      if (typeof window !== 'undefined') {
        console.info('[AdminPricingConfig] AdminSettings list raw:', res);
      }
      // Normalize response shape (may be array, {items:[]}, {data:[]}, etc)
      const items = Array.isArray(res) ? res : (res?.items ?? res?.data ?? []);
      const first = items[0] ?? null;
      if (typeof window !== 'undefined') {
        console.info('[AdminPricingConfig] AdminSettings normalized first:', first);
      }
      return first;
    }
  });

  const settings = settingsQuery.data;

  const [localSettings, setLocalSettings] = useState(null);
  const [isCreatingDefaults, setIsCreatingDefaults] = useState(false);
  const unsaved = hasUnsavedChanges(localSettings, settings);

  // Timeout watchdog: if still loading after 8 seconds, show diagnostic
  useEffect(() => {
    const isLoading = userIsLoading || settingsQuery.isLoading;
    const timer = setTimeout(() => {
      if (isLoading) {
        if (typeof window !== 'undefined') {
          console.info('[AdminPricingConfig] 8-second timeout - page still loading');
        }
        setTimedOut(true);
      }
    }, 8000);
    return () => clearTimeout(timer);
  }, [userIsLoading, settingsQuery.isLoading]);

  // Handle user auth errors
  useEffect(() => {
    if (userIsError) {
      if (typeof window !== 'undefined') {
        console.info('[AdminPricingConfig] auth error:', userError?.message);
      }
      setUserAuthError(userError?.message || 'Auth failed');
    }
  }, [userIsError, userError]);

  // Sync settings to local (dependency: settings only)
  useEffect(() => {
    if (!settingsQuery.isLoading && !localSettings) {
      if (settings) {
        setLocalSettings(settings);
      }
      // If settings is null, keep localSettings null to show empty state
    }
  }, [settingsQuery.isLoading, settings, localSettings]);

  // Handler: Create default AdminSettings record
  const handleCreateDefaults = async () => {
    if (typeof window !== 'undefined') {
      console.info('[AdminPricingConfig] createDefaultConfig clicked');
    }
    setCreatingDefault(true);
    setCreateError(null);
    try {
      const defaults = {
        settingKey: 'default',
        baseTierPrices: JSON.stringify({}),
        additiveTokens: JSON.stringify({}),
        riskEngine: JSON.stringify({ points: {}, size_multipliers: {}, escalation_brackets: [] }),
        initialFees: JSON.stringify({}),
        frequencyLogic: JSON.stringify({}),
        chemistryTargets: JSON.stringify({}),
        seasonalPeriods: JSON.stringify({})
      };
      if (typeof window !== 'undefined') {
        console.info('[AdminPricingConfig] creating AdminSettings with defaults:', defaults);
      }
      const result = await base44.entities.AdminSettings.create(defaults);
      if (typeof window !== 'undefined') {
        console.info('[AdminPricingConfig] create result:', result);
      }
      await settingsQuery.refetch();
      const refetched = settingsQuery.data;
      if (!refetched) {
        setCreateError('Record created but refetch returned null/undefined. Check RLS permissions for reading AdminSettings.');
        return;
      }
      toast.success('Default pricing configuration created');
    } catch (error) {
      const errorMsg = error?.message || 'Unknown error';
      setCreateError(errorMsg);
      if (typeof window !== 'undefined') {
        console.error('[AdminPricingConfig] create defaults error:', error);
      }
      toast.error('Failed to create defaults: ' + errorMsg);
    } finally {
      setCreatingDefault(false);
    }
  };

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

  // Diagnostic panel for timeout or errors
  if (timedOut || settingsQuery.isError || userAuthError) {
    return (
      <Card className="border-red-200 bg-red-50 max-w-2xl mx-auto mt-8">
        <CardHeader>
          <CardTitle className="text-red-900">Loading Diagnostics</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div className="bg-white p-4 rounded border border-red-200">
            <p className="font-semibold text-gray-800 mb-2">Auth Status</p>
            <div className="text-gray-700 space-y-1 ml-4">
              <p>User present: {user ? 'Yes' : 'No'}</p>
              <p>User role: {user?.role || 'N/A'}</p>
              <p>User linkedLeadId: {user?.linkedLeadId || 'N/A'}</p>
              <p>Auth loading: {userIsLoading}</p>
              <p>Auth error: {userAuthError || 'None'}</p>
            </div>
          </div>

          <div className="bg-white p-4 rounded border border-red-200">
            <p className="font-semibold text-gray-800 mb-2">AdminSettings Query</p>
            <div className="text-gray-700 space-y-1 ml-4">
              <p>isLoading: {settingsQuery.isLoading}</p>
              <p>isFetching: {settingsQuery.isFetching}</p>
              <p>isError: {settingsQuery.isError}</p>
              <p>Settings exists: {settings ? 'Yes' : 'No'}</p>
              {settings && <p>Settings ID: {settings.id}</p>}
              {settingsQuery.isError && (
                <p className="text-red-700 mt-2 whitespace-pre-wrap">
                  {settingsQuery.error?.message || 'Unknown error'}
                </p>
              )}
            </div>
          </div>

          <div className="flex gap-3">
            <Button
              onClick={() => {
                setTimedOut(false);
                settingsQuery.refetch();
              }}
              className="bg-blue-600 hover:bg-blue-700"
            >
              Retry
            </Button>
            <Button
              onClick={() => window.location.href = createPageUrl('AdminHome')}
              variant="outline"
            >
              Go Home
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Guard: user not authenticated or not admin
  if (userIsLoading) {
    return null; // Layout handles the timeout watchdog
  }

  if (!user) {
    window.location.href = createPageUrl('PublicHome');
    return null;
  }

  if (user?.role !== 'admin') {
    return (
      <Card className="border-red-200 bg-red-50">
        <CardContent className="pt-6">
          <p className="text-red-800">Access denied. Admin role required.</p>
        </CardContent>
      </Card>
    );
  }

  // Guard: settings still loading
  if (settingsQuery.isLoading) {
    return null; // Layout handles the timeout watchdog
  }

  // Empty-state: AdminSettings does not exist
  if (!localSettings && !settingsQuery.isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-2xl mx-auto">
          <Card className="border-amber-200 bg-amber-50">
            <CardHeader>
              <CardTitle className="text-amber-900 flex items-center gap-2">
                <AlertCircle className="w-5 h-5" />
                No Pricing Configuration Found
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-amber-800">
                The system does not yet have an AdminSettings record. You need to create a default configuration to proceed.
              </p>
              {createError && (
                <div className="p-4 bg-red-100 border border-red-300 rounded-lg">
                  <p className="text-red-800 text-sm font-semibold mb-1">Creation Failed</p>
                  <p className="text-red-700 text-sm whitespace-pre-wrap">{createError}</p>
                </div>
              )}
              <div className="flex gap-3 pt-4">
                <Button
                  onClick={handleCreateDefaults}
                  disabled={creatingDefault}
                  className="bg-amber-600 hover:bg-amber-700"
                >
                  {creatingDefault ? 'Creating...' : 'Create Default Configuration'}
                </Button>
                <Button
                  onClick={() => window.location.href = createPageUrl('AdminHome')}
                  variant="outline"
                >
                  Go to Admin Home
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // Guard: localSettings not yet initialized
  if (!localSettings || settingsQuery.isLoading) {
    return null; // Layout handles the timeout watchdog
  }

  // Summary card data (truth audit: only real persisted fields)
  const baseTierA = localSettings.baseTierPrices?.tier_a_10_15k || 140;
  const baseTierD = localSettings.baseTierPrices?.tier_d_30k_plus || 230;
  const avgBasePrice = (baseTierA + baseTierD) / 2;
  const autopayValue = localSettings.autopayDiscount || 10;
  const riskEnabled = localSettings.riskEngine?.points ? 'Enabled' : 'Disabled';
  const frequencyMultiplier = localSettings.frequencyLogic?.twice_weekly_multiplier || 1.8;
  const minFloor = localSettings.baseTierPrices?.absolute_floor || 120;
  const targetMargin = localSettings.targetGrossMargin || 0;
  
  // Compute badge statuses
  const pricingStatus = getPricingConfigStatus(localSettings.baseTierPrices);
  const autopayStatus = getAutopayStatus(autopayValue);
  const marginStatus = getTargetMarginStatus(targetMargin);
  const riskStatus = getRiskScoringStatus(localSettings.riskEngine);
  const frequencyStatus = getFrequencyStatus(frequencyMultiplier);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Sticky Header with Action Bar */}
      <div className="sticky top-0 z-40 bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            {/* Left: Title & Subtitle */}
            <div className="flex-1">
              <h1 className="text-2xl font-bold text-gray-900">Pricing & Settings</h1>
              <p className="text-sm text-gray-600 mt-1">Manage pricing engine + readiness checks</p>
            </div>
            
            {/* Right: Action Buttons */}
            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              {unsaved && (
                <Badge variant="outline" className="bg-amber-50 border-amber-200 text-amber-800 whitespace-nowrap">
                  <AlertCircle className="w-3 h-3 mr-1" />
                  Unsaved changes
                </Badge>
              )}
              <Button
                variant="ghost"
                onClick={() => window.location.href = createPageUrl('AdminHome')}
                size="sm"
                className="text-gray-600 hover:text-gray-900"
              >
                Go Home
              </Button>
              <Button
                variant="outline"
                onClick={() => setShowResetConfirm(true)}
                disabled={!unsaved || saveSettingsMutation.isPending}
                size="sm"
                className="whitespace-nowrap"
              >
                <RotateCcw className="w-4 h-4 mr-1" />
                Refresh
              </Button>
              <Button
                onClick={handleSave}
                disabled={!unsaved || saveSettingsMutation.isPending}
                className="bg-teal-600 hover:bg-teal-700 whitespace-nowrap"
                size="sm"
              >
                <Save className="w-4 h-4 mr-2" />
                {saveSettingsMutation.isPending ? 'Saving...' : 'Save'}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6" id="autopay-section">

        {/* Summary Cards with Visual State Indicators */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3 sm:gap-4">
          {/* Base Pricing Card */}
          <Card className="bg-white cursor-pointer hover:shadow-md transition-shadow" onClick={() => document.getElementById('base-pricing-section')?.scrollIntoView({ behavior: 'smooth' })}>
            <CardContent className="pt-6">
              <div className="flex items-start justify-between mb-2">
                <p className="text-xs text-gray-600 font-medium">Base Pricing</p>
                <Badge className={`text-xs ${pricingStatus.className}`}>
                  {pricingStatus.label}
                </Badge>
              </div>
              <p className="text-2xl font-bold text-teal-600 mt-2">{formatCurrency(avgBasePrice)}</p>
              <p className="text-xs text-gray-500 mt-1">Tiers A–D average</p>
            </CardContent>
          </Card>

          {/* AutoPay Discount Card */}
          <Card className="bg-white cursor-pointer hover:shadow-md transition-shadow" onClick={() => document.getElementById('frequency-section')?.scrollIntoView({ behavior: 'smooth' })}>
            <CardContent className="pt-6">
              <div className="flex items-start justify-between mb-2">
                <p className="text-xs text-gray-600 font-medium">AutoPay Discount</p>
                <Badge className={`text-xs ${autopayStatus.className}`}>
                  {autopayStatus.label}
                </Badge>
              </div>
              <p className="text-2xl font-bold text-blue-600 mt-2">{formatCurrency(autopayValue)}</p>
              <p className="text-xs text-gray-500 mt-1">Monthly savings</p>
            </CardContent>
          </Card>

          {/* Risk Scoring Card */}
          <Card className="bg-white cursor-pointer hover:shadow-md transition-shadow" onClick={() => document.getElementById('risk-section')?.scrollIntoView({ behavior: 'smooth' })}>
            <CardContent className="pt-6">
              <div className="flex items-start justify-between mb-2">
                <p className="text-xs text-gray-600 font-medium">Risk Scoring</p>
                <Badge className={`text-xs ${riskStatus.className}`}>
                  {riskStatus.label}
                </Badge>
              </div>
              <p className="text-2xl font-bold text-purple-600 mt-2">{riskEnabled}</p>
              <p className="text-xs text-gray-500 mt-1">Config status</p>
            </CardContent>
          </Card>

          {/* Frequency Multiplier Card */}
          <Card className="bg-white cursor-pointer hover:shadow-md transition-shadow" onClick={() => document.getElementById('frequency-section')?.scrollIntoView({ behavior: 'smooth' })}>
            <CardContent className="pt-6">
              <div className="flex items-start justify-between mb-2">
                <p className="text-xs text-gray-600 font-medium">2x/Week Multiplier</p>
                <Badge className={`text-xs ${frequencyStatus.className}`}>
                  {frequencyStatus.label}
                </Badge>
              </div>
              <p className="text-2xl font-bold text-orange-600 mt-2">{frequencyMultiplier.toFixed(2)}×</p>
              <p className="text-xs text-gray-500 mt-1">Frequency boost</p>
            </CardContent>
          </Card>

          {/* Price Floor Card */}
          <Card className="bg-white cursor-pointer hover:shadow-md transition-shadow" onClick={() => document.getElementById('base-pricing-section')?.scrollIntoView({ behavior: 'smooth' })}>
            <CardContent className="pt-6">
              <div className="flex items-start justify-between mb-2">
                <p className="text-xs text-gray-600 font-medium">Price Floor</p>
                <Badge className="text-xs bg-slate-100 text-slate-800 border-slate-300">
                  Set
                </Badge>
              </div>
              <p className="text-2xl font-bold text-green-600 mt-2">{formatCurrency(minFloor)}</p>
              <p className="text-xs text-gray-500 mt-1">Floor minimum</p>
            </CardContent>
          </Card>

          {/* Target Gross Margin Card */}
          <Card className="bg-white cursor-pointer hover:shadow-md transition-shadow">
            <CardContent className="pt-6">
              <div className="flex items-start justify-between mb-2">
                <p className="text-xs text-gray-600 font-medium">Target Margin</p>
                <Badge className={`text-xs ${marginStatus.className}`}>
                  {marginStatus.label}
                </Badge>
              </div>
              <p className="text-2xl font-bold text-indigo-600 mt-2">{formatPercent(targetMargin)}</p>
              <p className="text-xs text-gray-500 mt-1">45–70% range</p>
            </CardContent>
          </Card>
        </div>

        {/* Base Pricing Section */}
        <Card className="bg-white" id="base-pricing-section">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-teal-600" />
              Base Pricing Tiers
            </CardTitle>
            <p className="text-sm text-gray-600 mt-1">
              Starting monthly service price before risk adjustments or additive tokens are applied.
              Pools are automatically assigned to a tier based on estimated gallon size.
            </p>
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
                <p className="text-xs text-gray-500 mt-1">Base monthly price for small pools</p>
              </div>
              <div>
                <Label>Tier B (15k-20k gallons)</Label>
                <Input
                  type="number"
                  value={localSettings.baseTierPrices?.tier_b_15_20k || 160}
                  onChange={(e) => updateField('baseTierPrices.tier_b_15_20k', e.target.value)}
                  className="mt-2"
                />
                <p className="text-xs text-gray-500 mt-1">Base monthly price for medium pools</p>
              </div>
              <div>
                <Label>Tier C (20k-30k gallons)</Label>
                <Input
                  type="number"
                  value={localSettings.baseTierPrices?.tier_c_20_30k || 190}
                  onChange={(e) => updateField('baseTierPrices.tier_c_20_30k', e.target.value)}
                  className="mt-2"
                />
                <p className="text-xs text-gray-500 mt-1">Base monthly price for large pools</p>
              </div>
              <div>
                <Label>Tier D (30k+ gallons)</Label>
                <Input
                  type="number"
                  value={localSettings.baseTierPrices?.tier_d_30k_plus || 230}
                  onChange={(e) => updateField('baseTierPrices.tier_d_30k_plus', e.target.value)}
                  className="mt-2"
                />
                <p className="text-xs text-gray-500 mt-1">Base monthly price for extra-large pools</p>
              </div>
            </div>
            <div className="border-t pt-4">
               <Label className="flex items-center gap-2">
                 Minimum Monthly Floor
                 <Info className="w-4 h-4 text-gray-400" title="The minimum price the system will allow for monthly service. Adjustments cannot push the price below this amount." />
               </Label>
               <Input
                 type="number"
                 value={localSettings.baseTierPrices?.absolute_floor || 120}
                 onChange={(e) => updateField('baseTierPrices.absolute_floor', e.target.value)}
                 className="mt-2"
               />
               <p className="text-xs text-gray-500 mt-1">Minimum price—adjustments cannot go below this</p>
             </div>
          </CardContent>
        </Card>

        {/* Additive Tokens Section - with section ID for navigation */}
        <Card className="bg-white" id="additive-tokens-section">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Zap className="w-5 h-5 text-amber-600" />
              Additive Pricing Tokens
            </CardTitle>
            <p className="text-sm text-gray-600 mt-1">
              Tokens add small price adjustments for environmental or usage factors that increase service complexity.
              Each adjustment compounds on the base price.
            </p>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Environmental */}
             <div>
               <h4 className="font-semibold text-gray-800 mb-2 flex items-center gap-2">
                 Environmental
                 <Info className="w-4 h-4 text-gray-400" title="Price adjustments for environmental conditions such as debris load, heavy foliage, or surrounding landscape factors." />
               </h4>
               <p className="text-sm text-gray-600 mb-4">Unscreened pool add-ons by tier</p>
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
              <div className="border-t pt-4 mt-4">
                <Label>Trees Overhead (unscreened only)</Label>
                <Input
                  type="number"
                  value={localSettings.additiveTokens?.trees_overhead || 10}
                  onChange={(e) => updateField('additiveTokens.trees_overhead', e.target.value)}
                  className="mt-2"
                />
              </div>
            </div>

            {/* Usage */}
             <div className="border-t pt-4">
               <h4 className="font-semibold text-gray-800 mb-2 flex items-center gap-2">
                 Usage Frequency
                 <Info className="w-4 h-4 text-gray-400" title="Adjustments based on pool usage patterns. High swimmer activity or frequent pool parties increase cleaning time and chemical usage." />
               </h4>
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
            </div>

            {/* Chlorination */}
             <div className="border-t pt-4">
               <h4 className="font-semibold text-gray-800 mb-2 flex items-center gap-2">
                 Chlorination
                 <Info className="w-4 h-4 text-gray-400" title="Different sanitizing systems affect chemical consumption and service complexity." />
               </h4>
               <p className="text-sm text-gray-600 mb-4">Floater/Skimmer add-ons by tier</p>
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
              <div className="border-t pt-4 mt-4">
                <Label>Liquid Chlorine Only</Label>
                <Input
                  type="number"
                  value={localSettings.additiveTokens?.chlorinator_liquid_only || 10}
                  onChange={(e) => updateField('additiveTokens.chlorinator_liquid_only', e.target.value)}
                  className="mt-2"
                />
              </div>
            </div>

            {/* Pets */}
             <div className="border-t pt-4">
               <h4 className="font-semibold text-gray-800 mb-2 flex items-center gap-2">
                 Pets / Contamination
                 <Info className="w-4 h-4 text-gray-400" title="Pools frequently used by pets or with increased contamination risk require more frequent cleaning." />
               </h4>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Occasional</Label>
                  <Input
                    type="number"
                    value={localSettings.additiveTokens?.pets_occasional || 5}
                    onChange={(e) => updateField('additiveTokens.pets_occasional', e.target.value)}
                    className="mt-2"
                  />
                </div>
                <div>
                  <Label>Frequent</Label>
                  <Input
                    type="number"
                    value={localSettings.additiveTokens?.pets_frequent || 10}
                    onChange={(e) => updateField('additiveTokens.pets_frequent', e.target.value)}
                    className="mt-2"
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Risk Adjustments Section */}
         <Card className="bg-white" id="risk-section">
           <CardHeader>
             <CardTitle className="flex items-center gap-2">
               <TrendingUp className="w-5 h-5 text-purple-600" />
               Risk Engine
             </CardTitle>
             <p className="text-sm text-gray-600 mt-1">
               The risk engine evaluates service difficulty using a point-based system.
               Higher risk scores increase the final price recommendation.
             </p>
           </CardHeader>
          <CardContent className="space-y-6">
            {/* Risk Points */}
            <div>
              <h4 className="font-semibold text-gray-800 mb-2 flex items-center gap-2">
                Raw Risk Points
                <Info className="w-4 h-4 text-gray-400" title="Individual factors that contribute to the pool's service difficulty score. Examples include debris load, equipment condition, or water stability issues." />
              </h4>
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
            </div>

            {/* Size Multipliers */}
            <div className="border-t pt-4">
              <h4 className="font-semibold text-gray-800 mb-2 flex items-center gap-2">
                Size Multipliers
                <Info className="w-4 h-4 text-gray-400" title="Multipliers applied to raw risk points based on pool size. Larger pools require more chemicals and effort." />
              </h4>
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
            </div>

            {/* Escalation Brackets */}
            <div className="border-t pt-4">
              <h4 className="font-semibold text-gray-800 mb-2 flex items-center gap-2">
                Risk Escalation Brackets
                <Info className="w-4 h-4 text-gray-400" title="Risk score ranges that trigger price adjustments. Pools with higher risk scores require more time and chemicals, increasing the service price." />
              </h4>
              <p className="text-sm text-gray-600 mb-4">Monthly add-ons triggered by adjusted risk score ranges</p>
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
            </div>
          </CardContent>
        </Card>

        {/* Frequency & Costs Section */}
         <Card className="bg-white" id="frequency-section">
           <CardHeader>
             <CardTitle className="flex items-center gap-2">
               <TrendingUp className="w-5 h-5 text-blue-600" />
               Service Frequency & One-Time Fees
             </CardTitle>
             <p className="text-sm text-gray-600 mt-1">Configure visit frequency multipliers and initial service charges</p>
           </CardHeader>
          <CardContent className="space-y-6">
            {/* Frequency */}
            <div>
              <h4 className="font-semibold text-gray-800 mb-3">Service Frequency Multipliers</h4>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="flex items-center gap-2">
                    Twice/Week Multiplier
                    <Info className="w-4 h-4 text-gray-400" title="Multiplies the monthly service price when the pool requires twice-weekly visits. Pools with high debris load or heavy usage may require more frequent service." />
                  </Label>
                  <Input
                    type="number"
                    step="0.1"
                    value={frequencyMultiplier}
                    onChange={(e) => updateField('frequencyLogic.twice_weekly_multiplier', e.target.value)}
                    className="mt-2"
                  />
                  <p className="text-xs text-gray-500 mt-1">Applied to final monthly total (e.g., 1.8× = 80% more)</p>
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
            </div>

            {/* Initial Fees */}
            <div className="border-t pt-4">
              <h4 className="font-semibold text-gray-800 mb-2 flex items-center gap-2">
                One-Time Fees
                <Info className="w-4 h-4 text-gray-400" title="One-time charges applied during the first service visit to cover startup work such as inspection, water balancing, and debris removal." />
              </h4>
              <div>
                <Label>Initial Service Fee (Slightly Cloudy)</Label>
                <Input
                  type="number"
                  value={localSettings.initialFees?.slightly_cloudy || 25}
                  onChange={(e) => updateField('initialFees.slightly_cloudy', e.target.value)}
                  className="mt-2"
                />
                <p className="text-xs text-gray-500 mt-1">Charge for slightly cloudy water conditions on first visit</p>
              </div>

              <p className="text-sm text-gray-700 font-semibold mt-6 mb-3">Green-to-Clean Pricing</p>
              <div className="space-y-6">
              <div>
                <p className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                 Light Algae
                 <Info className="w-3 h-3 text-gray-400" title="Green-to-Clean services require multiple visits, additional chemicals, and extended cleaning time." />
               </p>
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
                <p className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                 Moderate Algae
                 <Info className="w-3 h-3 text-gray-400" title="More intensive treatment required; typically 2–3 visits over a week." />
               </p>
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
                <p className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                 Black Swamp (Severe)
                 <Info className="w-3 h-3 text-gray-400" title="Heavily contaminated pools requiring extensive treatment over multiple days." />
               </p>
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
              </div>
              </div>
              </CardContent>
              </Card>

              {/* Reset Confirmation Dialog */}
              <AlertDialog open={showResetConfirm} onOpenChange={setShowResetConfirm}>
              <AlertDialogContent>
              <AlertDialogTitle>Revert to Last Saved?</AlertDialogTitle>
              <AlertDialogDescription>
              This will discard all unsaved changes and restore the last persisted configuration.
              </AlertDialogDescription>
              <div className="flex gap-3 justify-end">
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleReset} className="bg-red-600 hover:bg-red-700">
                Revert
              </AlertDialogAction>
              </div>
              </AlertDialogContent>
              </AlertDialog>
              </div>
              </div>
              );
              }