import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import { AlertCircle, Check, ChevronRight, ChevronLeft } from 'lucide-react';
import { createPageUrl } from '@/utils';
import { useNavigate } from 'react-router-dom';

export default function Onboarding() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);

  const { data: user } = useQuery({
    queryKey: ['user'],
    queryFn: () => base44.auth.me(),
  });

  const [property, setProperty] = useState({
    address: '',
    poolSize: 'medium',
    poolType: 'saltwater',
    isScreened: false,
    hasFilter: true,
    filterType: 'sand',
    dailyUsage: 'moderate',
    dogsSwim: false,
    debrisLevel: 'moderate',
    algaeHistory: false,
    pollenExposure: true,
    clientNotes: '',
  });

  const createPropertyMutation = useMutation({
    mutationFn: async () => {
      const newProperty = await base44.entities.Property.create(property);
      return newProperty;
    },
  });

  const generateQuoteMutation = useMutation({
    mutationFn: async (propertyId) => {
      const response = await base44.functions.invoke('generateQuote', { propertyId });
      return response.data;
    },
  });

  const handleNext = async () => {
    if (step === 1) {
      if (!property.address) {
        alert('Please enter an address');
        return;
      }
      setStep(2);
    } else if (step === 2) {
      setLoading(true);
      try {
        const newProperty = await createPropertyMutation.mutateAsync();
        const quote = await generateQuoteMutation.mutateAsync(newProperty.id);
        navigate(createPageUrl('Home'));
      } catch (error) {
        alert('Error creating property: ' + error.message);
        setLoading(false);
      }
    }
  };

  const handleBack = () => {
    if (step > 1) setStep(step - 1);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50 p-4">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <img
            src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/699a2b2056054b0207cea969/0b0c31666_Breez2.png"
            alt="Breez"
            className="h-16 w-auto mx-auto mb-6"
          />
          <h1 className="text-3xl font-semibold text-gray-900">Welcome to Breez</h1>
          <p className="text-gray-600 mt-2">Let's set up your pool for service</p>
        </div>

        {/* Progress indicator */}
        <div className="mb-8 flex items-center justify-center gap-4">
          <div className={`flex items-center justify-center w-10 h-10 rounded-full font-semibold ${
            step >= 1 ? 'bg-teal-600 text-white' : 'bg-gray-200 text-gray-600'
          }`}>
            {step > 1 ? <Check className="w-5 h-5" /> : '1'}
          </div>
          <div className={`h-1 w-12 ${step >= 2 ? 'bg-teal-600' : 'bg-gray-200'}`} />
          <div className={`flex items-center justify-center w-10 h-10 rounded-full font-semibold ${
            step >= 2 ? 'bg-teal-600 text-white' : 'bg-gray-200 text-gray-600'
          }`}>
            2
          </div>
        </div>

        {/* Step 1: Address & Basic Info */}
        {step === 1 && (
          <Card className="bg-white border-gray-200 shadow-lg">
            <CardHeader>
              <CardTitle>Property Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <Label>Property Address</Label>
                <Input
                  placeholder="123 Pool Lane, Melbourne, FL 32901"
                  value={property.address}
                  onChange={(e) => setProperty({ ...property, address: e.target.value })}
                  className="mt-2"
                />
              </div>

              <div>
                <Label className="mb-3 block">Pool Size</Label>
                <RadioGroup value={property.poolSize} onValueChange={(val) => setProperty({ ...property, poolSize: val })}>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="small" id="small" />
                    <Label htmlFor="small" className="font-normal cursor-pointer">Small (5,000-10,000 gal)</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="medium" id="medium" />
                    <Label htmlFor="medium" className="font-normal cursor-pointer">Medium (10,000-20,000 gal)</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="large" id="large" />
                    <Label htmlFor="large" className="font-normal cursor-pointer">Large (20,000-35,000 gal)</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="oversized" id="oversized" />
                    <Label htmlFor="oversized" className="font-normal cursor-pointer">Oversized (35,000+ gal)</Label>
                  </div>
                </RadioGroup>
              </div>

              <div>
                <Label className="mb-3 block">Pool Type</Label>
                <RadioGroup value={property.poolType} onValueChange={(val) => setProperty({ ...property, poolType: val })}>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="saltwater" id="saltwater" />
                    <Label htmlFor="saltwater" className="font-normal cursor-pointer">Saltwater (Salt Cell)</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="chlorine" id="chlorine" />
                    <Label htmlFor="chlorine" className="font-normal cursor-pointer">Chlorine</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="bromine" id="bromine" />
                    <Label htmlFor="bromine" className="font-normal cursor-pointer">Bromine</Label>
                  </div>
                </RadioGroup>
              </div>

              <div className="space-y-3">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="screened"
                    checked={property.isScreened}
                    onCheckedChange={(checked) => setProperty({ ...property, isScreened: checked })}
                  />
                  <Label htmlFor="screened" className="font-normal cursor-pointer">Pool is screened enclosure</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="filter"
                    checked={property.hasFilter}
                    onCheckedChange={(checked) => setProperty({ ...property, hasFilter: checked })}
                  />
                  <Label htmlFor="filter" className="font-normal cursor-pointer">Has functional filter system</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="dogs"
                    checked={property.dogsSwim}
                    onCheckedChange={(checked) => setProperty({ ...property, dogsSwim: checked })}
                  />
                  <Label htmlFor="dogs" className="font-normal cursor-pointer">Dogs or pets swim in pool</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="pollen"
                    checked={property.pollenExposure}
                    onCheckedChange={(checked) => setProperty({ ...property, pollenExposure: checked })}
                  />
                  <Label htmlFor="pollen" className="font-normal cursor-pointer">High pollen area exposure</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="algae"
                    checked={property.algaeHistory}
                    onCheckedChange={(checked) => setProperty({ ...property, algaeHistory: checked })}
                  />
                  <Label htmlFor="algae" className="font-normal cursor-pointer">History of algae issues</Label>
                </div>
              </div>

              <div className="flex gap-3">
                <Button variant="outline" onClick={handleBack} disabled>Back</Button>
                <Button onClick={handleNext} className="flex-1 bg-teal-600 hover:bg-teal-700">
                  Next <ChevronRight className="w-4 h-4 ml-2" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 2: Maintenance Details */}
        {step === 2 && (
          <Card className="bg-white border-gray-200 shadow-lg">
            <CardHeader>
              <CardTitle>Maintenance Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <Label className="mb-3 block">Daily Usage Level</Label>
                <RadioGroup value={property.dailyUsage} onValueChange={(val) => setProperty({ ...property, dailyUsage: val })}>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="minimal" id="minimal" />
                    <Label htmlFor="minimal" className="font-normal cursor-pointer">Minimal (rarely used)</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="moderate" id="moderate" />
                    <Label htmlFor="moderate" className="font-normal cursor-pointer">Moderate (weekly use)</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="heavy" id="heavy" />
                    <Label htmlFor="heavy" className="font-normal cursor-pointer">Heavy (several times/week)</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="daily" id="daily" />
                    <Label htmlFor="daily" className="font-normal cursor-pointer">Daily use</Label>
                  </div>
                </RadioGroup>
              </div>

              <div>
                <Label className="mb-3 block">Typical Debris Accumulation</Label>
                <RadioGroup value={property.debrisLevel} onValueChange={(val) => setProperty({ ...property, debrisLevel: val })}>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="minimal" id="debris-minimal" />
                    <Label htmlFor="debris-minimal" className="font-normal cursor-pointer">Minimal</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="moderate" id="debris-moderate" />
                    <Label htmlFor="debris-moderate" className="font-normal cursor-pointer">Moderate</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="high" id="debris-high" />
                    <Label htmlFor="debris-high" className="font-normal cursor-pointer">High (lots of leaves/debris)</Label>
                  </div>
                </RadioGroup>
              </div>

              {property.hasFilter && (
                <div>
                  <Label className="mb-3 block">Filter Type</Label>
                  <RadioGroup value={property.filterType} onValueChange={(val) => setProperty({ ...property, filterType: val })}>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="sand" id="sand" />
                      <Label htmlFor="sand" className="font-normal cursor-pointer">Sand Filter</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="cartridge" id="cartridge" />
                      <Label htmlFor="cartridge" className="font-normal cursor-pointer">Cartridge Filter</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="diatomaceous" id="diatomaceous" />
                      <Label htmlFor="diatomaceous" className="font-normal cursor-pointer">Diatomaceous Earth (DE)</Label>
                    </div>
                  </RadioGroup>
                </div>
              )}

              <div>
                <Label>Additional Notes</Label>
                <textarea
                  placeholder="Any other details we should know about your pool..."
                  value={property.clientNotes}
                  onChange={(e) => setProperty({ ...property, clientNotes: e.target.value })}
                  className="w-full mt-2 p-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                  rows="4"
                />
              </div>

              <div className="p-4 bg-teal-50 border border-teal-200 rounded-lg flex gap-3">
                <AlertCircle className="w-5 h-5 text-teal-600 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-teal-900">
                  We'll use this information to generate a personalized quote with recommended service frequency and estimated costs.
                </p>
              </div>

              <div className="flex gap-3">
                <Button variant="outline" onClick={handleBack}>
                  <ChevronLeft className="w-4 h-4 mr-2" /> Back
                </Button>
                <Button onClick={handleNext} disabled={loading} className="flex-1 bg-teal-600 hover:bg-teal-700">
                  {loading ? 'Creating Quote...' : 'Complete & Get Quote'}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}