import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2, Save, RefreshCw, Lock, Users } from 'lucide-react';
import { toast } from 'sonner';

const EMPTY_TECH = () => ({ name: '', email: '', phone: '', active: true });

export default function SchedulingSettings() {
  const queryClient = useQueryClient();
  const [rows, setRows] = useState([EMPTY_TECH()]);
  const [isDirty, setIsDirty] = useState(false);

  const { data: user } = useQuery({
    queryKey: ['user'],
    queryFn: () => base44.auth.me(),
  });

  const { data: settingsArr = [], isLoading } = useQuery({
    queryKey: ['schedulingSettings'],
    queryFn: () => base44.entities.SchedulingSettings.filter({ settingKey: 'default' }),
    enabled: user?.role === 'admin',
  });

  const settings = settingsArr[0] || null;

  // Sync rows from fetched settings
  useEffect(() => {
    if (settings && Array.isArray(settings.technicians) && settings.technicians.length > 0) {
      setRows(settings.technicians.map(t => ({
        name: t.name || '',
        email: t.email || '',
        phone: t.phone || '',
        active: t.active !== false,
      })));
    }
    setIsDirty(false);
  }, [settings?.id]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await base44.functions.invoke('updateSchedulingTechnicians', {
        technicians: rows,
      });
      if (!res.data?.success) {
        throw new Error(res.data?.error || 'Save failed');
      }
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['schedulingSettings'] });
      setIsDirty(false);
      toast.success('Technicians saved successfully');
    },
    onError: (err) => {
      toast.error('Failed to save: ' + err.message);
    },
  });

  const updateRow = (i, field, value) => {
    setRows(prev => prev.map((r, idx) => idx === i ? { ...r, [field]: value } : r));
    setIsDirty(true);
  };

  const addRow = () => {
    setRows(prev => [...prev, EMPTY_TECH()]);
    setIsDirty(true);
  };

  const removeRow = (i) => {
    setRows(prev => prev.filter((_, idx) => idx !== i));
    setIsDirty(true);
  };

  // ── Auth guard ──
  if (user && user.role !== 'admin') {
    return (
      <div className="max-w-2xl mx-auto mt-16">
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-6 flex items-center gap-3">
            <Lock className="w-5 h-5 text-red-600" />
            <p className="text-red-800 font-medium">Access denied — admin role required.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-gray-500">
        <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> Loading scheduling settings…
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6 py-2">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 flex items-center gap-2">
            <Users className="w-6 h-6 text-teal-600" />
            Scheduling — Technicians
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Manage the technician list used across the scheduling calendar.
          </p>
        </div>
        {settings && (
          <Badge variant="outline" className="text-xs text-gray-500">
            {(settings.technicians || []).length} saved
          </Badge>
        )}
      </div>

      {/* No record yet info banner */}
      {!settings && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          No scheduling settings record exists yet. Add technicians below and save to create one.
        </div>
      )}

      {/* Technician rows */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-gray-700">Technicians</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {rows.map((row, i) => (
            <div key={i} className="flex flex-col sm:flex-row gap-2 items-start sm:items-center p-3 rounded-lg border border-gray-100 bg-gray-50">
              <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-2 w-full">
                <div>
                  <Label className="text-xs text-gray-500 mb-1 block">Name <span className="text-red-500">*</span></Label>
                  <Input
                    value={row.name}
                    onChange={e => updateRow(i, 'name', e.target.value)}
                    placeholder="Full name"
                    className="h-8 text-sm"
                  />
                </div>
                <div>
                  <Label className="text-xs text-gray-500 mb-1 block">Email</Label>
                  <Input
                    value={row.email}
                    onChange={e => updateRow(i, 'email', e.target.value)}
                    placeholder="optional"
                    className="h-8 text-sm"
                  />
                </div>
                <div>
                  <Label className="text-xs text-gray-500 mb-1 block">Phone</Label>
                  <Input
                    value={row.phone}
                    onChange={e => updateRow(i, 'phone', e.target.value)}
                    placeholder="optional"
                    className="h-8 text-sm"
                  />
                </div>
              </div>

              <div className="flex items-center gap-3 shrink-0 mt-2 sm:mt-0">
                <div className="flex items-center gap-1.5">
                  <Switch
                    checked={row.active}
                    onCheckedChange={v => updateRow(i, 'active', v)}
                  />
                  <span className="text-xs text-gray-500">{row.active ? 'Active' : 'Inactive'}</span>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-gray-400 hover:text-red-500"
                  onClick={() => removeRow(i)}
                  disabled={rows.length === 1}
                  title="Remove"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          ))}

          <Button
            variant="outline"
            size="sm"
            className="gap-2 mt-1"
            onClick={addRow}
          >
            <Plus className="w-3.5 h-3.5" />
            Add Technician
          </Button>
        </CardContent>
      </Card>

      {/* Save */}
      <div className="flex justify-end gap-3">
        <Button
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending || !isDirty}
          className="gap-2 bg-teal-600 hover:bg-teal-700 text-white"
        >
          {saveMutation.isPending ? (
            <><RefreshCw className="w-4 h-4 animate-spin" /> Saving…</>
          ) : (
            <><Save className="w-4 h-4" /> Save Technicians</>
          )}
        </Button>
      </div>
    </div>
  );
}