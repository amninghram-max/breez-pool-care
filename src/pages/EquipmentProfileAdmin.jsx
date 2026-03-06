import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Plus, ChevronLeft, AlertCircle } from 'lucide-react';
import { createPageUrl } from '@/utils';
import { Link } from 'react-router-dom';
import PoolVolumeEditor from '@/components/equipment/PoolVolumeEditor';

const EQUIPMENT_TYPES = [
  { value: 'pump', label: 'Pump' },
  { value: 'filter', label: 'Filter' },
  { value: 'heater', label: 'Heater' },
  { value: 'solar_heater', label: 'Solar Heater' },
  { value: 'automation', label: 'Automation' },
  { value: 'salt_cell', label: 'Salt Cell' },
  { value: 'other', label: 'Other' }
];

export default function EquipmentProfileAdmin() {
  const navigate = useNavigate();

  const params = new URLSearchParams(window.location.search);
  const leadId = params.get('leadId');

  const [showAddForm, setShowAddForm] = useState(false);
  const [formData, setFormData] = useState({
    equipmentType: '',
    brand: '',
    model: '',
    serialNumber: '',
    manualPdfUrl: '',
    manufacturerWebsiteUrl: '',
    isActive: true
  });

  const { data: user } = useQuery({
    queryKey: ['userForEquipmentAdmin'],
    queryFn: async () => {
      try {
        return await base44.auth.me();
      } catch {
        return null;
      }
    }
  });

  // Role guard
  if (user && !['admin', 'staff', 'technician'].includes(user.role)) {
    return (
      <Card className="border-red-200 bg-red-50">
        <CardContent className="pt-6">
          <p className="text-red-800">Access Denied: Only admin, staff, and technician roles can manage equipment.</p>
        </CardContent>
      </Card>
    );
  }

  const { data: lead, isLoading: leadLoading, error: leadError } = useQuery({
    queryKey: ['leadDetail', leadId],
    queryFn: () => leadId ? base44.entities.Lead.list() : null,
    select: (leads) => leads?.find(l => l.id === leadId),
    enabled: !!leadId && !!user && ['admin', 'staff', 'technician'].includes(user?.role)
  });

  const { data: equipment = [], isLoading: equipmentLoading, error: equipmentError, refetch } = useQuery({
    queryKey: ['equipmentForLead', leadId],
    queryFn: () => leadId ? base44.entities.PoolEquipment.filter({ leadId, isActive: true }) : [],
    enabled: !!leadId && !!user && ['admin', 'staff', 'technician'].includes(user?.role)
  });

  const handleAddEquipment = async () => {
    if (!leadId || !formData.equipmentType) return;
    try {
      await base44.entities.PoolEquipment.create({
        leadId,
        equipmentType: formData.equipmentType,
        brand: formData.brand,
        model: formData.model,
        serialNumber: formData.serialNumber,
        manualPdfUrl: formData.manualPdfUrl,
        manufacturerWebsiteUrl: formData.manufacturerWebsiteUrl,
        isActive: formData.isActive
      });
      setFormData({ equipmentType: '', brand: '', model: '', serialNumber: '', manualPdfUrl: '', manufacturerWebsiteUrl: '', isActive: true });
      setShowAddForm(false);
      refetch();
    } catch (error) {
      console.error('Failed to add equipment:', error);
    }
  };

  if (!leadId) {
    return (
      <Card className="border-amber-200 bg-amber-50">
        <CardContent className="pt-6">
          <p className="text-amber-800">No customer selected. Please select a customer to manage equipment.</p>
        </CardContent>
      </Card>
    );
  }

  if (leadLoading || equipmentLoading) {
    return <div className="text-gray-500">Loading customer equipment...</div>;
  }

  if (leadError || equipmentError) {
    return (
      <Alert className="border-red-200 bg-red-50">
        <AlertCircle className="h-4 w-4 text-red-600" />
        <AlertDescription className="text-red-800">
          {leadError && <div>Lead query error: {leadError.message}</div>}
          {equipmentError && <div>Equipment query error: {equipmentError.message}</div>}
        </AlertDescription>
      </Alert>
    );
  }

  if (!lead) {
    return (
      <Card className="border-red-200 bg-red-50">
        <CardContent className="pt-6">
          <p className="text-red-800">Customer not found.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header with back button */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link to={createPageUrl('CustomerTimeline') + `?leadId=${leadId}`}>
            <Button variant="outline" size="icon">
              <ChevronLeft className="w-4 h-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {lead.firstName} {lead.lastName || ''}
            </h1>
            {lead.serviceAddress && (
              <p className="text-sm text-gray-600">{lead.serviceAddress}</p>
            )}
          </div>
        </div>
        <Button onClick={() => setShowAddForm(!showAddForm)} className="bg-teal-600 hover:bg-teal-700">
          <Plus className="w-4 h-4 mr-2" />
          Add Equipment
        </Button>
      </div>

      {/* Add Equipment Form */}
      {showAddForm && (
        <Card className="bg-blue-50 border-blue-200">
          <CardHeader>
            <CardTitle className="text-base">Add Equipment</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                <Select value={formData.equipmentType} onValueChange={(val) => setFormData({ ...formData, equipmentType: val })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    {EQUIPMENT_TYPES.map(t => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Brand</label>
                <input
                  type="text"
                  placeholder="e.g., Pentair"
                  value={formData.brand}
                  onChange={(e) => setFormData({ ...formData, brand: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Model</label>
                <input
                  type="text"
                  placeholder="Model number"
                  value={formData.model}
                  onChange={(e) => setFormData({ ...formData, model: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Serial Number</label>
                <input
                  type="text"
                  placeholder="Serial #"
                  value={formData.serialNumber}
                  onChange={(e) => setFormData({ ...formData, serialNumber: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Manual PDF URL</label>
                <input
                  type="url"
                  placeholder="https://…"
                  value={formData.manualPdfUrl}
                  onChange={(e) => setFormData({ ...formData, manualPdfUrl: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Manufacturer Website</label>
                <input
                  type="url"
                  placeholder="https://…"
                  value={formData.manufacturerWebsiteUrl}
                  onChange={(e) => setFormData({ ...formData, manufacturerWebsiteUrl: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                />
              </div>
            </div>
            <div className="flex gap-3 justify-end">
              <Button variant="outline" onClick={() => setShowAddForm(false)}>Cancel</Button>
              <Button
                onClick={handleAddEquipment}
                disabled={!formData.equipmentType}
                className="bg-teal-600 hover:bg-teal-700"
              >
                Save Equipment
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Pool Volume */}
      <PoolVolumeEditor leadId={leadId} userRole={user?.role} />

      {/* Equipment List */}
      {equipment.length === 0 ? (
        <Card className="bg-gray-50 border-gray-200">
          <CardContent className="pt-6">
            <p className="text-gray-600">No equipment on file yet. Add the first equipment to get started.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {equipment.map(eq => (
            <Card key={eq.id} className="border-gray-200">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <CardTitle className="text-base">
                    {EQUIPMENT_TYPES.find(t => t.value === eq.equipmentType)?.label || eq.equipmentType}
                  </CardTitle>
                  {eq.isActive && <Badge className="bg-green-100 text-green-800">Active</Badge>}
                </div>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {eq.brand && <p><span className="font-medium">Brand:</span> {eq.brand} {eq.model ? `(${eq.model})` : ''}</p>}
                {eq.serialNumber && <p><span className="font-medium">Serial:</span> {eq.serialNumber}</p>}
                {(eq.manualPdfUrl || eq.manufacturerWebsiteUrl) && (
                  <div className="flex gap-2 pt-2">
                    {eq.manualPdfUrl && (
                      <a href={eq.manualPdfUrl} target="_blank" rel="noreferrer" className="text-teal-600 hover:underline text-xs">
                        View Manual
                      </a>
                    )}
                    {eq.manufacturerWebsiteUrl && (
                      <a href={eq.manufacturerWebsiteUrl} target="_blank" rel="noreferrer" className="text-teal-600 hover:underline text-xs">
                        Manufacturer
                      </a>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}