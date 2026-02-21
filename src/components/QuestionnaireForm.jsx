import React from 'react';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent } from '@/components/ui/card';

export default function QuestionnaireForm({ property, setProperty }) {
  const toggleMultiSelect = (field, value) => {
    const current = property[field] || [];
    const updated = current.includes(value) ? current.filter(v => v !== value) : [...current, value];
    setProperty({ ...property, [field]: updated });
  };

  return (
    <div className="space-y-8">
      {/* Pool Size */}
      <Card>
        <CardContent className="pt-6">
          <Label className="text-base font-semibold mb-4 block">Pool Size</Label>
          <RadioGroup value={property.poolSizeBucket || ''} onValueChange={(val) => setProperty({ ...property, poolSizeBucket: val })}>
            {[
              { value: 'under_10k', label: 'Under 10,000 gal' },
              { value: '10_15k', label: '10,000–15,000 gal' },
              { value: '15_20k', label: '15,000–20,000 gal' },
              { value: '20_30k', label: '20,000–30,000 gal' },
              { value: 'over_30k', label: '30,000+ gal' },
              { value: 'not_sure', label: 'Not sure' }
            ].map(opt => (
              <div key={opt.value} className="flex items-center space-x-2 mb-2">
                <RadioGroupItem value={opt.value} id={`pool_${opt.value}`} />
                <Label htmlFor={`pool_${opt.value}`} className="font-normal cursor-pointer">{opt.label}</Label>
              </div>
            ))}
          </RadioGroup>
        </CardContent>
      </Card>

      {/* Pool Type */}
      <Card>
        <CardContent className="pt-6">
          <Label className="text-base font-semibold mb-4 block">Pool Type</Label>
          <RadioGroup value={property.poolType || ''} onValueChange={(val) => setProperty({ ...property, poolType: val })}>
            {[
              { value: 'in_ground', label: 'In-ground' },
              { value: 'above_ground', label: 'Above-ground' },
              { value: 'spa', label: 'Spa' },
              { value: 'pool_plus_spa', label: 'Pool + Spa' }
            ].map(opt => (
              <div key={opt.value} className="flex items-center space-x-2 mb-2">
                <RadioGroupItem value={opt.value} id={`type_${opt.value}`} />
                <Label htmlFor={`type_${opt.value}`} className="font-normal cursor-pointer">{opt.label}</Label>
              </div>
            ))}
          </RadioGroup>
        </CardContent>
      </Card>

      {/* Enclosure */}
      <Card>
        <CardContent className="pt-6">
          <Label className="text-base font-semibold mb-4 block">Pool Enclosure</Label>
          <RadioGroup value={property.enclosure || ''} onValueChange={(val) => setProperty({ ...property, enclosure: val })}>
            {[
              { value: 'fully_screened', label: 'Fully screened' },
              { value: 'partially_screened', label: 'Partially screened' },
              { value: 'unscreened', label: 'Unscreened (open air)' },
              { value: 'indoor', label: 'Indoor' }
            ].map(opt => (
              <div key={opt.value} className="flex items-center space-x-2 mb-2">
                <RadioGroupItem value={opt.value} id={`enc_${opt.value}`} />
                <Label htmlFor={`enc_${opt.value}`} className="font-normal cursor-pointer">{opt.label}</Label>
              </div>
            ))}
          </RadioGroup>
        </CardContent>
      </Card>

      {/* Filter Type */}
      <Card>
        <CardContent className="pt-6">
          <Label className="text-base font-semibold mb-4 block">Filter Type</Label>
          <RadioGroup value={property.filterType || ''} onValueChange={(val) => setProperty({ ...property, filterType: val })}>
            {[
              { value: 'sand', label: 'Sand Filter' },
              { value: 'cartridge', label: 'Cartridge Filter' },
              { value: 'de', label: 'DE (Diatomaceous Earth)' },
              { value: 'not_sure', label: 'Not sure' }
            ].map(opt => (
              <div key={opt.value} className="flex items-center space-x-2 mb-2">
                <RadioGroupItem value={opt.value} id={`filt_${opt.value}`} />
                <Label htmlFor={`filt_${opt.value}`} className="font-normal cursor-pointer">{opt.label}</Label>
              </div>
            ))}
          </RadioGroup>
        </CardContent>
      </Card>

      {/* Chlorination Method */}
      <Card>
        <CardContent className="pt-6">
          <Label className="text-base font-semibold mb-4 block">Sanitization Method</Label>
          <RadioGroup value={property.chlorinationMethod || ''} onValueChange={(val) => setProperty({ ...property, chlorinationMethod: val })}>
            {[
              { value: 'saltwater', label: 'Saltwater (Salt Cell)' },
              { value: 'tablets', label: 'Tablets' },
              { value: 'liquid', label: 'Liquid' },
              { value: 'mineral', label: 'Mineral/Hybrid' },
              { value: 'not_sure', label: 'Not sure' }
            ].map(opt => (
              <div key={opt.value} className="flex items-center space-x-2 mb-2">
                <RadioGroupItem value={opt.value} id={`chl_${opt.value}`} />
                <Label htmlFor={`chl_${opt.value}`} className="font-normal cursor-pointer">{opt.label}</Label>
              </div>
            ))}
          </RadioGroup>
        </CardContent>
      </Card>

      {/* If Tablets: Chlorinator Type */}
      {property.chlorinationMethod === 'tablets' && (
        <Card className="border-teal-200 bg-teal-50">
          <CardContent className="pt-6">
            <Label className="text-base font-semibold mb-4 block">Chlorinator Type</Label>
            <RadioGroup value={property.chlorinatorType || ''} onValueChange={(val) => setProperty({ ...property, chlorinatorType: val })}>
              {[
                { value: 'inline_plumbed', label: 'Inline/Plumbed-in' },
                { value: 'offline', label: 'Offline (Feeder)' },
                { value: 'floating', label: 'Floating Dispenser' },
                { value: 'skimmer', label: 'Skimmer' },
                { value: 'not_sure', label: 'Not sure' }
              ].map(opt => (
                <div key={opt.value} className="flex items-center space-x-2 mb-2">
                  <RadioGroupItem value={opt.value} id={`chlor_${opt.value}`} />
                  <Label htmlFor={`chlor_${opt.value}`} className="font-normal cursor-pointer">{opt.label}</Label>
                </div>
              ))}
            </RadioGroup>
          </CardContent>
        </Card>
      )}

      {/* Usage Frequency */}
      <Card>
        <CardContent className="pt-6">
          <Label className="text-base font-semibold mb-4 block">Pool Usage</Label>
          <RadioGroup value={property.useFrequency || ''} onValueChange={(val) => setProperty({ ...property, useFrequency: val })}>
            {[
              { value: 'rarely', label: 'Rarely (seasonal or occasional)' },
              { value: 'weekends', label: 'Weekends only' },
              { value: 'several_per_week', label: 'Several times per week' },
              { value: 'daily', label: 'Daily' }
            ].map(opt => (
              <div key={opt.value} className="flex items-center space-x-2 mb-2">
                <RadioGroupItem value={opt.value} id={`use_${opt.value}`} />
                <Label htmlFor={`use_${opt.value}`} className="font-normal cursor-pointer">{opt.label}</Label>
              </div>
            ))}
          </RadioGroup>
        </CardContent>
      </Card>

      {/* Pets */}
      <Card>
        <CardContent className="pt-6">
          <div className="space-y-4">
            <div>
              <Label className="text-base font-semibold mb-4 block">Pets & Pool Access</Label>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="pets"
                  checked={property.petsAccess || false}
                  onCheckedChange={(checked) => setProperty({ ...property, petsAccess: checked, petsSwimFrequency: checked ? 'occasionally' : undefined })}
                />
                <Label htmlFor="pets" className="font-normal cursor-pointer">Dogs or other pets have pool access</Label>
              </div>
            </div>

            {property.petsAccess && (
              <div>
                <Label className="text-base font-semibold mb-4 block">How often do they swim?</Label>
                <RadioGroup value={property.petsSwimFrequency || ''} onValueChange={(val) => setProperty({ ...property, petsSwimFrequency: val })}>
                  {[
                    { value: 'rarely', label: 'Rarely' },
                    { value: 'occasionally', label: 'Occasionally' },
                    { value: 'frequently', label: 'Frequently' }
                  ].map(opt => (
                    <div key={opt.value} className="flex items-center space-x-2 mb-2">
                      <RadioGroupItem value={opt.value} id={`pet_freq_${opt.value}`} />
                      <Label htmlFor={`pet_freq_${opt.value}`} className="font-normal cursor-pointer">{opt.label}</Label>
                    </div>
                  ))}
                </RadioGroup>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Nearby Factors */}
      <Card>
        <CardContent className="pt-6">
          <Label className="text-base font-semibold mb-4 block">Nearby Environmental Factors</Label>
          <div className="space-y-2">
            {[
              { value: 'trees_overhead', label: 'Trees overhead or nearby' },
              { value: 'heavy_debris', label: 'Heavy debris/leaves area' },
              { value: 'pollen', label: 'High pollen area' },
              { value: 'waterfront', label: 'Waterfront/coastal' },
              { value: 'construction', label: 'Construction nearby' }
            ].map(opt => (
              <div key={opt.value} className="flex items-center space-x-2">
                <Checkbox
                  id={`nearby_${opt.value}`}
                  checked={(property.nearbyFactors || []).includes(opt.value)}
                  onCheckedChange={() => toggleMultiSelect('nearbyFactors', opt.value)}
                />
                <Label htmlFor={`nearby_${opt.value}`} className="font-normal cursor-pointer">{opt.label}</Label>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Current Condition */}
      <Card>
        <CardContent className="pt-6">
          <Label className="text-base font-semibold mb-4 block">Current Pool Condition</Label>
          <RadioGroup value={property.currentCondition || ''} onValueChange={(val) => setProperty({ ...property, currentCondition: val })}>
            {[
              { value: 'clear', label: 'Crystal clear' },
              { value: 'slightly_cloudy', label: 'Slightly cloudy' },
              { value: 'green_algae', label: 'Green (algae)' },
              { value: 'recently_treated', label: 'Recently treated' },
              { value: 'not_sure', label: 'Not sure' }
            ].map(opt => (
              <div key={opt.value} className="flex items-center space-x-2 mb-2">
                <RadioGroupItem value={opt.value} id={`cond_${opt.value}`} />
                <Label htmlFor={`cond_${opt.value}`} className="font-normal cursor-pointer">{opt.label}</Label>
              </div>
            ))}
          </RadioGroup>
        </CardContent>
      </Card>

      {/* Known Issues */}
      <Card>
        <CardContent className="pt-6">
          <Label className="text-base font-semibold mb-4 block">Known Issues (if any)</Label>
          <div className="space-y-2">
            {[
              { value: 'algae', label: 'Algae problems' },
              { value: 'staining', label: 'Staining/discoloration' },
              { value: 'equipment', label: 'Equipment concerns' },
              { value: 'leaks', label: 'Suspected leaks' }
            ].map(opt => (
              <div key={opt.value} className="flex items-center space-x-2">
                <Checkbox
                  id={`issue_${opt.value}`}
                  checked={(property.knownIssues || []).includes(opt.value)}
                  onCheckedChange={() => toggleMultiSelect('knownIssues', opt.value)}
                />
                <Label htmlFor={`issue_${opt.value}`} className="font-normal cursor-pointer">{opt.label}</Label>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Equipment/Features */}
      <Card>
        <CardContent className="pt-6">
          <Label className="text-base font-semibold mb-4 block">Equipment & Features</Label>
          <div className="space-y-2">
            {[
              { value: 'heater', label: 'Pool heater' },
              { value: 'spa', label: 'Spa/hot tub' },
              { value: 'water_features', label: 'Water features (fountain, waterfall)' },
              { value: 'auto_cleaner', label: 'Automatic cleaner (robot/Polaris)' },
              { value: 'variable_pump', label: 'Variable-speed pump' },
              { value: 'automation', label: 'Automation system' }
            ].map(opt => (
              <div key={opt.value} className="flex items-center space-x-2">
                <Checkbox
                  id={`equip_${opt.value}`}
                  checked={(property.equipmentFeatures || []).includes(opt.value)}
                  onCheckedChange={() => toggleMultiSelect('equipmentFeatures', opt.value)}
                />
                <Label htmlFor={`equip_${opt.value}`} className="font-normal cursor-pointer">{opt.label}</Label>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Access Type */}
      <Card>
        <CardContent className="pt-6">
          <Label className="text-base font-semibold mb-4 block">Property Access</Label>
          <RadioGroup value={property.accessType || ''} onValueChange={(val) => setProperty({ ...property, accessType: val })}>
            {[
              { value: 'no_restrictions', label: 'No restrictions' },
              { value: 'locked_gate', label: 'Locked gate' },
              { value: 'code_required', label: 'Code/combination required' },
              { value: 'hoa_community', label: 'HOA/community pool' },
              { value: 'other', label: 'Other restrictions' }
            ].map(opt => (
              <div key={opt.value} className="flex items-center space-x-2 mb-2">
                <RadioGroupItem value={opt.value} id={`access_${opt.value}`} />
                <Label htmlFor={`access_${opt.value}`} className="font-normal cursor-pointer">{opt.label}</Label>
              </div>
            ))}
          </RadioGroup>
        </CardContent>
      </Card>

      {/* Access Notes */}
      {property.accessType && property.accessType !== 'no_restrictions' && (
        <Card className="border-orange-200 bg-orange-50">
          <CardContent className="pt-6">
            <Label className="text-base font-semibold mb-2 block">Access Details (Code, Gate Info, etc.)</Label>
            <p className="text-sm text-orange-700 mb-3">This will only be shared with your assigned technician.</p>
            <textarea
              placeholder="e.g., Gate code is 1234, or key under left planter, or call 30 min before..."
              value={property.accessNotes || ''}
              onChange={(e) => setProperty({ ...property, accessNotes: e.target.value })}
              className="w-full p-3 border border-orange-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
              rows="3"
            />
          </CardContent>
        </Card>
      )}

      {/* Service Restrictions */}
      <Card>
        <CardContent className="pt-6">
          <Label className="text-base font-semibold mb-4 block">Service Day/Time Restrictions</Label>
          <RadioGroup value={property.serviceRestrictions || 'none'} onValueChange={(val) => setProperty({ ...property, serviceRestrictions: val })}>
            <div className="flex items-center space-x-2 mb-2">
              <RadioGroupItem value="none" id="svc_none" />
              <Label htmlFor="svc_none" className="font-normal cursor-pointer">No restrictions</Label>
            </div>
            <div className="flex items-center space-x-2 mb-2">
              <RadioGroupItem value="certain_days_times" id="svc_certain" />
              <Label htmlFor="svc_certain" className="font-normal cursor-pointer">Certain days/times only</Label>
            </div>
          </RadioGroup>
        </CardContent>
      </Card>

      {property.serviceRestrictions === 'certain_days_times' && (
        <Card className="border-blue-200 bg-blue-50">
          <CardContent className="pt-6">
            <Label className="text-base font-semibold mb-2 block">Service Restrictions Details</Label>
            <textarea
              placeholder="e.g., Weekdays only 9am-5pm, no Sundays, call 30 min before arrival..."
              value={property.serviceRestrictionDetails || ''}
              onChange={(e) => setProperty({ ...property, serviceRestrictionDetails: e.target.value })}
              className="w-full p-3 border border-blue-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              rows="3"
            />
          </CardContent>
        </Card>
      )}

      {/* Animals on Property */}
      <Card>
        <CardContent className="pt-6">
          <Label className="text-base font-semibold mb-4 block">Other Animals on Property</Label>
          <RadioGroup value={property.animalsOnProperty || 'none'} onValueChange={(val) => setProperty({ ...property, animalsOnProperty: val })}>
            {[
              { value: 'none', label: 'None' },
              { value: 'dogs', label: 'Dogs (not in pool)' },
              { value: 'other', label: 'Other' }
            ].map(opt => (
              <div key={opt.value} className="flex items-center space-x-2 mb-2">
                <RadioGroupItem value={opt.value} id={`animal_${opt.value}`} />
                <Label htmlFor={`animal_${opt.value}`} className="font-normal cursor-pointer">{opt.label}</Label>
              </div>
            ))}
          </RadioGroup>
        </CardContent>
      </Card>

      {property.animalsOnProperty && property.animalsOnProperty !== 'none' && (
        <Card className="border-blue-200 bg-blue-50">
          <CardContent className="pt-6">
            <Label className="text-base font-semibold mb-2 block">Animal Notes (Temperament, Containment, etc.)</Label>
            <textarea
              placeholder="e.g., Friendly golden retriever, usually contained in backyard..."
              value={property.animalNotes || ''}
              onChange={(e) => setProperty({ ...property, animalNotes: e.target.value })}
              className="w-full p-3 border border-blue-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              rows="2"
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}