import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { CheckCircle2, Camera, Loader2, Upload } from 'lucide-react';
import { toast } from 'sonner';

const TEAL = '#1B9B9F';

function Field({ label, children }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-medium text-gray-700">{label}</Label>
      {children}
    </div>
  );
}

export default function InspectionSubmitForm({ lead, calendarEvent, onSubmitted }) {
  const [form, setForm] = useState({
    confirmedPoolSize: lead?.inputPoolSize || '',
    confirmedPoolType: lead?.poolType || 'in_ground',
    confirmedEnclosure: lead?.screenedArea || '',
    confirmedFilterType: lead?.filterType || '',
    confirmedChlorinationMethod: lead?.sanitizerType || '',
    confirmedSpaPresent: lead?.spaPresent === 'true' ? true : false,
    confirmedTreesOverhead: lead?.treesOverhead || 'no',
    confirmedPoolCondition: lead?.poolCondition || '',
    greenSeverity: '',
    equipmentNotes: '',
    techNotes: '',
    customerPresent: true,
  });
  const [photos, setPhotos] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

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
      toast.success('Inspection submitted');
      if (onSubmitted) onSubmitted(result.data.inspectionRecordId);
    } else {
      toast.error(result.data?.error || 'Submission failed');
    }
  };

  if (done) {
    return (
      <div className="text-center py-10 space-y-3">
        <div className="w-14 h-14 rounded-full bg-teal-100 flex items-center justify-center mx-auto">
          <CheckCircle2 className="w-7 h-7 text-teal-600" />
        </div>
        <h3 className="font-bold text-gray-900">Inspection Submitted</h3>
        <p className="text-sm text-gray-500">Pending finalization by admin.</p>
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Submit Inspection — {lead?.firstName} {lead?.lastName}</CardTitle>
        <p className="text-sm text-gray-500">{lead?.serviceAddress}</p>
      </CardHeader>
      <CardContent className="space-y-5">

        {/* Pool Size */}
        <Field label="Pool Size (confirmed)">
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
        <Field label="Filter Type (confirmed)">
          <Select value={form.confirmedFilterType} onValueChange={v => set('confirmedFilterType', v)}>
            <SelectTrigger><SelectValue placeholder="Select filter" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="sand">Sand</SelectItem>
              <SelectItem value="cartridge">Cartridge</SelectItem>
              <SelectItem value="de">DE</SelectItem>
              <SelectItem value="not_sure">Not sure</SelectItem>
            </SelectContent>
          </Select>
        </Field>

        {/* Chlorination */}
        <Field label="Chlorination Method (confirmed)">
          <Select value={form.confirmedChlorinationMethod} onValueChange={v => set('confirmedChlorinationMethod', v)}>
            <SelectTrigger><SelectValue placeholder="Select method" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="saltwater">Saltwater</SelectItem>
              <SelectItem value="tablets">Tablets</SelectItem>
              <SelectItem value="liquid_chlorine">Liquid Chlorine</SelectItem>
              <SelectItem value="mineral">Mineral</SelectItem>
              <SelectItem value="not_sure">Not sure</SelectItem>
            </SelectContent>
          </Select>
        </Field>

        {/* Pool Condition */}
        <Field label="Pool Condition Observed *">
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

        {/* Green severity */}
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

        {/* Customer Present */}
        <Field label="Customer / Caretaker Present?">
          <Select value={form.customerPresent ? 'yes' : 'no'} onValueChange={v => set('customerPresent', v === 'yes')}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="yes">Yes</SelectItem>
              <SelectItem value="no">No</SelectItem>
            </SelectContent>
          </Select>
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