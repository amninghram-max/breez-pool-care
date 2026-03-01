import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Save, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import EquipmentChangeHistory from './EquipmentChangeHistory';

function parseSafe(str, fallback) {
  try { return str ? JSON.parse(str) : fallback; } catch { return fallback; }
}

export default function HeaterEditor({ equipment, user, onSaved }) {
  const queryClient = useQueryClient();
  const isSolar = equipment.equipmentType === 'solar_heater';

  const [enabled, setEnabled] = useState(isSolar ? !!equipment.solarEnabled : !!equipment.heaterEnabled);
  const [mode, setMode] = useState(equipment.heaterMode || 'heat');
  const [setpoint, setSetpoint] = useState(equipment.heaterSetpoint ? String(equipment.heaterSetpoint) : '');
  const [activationMode, setActivationMode] = useState(equipment.solarActivationMode || 'automatic');
  const [scheduleOn, setScheduleOn] = useState('');
  const [scheduleOff, setScheduleOff] = useState('');
  const [reason, setReason] = useState('');

  // Parse existing schedule
  React.useEffect(() => {
    const sch = parseSafe(isSolar ? equipment.solarSchedule : equipment.heaterSchedule, null);
    if (sch) { setScheduleOn(sch.on || ''); setScheduleOff(sch.off || ''); }
  }, []);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const schedule = (scheduleOn || scheduleOff) ? JSON.stringify({ on: scheduleOn, off: scheduleOff }) : null;
      const before = isSolar
        ? { solarEnabled: equipment.solarEnabled, solarActivationMode: equipment.solarActivationMode, solarSchedule: equipment.solarSchedule }
        : { heaterEnabled: equipment.heaterEnabled, heaterMode: equipment.heaterMode, heaterSetpoint: equipment.heaterSetpoint, heaterSchedule: equipment.heaterSchedule };
      const after = isSolar
        ? { solarEnabled: enabled, solarActivationMode: activationMode, solarSchedule: activationMode !== 'automatic' ? schedule : null }
        : { heaterEnabled: enabled, heaterMode: mode, heaterSetpoint: parseFloat(setpoint) || null, heaterSchedule: schedule };
      await base44.entities.PoolEquipment.update(equipment.id, after);
      await base44.entities.EquipmentChangeLog.create({
        equipmentId: equipment.id,
        leadId: equipment.leadId,
        changedByUserId: user.id,
        changedByName: user.full_name,
        changedAt: new Date().toISOString(),
        fieldChanged: isSolar ? 'solar_settings' : 'heater_settings',
        snapshotBefore: JSON.stringify(before),
        snapshotAfter: JSON.stringify(after),
        reason
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['poolEquipment'] });
      queryClient.invalidateQueries({ queryKey: ['eqChangeLogs', equipment.id] });
      toast.success('Heater settings saved');
      if (onSaved) onSaved();
    }
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Switch checked={enabled} onCheckedChange={setEnabled} />
        <Label className="text-sm">{isSolar ? 'Solar Heating Enabled' : 'Heater Enabled'}</Label>
      </div>

      {enabled && isSolar && (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Activation Mode</Label>
            <Select value={activationMode} onValueChange={setActivationMode}>
              <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="automatic">Automatic (sensor-driven)</SelectItem>
                <SelectItem value="manual">Manual</SelectItem>
                <SelectItem value="scheduled">Scheduled</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {activationMode === 'scheduled' && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label className="text-xs">On</Label><Input type="time" value={scheduleOn} onChange={e => setScheduleOn(e.target.value)} className="h-8 text-sm" /></div>
              <div className="space-y-1"><Label className="text-xs">Off</Label><Input type="time" value={scheduleOff} onChange={e => setScheduleOff(e.target.value)} className="h-8 text-sm" /></div>
            </div>
          )}
        </div>
      )}

      {enabled && !isSolar && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Mode</Label>
              <Select value={mode} onValueChange={setMode}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="heat">Heat</SelectItem>
                  <SelectItem value="cool">Cool</SelectItem>
                  <SelectItem value="auto">Auto</SelectItem>
                  <SelectItem value="off">Off</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Setpoint (°F)</Label>
              <Input type="number" value={setpoint} onChange={e => setSetpoint(e.target.value)} placeholder="e.g. 84" className="h-8 text-sm" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label className="text-xs">Schedule On</Label><Input type="time" value={scheduleOn} onChange={e => setScheduleOn(e.target.value)} className="h-8 text-sm" /></div>
            <div className="space-y-1"><Label className="text-xs">Schedule Off</Label><Input type="time" value={scheduleOff} onChange={e => setScheduleOff(e.target.value)} className="h-8 text-sm" /></div>
          </div>
        </div>
      )}

      <div className="space-y-1.5">
        <Label className="text-xs">Reason for change (optional)</Label>
        <Input value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. Seasonal activation" className="h-8 text-sm" />
      </div>

      <Button size="sm" className="bg-teal-600 hover:bg-teal-700" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
        {saveMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <Save className="w-3.5 h-3.5 mr-1" />}
        Save Heater Settings
      </Button>

      <EquipmentChangeHistory equipmentId={equipment.id} />
    </div>
  );
}