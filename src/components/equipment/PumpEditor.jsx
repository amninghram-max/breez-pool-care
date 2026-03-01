import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Plus, Trash2, Save, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import EquipmentChangeHistory from './EquipmentChangeHistory';

function parseSafe(str, fallback) {
  try { return str ? JSON.parse(str) : fallback; } catch { return fallback; }
}

export default function PumpEditor({ equipment, user, onSaved }) {
  const queryClient = useQueryClient();
  const [pumpSpeed, setPumpSpeed] = useState(equipment.pumpSpeed || '');
  const [reason, setReason] = useState('');

  // Single-speed timer blocks
  const [timerBlocks, setTimerBlocks] = useState(
    parseSafe(equipment.pumpTimerSchedule, [{ on: '08:00', off: '20:00', daysActive: 'daily' }])
  );

  // VSP programs
  const [vspPrograms, setVspPrograms] = useState(
    parseSafe(equipment.pumpVspPrograms, [{ name: 'Filter', startTime: '08:00', endTime: '18:00', rpm: 2400, gpm: '' }])
  );

  const saveMutation = useMutation({
    mutationFn: async () => {
      const isVsp = pumpSpeed === 'variable_speed';
      const before = {
        pumpSpeed: equipment.pumpSpeed,
        pumpTimerSchedule: equipment.pumpTimerSchedule,
        pumpVspPrograms: equipment.pumpVspPrograms
      };
      const after = {
        pumpSpeed,
        pumpTimerSchedule: isVsp ? null : JSON.stringify(timerBlocks),
        pumpVspPrograms: isVsp ? JSON.stringify(vspPrograms) : null
      };
      await base44.entities.PoolEquipment.update(equipment.id, after);
      await base44.entities.EquipmentChangeLog.create({
        equipmentId: equipment.id,
        leadId: equipment.leadId,
        changedByUserId: user.id,
        changedByName: user.full_name,
        changedAt: new Date().toISOString(),
        fieldChanged: 'pump_schedule',
        snapshotBefore: JSON.stringify(before),
        snapshotAfter: JSON.stringify(after),
        reason
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['poolEquipment'] });
      queryClient.invalidateQueries({ queryKey: ['eqChangeLogs', equipment.id] });
      toast.success('Pump schedule saved');
      if (onSaved) onSaved();
    }
  });

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label className="text-xs">Pump Type</Label>
        <Select value={pumpSpeed} onValueChange={setPumpSpeed}>
          <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select type…" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="single_speed">Single Speed</SelectItem>
            <SelectItem value="variable_speed">Variable Speed (VSP)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {pumpSpeed === 'single_speed' && (
        <div className="space-y-2">
          <Label className="text-xs">Timer Schedule</Label>
          {timerBlocks.map((block, i) => (
            <div key={i} className="flex items-center gap-2 bg-gray-50 rounded-lg p-2">
              <div className="flex-1 grid grid-cols-3 gap-2">
                <div>
                  <p className="text-xs text-gray-400 mb-0.5">On</p>
                  <Input type="time" value={block.on} className="h-7 text-xs"
                    onChange={e => setTimerBlocks(b => b.map((x, j) => j === i ? { ...x, on: e.target.value } : x))} />
                </div>
                <div>
                  <p className="text-xs text-gray-400 mb-0.5">Off</p>
                  <Input type="time" value={block.off} className="h-7 text-xs"
                    onChange={e => setTimerBlocks(b => b.map((x, j) => j === i ? { ...x, off: e.target.value } : x))} />
                </div>
                <div>
                  <p className="text-xs text-gray-400 mb-0.5">Days</p>
                  <Select value={block.daysActive}
                    onValueChange={v => setTimerBlocks(b => b.map((x, j) => j === i ? { ...x, daysActive: v } : x))}>
                    <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="daily">Daily</SelectItem>
                      <SelectItem value="weekdays">Weekdays</SelectItem>
                      <SelectItem value="weekends">Weekends</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <button onClick={() => setTimerBlocks(b => b.filter((_, j) => j !== i))} className="text-red-400 hover:text-red-600">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
          <Button size="sm" variant="outline" className="h-7 text-xs"
            onClick={() => setTimerBlocks(b => [...b, { on: '08:00', off: '20:00', daysActive: 'daily' }])}>
            <Plus className="w-3 h-3 mr-1" /> Add Block
          </Button>
        </div>
      )}

      {pumpSpeed === 'variable_speed' && (
        <div className="space-y-2">
          <Label className="text-xs">VSP Programs</Label>
          {vspPrograms.map((prog, i) => (
            <div key={i} className="bg-gray-50 rounded-lg p-2.5 space-y-2">
              <div className="flex items-center justify-between">
                <Input value={prog.name} placeholder="Program name" className="h-7 text-xs w-40"
                  onChange={e => setVspPrograms(p => p.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} />
                <button onClick={() => setVspPrograms(p => p.filter((_, j) => j !== i))} className="text-red-400 hover:text-red-600">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="grid grid-cols-4 gap-2">
                {[
                  { key: 'startTime', label: 'Start', type: 'time' },
                  { key: 'endTime', label: 'End', type: 'time' },
                  { key: 'rpm', label: 'RPM', type: 'number' },
                  { key: 'gpm', label: 'GPM', type: 'number' }
                ].map(({ key, label, type }) => (
                  <div key={key}>
                    <p className="text-xs text-gray-400 mb-0.5">{label}</p>
                    <Input type={type} value={prog[key] || ''} className="h-7 text-xs"
                      onChange={e => setVspPrograms(p => p.map((x, j) => j === i ? { ...x, [key]: e.target.value } : x))} />
                  </div>
                ))}
              </div>
            </div>
          ))}
          <Button size="sm" variant="outline" className="h-7 text-xs"
            onClick={() => setVspPrograms(p => [...p, { name: '', startTime: '', endTime: '', rpm: '', gpm: '' }])}>
            <Plus className="w-3 h-3 mr-1" /> Add Program
          </Button>
        </div>
      )}

      <div className="space-y-1.5">
        <Label className="text-xs">Reason for change (optional)</Label>
        <Input value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. Seasonal adjustment" className="h-8 text-sm" />
      </div>

      <Button size="sm" className="bg-teal-600 hover:bg-teal-700" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
        {saveMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <Save className="w-3.5 h-3.5 mr-1" />}
        Save Pump Settings
      </Button>

      <EquipmentChangeHistory equipmentId={equipment.id} />
    </div>
  );
}