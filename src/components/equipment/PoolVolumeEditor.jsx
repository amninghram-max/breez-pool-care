import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Save, Loader2, Pencil, X, CheckCircle2, Calculator, Plus } from 'lucide-react';
import { toast } from 'sonner';

/**
 * PoolVolumeEditor — admin-only inline editor for Pool.volumeGallons.
 * Pool.volumeGallons is the authoritative value used by chemistry suggestion calculations.
 * Save path: direct base44.entities.Pool.update(pool.id, { volumeGallons })
 */

const SHAPES = [
  { value: 'rect',      label: 'Rectangular' },
  { value: 'oval',      label: 'Oval' },
  { value: 'racetrack', label: 'Racetrack / Capsule' },
];

// All shapes: uniform depth only
function calcVolume(shape, l, w, d) {
  const L = parseFloat(l), W = parseFloat(w), D = parseFloat(d);
  if (!L || !W || !D || L <= 0 || W <= 0 || D <= 0) return { gallons: null, error: null };
  if (shape === 'racetrack' && L < W) {
    return { gallons: null, error: 'Racetrack requires Length ≥ Width (length is the long axis).' };
  }
  let area;
  if (shape === 'oval') {
    area = (Math.PI * L * W) / 4;
  } else if (shape === 'racetrack') {
    area = ((L - W) * W) + Math.PI * Math.pow(W / 2, 2);
  } else {
    area = L * W;
  }
  return { gallons: Math.round(area * D * 7.5), error: null };
}

const CHLORINATION_OPTIONS = [
  { value: 'saltwater', label: 'Saltwater' },
  { value: 'tablets', label: 'Tablets' },
  { value: 'liquid_chlorine', label: 'Liquid Chlorine' },
  { value: 'mineral', label: 'Mineral' },
  { value: 'not_sure', label: 'Not Sure' },
];

export default function PoolVolumeEditor({ leadId, userRole }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [calcMode, setCalcMode] = useState(false);
  const [shape, setShape] = useState('rect');
  const [dims, setDims] = useState({ length: '', width: '', depth: '' });

  // Create Pool form state
  const [showCreatePool, setShowCreatePool] = useState(false);
  const [createForm, setCreateForm] = useState({ chlorinationMethod: 'not_sure' });

  const isAdmin = ['admin', 'staff'].includes(userRole);

  const { data: poolData = null, isLoading } = useQuery({
    queryKey: ['poolForVolume', leadId],
    queryFn: async () => {
      const res = await base44.functions.invoke('getPoolForLeadV1', { leadId });
      return res.data?.pool || null;
    },
    enabled: !!leadId
  });

  const pool = poolData;

  console.log('POOL_VOLUME_EDITOR_DEBUG', { leadId, isLoading, pools, pool });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const gallons = parseFloat(inputValue);
      if (!gallons || gallons <= 0) throw new Error('Enter a valid positive number');
      if (!pool) throw new Error('No Pool record found for this customer');
      await base44.entities.Pool.update(pool.id, { volumeGallons: gallons });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['poolForVolume', leadId] });
      toast.success('Pool volume saved');
      setEditing(false);
    },
    onError: (err) => toast.error(err.message || 'Save failed')
  });

  const createPoolMutation = useMutation({
    mutationFn: async () => {
      const res = await base44.functions.invoke('createPoolForLeadV1', {
        leadId,
        chlorinationMethod: createForm.chlorinationMethod,
      });
      if (!res.data?.success) {
        throw new Error(res.data?.error || 'Failed to create Pool');
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['poolForVolume', leadId] });
      await queryClient.refetchQueries({ queryKey: ['poolForVolume', leadId] });
      toast.success('Pool record created');
      setShowCreatePool(false);
      setCreateForm({ chlorinationMethod: 'not_sure' });
    },
    onError: (err) => toast.error(err.message || 'Failed to create pool'),
  });

  const { gallons: computedGallons, error: calcError } = calcVolume(shape, dims.length, dims.width, dims.depth);

  const handleEdit = () => {
    setInputValue(pool?.volumeGallons ? String(pool.volumeGallons) : '');
    setCalcMode(false);
    setShape('rect');
    setDims({ length: '', width: '', depth: '' });
    setEditing(true);
  };

  const handleCancel = () => {
    setEditing(false);
    setCalcMode(false);
    setShape('rect');
    setDims({ length: '', width: '', depth: '' });
    setInputValue('');
  };

  const handleUseComputed = () => {
    if (computedGallons) setInputValue(String(computedGallons));
    setCalcMode(false);
  };

  if (isLoading) return null;

  // No pool and not admin — nothing to show
  if (!pool && !isAdmin) return null;

  // No pool exists — show Create Pool panel for admin/staff
  if (!pool && isAdmin) {
    return (
      <div className="border rounded-lg p-3 bg-amber-50 border-amber-200 space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs font-semibold text-amber-800 uppercase tracking-wide">
            Pool Record
          </Label>
          <Badge variant="outline" className="text-xs text-amber-700 border-amber-300">
            Not Created
          </Badge>
        </div>
        <p className="text-xs text-amber-700">No Pool record exists for this customer.</p>
        {!showCreatePool ? (
          <Button size="sm" onClick={() => setShowCreatePool(true)} className="bg-teal-600 hover:bg-teal-700 h-7 text-xs">
            <Plus className="w-3 h-3 mr-1" /> Create Pool Record
          </Button>
        ) : (
          <div className="space-y-3 pt-2 border-t border-amber-200">
            <div>
              <label className="text-xs font-medium text-gray-700 block mb-1">Chlorination Method *</label>
              <Select value={createForm.chlorinationMethod} onValueChange={(v) => setCreateForm(f => ({ ...f, chlorinationMethod: v }))}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CHLORINATION_OPTIONS.map(o => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[10px] text-gray-400 mt-1">surfaceType defaults to CONCRETE_PLASTER</p>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                className="h-7 text-xs bg-teal-600 hover:bg-teal-700"
                onClick={() => createPoolMutation.mutate()}
                disabled={createPoolMutation.isPending}
              >
                {createPoolMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Save className="w-3 h-3 mr-1" />}
                Create
              </Button>
              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setShowCreatePool(false)} disabled={createPoolMutation.isPending}>
                <X className="w-3 h-3 mr-1" /> Cancel
              </Button>
            </div>
          </div>
        )}
      </div>
    );
  }

  const currentVolume = pool?.volumeGallons;
  const isConfirmed = currentVolume != null && currentVolume > 0;

  return (
    <div className="border rounded-lg p-3 bg-gray-50 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Label className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
            Pool Record
          </Label>
          {isConfirmed ? (
            <Badge className="bg-teal-100 text-teal-800 text-xs flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" />
              Confirmed
            </Badge>
          ) : (
            <Badge variant="outline" className="text-xs text-amber-700 border-amber-300">
              Not Set
            </Badge>
          )}
        </div>
        {isAdmin && !editing && (
          <button
            onClick={handleEdit}
            className="text-gray-400 hover:text-teal-600 transition-colors"
            title="Edit pool volume"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {!editing ? (
        <div className="text-sm">
          {isConfirmed ? (
            <span className="font-mono font-medium text-gray-900">
              {currentVolume.toLocaleString()} gal
            </span>
          ) : (
            <span className="text-gray-400 text-xs italic">
              No confirmed volume — chemistry suggestions will use category estimate
            </span>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {/* Calculator toggle */}
          {!calcMode ? (
            <button
              onClick={() => setCalcMode(true)}
              className="flex items-center gap-1 text-xs text-teal-600 hover:text-teal-800 transition-colors"
            >
              <Calculator className="w-3 h-3" />
              Calculate from dimensions (rectangular, uniform depth)
            </button>
          ) : (
            <div className="space-y-2 bg-white border border-teal-200 rounded-lg p-3">
               <div className="flex items-center gap-2">
                 <label className="text-xs text-gray-500 shrink-0">Shape:</label>
                 <select
                   value={shape}
                   onChange={e => { setShape(e.target.value); setDims({ length: '', width: '', depth: '' }); }}
                   className="text-xs border border-gray-200 rounded px-1.5 py-0.5 bg-white text-gray-800"
                 >
                   {SHAPES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                 </select>
                 <span className="text-[10px] text-gray-400">· uniform depth only</span>
               </div>
               <div className="grid grid-cols-3 gap-2">
                {[
                  { key: 'length', label: 'Length (ft)' },
                  { key: 'width', label: 'Width (ft)' },
                  { key: 'depth', label: 'Depth (ft)' },
                ].map(({ key, label }) => (
                  <div key={key}>
                    <p className="text-xs text-gray-400 mb-0.5">{label}</p>
                    <Input
                      type="number"
                      min="1"
                      step="0.5"
                      value={dims[key]}
                      onChange={e => setDims(d => ({ ...d, [key]: e.target.value }))}
                      className="h-7 text-xs font-mono"
                      placeholder="0"
                    />
                  </div>
                ))}
              </div>
              {calcError && (
                <p className="text-xs text-red-600">{calcError}</p>
              )}
              {computedGallons != null && !calcError && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-600">Result:</span>
                  <span className="font-mono font-semibold text-teal-700 text-sm">
                    {computedGallons.toLocaleString()} gal
                  </span>
                  <Button
                    size="sm"
                    className="h-6 text-xs bg-teal-600 hover:bg-teal-700 ml-1"
                    onClick={handleUseComputed}
                  >
                    Use this value
                  </Button>
                </div>
              )}
              <button
                onClick={() => setCalcMode(false)}
                className="text-xs text-gray-400 hover:text-gray-600"
              >
                ← Back to manual entry
              </button>
            </div>
          )}

          {/* Manual entry row */}
          {!calcMode && (
            <>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min="1000"
                  step="100"
                  value={inputValue}
                  onChange={e => setInputValue(e.target.value)}
                  placeholder="e.g. 15000"
                  className="h-8 text-sm w-36 font-mono"
                  autoFocus
                />
                <span className="text-xs text-gray-500">gallons</span>
              </div>
              <p className="text-xs text-gray-500">
                Authoritative source for chemistry dose suggestions.
              </p>
            </>
          )}

          <div className="flex gap-2">
            <Button
              size="sm"
              className="h-7 text-xs bg-teal-600 hover:bg-teal-700"
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending || !inputValue || calcMode}
            >
              {saveMutation.isPending
                ? <Loader2 className="w-3 h-3 animate-spin mr-1" />
                : <Save className="w-3 h-3 mr-1" />}
              Save
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs"
              onClick={handleCancel}
              disabled={saveMutation.isPending}
            >
              <X className="w-3 h-3 mr-1" />
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}