import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';
import { toast } from 'sonner';

const STATES = ['FL','AL','GA','SC','NC','TX','CA','NY','other'];

export default function NewLeadModal({ onClose }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    firstName: '', lastName: '', email: '', mobilePhone: '',
    streetAddress: '', city: '', state: 'FL', zipCode: '',
    preferredContact: 'text',
    poolType: '', poolSurface: '',
    filterType: '', sanitizerType: '',
    screenedArea: '', poolCondition: '',
    usageFrequency: '', accessRestrictions: 'none',
    isEligible: true, notes: ''
  });

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const field = (label, key, type = 'text', opts = null) => (
    <div key={key}>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      {opts ? (
        <select value={form[key] || ''} onChange={e => set(key, e.target.value || '')} className="w-full border rounded px-3 py-2 text-sm">
          <option value="">Select…</option>
          {opts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      ) : (
        <input type={type} value={form[key]} onChange={e => set(key, e.target.value)} className="w-full border rounded px-3 py-2 text-sm" />
      )}
    </div>
  );

  const createMutation = useMutation({
    mutationFn: async (data) => {
      const serviceAddress = [data.streetAddress, data.city, data.state, data.zipCode].filter(Boolean).join(', ');
      const res = await base44.functions.invoke('processLead', {
        leadData: { ...data, serviceAddress }
      });
      if (!res.data?.success) {
        throw new Error(res.data?.error || 'Failed to create lead');
      }
      return res.data;
    },
    onSuccess: (data) => {
      toast.success(`Lead created: ${data.leadId}`);
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      onClose();
    },
    onError: (err) => {
      toast.error(err.message || 'Failed to create lead');
    }
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.email) return;
    createMutation.mutate(form);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-lg font-bold text-gray-900">New Lead</h2>
          <button onClick={onClose}><X className="w-5 h-5 text-gray-500" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Contact */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Contact Information</h3>
            <div className="grid grid-cols-2 gap-4">
              {field('First Name *', 'firstName')}
              {field('Last Name', 'lastName')}
              {field('Email *', 'email', 'email')}
              {field('Mobile Phone', 'mobilePhone', 'tel')}
              {field('Preferred Contact', 'preferredContact', 'text', [
                { value: 'text', label: 'Text' },
                { value: 'phone', label: 'Phone' },
                { value: 'email', label: 'Email' }
              ])}
            </div>
          </div>

          {/* Address */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Service Address</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">{field('Street Address', 'streetAddress')}</div>
              {field('City', 'city')}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">State</label>
                <select value={form.state} onChange={e => set('state', e.target.value)} className="w-full border rounded px-3 py-2 text-sm">
                  {STATES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              {field('ZIP Code', 'zipCode')}
            </div>
          </div>

          {/* Pool */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Pool Details</h3>
            <div className="grid grid-cols-2 gap-4">
              {field('Pool Type', 'poolType', 'text', [
                { value: 'in_ground', label: 'In Ground' },
                { value: 'above_ground', label: 'Above Ground' },
                { value: 'not_sure', label: 'Not Sure' }
              ])}
              {field('Pool Surface', 'poolSurface', 'text', [
                { value: 'concrete', label: 'Concrete' },
                { value: 'fiberglass', label: 'Fiberglass' },
                { value: 'vinyl', label: 'Vinyl' },
                { value: 'not_sure', label: 'Not Sure' }
              ])}
              {field('Filter Type', 'filterType', 'text', [
                { value: 'sand', label: 'Sand' },
                { value: 'cartridge', label: 'Cartridge' },
                { value: 'de', label: 'DE' },
                { value: 'not_sure', label: 'Not Sure' }
              ])}
              {field('Sanitizer', 'sanitizerType', 'text', [
                { value: 'saltwater', label: 'Saltwater' },
                { value: 'tablets', label: 'Tablets' },
                { value: 'liquid_chlorine', label: 'Liquid Chlorine' },
                { value: 'mineral', label: 'Mineral' },
                { value: 'not_sure', label: 'Not Sure' }
              ])}
              {field('Enclosure', 'screenedArea', 'text', [
                { value: 'fully_screened', label: 'Fully Screened' },
                { value: 'unscreened', label: 'Unscreened' },
                { value: 'indoor', label: 'Indoor' }
              ])}
              {field('Pool Condition', 'poolCondition', 'text', [
                { value: 'clear', label: 'Clear' },
                { value: 'slightly_cloudy', label: 'Slightly Cloudy' },
                { value: 'green', label: 'Green' },
                { value: 'not_sure', label: 'Not Sure' }
              ])}
              {field('Usage Frequency', 'usageFrequency', 'text', [
                { value: 'rarely', label: 'Rarely' },
                { value: 'weekends', label: 'Weekends' },
                { value: 'several_week', label: 'Several/Week' },
                { value: 'daily', label: 'Daily' }
              ])}
              {field('Access', 'accessRestrictions', 'text', [
                { value: 'none', label: 'None' },
                { value: 'locked_gate', label: 'Locked Gate' },
                { value: 'code_required', label: 'Code Required' },
                { value: 'hoa', label: 'HOA' },
                { value: 'other', label: 'Other' }
              ])}
            </div>
          </div>

          {/* Eligibility & Notes */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Eligible?</label>
              <select value={form.isEligible ? 'true' : 'false'} onChange={e => set('isEligible', e.target.value === 'true')} className="w-full border rounded px-3 py-2 text-sm">
                <option value="true">Yes</option>
                <option value="false">No</option>
              </select>
            </div>
            {!form.isEligible && (
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Disqualification Reason</label>
                <input type="text" value={form.disqualificationReason || ''} onChange={e => set('disqualificationReason', e.target.value)} className="w-full border rounded px-3 py-2 text-sm" />
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Internal Notes</label>
            <textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={2} className="w-full border rounded px-3 py-2 text-sm" />
          </div>

          <div className="flex gap-3 pt-2 border-t">
            <Button type="submit" disabled={!form.email || createMutation.isPending} className="bg-teal-600 hover:bg-teal-700">
              {createMutation.isPending ? 'Creating...' : 'Create Lead'}
            </Button>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          </div>
        </form>
      </div>
    </div>
  );
}