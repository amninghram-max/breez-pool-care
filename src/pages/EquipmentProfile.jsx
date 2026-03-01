import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Zap, Filter, Flame, Sun, Droplets, Wrench, Plus, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import PumpEditor from '../components/equipment/PumpEditor';
import FilterEditor from '../components/equipment/FilterEditor';
import HeaterEditor from '../components/equipment/HeaterEditor';
import WaterLevelEditor from '../components/equipment/WaterLevelEditor';
import EquipmentMediaEditor from '../components/equipment/EquipmentMediaEditor';

const TYPE_META = {
  pump: { label: 'Pump', icon: Zap, color: 'bg-blue-100 text-blue-700' },
  filter: { label: 'Filter', icon: Filter, color: 'bg-teal-100 text-teal-700' },
  heater: { label: 'Heater', icon: Flame, color: 'bg-orange-100 text-orange-700' },
  solar_heater: { label: 'Solar Heater', icon: Sun, color: 'bg-yellow-100 text-yellow-700' },
  automation: { label: 'Automation', icon: Wrench, color: 'bg-purple-100 text-purple-700' },
  salt_cell: { label: 'Salt Cell', icon: Droplets, color: 'bg-cyan-100 text-cyan-700' },
  other: { label: 'Other', icon: Wrench, color: 'bg-gray-100 text-gray-700' }
};

function EquipmentCard({ equipment, pool, user }) {
  const [expanded, setExpanded] = useState(false);
  const meta = TYPE_META[equipment.equipmentType] || TYPE_META.other;
  const Icon = meta.icon;

  const isFilter = equipment.equipmentType === 'filter';
  const isPump = equipment.equipmentType === 'pump';
  const isHeater = equipment.equipmentType === 'heater' || equipment.equipmentType === 'solar_heater';
  const isWater = false; // water level is per-pool, not per-equipment — shown at pool level

  return (
    <Card className={`border-2 transition-colors ${expanded ? 'border-teal-300' : 'border-gray-100'}`}>
      <CardHeader className="pb-2 pt-4">
        <button className="w-full flex items-start justify-between gap-3 text-left" onClick={() => setExpanded((v) => !v)}>
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${meta.color}`}>
              <Icon className="w-4 h-4" />
            </div>
            <div>
              <p className="font-semibold text-sm text-gray-900">{meta.label}</p>
              {(equipment.brand || equipment.model) &&
              <p className="text-xs text-gray-400">{[equipment.brand, equipment.model].filter(Boolean).join(' · ')}</p>
              }
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isFilter && equipment.normalPsi &&
            <Badge className="bg-teal-100 text-teal-800 text-xs">{equipment.normalPsi} PSI normal</Badge>
            }
            {isPump && equipment.pumpSpeed &&
            <Badge className="bg-blue-100 text-blue-800 text-xs capitalize">{equipment.pumpSpeed.replace('_', ' ')}</Badge>
            }
            {expanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
          </div>
        </button>
      </CardHeader>

      {expanded &&
      <CardContent className="pt-2">
          <Tabs defaultValue="settings">
            <TabsList className="h-8 mb-4">
              <TabsTrigger value="settings" className="text-xs h-7">
                {isPump ? 'Schedule' : isFilter ? 'Filter' : isHeater ? 'Settings' : 'Settings'}
              </TabsTrigger>
              <TabsTrigger value="media" className="text-xs h-7">Docs & Notes</TabsTrigger>
            </TabsList>

            <TabsContent value="settings">
              {isPump && <PumpEditor equipment={equipment} user={user} />}
              {isFilter && <FilterEditor equipment={equipment} user={user} pool={pool} />}
              {isHeater && <HeaterEditor equipment={equipment} user={user} />}
              {!isPump && !isFilter && !isHeater &&
            <p className="text-sm text-gray-500">No configurable settings for this equipment type yet.</p>
            }
            </TabsContent>

            <TabsContent value="media">
              <EquipmentMediaEditor equipment={equipment} />
            </TabsContent>
          </Tabs>
        </CardContent>
      }
    </Card>);

}

function AddEquipmentForm({ leadId, poolId, onAdded }) {
  const queryClient = useQueryClient();
  const [type, setType] = useState('');
  const [brand, setBrand] = useState('');
  const [model, setModel] = useState('');

  const addMutation = useMutation({
    mutationFn: () => base44.entities.PoolEquipment.create({
      leadId, poolId, equipmentType: type, brand, model, isActive: true
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['poolEquipment', leadId] });
      toast.success('Equipment added');
      setType('');setBrand('');setModel('');
      if (onAdded) onAdded();
    }
  });

  return (
    <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 p-4 bg-gray-50 rounded-xl border border-dashed border-gray-300">
      <Select value={type} onValueChange={setType}>
        <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Equipment type…" /></SelectTrigger>
        <SelectContent>
          {Object.entries(TYPE_META).map(([k, v]) =>
          <SelectItem key={k} value={k}>{v.label}</SelectItem>
          )}
        </SelectContent>
      </Select>
      <Input value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="Brand" className="h-9 text-sm" />
      <Input value={model} onChange={(e) => setModel(e.target.value)} placeholder="Model" className="h-9 text-sm" />
      <Button className="bg-teal-600 hover:bg-teal-700 h-9"
      onClick={() => addMutation.mutate()} disabled={!type || addMutation.isPending}>
        {addMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Plus className="w-4 h-4 mr-1" />}
        Add
      </Button>
    </div>);

}

export default function EquipmentProfile() {
  const navigate = useNavigate();
  const urlParams = new URLSearchParams(window.location.search);
  const leadIdParam = urlParams.get('leadId');
  const [showAdd, setShowAdd] = useState(false);

  const { data: user, isLoading: userLoading } = useQuery({
    queryKey: ['user'],
    queryFn: async () => {
      try {
        return await base44.auth.me();
      } catch {
        return null;
      }
    }
  });

  // Route guard: Redirect if not authenticated
  React.useEffect(() => {
    if (!userLoading && !user) {
      navigate(createPageUrl('PublicHome'), { replace: true });
    }
  }, [user, userLoading, navigate]);

  // Route guard: Redirect if authenticated but not linked (unlinked customer)
  React.useEffect(() => {
    if (user && !user.linkedLeadId && !['admin', 'staff', 'technician'].includes(user.role)) {
      navigate(createPageUrl('ClientHome'), { replace: true });
    }
  }, [user, navigate]);

  // Show loading while checking auth
  if (userLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-teal-600" />
      </div>
    );
  }

  // Guard: only linked customers or providers should see this
  const isProvider = user && ['admin', 'staff', 'technician'].includes(user.role);
  const isLinkedCustomer = user && user.linkedLeadId && !isProvider;
  if (!isLinkedCustomer && !isProvider) {
    return null; // guards above will navigate
  }

  // Resolve leadId — admin passes ?leadId=..., staff/tech see their first
  const { data: leads = [] } = useQuery({
    queryKey: ['leadsForEquip'],
    queryFn: () => base44.entities.Lead.list('-created_date', 200),
    enabled: !!user && (user.role === 'admin' || user.role === 'staff')
  });

  const [selectedLeadId, setSelectedLeadId] = useState(leadIdParam || '');
  const leadId = selectedLeadId || leadIdParam;

  const { data: equipment = [], isLoading } = useQuery({
    queryKey: ['poolEquipment', leadId],
    queryFn: () => base44.entities.PoolEquipment.filter({ leadId, isActive: true }, 'equipmentType'),
    enabled: !!leadId
  });

  const { data: pool } = useQuery({
    queryKey: ['pool', leadId],
    queryFn: async () => {
      const pools = await base44.entities.Pool.filter({ leadId });
      return pools[0] || null;
    },
    enabled: !!leadId
  });

  const lead = leads.find((l) => l.id === leadId);
  const isAdminOrStaff = user?.role === 'admin' || user?.role === 'staff';

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-20">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Equipment Profile</h1>
          {lead &&
          <p className="text-sm text-gray-500 mt-0.5">
              {lead.firstName} {lead.lastName} — {lead.serviceAddress}
            </p>
          }
        </div>
        {isAdminOrStaff && leads.length > 0 && !leadIdParam &&
        <Select value={selectedLeadId} onValueChange={setSelectedLeadId}>
            <SelectTrigger className="w-64 h-9 text-sm"><SelectValue placeholder="Select customer…" /></SelectTrigger>
            <SelectContent>
              {leads.filter((l) => l.stage === 'converted').map((l) =>
            <SelectItem key={l.id} value={l.id}>
                  {l.firstName} {l.lastName} — {l.serviceAddress?.split(',')[0]}
                </SelectItem>
            )}
            </SelectContent>
          </Select>
        }
      </div>

      {!leadId &&
      <Card>
          <CardContent className="p-12 text-center">
            <Wrench className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">Select a customer to view their equipment profile. test</p>
          </CardContent>
        </Card>
      }

      {leadId && isLoading &&
      <div className="text-center py-12"><Loader2 className="w-8 h-8 animate-spin text-teal-600 mx-auto" /></div>
      }

      {leadId && !isLoading &&
      <>
          {/* Water Level — pool-level, shown once */}
          {pool && isAdminOrStaff &&
        <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Droplets className="w-4 h-4 text-cyan-600" /> Water Level Monitoring
                </CardTitle>
              </CardHeader>
              <CardContent>
                {/* Use first pump/filter equipment as anchor for settings storage, or pool itself */}
                <WaterLevelEditor
              equipment={equipment[0] || { id: pool.id, leadId, waterLevelNormalMin: 'mid_skimmer', waterLevelNormalMax: 'top_skimmer', waterAddedConsecutiveVisitThreshold: 3, excessiveWaterLossFlag: false }}
              pool={pool}
              user={user} />

              </CardContent>
            </Card>
        }

          {/* Equipment items */}
          <div className="space-y-3">
            {equipment.map((eq) =>
          <EquipmentCard key={eq.id} equipment={eq} pool={pool} user={user} />
          )}
          </div>

          {equipment.length === 0 &&
        <div className="text-center py-8 text-gray-400">
              <Wrench className="w-10 h-10 mx-auto mb-2 opacity-40" />
              <p>No equipment recorded yet.</p>
            </div>
        }

          {isAdminOrStaff &&
        <div>
              {!showAdd ?
          <Button variant="outline" className="w-full border-dashed" onClick={() => setShowAdd(true)}>
                  <Plus className="w-4 h-4 mr-2" /> Add Equipment
                </Button> :

          <AddEquipmentForm
            leadId={leadId}
            poolId={pool?.id}
            onAdded={() => setShowAdd(false)} />

          }
            </div>
        }
        </>
      }
    </div>);

}