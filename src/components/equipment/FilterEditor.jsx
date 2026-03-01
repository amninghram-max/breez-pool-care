import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Save, Loader2, Wrench } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { toast } from 'sonner';
import EquipmentChangeHistory from './EquipmentChangeHistory';

export default function FilterEditor({ equipment, user, onSaved }) {
  const queryClient = useQueryClient();
  const [filterType, setFilterType] = useState(equipment.filterType || '');
  const [normalPsi, setNormalPsi] = useState(equipment.normalPsi ? String(equipment.normalPsi) : '');
  const [reason, setReason] = useState('');

  const psiNum = parseFloat(normalPsi) || 0;
  const threshold = psiNum > 0 ? psiNum + 10 : null;

  // Load visit maintenance logs (ChemTestRecord notes for this equipment)
  const { data: visitLogs = [] } = useQuery({
    queryKey: ['filterVisitLogs', equipment.poolId],
    queryFn: () => base44.entities.ChemTestRecord.filter({ poolId: equipment.poolId }, '-testDate', 20),
    enabled: !!equipment.poolId
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const before = { filterType: equipment.filterType, normalPsi: equipment.normalPsi };
      const after = { filterType, normalPsi: psiNum || null };
      await base44.entities.PoolEquipment.update(equipment.id, after);
      await base44.entities.EquipmentChangeLog.create({
        equipmentId: equipment.id,
        leadId: equipment.leadId,
        changedByUserId: user.id,
        changedByName: user.full_name,
        changedAt: new Date().toISOString(),
        fieldChanged: 'filter_settings',
        snapshotBefore: JSON.stringify(before),
        snapshotAfter: JSON.stringify(after),
        reason
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['poolEquipment'] });
      queryClient.invalidateQueries({ queryKey: ['eqChangeLogs', equipment.id] });
      toast.success('Filter settings saved');
      if (onSaved) onSaved();
    }
  });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label className="text-xs">Filter Type</Label>
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select…" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="sand">Sand</SelectItem>
              <SelectItem value="cartridge">Cartridge</SelectItem>
              <SelectItem value="de">DE</SelectItem>
              <SelectItem value="not_sure">Not Sure</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Normal PSI (staff-only)</Label>
          <Input type="number" min="0" step="0.5" value={normalPsi}
            onChange={e => setNormalPsi(e.target.value)}
            placeholder="e.g. 18" className="h-8 text-sm" />
        </div>
      </div>

      {threshold && (
        <div className="flex items-center gap-3 bg-yellow-50 border border-yellow-200 rounded-lg px-3 py-2 text-sm">
          <span className="text-yellow-800">Backwash/inspect threshold:</span>
          <Badge className="bg-yellow-100 text-yellow-800 font-mono">&gt;{threshold} PSI</Badge>
          <span className="text-xs text-yellow-600">(Normal + 10)</span>
        </div>
      )}

      <div className="space-y-1.5">
        <Label className="text-xs">Reason for change (optional)</Label>
        <Input value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. Verified at first service" className="h-8 text-sm" />
      </div>

      <Button size="sm" className="bg-teal-600 hover:bg-teal-700" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
        {saveMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <Save className="w-3.5 h-3.5 mr-1" />}
        Save Filter Settings
      </Button>

      {/* Maintenance log from visit records */}
      {visitLogs.length > 0 && (
        <div className="border-t pt-3">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
            <Wrench className="w-3.5 h-3.5" /> Maintenance History (from visits)
          </p>
          <div className="space-y-1.5 max-h-48 overflow-y-auto">
            {visitLogs.filter(v => v.notes).map(v => (
              <div key={v.id} className="text-xs bg-gray-50 rounded p-2">
                <span className="text-gray-400">{v.testDate ? format(parseISO(v.testDate), 'MMM d, yyyy') : '—'}</span>
                <span className="mx-2 text-gray-300">·</span>
                <span className="text-gray-700">{v.notes}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <EquipmentChangeHistory equipmentId={equipment.id} />
    </div>
  );
}