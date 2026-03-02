import React, { useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ChevronLeft, Plus, Search, Wrench, MessageSquare, AlertCircle, Activity, Mail, Phone, Loader2 } from 'lucide-react';
import { createPageUrl } from '@/utils';
import { Link, useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import QuickActionsBar from '../components/customer/QuickActionsBar';
import SendAlertModal from '../components/customer/SendAlertModal';
import AlertsActionBar from '../components/customer/AlertsActionBar';
import ChemistryCard from '../components/customer/ChemistryCard';

function ActiveCustomersDirectory() {
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  const { data: leads = [] } = useQuery({
    queryKey: ['activeCustomersDirectory'],
    queryFn: () => base44.entities.Lead.list('-updated_date', 500)
  });

  // Filter to active customers only
  const activeCustomers = useMemo(() => {
    return leads.filter(l => 
      l.stage === 'converted' && 
      l.accountStatus === 'active' && 
      !l.isDeleted
    );
  }, [leads]);

  // Fetch recent visits in one batch to avoid N+1
  const { data: allVisits = [] } = useQuery({
    queryKey: ['recentVisitsForDirectory'],
    queryFn: () => base44.entities.ServiceVisit.list('-visitDate', 500),
    enabled: activeCustomers.length > 0
  });

  // Build map of leadId -> most recent visit
  const lastVisitByLead = useMemo(() => {
    const map = {};
    allVisits.forEach(visit => {
      if (!map[visit.propertyId] || new Date(visit.visitDate) > new Date(map[visit.propertyId].visitDate)) {
        map[visit.propertyId] = visit;
      }
    });
    return map;
  }, [allVisits]);

  // Debounce search input
  React.useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 200);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Filter customers by search
  const filteredCustomers = useMemo(() => {
    if (!debouncedSearch.trim()) return activeCustomers;
    const q = debouncedSearch.toLowerCase();
    return activeCustomers.filter(l => {
      const fullName = `${l.firstName || ''} ${l.lastName || ''}`.toLowerCase();
      const email = (l.email || '').toLowerCase();
      const phone = (l.mobilePhone || '').toLowerCase();
      const address = (l.serviceAddress || '').toLowerCase();
      return fullName.includes(q) || email.includes(q) || phone.includes(q) || address.includes(q);
    });
  }, [debouncedSearch, activeCustomers]);

  const handleRowClick = (leadId) => {
    window.location.href = `/CustomerTimeline?leadId=${leadId}`;
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Active Customers Directory</h1>
        <p className="text-sm text-gray-600 mt-1">
          {activeCustomers.length} active customer{activeCustomers.length !== 1 ? 's' : ''} in service
        </p>
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

      {/* Directory */}
      {activeCustomers.length === 0 ? (
        <Card className="bg-amber-50 border-amber-200">
          <CardContent className="pt-6">
            <p className="text-amber-800 mb-3">No active customers found.</p>
            <Link to={createPageUrl('LeadsPipeline')}>
              <Button variant="outline">Go to Leads Pipeline</Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border border-gray-200 rounded-lg overflow-hidden">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Name</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Address</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Last Service</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Status</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Contact</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredCustomers.length === 0 ? (
                <tr>
                  <td colSpan="5" className="px-4 py-6 text-center text-sm text-gray-500">
                    No customers match "{searchQuery}".
                  </td>
                </tr>
              ) : (
                filteredCustomers.map(lead => {
                  const lastVisit = lastVisitByLead[lead.id];
                  const lastServiceDate = lastVisit ? format(new Date(lastVisit.visitDate), 'MMM d, yyyy') : '—';
                  return (
                    <tr
                      key={lead.id}
                      onClick={() => handleRowClick(lead.id)}
                      className="hover:bg-gray-50 transition-colors cursor-pointer"
                    >
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">
                        {lead.firstName} {lead.lastName || ''}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {lead.serviceAddress || '—'}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {lastServiceDate}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <Badge className="bg-green-100 text-green-800">Active</Badge>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        <div className="text-xs">
                          {lead.email && <div>{lead.email}</div>}
                          {lead.mobilePhone && <div>{lead.mobilePhone}</div>}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function CustomerTimeline() {
  const params = new URLSearchParams(window.location.search);
  const leadId = params.get('leadId');
  const queryClient = useQueryClient();

  // If no leadId, show active customers directory
  if (!leadId) {
    return <ActiveCustomersDirectory />;
  }

  const { data: user } = useQuery({
    queryKey: ['userForCustomerTimeline'],
    queryFn: async () => {
      try {
        return await base44.auth.me();
      } catch {
        return null;
      }
    }
  });

  const { data: lead, isLoading: leadLoading } = useQuery({
    queryKey: ['leadDetail', leadId],
    queryFn: async () => {
      if (!leadId) return null;
      const leads = await base44.entities.Lead.list();
      return leads?.find(l => l.id === leadId) || null;
    },
    enabled: !!leadId
  });

  // TEMP: remove after testing
  const [selectedOldVisitId, setSelectedOldVisitId] = useState(null);

  // Load only recent 4 visits on initial render
  const { data: recentVisits = [] } = useQuery({
    queryKey: ['recentVisits', leadId],
    queryFn: () => leadId ? base44.entities.ServiceVisit.filter({ propertyId: leadId }, '-visitDate', 4) : [],
    enabled: !!leadId,
    staleTime: 60000
  });

  // Load visits for chemistry trends (last 30 days)
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const { data: allVisits = [] } = useQuery({
    queryKey: ['allVisitsForDropdown', leadId],
    queryFn: () => leadId ? base44.entities.ServiceVisit.filter({ propertyId: leadId }, '-visitDate', 50) : [],
    enabled: !!leadId,
    staleTime: 60000
  });

  const visitsLast30Days = useMemo(() => {
    return allVisits.filter(v => new Date(v.visitDate) >= thirtyDaysAgo);
  }, [allVisits]);

  // Load single selected older visit details
  const { data: selectedOldVisit } = useQuery({
    queryKey: ['selectedOldVisit', selectedOldVisitId],
    queryFn: () => selectedOldVisitId ? base44.entities.ServiceVisit.list() : null,
    select: (visits) => visits?.find(v => v.id === selectedOldVisitId),
    enabled: !!selectedOldVisitId,
    staleTime: 60000
  });

  // Load equipment for this customer
  const { data: equipment = [] } = useQuery({
    queryKey: ['customerEquipment', leadId],
    queryFn: () => leadId ? base44.entities.CustomerEquipment.filter({ customerId: leadId }) : [],
    enabled: !!leadId,
    staleTime: 60000
  });

  // Load message threads for this customer
  const { data: messageThreads = [] } = useQuery({
    queryKey: ['messageThreads', leadId],
    queryFn: () => leadId ? base44.entities.MessageThread.filter({ leadId }) : [],
    enabled: !!leadId,
    staleTime: 60000
  });

  // Load fecal incidents for this customer
  const { data: fecalIncidents = [] } = useQuery({
    queryKey: ['fecalIncidents', leadId],
    queryFn: () => leadId ? base44.entities.FecalIncident.filter({ leadId }) : [],
    enabled: !!leadId,
    staleTime: 60000
  });

  // Load chemistry risk events for this customer
  const { data: chemistryRiskEvents = [] } = useQuery({
    queryKey: ['chemistryRiskEvents', leadId],
    queryFn: () => leadId ? base44.entities.ChemistryRiskEvent.filter({ leadId }) : [],
    enabled: !!leadId,
    staleTime: 60000
  });

  // Generate older visits dropdown options (skip the 4 recent)
  const olderVisitOptions = useMemo(() => {
    return allVisits.slice(4).map(v => ({
      value: v.id,
      label: `${format(new Date(v.visitDate), 'MMM d, yyyy')}${v.technicianName ? ` • ${v.technicianName}` : ''}`
    }));
  }, [allVisits]);

  const openMessageCount = useMemo(() => {
    return messageThreads.filter(t => t.status === 'new' || t.status === 'in_progress').length;
  }, [messageThreads]);

  const openFecalCount = useMemo(() => {
    return fecalIncidents.filter(f => f.status === 'open' || f.status === 'disinfecting').length;
  }, [fecalIncidents]);

  const activeRiskCount = useMemo(() => {
    return chemistryRiskEvents.filter(e => new Date(e.expiresAt) > new Date()).length;
  }, [chemistryRiskEvents]);


  if (leadLoading) {
    return <div className="text-gray-500">Loading timeline...</div>;
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
      {/* Header with Status & Quick Actions */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <Link to={createPageUrl('CustomerTimeline')}>
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
          <Badge className="bg-green-100 text-green-800">Active</Badge>
        </div>
        
        {/* Quick Contact Actions */}
        <QuickActionsBar lead={lead} />

        {/* Service & Management Buttons */}
        <div className="flex flex-wrap gap-2">
          <Link to={createPageUrl('ServiceVisitEntry') + `?leadId=${leadId}`}>
            <Button size="sm" className="bg-blue-600 hover:bg-blue-700">
              <Plus className="w-3 h-3 mr-1" />
              Log Service
            </Button>
          </Link>
          <Link to={createPageUrl('EquipmentProfileAdmin') + `?leadId=${leadId}`}>
            <Button size="sm" variant="outline">
              <Wrench className="w-3 h-3 mr-1" />
              Equipment
            </Button>
          </Link>
          <Link to={createPageUrl('AdminMessaging') + `?leadId=${leadId}`}>
            <Button size="sm" variant="outline">
              <MessageSquare className="w-3 h-3 mr-1" />
              Messages
            </Button>
          </Link>
          {user && ['admin', 'staff'].includes(user.role) && (
            <SendAlertModal leadId={leadId} />
          )}
        </div>
      </div>

      {/* Contact & Personal Info Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Contact Information</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 text-sm">
          {lead.email && (
            <div className="flex items-start gap-2">
              <Mail className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-xs text-gray-600">Email</p>
                <p className="text-gray-900 break-all">{lead.email}</p>
              </div>
            </div>
          )}
          {lead.mobilePhone && (
            <div className="flex items-start gap-2">
              <Phone className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-xs text-gray-600">Phone</p>
                <p className="text-gray-900">{lead.mobilePhone}</p>
              </div>
            </div>
          )}
          {lead.preferredContact && (
            <div>
              <p className="text-xs text-gray-600">Preferred Contact</p>
              <p className="text-gray-900 capitalize">{lead.preferredContact}</p>
            </div>
          )}
          {lead.gateCode && (
            <div>
              <p className="text-xs text-gray-600">Gate Code</p>
              <p className="text-gray-900 font-mono">{lead.gateCode}</p>
            </div>
          )}
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

      {/* Chemistry Trends (Last 30 Days) */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Chemistry Readings (Last 30 Days)</CardTitle>
        </CardHeader>
        <CardContent>
          {visitsLast30Days.length === 0 ? (
            <p className="text-gray-600 text-sm">No readings in the last 30 days.</p>
          ) : (
            <div className="space-y-3">
              {visitsLast30Days.map((visit, index) => (
                <ChemistryCard
                  key={visit.id}
                  visit={visit}
                  allVisits={visitsLast30Days}
                  visitIndex={index}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Equipment Summary */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Equipment</CardTitle>
            <Link to={createPageUrl('EquipmentProfileAdmin') + `?leadId=${leadId}`}>
              <Button size="sm" variant="ghost" className="text-xs">Add Equipment</Button>
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          {equipment.length === 0 ? (
            <p className="text-gray-600 text-sm">No equipment on file.</p>
          ) : (
            <div className="space-y-3">
              {equipment.map(eq => (
                <div key={eq.id} className="border border-gray-200 rounded-lg p-3 bg-gray-50 text-sm">
                  <div className="font-medium text-gray-900 mb-1">
                    {eq.customType ? (
                      <>
                        {eq.customType.charAt(0).toUpperCase() + eq.customType.slice(1)}
                        {eq.customBrand && ` • ${eq.customBrand}`}
                      </>
                    ) : (
                      'Equipment'
                    )}
                  </div>
                  {eq.customModel && <p className="text-xs text-gray-600">Model: {eq.customModel}</p>}
                  {eq.serialNumber && <p className="text-xs text-gray-600">Serial: {eq.serialNumber}</p>}
                  {eq.installDate && <p className="text-xs text-gray-600">Installed: {format(new Date(eq.installDate), 'MMM d, yyyy')}</p>}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Communications Summary */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Communications</CardTitle>
            <Link to={createPageUrl('AdminMessaging') + `?leadId=${leadId}`}>
              <Button size="sm" variant="ghost" className="text-xs">View All</Button>
            </Link>
          </div>
        </CardHeader>
        <CardContent className="text-sm">
          <p className="text-gray-700">
            <span className="font-medium">{openMessageCount}</span> open message thread{openMessageCount !== 1 ? 's' : ''}
          </p>
          {messageThreads.length > 0 && messageThreads[0].lastMessageAt && (
            <p className="text-xs text-gray-600 mt-2">
              Last message: {format(new Date(messageThreads[0].lastMessageAt), 'MMM d, yyyy')}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Alerts Summary */}
      <Card>
       <CardHeader>
         <div className="flex items-center justify-between">
           <CardTitle className="text-base">Alerts & Incidents</CardTitle>
           <AlertsActionBar leadId={leadId} user={user} />
         </div>
       </CardHeader>
       <CardContent className="space-y-3 text-sm">
         {openFecalCount > 0 && (
           <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded">
             <AlertCircle className="w-4 h-4 text-red-600 mt-0.5 flex-shrink-0" />
             <div>
               <p className="font-medium text-red-900">{openFecalCount} Open Fecal Incident{openFecalCount !== 1 ? 's' : ''}</p>
               <p className="text-xs text-red-700">Requires immediate attention</p>
             </div>
           </div>
         )}
         {activeRiskCount > 0 && (
           <div className="flex items-start gap-2 p-3 bg-yellow-50 border border-yellow-200 rounded">
             <AlertCircle className="w-4 h-4 text-yellow-600 mt-0.5 flex-shrink-0" />
             <div>
               <p className="font-medium text-yellow-900">{activeRiskCount} Active Chemistry Risk Event{activeRiskCount !== 1 ? 's' : ''}</p>
               <p className="text-xs text-yellow-700">Monitor chemical levels</p>
             </div>
           </div>
         )}
         {openFecalCount === 0 && activeRiskCount === 0 && (
           <p className="text-gray-600">No active alerts.</p>
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