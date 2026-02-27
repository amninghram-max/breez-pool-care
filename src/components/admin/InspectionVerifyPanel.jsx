import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CheckCircle, AlertCircle, Loader2, RefreshCw } from 'lucide-react';
import { PriceConfirmedBadge, PriceAdjustedBadge, AdjustmentReasons } from '../quote/QuoteMicrocopy';

/**
 * InspectionVerifyPanel
 * Inspector edits quote inputs to reflect verified real-world conditions.
 * System re-runs pricing engine. No manual price override.
 * If price changes → new immutable Quote version. If no change → inspectionVerified=true.
 */

const FIELD_LABELS = {
  poolSize: 'Pool Size',
  poolType: 'Pool Type',
  spaPresent: 'Spa/Hot Tub',
  enclosure: 'Enclosure',
  treesOverhead: 'Trees Overhead',
  filterType: 'Filter Type',
  chlorinationMethod: 'Chlorination Method',
  chlorinatorType: 'Chlorinator Type',
  useFrequency: 'Usage Frequency',
  petsAccess: 'Pets Have Access',
  petSwimFrequency: 'Pet Swim Frequency',
  poolCondition: 'Pool Condition',
  greenPoolSeverity: 'Green Pool Severity'
};

const FIELD_OPTIONS = {
  poolSize: [
    { value: '10_15k', label: '10k–15k gal' },
    { value: '15_20k', label: '15k–20k gal' },
    { value: '20_30k', label: '20k–30k gal' },
    { value: '30k_plus', label: '30k+ gal' },
    { value: 'not_sure', label: 'Not sure' }
  ],
  poolType: [{ value: 'in_ground', label: 'In-ground' }, { value: 'above_ground', label: 'Above-ground' }, { value: 'not_sure', label: 'Not sure' }],
  spaPresent: [{ value: 'true', label: 'Yes' }, { value: 'false', label: 'No' }, { value: 'unknown', label: 'Unknown' }],
  enclosure: [{ value: 'fully_screened', label: 'Fully screened' }, { value: 'unscreened', label: 'Unscreened' }, { value: 'indoor', label: 'Indoor' }],
  treesOverhead: [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }, { value: 'not_sure', label: 'Not sure' }],
  filterType: [{ value: 'sand', label: 'Sand' }, { value: 'cartridge', label: 'Cartridge' }, { value: 'de', label: 'DE' }, { value: 'not_sure', label: 'Not sure' }],
  chlorinationMethod: [
    { value: 'saltwater', label: 'Saltwater' }, { value: 'tablets', label: 'Tablets' },
    { value: 'liquid_chlorine', label: 'Liquid Chlorine' }, { value: 'mineral', label: 'Mineral' }, { value: 'not_sure', label: 'Not sure' }
  ],
  chlorinatorType: [
    { value: 'inline_plumbed', label: 'Inline/Plumbed' }, { value: 'offline', label: 'Offline' },
    { value: 'floating', label: 'Floating' }, { value: 'skimmer', label: 'Skimmer' },
    { value: 'not_sure', label: 'Not sure' }, { value: 'n/a', label: 'N/A' }
  ],
  useFrequency: [{ value: 'rarely', label: 'Rarely' }, { value: 'weekends', label: 'Weekends' }, { value: 'several_week', label: 'Several/week' }, { value: 'daily', label: 'Daily' }],
  petsAccess: [{ value: 'true', label: 'Yes' }, { value: 'false', label: 'No' }],
  petSwimFrequency: [{ value: 'never', label: 'Never' }, { value: 'rarely', label: 'Rarely' }, { value: 'occasionally', label: 'Occasionally' }, { value: 'frequently', label: 'Frequently' }],
  poolCondition: [{ value: 'clear', label: 'Clear' }, { value: 'slightly_cloudy', label: 'Slightly Cloudy' }, { value: 'green_algae', label: 'Green/Algae' }, { value: 'recently_treated', label: 'Recently Treated' }, { value: 'not_sure', label: 'Not sure' }],
  greenPoolSeverity: [{ value: 'light', label: 'Light' }, { value: 'moderate', label: 'Moderate' }, { value: 'black_swamp', label: 'Heavy (Black Swamp)' }, { value: 'not_sure', label: 'Not sure' }]
};

export default function InspectionVerifyPanel({ quote, onComplete }) {
  const queryClient = useQueryClient();

  // Start with quote's original inputs
  const [verified, setVerified] = useState({
    poolSize: quote.inputPoolSize || '',
    poolType: quote.inputPoolType || '',
    spaPresent: quote.inputSpaPresent || '',
    enclosure: quote.inputEnclosure || '',
    treesOverhead: quote.inputTreesOverhead || '',
    filterType: quote.inputFilterType || '',
    chlorinationMethod: quote.inputChlorinationMethod || '',
    chlorinatorType: quote.inputChlorinatiorType || 'n/a',
    useFrequency: quote.inputUseFrequency || '',
    petsAccess: String(quote.inputPetsAccess ?? 'false'),
    petSwimFrequency: quote.inputPetSwimFrequency || 'never',
    poolCondition: quote.inputPoolCondition || '',
    greenPoolSeverity: quote.inputGreenPoolSeverity || ''
  });

  const [result, setResult] = useState(null);

  const verifyMutation = useMutation({
    mutationFn: async () => {
      const verifiedInputs = {
        ...verified,
        petsAccess: verified.petsAccess === 'true'
      };
      const res = await base44.functions.invoke('verifyInspectionQuote', {
        originalQuoteId: quote.id,
        verifiedInputs
      });
      return res.data;
    },
    onSuccess: (data) => {
      setResult(data);
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      queryClient.invalidateQueries({ queryKey: ['quotes'] });
      if (onComplete) onComplete(data);
    }
  });

  const setV = (k, v) => setVerified(f => ({ ...f, [k]: v }));

  // Detect changed fields for visual diff
  const originalInputs = {
    poolSize: quote.inputPoolSize, poolType: quote.inputPoolType, spaPresent: quote.inputSpaPresent,
    enclosure: quote.inputEnclosure, treesOverhead: quote.inputTreesOverhead, filterType: quote.inputFilterType,
    chlorinationMethod: quote.inputChlorinationMethod, chlorinatorType: quote.inputChlorinatiorType,
    useFrequency: quote.inputUseFrequency, petsAccess: String(quote.inputPetsAccess ?? 'false'),
    petSwimFrequency: quote.inputPetSwimFrequency, poolCondition: quote.inputPoolCondition,
    greenPoolSeverity: quote.inputGreenPoolSeverity
  };

  const changedFields = Object.keys(FIELD_LABELS).filter(k => String(originalInputs[k]) !== String(verified[k]));

  if (result) {
    return (
      <div className="space-y-4">
        {result.priceChanged ? (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-3">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-blue-600" />
              <p className="font-semibold text-blue-900">Price updated after inspection</p>
            </div>
            <PriceAdjustedBadge />
            <div className="text-sm text-blue-800 space-y-1">
              <p>Original: <strong>${result.originalMonthly?.toFixed(2)}/mo</strong></p>
              <p>Verified: <strong>${result.newMonthly?.toFixed(2)}/mo</strong></p>
            </div>
            <div>
              <p className="text-xs font-semibold text-blue-800 mb-1">Reasons (auto-detected):</p>
              <AdjustmentReasons codes={result.adjustmentReasonCodes} />
            </div>
            <p className="text-xs text-blue-700">A new immutable quote version has been created (ID: {result.resultQuoteId?.slice(-8)})</p>
          </div>
        ) : (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 space-y-2">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-green-600" />
              <p className="font-semibold text-green-900">Price confirmed — no change</p>
            </div>
            <PriceConfirmedBadge />
            <p className="text-sm text-green-800">${result.originalMonthly?.toFixed(2)}/month — same as original quote.</p>
          </div>
        )}
      </div>
    );
  }

  if (quote.inspectionVerified) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-center gap-2">
        <CheckCircle className="w-5 h-5 text-green-600" />
        <div>
          <p className="font-semibold text-green-900">Already inspection verified</p>
          {quote.priceChanged
            ? <><PriceAdjustedBadge /><AdjustmentReasons codes={quote.adjustmentReasonCodes} /></>
            : <PriceConfirmedBadge />
          }
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-blue-50 border border-blue-100 rounded-lg px-4 py-2 text-sm text-blue-800">
        <strong>Inspection verification:</strong> Update inputs to match what was actually observed. Pricing will be recalculated automatically. No manual price override is permitted.
      </div>

      {/* Show original price */}
      <div className="flex items-center justify-between text-sm bg-gray-50 rounded-lg px-4 py-2 border">
        <span className="text-gray-600">Original quote price</span>
        <span className="font-bold text-gray-900">${quote.outputMonthlyPrice?.toFixed(2)}/mo</span>
      </div>

      {/* Input edit grid */}
      <div className="grid grid-cols-2 gap-3">
        {Object.entries(FIELD_LABELS).map(([field, label]) => {
          const options = FIELD_OPTIONS[field];
          if (!options) return null;
          // Only show treesOverhead for unscreened
          if (field === 'treesOverhead' && verified.enclosure !== 'unscreened') return null;
          // Only show chlorinatorType for tablets
          if (field === 'chlorinatorType' && verified.chlorinationMethod !== 'tablets') return null;
          // Only show petSwimFrequency if pets have access
          if (field === 'petSwimFrequency' && verified.petsAccess !== 'true') return null;
          // Only show greenPoolSeverity if condition is green_algae
          if (field === 'greenPoolSeverity' && verified.poolCondition !== 'green_algae') return null;

          const isChanged = changedFields.includes(field);

          return (
            <div key={field} className={`rounded-lg p-2 ${isChanged ? 'bg-amber-50 border border-amber-300' : ''}`}>
              <Label className={`text-xs mb-1 block ${isChanged ? 'text-amber-800 font-semibold' : 'text-gray-600'}`}>
                {label}{isChanged ? ' ✱' : ''}
              </Label>
              <Select value={verified[field] || ''} onValueChange={v => setV(field, v)}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {options.map(o => <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          );
        })}
      </div>

      {changedFields.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-800">
          <strong>{changedFields.length} input{changedFields.length > 1 ? 's' : ''} changed</strong> — price will be recalculated on confirmation.
        </div>
      )}

      <div className="flex gap-2 pt-2">
        <Button
          onClick={() => verifyMutation.mutate()}
          disabled={verifyMutation.isPending}
          className="bg-teal-600 hover:bg-teal-700"
        >
          {verifyMutation.isPending
            ? <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" />Verifying...</>
            : changedFields.length > 0 ? <><RefreshCw className="w-4 h-4 mr-1.5" />Confirm & Reprice</>
            : <><CheckCircle className="w-4 h-4 mr-1.5" />Confirm — No Changes</>
          }
        </Button>
      </div>
    </div>
  );
}