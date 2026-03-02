import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, AlertCircle, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

/**
 * QuoteWizard — canonical quote flow used by both:
 * - Public customers (persistQuote=true, real, persistent)
 * - Field Sales (persistQuote=false, estimate only, no persistence)
 *
 * Props:
 *   persistQuote: boolean — if true, calls calculateQuote (persist); if false, calls calculateQuoteOnly (estimate)
 *   initialAnswers: prefilled answers
 *   onComplete: (quoteResult, formData) => void  — called when quote is ready
 */

const LAST_ANSWERS_KEY = 'breez_last_quote_answers';

const DEFAULT_FORM = {
  poolSize: '', poolType: '', spaPresent: '', enclosure: '', treesOverhead: '',
  filterType: '', chlorinationMethod: '', chlorinatorType: '', useFrequency: '',
  petsAccess: false, petSwimFrequency: 'never', poolCondition: '', greenPoolSeverity: '',
  knownIssues: [],
  clientFirstName: '', clientLastName: '', clientEmail: '', clientPhone: ''
};

export default function QuoteWizard({ persistQuote = true, initialAnswers = null, onComplete }) {
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState(initialAnswers ? { ...DEFAULT_FORM, ...initialAnswers } : DEFAULT_FORM);
  const [hasSavedAnswers] = useState(() => !!localStorage.getItem(LAST_ANSWERS_KEY));
  const [quoteResult, setQuoteResult] = useState(null);
  const [estimateError, setEstimateError] = useState(null);

  const setF = (k, v) => setFormData(f => ({ ...f, [k]: v }));

  const toggleKnownIssue = (val) => {
    setFormData(f => ({
      ...f,
      knownIssues: f.knownIssues.includes(val)
        ? f.knownIssues.filter(v => v !== val)
        : [...f.knownIssues, val]
    }));
  };

  const reuseLastAnswers = () => {
    const saved = localStorage.getItem(LAST_ANSWERS_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      setFormData(f => ({ ...f, ...parsed, clientFirstName: '', clientLastName: '', clientEmail: '', clientPhone: '' }));
    }
  };

  const calculateMutation = useMutation({
    mutationFn: async () => {
      // Save pool answers for future reuse (no PII)
      const { clientFirstName, clientLastName, clientEmail, clientPhone, ...poolAnswers } = formData;
      localStorage.setItem(LAST_ANSWERS_KEY, JSON.stringify(poolAnswers));

      setEstimateError(null);

      if (persistQuote) {
        // Persist: call calculateQuote to create Quote record
        const res = await base44.functions.invoke('calculateQuote', { questionnaireData: formData });
        return res.data;
      } else {
        // Estimate: call calculateQuoteOnly (no persistence)
        try {
          console.log('[QuoteWizard] calculateQuoteOnly request:', {
            poolSize: formData.poolSize,
            poolType: formData.poolType,
            filterType: formData.filterType,
            chlorinationMethod: formData.chlorinationMethod,
            useFrequency: formData.useFrequency,
            poolCondition: formData.poolCondition
          });
          
          const res = await base44.functions.invoke('calculateQuoteOnly', { questionnaireData: formData });
          
          console.log('[QuoteWizard] calculateQuoteOnly response:', res);
          
          if (!res.data) {
            throw new Error('No data in response');
          }
          
          return res.data;
        } catch (err) {
          console.error('[QuoteWizard] calculateQuoteOnly failed:', err);
          setEstimateError(err.message || 'Estimate generation failed');
          toast.error(err.message || 'Estimate failed');
          throw err;
        }
      }
    },
    onSuccess: (data) => {
      if (!persistQuote) {
        // Estimate path: normalize and validate before showing result
        const normalized = normalizeEstimate(data);
        
        // CRITICAL: monthly must be a number
        if (!normalized.monthly || typeof normalized.monthly !== 'number') {
          console.error('[QuoteWizard] Estimate rejected: monthly is not a number', { normalized });
          setEstimateError('Estimate generation failed: no valid monthly price');
          toast.error('Estimate generation failed: no valid monthly price');
          return;
        }
        
        // Store ONLY normalized canonical shape for callback
        setQuoteResult(normalized);
        toast.success('Estimate generated');
        console.log('[QuoteWizard] Estimate normalized and ready:', { monthly: normalized.monthly, perVisit: normalized.perVisit, oneTime: normalized.oneTime });
        return; // Don't call onComplete yet; wait for user to click "Continue"
      }
      if (onComplete) onComplete(data, formData);
    }
  });

  const stepValid = () => {
    if (step === 1) {
      const base = formData.poolSize && formData.poolType && formData.spaPresent && formData.enclosure;
      return formData.enclosure === 'unscreened' ? base && formData.treesOverhead : base;
    }
    if (step === 2) {
      const base = formData.filterType && formData.chlorinationMethod && formData.useFrequency && formData.poolCondition;
      return formData.poolCondition === 'green_algae' ? base && formData.greenPoolSeverity : base;
    }
    // Step 3 only required when persistQuote (public/real flow)
    if (step === 3 && persistQuote) return formData.clientFirstName && formData.clientEmail;
    return true;
  };

  // Estimate (persistQuote=false): 2 steps (pool + features)
  // Persist (persistQuote=true): 3 steps (pool + features + contact)
  const totalSteps = persistQuote ? 3 : 2;

  // Normalize estimate response to extract monthly/perVisit/oneTime
  const normalizeEstimate = (raw) => {
    // Extract quote from nested data structure (Axios response wraps in .data)
    const quoteData = raw?.data?.quote || raw?.quote || raw;
    
    // Canonical monthly extraction: prefer finalMonthlyPrice, fallback to estimatedMonthlyPrice
    const monthly = quoteData?.finalMonthlyPrice ?? quoteData?.estimatedMonthlyPrice ?? quoteData?.monthly;
    const perVisit = quoteData?.estimatedPerVisitPrice;
    const oneTime = quoteData?.estimatedOneTimeFees;

    // Validate monthly is a valid number
    if (!monthly || typeof monthly !== 'number') {
      console.error('[normalizeEstimate] Invalid monthly price:', { monthly, keys: Object.keys(quoteData || {}) });
      return { monthly: null, perVisit: null, oneTime: null };
    }

    console.log('[normalizeEstimate] Canonical shape created:', { monthly, perVisit, oneTime });
    return { monthly, perVisit, oneTime };
  };

  // Estimate mode: show result when ready
  if (!persistQuote && quoteResult) {
    const normalized = normalizeEstimate(quoteResult);
    const monthlyPrice = normalized.monthly || 0;
    const showMappingWarning = (!monthlyPrice || monthlyPrice === 0) && Object.keys(normalized.debug.numericCandidates).length > 0;

    return (
      <div className="max-w-2xl mx-auto space-y-5">
        {showMappingWarning && (
          <div className="bg-yellow-50 border border-yellow-300 rounded-lg px-4 py-3 text-xs text-yellow-800">
            <p className="font-semibold mb-2">⚠️ Estimate mapping mismatch — monthly not found</p>
            <p className="mb-1">Numeric candidates checked:</p>
            <code className="block bg-white p-2 rounded text-xs overflow-x-auto">
              {JSON.stringify(normalized.debug.numericCandidates, null, 2)}
            </code>
            <p className="mt-2 text-xs">Top-level keys: {normalized.debug.allKeys.join(', ')}</p>
          </div>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Your Estimate</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-teal-50 border border-teal-200 rounded-lg p-4">
              <p className="text-sm text-teal-700 mb-3">Monthly Service Price:</p>
              <p className="text-3xl font-bold text-teal-900">${monthlyPrice.toFixed(2)}</p>
              {normalized.perVisit && (
                <p className="text-xs text-teal-600 mt-2">Per visit: ${normalized.perVisit.toFixed(2)}</p>
              )}
              {normalized.oneTime && normalized.oneTime > 0 && (
                <p className="text-xs text-teal-600 mt-1">One-time fees: ${normalized.oneTime.toFixed(2)}</p>
              )}
            </div>
            <div className="flex gap-3">
              <Button
                onClick={() => {
                  // Pass normalized canonical object only
                  if (onComplete) onComplete({ monthly: normalized.monthly, perVisit: normalized.perVisit, oneTime: normalized.oneTime }, formData);
                }}
                className="flex-1 bg-teal-600 hover:bg-teal-700"
              >
                Continue to Inspection
              </Button>
              <Button
                onClick={() => {
                  setQuoteResult(null);
                  setStep(1);
                }}
                variant="outline"
                className="flex-1"
              >
                Generate Another
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      {hasSavedAnswers && step === 1 && (
        <button onClick={reuseLastAnswers} className="flex items-center gap-1.5 text-sm text-teal-700 hover:text-teal-900 underline underline-offset-2">
          <RefreshCw className="w-3.5 h-3.5" /> Reuse my last pool answers
        </button>
      )}

      {/* Progress */}
      <div className="flex gap-2">
        {Array.from({ length: totalSteps }, (_, i) => i + 1).map(s => (
          <div key={s} className={`flex-1 h-1.5 rounded-full transition-colors ${s <= step ? 'bg-teal-600' : 'bg-gray-200'}`} />
        ))}
      </div>

      {(calculateMutation.isError || estimateError) && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-800">
          <AlertCircle className="w-4 h-4" />
          {estimateError || calculateMutation.error?.message || 'Failed to calculate quote. Please try again.'}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>
            {step === 1 && 'Pool Details'}
            {step === 2 && 'Pool Features & Condition'}
            {step === 3 && 'Your Information'}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* STEP 1 */}
          {step === 1 && (
            <>
              <FieldSelect label="Pool Size" value={formData.poolSize} onChange={v => setF('poolSize', v)} options={[
                { value: '10_15k', label: '10k–15k gallons' },
                { value: '15_20k', label: '15k–20k gallons' },
                { value: '20_30k', label: '20k–30k gallons' },
                { value: '30k_plus', label: '30k+ gallons' },
                { value: 'not_sure', label: 'Not sure' }
              ]} />
              <FieldSelect label="Pool Type" value={formData.poolType} onChange={v => setF('poolType', v)} options={[
                { value: 'in_ground', label: 'In-ground' },
                { value: 'above_ground', label: 'Above-ground' },
                { value: 'not_sure', label: 'Not sure' }
              ]} />
              <FieldSelect label="Spa / Hot Tub?" value={formData.spaPresent} onChange={v => setF('spaPresent', v)} options={[
                { value: 'true', label: 'Yes' },
                { value: 'false', label: 'No' },
                { value: 'unknown', label: 'Not sure' }
              ]} />
              <FieldSelect label="Pool Enclosure" value={formData.enclosure} onChange={v => setF('enclosure', v)} options={[
                { value: 'fully_screened', label: 'Fully screened' },
                { value: 'unscreened', label: 'Not screened' },
                { value: 'indoor', label: 'Indoor' }
              ]} />
              {formData.enclosure === 'unscreened' && (
                <FieldSelect label="Trees overhead?" value={formData.treesOverhead} onChange={v => setF('treesOverhead', v)} options={[
                  { value: 'yes', label: 'Yes' },
                  { value: 'no', label: 'No' },
                  { value: 'not_sure', label: 'Not sure' }
                ]} />
              )}
              <FieldSelect label="Filter Type" value={formData.filterType} onChange={v => setF('filterType', v)} options={[
                { value: 'sand', label: 'Sand' },
                { value: 'cartridge', label: 'Cartridge' },
                { value: 'de', label: 'DE (Diatomaceous Earth)' },
                { value: 'not_sure', label: 'Not sure' }
              ]} />
            </>
          )}

          {/* STEP 2 */}
          {step === 2 && (
            <>
              <FieldSelect label="Chlorination Method" value={formData.chlorinationMethod} onChange={v => setF('chlorinationMethod', v)} options={[
                { value: 'saltwater', label: 'Saltwater System' },
                { value: 'tablets', label: 'Chlorine Tablets' },
                { value: 'liquid_chlorine', label: 'Liquid Chlorine' },
                { value: 'mineral_alternative', label: 'Mineral/Alternative' },
                { value: 'not_sure', label: 'Not sure' }
              ]} />
              {formData.chlorinationMethod === 'tablets' && (
                <FieldSelect label="Tablet Delivery Method" value={formData.chlorinatorType} onChange={v => setF('chlorinatorType', v)} options={[
                  { value: 'inline_plumbed', label: 'Inline/Plumbed-in' },
                  { value: 'offline', label: 'Offline Chlorinator' },
                  { value: 'floating', label: 'Floating Dispenser' },
                  { value: 'skimmer', label: 'In Skimmer' },
                  { value: 'not_sure', label: 'Not sure' }
                ]} />
              )}
              <FieldSelect label="Pool Usage Frequency" value={formData.useFrequency} onChange={v => setF('useFrequency', v)} options={[
                { value: 'rarely', label: 'Rarely' },
                { value: 'weekends', label: 'Weekends' },
                { value: 'several_week', label: 'Several times/week' },
                { value: 'daily', label: 'Daily' }
              ]} />
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <Checkbox id="pets" checked={formData.petsAccess}
                    onCheckedChange={v => setFormData(f => ({ ...f, petsAccess: v, petSwimFrequency: v ? f.petSwimFrequency : 'never' }))} />
                  <Label htmlFor="pets" className="cursor-pointer font-normal">Pets have pool access</Label>
                </div>
                {formData.petsAccess && (
                  <div className="ml-6">
                    <FieldSelect label="Do pets swim in pool?" value={formData.petSwimFrequency} onChange={v => setF('petSwimFrequency', v)} options={[
                      { value: 'never', label: 'Never' },
                      { value: 'rarely', label: 'Rarely' },
                      { value: 'occasionally', label: 'Occasionally' },
                      { value: 'frequently', label: 'Frequently' }
                    ]} />
                  </div>
                )}
              </div>
              <FieldSelect label="Current Pool Condition" value={formData.poolCondition} onChange={v => setF('poolCondition', v)} options={[
                { value: 'clear', label: 'Clear' },
                { value: 'slightly_cloudy', label: 'Slightly Cloudy' },
                { value: 'green_algae', label: 'Green / Algae' },
                { value: 'recently_treated', label: 'Recently Treated' },
                { value: 'not_sure', label: 'Not sure' }
              ]} />
              {formData.poolCondition === 'green_algae' && (
                <FieldSelect label="Algae Severity" value={formData.greenPoolSeverity} onChange={v => setF('greenPoolSeverity', v)} options={[
                  { value: 'light', label: 'Light (slightly green, can see floor)' },
                  { value: 'moderate', label: 'Moderate (green, limited visibility)' },
                  { value: 'black_swamp', label: 'Heavy (black swamp)' },
                  { value: 'not_sure', label: 'Not sure' }
                ]} />
              )}
              <div>
                <Label className="font-medium mb-2 block">Known Issues</Label>
                <div className="space-y-2">
                  {[
                    { id: 'algae_problems', label: 'Algae problems' },
                    { id: 'staining', label: 'Staining' },
                    { id: 'equipment_concerns', label: 'Equipment concerns' },
                    { id: 'leaks', label: 'Leaks' },
                    { id: 'none_known', label: 'None known' }
                  ].map(issue => (
                    <div key={issue.id} className="flex items-center gap-2">
                      <Checkbox id={issue.id} checked={formData.knownIssues.includes(issue.id)} onCheckedChange={() => toggleKnownIssue(issue.id)} />
                      <Label htmlFor={issue.id} className="cursor-pointer font-normal">{issue.label}</Label>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* STEP 3 — Contact (persist path only) */}
          {step === 3 && persistQuote && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>First Name *</Label>
                  <Input value={formData.clientFirstName} onChange={e => setF('clientFirstName', e.target.value)} placeholder="John" className="mt-1.5" />
                </div>
                <div>
                  <Label>Last Name</Label>
                  <Input value={formData.clientLastName} onChange={e => setF('clientLastName', e.target.value)} placeholder="Doe" className="mt-1.5" />
                </div>
              </div>
              <div>
                <Label>Email *</Label>
                <Input type="email" value={formData.clientEmail} onChange={e => setF('clientEmail', e.target.value)} placeholder="your@email.com" className="mt-1.5" />
              </div>
              <div>
                <Label>Phone (Optional)</Label>
                <Input type="tel" value={formData.clientPhone} onChange={e => setF('clientPhone', e.target.value)} placeholder="(555) 000-0000" className="mt-1.5" />
              </div>
            </>
          )}

          {/* Navigation */}
          <div className="flex gap-3 pt-4 border-t">
            <Button variant="outline" onClick={() => setStep(s => s - 1)} disabled={step === 1} className="flex-1">Back</Button>
            {step < totalSteps ? (
              <Button onClick={() => setStep(s => s + 1)} disabled={!stepValid()} className="flex-1 bg-teal-600 hover:bg-teal-700">Next</Button>
            ) : (
              <Button
                onClick={() => calculateMutation.mutate()}
                disabled={!stepValid() || calculateMutation.isPending}
                className="flex-1 bg-teal-600 hover:bg-teal-700"
              >
                {calculateMutation.isPending ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Calculating...</>
                ) : (
                  'Get My Quote'
                )}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function FieldSelect({ label, value, onChange, options }) {
  return (
    <div>
      <Label className="mb-1.5 block">{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger><SelectValue placeholder={`Select ${label.toLowerCase()}`} /></SelectTrigger>
        <SelectContent>
          {options.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}