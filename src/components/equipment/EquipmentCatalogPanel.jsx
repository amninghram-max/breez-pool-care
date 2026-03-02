import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2, Edit, FileText } from 'lucide-react';
import { toast } from 'sonner';

export default function EquipmentCatalogPanel() {
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [showForm, setShowForm] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [formData, setFormData] = useState({
    type: 'pump',
    brand: '',
    model: '',
    variant: '',
    manufacturerUrl: '',
    manualUrl: '',
    tags: '',
    notes: '',
    isActive: true
  });

  const queryClient = useQueryClient();

  const { data: items = [], isLoading } = useQuery({
    queryKey: ['equipmentCatalogItems'],
    queryFn: () => base44.entities.EquipmentCatalogItem.list('-created_date', 500),
  });

  const saveMutation = useMutation({
    mutationFn: (data) => {
      if (editingItem) {
        return base44.entities.EquipmentCatalogItem.update(editingItem.id, data);
      }
      return base44.entities.EquipmentCatalogItem.create(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['equipmentCatalogItems'] });
      setShowForm(false);
      setEditingItem(null);
      setFormData({ type: 'pump', brand: '', model: '', variant: '', manufacturerUrl: '', manualUrl: '', tags: '', notes: '', isActive: true });
      toast.success(editingItem ? 'Updated' : 'Created');
    },
    onError: (err) => toast.error(err.message)
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.EquipmentCatalogItem.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['equipmentCatalogItems'] });
      toast.success('Deleted');
    },
    onError: (err) => toast.error(err.message)
  });

  const filteredItems = items.filter(item => {
    const matchType = typeFilter === 'all' || item.type === typeFilter;
    const matchSearch = !searchQuery || 
      item.brand.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.model.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (item.tags || []).some(t => t.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchType && matchSearch;
  });

  const handleSave = () => {
    const data = {
      ...formData,
      tags: formData.tags ? formData.tags.split(',').map(t => t.trim()) : []
    };
    saveMutation.mutate(data);
  };

  const handleEdit = (item) => {
    setEditingItem(item);
    setFormData({
      type: item.type,
      brand: item.brand,
      model: item.model,
      variant: item.variant || '',
      manufacturerUrl: item.manufacturerUrl || '',
      manualUrl: item.manualUrl || '',
      tags: (item.tags || []).join(', '),
      notes: item.notes || '',
      isActive: item.isActive
    });
    setShowForm(true);
  };

  if (isLoading) return <div className="text-center py-8">Loading...</div>;

  return (
    <div className="space-y-6">
      <div className="flex gap-4 flex-wrap items-end">
        <div className="flex-1 min-w-64">
          <label className="text-sm font-medium block mb-1">Search</label>
          <Input
            placeholder="Brand, model, or tag..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="w-40">
          <label className="text-sm font-medium block mb-1">Type</label>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="pump">Pump</SelectItem>
              <SelectItem value="filter">Filter</SelectItem>
              <SelectItem value="heater">Heater</SelectItem>
              <SelectItem value="chlorinator">Chlorinator</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button onClick={() => { setEditingItem(null); setFormData({ type: 'pump', brand: '', model: '', variant: '', manufacturerUrl: '', manualUrl: '', tags: '', notes: '', isActive: true }); setShowForm(true); }} className="bg-teal-600 hover:bg-teal-700">
          <Plus className="w-4 h-4 mr-2" /> Add Item
        </Button>
      </div>

      {showForm && (
        <Card className="border-teal-200 bg-teal-50">
          <CardHeader>
            <CardTitle className="text-base">{editingItem ? 'Edit Item' : 'New Catalog Item'}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium block mb-1">Type *</label>
                <Select value={formData.type} onValueChange={(v) => setFormData(f => ({ ...f, type: v }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pump">Pump</SelectItem>
                    <SelectItem value="filter">Filter</SelectItem>
                    <SelectItem value="heater">Heater</SelectItem>
                    <SelectItem value="chlorinator">Chlorinator</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium block mb-1">Brand *</label>
                <Input value={formData.brand} onChange={(e) => setFormData(f => ({ ...f, brand: e.target.value }))} placeholder="e.g., Pentair" />
              </div>
              <div>
                <label className="text-sm font-medium block mb-1">Model *</label>
                <Input value={formData.model} onChange={(e) => setFormData(f => ({ ...f, model: e.target.value }))} placeholder="e.g., EQ-1000" />
              </div>
              <div>
                <label className="text-sm font-medium block mb-1">Variant</label>
                <Input value={formData.variant} onChange={(e) => setFormData(f => ({ ...f, variant: e.target.value }))} placeholder="e.g., 1HP" />
              </div>
              <div className="col-span-2">
                <label className="text-sm font-medium block mb-1">Manufacturer URL</label>
                <Input value={formData.manufacturerUrl} onChange={(e) => setFormData(f => ({ ...f, manufacturerUrl: e.target.value }))} placeholder="https://..." />
              </div>
              <div className="col-span-2">
                <label className="text-sm font-medium block mb-1">Manual URL</label>
                <Input value={formData.manualUrl} onChange={(e) => setFormData(f => ({ ...f, manualUrl: e.target.value }))} placeholder="https://..." />
              </div>
              <div className="col-span-2">
                <label className="text-sm font-medium block mb-1">Tags (comma-separated)</label>
                <Input value={formData.tags} onChange={(e) => setFormData(f => ({ ...f, tags: e.target.value }))} placeholder="e.g., single-speed, variable, energy-efficient" />
              </div>
              <div className="col-span-2">
                <label className="text-sm font-medium block mb-1">Notes</label>
                <Input value={formData.notes} onChange={(e) => setFormData(f => ({ ...f, notes: e.target.value }))} placeholder="Internal notes..." />
              </div>
            </div>
            <div className="flex gap-3 justify-end">
              <Button onClick={() => setShowForm(false)} variant="outline">Cancel</Button>
              <Button onClick={handleSave} disabled={saveMutation.isPending} className="bg-teal-600 hover:bg-teal-700">Save</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4">
        {filteredItems.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center text-gray-500">
              No equipment found
            </CardContent>
          </Card>
        ) : (
          filteredItems.map(item => (
            <Card key={item.id}>
              <CardContent className="p-4">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="font-semibold text-lg">{item.brand} {item.model}</h3>
                      {item.variant && <span className="text-sm text-gray-600">({item.variant})</span>}
                      <Badge>{item.type}</Badge>
                      {!item.isActive && <Badge variant="outline">Inactive</Badge>}
                    </div>
                    {item.tags && item.tags.length > 0 && (
                      <div className="flex gap-2 mb-2 flex-wrap">
                        {item.tags.map(tag => (
                          <Badge key={tag} variant="secondary" className="text-xs">{tag}</Badge>
                        ))}
                      </div>
                    )}
                    {item.notes && <p className="text-sm text-gray-600 mb-2">{item.notes}</p>}
                    <div className="flex gap-4 text-xs text-blue-600">
                      {item.manufacturerUrl && <a href={item.manufacturerUrl} target="_blank" rel="noopener noreferrer" className="hover:underline">Manufacturer</a>}
                      {item.manualUrl && <a href={item.manualUrl} target="_blank" rel="noopener noreferrer" className="hover:underline flex items-center gap-1"><FileText className="w-3 h-3" /> Manual</a>}
                    </div>
                  </div>
                  <div className="flex gap-2 ml-4">
                    <Button size="sm" variant="ghost" onClick={() => handleEdit(item)}>
                      <Edit className="w-4 h-4" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => deleteMutation.mutate(item.id)} disabled={deleteMutation.isPending}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}