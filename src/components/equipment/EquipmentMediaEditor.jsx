import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Upload, ExternalLink, Save, Loader2, Camera } from 'lucide-react';
import { toast } from 'sonner';

export default function EquipmentMediaEditor({ equipment }) {
  const queryClient = useQueryClient();
  const [manualUrl, setManualUrl] = useState(equipment.manufacturerWebsiteUrl || '');
  const [notes, setNotes] = useState(equipment.notes || '');
  const [uploadingLabel, setUploadingLabel] = useState(false);
  const [uploadingPdf, setUploadingPdf] = useState(false);
  const [savingText, setSavingText] = useState(false);

  const handleLabelPhoto = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploadingLabel(true);
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    await base44.entities.PoolEquipment.update(equipment.id, { labelPhotoUrl: file_url });
    queryClient.invalidateQueries({ queryKey: ['poolEquipment'] });
    setUploadingLabel(false);
    toast.success('Label photo saved');
  };

  const handlePdf = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploadingPdf(true);
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    await base44.entities.PoolEquipment.update(equipment.id, { manualPdfUrl: file_url });
    queryClient.invalidateQueries({ queryKey: ['poolEquipment'] });
    setUploadingPdf(false);
    toast.success('Manual PDF uploaded');
  };

  const saveText = async () => {
    setSavingText(true);
    await base44.entities.PoolEquipment.update(equipment.id, {
      manufacturerWebsiteUrl: manualUrl,
      notes
    });
    queryClient.invalidateQueries({ queryKey: ['poolEquipment'] });
    setSavingText(false);
    toast.success('Saved');
  };

  return (
    <div className="space-y-4">
      {/* Label photo */}
      <div className="space-y-1.5">
        <Label className="text-xs">Label / Nameplate Photo</Label>
        <div className="flex items-center gap-3">
          {equipment.labelPhotoUrl && (
            <a href={equipment.labelPhotoUrl} target="_blank" rel="noreferrer">
              <img src={equipment.labelPhotoUrl} alt="label" className="w-16 h-16 object-cover rounded-lg border" />
            </a>
          )}
          <label className="cursor-pointer">
            <input type="file" accept="image/*" className="hidden" onChange={handleLabelPhoto} />
            <span className="inline-flex items-center gap-1.5 text-xs border border-gray-300 rounded-lg px-3 py-2 hover:bg-gray-50">
              {uploadingLabel ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Camera className="w-3.5 h-3.5" />}
              {uploadingLabel ? 'Uploading…' : equipment.labelPhotoUrl ? 'Replace Photo' : 'Upload Photo'}
            </span>
          </label>
        </div>
      </div>

      {/* Manual PDF */}
      <div className="space-y-1.5">
        <Label className="text-xs">Operating Manual (PDF)</Label>
        <div className="flex items-center gap-3">
          {equipment.manualPdfUrl && (
            <a href={equipment.manualPdfUrl} target="_blank" rel="noreferrer"
              className="text-xs text-teal-600 hover:underline flex items-center gap-1">
              <ExternalLink className="w-3 h-3" /> View PDF
            </a>
          )}
          <label className="cursor-pointer">
            <input type="file" accept="application/pdf" className="hidden" onChange={handlePdf} />
            <span className="inline-flex items-center gap-1.5 text-xs border border-gray-300 rounded-lg px-3 py-2 hover:bg-gray-50">
              {uploadingPdf ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
              {uploadingPdf ? 'Uploading…' : equipment.manualPdfUrl ? 'Replace PDF' : 'Upload PDF'}
            </span>
          </label>
        </div>
      </div>

      {/* Manual URL */}
      <div className="space-y-1.5">
        <Label className="text-xs">Manufacturer / Product Page URL</Label>
        <Input value={manualUrl} onChange={e => setManualUrl(e.target.value)} placeholder="https://…" className="h-8 text-sm" />
      </div>

      {/* Quick ref notes */}
      <div className="space-y-1.5">
        <Label className="text-xs">Quick Reference Notes (internal)</Label>
        <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3}
          placeholder="e.g. Basket location, common issues, special settings…" className="text-sm" />
      </div>

      <Button size="sm" className="bg-teal-600 hover:bg-teal-700" onClick={saveText} disabled={savingText}>
        {savingText ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <Save className="w-3.5 h-3.5 mr-1" />}
        Save
      </Button>
    </div>
  );
}