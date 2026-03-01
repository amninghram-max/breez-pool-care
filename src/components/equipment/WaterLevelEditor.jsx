import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Save, Loader2, AlertTriangle, Droplets } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { toast } from 'sonner';

const LEVEL_LABELS = {
  normal: 'Normal', slightly_low: 'Slightly Low', low: 'Low (water added)', high: 'High'
};

export default function WaterLevelEditor({ equipment, pool, user }) {
  const queryClient = useQueryClient();
  const [normalMin, setNormalMin] = useState(equipment.waterLevelNormalMin || 'mid_skimmer');
  const [normalMax, setNormalMax] = useState(equipment.waterLevelNormalMax || 'top_skimmer');
  const [threshold, setThreshold] = useState(String(equipment.waterAddedConsecutiveVisitThreshold || 3));
  const [saving, setSaving] = useState(false);

  const { data: logs = [] } = useQuery({
    queryKey: ['waterLevelLogs', pool?.id],
    queryFn: () => base44.entities.WaterLevelLog.filter({ poolId: pool.id }, '-visitDate', 20),
    enabled: !!pool?.id
  });

  // Consecutive water-added count
  const consecutiveWaterAdded = (() => {
    let count = 0;
    for (const log of logs) {
      if (log.waterAdded) count++;
      else break;
    }
    return count;
  })();

  const thresholdNum = parseInt(threshold) || 3;
  const excessiveFlag = consecutiveWaterAdded >= thresholdNum;

  const saveSettings = async () => {
    setSaving(true);
    await base44.entities.PoolEquipment.update(equipment.id, {
      waterLevelNormalMin: normalMin,
      waterLevelNormalMax: normalMax,
      waterAddedConsecutiveVisitThreshold: thresholdNum,
      excessiveWaterLossFlag: excessiveFlag
    });
    queryClient.invalidateQueries({ queryKey: ['poolEquipment'] });
    setSaving(false);
    toast.success('Water level settings saved');
  };

  return (
    <div className="space-y-4">
      {excessiveFlag && (
        <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg p-3">
          <AlertTriangle className="w-4 h-4 text-red-600 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold text-red-800">Excessive Water Loss — Monitoring</p>
            <p className="text-xs text-red-600 mt-0.5">
              Water has been added for {consecutiveWaterAdded} consecutive visits (threshold: {thresholdNum}).
              Possible leak or evaporation issue — investigate.
            </p>
          </div>
        </div>
      )}

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-800 space-y-1">
        <p className="font-semibold flex items-center gap-1.5"><Droplets className="w-3.5 h-3.5" /> Safety Boundaries (internal)</p>
        <p>• Minimum: water must remain at or above mid-skimmer to maintain skimmer operation and pump prime.</p>
        <p>• Maximum: water must not rise above top-of-skimmer — a flooded skimmer prevents the weir flapper from functioning and reduces debris collection efficiency.</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label className="text-xs">Normal Min</Label>
          <Select value={normalMin} onValueChange={setNormalMin}>
            <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="mid_skimmer">Mid Skimmer</SelectItem>
              <SelectItem value="top_skimmer">Top of Skimmer</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Normal Max</Label>
          <Select value={normalMax} onValueChange={setNormalMax}>
            <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="top_skimmer">Top of Skimmer</SelectItem>
              <SelectItem value="above_skimmer">Above Skimmer (caution)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Excessive Loss Alert — Consecutive Visits Threshold</Label>
        <Input type="number" min="1" max="10" value={threshold} onChange={e => setThreshold(e.target.value)} className="h-8 text-sm w-24" />
        <p className="text-xs text-gray-400">Flag triggered after this many visits in a row with water added.</p>
      </div>

      <Button size="sm" className="bg-teal-600 hover:bg-teal-700" onClick={saveSettings} disabled={saving}>
        {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <Save className="w-3.5 h-3.5 mr-1" />}
        Save Water Level Settings
      </Button>

      {/* Visit log */}
      {logs.length > 0 && (
        <div className="border-t pt-3">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Recent Visit Water Level Log</p>
          <div className="space-y-1.5 max-h-48 overflow-y-auto">
            {logs.map(log => (
              <div key={log.id} className="flex items-center justify-between text-xs bg-gray-50 rounded px-2.5 py-1.5">
                <span className="text-gray-400">{log.visitDate ? format(parseISO(log.visitDate), 'MMM d, yyyy') : '—'}</span>
                <Badge className={
                  log.waterLevel === 'normal' ? 'bg-green-100 text-green-800' :
                  log.waterLevel === 'high' ? 'bg-orange-100 text-orange-800' :
                  'bg-yellow-100 text-yellow-800'
                }>{LEVEL_LABELS[log.waterLevel] || log.waterLevel}</Badge>
                {log.waterAdded && <Badge className="bg-blue-100 text-blue-800">Water Added</Badge>}
                {log.safetyFlag && <Badge className="bg-red-100 text-red-800">⚠ {log.safetyFlag.replace(/_/g, ' ')}</Badge>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}