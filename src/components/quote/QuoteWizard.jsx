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

      if (persistQuote) {
        // Persist: call calculateQuote to create Quote record
        const res = await base44.functions.invoke('calculateQuote', { questionnaireData: formData });
        return res.data;
      } else {
        // Estimate: call calculateQuoteOnly (no persistence)
        const res = await base44.functions.invoke('calculateQuoteOnly', { questionnaireData: formData });
        return res.data;
      }
    },
    onSuccess: (data) => {
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
    if (step === 3) return formData.clientFirstName && formData.clientEmail;
    return true;
  };

  const totalSteps = 3;

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

      {calculateMutation.isError && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-800">
          <AlertCircle className="w-4 h-4" />
          {calculateMutation.error?.message || 'Failed to calculate quote. Please try again.'}
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

          {/* STEP 3 — Contact */}
          {step === 3 && (
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