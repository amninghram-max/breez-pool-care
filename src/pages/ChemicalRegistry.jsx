import React, { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Plus, Search, Edit, Eye, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

const CATEGORIES = [
  { id: 'chlorine', label: 'Chlorine' },
  { id: 'acid', label: 'Acid' },
  { id: 'base', label: 'Base' },
  { id: 'stabilizer', label: 'Stabilizer' },
  { id: 'calcium', label: 'Calcium' },
  { id: 'salt', label: 'Salt' },
  { id: 'algaecide', label: 'Algaecide' },
  { id: 'phosphate_remover', label: 'Phosphate Remover' },
  { id: 'other', label: 'Other' }
];

const DOSE_UNITS = ['gal', 'qt', 'oz', 'lb', 'kg', 'tablet', 'cup'];
const DOSE_RULE_TYPES = ['per_10k_per_delta', 'lookup_table', 'fixed_recommendation'];
const SERVICE_VISIT_KEYS = [
  'liquidChlorine',
  'chlorineTablets',
  'acid',
  'bakingSoda',
  'stabilizer',
  'salt',
  'calcium',
  'algaecide',
  'phosphateRemover',
  'other'
];

const CATEGORY_TO_KEY_MAP = {
  chlorine: 'liquidChlorine',
  acid: 'acid',
  base: 'bakingSoda',
  stabilizer: 'stabilizer',
  calcium: 'calcium',
  salt: 'salt',
  algaecide: 'algaecide',
  phosphate_remover: 'phosphateRemover',
  other: 'other'
};

function ChemicalForm({ chemical, onSave, onCancel, isLoading }) {
  const defaultCategory = 'chlorine';
  const [formData, setFormData] = useState(
    chemical || {
      name: '',
      category: defaultCategory,
      commonProductForms: '',
      activeIngredient: '',
      strengthPercent: '',
      defaultDoseUnit: 'gal',
      densityLbPerGal: '',
      costCanonicalUnit: '',
      costPerCanonicalUnitCents: '',
      notes: '',
      dosageRuleType: 'per_10k_per_delta',
      dosageRuleJson: '',
      serviceVisitKey: CATEGORY_TO_KEY_MAP[defaultCategory],
      ppe: '',
      incompatibilities: '',
      warnings: '',
      tags: [],
      isActive: true
    }
  );
  const [tagsInput, setTagsInput] = useState(chemical?.tags?.join(', ') || '');

  const handleCategoryChange = (newCategory) => {
    setFormData({
      ...formData,
      category: newCategory,
      // Auto-suggest serviceVisitKey based on category if not already set
      serviceVisitKey: formData.serviceVisitKey === CATEGORY_TO_KEY_MAP[formData.category] 
        ? CATEGORY_TO_KEY_MAP[newCategory] 
        : formData.serviceVisitKey
    });
  };

  const handleSave = () => {
    if (!formData.name || !formData.category || !formData.defaultDoseUnit || !formData.dosageRuleType || !formData.serviceVisitKey) {
      toast.error('Please fill in all required fields');
      return;
    }
    
    // Validate cost fields: if cents provided, unit must be selected
    if (formData.costPerCanonicalUnitCents && !formData.costCanonicalUnit) {
      toast.error('Cost unit is required when cost per unit is specified');
      return;
    }

    // Parse dosageRuleJson if provided
    if (formData.dosageRuleJson) {
      try {
        JSON.parse(formData.dosageRuleJson);
      } catch {
        toast.error('dosageRuleJson must be valid JSON');
        return;
      }
    }

    const payload = {
      ...formData,
      tags: tagsInput
        .split(',')
        .map(t => t.trim())
        .filter(t => t.length > 0),
      strengthPercent: formData.strengthPercent ? parseFloat(formData.strengthPercent) : null,
      densityLbPerGal: formData.densityLbPerGal ? parseFloat(formData.densityLbPerGal) : null,
      costCanonicalUnit: formData.costCanonicalUnit || null,
      costPerCanonicalUnitCents: formData.costPerCanonicalUnitCents ? parseInt(formData.costPerCanonicalUnitCents, 10) : null
    };

    onSave(payload);
  };

  return (
    <div className="space-y-4 max-h-96 overflow-y-auto pr-2">
      {/* Identity */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Chemical Name *</label>
        <Input
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          placeholder="e.g., Liquid Chlorine (10–12.5%)"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Category *</label>
        <select
          value={formData.category}
          onChange={(e) => handleCategoryChange(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
        >
          {CATEGORIES.map(cat => (
            <option key={cat.id} value={cat.id}>{cat.label}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Active Ingredient</label>
        <Input
          value={formData.activeIngredient}
          onChange={(e) => setFormData({ ...formData, activeIngredient: e.target.value })}
          placeholder="e.g., NaOCl"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Strength %</label>
        <Input
          type="number"
          step="0.1"
          value={formData.strengthPercent}
          onChange={(e) => setFormData({ ...formData, strengthPercent: e.target.value })}
          placeholder="e.g., 12.5"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Common Product Forms</label>
        <Input
          value={formData.commonProductForms}
          onChange={(e) => setFormData({ ...formData, commonProductForms: e.target.value })}
          placeholder="e.g., sodium hypochlorite, cal-hypo"
        />
      </div>

      {/* Units & Handling */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Default Dose Unit *</label>
        <select
          value={formData.defaultDoseUnit}
          onChange={(e) => setFormData({ ...formData, defaultDoseUnit: e.target.value })}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
        >
          {DOSE_UNITS.map(unit => (
            <option key={unit} value={unit}>{unit}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Logs As (ServiceVisit Key) *</label>
        <select
          value={formData.serviceVisitKey}
          onChange={(e) => setFormData({ ...formData, serviceVisitKey: e.target.value })}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
        >
          {SERVICE_VISIT_KEYS.map(key => (
            <option key={key} value={key}>{key}</option>
          ))}
        </select>
        <p className="text-xs text-gray-500 mt-1">Maps to ServiceVisit.chemicalsAdded field</p>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Density (lbs/gal)</label>
        <Input
          type="number"
          step="0.01"
          value={formData.densityLbPerGal}
          onChange={(e) => setFormData({ ...formData, densityLbPerGal: e.target.value })}
          placeholder="e.g., 11.2"
        />
      </div>

      {/* Cost Tracking */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Cost Canonical Unit</label>
        <select
          value={formData.costCanonicalUnit}
          onChange={(e) => setFormData({ ...formData, costCanonicalUnit: e.target.value })}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
        >
          <option value="">Select unit…</option>
          <option value="fl_oz">fl_oz (fluid ounce)</option>
          <option value="qt">qt (quart)</option>
          <option value="gal">gal (gallon)</option>
          <option value="oz_wt">oz_wt (ounce weight)</option>
          <option value="lb">lb (pound)</option>
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Cost per Canonical Unit (cents)</label>
        <Input
          type="number"
          value={formData.costPerCanonicalUnitCents}
          onChange={(e) => setFormData({ ...formData, costPerCanonicalUnitCents: e.target.value })}
          placeholder="e.g., 250 = $2.50"
        />
        <p className="text-xs text-gray-500 mt-1">Store cents; 250 = $2.50</p>
      </div>

      {/* Dosage Guidance */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Dosage Rule Type *</label>
        <select
          value={formData.dosageRuleType}
          onChange={(e) => setFormData({ ...formData, dosageRuleType: e.target.value })}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
        >
          {DOSE_RULE_TYPES.map(type => (
            <option key={type} value={type}>{type}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Dosage Rule JSON</label>
        <textarea
          value={formData.dosageRuleJson}
          onChange={(e) => setFormData({ ...formData, dosageRuleJson: e.target.value })}
          placeholder={`{"targetMetric":"FC","multiplierPer10kPerDelta":0.013,"unit":"gal","notes":""}`}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs font-mono h-20 resize-none"
        />
      </div>

      {/* Safety */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">PPE</label>
        <Input
          value={formData.ppe}
          onChange={(e) => setFormData({ ...formData, ppe: e.target.value })}
          placeholder="e.g., gloves, eye protection"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Incompatibilities</label>
        <Input
          value={formData.incompatibilities}
          onChange={(e) => setFormData({ ...formData, incompatibilities: e.target.value })}
          placeholder="e.g., Never mix with acid"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Warnings</label>
        <textarea
          value={formData.warnings}
          onChange={(e) => setFormData({ ...formData, warnings: e.target.value })}
          placeholder="Safety warnings and precautions..."
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm resize-none h-20"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Tags (comma-separated)</label>
        <Input
          value={tagsInput}
          onChange={(e) => setTagsInput(e.target.value)}
          placeholder="e.g., liquid, fast-acting, common"
        />
      </div>

      <div>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={formData.isActive}
            onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
            className="rounded"
          />
          <span className="text-sm font-medium text-gray-700">Active</span>
        </label>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
        <textarea
          value={formData.notes}
          onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
          placeholder="General notes..."
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm resize-none h-16"
        />
      </div>

      {/* Actions */}
      <div className="flex gap-2 pt-4 border-t">
        <Button
          onClick={handleSave}
          disabled={isLoading}
          className="flex-1 bg-blue-600 hover:bg-blue-700"
        >
          {isLoading ? 'Saving...' : 'Save'}
        </Button>
        <Button
          variant="outline"
          onClick={onCancel}
          disabled={isLoading}
          className="flex-1"
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}

function ChemicalDetailModal({ chemical, onClose }) {
  const parsedRule = useMemo(() => {
    try {
      return chemical.dosageRuleJson ? JSON.parse(chemical.dosageRuleJson) : null;
    } catch {
      return null;
    }
  }, [chemical.dosageRuleJson]);

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-96 overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{chemical.name}</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          {/* Identity */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs font-semibold text-gray-600 uppercase">Category</p>
              <p className="text-sm text-gray-900">{chemical.category}</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-600 uppercase">Logs As</p>
              <p className="text-sm text-gray-900 font-mono bg-gray-50 px-2 py-1 rounded text-xs">{chemical.serviceVisitKey}</p>
            </div>
            {chemical.activeIngredient && (
              <div>
                <p className="text-xs font-semibold text-gray-600 uppercase">Active Ingredient</p>
                <p className="text-sm text-gray-900">{chemical.activeIngredient}</p>
              </div>
            )}
            {chemical.strengthPercent && (
              <div>
                <p className="text-xs font-semibold text-gray-600 uppercase">Strength</p>
                <p className="text-sm text-gray-900">{chemical.strengthPercent}%</p>
              </div>
            )}
            {chemical.commonProductForms && (
              <div>
                <p className="text-xs font-semibold text-gray-600 uppercase">Product Forms</p>
                <p className="text-sm text-gray-900">{chemical.commonProductForms}</p>
              </div>
            )}
          </div>

          {/* Units */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs font-semibold text-gray-600 uppercase">Default Dose Unit</p>
              <p className="text-sm text-gray-900 font-mono">{chemical.defaultDoseUnit}</p>
            </div>
            {chemical.densityLbPerGal && (
              <div>
                <p className="text-xs font-semibold text-gray-600 uppercase">Density</p>
                <p className="text-sm text-gray-900">{chemical.densityLbPerGal} lbs/gal</p>
              </div>
            )}
          </div>

          {/* Dosage Rule */}
          <div className="border-t pt-4">
            <p className="text-xs font-semibold text-gray-600 uppercase mb-2">Dosage Rule</p>
            <div className="bg-gray-50 p-3 rounded-lg border border-gray-200">
              <p className="text-xs text-gray-600 mb-2">
                <span className="font-semibold">Type:</span> {chemical.dosageRuleType}
              </p>
              {parsedRule ? (
                <pre className="text-xs text-gray-700 overflow-auto max-h-48 font-mono">
                  {JSON.stringify(parsedRule, null, 2)}
                </pre>
              ) : (
                <p className="text-xs text-gray-600 italic">(No JSON rule)</p>
              )}
            </div>
          </div>

          {/* Safety */}
          {(chemical.ppe || chemical.incompatibilities || chemical.warnings) && (
            <div className="border-t pt-4">
              <div className="flex items-start gap-2 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                <AlertCircle className="w-4 h-4 text-yellow-600 mt-0.5 flex-shrink-0" />
                <div className="text-sm">
                  {chemical.ppe && (
                    <p><span className="font-semibold">PPE:</span> {chemical.ppe}</p>
                  )}
                  {chemical.incompatibilities && (
                    <p><span className="font-semibold">Incompatibilities:</span> {chemical.incompatibilities}</p>
                  )}
                  {chemical.warnings && (
                    <p><span className="font-semibold">Warnings:</span> {chemical.warnings}</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Tags */}
          {chemical.tags?.length > 0 && (
            <div className="border-t pt-4">
              <p className="text-xs font-semibold text-gray-600 uppercase mb-2">Tags</p>
              <div className="flex flex-wrap gap-2">
                {chemical.tags.map(tag => (
                  <Badge key={tag} variant="secondary">{tag}</Badge>
                ))}
              </div>
            </div>
          )}

          {/* Notes */}
          {chemical.notes && (
            <div className="border-t pt-4">
              <p className="text-xs font-semibold text-gray-600 uppercase mb-2">Notes</p>
              <p className="text-sm text-gray-700">{chemical.notes}</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function ChemicalRegistry() {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [viewingId, setViewingId] = useState(null);
  const [isFormOpen, setIsFormOpen] = useState(false);

  const { data: user } = useQuery({
    queryKey: ['user'],
    queryFn: async () => {
      try {
        return await base44.auth.me();
      } catch {
        return null;
      }
    }
  });

  const { data: chemicals = [] } = useQuery({
    queryKey: ['chemicalCatalog'],
    queryFn: () => base44.entities.ChemicalCatalogItem.list('-updated_date', 100)
  });

  const saveMutation = useMutation({
    mutationFn: async (data) => {
      if (editingId) {
        return base44.entities.ChemicalCatalogItem.update(editingId, data);
      } else {
        return base44.entities.ChemicalCatalogItem.create(data);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chemicalCatalog'] });
      toast.success(editingId ? 'Chemical updated' : 'Chemical created');
      setIsFormOpen(false);
      setEditingId(null);
    }
  });

  const canEdit = user && ['admin', 'staff'].includes(user.role);

  const filteredChemicals = useMemo(() => {
    return chemicals.filter(chem => {
      const matchesSearch =
        !searchQuery ||
        chem.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        chem.activeIngredient?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        chem.tags?.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()));
      
      const matchesCategory = !selectedCategory || chem.category === selectedCategory;
      
      return matchesSearch && matchesCategory;
    });
  }, [chemicals, searchQuery, selectedCategory]);

  return (
    <div className="max-w-6xl mx-auto space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Chemical Registry</h1>
          <p className="text-gray-600 mt-1">Global directory of chemicals with dosage guidance and safety notes</p>
        </div>
        {canEdit && (
          <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
            <DialogTrigger asChild>
              <Button
                onClick={() => {
                  setEditingId(null);
                  setIsFormOpen(true);
                }}
                className="bg-blue-600 hover:bg-blue-700"
              >
                <Plus className="w-4 h-4 mr-2" />
                Add Chemical
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>{editingId ? 'Edit Chemical' : 'Add Chemical'}</DialogTitle>
              </DialogHeader>
              <ChemicalForm
                chemical={editingId ? chemicals.find(c => c.id === editingId) : null}
                onSave={(data) => saveMutation.mutate(data)}
                onCancel={() => {
                  setIsFormOpen(false);
                  setEditingId(null);
                }}
                isLoading={saveMutation.isPending}
              />
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Search & Filters */}
      <div className="space-y-4">
        <div className="relative">
          <Search className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
          <Input
            placeholder="Search by name, ingredient, or tags…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Category Tabs */}
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setSelectedCategory('')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              selectedCategory === ''
                ? 'bg-gray-900 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            All
          </button>
          {CATEGORIES.map(cat => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                selectedCategory === cat.id
                  ? 'bg-gray-900 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* Results */}
      {filteredChemicals.length === 0 ? (
        <Card className="bg-gray-50 border-gray-200">
          <CardContent className="pt-6">
            <p className="text-gray-600 text-center">No chemicals found.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {filteredChemicals.map(chem => (
            <Card key={chem.id} className="hover:shadow-md transition-shadow">
              <CardContent className="pt-6">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <h3 className="font-semibold text-gray-900">{chem.name}</h3>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <Badge variant="secondary" className="text-xs">
                        {CATEGORIES.find(c => c.id === chem.category)?.label}
                      </Badge>
                      <Badge variant="outline" className="text-xs font-mono">
                        {chem.serviceVisitKey}
                      </Badge>
                      {chem.strengthPercent && (
                        <span className="text-xs text-gray-600">{chem.strengthPercent}%</span>
                      )}
                      <span className="text-xs text-gray-600 font-mono">{chem.defaultDoseUnit}</span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setViewingId(chem.id)}
                      className="gap-1"
                    >
                      <Eye className="w-4 h-4" />
                      View
                    </Button>
                    {canEdit && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setEditingId(chem.id);
                          setIsFormOpen(true);
                        }}
                        className="gap-1"
                      >
                        <Edit className="w-4 h-4" />
                        Edit
                      </Button>
                    )}
                  </div>
                </div>

                {/* Quick preview */}
                <div className="text-sm text-gray-600 space-y-1 mb-2">
                  {chem.activeIngredient && <p><span className="font-semibold">Active:</span> {chem.activeIngredient}</p>}
                  {chem.commonProductForms && <p><span className="font-semibold">Forms:</span> {chem.commonProductForms}</p>}
                </div>

                {/* Tags */}
                {chem.tags?.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {chem.tags.slice(0, 3).map(tag => (
                      <Badge key={tag} variant="outline" className="text-xs">{tag}</Badge>
                    ))}
                    {chem.tags.length > 3 && (
                      <span className="text-xs text-gray-600">+{chem.tags.length - 3} more</span>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Detail Modal */}
      {viewingId && (
        <ChemicalDetailModal
          chemical={chemicals.find(c => c.id === viewingId)}
          onClose={() => setViewingId(null)}
        />
      )}
    </div>
  );
}