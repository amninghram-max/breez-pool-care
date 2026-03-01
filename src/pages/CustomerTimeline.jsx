import React, { useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ChevronLeft, Plus, FileCheck, Droplet, Wrench, MessageSquare, Calendar, Search } from 'lucide-react';
import { createPageUrl } from '@/utils';
import { Link, useNavigate } from 'react-router-dom';
import { format } from 'date-fns';

function CustomerPicker() {
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const navigate = useNavigate();

  const { data: leads = [] } = useQuery({
    queryKey: ['leadsForPicker'],
    queryFn: () => base44.entities.Lead.list('-created_date', 200)
  });

  // Filter to converted customers only
  const convertedLeads = leads.filter(l => l.stage === 'converted');

  // Debounce search input
  React.useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 200);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const filteredLeads = useMemo(() => {
    if (!debouncedSearch.trim()) return convertedLeads;
    const q = debouncedSearch.toLowerCase();
    return convertedLeads.filter(l => {
      const fullName = `${l.firstName || ''} ${l.lastName || ''}`.toLowerCase();
      const email = (l.email || '').toLowerCase();
      const phone = (l.mobilePhone || '').toLowerCase();
      const address = (l.serviceAddress || '').toLowerCase();
      return fullName.includes(q) || email.includes(q) || phone.includes(q) || address.includes(q);
    });
  }, [debouncedSearch, convertedLeads]);

  return (
    <div className="max-w-2xl mx-auto space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Customer Timeline</h1>
        <p className="text-sm text-gray-600 mt-1">Select a customer to view their activity timeline</p>
      </div>

      {/* Search Input */}
      <div className="relative">
        <Search className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
        <Input
          placeholder="Search by name, email, phone, or address…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
          autoFocus
        />
      </div>

      {/* Customer List */}
      {convertedLeads.length === 0 ? (
        <Card className="bg-amber-50 border-amber-200">
          <CardContent className="pt-6">
            <p className="text-amber-800 mb-3">No converted customers found.</p>
            <Link to={createPageUrl('LeadsPipeline')}>
              <Button variant="outline">Go to Leads Pipeline</Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="border border-gray-200 rounded-lg divide-y divide-gray-200 overflow-hidden">
          {filteredLeads.length === 0 ? (
            <p className="text-gray-500 text-center py-4 text-sm">No customers match "{searchQuery}".</p>
          ) : (
            <>
              {filteredLeads.slice(0, 30).map(lead => (
                <button
                  key={lead.id}
                  type="button"
                  onClick={() => {
                    window.location.href = `/CustomerTimeline?leadId=${lead.id}`;
                  }}
                  className="w-full text-left px-4 py-3 hover:bg-blue-50 transition-colors cursor-pointer flex items-center justify-between text-sm"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 truncate">
                      {lead.firstName} {lead.lastName || ''}
                    </p>
                    {lead.serviceAddress && (
                      <p className="text-xs text-gray-600 truncate">{lead.serviceAddress}</p>
                    )}
                  </div>
                  <ChevronLeft className="w-4 h-4 text-gray-400 rotate-180 flex-shrink-0 ml-2" />
                </button>
              ))}
              {filteredLeads.length > 30 && (
                <div className="px-4 py-2 bg-gray-50 text-xs text-gray-600 text-center">
                  Showing 30 of {filteredLeads.length} matches
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Help Link */}
      <div className="pt-4 border-t border-gray-200 text-center">
        <p className="text-sm text-gray-600 mb-3">Looking for a non-converted lead?</p>
        <Link to={createPageUrl('LeadsPipeline')}>
          <Button variant="outline" className="w-full">Go to Leads Pipeline</Button>
        </Link>
      </div>
    </div>
  );
}

export default function CustomerTimeline() {
  const params = new URLSearchParams(window.location.search);
  const leadId = params.get('leadId');

  // If no leadId, show customer picker
  if (!leadId) {
    return <CustomerPicker />;
  }

  const { data: lead, isLoading: leadLoading } = useQuery({
    queryKey: ['leadDetail', leadId],
    queryFn: async () => {
      if (!leadId) return null;
      const leads = await base44.entities.Lead.list();
      return leads?.find(l => l.id === leadId) || null;
    },
    enabled: !!leadId
  });

  const [selectedOldVisitId, setSelectedOldVisitId] = useState(null);

  // Load only recent 4 visits on initial render
  const { data: recentVisits = [] } = useQuery({
    queryKey: ['recentVisits', leadId],
    queryFn: () => leadId ? base44.entities.ServiceVisit.filter({ propertyId: leadId }, '-visitDate', 4) : [],
    enabled: !!leadId,
    staleTime: 60000
  });

  // Load all visits for dropdown (older than the 4 recent)
  const { data: allVisits = [] } = useQuery({
    queryKey: ['allVisitsForDropdown', leadId],
    queryFn: () => leadId ? base44.entities.ServiceVisit.filter({ propertyId: leadId }, '-visitDate', 50) : [],
    enabled: !!leadId,
    staleTime: 60000
  });

  // Load single selected older visit details
  const { data: selectedOldVisit } = useQuery({
    queryKey: ['selectedOldVisit', selectedOldVisitId],
    queryFn: () => selectedOldVisitId ? base44.entities.ServiceVisit.list() : null,
    select: (visits) => visits?.find(v => v.id === selectedOldVisitId),
    enabled: !!selectedOldVisitId,
    staleTime: 60000
  });

  // Generate older visits dropdown options (skip the 4 recent)
  const olderVisitOptions = useMemo(() => {
    return allVisits.slice(4).map(v => ({
      value: v.id,
      label: `${format(new Date(v.visitDate), 'MMM d, yyyy')}${v.technicianName ? ` • ${v.technicianName}` : ''}`
    }));
  }, [allVisits]);





  if (leadLoading) {
    return <div className="p-6 text-gray-500">Loading timeline...</div>;
  }

  if (!lead) {
    return (
      <Card className="max-w-2xl mx-auto mt-6 border-red-200 bg-red-50">
        <CardContent className="pt-6">
          <p className="text-red-800">Customer not found.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link to={createPageUrl('AdminHome')}>
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
      </div>

      {/* Next Actions */}
      <Card className="bg-blue-50 border-blue-200">
        <CardHeader>
          <CardTitle className="text-base">Next Actions</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Link to={createPageUrl('ServiceVisitEntry') + `?leadId=${leadId}`}>
            <Button className="bg-blue-600 hover:bg-blue-700">
              <Plus className="w-4 h-4 mr-2" />
              Log Service
            </Button>
          </Link>
          <Link to={createPageUrl('InspectionSubmit') + `?leadId=${leadId}`}>
            <Button className="bg-green-600 hover:bg-green-700">
              <Plus className="w-4 h-4 mr-2" />
              Submit Inspection
            </Button>
          </Link>
          <Link to={createPageUrl('EquipmentProfileAdmin') + `?leadId=${leadId}`}>
            <Button variant="outline">
              <Wrench className="w-4 h-4 mr-2" />
              Equipment
            </Button>
          </Link>
          <Link to={createPageUrl('AdminMessaging') + `?leadId=${leadId}`}>
            <Button variant="outline">
              <MessageSquare className="w-4 h-4 mr-2" />
              Messages
            </Button>
          </Link>
        </CardContent>
      </Card>

      {/* Recent Visits Section */}
      <Card className="bg-blue-50 border-blue-200">
        <CardHeader>
          <CardTitle className="text-base">Recent Visits</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {recentVisits.length === 0 ? (
            <p className="text-gray-600 text-sm">No service visits recorded yet.</p>
          ) : (
            recentVisits.map(visit => (
              <div key={visit.id} className="border border-gray-200 rounded-lg p-3 bg-white text-sm space-y-2">
                <div className="flex items-center justify-between">
                  <p className="font-medium text-gray-900">
                    {format(new Date(visit.visitDate), 'MMM d, yyyy')}
                  </p>
                  {visit.technicianName && (
                    <Badge className="bg-blue-100 text-blue-800">{visit.technicianName}</Badge>
                  )}
                </div>
                {(visit.freeChlorine || visit.pH || visit.totalAlkalinity) && (
                  <div className="text-xs text-gray-600 space-y-1">
                    {visit.freeChlorine && <p>FC: {visit.freeChlorine} ppm</p>}
                    {visit.pH && <p>pH: {visit.pH}</p>}
                    {visit.totalAlkalinity && <p>TA: {visit.totalAlkalinity} ppm</p>}
                  </div>
                )}
                {visit.notes && (
                  <p className="text-xs text-gray-700 italic">{visit.notes.substring(0, 100)}...</p>
                )}
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* Older Visits Dropdown */}
      {olderVisitOptions.length > 0 && (
        <Card className="bg-gray-50 border-gray-200">
          <CardHeader>
            <CardTitle className="text-base">Older Visits</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Select value={selectedOldVisitId || ''} onValueChange={setSelectedOldVisitId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a visit to view details…" />
              </SelectTrigger>
              <SelectContent>
                {olderVisitOptions.map(opt => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Selected Older Visit Details */}
            {selectedOldVisit && (
              <div className="border border-gray-300 rounded-lg p-4 bg-white space-y-3 mt-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-semibold text-gray-900">
                    {format(new Date(selectedOldVisit.visitDate), 'PPP p')}
                  </h4>
                  {selectedOldVisit.technicianName && (
                    <Badge>{selectedOldVisit.technicianName}</Badge>
                  )}
                </div>

                {(selectedOldVisit.freeChlorine || selectedOldVisit.pH || selectedOldVisit.totalAlkalinity || selectedOldVisit.calciumHardness || selectedOldVisit.cyanuricAcid) && (
                  <div className="grid grid-cols-2 gap-2 text-xs text-gray-700">
                    {selectedOldVisit.freeChlorine && <p>FC: {selectedOldVisit.freeChlorine} ppm</p>}
                    {selectedOldVisit.pH && <p>pH: {selectedOldVisit.pH}</p>}
                    {selectedOldVisit.totalAlkalinity && <p>TA: {selectedOldVisit.totalAlkalinity} ppm</p>}
                    {selectedOldVisit.calciumHardness && <p>CH: {selectedOldVisit.calciumHardness} ppm</p>}
                    {selectedOldVisit.cyanuricAcid && <p>CYA: {selectedOldVisit.cyanuricAcid} ppm</p>}
                  </div>
                )}

                {selectedOldVisit.chemicalsAdded && Object.keys(selectedOldVisit.chemicalsAdded).length > 0 && (
                  <div className="border-t pt-2">
                    <p className="text-xs font-medium text-gray-900 mb-1">Chemicals Added</p>
                    <div className="grid grid-cols-2 gap-1 text-xs text-gray-700">
                      {selectedOldVisit.chemicalsAdded.liquidChlorine && <p>Liquid Chlorine: {selectedOldVisit.chemicalsAdded.liquidChlorine} gal</p>}
                      {selectedOldVisit.chemicalsAdded.chlorineTablets && <p>Tablets: {selectedOldVisit.chemicalsAdded.chlorineTablets} lbs</p>}
                      {selectedOldVisit.chemicalsAdded.acid && <p>Acid: {selectedOldVisit.chemicalsAdded.acid} gal</p>}
                      {selectedOldVisit.chemicalsAdded.bakingSoda && <p>Baking Soda: {selectedOldVisit.chemicalsAdded.bakingSoda} lbs</p>}
                    </div>
                  </div>
                )}

                {selectedOldVisit.notes && (
                  <div className="border-t pt-2">
                    <p className="text-xs font-medium text-gray-900 mb-1">Notes</p>
                    <p className="text-xs text-gray-700">{selectedOldVisit.notes}</p>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}