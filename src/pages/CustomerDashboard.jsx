import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';
import { createPageUrl } from '@/utils';
import { Link } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import PoolStatusSnapshot from '../components/customer/PoolStatusSnapshot';
import AdvisoryBanner from '../components/customer/AdvisoryBanner';
import InspectionStatusCard from '../components/customer/InspectionStatusCard';
import FecalIncidentBanner from '../components/customer/FecalIncidentBanner';
import FecalIncidentForm from '../components/customer/FecalIncidentForm';
import ServiceRecordCard from '../components/customer/ServiceRecordCard';
import CommunicationSection from '../components/customer/CommunicationSection';

export default function CustomerDashboard() {
  const [showIncidentForm, setShowIncidentForm] = useState(false);
  const queryClient = useQueryClient();

  const { data: user } = useQuery({
    queryKey: ['user'],
    queryFn: () => base44.auth.me(),
  });

  const { data: lead } = useQuery({
    queryKey: ['customerLead'],
    queryFn: async () => {
      const leads = await base44.entities.Lead.filter({ email: user.email });
      return leads[0] || null;
    },
    enabled: !!user,
  });

  const { data: pool } = useQuery({
    queryKey: ['customerPool', lead?.id],
    queryFn: () => base44.entities.Pool.filter({ leadId: lead.id }).then(r => r[0]),
    enabled: !!lead,
  });

  const { data: lastRecord } = useQuery({
    queryKey: ['lastChemRecord', pool?.id],
    queryFn: () => base44.entities.ChemTestRecord.filter({ poolId: pool.id }, '-testDate', 1).then(r => r[0]),
    enabled: !!pool,
  });

  const { data: lastDosePlan } = useQuery({
    queryKey: ['lastDosePlan', lastRecord?.id],
    queryFn: () => base44.entities.DosePlan.filter({ testRecordId: lastRecord.id }).then(r => r[0]),
    enabled: !!lastRecord,
  });

  const { data: nextEvent, refetch: refetchEvent } = useQuery({
    queryKey: ['nextServiceEvent', lead?.id],
    queryFn: () => base44.entities.CalendarEvent.filter({ leadId: lead.id, status: 'scheduled' }, 'scheduledDate', 1).then(r => r[0]),
    enabled: !!lead,
  });

  const { data: freqRec } = useQuery({
    queryKey: ['customerFreqRec', lead?.id],
    queryFn: async () => {
      const recs = await base44.entities.FrequencyRecommendation.filter({ leadId: lead.id }, '-createdAt', 1);
      return recs[0] || null;
    },
    enabled: !!lead,
  });

  const { data: activeIncident, refetch: refetchIncident } = useQuery({
    queryKey: ['activeIncident', lead?.id],
    queryFn: async () => {
      const incidents = await base44.entities.FecalIncident.filter({ leadId: lead.id }, '-reportedAt', 5);
      // Return most recent open or disinfecting, or the last cleared one (to show cleared banner)
      const open = incidents.find(i => i.status === 'open' || i.status === 'disinfecting');
      if (open) return open;
      const cleared = incidents.find(i => i.status === 'cleared');
      return cleared || null;
    },
    enabled: !!lead,
  });

  const { data: recentMessages = [] } = useQuery({
    queryKey: ['recentMessages', lead?.id],
    queryFn: async () => {
      const threads = await base44.entities.MessageThread.filter({ leadId: lead.id }, '-updated_date', 1);
      if (!threads[0]) return [];
      const msgs = await base44.entities.Message.filter({ threadId: threads[0].id }, '-created_date', 3);
      return msgs;
    },
    enabled: !!lead,
  });

  const firstName = user?.full_name?.split(' ')[0] || 'there';
  const isPreActivation = lead && (!lead.activationPaymentStatus || lead.activationPaymentStatus === 'pending');
  const inspectionEvent = nextEvent?.eventType === 'inspection' ? nextEvent : null;
  const serviceEvent = nextEvent?.eventType !== 'inspection' ? nextEvent : null;
  const hasOpenIncident = activeIncident && activeIncident.status !== 'cleared';

  return (
    <div className="space-y-5 max-w-xl mx-auto">

      {/* Fecal incident persistent banner — shown above everything when open */}
      {activeIncident && (
        <FecalIncidentBanner incident={activeIncident} />
      )}

      {/* Greeting */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Hi, {firstName}</h1>
        <p className="text-sm text-gray-500 mt-0.5">Here's how your pool is doing</p>
      </div>

      {/* Pre-activation: guide toward inspection */}
      {isPreActivation && (
        <InspectionStatusCard
          lead={lead}
          event={inspectionEvent}
          onRefresh={() => refetchEvent()}
        />
      )}

      {/* Advisory banner */}
      <AdvisoryBanner recommendation={freqRec} />

      {/* Active customer sections */}
      {!isPreActivation && (
        <>
          {/* Pool Status Header */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wider font-semibold">Pool Status</p>
              <p className="text-lg font-bold text-gray-900 mt-0.5">
                {lastRecord
                  ? (() => {
                      const fc = lastRecord.freeChlorine;
                      const ph = lastRecord.pH;
                      const phOk = ph >= 7.2 && ph <= 7.8;
                      const fcOk = fc >= 1 && fc <= 3;
                      if (fcOk && phOk) return 'Balanced';
                      if (!fcOk || !phOk) return 'Adjustment in Progress';
                      return 'Monitoring';
                    })()
                  : 'Monitoring'}
              </p>
            </div>
          </div>

          {/* Last service + next visit */}
          <div className="grid grid-cols-2 gap-3">
            <Card className="border-gray-100">
              <CardContent className="pt-4 pb-4 space-y-0.5">
                <p className="text-xs text-gray-400 uppercase tracking-wider font-medium">Last Service</p>
                {lastRecord?.testDate ? (
                  <p className="font-semibold text-sm text-gray-800">
                    {format(new Date(lastRecord.testDate), 'EEEE, MMM d')}
                  </p>
                ) : (
                  <p className="text-sm text-gray-400">Not recorded yet</p>
                )}
              </CardContent>
            </Card>
            <Card className="border-gray-100">
              <CardContent className="pt-4 pb-4 space-y-0.5">
                <p className="text-xs text-gray-400 uppercase tracking-wider font-medium">Next Visit</p>
                {serviceEvent?.scheduledDate ? (
                  <div>
                    <p className="font-semibold text-sm text-gray-800">
                      {format(new Date(serviceEvent.scheduledDate), 'EEEE, MMM d')}
                    </p>
                    {serviceEvent.timeWindow && (
                      <p className="text-xs text-gray-400">{serviceEvent.timeWindow}</p>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-gray-400">Being scheduled</p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Water Snapshot */}
          <PoolStatusSnapshot lastRecord={lastRecord} />

          {/* Latest Service Record */}
          {lastRecord && (
            <ServiceRecordCard record={lastRecord} dosePlan={lastDosePlan} />
          )}

          {/* Communication */}
          <CommunicationSection lead={lead} recentMessages={recentMessages} />

          {/* Fecal incident reporting */}
          {!hasOpenIncident && (
            <div className="pt-1">
              {showIncidentForm ? (
                <Card className="border-gray-200">
                  <CardContent className="pt-5">
                    <FecalIncidentForm
                      leadId={lead?.id}
                      onSubmitted={() => {
                        setShowIncidentForm(false);
                        refetchIncident();
                      }}
                      onCancel={() => setShowIncidentForm(false)}
                    />
                  </CardContent>
                </Card>
              ) : (
                <button
                  onClick={() => setShowIncidentForm(true)}
                  className="flex items-center gap-2 text-sm text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <AlertTriangle className="w-3.5 h-3.5" />
                  Report a fecal incident
                </button>
              )}
            </div>
          )}

          {/* Education link — small, afterthought */}
          <div className="flex items-center justify-between pt-2 border-t border-gray-100">
            <p className="text-xs text-gray-400">Interested in how your pool functions?</p>
            <Link to={createPageUrl('FAQ')}>
              <button className="text-xs text-teal-600 font-medium hover:underline">Learn More →</button>
            </Link>
          </div>
        </>
      )}
    </div>
  );
}