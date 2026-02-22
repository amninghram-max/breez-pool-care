import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertCircle, Loader2, Check } from 'lucide-react';
import { createPageUrl } from '@/utils';

export default function PreQualification() {
  const [step, setStep] = useState(1);
      const [loading, setLoading] = useState(false);
      const [quoteResult, setQuoteResult] = useState(null);
      const [error, setError] = useState(null);

      const { data: adminSettings } = useQuery({
    queryKey: ['adminSettings'],
    queryFn: () => base44.asServiceRole.entities.AdminSettings.filter({ settingKey: 'default' }),
  });

  const isStormModeActive = adminSettings?.[0]?.stormRecovery?.modeActive || false;

  const [formData, setFormData] = useState({
        poolSize: '',
        poolType: '',
        spaPresent: '',
        enclosure: '',
        filterType: '',
        chlorinationMethod: '',
        chlorinatorType: '',
        useFrequency: '',
        petsAccess: false,
        petSwimFrequency: 'none',
        environmentalFactors: [],
        poolCondition: '',
        greenPoolGreenness: '',
        greenPoolDebris: '',
        greenPoolDuration: '',
        greenPoolPumpRunning: false,
        knownIssues: [],
        equipment: [],
        accessType: '',
        accessNotes: '',
        clientFirstName: '',
        clientLastName: '',
        clientEmail: '',
        clientPhone: '',
        clientSelectedFrequency: 'weekly',
        biweeklyAcknowledged: false,
        stormDebrisLevel: '',
        stormWaterCondition: '',
        stormEquipmentConcerns: 'no'
      });

  const toggleMultiSelect = (field, value) => {
    setFormData(prev => {
      const arr = prev[field] || [];
      if (arr.includes(value)) {
        return { ...prev, [field]: arr.filter(v => v !== value) };
      }
      return { ...prev, [field]: [...arr, value] };
    });
  };

  const calculateQuoteMutation = useMutation({
    mutationFn: async () => {
      setLoading(true);
      const response = await base44.functions.invoke('calculateQuote', {
        questionnaireData: formData
      });
      return response.data;
    },
    onSuccess: (data) => {
      setQuoteResult(data.quote);
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
      return formData.poolSize && formData.poolType && formData.spaPresent && formData.enclosure;
    }
    if (step === 2) {
      let baseValid = formData.filterType && formData.chlorinationMethod && formData.useFrequency && formData.poolCondition;
      // If green algae, require green pool follow-ups
      if (formData.poolCondition === 'green_algae') {
        return baseValid && formData.greenPoolGreenness && formData.greenPoolDebris && formData.greenPoolDuration;
      }
      return baseValid;
    }
    if (step === 3) {
      let baseValid = formData.clientFirstName && formData.clientLastName && formData.clientEmail && formData.accessType;
      // If biweekly selected but frequency might be recommended weekly, require acknowledgment
      if (formData.clientSelectedFrequency === 'biweekly') {
        return baseValid && formData.biweeklyAcknowledged;
      }
      return baseValid;
    }
    return true;
  };

  if (quoteResult) {
    return <QuoteDisplay quote={quoteResult} formData={formData} />;
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="space-y-2">
        <h1 className="text-3xl font-bold text-gray-900">Pool Pre-Qualification</h1>
        <p className="text-gray-600">Let's learn about your pool and get an instant quote</p>
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
            {step === 2 && 'Pool Condition & Features'}
            {step === 3 && 'Contact & Access Info'}
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
                    <SelectItem value="under_10k">Under 10k gallons</SelectItem>
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
                <Label>Enclosure</Label>
                <Select value={formData.enclosure} onValueChange={(v) => setFormData({ ...formData, enclosure: v })}>
                  <SelectTrigger className="mt-2">
                    <SelectValue placeholder="Select enclosure type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fully_screened">Fully Screened</SelectItem>
                    <SelectItem value="partially_screened">Partially Screened</SelectItem>
                    <SelectItem value="unscreened">Unscreened</SelectItem>
                    <SelectItem value="indoor">Indoor</SelectItem>
                  </SelectContent>
                </Select>
              </div>

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

          {/* STEP 2: CONDITION & FEATURES */}
          {step === 2 && (
            <div className="space-y-6">
              <div>
                <Label>Chlorination Method</Label>
                <Select value={formData.chlorinationMethod} onValueChange={(v) => setFormData({ ...formData, chlorinationMethod: v })}>
                  <SelectTrigger className="mt-2">
                    <SelectValue placeholder="Select method" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="saltwater">Saltwater</SelectItem>
                    <SelectItem value="tablets">Chlorine Tablets</SelectItem>
                    <SelectItem value="liquid_chlorine">Liquid Chlorine</SelectItem>
                    <SelectItem value="mineral_alternative">Mineral/Alternative</SelectItem>
                    <SelectItem value="not_sure">Not Sure</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {formData.chlorinationMethod === 'tablets' && (
                <div>
                  <Label>Chlorinator Type</Label>
                  <Select value={formData.chlorinatorType} onValueChange={(v) => setFormData({ ...formData, chlorinatorType: v })}>
                    <SelectTrigger className="mt-2">
                      <SelectValue placeholder="Select chlorinator" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="inline_plumbed">Inline/Plumbed-in</SelectItem>
                      <SelectItem value="offline">Offline</SelectItem>
                      <SelectItem value="floating">Floating</SelectItem>
                      <SelectItem value="skimmer">Skimmer</SelectItem>
                      <SelectItem value="not_sure">Not Sure</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

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

{formData.poolCondition === 'green_algae' && (
                <div className="border-t pt-6 bg-red-50 p-4 rounded-lg">
                  <Label className="font-semibold mb-3 block text-red-900">Green Pool Details</Label>
                  <div className="space-y-4">
                    <div>
                      <Label className="text-sm">How green is it?</Label>
                      <Select value={formData.greenPoolGreenness} onValueChange={(v) => setFormData({ ...formData, greenPoolGreenness: v })}>
                        <SelectTrigger className="mt-2">
                          <SelectValue placeholder="Select greenness level" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="light_green">Light green (can see bottom)</SelectItem>
                          <SelectItem value="medium_green">Medium green (bottom barely visible)</SelectItem>
                          <SelectItem value="dark_green">Dark green (bottom not visible)</SelectItem>
                          <SelectItem value="not_sure">Not sure</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label className="text-sm">Visible debris level?</Label>
                      <Select value={formData.greenPoolDebris} onValueChange={(v) => setFormData({ ...formData, greenPoolDebris: v })}>
                        <SelectTrigger className="mt-2">
                          <SelectValue placeholder="Select debris level" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="low">Low</SelectItem>
                          <SelectItem value="medium">Medium</SelectItem>
                          <SelectItem value="heavy">Heavy</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label className="text-sm">How long has it been green?</Label>
                      <Select value={formData.greenPoolDuration} onValueChange={(v) => setFormData({ ...formData, greenPoolDuration: v })}>
                        <SelectTrigger className="mt-2">
                          <SelectValue placeholder="Select duration" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="less_than_1_week">&lt; 1 week</SelectItem>
                          <SelectItem value="1_to_4_weeks">1–4 weeks</SelectItem>
                          <SelectItem value="more_than_4_weeks">&gt; 4 weeks</SelectItem>
                          <SelectItem value="not_sure">Not sure</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="flex items-center gap-3 pt-2">
                      <Checkbox
                        id="pump_running"
                        checked={formData.greenPoolPumpRunning}
                        onCheckedChange={(checked) => setFormData({ ...formData, greenPoolPumpRunning: checked })}
                      />
                      <Label htmlFor="pump_running" className="cursor-pointer font-normal text-sm">Pump is running daily</Label>
                    </div>
                  </div>
                </div>
              )}

              <div className="border-t pt-6">
                <Label className="font-semibold mb-3 block">Environmental Factors</Label>
                <div className="space-y-3">
                  {[
                    { id: 'trees_overhead', label: 'Trees overhead' },
                    { id: 'heavy_debris', label: 'Heavy debris/leaves' },
                    { id: 'frequent_pollen', label: 'Frequent pollen' },
                    { id: 'waterfront', label: 'Waterfront property' },
                    { id: 'construction_nearby', label: 'Construction nearby' }
                  ].map(factor => (
                    <div key={factor.id} className="flex items-center gap-3">
                      <Checkbox
                        id={factor.id}
                        checked={formData.environmentalFactors.includes(factor.id)}
                        onCheckedChange={() => toggleMultiSelect('environmentalFactors', factor.id)}
                      />
                      <Label htmlFor={factor.id} className="cursor-pointer font-normal">{factor.label}</Label>
                    </div>
                  ))}
                </div>
              </div>

              <div className="border-t pt-6">
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <Checkbox
                      id="pets"
                      checked={formData.petsAccess}
                      onCheckedChange={(checked) => setFormData({ ...formData, petsAccess: checked })}
                    />
                    <Label htmlFor="pets" className="cursor-pointer font-normal">Pets have pool access</Label>
                  </div>

                  {formData.petsAccess && (
                    <div className="ml-6">
                      <Label>How often do pets swim?</Label>
                      <Select value={formData.petSwimFrequency} onValueChange={(v) => setFormData({ ...formData, petSwimFrequency: v })}>
                        <SelectTrigger className="mt-2">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="rarely">Rarely</SelectItem>
                          <SelectItem value="occasionally">Occasionally</SelectItem>
                          <SelectItem value="frequently">Frequently</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
              </div>

              <div className="border-t pt-6">
                <Label className="font-semibold mb-3 block">Known Issues</Label>
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

              <div className="border-t pt-6">
                <Label className="font-semibold mb-3 block">Equipment & Features</Label>
                <div className="space-y-3">
                  {[
                    { id: 'heater', label: 'Heater' },
                    { id: 'spa', label: 'Spa' },
                    { id: 'water_features', label: 'Water features (fountain, etc)' },
                    { id: 'automatic_cleaner', label: 'Automatic cleaner' },
                    { id: 'variable_speed_pump', label: 'Variable-speed pump' },
                    { id: 'automation_system', label: 'Automation system' }
                  ].map(equip => (
                    <div key={equip.id} className="flex items-center gap-3">
                      <Checkbox
                        id={equip.id}
                        checked={formData.equipment.includes(equip.id)}
                        onCheckedChange={() => toggleMultiSelect('equipment', equip.id)}
                      />
                      <Label htmlFor={equip.id} className="cursor-pointer font-normal">{equip.label}</Label>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* STORM MODE NOTICE */}
          {isStormModeActive && (
            <div className="bg-red-50 border border-red-200 p-4 rounded-lg mb-6">
              <p className="text-sm text-red-900 font-semibold">⚠️ Storm Recovery Mode Active</p>
              <p className="text-sm text-red-800 mt-1">{adminSettings?.[0]?.stormRecovery?.clientNotice}</p>
            </div>
          )}

          {/* STEP 3: CONTACT & ACCESS */}
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
                  <Label>Last Name</Label>
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
                <Label>Phone (optional)</Label>
                <Input
                  type="tel"
                  value={formData.clientPhone}
                  onChange={(e) => setFormData({ ...formData, clientPhone: e.target.value })}
                  placeholder="(555) 000-0000"
                  className="mt-2"
                />
              </div>

              <div>
                <Label>Service Frequency Preference</Label>
                <Select value={formData.clientSelectedFrequency} onValueChange={(v) => setFormData({ ...formData, clientSelectedFrequency: v })}>
                  <SelectTrigger className="mt-2">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="biweekly">Biweekly</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {formData.clientSelectedFrequency === 'biweekly' && (
                <div className="bg-amber-50 border border-amber-200 p-4 rounded-lg">
                  <div className="flex items-start gap-3">
                    <Checkbox
                      id="biweekly_ack"
                      checked={formData.biweeklyAcknowledged}
                      onCheckedChange={(checked) => setFormData({ ...formData, biweeklyAcknowledged: checked })}
                    />
                    <Label htmlFor="biweekly_ack" className="cursor-pointer font-normal text-sm text-amber-900">
                      I understand biweekly service may increase the chance of algae or cloudiness
                    </Label>
                  </div>
                </div>
              )}

              <div>
                <Label>Access Type</Label>
                <Select value={formData.accessType} onValueChange={(v) => setFormData({ ...formData, accessType: v })}>
                  <SelectTrigger className="mt-2">
                    <SelectValue placeholder="Select access type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="no_restrictions">No Restrictions</SelectItem>
                    <SelectItem value="locked_gate">Locked Gate</SelectItem>
                    <SelectItem value="code_required">Code Required</SelectItem>
                    <SelectItem value="hoa_community">HOA/Community</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Access Instructions (gate codes, special notes, etc)</Label>
                <textarea
                  value={formData.accessNotes}
                  onChange={(e) => setFormData({ ...formData, accessNotes: e.target.value })}
                  placeholder="Gate code: 1234, enter through side gate, etc"
                  className="w-full mt-2 p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent resize-none"
                  rows={4}
                />
              </div>

              {/* Storm Recovery Questions */}
              {isStormModeActive && (
                <div className="border-t pt-6 bg-red-50 p-4 rounded-lg">
                  <h4 className="font-semibold text-red-900 mb-4">Post-Storm Cleanup Assessment</h4>

                  <div className="space-y-4">
                    <div>
                      <Label className="text-sm font-medium">Debris Level</Label>
                      <Select value={formData.stormDebrisLevel} onValueChange={(v) => setFormData({ ...formData, stormDebrisLevel: v })}>
                        <SelectTrigger className="mt-2">
                          <SelectValue placeholder="Select debris level" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="light">Light (minor leaves/dirt)</SelectItem>
                          <SelectItem value="moderate">Moderate (visible accumulation)</SelectItem>
                          <SelectItem value="heavy">Heavy (branches, contamination)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label className="text-sm font-medium">Water Condition</Label>
                      <Select value={formData.stormWaterCondition} onValueChange={(v) => setFormData({ ...formData, stormWaterCondition: v })}>
                        <SelectTrigger className="mt-2">
                          <SelectValue placeholder="Select water condition" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="clear">Clear</SelectItem>
                          <SelectItem value="cloudy">Cloudy</SelectItem>
                          <SelectItem value="green">Green/Discolored</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label className="text-sm font-medium">Equipment Concerns?</Label>
                      <Select value={formData.stormEquipmentConcerns} onValueChange={(v) => setFormData({ ...formData, stormEquipmentConcerns: v })}>
                        <SelectTrigger className="mt-2">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="no">No</SelectItem>
                          <SelectItem value="yes">Yes</SelectItem>
                          <SelectItem value="unsure">Not sure</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              )}
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
  const recommendedButNotSelected = quote.recommendedFrequency === 'weekly' && formData.clientSelectedFrequency === 'biweekly';
  const [showInternalBreakdown, setShowInternalBreakdown] = React.useState(false);

  const { data: user } = useQuery({
    queryKey: ['user'],
    queryFn: () => base44.auth.me(),
  });

  const isAdmin = user?.role === 'admin';

  const handleContinueToSetup = () => {
    // Store quote acceptance
    localStorage.setItem('quoteData', JSON.stringify({
      quote,
      formData,
      timestamp: new Date().toISOString()
    }));
    window.location.href = createPageUrl('Onboarding');
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center">
            <Check className="w-5 h-5 text-emerald-600" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900">Your Recommended Service Plan</h1>
        </div>
        <p className="text-gray-600">Simple pricing. No surprises.</p>
      </div>

      {recommendedButNotSelected && (
        <Card className="bg-amber-50 border-amber-200">
          <CardContent className="pt-6">
            <p className="text-sm text-amber-900 font-medium">
              💡 We recommend <strong>weekly service</strong> for your pool, but you selected biweekly. You acknowledged the risks—reach out anytime if algae issues develop.
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
            <p className="text-sm text-gray-600 mt-2">{formData.clientSelectedFrequency === 'weekly' ? 'Weekly visits' : 'Biweekly visits'}</p>
          </div>

          <div className="border-t pt-4 text-center">
            <p className="text-sm text-gray-600 font-medium">Per Visit</p>
            <p className="text-2xl font-bold text-gray-900 mt-2">${quote.estimatedPerVisitPrice.toFixed(2)}</p>
          </div>

          {quote.estimatedOneTimeFees > 0 && (
            <div className="border-t pt-4 text-center">
              <p className="text-sm text-gray-600 font-medium">One-Time Setup</p>
              <p className="text-2xl font-bold text-teal-700 mt-2">${quote.estimatedOneTimeFees.toFixed(2)}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* What's Included */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{"What's Included"}</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-3">
            {[
              'Chemicals included',
              'Water testing & balancing',
              'Brushing & vacuuming',
              'Debris removal',
              'Skimmer & filter check'
            ].map((item, i) => (
              <li key={i} className="flex items-center gap-3">
                <Check className="w-5 h-5 text-teal-600 flex-shrink-0" />
                <span className="text-gray-700">{item}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {/* Continue to Setup CTA */}
      <Card className="bg-gradient-to-r from-teal-600 to-blue-600 text-white border-0">
        <CardContent className="pt-6 text-center">
          <h3 className="text-2xl font-bold mb-2">Ready to get started?</h3>
          <p className="text-teal-50 mb-6">{"Let's schedule your free pool inspection"}</p>
          <Button 
            onClick={handleContinueToSetup}
            size="lg"
            className="bg-white text-teal-600 hover:bg-gray-100 text-lg px-8 py-6"
          >
            Continue to Schedule Your Free Inspection
          </Button>
        </CardContent>
      </Card>

      {/* Admin-Only Internal Breakdown */}
      {isAdmin && (
        <Card className="border-amber-200 bg-amber-50">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-amber-900">Internal Breakdown (Admin Only)</CardTitle>
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
                <p className="text-sm font-semibold text-amber-900 mb-2">Risk Score</p>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-700">Score</span>
                  <span className="font-bold">{quote.riskScore} ({quote.riskLevel})</span>
                </div>
              </div>
              
              <div>
                <p className="text-sm font-semibold text-amber-900 mb-2">Chemical COGS</p>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-700">Monthly Estimate</span>
                  <span className="font-bold">${quote.estimatedMonthlyChemicalCOGS.toFixed(2)}</span>
                </div>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-sm text-gray-700">Demand Index</span>
                  <span className="font-bold">{quote.chemDemandIndex}/100</span>
                </div>
              </div>

              {quote.marginAdjustmentApplied > 0 && (
                <div>
                  <p className="text-sm font-semibold text-amber-900 mb-2">Margin Protection</p>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-700">Adjustment</span>
                    <span className="font-bold">${quote.marginAdjustmentApplied.toFixed(2)}</span>
                  </div>
                  <p className="text-xs text-gray-600 mt-1">{quote.marginAdjustmentReason}</p>
                </div>
              )}

              <div>
                <p className="text-sm font-semibold text-amber-900 mb-2">Gross Margin</p>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-700">Percentage</span>
                  <span className="font-bold">{quote.estimatedGrossMarginPercent}%</span>
                </div>
              </div>

              {quote.priceInfluencers.length > 0 && (
                <div>
                  <p className="text-sm font-semibold text-amber-900 mb-2">Price Factors</p>
                  <ul className="space-y-1">
                    {quote.priceInfluencers.map((factor, i) => (
                      <li key={i} className="text-xs text-gray-700">• {factor}</li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          )}
        </Card>
      )}

      {/* Green Recovery Plan */}
      {quote.greenRecoveryTier !== 'none' && (
        <Card className="bg-red-50 border-red-200">
          <CardHeader>
            <CardTitle className="text-lg text-red-900">Green-to-Clean Recovery Plan</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-sm font-semibold text-red-900">Tier: {quote.greenRecoveryTier.replace(/_/g, ' ')}</p>
              <p className="text-xs text-red-800 mt-2">Expected visits: {quote.greenRecoveryExpectedVisits}</p>
            </div>
            <p className="text-xs text-red-900 bg-red-100 p-3 rounded">
              ⚠️ Multiple visits may be required; immediate clarity is not guaranteed. Our technicians will assess progress and adjust as needed.
            </p>
          </CardContent>
        </Card>
      )}



      {/* Upsell Suggestions */}
      {quote.upsellSuggestions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Recommended Add-Ons</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {quote.upsellSuggestions.map((upsell) => (
              <div key={upsell.id} className="flex items-start justify-between p-3 bg-gray-50 rounded-lg border border-gray-200">
                <div className="flex-1">
                  <p className="font-semibold text-sm text-gray-900">{upsell.title}</p>
                  <p className="text-xs text-gray-600 mt-1">{upsell.reason}</p>
                </div>
                {upsell.price > 0 && (
                  <div className="text-right ml-4 flex-shrink-0">
                    <p className="font-bold text-teal-700">${upsell.price.toFixed(2)}</p>
                    <p className="text-xs text-gray-500">one-time</p>
                  </div>
                )}
              </div>
            ))}
          </CardContent>
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