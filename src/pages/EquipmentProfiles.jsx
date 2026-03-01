import React, { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Wrench, Search } from 'lucide-react';
import { createPageUrl } from '@/utils';
import { Link } from 'react-router-dom';

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
  const [searchQuery, setSearchQuery] = useState('');

  const { data: equipment = [], isLoading } = useQuery({
    queryKey: ['equipmentProfiles'],
    queryFn: () => base44.entities.PoolEquipment.filter({ isActive: true }, 'equipmentType')
  });

  const { data: leads = [] } = useQuery({
    queryKey: ['leadsForEquipment'],
    queryFn: () => base44.entities.Lead.list('-created_date', 200)
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

  if (equipment.length === 0) {
    return (
      <Card className="max-w-2xl mx-auto mt-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wrench className="w-5 h-5" />
            Equipment Profiles
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-gray-600">No equipment records found.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Equipment Profiles</h1>
        <p className="text-sm text-gray-600 mt-1">{equipment.length} active equipment item(s)</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {Object.entries(byLead).map(([leadId, items]) => {
          const lead = leadMap[leadId];
          return (
            <Card key={leadId}>
              <CardHeader>
                <CardTitle className="text-base">
                  {lead ? `${lead.firstName} ${lead.lastName || ''}`.trim() : leadId}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {items.map(eq => (
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
                ))}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}