import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, Plus, RefreshCw, Settings, Lock, ChevronDown, ChevronRight, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import ReadinessCheckPanel from '../components/admin/ReadinessCheckPanel';

// ─── Default config (identical to seedAdminSettingsDefault) ───────────────────
const DEFAULT_CONFIG = {
  settingKey: 'default',
  pricingEngineVersion: 'v2_tokens_risk_frequency',
  baseTierPrices: JSON.stringify({
    tier_a_10_15k: 140,
    tier_b_15_20k: 160,
    tier_c_20_30k: 190,
    tier_d_30k_plus: 230,
    absolute_floor: 120
  }),
  additiveTokens: JSON.stringify({
    unscreened_tier_a: 20,
    unscreened_tier_b: 25,
    unscreened_tier_c: 30,
    unscreened_tier_d: 40,
    trees_overhead: 10,
    usage_weekends: 10,
    usage_several_week: 10,
    usage_daily: 20,
    chlorinator_floater_tier_a: 5,
    chlorinator_floater_tier_b: 10,
    chlorinator_floater_tier_c: 15,
    chlorinator_floater_tier_d: 20,
    chlorinator_liquid_only: 10,
    pets_occasional: 5,
    pets_frequent: 10
  }),
  initialFees: JSON.stringify({
    slightly_cloudy: 25,
    green_light_small: 60,
    green_light_medium: 100,
    green_light_large: 150,
    green_moderate_small: 100,
    green_moderate_medium: 150,
    green_moderate_large: 200,
    green_black_small: 250,
    green_black_medium: 350,
    green_black_large: 450
  }),
  riskEngine: JSON.stringify({
    points: {
      unscreened: 2,
      trees_overhead: 1,
      usage_daily: 2,
      usage_several_week: 1,
      chlorinator_floater_skimmer: 1,
      chlorinator_liquid_only: 2,
      pets_frequent: 1,
      pets_occasional: 0.5,
      condition_green: 2
    },
    size_multipliers: {
      tier_a: 1.0,
      tier_b: 1.1,
      tier_c: 1.2,
      tier_d: 1.3
    },
    escalation_brackets: [
      { min_risk: 0, max_risk: 2, addon_amount: 0 },
      { min_risk: 3, max_risk: 5, addon_amount: 15 },
      { min_risk: 6, max_risk: 8, addon_amount: 30 },
      { min_risk: 9, max_risk: 11, addon_amount: 45 },
      { min_risk: 12, max_risk: 999, addon_amount: 60 }
    ]
  }),
  frequencyLogic: JSON.stringify({
    twice_weekly_multiplier: 1.8,
    auto_require_threshold: 9
  }),
  autopayDiscount: 10
};

// ─── Config summary row ────────────────────────────────────────────────────────
function ConfigSummaryRow({ record, index }) {
  const [expanded, setExpanded] = useState(false);
  const isLatest = index === 0;

  let riskBrackets = '—';
  let tokenCount = '—';
  try {
    const re = JSON.parse(record.riskEngine || '{}');
    riskBrackets = re.escalation_brackets?.length ?? '—';
    const t = JSON.parse(record.additiveTokens || '{}');
    tokenCount = Object.keys(t).length;
  } catch {}

  return (
    <div className="border rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center gap-3 p-4 text-left hover:bg-gray-50 transition-colors"
      >
        {expanded ? <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" /> : <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-800">
              v{(record.pricingEngineVersion || 'unknown')}
            </span>
            {isLatest && <Badge className="bg-teal-100 text-teal-700 text-xs px-2 py-0">Active</Badge>}
            <span className="text-xs text-gray-400">ID: {record.id?.slice(0, 8)}…</span>
          </div>
          <p className="text-xs text-gray-500 mt-0.5">
            Created: {record.created_date ? new Date(record.created_date).toLocaleString() : '—'}
            {record.created_by && ` · By: ${record.created_by}`}
          </p>
        </div>
        <div className="text-xs text-gray-500 hidden sm:flex gap-4 shrink-0">
          <span>{riskBrackets} brackets</span>
          <span>{tokenCount} tokens</span>
        </div>
      </button>

      {expanded && (
        <div className="border-t bg-gray-50 p-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          {[
            ['baseTierPrices', 'Base Tier Prices'],
            ['additiveTokens', 'Additive Tokens'],
            ['riskEngine', 'Risk Engine'],
            ['frequencyLogic', 'Frequency Logic'],
            ['initialFees', 'Initial Fees'],
          ].map(([field, label]) => {
            let parsed;
            try { parsed = JSON.parse(record[field] || '{}'); } catch { parsed = {}; }
            return (
              <div key={field} className="bg-white rounded border p-3">
                <p className="font-semibold text-gray-600 mb-1">{label}</p>
                <pre className="text-gray-500 whitespace-pre-wrap text-xs overflow-auto max-h-40">
                  {JSON.stringify(parsed, null, 2)}
                </pre>
              </div>
            );
          })}
          <div className="bg-white rounded border p-3">
            <p className="font-semibold text-gray-600 mb-1">AutoPay Discount</p>
            <p className="text-gray-800">${record.autopayDiscount ?? '—'}/month</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────
export default function AdminSettingsSetup() {
  const queryClient = useQueryClient();
  const [readiness, setReadiness] = useState(null);
  const [checkingReadiness, setCheckingReadiness] = useState(false);

  const { data: user } = useQuery({
    queryKey: ['user'],
    queryFn: () => base44.auth.me()
  });

  const { data: allSettings = [], isLoading } = useQuery({
    queryKey: ['adminSettingsAll'],
    queryFn: () => base44.entities.AdminSettings.list('-created_date', 50),
    enabled: user?.role === 'admin'
  });

  const settingsExist = allSettings.length > 0;
  const latestSettings = allSettings[0] || null;

  const runReadinessCheck = async () => {
    setCheckingReadiness(true);
    try {
      const res = await base44.functions.invoke('checkReleaseReadiness', {});
      setReadiness(res.data);
    } catch (err) {
      toast.error('Readiness check failed: ' + err.message);
    } finally {
      setCheckingReadiness(false);
    }
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      // Always create — never update (append-only)
      return await base44.entities.AdminSettings.create(DEFAULT_CONFIG);
    },
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ['adminSettingsAll'] });
      toast.success('AdminSettings created successfully');
      await runReadinessCheck();
    },
    onError: (err) => {
      toast.error('Failed to create AdminSettings: ' + err.message);
    }
  });

  // ── Auth guard ──────────────────────────────────────────────────────────────
  if (user && user.role !== 'admin') {
    return (
      <div className="max-w-2xl mx-auto mt-16">
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-6 flex items-center gap-3">
            <Lock className="w-5 h-5 text-red-600" />
            <p className="text-red-800 font-medium">Access denied — admin role required.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-gray-500">
        <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> Loading AdminSettings…
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 py-2">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 flex items-center gap-2">
            <Settings className="w-6 h-6 text-teal-600" />
            AdminSettings Setup
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Append-only config store · Each record is immutable · New versions create new records
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={runReadinessCheck}
          disabled={checkingReadiness || !settingsExist}
          className="gap-2"
        >
          <RefreshCw className={`w-4 h-4 ${checkingReadiness ? 'animate-spin' : ''}`} />
          Run Readiness Check
        </Button>
      </div>

      {/* ── BLOCKING BANNER ─────────────────────────────────────────────────── */}
      {!settingsExist && (
        <div className="rounded-lg border-2 border-red-300 bg-red-50 p-6">
          <div className="flex items-start gap-4">
            <AlertTriangle className="w-7 h-7 text-red-500 shrink-0 mt-0.5" />
            <div className="flex-1">
              <h2 className="text-lg font-bold text-red-800">AdminSettings missing — quotes disabled</h2>
              <p className="text-sm text-red-700 mt-1">
                No AdminSettings record found. The pricing engine cannot calculate quotes without it.
                Create the initial config below to unblock the system.
              </p>
              <div className="mt-4 bg-white rounded-lg border border-red-200 p-4 text-xs text-gray-700 space-y-1">
                <p className="font-semibold text-gray-800 mb-2">Will be created with:</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  <span>✓ pricingEngineVersion: v2_tokens_risk_frequency</span>
                  <span>✓ 4 base tier prices (A–D)</span>
                  <span>✓ Absolute floor: $120</span>
                  <span>✓ 15 additive tokens</span>
                  <span>✓ 9 risk point definitions</span>
                  <span>✓ 4 size multipliers (1.0–1.3)</span>
                  <span>✓ 5 risk escalation brackets</span>
                  <span>✓ 2× weekly multiplier (1.8×)</span>
                  <span>✓ Auto-require threshold: 9</span>
                  <span>✓ 10 initial condition fee tiers</span>
                  <span>✓ AutoPay discount: $10</span>
                </div>
              </div>
              <Button
                onClick={() => createMutation.mutate()}
                disabled={createMutation.isPending}
                className="mt-4 bg-red-600 hover:bg-red-700 text-white gap-2"
              >
                <Plus className="w-4 h-4" />
                {createMutation.isPending ? 'Creating…' : 'Create Initial AdminSettings'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── READINESS RESULTS ───────────────────────────────────────────────── */}
      {readiness && (
        <div>
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Readiness Check Results</h2>
          <ReadinessCheckPanel readiness={readiness} />
        </div>
      )}

      {/* ── SETTINGS EXIST: controls + history ──────────────────────────────── */}
      {settingsExist && (
        <>
          {/* Active config summary */}
          <Card className="border-teal-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold text-teal-800 flex items-center gap-2">
                <Badge className="bg-teal-100 text-teal-700">Active</Badge>
                Current Config · {latestSettings?.pricingEngineVersion}
              </CardTitle>
            </CardHeader>
            <CardContent className="pb-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                {(() => {
                  let tiers = {}; let tokens = {}; let re = {}; let freq = {};
                  try { tiers = JSON.parse(latestSettings.baseTierPrices || '{}'); } catch {}
                  try { tokens = JSON.parse(latestSettings.additiveTokens || '{}'); } catch {}
                  try { re = JSON.parse(latestSettings.riskEngine || '{}'); } catch {}
                  try { freq = JSON.parse(latestSettings.frequencyLogic || '{}'); } catch {}
                  return [
                    { label: 'Tier A Base', value: tiers.tier_a_10_15k ? `$${tiers.tier_a_10_15k}` : '—' },
                    { label: 'Tier D Base', value: tiers.tier_d_30k_plus ? `$${tiers.tier_d_30k_plus}` : '—' },
                    { label: 'Price Floor', value: tiers.absolute_floor ? `$${tiers.absolute_floor}` : '—' },
                    { label: 'Token Count', value: Object.keys(tokens).length || '—' },
                    { label: 'Risk Brackets', value: re.escalation_brackets?.length ?? '—' },
                    { label: 'Max Risk Addon', value: re.escalation_brackets ? `$${Math.max(...re.escalation_brackets.map(b => b.addon_amount))}` : '—' },
                    { label: '2× Multiplier', value: freq.twice_weekly_multiplier ? `${freq.twice_weekly_multiplier}×` : '—' },
                    { label: 'AutoPay Discount', value: latestSettings.autopayDiscount ? `$${latestSettings.autopayDiscount}` : '—' },
                  ].map(({ label, value }) => (
                    <div key={label} className="bg-gray-50 rounded p-3">
                      <p className="text-xs text-gray-500">{label}</p>
                      <p className="font-semibold text-gray-800 mt-0.5">{value}</p>
                    </div>
                  ));
                })()}
              </div>
            </CardContent>
          </Card>

          {/* Append-only note + new version button */}
          <div className="flex items-center justify-between p-4 bg-amber-50 border border-amber-200 rounded-lg">
            <div className="flex items-center gap-2 text-sm text-amber-800">
              <Lock className="w-4 h-4 shrink-0" />
              <span>Records are immutable. Changes require creating a new version.</span>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => createMutation.mutate()}
              disabled={createMutation.isPending}
              className="gap-2 border-amber-300 text-amber-800 hover:bg-amber-100 shrink-0 ml-4"
            >
              <Plus className="w-3.5 h-3.5" />
              {createMutation.isPending ? 'Creating…' : 'Create New Version'}
            </Button>
          </div>

          {/* Version history */}
          <div>
            <h2 className="text-sm font-semibold text-gray-700 mb-3">
              Version History <span className="text-gray-400 font-normal">({allSettings.length} record{allSettings.length !== 1 ? 's' : ''})</span>
            </h2>
            <div className="space-y-2">
              {allSettings.map((record, i) => (
                <ConfigSummaryRow key={record.id} record={record} index={i} />
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}