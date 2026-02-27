import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { X, CheckCircle, ArrowRight } from 'lucide-react';

const STEPS = ['contact', 'pool', 'quote'];

export default function NewQuoteFlow({ onClose }) {
  const queryClient = useQueryClient();
  const [step, setStep] = useState(0);
  const [leadId, setLeadId] = useState(null);
  const [quoteResult, setQuoteResult] = useState(null);

  const [contact, setContact] = useState({
    firstName: '', lastName: '', email: '', mobilePhone: '',
    streetAddress: '', city: '', state: 'FL', zipCode: '',
    preferredContact: 'text'
  });

  const [pool, setPool] = useState({
    poolSize: '15_20k', poolType: 'in_ground', spaPresent: 'false',
    enclosure: 'fully_screened', treesOverhead: 'no',
    filterType: 'sand', chlorinationMethod: 'saltwater',
    chlorinatorType: 'n/a', useFrequency: 'weekends',
    petsAccess: false, petSwimFrequency: 'never',
    poolCondition: 'clear', greenPoolSeverity: 'light'
  });

  const setC = (k, v) => setContact(f => ({ ...f, [k]: v }));
  const setP = (k, v) => setPool(f => ({ ...f, [k]: v }));

  // Step 1: Create Lead first
  const createLeadMutation = useMutation({
    mutationFn: async () => {
      const serviceAddress = [contact.streetAddress, contact.city, contact.state, contact.zipCode].filter(Boolean).join(', ');
      return base44.entities.Lead.create({
        ...contact,
        serviceAddress,
        stage: 'new_lead',
        isEligible: true,
        isDeleted: false,
        quoteGenerated: false
      });
    },
    onSuccess: (lead) => {
      setLeadId(lead.id);
      setStep(1);
    }
  });

  // Step 2: Generate quote with leadId
  const generateQuoteMutation = useMutation({
    mutationFn: async () => {
      const res = await base44.functions.invoke('calculateQuote', { ...pool, clientEmail: contact.email });
      return res.data;
    },
    onSuccess: async (quoteData) => {
      // Create Quote record linked to Lead
      await base44.entities.Quote.create({
        clientEmail: contact.email,
        clientFirstName: contact.firstName,
        clientLastName: contact.lastName,
        clientPhone: contact.mobilePhone,
        status: 'quoted',
        ...mapPoolToQuoteInputs(pool),
        outputMonthlyPrice: quoteData.finalMonthlyPrice,
        outputPerVisitPrice: quoteData.estimatedPerVisitPrice,
        outputOneTimeFees: quoteData.oneTimeFees,
        outputFirstMonthTotal: quoteData.estimatedFirstMonthTotal,
        outputFrequency: quoteData.frequencySelectedOrRequired,
        outputSizeTier: quoteData.sizeTier,
        pricingEngineVersion: quoteData.quoteLogicVersionId
      });
      // Advance Lead to quote_sent
      await base44.entities.Lead.update(leadId, {
        stage: 'quote_sent',
        quoteGenerated: true
      });
      setQuoteResult(quoteData);
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      setStep(2);
    }
  });

  if (step === 2 && quoteResult) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
        <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-8 text-center" onClick={e => e.stopPropagation()}>
          <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-900 mb-2">Quote Generated!</h2>
          <p className="text-gray-600 mb-6">Lead created and advanced to <strong>Quote Sent</strong>.</p>
          <div className="bg-gray-50 rounded-lg p-4 text-left space-y-2 mb-6">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Monthly Price</span>
              <span className="font-bold text-teal-600">${quoteResult.finalMonthlyPrice}/mo</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">One-Time Fees</span>
              <span className="font-medium">${quoteResult.oneTimeFees || 0}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">First Month Total</span>
              <span className="font-medium">${quoteResult.estimatedFirstMonthTotal}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Frequency</span>
              <span className="font-medium capitalize">{quoteResult.frequencySelectedOrRequired?.replace(/_/g, ' ')}</span>
            </div>
          </div>
          <Button onClick={onClose} className="w-full bg-teal-600 hover:bg-teal-700">Done</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-6 border-b">
          <div>
            <h2 className="text-lg font-bold text-gray-900">New Quote</h2>
            <p className="text-sm text-gray-500">Step {step + 1} of 2 — {step === 0 ? 'Customer Contact' : 'Pool Details'}</p>
          </div>
          <button onClick={onClose}><X className="w-5 h-5 text-gray-500" /></button>
        </div>

        <div className="p-6 space-y-6">
          {step === 0 && (
            <>
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-3">Contact Information</h3>
                <div className="grid grid-cols-2 gap-4">
                  <FormField label="First Name *" value={contact.firstName} onChange={v => setC('firstName', v)} />
                  <FormField label="Last Name" value={contact.lastName} onChange={v => setC('lastName', v)} />
                  <FormField label="Email *" type="email" value={contact.email} onChange={v => setC('email', v)} />
                  <FormField label="Phone" type="tel" value={contact.mobilePhone} onChange={v => setC('mobilePhone', v)} />
                  <div className="col-span-2">
                    <FormField label="Street Address" value={contact.streetAddress} onChange={v => setC('streetAddress', v)} />
                  </div>
                  <FormField label="City" value={contact.city} onChange={v => setC('city', v)} />
                  <FormField label="ZIP" value={contact.zipCode} onChange={v => setC('zipCode', v)} />
                  <FormSelect label="State" value={contact.state} onChange={v => setC('state', v)}
                    options={['FL','GA','SC','NC','TX','CA','AL','other'].map(s => ({ value: s, label: s }))} />
                  <FormSelect label="Preferred Contact" value={contact.preferredContact} onChange={v => setC('preferredContact', v)}
                    options={[{ value: 'text', label: 'Text' }, { value: 'phone', label: 'Phone' }, { value: 'email', label: 'Email' }]} />
                </div>
              </div>
              <div className="flex gap-3 pt-2 border-t">
                <Button
                  onClick={() => createLeadMutation.mutate()}
                  disabled={!contact.email || !contact.firstName || createLeadMutation.isPending}
                  className="bg-teal-600 hover:bg-teal-700"
                >
                  {createLeadMutation.isPending ? 'Creating Lead...' : 'Create Lead & Continue'}
                  <ArrowRight className="w-4 h-4 ml-1" />
                </Button>
                <Button variant="outline" onClick={onClose}>Cancel</Button>
              </div>
            </>
          )}

          {step === 1 && (
            <>
              <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-2 text-sm text-green-800">
                ✓ Lead created (ID: {leadId?.slice(-8)}). Now generate the quote.
              </div>
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-3">Pool Information</h3>
                <div className="grid grid-cols-2 gap-4">
                  <FormSelect label="Pool Size" value={pool.poolSize} onChange={v => setP('poolSize', v)}
                    options={[
                      { value: '10_15k', label: '10,000–15,000 gal' },
                      { value: '15_20k', label: '15,000–20,000 gal' },
                      { value: '20_30k', label: '20,000–30,000 gal' },
                      { value: '30k_plus', label: '30,000+ gal' }
                    ]} />
                  <FormSelect label="Pool Type" value={pool.poolType} onChange={v => setP('poolType', v)}
                    options={[{ value: 'in_ground', label: 'In Ground' }, { value: 'above_ground', label: 'Above Ground' }]} />
                  <FormSelect label="Enclosure" value={pool.enclosure} onChange={v => setP('enclosure', v)}
                    options={[{ value: 'fully_screened', label: 'Fully Screened' }, { value: 'unscreened', label: 'Unscreened' }, { value: 'indoor', label: 'Indoor' }]} />
                  <FormSelect label="Filter" value={pool.filterType} onChange={v => setP('filterType', v)}
                    options={[{ value: 'sand', label: 'Sand' }, { value: 'cartridge', label: 'Cartridge' }, { value: 'de', label: 'DE' }, { value: 'not_sure', label: 'Not Sure' }]} />
                  <FormSelect label="Chlorination" value={pool.chlorinationMethod} onChange={v => setP('chlorinationMethod', v)}
                    options={[{ value: 'saltwater', label: 'Saltwater' }, { value: 'tablets', label: 'Tablets' }, { value: 'liquid_chlorine', label: 'Liquid Chlorine' }, { value: 'mineral', label: 'Mineral' }, { value: 'not_sure', label: 'Not Sure' }]} />
                  <FormSelect label="Usage" value={pool.useFrequency} onChange={v => setP('useFrequency', v)}
                    options={[{ value: 'rarely', label: 'Rarely' }, { value: 'weekends', label: 'Weekends' }, { value: 'several_week', label: 'Several/Week' }, { value: 'daily', label: 'Daily' }]} />
                  <FormSelect label="Pool Condition" value={pool.poolCondition} onChange={v => setP('poolCondition', v)}
                    options={[{ value: 'clear', label: 'Clear' }, { value: 'slightly_cloudy', label: 'Slightly Cloudy' }, { value: 'green_algae', label: 'Green/Algae' }, { value: 'not_sure', label: 'Not Sure' }]} />
                  <FormSelect label="Pets Access Pool?" value={pool.petsAccess ? 'true' : 'false'} onChange={v => setP('petsAccess', v === 'true')}
                    options={[{ value: 'false', label: 'No' }, { value: 'true', label: 'Yes' }]} />
                </div>
              </div>
              <div className="flex gap-3 pt-2 border-t">
                <Button
                  onClick={() => generateQuoteMutation.mutate()}
                  disabled={generateQuoteMutation.isPending}
                  className="bg-teal-600 hover:bg-teal-700"
                >
                  {generateQuoteMutation.isPending ? 'Generating...' : 'Generate Quote'}
                </Button>
                <Button variant="outline" onClick={onClose}>Cancel</Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function FormField({ label, value, onChange, type = 'text' }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} className="w-full border rounded px-3 py-2 text-sm" />
    </div>
  );
}

function FormSelect({ label, value, onChange, options }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      <select value={value} onChange={e => onChange(e.target.value)} className="w-full border rounded px-3 py-2 text-sm">
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

function mapPoolToQuoteInputs(pool) {
  return {
    inputPoolSize: pool.poolSize,
    inputPoolType: pool.poolType,
    inputSpaPresent: pool.spaPresent === 'true',
    inputEnclosure: pool.enclosure,
    inputTreesOverhead: pool.treesOverhead,
    inputFilterType: pool.filterType,
    inputChlorinationMethod: pool.chlorinationMethod,
    inputChlorinatiorType: pool.chlorinatorType,
    inputUseFrequency: pool.useFrequency,
    inputPetsAccess: pool.petsAccess,
    inputPetSwimFrequency: pool.petSwimFrequency,
    inputPoolCondition: pool.poolCondition,
    inputGreenPoolSeverity: pool.greenPoolSeverity
  };
}