import React, { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Wrench, Search, AlertCircle } from 'lucide-react';
import { createPageUrl } from '@/utils';
import { Link, useNavigate } from 'react-router-dom';

const TYPE_LABELS = {
  pump: 'Pump',
  filter: 'Filter',
  heater: 'Heater',
  solar_heater: 'Solar Heater',
  automation: 'Automation',
  salt_cell: 'Salt Cell',
  other: 'Other'
};

export default function EquipmentProfiles() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');

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

  // Role guard
  if (user && !['admin', 'staff', 'technician'].includes(user.role)) {
    return (
      <Card className="max-w-2xl mx-auto mt-6 border-red-200 bg-red-50">
        <CardContent className="pt-6">
          <p className="text-red-800">Access Denied: Only admin, staff, and technician roles can view equipment profiles.</p>
        </CardContent>
      </Card>
    );
  }

  const { data: equipment = [], isLoading, error: equipmentError } = useQuery({
    queryKey: ['equipmentProfiles'],
    queryFn: () => base44.entities.PoolEquipment.filter({ isActive: true }, 'equipmentType'),
    enabled: !!user && ['admin', 'staff', 'technician'].includes(user?.role)
  });

  const { data: leads = [], error: leadsError } = useQuery({
    queryKey: ['leadsForEquipment'],
    queryFn: () => base44.entities.Lead.list('-created_date', 200),
    enabled: !!user && ['admin', 'staff', 'technician'].includes(user?.role)
  });

  const leadMap = Object.fromEntries(leads.map(l => [l.id, l]));

  // Group by customer
  const byLead = equipment.reduce((acc, eq) => {
    if (!acc[eq.leadId]) acc[eq.leadId] = [];
    acc[eq.leadId].push(eq);
    return acc;
  }, {});

  // Filter leads by search query
  const filteredLeadIds = useMemo(() => {
    if (!searchQuery.trim()) return Object.keys(byLead);
    const q = searchQuery.toLowerCase();
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

  // Empty state
  if (equipment.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Equipment Profiles</h1>
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
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Equipment Profiles</h1>
        <p className="text-sm text-gray-600 mt-1">
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
                        Open Equipment
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
    </div>
  );
}