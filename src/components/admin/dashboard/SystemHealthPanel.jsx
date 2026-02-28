import React from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckCircle2, XCircle, AlertCircle, Cpu } from 'lucide-react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';

function Check({ label, ok, blocker, detail }) {
  return (
    <div className="flex items-start gap-2 py-2 border-b border-gray-50 last:border-0">
      {ok ? (
        <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
      ) : blocker ? (
        <XCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
      ) : (
        <AlertCircle className="w-4 h-4 text-yellow-500 mt-0.5 flex-shrink-0" />
      )}
      <div>
        <p className={`text-sm font-medium ${ok ? 'text-gray-700' : blocker ? 'text-red-700' : 'text-yellow-700'}`}>{label}</p>
        {detail && <p className="text-xs text-gray-400 mt-0.5">{detail}</p>}
      </div>
    </div>
  );
}

export default function SystemHealthPanel() {
  const { data: adminSettings = [] } = useQuery({
    queryKey: ['adminSettingsHealth'],
    queryFn: () => base44.entities.AdminSettings.list()
  });

  const { data: chemTargets = [] } = useQuery({
    queryKey: ['chemTargetsHealth'],
    queryFn: () => base44.entities.ChemistryTargets.list()
  });

  const { data: productProfiles = [] } = useQuery({
    queryKey: ['productProfilesHealth'],
    queryFn: () => base44.entities.ProductProfile.filter({ isActive: true })
  });

  const settings = adminSettings[0];
  const hasSettings = !!settings;
  const pricingVersion = settings?.pricingEngineVersion;
  const hasBaseTiers = !!settings?.baseTierPrices;
  const hasRiskEngine = !!settings?.riskEngine;
  const hasFreqLogic = !!settings?.frequencyLogic;
  const hasChemTargets = chemTargets.length > 0;
  const hasProducts = productProfiles.length >= 3; // expect at least chlorine, acid, alk

  const allGood = hasSettings && hasBaseTiers && hasRiskEngine && hasFreqLogic && hasChemTargets && hasProducts;

  return (
    <Card className={allGood ? 'border-green-200' : 'border-red-200'}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Cpu className="w-4 h-4" /> System Health
          </CardTitle>
          <Link to={createPageUrl('AdminSettingsSetup')} className="text-xs text-teal-600 hover:underline">Configure →</Link>
        </div>
      </CardHeader>
      <CardContent>
        <Check
          label="AdminSettings record"
          ok={hasSettings}
          blocker={!hasSettings}
          detail={hasSettings ? `Key: ${settings.settingKey}` : 'No AdminSettings found — pricing engine is blocked'}
        />
        <Check
          label="Pricing engine version"
          ok={!!pricingVersion}
          blocker={!pricingVersion}
          detail={pricingVersion || 'Missing pricingEngineVersion'}
        />
        <Check
          label="Base tier prices"
          ok={hasBaseTiers}
          blocker={!hasBaseTiers}
          detail={hasBaseTiers ? 'Loaded' : 'baseTierPrices not set'}
        />
        <Check
          label="Risk engine config"
          ok={hasRiskEngine}
          blocker={!hasRiskEngine}
          detail={hasRiskEngine ? 'Loaded' : 'riskEngine not set'}
        />
        <Check
          label="Frequency logic"
          ok={hasFreqLogic}
          blocker={!hasFreqLogic}
          detail={hasFreqLogic ? 'Loaded' : 'frequencyLogic not set'}
        />
        <Check
          label="Chemistry targets"
          ok={hasChemTargets}
          blocker={!hasChemTargets}
          detail={hasChemTargets ? `${chemTargets.length} profile(s)` : 'No ChemistryTargets record — dose engine may fail'}
        />
        <Check
          label="Product profiles (active)"
          ok={hasProducts}
          blocker={!hasProducts}
          detail={`${productProfiles.length} active product(s)`}
        />
      </CardContent>
    </Card>
  );
}