import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Wrench, Upload, ExternalLink, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import { toast } from 'sonner';

const TYPE_LABELS = {
  pump: 'Pump', filter: 'Filter', heater: 'Heater',
  solar_heater: 'Solar Heater', automation: 'Automation',
  salt_cell: 'Salt Cell', other: 'Other'
};

function EquipmentRow({ eq }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [linkVal, setLinkVal] = useState(eq.manufacturerWebsiteUrl || '');
  const [saving, setSaving] = useState(false);

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    await base44.entities.PoolEquipment.update(eq.id, { manualPdfUrl: file_url });
    queryClient.invalidateQueries({ queryKey: ['allEquipment'] });
    setUploading(false);
    toast.success('Manual uploaded');
  };

  const handleSaveLink = async () => {
    setSaving(true);
    await base44.entities.PoolEquipment.update(eq.id, { manufacturerWebsiteUrl: linkVal });
    queryClient.invalidateQueries({ queryKey: ['allEquipment'] });
    setSaving(false);
    toast.success('Link saved');
  };

  return (
    <div className="border-b border-gray-50 last:border-0">
      <button
        className="w-full flex items-center justify-between py-2.5 text-left hover:bg-gray-50 px-1 rounded"
        onClick={() => setOpen(v => !v)}
      >
        <div>
          <span className="text-sm font-medium text-gray-800">{TYPE_LABELS[eq.equipmentType] || eq.equipmentType}</span>
          {eq.brand && <span className="text-xs text-gray-400 ml-2">{eq.brand} {eq.model}</span>}
        </div>
        <div className="flex items-center gap-2">
          {eq.manualPdfUrl && <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded">PDF ✓</span>}
          {eq.manufacturerWebsiteUrl && <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">Link ✓</span>}
          {open ? <ChevronUp className="w-3.5 h-3.5 text-gray-400" /> : <ChevronDown className="w-3.5 h-3.5 text-gray-400" />}
        </div>
      </button>

      {open && (
        <div className="px-1 pb-3 space-y-3">
          {/* PDF Upload */}
          <div className="space-y-1">
            <Label className="text-xs">Owner's Manual (PDF)</Label>
            <div className="flex items-center gap-2">
              {eq.manualPdfUrl && (
                <a href={eq.manualPdfUrl} target="_blank" rel="noreferrer" className="text-xs text-teal-600 hover:underline flex items-center gap-1">
                  <ExternalLink className="w-3 h-3" /> View PDF
                </a>
              )}
              <label className="cursor-pointer">
                <input type="file" accept="application/pdf" className="hidden" onChange={handleFileUpload} />
                <span className="inline-flex items-center gap-1 text-xs border border-gray-300 rounded px-2 py-1 hover:bg-gray-50">
                  {uploading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
                  {uploading ? 'Uploading…' : eq.manualPdfUrl ? 'Replace PDF' : 'Upload PDF'}
                </span>
              </label>
            </div>
          </div>

          {/* Link */}
          <div className="space-y-1">
            <Label className="text-xs">Manufacturer / Product Page URL</Label>
            <div className="flex items-center gap-2">
              <Input
                value={linkVal}
                onChange={e => setLinkVal(e.target.value)}
                placeholder="https://..."
                className="h-8 text-xs"
              />
              <Button size="sm" className="h-8 text-xs" onClick={handleSaveLink} disabled={saving}>
                {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Save'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function EquipmentManualPanel() {
  const { data: equipment = [] } = useQuery({
    queryKey: ['allEquipment'],
    queryFn: () => base44.entities.PoolEquipment.filter({ isActive: true }, 'equipmentType')
  });

  const { data: leads = [] } = useQuery({
    queryKey: ['leadsMinimal'],
    queryFn: () => base44.entities.Lead.list('-created_date', 200)
  });

  const leadMap = Object.fromEntries(leads.map(l => [l.id, l]));

  // Group by customer
  const byLead = equipment.reduce((acc, eq) => {
    if (!acc[eq.leadId]) acc[eq.leadId] = [];
    acc[eq.leadId].push(eq);
    return acc;
  }, {});

  if (equipment.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Wrench className="w-4 h-4" /> Equipment Manuals
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-500">No equipment records yet.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Wrench className="w-4 h-4" /> Equipment Manuals & Links
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 max-h-96 overflow-y-auto">
        {Object.entries(byLead).map(([leadId, items]) => {
          const lead = leadMap[leadId];
          return (
            <div key={leadId}>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                {lead ? `${lead.firstName} ${lead.lastName || ''}`.trim() : leadId}
              </p>
              {items.map(eq => <EquipmentRow key={eq.id} eq={eq} />)}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}