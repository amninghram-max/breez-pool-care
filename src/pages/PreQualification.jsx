import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertCircle, Loader2, Check, RefreshCw } from 'lucide-react';
import { createPageUrl } from '@/utils';

const LAST_ANSWERS_KEY = 'breez_last_quote_answers';

const DEFAULT_FORM = {
  poolSize: '', poolType: '', spaPresent: '', enclosure: '', treesOverhead: '',
  filterType: '', chlorinationMethod: '', chlorinatorType: '', useFrequency: '',
  petsAccess: false, petSwimFrequency: 'never', poolCondition: '', greenPoolSeverity: '',
  knownIssues: [], clientFirstName: '', clientLastName: '', clientEmail: '', clientPhone: ''
};

export default function PreQualification() {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [quoteResult, setQuoteResult] = useState(null);
  const [quoteId, setQuoteId] = useState(null);
  const [expiresAt, setExpiresAt] = useState(null);
  const [error, setError] = useState(null);
  const [hasSavedAnswers, setHasSavedAnswers] = useState(false);

  const [formData, setFormData] = useState(DEFAULT_FORM);

  useEffect(() => {
    const saved = localStorage.getItem(LAST_ANSWERS_KEY);
    if (saved) setHasSavedAnswers(true);
  }, []);

  const toggleMultiSelect = (field, value) => {
    setFormData(prev => {
      const arr = prev[field] || [];
      if (arr.includes(value)) {
        return { ...prev, [field]: arr.filter(v => v !== value) };
      }
      return { ...prev, [field]: [...arr, value] };
    });
  };

  const reuseLastAnswers = () => {
    const saved = localStorage.getItem(LAST_ANSWERS_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      // Keep contact info blank so customer re-enters; restore pool answers only
      setFormData({ ...parsed, clientFirstName: '', clientLastName: '', clientEmail: '', clientPhone: '' });
    }
  };

  const calculateQuoteMutation = useMutation({
    mutationFn: async () => {
      setLoading(true);
      // Save pool answers for future "reuse" (exclude contact info)
      const { clientFirstName, clientLastName, clientEmail, clientPhone, ...poolAnswers } = formData;
      localStorage.setItem(LAST_ANSWERS_KEY, JSON.stringify(poolAnswers));

      const response = await base44.functions.invoke('calculateQuote', {
        questionnaireData: formData
      });
      return response.data;
    },
    onSuccess: (data) => {
      setQuoteResult(data.quote);
      setQuoteId(data.quoteId);
      setExpiresAt(data.expiresAt);
      setError(null);
      setStep(4);
      setLoading(false);
    },
    onError: (err) => {
      setError(err.message || 'Failed to calculate quote');
      setLoading(false);
    }
  });

  const handleNext = () => {
    if (step < 3) {
      setStep(step + 1);
    }
  };

  const handlePrev = () => {
    if (step > 1) {
      setStep(step - 1);
    }
  };

  const handleCalculate = () => {
    calculateQuoteMutation.mutate();
  };

  const stepIsValid = () => {
    if (step === 1) {
      let baseValid = formData.poolSize && formData.poolType && formData.spaPresent && formData.enclosure;
      // If unscreened, require trees question
      if (formData.enclosure === 'unscreened') {
        return baseValid && formData.treesOverhead;
      }
      return baseValid;
    }
    if (step === 2) {
      let baseValid = formData.filterType && formData.chlorinationMethod && formData.useFrequency && formData.poolCondition;
      // If green algae, require severity
      if (formData.poolCondition === 'green_algae') {
        return baseValid && formData.greenPoolSeverity;
      }
      return baseValid;
    }
    if (step === 3) {
      return formData.clientFirstName && formData.clientEmail;
    }
    return true;
  };

  if (quoteResult) {
    return <QuoteDisplay quote={quoteResult} quoteId={quoteId} expiresAt={expiresAt} formData={formData} />;
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6 py-8">
      {/* Header */}
      <div className="space-y-2">
        <h1 className="text-3xl font-bold text-gray-900">Get Your Free Quote</h1>
        <p className="text-gray-600">Answer a few quick questions about your pool</p>
      </div>

      {error && (
        <Card className="bg-red-50 border-red-200">
          <CardContent className="pt-6 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-red-900">Error</p>
              <p className="text-sm text-red-800 mt-1">{error}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Progress */}
      <div className="flex gap-2">
        {[1, 2, 3].map(s => (
          <button
            key={s}
            onClick={() => s <= step && setStep(s)}
            className={`flex-1 h-2 rounded-full transition-colors ${
              s <= step ? 'bg-teal-600' : 'bg-gray-200'
            }`}
          />
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            {step === 1 && 'Pool Details'}
            {step === 2 && 'Pool Features & Condition'}
            {step === 3 && 'Your Contact Information'}
          </CardTitle>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* STEP 1: POOL DETAILS */}
          {step === 1 && (
            <div className="space-y-6">
              <div>
                <Label>Pool Size (Gallons)</Label>
                <Select value={formData.poolSize} onValueChange={(v) => setFormData({ ...formData, poolSize: v })}>
                  <SelectTrigger className="mt-2">
                    <SelectValue placeholder="Select pool size" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="10_15k">10k - 15k gallons</SelectItem>
                    <SelectItem value="15_20k">15k - 20k gallons</SelectItem>
                    <SelectItem value="20_30k">20k - 30k gallons</SelectItem>
                    <SelectItem value="30k_plus">30k+ gallons</SelectItem>
                    <SelectItem value="not_sure">Not sure</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>What type of pool do you have?</Label>
                <Select value={formData.poolType} onValueChange={(v) => setFormData({ ...formData, poolType: v })}>
                  <SelectTrigger className="mt-2">
                    <SelectValue placeholder="Select pool type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="in_ground">In-ground</SelectItem>
                    <SelectItem value="above_ground">Above-ground</SelectItem>
                    <SelectItem value="not_sure">Not sure</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Does your pool include a spa or hot tub?</Label>
                <Select value={formData.spaPresent} onValueChange={(v) => setFormData({ ...formData, spaPresent: v })}>
                  <SelectTrigger className="mt-2">
                    <SelectValue placeholder="Select option" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="true">Yes</SelectItem>
                    <SelectItem value="false">No</SelectItem>
                    <SelectItem value="unknown">Not sure</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Is your pool area screened?</Label>
                <Select value={formData.enclosure} onValueChange={(v) => setFormData({ ...formData, enclosure: v })}>
                  <SelectTrigger className="mt-2">
                    <SelectValue placeholder="Select option" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fully_screened">Fully screened</SelectItem>
                    <SelectItem value="unscreened">Not screened</SelectItem>
                    <SelectItem value="indoor">Indoor</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {formData.enclosure === 'unscreened' && (
                <div>
                  <Label>Are there trees overhead?</Label>
                  <Select value={formData.treesOverhead} onValueChange={(v) => setFormData({ ...formData, treesOverhead: v })}>
                    <SelectTrigger className="mt-2">
                      <SelectValue placeholder="Select option" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="yes">Yes</SelectItem>
                      <SelectItem value="no">No</SelectItem>
                      <SelectItem value="not_sure">Not sure</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div>
                <Label>Filter Type</Label>
                <Select value={formData.filterType} onValueChange={(v) => setFormData({ ...formData, filterType: v })}>
                  <SelectTrigger className="mt-2">
                    <SelectValue placeholder="Select filter type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sand">Sand</SelectItem>
                    <SelectItem value="cartridge">Cartridge</SelectItem>
                    <SelectItem value="de">Diatomaceous Earth (DE)</SelectItem>
                    <SelectItem value="not_sure">Not Sure</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {/* STEP 2: FEATURES & CONDITION */}
          {step === 2 && (
            <div className="space-y-6">
              <div>
                <Label>Chlorination Method</Label>
                <Select value={formData.chlorinationMethod} onValueChange={(v) => setFormData({ ...formData, chlorinationMethod: v })}>
                  <SelectTrigger className="mt-2">
                    <SelectValue placeholder="Select method" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="saltwater">Saltwater System</SelectItem>
                    <SelectItem value="tablets">Chlorine Tablets</SelectItem>
                    <SelectItem value="liquid_chlorine">Liquid Chlorine</SelectItem>
                    <SelectItem value="mineral_alternative">Mineral/Alternative</SelectItem>
                    <SelectItem value="not_sure">Not Sure</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {formData.chlorinationMethod === 'tablets' && (
                <div>
                  <Label>How are tablets delivered?</Label>
                  <Select value={formData.chlorinatorType} onValueChange={(v) => setFormData({ ...formData, chlorinatorType: v })}>
                    <SelectTrigger className="mt-2">
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="inline_plumbed">Inline/Plumbed-in Chlorinator</SelectItem>
                      <SelectItem value="offline">Offline Chlorinator</SelectItem>
                      <SelectItem value="floating">Floating Dispenser</SelectItem>
                      <SelectItem value="skimmer">Directly in Skimmer</SelectItem>
                      <SelectItem value="not_sure">Not Sure</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div>
                <Label>Pool Usage Frequency</Label>
                <Select value={formData.useFrequency} onValueChange={(v) => setFormData({ ...formData, useFrequency: v })}>
                  <SelectTrigger className="mt-2">
                    <SelectValue placeholder="Select frequency" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="rarely">Rarely</SelectItem>
                    <SelectItem value="weekends">Weekends</SelectItem>
                    <SelectItem value="several_week">Several times per week</SelectItem>
                    <SelectItem value="daily">Daily</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="border-t pt-6">
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <Checkbox
                      id="pets"
                      checked={formData.petsAccess}
                      onCheckedChange={(checked) => setFormData({ ...formData, petsAccess: checked, petSwimFrequency: checked ? formData.petSwimFrequency : 'never' })}
                    />
                    <Label htmlFor="pets" className="cursor-pointer font-normal">Pets have pool access</Label>
                  </div>

                  {formData.petsAccess && (
                    <div className="ml-6">
                      <Label>Do pets swim in the pool?</Label>
                      <Select value={formData.petSwimFrequency} onValueChange={(v) => setFormData({ ...formData, petSwimFrequency: v })}>
                        <SelectTrigger className="mt-2">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="never">Never</SelectItem>
                          <SelectItem value="rarely">Rarely</SelectItem>
                          <SelectItem value="occasionally">Occasionally</SelectItem>
                          <SelectItem value="frequently">Frequently</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
              </div>

              <div>
                <Label>Current Pool Condition</Label>
                <Select value={formData.poolCondition} onValueChange={(v) => setFormData({ ...formData, poolCondition: v })}>
                  <SelectTrigger className="mt-2">
                    <SelectValue placeholder="Select condition" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="clear">Clear</SelectItem>
                    <SelectItem value="slightly_cloudy">Slightly Cloudy</SelectItem>
                    <SelectItem value="green_algae">Green/Algae</SelectItem>
                    <SelectItem value="recently_treated">Recently Treated</SelectItem>
                    <SelectItem value="not_sure">Not Sure</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {formData.poolCondition === 'green_algae' && (
                <div className="border-t pt-6 bg-red-50 p-4 rounded-lg">
                  <Label className="font-semibold mb-3 block text-red-900">Green Pool Recovery</Label>
                  <div className="space-y-4">
                    <div>
                      <Label className="text-sm">How severe is the algae?</Label>
                      <Select value={formData.greenPoolSeverity} onValueChange={(v) => setFormData({ ...formData, greenPoolSeverity: v })}>
                        <SelectTrigger className="mt-2">
                          <SelectValue placeholder="Select severity" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="light">Light (slightly green, can see floor)</SelectItem>
                          <SelectItem value="moderate">Moderate (green, limited visibility)</SelectItem>
                          <SelectItem value="black_swamp">Heavy (black swamp, cannot see floor)</SelectItem>
                          <SelectItem value="not_sure">Not sure</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              )}

              <div className="border-t pt-6">
                <Label className="font-semibold mb-3 block">Known Issues (select all that apply)</Label>
                <div className="space-y-3">
                  {[
                    { id: 'algae_problems', label: 'Algae problems' },
                    { id: 'staining', label: 'Staining' },
                    { id: 'equipment_concerns', label: 'Equipment concerns' },
                    { id: 'leaks', label: 'Leaks' },
                    { id: 'none_known', label: 'None known' }
                  ].map(issue => (
                    <div key={issue.id} className="flex items-center gap-3">
                      <Checkbox
                        id={issue.id}
                        checked={formData.knownIssues.includes(issue.id)}
                        onCheckedChange={() => toggleMultiSelect('knownIssues', issue.id)}
                      />
                      <Label htmlFor={issue.id} className="cursor-pointer font-normal">{issue.label}</Label>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* STEP 3: CONTACT INFO (NO ACCESS QUESTIONS) */}
          {step === 3 && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>First Name</Label>
                  <Input
                    value={formData.clientFirstName || ''}
                    onChange={(e) => setFormData({ ...formData, clientFirstName: e.target.value })}
                    placeholder="John"
                    className="mt-2"
                  />
                </div>
                <div>
                  <Label>Last Name (Optional)</Label>
                  <Input
                    value={formData.clientLastName || ''}
                    onChange={(e) => setFormData({ ...formData, clientLastName: e.target.value })}
                    placeholder="Doe"
                    className="mt-2"
                  />
                </div>
              </div>

              <div>
                <Label>Email</Label>
                <Input
                  type="email"
                  value={formData.clientEmail}
                  onChange={(e) => setFormData({ ...formData, clientEmail: e.target.value })}
                  placeholder="your@email.com"
                  className="mt-2"
                />
              </div>

              <div>
                <Label>Phone (Optional)</Label>
                <Input
                  type="tel"
                  value={formData.clientPhone}
                  onChange={(e) => setFormData({ ...formData, clientPhone: e.target.value })}
                  placeholder="(555) 000-0000"
                  className="mt-2"
                />
              </div>
            </div>
          )}

          {/* BUTTONS */}
          <div className="flex gap-3 pt-6 border-t">
            <Button
              variant="outline"
              onClick={handlePrev}
              disabled={step === 1}
              className="flex-1"
            >
              Back
            </Button>

            {step < 3 ? (
              <Button
                onClick={handleNext}
                disabled={!stepIsValid()}
                className="flex-1 bg-teal-600 hover:bg-teal-700"
              >
                Next
              </Button>
            ) : (
              <Button
                onClick={handleCalculate}
                disabled={!stepIsValid() || loading}
                className="flex-1 bg-teal-600 hover:bg-teal-700"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Calculating...
                  </>
                ) : (
                  'Get Quote'
                )}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function QuoteDisplay({ quote, formData }) {
  const { data: user } = useQuery({
    queryKey: ['user'],
    queryFn: async () => {
      try {
        return await base44.auth.me();
      } catch {
        return null;
      }
    },
  });

  const isStaffOrAdmin = user && ['admin', 'staff'].includes(user.role);
  const [showInternalBreakdown, setShowInternalBreakdown] = React.useState(false);

  const handleContinueToSetup = async () => {
    // Store quote data for onboarding
    localStorage.setItem('quoteData', JSON.stringify({
      quote,
      formData,
      timestamp: new Date().toISOString()
    }));

    // Navigate to onboarding (inspection scheduling)
    window.location.href = createPageUrl('Onboarding');
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6 py-8">
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center">
            <Check className="w-5 h-5 text-emerald-600" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900">Your Service Plan</h1>
        </div>
        <p className="text-gray-600">Simple pricing. All chemicals included.</p>
      </div>

      {/* Auto-required frequency notice */}
      {quote.frequencyAutoRequired && (
        <Card className="bg-blue-50 border-blue-200">
          <CardContent className="pt-6">
            <p className="text-sm text-blue-900 font-medium">
              💡 Based on your pool's needs, we recommend <strong>twice-weekly service</strong> for best results.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Clean Customer Pricing */}
      <Card className="bg-gradient-to-br from-teal-50 to-blue-50 border-teal-200">
        <CardContent className="pt-6 space-y-6">
          <div className="text-center">
            <p className="text-sm text-gray-600 font-medium">Monthly Service</p>
            <p className="text-5xl font-bold text-gray-900 mt-3">${quote.estimatedMonthlyPrice.toFixed(2)}</p>
            <p className="text-sm text-gray-600 mt-2">
              {quote.frequencySelectedOrRequired === 'weekly' ? 'Weekly visits' : 'Twice per week visits'}
            </p>
          </div>

          <div className="border-t pt-4 text-center">
            <p className="text-sm text-gray-600 font-medium">Per Visit</p>
            <p className="text-2xl font-bold text-gray-900 mt-2">${quote.estimatedPerVisitPrice.toFixed(2)}</p>
          </div>

          {quote.estimatedOneTimeFees > 0 && (
            <div className="border-t pt-4 text-center">
              <p className="text-sm text-gray-600 font-medium">One-Time Setup</p>
              <p className="text-2xl font-bold text-teal-700 mt-2">${quote.estimatedOneTimeFees.toFixed(2)}</p>
              <p className="text-xs text-gray-500 mt-1">Water balancing & recovery</p>
            </div>
          )}

          {quote.autopayDiscountAmount > 0 && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 mt-4">
              <p className="text-sm text-green-900 font-medium">
                💰 Enroll in AutoPay during activation and save ${quote.autopayDiscountAmount}/month
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* What's Included */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">What's Included</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-3">
            {[
              'All chemicals included',
              'Water testing & balancing',
              'Brushing & vacuuming',
              'Debris removal',
              'Skimmer & filter check/cleaning',
              'Digital service reports'
            ].map((item, i) => (
              <li key={i} className="flex items-center gap-3">
                <Check className="w-5 h-5 text-teal-600 flex-shrink-0" />
                <span className="text-gray-700">{item}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {/* Continue CTA */}
      <Card className="bg-gradient-to-r from-teal-600 to-blue-600 text-white border-0">
        <CardContent className="pt-6 text-center">
          <h3 className="text-2xl font-bold mb-2">Ready to get started?</h3>
          <p className="text-teal-50 mb-6">Schedule your free pool inspection</p>
          <Button 
            onClick={handleContinueToSetup}
            size="lg"
            className="bg-white text-teal-600 hover:bg-gray-100 text-lg px-8 py-6"
          >
            Continue to Schedule Your Free Inspection
          </Button>
        </CardContent>
      </Card>

      {/* Staff/Admin Internal Breakdown */}
      {isStaffOrAdmin && (
        <Card className="border-amber-200 bg-amber-50">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-amber-900">Internal Breakdown (Staff/Admin Only)</CardTitle>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowInternalBreakdown(!showInternalBreakdown)}
              >
                {showInternalBreakdown ? 'Hide' : 'Show'} Details
              </Button>
            </div>
          </CardHeader>
          {showInternalBreakdown && (
            <CardContent className="space-y-4">
              <div>
                <p className="text-sm font-semibold text-amber-900 mb-2">Pricing Components</p>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span>Size Tier:</span>
                    <span className="font-bold">{quote.sizeTier.toUpperCase()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Base Monthly:</span>
                    <span className="font-bold">${quote.baseMonthly.toFixed(2)}</span>
                  </div>
                </div>
              </div>

              {quote.additiveTokensApplied?.length > 0 && (
                <div>
                  <p className="text-sm font-semibold text-amber-900 mb-2">Additive Tokens</p>
                  <div className="space-y-1 text-sm">
                    {quote.additiveTokensApplied.map((token, i) => (
                      <div key={i} className="flex justify-between">
                        <span>{token.token_name}:</span>
                        <span className="font-bold">+${token.amount.toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <p className="text-sm font-semibold text-amber-900 mb-2">Risk Engine (Admin-Only)</p>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span>Raw Risk:</span>
                    <span className="font-bold">{quote.rawRisk.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Adjusted Risk:</span>
                    <span className="font-bold">{quote.adjustedRisk.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Risk Bracket:</span>
                    <span className="font-bold">{quote.riskBracket}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Risk Add-on:</span>
                    <span className="font-bold">+${quote.riskAddonAmount.toFixed(2)}</span>
                  </div>
                </div>
              </div>

              <div>
                <p className="text-sm font-semibold text-amber-900 mb-2">Frequency</p>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span>Selected/Required:</span>
                    <span className="font-bold">{quote.frequencySelectedOrRequired.replace('_', ' ')}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Multiplier:</span>
                    <span className="font-bold">{quote.frequencyMultiplier}x</span>
                  </div>
                  {quote.frequencyAutoRequired && (
                    <p className="text-xs text-amber-800 mt-2">⚠️ Auto-required (risk ≥ 9)</p>
                  )}
                </div>
              </div>

              <div>
                <p className="text-sm font-semibold text-amber-900 mb-2">Quote Logic</p>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span>Version:</span>
                    <span className="font-bold">{quote.quoteLogicVersionId}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Final Monthly:</span>
                    <span className="font-bold">${quote.finalMonthlyPrice.toFixed(2)}</span>
                  </div>
                </div>
              </div>
            </CardContent>
          )}
        </Card>
      )}

      <div className="flex gap-3">
        <Button variant="outline" className="flex-1" onClick={() => window.history.back()}>
          Modify Answers
        </Button>
      </div>
    </div>
  );
}