import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2, Edit } from 'lucide-react';
import { toast } from 'sonner';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';

export default function PartsManagementPanel({ catalogItemId, typeFilter }) {
  const [showForm, setShowForm] = useState(false);
  const [editingPart, setEditingPart] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [partToDelete, setPartToDelete] = useState(null);
  const [formData, setFormData] = useState({
    partType: 'motor',
    partNumber: '',
    description: '',
    whereUsed: '',
    manufacturerUrl: '',
    notes: ''
  });

  const queryClient = useQueryClient();

  const { data: parts = [] } = useQuery({
    queryKey: ['catalogParts', catalogItemId],
    queryFn: async () => {
      if (!catalogItemId) return [];
      const result = await base44.entities.EquipmentCatalogPart.filter({ catalogItemId });
      return result;
    },
  });

  const saveMutation = useMutation({
    mutationFn: (data) => {
      const payload = { ...data, catalogItemId };
      if (editingPart) {
        return base44.entities.EquipmentCatalogPart.update(editingPart.id, payload);
      }
      return base44.entities.EquipmentCatalogPart.create(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['catalogParts', catalogItemId] });
      setShowForm(false);
      setEditingPart(null);
      setFormData({ partType: 'motor', partNumber: '', description: '', whereUsed: '', manufacturerUrl: '', notes: '' });
      toast.success(editingPart ? 'Updated' : 'Created');
    },
    onError: (err) => toast.error(err.message)
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.EquipmentCatalogPart.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['catalogParts', catalogItemId] });
      setPartToDelete(null);
      toast.success('Part deleted');
    },
    onError: (err) => {
      toast.error(err.message);
      setPartToDelete(null);
    }
  });

  const handleDeletePartConfirm = () => {
    if (partToDelete) {
      deleteMutation.mutate(partToDelete.id);
    }
  };

  const filteredParts = parts.filter(p => 
    !searchQuery ||
    p.partNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleSave = () => {
    if (!formData.partNumber || !formData.description) {
      toast.error('Part number and description required');
      return;
    }
    saveMutation.mutate(formData);
  };

  const handleEdit = (part) => {
    setEditingPart(part);
    setFormData({
      partType: part.partType,
      partNumber: part.partNumber,
      description: part.description,
      whereUsed: part.whereUsed || '',
      manufacturerUrl: part.manufacturerUrl || '',
      notes: part.notes || ''
    });
    setShowForm(true);
  };

  if (!catalogItemId) return null;

  return (
    <div className="space-y-4">
      <div className="flex gap-4 items-end">
        <div className="flex-1">
          <label className="text-sm font-medium block mb-1">Search parts</label>
          <Input
            placeholder="Part number or name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            size="sm"
          />
        </div>
        <Button size="sm" onClick={() => { setEditingPart(null); setFormData({ partType: 'motor', partNumber: '', description: '', whereUsed: '', manufacturerUrl: '', notes: '' }); setShowForm(true); }} className="bg-teal-600 hover:bg-teal-700">
          <Plus className="w-3 h-3 mr-2" /> Add Part
        </Button>
      </div>

      {showForm && (
        <Card className="border-yellow-200 bg-yellow-50 p-4">
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium block mb-1">Part Type *</label>
                <Select value={formData.partType} onValueChange={(v) => setFormData(f => ({ ...f, partType: v }))}>
                  <SelectTrigger className="h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="motor">Motor</SelectItem>
                    <SelectItem value="impeller">Impeller</SelectItem>
                    <SelectItem value="seal">Seal</SelectItem>
                    <SelectItem value="bearing">Bearing</SelectItem>
                    <SelectItem value="shaft">Shaft</SelectItem>
                    <SelectItem value="housing">Housing</SelectItem>
                    <SelectItem value="element">Element</SelectItem>
                    <SelectItem value="valve">Valve</SelectItem>
                    <SelectItem value="thermostat">Thermostat</SelectItem>
                    <SelectItem value="heating_element">Heating Element</SelectItem>
                    <SelectItem value="cell">Cell</SelectItem>
                    <SelectItem value="plate">Plate</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium block mb-1">Part Number *</label>
                <Input value={formData.partNumber} onChange={(e) => setFormData(f => ({ ...f, partNumber: e.target.value }))} placeholder="e.g., MOT-500" className="h-8" />
              </div>
              <div className="col-span-2">
                <label className="text-xs font-medium block mb-1">Description *</label>
                <Input value={formData.description} onChange={(e) => setFormData(f => ({ ...f, description: e.target.value }))} placeholder="e.g., 1 HP Motor" className="h-8" />
              </div>
              <div className="col-span-2">
                <label className="text-xs font-medium block mb-1">Where Used</label>
                <Input value={formData.whereUsed} onChange={(e) => setFormData(f => ({ ...f, whereUsed: e.target.value }))} placeholder="e.g., Primary pump drive" className="h-8" />
              </div>
              <div className="col-span-2">
                <label className="text-xs font-medium block mb-1">Manufacturer URL</label>
                <Input value={formData.manufacturerUrl} onChange={(e) => setFormData(f => ({ ...f, manufacturerUrl: e.target.value }))} placeholder="https://..." className="h-8" />
              </div>
              <div className="col-span-2">
                <label className="text-xs font-medium block mb-1">Notes</label>
                <Input value={formData.notes} onChange={(e) => setFormData(f => ({ ...f, notes: e.target.value }))} placeholder="Notes..." className="h-8" />
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <Button size="sm" onClick={() => setShowForm(false)} variant="outline">Cancel</Button>
              <Button size="sm" onClick={handleSave} disabled={saveMutation.isPending} className="bg-teal-600 hover:bg-teal-700">Save</Button>
            </div>
          </div>
        </Card>
      )}

      <div className="space-y-2">
        {filteredParts.length === 0 ? (
          <div className="text-sm text-gray-500 py-4">No parts</div>
        ) : (
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-gray-100">
                <tr>
                  <th className="p-2 text-left font-medium">Type</th>
                  <th className="p-2 text-left font-medium">Part #</th>
                  <th className="p-2 text-left font-medium">Description</th>
                  <th className="p-2 text-left font-medium">Where Used</th>
                  <th className="p-2 text-center font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredParts.map(part => (
                  <tr key={part.id} className="border-t hover:bg-gray-50">
                    <td className="p-2">{part.partType}</td>
                    <td className="p-2 font-mono text-blue-600">{part.partNumber}</td>
                    <td className="p-2">{part.description}</td>
                    <td className="p-2 text-gray-600">{part.whereUsed || '—'}</td>
                    <td className="p-2 text-center">
                      <div className="flex justify-center gap-2">
                        <Button size="sm" variant="ghost" onClick={() => handleEdit(part)}>
                          <Edit className="w-3 h-3" />
                        </Button>
                        <Button 
                          size="sm" 
                          variant="ghost" 
                          onClick={() => setPartToDelete(part)} 
                          disabled={deleteMutation.isPending}
                          className="text-red-600 hover:text-red-700"
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Delete Part Confirmation Modal */}
      <AlertDialog open={!!partToDelete} onOpenChange={(open) => !open && setPartToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Part?</AlertDialogTitle>
            <AlertDialogDescription>
              Delete {partToDelete?.partNumber} - {partToDelete?.description}? This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex gap-3 justify-end mt-4">
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeletePartConfirm} disabled={deleteMutation.isPending} className="bg-red-600 hover:bg-red-700">
              Delete
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}