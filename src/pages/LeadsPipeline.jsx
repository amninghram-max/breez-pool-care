import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Phone, Mail, MessageSquare, Calendar, AlertCircle, Check } from 'lucide-react';

export default function LeadsPipeline() {
  const queryClient = useQueryClient();
  const [selectedLead, setSelectedLead] = useState(null);

  const { data: user } = useQuery({
    queryKey: ['user'],
    queryFn: () => base44.auth.me(),
  });

  const { data: leads = [] } = useQuery({
    queryKey: ['leads'],
    queryFn: () => base44.entities.Lead.list('-created_date'),
  });

  const updateLeadMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Lead.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
    }
  });

  if (user?.role !== 'admin') {
    return (
      <div className="p-8 text-center">
        <AlertCircle className="w-12 h-12 text-red-600 mx-auto mb-4" />
        <p className="text-gray-600">Admin access required</p>
      </div>
    );
  }

  const stages = [
    { key: 'new_lead', label: 'New Leads', color: 'bg-blue-100 text-blue-800' },
    { key: 'contacted', label: 'Contacted', color: 'bg-purple-100 text-purple-800' },
    { key: 'inspection_scheduled', label: 'Inspection Scheduled', color: 'bg-yellow-100 text-yellow-800' },
    { key: 'inspection_confirmed', label: 'Inspection Confirmed', color: 'bg-green-100 text-green-800' },
    { key: 'quote_sent', label: 'Quote Sent', color: 'bg-indigo-100 text-indigo-800' },
    { key: 'converted', label: 'Converted', color: 'bg-emerald-100 text-emerald-800' },
    { key: 'lost', label: 'Lost', color: 'bg-gray-100 text-gray-800' }
  ];

  const getLeadsByStage = (stage) => leads.filter(lead => lead.stage === stage);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Lead Pipeline</h1>
          <p className="text-gray-600 mt-1">Manage customer onboarding and inspections</p>
        </div>
        <div className="flex gap-4">
          <div className="text-center">
            <p className="text-2xl font-bold text-teal-600">{leads.filter(l => l.isEligible).length}</p>
            <p className="text-xs text-gray-600">Eligible</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-gray-600">{leads.filter(l => !l.isEligible).length}</p>
            <p className="text-xs text-gray-600">Disqualified</p>
          </div>
        </div>
      </div>

      <Tabs defaultValue="pipeline" className="w-full">
        <TabsList className="grid grid-cols-2 w-full max-w-md">
          <TabsTrigger value="pipeline">Pipeline View</TabsTrigger>
          <TabsTrigger value="list">List View</TabsTrigger>
        </TabsList>

        <TabsContent value="pipeline" className="mt-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {stages.map(stage => {
              const stageLeads = getLeadsByStage(stage.key);
              return (
                <div key={stage.key} className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-gray-900">{stage.label}</h3>
                    <Badge className={stage.color}>{stageLeads.length}</Badge>
                  </div>
                  <div className="space-y-2">
                    {stageLeads.map(lead => (
                      <LeadCard 
                        key={lead.id} 
                        lead={lead} 
                        onClick={() => setSelectedLead(lead)}
                        onUpdateStage={(newStage) => updateLeadMutation.mutate({ id: lead.id, data: { stage: newStage }})}
                      />
                    ))}
                    {stageLeads.length === 0 && (
                      <div className="p-4 border-2 border-dashed rounded-lg text-center text-gray-400 text-sm">
                        No leads
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="list" className="mt-6">
          <Card>
            <CardContent className="p-0">
              <table className="w-full">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="text-left p-4 text-sm font-semibold">Name</th>
                    <th className="text-left p-4 text-sm font-semibold">Address</th>
                    <th className="text-left p-4 text-sm font-semibold">Contact</th>
                    <th className="text-left p-4 text-sm font-semibold">Stage</th>
                    <th className="text-left p-4 text-sm font-semibold">Status</th>
                    <th className="text-left p-4 text-sm font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {leads.map(lead => (
                    <tr key={lead.id} className="border-b hover:bg-gray-50">
                      <td className="p-4">
                        <p className="font-medium">{lead.firstName} {lead.lastName}</p>
                      </td>
                      <td className="p-4 text-sm text-gray-600">{lead.serviceAddress}</td>
                      <td className="p-4 text-sm">
                        <p>{lead.email}</p>
                        <p className="text-gray-600">{lead.mobilePhone}</p>
                      </td>
                      <td className="p-4">
                        <Badge className={stages.find(s => s.key === lead.stage)?.color}>
                          {stages.find(s => s.key === lead.stage)?.label}
                        </Badge>
                      </td>
                      <td className="p-4">
                        {lead.isEligible ? (
                          <Badge className="bg-green-100 text-green-800">Eligible</Badge>
                        ) : (
                          <Badge className="bg-red-100 text-red-800">Not Eligible</Badge>
                        )}
                      </td>
                      <td className="p-4">
                        <Button 
                          size="sm" 
                          variant="outline"
                          onClick={() => setSelectedLead(lead)}
                        >
                          View
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {selectedLead && (
        <LeadDetailModal 
          lead={selectedLead} 
          onClose={() => setSelectedLead(null)}
          onUpdate={(data) => updateLeadMutation.mutate({ id: selectedLead.id, data })}
        />
      )}
    </div>
  );
}

function LeadCard({ lead, onClick, onUpdateStage }) {
  return (
    <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={onClick}>
      <CardContent className="p-4 space-y-2">
        <div className="flex items-start justify-between">
          <div>
            <p className="font-semibold text-sm">{lead.firstName} {lead.lastName}</p>
            <p className="text-xs text-gray-600">{lead.serviceAddress}</p>
          </div>
          {!lead.isEligible && (
            <AlertCircle className="w-4 h-4 text-red-600" />
          )}
        </div>
        <div className="flex gap-2 text-xs text-gray-600">
          <Phone className="w-3 h-3" />
          <span>{lead.preferredContact}</span>
        </div>
        {lead.requestedInspectionDate && (
          <div className="flex gap-2 text-xs text-gray-600">
            <Calendar className="w-3 h-3" />
            <span>{lead.requestedInspectionDate}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function LeadDetailModal({ lead, onClose, onUpdate }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <Card className="max-w-2xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>{lead.firstName} {lead.lastName}</CardTitle>
            <Button variant="outline" size="sm" onClick={onClose}>Close</Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Contact Info */}
          <div>
            <h3 className="font-semibold mb-3">Contact Information</h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-gray-600">Email</p>
                <p className="font-medium">{lead.email}</p>
              </div>
              <div>
                <p className="text-gray-600">Phone</p>
                <p className="font-medium">{lead.mobilePhone}</p>
              </div>
              <div>
                <p className="text-gray-600">Address</p>
                <p className="font-medium">{lead.serviceAddress}</p>
              </div>
              <div>
                <p className="text-gray-600">Preferred Contact</p>
                <p className="font-medium capitalize">{lead.preferredContact}</p>
              </div>
            </div>
          </div>

          {/* Eligibility Status */}
          <div>
            <h3 className="font-semibold mb-3">Eligibility Status</h3>
            {lead.isEligible ? (
              <Badge className="bg-green-100 text-green-800">✅ Eligible for Service</Badge>
            ) : (
              <div className="space-y-2">
                <Badge className="bg-red-100 text-red-800">❌ Not Eligible</Badge>
                <p className="text-sm text-gray-600">{lead.disqualificationReason}</p>
              </div>
            )}
          </div>

          {/* Pool Details */}
          <div>
            <h3 className="font-semibold mb-3">Pool Details</h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-gray-600">Pool Type</p>
                <p className="font-medium capitalize">{lead.poolType?.replace(/_/g, ' ')}</p>
              </div>
              <div>
                <p className="text-gray-600">Surface</p>
                <p className="font-medium capitalize">{lead.poolSurface?.replace(/_/g, ' ')}</p>
              </div>
              <div>
                <p className="text-gray-600">Filter</p>
                <p className="font-medium uppercase">{lead.filterType}</p>
              </div>
              <div>
                <p className="text-gray-600">Sanitizer</p>
                <p className="font-medium capitalize">{lead.sanitizerType?.replace(/_/g, ' ')}</p>
              </div>
              <div>
                <p className="text-gray-600">Screened</p>
                <p className="font-medium capitalize">{lead.screenedArea?.replace(/_/g, ' ')}</p>
              </div>
              <div>
                <p className="text-gray-600">Condition</p>
                <p className="font-medium capitalize">{lead.poolCondition?.replace(/_/g, ' ')}</p>
              </div>
            </div>
          </div>

          {/* Inspection */}
          {lead.requestedInspectionDate && (
            <div>
              <h3 className="font-semibold mb-3">Inspection Request</h3>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-gray-600">Requested Date</p>
                  <p className="font-medium">{lead.requestedInspectionDate}</p>
                </div>
                <div>
                  <p className="text-gray-600">Requested Time</p>
                  <p className="font-medium capitalize">{lead.requestedInspectionTime}</p>
                </div>
                <div>
                  <p className="text-gray-600">Assigned Inspector</p>
                  <p className="font-medium">{lead.assignedInspector}</p>
                </div>
              </div>
            </div>
          )}

          {/* Access */}
          {lead.accessRestrictions !== 'none' && (
            <div>
              <h3 className="font-semibold mb-3">Property Access</h3>
              <div className="text-sm space-y-2">
                <p className="text-gray-600">Access Type: <span className="font-medium capitalize">{lead.accessRestrictions?.replace(/_/g, ' ')}</span></p>
                {lead.gateCode && (
                  <p className="text-gray-600">Gate Code: <span className="font-mono bg-gray-100 px-2 py-1 rounded">{lead.gateCode}</span></p>
                )}
              </div>
            </div>
          )}

          {/* Quick Actions */}
          {lead.isEligible && (
            <div className="flex gap-3 pt-4 border-t">
              <Button size="sm" className="flex-1 gap-2">
                <Phone className="w-4 h-4" />
                Call
              </Button>
              <Button size="sm" variant="outline" className="flex-1 gap-2">
                <Mail className="w-4 h-4" />
                Email
              </Button>
              <Button size="sm" variant="outline" className="flex-1 gap-2">
                <MessageSquare className="w-4 h-4" />
                Text
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}