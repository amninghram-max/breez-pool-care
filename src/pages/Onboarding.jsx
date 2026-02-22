import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Check, AlertCircle } from 'lucide-react';

export default function Onboarding() {
  const [step, setStep] = useState(0);
  const [leadData, setLeadData] = useState({
    firstName: '',
    lastName: '',
    serviceAddress: '',
    email: '',
    mobilePhone: '',
    preferredContact: 'text',
    secondaryContact: 'none',
    poolType: '',
    poolSurface: '',
    filterType: '',
    sanitizerType: '',
    tabletFeederType: 'n/a',
    screenedArea: '',
    usageFrequency: '',
    hasPets: false,
    petsEnterPoolArea: false,
    petsSwimInPool: false,
    petsCanBeSecured: false,
    accessRestrictions: 'none',
    gateCode: '',
    gateCodeProvisionMethod: 'n/a',
    poolCondition: '',
    assignedInspector: 'Matt',
    requestedInspectionDate: '',
    requestedInspectionTime: ''
  });
  const [disqualified, setDisqualified] = useState(false);
  const [disqualificationReason, setDisqualificationReason] = useState('');
  const [confirmed, setConfirmed] = useState(false);

  const submitLeadMutation = useMutation({
    mutationFn: async (data) => {
      const response = await base44.functions.invoke('processLead', { leadData: data });
      return response.data;
    },
    onSuccess: (data) => {
      if (data.isEligible) {
        setStep(step + 1);
      }
    }
  });

  const checkEligibility = (field, value) => {
    // Hard fail conditions
    if (field === 'poolType' && value === 'above_ground') {
      setDisqualified(true);
      setDisqualificationReason('We currently service in-ground pools only.');
      return false;
    }
    if (field === 'poolSurface' && (value === 'fiberglass' || value === 'vinyl')) {
      setDisqualified(true);
      setDisqualificationReason('We're unable to service pools with this surface type at this time.');
      return false;
    }
    if (field === 'filterType' && value === 'de') {
      setDisqualified(true);
      setDisqualificationReason('We're unable to service pools with DE filters at this time.');
      return false;
    }
    if (field === 'sanitizerType' && value === 'mineral') {
      setDisqualified(true);
      setDisqualificationReason('We're unable to service pools with mineral sanitizer systems at this time.');
      return false;
    }
    return true;
  };

  const handleSelect = (field, value) => {
    const eligible = checkEligibility(field, value);
    setLeadData({ ...leadData, [field]: value });
    
    if (!eligible) {
      return;
    }

    // Skip tablet feeder question if not using tablets
    if (field === 'sanitizerType' && value !== 'tablets' && step === 7) {
      setStep(step + 2);
      return;
    }

    if (field === 'hasPets' && value === false && step === 11) {
      setStep(step + 2);
      return;
    }

    setStep(step + 1);
  };

  const handleContactSubmit = () => {
    if (!leadData.firstName || !leadData.lastName || !leadData.serviceAddress || !leadData.email || !leadData.mobilePhone) {
      alert('Please fill in all required fields');
      return;
    }
    setStep(step + 1);
  };

  const handleScheduleSubmit = () => {
    if (!leadData.requestedInspectionDate || !leadData.requestedInspectionTime) {
      alert('Please select a date and time');
      return;
    }
    submitLeadMutation.mutate(leadData);
    setConfirmed(true);
  };

  if (disqualified) {
    return <DisqualificationScreen reason={disqualificationReason} />;
  }

  if (confirmed) {
    return <ConfirmationScreen inspector={leadData.assignedInspector} />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-teal-50 to-blue-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Welcome Screen */}
        {step === 0 && (
          <Card className="text-center">
            <CardHeader className="pb-4">
              <div className="mx-auto mb-4">
                <img 
                  src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/699a2b2056054b0207cea969/0b0c31666_Breez2.png"
                  alt="Breez"
                  className="h-16 mx-auto"
                />
              </div>
              <CardTitle className="text-2xl">Welcome to Breez</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <p className="text-gray-600">We provide professional pool cleaning with chemicals included.</p>
              <Button onClick={() => setStep(1)} className="w-full bg-teal-600 hover:bg-teal-700 text-lg py-6">
                Check Pool Eligibility
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Contact Information */}
        {step === 1 && (
          <Card>
            <CardHeader>
              <CardTitle>Your Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>First Name</Label>
                <Input
                  value={leadData.firstName}
                  onChange={(e) => setLeadData({ ...leadData, firstName: e.target.value })}
                  className="mt-2"
                />
              </div>
              <div>
                <Label>Last Name</Label>
                <Input
                  value={leadData.lastName}
                  onChange={(e) => setLeadData({ ...leadData, lastName: e.target.value })}
                  className="mt-2"
                />
              </div>
              <div>
                <Label>Service Address</Label>
                <Input
                  value={leadData.serviceAddress}
                  onChange={(e) => setLeadData({ ...leadData, serviceAddress: e.target.value })}
                  className="mt-2"
                />
              </div>
              <div>
                <Label>Email</Label>
                <Input
                  type="email"
                  value={leadData.email}
                  onChange={(e) => setLeadData({ ...leadData, email: e.target.value })}
                  className="mt-2"
                />
              </div>
              <div>
                <Label>Mobile Phone</Label>
                <Input
                  type="tel"
                  value={leadData.mobilePhone}
                  onChange={(e) => setLeadData({ ...leadData, mobilePhone: e.target.value })}
                  className="mt-2"
                  placeholder="(555) 000-0000"
                />
              </div>
              <Button onClick={handleContactSubmit} className="w-full bg-teal-600 hover:bg-teal-700">
                Continue
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Preferred Contact */}
        {step === 2 && (
          <QuestionCard
            question="How should we contact you?"
            options={[
              { label: 'Text Message', value: 'text' },
              { label: 'Phone Call', value: 'phone' },
              { label: 'Email', value: 'email' }
            ]}
            onSelect={(value) => handleSelect('preferredContact', value)}
          />
        )}

        {/* Pool Type */}
        {step === 3 && (
          <QuestionCard
            question="What type of pool do you have?"
            options={[
              { label: 'In-ground', value: 'in_ground', emoji: '✅' },
              { label: 'Above-ground', value: 'above_ground', emoji: '❌' }
            ]}
            onSelect={(value) => handleSelect('poolType', value)}
          />
        )}

        {/* Pool Surface */}
        {step === 4 && (
          <QuestionCard
            question="What is your pool surface?"
            options={[
              { label: 'Plaster / Marcite', value: 'plaster', emoji: '✅' },
              { label: 'Pebble / Aggregate', value: 'pebble', emoji: '✅' },
              { label: 'Tile', value: 'tile', emoji: '✅' },
              { label: 'Fiberglass', value: 'fiberglass', emoji: '❌' },
              { label: 'Vinyl', value: 'vinyl', emoji: '❌' },
              { label: 'Not sure', value: 'not_sure', emoji: '✅' }
            ]}
            onSelect={(value) => handleSelect('poolSurface', value)}
          />
        )}

        {/* Filter Type */}
        {step === 5 && (
          <QuestionCard
            question="What type of filter do you have?"
            options={[
              { label: 'Sand', value: 'sand', emoji: '✅' },
              { label: 'Cartridge', value: 'cartridge', emoji: '✅' },
              { label: 'DE (powder filter)', value: 'de', emoji: '❌' },
              { label: 'Not sure', value: 'not_sure', emoji: '✅' }
            ]}
            onSelect={(value) => handleSelect('filterType', value)}
          />
        )}

        {/* Sanitizer Type */}
        {step === 6 && (
          <QuestionCard
            question="How is your pool sanitized?"
            options={[
              { label: 'Saltwater System', value: 'saltwater', emoji: '✅' },
              { label: 'Chlorine Tablets', value: 'tablets', emoji: '✅' },
              { label: 'Liquid Chlorine', value: 'liquid_chlorine', emoji: '✅' },
              { label: 'Mineral System (non-salt)', value: 'mineral', emoji: '❌' },
              { label: 'Not sure', value: 'not_sure', emoji: '✅' }
            ]}
            onSelect={(value) => handleSelect('sanitizerType', value)}
          />
        )}

        {/* Tablet Feeder (conditional) */}
        {step === 7 && leadData.sanitizerType === 'tablets' && (
          <QuestionCard
            question="What type of tablet feeder do you use?"
            options={[
              { label: 'Built-in / Inline', value: 'inline' },
              { label: 'Separate / Offline', value: 'offline' },
              { label: 'Floating dispenser', value: 'floating' },
              { label: 'Skimmer basket', value: 'skimmer' },
              { label: 'Not sure', value: 'not_sure' }
            ]}
            onSelect={(value) => handleSelect('tabletFeederType', value)}
          />
        )}

        {/* Screened Area */}
        {step === 8 && (
          <QuestionCard
            question="Is your pool area screened?"
            options={[
              { label: 'Fully screened', value: 'fully_screened' },
              { label: 'Partially screened', value: 'partially_screened' },
              { label: 'Unscreened', value: 'unscreened' },
              { label: 'Indoor', value: 'indoor' }
            ]}
            onSelect={(value) => handleSelect('screenedArea', value)}
          />
        )}

        {/* Usage Frequency */}
        {step === 9 && (
          <QuestionCard
            question="How often is the pool used?"
            options={[
              { label: 'Rarely', value: 'rarely' },
              { label: 'Weekends', value: 'weekends' },
              { label: 'Several times per week', value: 'several_week' },
              { label: 'Daily', value: 'daily' }
            ]}
            onSelect={(value) => handleSelect('usageFrequency', value)}
          />
        )}

        {/* Pets */}
        {step === 10 && (
          <QuestionCard
            question="Are there dogs or pets on the property?"
            options={[
              { label: 'No', value: false },
              { label: 'Yes', value: true }
            ]}
            onSelect={(value) => handleSelect('hasPets', value)}
          />
        )}

        {/* Pet Follow-ups */}
        {step === 11 && leadData.hasPets && (
          <Card>
            <CardHeader>
              <CardTitle>About Your Pets</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <label className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50">
                  <input
                    type="checkbox"
                    checked={leadData.petsEnterPoolArea}
                    onChange={(e) => setLeadData({ ...leadData, petsEnterPoolArea: e.target.checked })}
                    className="w-4 h-4"
                  />
                  <span>Pets enter the pool area</span>
                </label>
                <label className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50">
                  <input
                    type="checkbox"
                    checked={leadData.petsSwimInPool}
                    onChange={(e) => setLeadData({ ...leadData, petsSwimInPool: e.target.checked })}
                    className="w-4 h-4"
                  />
                  <span>Pets swim in the pool</span>
                </label>
                <label className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50">
                  <input
                    type="checkbox"
                    checked={leadData.petsCanBeSecured}
                    onChange={(e) => setLeadData({ ...leadData, petsCanBeSecured: e.target.checked })}
                    className="w-4 h-4"
                  />
                  <span>Pets can be secured during service</span>
                </label>
              </div>
              <Button onClick={() => setStep(step + 1)} className="w-full bg-teal-600 hover:bg-teal-700">
                Continue
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Access Restrictions */}
        {step === 12 && (
          <QuestionCard
            question="Are there any access restrictions?"
            options={[
              { label: 'No restrictions', value: 'none' },
              { label: 'Locked gate', value: 'locked_gate' },
              { label: 'Access code required', value: 'code_required' },
              { label: 'HOA / Community permission', value: 'hoa' },
              { label: 'Other', value: 'other' }
            ]}
            onSelect={(value) => handleSelect('accessRestrictions', value)}
          />
        )}

        {/* Gate Code (conditional) */}
        {step === 13 && leadData.accessRestrictions === 'code_required' && (
          <Card>
            <CardHeader>
              <CardTitle>How would you like to provide the access code?</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Button 
                onClick={() => {
                  setLeadData({ ...leadData, gateCodeProvisionMethod: 'at_inspection' });
                  setStep(step + 1);
                }}
                variant="outline"
                className="w-full justify-start text-left h-auto py-4"
              >
                Provide at inspection
              </Button>
              <Button 
                onClick={() => {
                  setLeadData({ ...leadData, gateCodeProvisionMethod: 'call_me' });
                  setStep(step + 1);
                }}
                variant="outline"
                className="w-full justify-start text-left h-auto py-4"
              >
                Call/Text me for it
              </Button>
              <div className="space-y-2">
                <Label>Or enter now (stored securely)</Label>
                <Input
                  value={leadData.gateCode}
                  onChange={(e) => setLeadData({ ...leadData, gateCode: e.target.value, gateCodeProvisionMethod: 'entered' })}
                  placeholder="Enter code"
                />
                <Button 
                  onClick={() => setStep(step + 1)}
                  disabled={!leadData.gateCode}
                  className="w-full bg-teal-600 hover:bg-teal-700"
                >
                  Continue
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Pool Condition */}
        {step === 14 && (
          <QuestionCard
            question="What is the current pool condition?"
            options={[
              { label: 'Clear', value: 'clear' },
              { label: 'Slightly cloudy', value: 'slightly_cloudy' },
              { label: 'Green / algae', value: 'green' },
              { label: 'Not sure', value: 'not_sure' }
            ]}
            onSelect={(value) => {
              setLeadData({ ...leadData, poolCondition: value });
              setStep(step + 1);
            }}
          />
        )}

        {/* Inspection Scheduling */}
        {step === 15 && (
          <Card>
            <CardHeader>
              <CardTitle>Schedule Your Free Pool Inspection</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Preferred Date</Label>
                <Input
                  type="date"
                  value={leadData.requestedInspectionDate}
                  onChange={(e) => setLeadData({ ...leadData, requestedInspectionDate: e.target.value })}
                  className="mt-2"
                  min={new Date().toISOString().split('T')[0]}
                />
              </div>
              <div>
                <Label>Preferred Time</Label>
                <select
                  value={leadData.requestedInspectionTime}
                  onChange={(e) => setLeadData({ ...leadData, requestedInspectionTime: e.target.value })}
                  className="w-full mt-2 p-3 border rounded-lg"
                >
                  <option value="">Select time</option>
                  <option value="morning">Morning (8am - 12pm)</option>
                  <option value="afternoon">Afternoon (12pm - 4pm)</option>
                  <option value="evening">Evening (4pm - 7pm)</option>
                </select>
              </div>
              <div className="p-4 bg-blue-50 rounded-lg">
                <p className="text-sm text-blue-900">
                  We'll contact you via <strong>{leadData.preferredContact === 'text' ? 'text message' : leadData.preferredContact === 'phone' ? 'phone call' : 'email'}</strong> to confirm
                </p>
              </div>
              <Button 
                onClick={handleScheduleSubmit}
                disabled={submitLeadMutation.isPending}
                className="w-full bg-teal-600 hover:bg-teal-700"
              >
                {submitLeadMutation.isPending ? 'Submitting...' : 'Request Inspection'}
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function QuestionCard({ question, options, onSelect }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{question}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {options.map((option) => (
          <Button
            key={option.value}
            onClick={() => onSelect(option.value)}
            variant="outline"
            className="w-full justify-start text-left h-auto py-4 hover:bg-teal-50 hover:border-teal-600"
          >
            <span className="flex items-center gap-3">
              {option.emoji && <span className="text-xl">{option.emoji}</span>}
              <span>{option.label}</span>
            </span>
          </Button>
        ))}
      </CardContent>
    </Card>
  );
}

function DisqualificationScreen({ reason }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center p-4">
      <Card className="max-w-md text-center">
        <CardHeader>
          <div className="mx-auto mb-4 w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center">
            <AlertCircle className="w-8 h-8 text-gray-600" />
          </div>
          <CardTitle>Thanks for checking with Breez</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <p className="text-gray-600">
            Unfortunately, we're unable to service this type of pool at this time.
          </p>
          <div className="p-4 bg-gray-50 rounded-lg">
            <p className="text-sm text-gray-700">{reason}</p>
          </div>
          <div className="space-y-3">
            <Button variant="outline" className="w-full">
              Share Breez with a friend
            </Button>
            <Button variant="outline" className="w-full" onClick={() => window.location.href = '/'}>
              Return home
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function ConfirmationScreen({ inspector }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-teal-50 to-blue-50 flex items-center justify-center p-4">
      <Card className="max-w-md text-center">
        <CardHeader>
          <div className="mx-auto mb-4 w-16 h-16 rounded-full bg-teal-100 flex items-center justify-center">
            <Check className="w-8 h-8 text-teal-600" />
          </div>
          <CardTitle className="text-2xl">Inspection Confirmed ✅</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <p className="text-gray-600">Your inspection request has been received!</p>
          
          <div className="border-t border-b py-6">
            <p className="text-sm text-gray-600 mb-4">Your inspection will be handled by:</p>
            <div className="flex flex-col items-center gap-4">
              <div className="w-24 h-24 rounded-full bg-gray-200 overflow-hidden">
                <img 
                  src="https://via.placeholder.com/150/1B9B9F/FFFFFF?text=Matt"
                  alt={inspector}
                  className="w-full h-full object-cover"
                />
              </div>
              <div>
                <p className="font-semibold text-lg">{inspector}</p>
                <p className="text-sm text-gray-600">Pool Care Specialist</p>
              </div>
            </div>
            <p className="text-sm text-gray-600 mt-4">
              {inspector} will perform your free pool assessment and answer any questions.
            </p>
          </div>

          <div className="p-4 bg-blue-50 rounded-lg">
            <p className="text-sm text-blue-900">
              <strong>What's next?</strong><br />
              We'll confirm your appointment and send you all the details.
            </p>
          </div>

          <Button className="w-full bg-teal-600 hover:bg-teal-700" onClick={() => window.location.href = '/'}>
            Done
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}