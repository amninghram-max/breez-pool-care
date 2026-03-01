import React, { useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ChevronLeft, Plus, FileCheck, Droplet, Wrench, MessageSquare, Calendar } from 'lucide-react';
import { createPageUrl } from '@/utils';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';

export default function CustomerTimeline() {
  const params = new URLSearchParams(window.location.search);
  const leadId = params.get('leadId');

  const { data: lead, isLoading: leadLoading } = useQuery({
    queryKey: ['leadDetail', leadId],
    queryFn: async () => {
      if (!leadId) return null;
      const leads = await base44.entities.Lead.list();
      return leads?.find(l => l.id === leadId) || null;
    },
    enabled: !!leadId
  });

  const { data: serviceVisits = [] } = useQuery({
    queryKey: ['serviceVisitsTimeline', leadId],
    queryFn: () => leadId ? base44.entities.ServiceVisit.filter({ propertyId: leadId }) : [],
    enabled: !!leadId
  });

  const { data: inspections = [] } = useQuery({
    queryKey: ['inspectionsTimeline', leadId],
    queryFn: () => leadId ? base44.entities.InspectionRecord.filter({ leadId }) : [],
    enabled: !!leadId
  });

  const { data: chemTests = [] } = useQuery({
    queryKey: ['chemTestsTimeline', leadId],
    queryFn: () => leadId ? base44.entities.ChemTestRecord.filter({ leadId }) : [],
    enabled: !!leadId
  });

  const { data: equipmentChanges = [] } = useQuery({
    queryKey: ['equipmentChangesTimeline', leadId],
    queryFn: () => leadId ? base44.entities.EquipmentChangeLog.filter({ leadId }) : [],
    enabled: !!leadId
  });

  const { data: messages = [] } = useQuery({
    queryKey: ['messagesTimeline', leadId],
    queryFn: () => leadId ? base44.entities.MessageThread.filter({ leadId }) : [],
    enabled: !!leadId
  });

  // Normalize all events into a timeline
  const timelineEvents = useMemo(() => {
    const events = [];

    serviceVisits.forEach(v => {
      events.push({
        id: `sv-${v.id}`,
        type: 'service',
        timestamp: new Date(v.visitDate),
        date: v.visitDate,
        title: 'Service Visit',
        icon: Droplet,
        color: 'bg-blue-100 border-blue-300',
        badge: 'Service',
        badgeColor: 'bg-blue-100 text-blue-800',
        details: [
          v.technicianName ? `Tech: ${v.technicianName}` : null,
          v.freeChlorine ? `FC: ${v.freeChlorine}ppm` : null,
          v.pH ? `pH: ${v.pH}` : null,
          v.notes ? `Notes: ${v.notes.substring(0, 50)}...` : null
        ].filter(Boolean),
        link: createPageUrl('ServiceVisitEntry') + `?leadId=${leadId}`,
        linkText: 'View Details'
      });
    });

    inspections.forEach(i => {
      events.push({
        id: `insp-${i.id}`,
        type: 'inspection',
        timestamp: new Date(i.submittedAt),
        date: i.submittedAt,
        title: 'Inspection Submitted',
        icon: FileCheck,
        color: 'bg-green-100 border-green-300',
        badge: i.finalizationStatus === 'finalized' ? 'Finalized' : 'Pending',
        badgeColor: i.finalizationStatus === 'finalized' ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800',
        details: [
          i.submittedByName ? `By: ${i.submittedByName}` : null,
          i.confirmedPoolCondition ? `Condition: ${i.confirmedPoolCondition}` : null,
          i.greenSeverity ? `Green Severity: ${i.greenSeverity}` : null,
          i.techNotes ? `Notes: ${i.techNotes.substring(0, 50)}...` : null
        ].filter(Boolean),
        link: createPageUrl('InspectionFinalization') + `?leadId=${leadId}&inspectionId=${i.id}`,
        linkText: 'View Inspection'
      });
    });

    chemTests.forEach(c => {
      events.push({
        id: `chem-${c.id}`,
        type: 'chemistry',
        timestamp: new Date(c.testDate),
        date: c.testDate,
        title: 'Chemistry Test',
        icon: Droplet,
        color: 'bg-purple-100 border-purple-300',
        badge: 'Chemistry',
        badgeColor: 'bg-purple-100 text-purple-800',
        details: [
          `FC: ${c.freeChlorine}ppm`,
          `pH: ${c.pH}`,
          `TA: ${c.totalAlkalinity}ppm`,
          c.notes ? `Notes: ${c.notes.substring(0, 50)}...` : null
        ].filter(Boolean),
        link: null,
        linkText: null
      });
    });

    equipmentChanges.forEach(e => {
      events.push({
        id: `equip-${e.id}`,
        type: 'equipment',
        timestamp: new Date(e.changedAt),
        date: e.changedAt,
        title: 'Equipment Changed',
        icon: Wrench,
        color: 'bg-orange-100 border-orange-300',
        badge: 'Equipment',
        badgeColor: 'bg-orange-100 text-orange-800',
        details: [
          e.changedByName ? `By: ${e.changedByName}` : null,
          `Field: ${e.fieldChanged}`,
          e.reason ? `Reason: ${e.reason}` : null
        ].filter(Boolean),
        link: null,
        linkText: null
      });
    });

    messages.forEach(m => {
      events.push({
        id: `msg-${m.id}`,
        type: 'message',
        timestamp: new Date(m.lastMessageAt || m.created_date),
        date: m.lastMessageAt || m.created_date,
        title: m.subject,
        icon: MessageSquare,
        color: 'bg-gray-100 border-gray-300',
        badge: m.status,
        badgeColor: m.status === 'resolved' ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800',
        details: [
          m.priority ? `Priority: ${m.priority}` : null,
          m.category ? `Category: ${m.category}` : null
        ].filter(Boolean),
        link: createPageUrl('MessageThread') + `?threadId=${m.id}`,
        linkText: 'View Thread'
      });
    });

    // Sort by date descending
    events.sort((a, b) => b.timestamp - a.timestamp);
    return events;
  }, [serviceVisits, inspections, chemTests, equipmentChanges, messages, leadId]);

  if (!leadId) {
    return (
      <Card className="max-w-2xl mx-auto mt-6 border-amber-200 bg-amber-50">
        <CardContent className="pt-6">
          <p className="text-amber-800">No customer selected. Please select a customer to view their timeline.</p>
        </CardContent>
      </Card>
    );
  }

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
    <div className="max-w-4xl mx-auto space-y-6 p-6">
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
          <Link to={createPageUrl('EquipmentProfile') + `?leadId=${leadId}`}>
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

      {/* Timeline */}
      {timelineEvents.length === 0 ? (
        <Card className="bg-gray-50 border-gray-200">
          <CardContent className="pt-6">
            <p className="text-gray-600">No activity yet. Start by logging a service or submitting an inspection.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {timelineEvents.map((event) => {
            const Icon = event.icon;
            return (
              <Card key={event.id} className={`border-2 ${event.color}`}>
                <CardContent className="pt-6">
                  <div className="flex gap-4">
                    {/* Icon */}
                    <div className="flex-shrink-0">
                      <div className="w-10 h-10 rounded-lg bg-white border-2 border-gray-300 flex items-center justify-center">
                        <Icon className="w-5 h-5 text-gray-700" />
                      </div>
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        <h3 className="font-semibold text-gray-900">{event.title}</h3>
                        <Badge className={event.badgeColor}>{event.badge}</Badge>
                      </div>
                      <p className="text-sm text-gray-600 mb-2">
                        {format(event.timestamp, 'PPP p')}
                      </p>
                      {event.details.length > 0 && (
                        <ul className="text-sm text-gray-700 space-y-1 mb-3">
                          {event.details.map((detail, idx) => (
                            <li key={idx}>{detail}</li>
                          ))}
                        </ul>
                      )}
                      {event.link && (
                        <Link to={event.link}>
                          <Button size="sm" variant="outline">
                            {event.linkText}
                          </Button>
                        </Link>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}