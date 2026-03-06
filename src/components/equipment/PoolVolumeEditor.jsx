import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Save, Loader2, Pencil, X, CheckCircle2, Calculator } from 'lucide-react';
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

export default function PoolVolumeEditor({ leadId, userRole }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [calcMode, setCalcMode] = useState(false);
  const [dims, setDims] = useState({ length: '', width: '', depth: '' });

  const isAdmin = ['admin', 'staff'].includes(userRole);

  const { data: pools = [], isLoading } = useQuery({
    queryKey: ['poolForVolume', leadId],
    queryFn: () => base44.entities.Pool.filter({ leadId }),
    enabled: !!leadId
  });

  const pool = pools[0] || null;

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

  const computedGallons = calcRect(dims.length, dims.width, dims.depth);

  const handleEdit = () => {
    setInputValue(pool?.volumeGallons ? String(pool.volumeGallons) : '');
    setCalcMode(false);
    setDims({ length: '', width: '', depth: '' });
    setEditing(true);
  };

  const handleCancel = () => {
    setEditing(false);
    setCalcMode(false);
    setDims({ length: '', width: '', depth: '' });
    setInputValue('');
  };

  const handleUseComputed = () => {
    if (computedGallons) setInputValue(String(computedGallons));
    setCalcMode(false);
  };

  if (isLoading) return null;
  if (!pool && !isAdmin) return null;

  const currentVolume = pool?.volumeGallons;
  const isConfirmed = currentVolume != null && currentVolume > 0;

  return (
    <div className="border rounded-lg p-3 bg-gray-50 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Label className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
            Pool Volume (Gallons)
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
              <p className="text-xs font-medium text-gray-600">
                Rectangular pool · uniform depth only
              </p>
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
              {computedGallons != null && (
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