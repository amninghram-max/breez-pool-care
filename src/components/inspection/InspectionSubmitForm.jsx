import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { CheckCircle2, Camera, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

const TEAL = '#1B9B9F';

function Field({ label, sublabel, children }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-medium text-gray-700">{label}</Label>
      {sublabel && <p className="text-xs text-gray-400">{sublabel}</p>}
      {children}
    </div>
  );
}

function SectionHeader({ title }) {
  return (
    <div className="pt-2">
      <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide border-b pb-1">{title}</h3>
    </div>
  );
}

// Map lead fields to form defaults
function getDefaults(lead) {
  // Chlorination: map sanitizerType to simplified saltwater/regular_chlorine
  const sanitizer = lead?.sanitizerType || '';
  let chlorination = 'regular_chlorine';
  if (sanitizer === 'saltwater') chlorination = 'saltwater';

  return {
    confirmedPoolSize: lead?.inputPoolSize || lead?.poolSize || '',
    confirmedPoolType: lead?.poolType || 'in_ground',
    confirmedEnclosure: lead?.screenedArea || lead?.enclosure || '',
    confirmedFilterType: lead?.filterType === 'de' ? '' : (lead?.filterType || ''),
    confirmedChlorinationMethod: chlorination,
    confirmedSpaPresent: lead?.spaPresent === 'true' || lead?.spaPresent === true,
    confirmedTreesOverhead: lead?.treesOverhead || 'no',
    confirmedPoolCondition: lead?.poolCondition || '',
    confirmedUsageFrequency: lead?.usageFrequency || '',
    greenSeverity: '',
    // Chemistry readings
    freeChlorine: '',
    pH: '',
    totalAlkalinity: '',
    salt: '',
    // Notes
    equipmentNotes: '',
    techNotes: '',
    accessInstructions: lead?.gateCode || '',
  };
}

export default function InspectionSubmitForm({ lead, calendarEvent, onSubmitted }) {
  const [form, setForm] = useState(() => getDefaults(lead));
  const [photos, setPhotos] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [priceSnapshot, setPriceSnapshot] = useState(null);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handlePhotoUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    setUploading(true);
    const urls = [];
    for (const file of files) {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      urls.push(file_url);
    }
    setPhotos(p => [...p, ...urls]);
    setUploading(false);
    toast.success(`${urls.length} photo(s) uploaded`);
  };

  const handleSubmit = async () => {
    if (!form.confirmedPoolCondition) {
      toast.error('Pool condition is required');
      return;
    }
    setSubmitting(true);
    const result = await base44.functions.invoke('submitInspection', {
      leadId: lead.id,
      calendarEventId: calendarEvent?.id || null,
      ...form,
      photoBefore: photos,
    });
    setSubmitting(false);
    if (result.data?.success) {
      setDone(true);
      setPriceSnapshot(result.data.priceSnapshot || null);
      toast.success('Inspection submitted');
      if (onSubmitted) onSubmitted(result.data.inspectionRecordId);
    } else {
      toast.error(result.data?.error || 'Submission failed');
    }
  };

  if (done) {
    const monthly = priceSnapshot?.monthly ?? priceSnapshot?.outputMonthlyPrice ?? null;
    const frequency = priceSnapshot?.frequency ?? priceSnapshot?.outputFrequency ?? 'weekly';
    const oneTime = priceSnapshot?.oneTimeFees ?? priceSnapshot?.outputOneTimeFees ?? 0;

    return (
      <Card>
        <CardContent className="py-10 space-y-5">
          <div className="text-center space-y-2">
            <div className="w-14 h-14 rounded-full bg-teal-100 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-7 h-7 text-teal-600" />
            </div>
            <h3 className="font-bold text-gray-900 text-lg">Inspection Submitted</h3>
            <p className="text-sm text-gray-500">Pending finalization by admin.</p>
          </div>

          {monthly != null && (
            <div className="border-2 rounded-xl p-5 text-center space-y-1" style={{ borderColor: TEAL, background: '#e8f8f9' }}>
              <p className="text-xs uppercase tracking-wide font-semibold" style={{ color: TEAL }}>Updated Price Snapshot</p>
              <p className="text-3xl font-bold" style={{ color: TEAL }}>
                ${monthly.toFixed(2)}<span className="text-base font-normal text-gray-500">/mo</span>
              </p>
              <p className="text-sm text-gray-500 capitalize">{frequency === 'twice_weekly' ? 'Twice Weekly' : 'Weekly'} service</p>
              {oneTime > 0 && (
                <p className="text-sm text-gray-600 font-medium">One-time fee: ${oneTime.toFixed(2)}</p>
              )}
            </div>
          )}

          <p className="text-xs text-center text-gray-400">Admin will finalize and send the activation email.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Submit Inspection — {lead?.firstName} {lead?.lastName}</CardTitle>
        <p className="text-sm text-gray-500">{lead?.serviceAddress}</p>
      </CardHeader>
      <CardContent className="space-y-5">

        <SectionHeader title="Pool Details (Confirmed)" />

        {/* Pool Size */}
        <Field label="Pool Size">
          <Select value={form.confirmedPoolSize} onValueChange={v => set('confirmedPoolSize', v)}>
            <SelectTrigger><SelectValue placeholder="Select size" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="10_15k">10,000–15,000 gal</SelectItem>
              <SelectItem value="15_20k">15,000–20,000 gal</SelectItem>
              <SelectItem value="20_30k">20,000–30,000 gal</SelectItem>
              <SelectItem value="30k_plus">30,000+ gal</SelectItem>
              <SelectItem value="not_sure">Not sure</SelectItem>
            </SelectContent>
          </Select>
        </Field>

        {/* Enclosure */}
        <Field label="Enclosure">
          <Select value={form.confirmedEnclosure} onValueChange={v => set('confirmedEnclosure', v)}>
            <SelectTrigger><SelectValue placeholder="Select enclosure" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="fully_screened">Fully Screened</SelectItem>
              <SelectItem value="unscreened">Unscreened</SelectItem>
              <SelectItem value="indoor">Indoor</SelectItem>
            </SelectContent>
          </Select>
        </Field>

        {/* Trees (conditional) */}
        {form.confirmedEnclosure === 'unscreened' && (
          <Field label="Trees Overhead?">
            <Select value={form.confirmedTreesOverhead} onValueChange={v => set('confirmedTreesOverhead', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="yes">Yes</SelectItem>
                <SelectItem value="no">No</SelectItem>
                <SelectItem value="not_sure">Not sure</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        )}

        {/* Filter */}
        <Field label="Filter Type">
          <Select value={form.confirmedFilterType} onValueChange={v => set('confirmedFilterType', v)}>
            <SelectTrigger><SelectValue placeholder="Select filter" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="sand">Sand</SelectItem>
              <SelectItem value="cartridge">Cartridge</SelectItem>
              <SelectItem value="not_sure">Not sure</SelectItem>
            </SelectContent>
          </Select>
        </Field>

        {/* Chlorination — simplified */}
        <Field label="Chlorination Type">
          <Select value={form.confirmedChlorinationMethod} onValueChange={v => set('confirmedChlorinationMethod', v)}>
            <SelectTrigger><SelectValue placeholder="Select method" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="saltwater">Saltwater Chlorinator</SelectItem>
              <SelectItem value="regular_chlorine">Regular Chlorine</SelectItem>
            </SelectContent>
          </Select>
        </Field>

        {/* Pool Condition */}
        <Field label="Pool Condition *">
          <Select value={form.confirmedPoolCondition} onValueChange={v => set('confirmedPoolCondition', v)}>
            <SelectTrigger><SelectValue placeholder="Select condition" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="clear">Clear</SelectItem>
              <SelectItem value="slightly_cloudy">Slightly Cloudy</SelectItem>
              <SelectItem value="green">Green / Algae</SelectItem>
              <SelectItem value="not_sure">Not sure</SelectItem>
            </SelectContent>
          </Select>
        </Field>

        {form.confirmedPoolCondition === 'green' && (
          <Field label="Green Pool Severity">
            <Select value={form.greenSeverity} onValueChange={v => set('greenSeverity', v)}>
              <SelectTrigger><SelectValue placeholder="Select severity" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="light">Light</SelectItem>
                <SelectItem value="moderate">Moderate</SelectItem>
                <SelectItem value="black_swamp">Black Swamp</SelectItem>
                <SelectItem value="not_sure">Not sure</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        )}

        {/* Spa */}
        <Field label="Spa / Hot Tub Present?">
          <Select value={form.confirmedSpaPresent ? 'yes' : 'no'} onValueChange={v => set('confirmedSpaPresent', v === 'yes')}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="yes">Yes</SelectItem>
              <SelectItem value="no">No</SelectItem>
            </SelectContent>
          </Select>
        </Field>

        {/* Pool Usage */}
        <Field label="Pool Usage Frequency">
          <Select value={form.confirmedUsageFrequency} onValueChange={v => set('confirmedUsageFrequency', v)}>
            <SelectTrigger><SelectValue placeholder="Select usage" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="rarely">Rarely (a few times a year)</SelectItem>
              <SelectItem value="weekends">Weekends only</SelectItem>
              <SelectItem value="several_week">Several times a week</SelectItem>
              <SelectItem value="daily">Daily</SelectItem>
            </SelectContent>
          </Select>
        </Field>

        <SectionHeader title="Chemistry Readings" />

        <div className="grid grid-cols-2 gap-4">
          <Field label="Free Chlorine (ppm)">
            <Input
              type="number"
              step="0.1"
              placeholder="e.g. 2.5"
              value={form.freeChlorine}
              onChange={e => set('freeChlorine', e.target.value)}
            />
          </Field>
          <Field label="pH">
            <Input
              type="number"
              step="0.1"
              placeholder="e.g. 7.4"
              value={form.pH}
              onChange={e => set('pH', e.target.value)}
            />
          </Field>
          <Field label="Total Alkalinity (ppm)">
            <Input
              type="number"
              step="1"
              placeholder="e.g. 100"
              value={form.totalAlkalinity}
              onChange={e => set('totalAlkalinity', e.target.value)}
            />
          </Field>
          {form.confirmedChlorinationMethod === 'saltwater' && (
            <Field label="Salt (ppm)">
              <Input
                type="number"
                step="10"
                placeholder="e.g. 3200"
                value={form.salt}
                onChange={e => set('salt', e.target.value)}
              />
            </Field>
          )}
        </div>

        <SectionHeader title="Notes" />

        {/* Access Instructions — persists to customer profile */}
        <Field
          label="Access Instructions"
          sublabel="Gate codes, lockbox combos, or access notes — saved to this customer's profile for every future service visit."
        >
          <Textarea
            value={form.accessInstructions}
            onChange={e => set('accessInstructions', e.target.value)}
            placeholder="e.g. Gate code: 1234, lockbox on left side of fence..."
            rows={2}
          />
        </Field>

        {/* Equipment Notes */}
        <Field label="Equipment Observations">
          <Textarea
            value={form.equipmentNotes}
            onChange={e => set('equipmentNotes', e.target.value)}
            placeholder="Pump condition, filter, heater, salt cell, any concerns..."
            rows={3}
          />
        </Field>

        {/* Tech Notes */}
        <Field label="General Notes">
          <Textarea
            value={form.techNotes}
            onChange={e => set('techNotes', e.target.value)}
            placeholder="Any additional notes for the record..."
            rows={2}
          />
        </Field>

        {/* Photo Upload */}
        <div className="space-y-2">
          <Label className="text-sm font-medium text-gray-700">Photos</Label>
          <label className="flex items-center gap-2 cursor-pointer border-2 border-dashed border-gray-200 rounded-lg p-4 hover:border-teal-400 transition-colors">
            {uploading ? <Loader2 className="w-5 h-5 animate-spin text-teal-600" /> : <Camera className="w-5 h-5 text-gray-400" />}
            <span className="text-sm text-gray-500">{uploading ? 'Uploading...' : 'Tap to add photos'}</span>
            <input type="file" accept="image/*" multiple className="hidden" onChange={handlePhotoUpload} disabled={uploading} />
          </label>
          {photos.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {photos.map((url, i) => (
                <img key={i} src={url} alt="inspection" className="w-16 h-16 object-cover rounded-lg border" />
              ))}
            </div>
          )}
        </div>

        <Button
          onClick={handleSubmit}
          disabled={submitting || !form.confirmedPoolCondition}
          className="w-full h-12 text-white"
          style={{ backgroundColor: TEAL }}
        >
          {submitting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Submitting...</> : 'Submit Inspection'}
        </Button>
      </CardContent>
    </Card>
  );
}