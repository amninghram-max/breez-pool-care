import React, { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Wrench, Search, AlertCircle, Plus, X, Loader2 } from 'lucide-react';
import { createPageUrl } from '@/utils';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import PartsManagementPanel from '@/components/equipment/PartsManagementPanel';

const TYPE_LABELS = {
  pump: 'Pump',
  filter: 'Filter',
  heater: 'Heater',
  chlorinator: 'Chlorinator',
  solar_heater: 'Solar Heater',
  automation: 'Automation',
  salt_cell: 'Salt Cell',
  other: 'Other'
};

const EQUIPMENT_TYPES = [
  { value: 'pump', label: 'Pumps' },
  { value: 'filter', label: 'Filters' },
  { value: 'heater', label: 'Heaters' },
  { value: 'chlorinator', label: 'Chlorinators' }
];

export default function EquipmentProfiles() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Search & filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [selectedCatalogItemId, setSelectedCatalogItemId] = useState(null);
  
  // Create form state
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createFormData, setCreateFormData] = useState({
    type: 'pump',
    brand: '',
    model: '',
    variant: '',
    manufacturerUrl: '',
    manualUrl: '',
    manualFile: null,
    tags: '',
    notes: ''
  });

  const { data: user } = useQuery({
    queryKey: ['userForEquipmentProfiles'],
    queryFn: async () => {
      try {
        return await base44.auth.me();
      } catch {
        return null;
      }
    }
  });



  // Catalog items and parts for search
  const { data: catalogItems = [] } = useQuery({
    queryKey: ['equipmentCatalogItems'],
    queryFn: () => base44.entities.EquipmentCatalogItem.list('-created_date', 500),
    enabled: !!user
  });

  const { data: catalogParts = [] } = useQuery({
    queryKey: ['equipmentCatalogParts'],
    queryFn: () => base44.entities.EquipmentCatalogPart.list('-created_date', 1000),
    enabled: !!user
  });

  // Customer equipment
  const { data: equipment = [], isLoading, error: equipmentError } = useQuery({
    queryKey: ['equipmentProfiles'],
    queryFn: () => base44.entities.PoolEquipment.filter({ isActive: true }, 'equipmentType'),
    enabled: !!user
  });

  const { data: leads = [], error: leadsError } = useQuery({
    queryKey: ['leadsForEquipment'],
    queryFn: () => base44.entities.Lead.list('-created_date', 200),
    enabled: !!user
  });

  const leadMap = Object.fromEntries(leads.map(l => [l.id, l]));

  // Group customer equipment by customer
  const byLead = equipment.reduce((acc, eq) => {
    if (!acc[eq.leadId]) acc[eq.leadId] = [];
    acc[eq.leadId].push(eq);
    return acc;
  }, {});

  // Search and filter catalog items + parts
  const filteredCatalogItems = useMemo(() => {
    let filtered = catalogItems;
    
    // Filter by type
    if (typeFilter !== 'all') {
      filtered = filtered.filter(item => item.type === typeFilter);
    }
    
    // Filter by search (brand, model, variant OR part number/description in related parts)
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(item => {
        const itemMatches = 
          item.brand.toLowerCase().includes(q) ||
          item.model.toLowerCase().includes(q) ||
          (item.variant && item.variant.toLowerCase().includes(q)) ||
          (item.tags && item.tags.some(t => t.toLowerCase().includes(q)));
        
        const relatedParts = catalogParts.filter(p => p.catalogItemId === item.id);
        const partMatches = relatedParts.some(p =>
          p.partNumber.toLowerCase().includes(q) ||
          p.description.toLowerCase().includes(q)
        );
        
        return itemMatches || partMatches;
      });
    }
    
    return filtered;
  }, [searchQuery, typeFilter, catalogItems, catalogParts]);

  // Filter leads by search query (for customer equipment tab)
  const filteredLeadIds = useMemo(() => {
    const q = searchQuery.toLowerCase();
    if (!q.trim()) return Object.keys(byLead);
    return Object.keys(byLead).filter(leadId => {
      const lead = leadMap[leadId];
      if (!lead) return false;
      const fullName = `${lead.firstName || ''} ${lead.lastName || ''}`.toLowerCase();
      const email = (lead.email || '').toLowerCase();
      const phone = (lead.mobilePhone || '').toLowerCase();
      const address = (lead.serviceAddress || '').toLowerCase();
      return fullName.includes(q) || email.includes(q) || phone.includes(q) || address.includes(q);
    });
  }, [searchQuery, byLead, leadMap]);

  // Create catalog item mutation
  const createMutation = useMutation({
    mutationFn: async (formData) => {
      let manualPdfUrl = null;
      
      // Upload PDF if provided
      if (formData.manualFile) {
        const uploadRes = await base44.integrations.Core.UploadFile({ file: formData.manualFile });
        manualPdfUrl = uploadRes.file_url;
      }
      
      const createData = {
        type: formData.type,
        brand: formData.brand,
        model: formData.model,
        variant: formData.variant || undefined,
        manufacturerUrl: formData.manufacturerUrl || undefined,
        manualPdf: manualPdfUrl || undefined,
        manualUrl: formData.manualUrl || undefined,
        tags: formData.tags ? formData.tags.split(',').map(t => t.trim()) : [],
        notes: formData.notes || undefined,
        isActive: true
      };
      
      return base44.entities.EquipmentCatalogItem.create(createData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['equipmentCatalogItems'] });
      setShowCreateForm(false);
      setCreateFormData({
        type: 'pump',
        brand: '',
        model: '',
        variant: '',
        manufacturerUrl: '',
        manualUrl: '',
        manualFile: null,
        tags: '',
        notes: ''
      });
      toast.success('Equipment model created');
    },
    onError: (err) => toast.error(err.message || 'Failed to create equipment')
  });

  const handleCreateSubmit = () => {
    if (!createFormData.brand || !createFormData.model) {
      toast.error('Brand and model are required');
      return;
    }
    if (!createFormData.manualUrl && !createFormData.manualFile) {
      toast.error('Either manual URL or PDF upload is required');
      return;
    }
    createMutation.mutate(createFormData);
  };

  if (isLoading) {
    return <div className="p-6 text-gray-500">Loading equipment profiles...</div>;
  }

  // Show errors
  if (equipmentError || leadsError) {
    return (
      <Alert className="border-red-200 bg-red-50">
        <AlertCircle className="h-4 w-4 text-red-600" />
        <AlertDescription className="text-red-800">
          {equipmentError && <div>Equipment query error: {equipmentError.message}</div>}
          {leadsError && <div>Leads query error: {leadsError.message}</div>}
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-red-600 text-white px-6 py-4 rounded-lg font-bold text-lg">
        DEBUG: Rendering pages/EquipmentProfiles.jsx (tabs should show even if 0 PoolEquipment)
      </div>

      <div>
        <h1 className="text-2xl font-bold text-gray-900">Equipment Directory & Profiles</h1>
        <p className="text-sm text-gray-600 mt-1">
          Manage equipment catalog and customer equipment profiles
        </p>
      </div>

      <Tabs defaultValue="catalog" className="w-full">
        <TabsList>
          <TabsTrigger value="catalog">Equipment Catalog</TabsTrigger>
          <TabsTrigger value="customer">Customer Equipment</TabsTrigger>
        </TabsList>

        {/* CATALOG TAB */}
        <TabsContent value="catalog" className="space-y-6">
          {/* Search Bar */}
          <div className="relative">
            <Search className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
            <Input
              placeholder="Search by brand, model, part number, or description…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>

          {/* Type Filter Tabs */}
          <div className="flex gap-2 flex-wrap">
            {['all', ...EQUIPMENT_TYPES.map(t => t.value)].map(type => (
              <button
                key={type}
                onClick={() => setTypeFilter(type)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  typeFilter === type
                    ? 'bg-teal-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {type === 'all' ? 'All' : TYPE_LABELS[type]}
              </button>
            ))}
          </div>

          {/* Add Equipment Button */}
          <Button onClick={() => setShowCreateForm(true)} className="bg-teal-600 hover:bg-teal-700">
            <Plus className="w-4 h-4 mr-2" /> Add Equipment Model
          </Button>

          {/* Create Form */}
          {showCreateForm && (
            <Card className="border-teal-200 bg-teal-50">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">New Equipment Model</CardTitle>
                  <button onClick={() => setShowCreateForm(false)} className="text-gray-500 hover:text-gray-700">
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium block mb-1">Type *</label>
                    <Select value={createFormData.type} onValueChange={(v) => setCreateFormData(f => ({ ...f, type: v }))}>
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
                    <Input value={createFormData.brand} onChange={(e) => setCreateFormData(f => ({ ...f, brand: e.target.value }))} placeholder="e.g., Pentair" />
                  </div>
                  <div>
                    <label className="text-sm font-medium block mb-1">Model *</label>
                    <Input value={createFormData.model} onChange={(e) => setCreateFormData(f => ({ ...f, model: e.target.value }))} placeholder="e.g., EQ-1000" />
                  </div>
                  <div>
                    <label className="text-sm font-medium block mb-1">Variant</label>
                    <Input value={createFormData.variant} onChange={(e) => setCreateFormData(f => ({ ...f, variant: e.target.value }))} placeholder="e.g., 1HP" />
                  </div>
                </div>

                <div>
                  <label className="text-sm font-medium block mb-1">Manual URL OR PDF Upload *</label>
                  <Input value={createFormData.manualUrl} onChange={(e) => setCreateFormData(f => ({ ...f, manualUrl: e.target.value }))} placeholder="https://example.com/manual.pdf" className="mb-2" />
                  <div className="text-xs text-gray-600 mb-2">OR upload PDF:</div>
                  <input
                    type="file"
                    accept=".pdf"
                    onChange={(e) => setCreateFormData(f => ({ ...f, manualFile: e.target.files?.[0] || null }))}
                    className="block w-full text-sm text-gray-500"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium block mb-1">Manufacturer URL</label>
                  <Input value={createFormData.manufacturerUrl} onChange={(e) => setCreateFormData(f => ({ ...f, manufacturerUrl: e.target.value }))} placeholder="https://..." />
                </div>

                <div>
                  <label className="text-sm font-medium block mb-1">Tags (comma-separated)</label>
                  <Input value={createFormData.tags} onChange={(e) => setCreateFormData(f => ({ ...f, tags: e.target.value }))} placeholder="e.g., single-speed, variable, energy-efficient" />
                </div>

                <div>
                  <label className="text-sm font-medium block mb-1">Notes</label>
                  <Textarea value={createFormData.notes} onChange={(e) => setCreateFormData(f => ({ ...f, notes: e.target.value }))} placeholder="Internal notes..." rows={3} />
                </div>

                <div className="flex gap-3 justify-end pt-4 border-t">
                  <Button onClick={() => setShowCreateForm(false)} variant="outline">Cancel</Button>
                  <Button onClick={handleCreateSubmit} disabled={createMutation.isPending} className="bg-teal-600 hover:bg-teal-700">
                    {createMutation.isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving...</> : 'Create'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Results */}
          {filteredCatalogItems.length === 0 ? (
            <Card className="bg-gray-50 border-gray-200">
              <CardContent className="pt-6 text-center text-gray-500">
                {searchQuery || typeFilter !== 'all' ? 'No equipment found matching your search.' : 'No equipment in catalog yet.'}
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4">
              {filteredCatalogItems.map(item => (
                <div key={item.id}>
                  <Card className={selectedCatalogItemId === item.id ? 'border-teal-400' : ''}>
                    <CardHeader className="cursor-pointer hover:bg-gray-50 transition-colors" onClick={() => setSelectedCatalogItemId(selectedCatalogItemId === item.id ? null : item.id)}>
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-3">
                            <CardTitle className="text-base">{item.brand} {item.model}</CardTitle>
                            <Badge>{TYPE_LABELS[item.type]}</Badge>
                          </div>
                          {item.variant && <p className="text-sm text-gray-600 mt-1">Variant: {item.variant}</p>}
                          {item.tags && item.tags.length > 0 && (
                            <div className="flex gap-2 mt-2 flex-wrap">
                              {item.tags.map(tag => (
                                <Badge key={tag} variant="secondary" className="text-xs">{tag}</Badge>
                              ))}
                            </div>
                          )}
                          {item.notes && <p className="text-sm text-gray-600 mt-2">{item.notes}</p>}
                        </div>
                        <div className="text-xs text-gray-500">{selectedCatalogItemId === item.id ? '▼' : '▶'}</div>
                      </div>
                    </CardHeader>

                    {selectedCatalogItemId === item.id && (
                      <CardContent className="border-t pt-6 space-y-6">
                        <div>
                          <h4 className="font-medium text-sm mb-3">Resources</h4>
                          <div className="flex gap-4 text-sm">
                            {item.manufacturerUrl && (
                              <a href={item.manufacturerUrl} target="_blank" rel="noopener noreferrer" className="text-teal-600 hover:underline">
                                Manufacturer Website
                              </a>
                            )}
                            {item.manualUrl && (
                              <a href={item.manualUrl} target="_blank" rel="noopener noreferrer" className="text-teal-600 hover:underline">
                                Manual (External)
                              </a>
                            )}
                            {item.manualPdf && (
                              <a href={item.manualPdf} target="_blank" rel="noopener noreferrer" className="text-teal-600 hover:underline">
                                Manual (PDF)
                              </a>
                            )}
                          </div>
                        </div>

                        <PartsManagementPanel catalogItemId={item.id} />
                      </CardContent>
                    )}
                  </Card>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        {/* CUSTOMER EQUIPMENT TAB */}
        <TabsContent value="customer" className="space-y-6">
          {equipment.length === 0 ? (
            <>
              <div>
                <h2 className="text-2xl font-bold text-gray-900">Equipment Profiles</h2>
                <p className="text-sm text-gray-600 mt-1">0 PoolEquipment records found</p>
              </div>
              <Card className="bg-amber-50 border-amber-200">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Wrench className="w-5 h-5" />
                    No Equipment on File
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-gray-700">There are no active equipment records in the system yet.</p>
                  <Link to={createPageUrl('LeadsPipeline')}>
                    <Button className="bg-teal-600 hover:bg-teal-700">
                      Go to Leads Pipeline
                    </Button>
                  </Link>
                  <p className="text-xs text-gray-600 mt-3">
                    Tip: Select a converted customer and click "Manage Equipment" to add pool equipment.
                  </p>
                </CardContent>
              </Card>
            </>
          ) : (
            <>
              <div>
                <p className="text-sm text-gray-600">
                  {equipment.length} equipment record(s) across {Object.keys(byLead).length} customer(s)
                </p>
              </div>

          {/* Search Bar */}
          <div className="relative">
            <Search className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
            <Input
              placeholder="Search customers by name, email, phone, or address…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>

          {filteredLeadIds.length === 0 && searchQuery && (
            <Card className="bg-amber-50 border-amber-200">
              <CardContent className="pt-6">
                <p className="text-amber-800">No customers match "{searchQuery}".</p>
              </CardContent>
            </Card>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {filteredLeadIds.map(leadId => {
                const lead = leadMap[leadId];
                const items = byLead[leadId];
                return (
                  <Card key={leadId}>
                  <CardHeader>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1">
                        <CardTitle className="text-base">
                          {lead ? `${lead.firstName} ${lead.lastName || ''}`.trim() : leadId}
                        </CardTitle>
                        {lead?.serviceAddress && (
                          <p className="text-xs text-gray-500 mt-1">{lead.serviceAddress}</p>
                        )}
                      </div>
                      <div className="flex gap-2 flex-shrink-0">
                        <Link to={createPageUrl('EquipmentProfileAdmin') + `?leadId=${leadId}`}>
                          <Button size="sm" className="bg-teal-600 hover:bg-teal-700">
                            Manage
                          </Button>
                        </Link>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {items.length === 0 ? (
                      <p className="text-sm text-gray-500">No equipment on file.</p>
                    ) : (
                      items.map(eq => (
                        <div key={eq.id} className="border-b pb-3 last:border-0">
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-medium text-gray-900">
                              {TYPE_LABELS[eq.equipmentType] || eq.equipmentType}
                            </span>
                            {eq.isActive && <Badge variant="outline" className="bg-green-50">Active</Badge>}
                          </div>
                          {eq.brand && (
                            <p className="text-sm text-gray-600">
                              {eq.brand} {eq.model || ''}
                            </p>
                          )}
                          {eq.serialNumber && (
                            <p className="text-xs text-gray-500">SN: {eq.serialNumber}</p>
                          )}
                          {(eq.manualPdfUrl || eq.manufacturerWebsiteUrl) && (
                            <div className="flex gap-2 mt-2">
                              {eq.manualPdfUrl && (
                                <a href={eq.manualPdfUrl} target="_blank" rel="noreferrer" className="text-xs text-teal-600 hover:underline">
                                  Manual
                                </a>
                              )}
                              {eq.manufacturerWebsiteUrl && (
                                <a href={eq.manufacturerWebsiteUrl} target="_blank" rel="noreferrer" className="text-xs text-teal-600 hover:underline">
                                  Website
                                </a>
                              )}
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </CardContent>
                </Card>
              );
              })}
              </div>
              </>
              )}
              </TabsContent>
      </Tabs>
    </div>
  );
}