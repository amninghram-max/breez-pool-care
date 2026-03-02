import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Droplet, Camera, AlertCircle, Check, TrendingUp } from 'lucide-react';
import ChemicalsAddedSection from '../components/servicevisit/ChemicalsAddedSection';

export default function ServiceVisitEntry() {
  const queryClient = useQueryClient();
  const [propertyId, setPropertyId] = useState('');
  const [visitData, setVisitData] = useState({
    visitDate: new Date().toISOString(),
    technicianName: '',
    freeChlorine: '',
    pH: '',
    totalAlkalinity: '',
    combinedChlorine: '',
    cyanuricAcid: '',
    calciumHardness: '',
    salt: '',
    phosphates: '',
    waterTemp: '',
    notes: '',
    chemicalsAdded: {
      liquidChlorine: '',
      chlorineTablets: '',
      acid: '',
      bakingSoda: '',
      stabilizer: '',
      salt: ''
    },
    servicesPerformed: [],
    photosBefore: [],
    photosAfter: []
  });
  const [suggestions, setSuggestions] = useState(null);
  const [errors, setErrors] = useState({});

  const { data: targets } = useQuery({
    queryKey: ['chemistryTargets'],
    queryFn: async () => {
      const result = await base44.entities.ChemistryTargets.filter({ settingKey: 'default' });
      return result[0] || {};
    }
  });

  const { data: properties = [] } = useQuery({
    queryKey: ['properties'],
    queryFn: () => base44.entities.Property.list()
  });

  const saveVisitMutation = useMutation({
    mutationFn: async (data) => {
      const response = await base44.functions.invoke('processServiceVisit', { visitData: data });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['serviceVisits'] });
      alert('Service visit saved successfully!');
      // Reset form
      setVisitData({
        visitDate: new Date().toISOString(),
        technicianName: visitData.technicianName,
        freeChlorine: '',
        pH: '',
        totalAlkalinity: '',
        combinedChlorine: '',
        cyanuricAcid: '',
        calciumHardness: '',
        salt: '',
        phosphates: '',
        waterTemp: '',
        notes: '',
        chemicalsAdded: {
          liquidChlorine: '',
          chlorineTablets: '',
          acid: '',
          bakingSoda: '',
          stabilizer: '',
          salt: ''
        },
        servicesPerformed: [],
        photosBefore: [],
        photosAfter: []
      });
      setSuggestions(null);
    }
  });

  const validateField = (field, value) => {
    const ranges = {
      freeChlorine: { min: 0, max: 10, label: 'Free Chlorine' },
      pH: { min: 6.0, max: 9.0, label: 'pH' },
      totalAlkalinity: { min: 0, max: 300, label: 'Total Alkalinity' },
      cyanuricAcid: { min: 0, max: 150, label: 'Cyanuric Acid' },
      calciumHardness: { min: 0, max: 1000, label: 'Calcium Hardness' },
      salt: { min: 0, max: 5000, label: 'Salt' },
      waterTemp: { min: 32, max: 120, label: 'Temperature' }
    };

    if (ranges[field]) {
      const num = parseFloat(value);
      if (isNaN(num)) {
        return `${ranges[field].label} must be a number`;
      }
      if (num < ranges[field].min || num > ranges[field].max) {
        return `${ranges[field].label} must be between ${ranges[field].min} and ${ranges[field].max}`;
      }
    }
    return null;
  };

  const handleFieldChange = (field, value) => {
    setVisitData({ ...visitData, [field]: value });
    const error = validateField(field, value);
    setErrors({ ...errors, [field]: error });
  };

  const handleChemicalChange = (chemical, value) => {
    setVisitData({
      ...visitData,
      chemicalsAdded: { ...visitData.chemicalsAdded, [chemical]: value }
    });
  };

  const toggleService = (service) => {
    const current = visitData.servicesPerformed || [];
    if (current.includes(service)) {
      setVisitData({
        ...visitData,
        servicesPerformed: current.filter(s => s !== service)
      });
    } else {
      setVisitData({
        ...visitData,
        servicesPerformed: [...current, service]
      });
    }
  };

  const getSuggestions = async () => {
    if (!visitData.freeChlorine || !visitData.pH || !visitData.totalAlkalinity) {
      alert('Please enter required readings first');
      return;
    }

    const response = await base44.functions.invoke('calculateChemicalSuggestions', {
      propertyId,
      readings: {
        freeChlorine: parseFloat(visitData.freeChlorine),
        pH: parseFloat(visitData.pH),
        totalAlkalinity: parseFloat(visitData.totalAlkalinity)
      }
    });
    setSuggestions(response.data);
  };

  const handleSubmit = () => {
    // Validate required fields
    if (!propertyId || !visitData.technicianName || !visitData.freeChlorine || !visitData.pH || !visitData.totalAlkalinity) {
      alert('Please fill in all required fields');
      return;
    }

    // Check for validation errors
    if (Object.values(errors).some(e => e)) {
      alert('Please fix validation errors');
      return;
    }

    saveVisitMutation.mutate({
      ...visitData,
      propertyId,
      suggestedChemicals: suggestions,
      suggestionsAccepted: suggestions ? true : false
    });
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Service Visit Entry</h1>
        <p className="text-gray-600 mt-1">Record water chemistry and service details</p>
      </div>

      {/* Property Selection */}
      <Card>
        <CardHeader>
          <CardTitle>Visit Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Property</Label>
            <select
              value={propertyId}
              onChange={(e) => setPropertyId(e.target.value)}
              className="w-full mt-2 p-3 border rounded-lg"
            >
              <option value="">Select property</option>
              {properties.map(p => (
                <option key={p.id} value={p.id}>{p.address}</option>
              ))}
            </select>
          </div>
          <div>
            <Label>Technician Name</Label>
            <Input
              value={visitData.technicianName}
              onChange={(e) => setVisitData({ ...visitData, technicianName: e.target.value })}
              className="mt-2"
            />
          </div>
          <div>
            <Label>Visit Date/Time</Label>
            <Input
              type="datetime-local"
              value={visitData.visitDate.slice(0, 16)}
              onChange={(e) => setVisitData({ ...visitData, visitDate: new Date(e.target.value).toISOString() })}
              className="mt-2"
            />
          </div>
        </CardContent>
      </Card>

      {/* Water Chemistry Readings */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Droplet className="w-5 h-5 text-teal-600" />
              Water Chemistry Readings
            </CardTitle>
            <Button size="sm" variant="outline" onClick={getSuggestions}>
              <TrendingUp className="w-4 h-4 mr-2" />
              Get Suggestions
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label>Free Chlorine (ppm) *</Label>
              <Input
                type="number"
                step="0.1"
                value={visitData.freeChlorine}
                onChange={(e) => handleFieldChange('freeChlorine', e.target.value)}
                className="mt-2"
              />
              {errors.freeChlorine && <p className="text-xs text-red-600 mt-1">{errors.freeChlorine}</p>}
              {targets?.freeChlorine && (
                <p className="text-xs text-gray-500 mt-1">
                  Target: {targets.freeChlorine.min}-{targets.freeChlorine.max} ppm
                </p>
              )}
            </div>
            <div>
              <Label>pH *</Label>
              <Input
                type="number"
                step="0.1"
                value={visitData.pH}
                onChange={(e) => handleFieldChange('pH', e.target.value)}
                className="mt-2"
              />
              {errors.pH && <p className="text-xs text-red-600 mt-1">{errors.pH}</p>}
              {targets?.pH && (
                <p className="text-xs text-gray-500 mt-1">
                  Target: {targets.pH.min}-{targets.pH.max}
                </p>
              )}
            </div>
            <div>
              <Label>Total Alkalinity (ppm) *</Label>
              <Input
                type="number"
                step="1"
                value={visitData.totalAlkalinity}
                onChange={(e) => handleFieldChange('totalAlkalinity', e.target.value)}
                className="mt-2"
              />
              {errors.totalAlkalinity && <p className="text-xs text-red-600 mt-1">{errors.totalAlkalinity}</p>}
              {targets?.totalAlkalinity && (
                <p className="text-xs text-gray-500 mt-1">
                  Target: {targets.totalAlkalinity.min}-{targets.totalAlkalinity.max} ppm
                </p>
              )}
            </div>
          </div>

          {targets?.optionalMetrics?.cyanuricAcid && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label>Cyanuric Acid (ppm)</Label>
                <Input
                  type="number"
                  step="1"
                  value={visitData.cyanuricAcid}
                  onChange={(e) => handleFieldChange('cyanuricAcid', e.target.value)}
                  className="mt-2"
                />
                {targets?.cyanuricAcid && (
                  <p className="text-xs text-gray-500 mt-1">
                    Target: {targets.cyanuricAcid.min}-{targets.cyanuricAcid.max} ppm
                  </p>
                )}
              </div>
              {targets?.optionalMetrics?.waterTemp && (
                <div>
                  <Label>Water Temp (°F)</Label>
                  <Input
                    type="number"
                    step="1"
                    value={visitData.waterTemp}
                    onChange={(e) => handleFieldChange('waterTemp', e.target.value)}
                    className="mt-2"
                  />
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Chemical Suggestions */}
      {suggestions && (
        <Card className="bg-blue-50 border-blue-200">
          <CardHeader>
            <CardTitle className="text-blue-900 flex items-center gap-2">
              <TrendingUp className="w-5 h-5" />
              Suggested Chemical Additions
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {suggestions.adjustments?.map((adj, i) => (
              <div key={i} className="flex items-center justify-between p-3 bg-white rounded-lg">
                <div>
                  <p className="font-medium">{adj.chemical}</p>
                  <p className="text-sm text-gray-600">{adj.reason}</p>
                </div>
                <p className="font-bold text-blue-900">{adj.amount} {adj.unit}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Chemicals Added - Using Registry */}
      <ChemicalsAddedSection
        chemicalsAdded={visitData.chemicalsAdded}
        onChemicalsChange={(newChemicalsAdded) =>
          setVisitData({ ...visitData, chemicalsAdded: newChemicalsAdded })
        }
      />

      {/* Services Performed */}
      <Card>
        <CardHeader>
          <CardTitle>Services Performed</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {['vacuum', 'brush', 'skim', 'filter_check', 'backwash', 'empty_baskets', 'test_equipment'].map(service => (
              <label key={service} className="flex items-center gap-2 p-3 border rounded-lg cursor-pointer hover:bg-gray-50">
                <Checkbox
                  checked={visitData.servicesPerformed?.includes(service)}
                  onCheckedChange={() => toggleService(service)}
                />
                <span className="text-sm capitalize">{service === 'filter_check' ? 'filter check/cleaning' : service.replace(/_/g, ' ')}</span>
              </label>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Notes */}
      <Card>
        <CardHeader>
          <CardTitle>Service Notes</CardTitle>
        </CardHeader>
        <CardContent>
          <textarea
            value={visitData.notes}
            onChange={(e) => setVisitData({ ...visitData, notes: e.target.value })}
            placeholder="Any observations, issues, or recommendations..."
            className="w-full p-3 border rounded-lg resize-none"
            rows={4}
          />
        </CardContent>
      </Card>

      {/* Submit */}
      <div className="flex gap-3">
        <Button
          onClick={handleSubmit}
          disabled={saveVisitMutation.isPending}
          className="flex-1 bg-teal-600 hover:bg-teal-700"
        >
          {saveVisitMutation.isPending ? 'Saving...' : 'Save Service Visit'}
        </Button>
      </div>
    </div>
  );
}