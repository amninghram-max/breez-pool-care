import React from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Calendar, MessageSquare, Clock } from 'lucide-react';
import { createPageUrl } from '@/utils';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import PoolStatusSnapshot from '../components/customer/PoolStatusSnapshot';
import AdvisoryBanner from '../components/customer/AdvisoryBanner';
import InspectionStatusCard from '../components/customer/InspectionStatusCard';

export default function CustomerDashboard() {
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

  const { data: nextEvent, refetch: refetchEvent } = useQuery({
    queryKey: ['nextServiceEvent', lead?.id],
    queryFn: () => base44.entities.CalendarEvent.filter({ leadId: lead.id, status: 'scheduled' }, 'scheduledDate', 1).then(r => r[0]),
    enabled: !!lead,
  });

  // Determine if we're in the "pre-active" phase: quote generated but not yet a full service customer
  const isPreActivation = lead && !lead.activationPaymentStatus || lead?.activationPaymentStatus === 'pending';

  const { data: freqRec } = useQuery({
    queryKey: ['customerFreqRec', lead?.id],
    queryFn: async () => {
      const recs = await base44.entities.FrequencyRecommendation.filter({ leadId: lead.id }, '-createdAt', 1);
      return recs[0] || null;
    },
    enabled: !!lead,
  });

  const firstName = user?.full_name?.split(' ')[0] || 'there';

  // Inspection event for the lead (the scheduled inspection CalendarEvent)
  const inspectionEvent = nextEvent?.eventType === 'inspection' ? nextEvent : null;
  const serviceEvent = nextEvent?.eventType !== 'inspection' ? nextEvent : null;

  return (
    <div className="space-y-5 max-w-xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Hi, {firstName}</h1>
        <p className="text-sm text-gray-500 mt-0.5">Here's how your pool is looking</p>
      </div>

      {/* ── Pre-activation gate: guide toward inspection ── */}
      {isPreActivation && (
        <InspectionStatusCard
          lead={lead}
          event={inspectionEvent}
          onRefresh={() => { refetchEvent(); }}
        />
      )}

      {/* Advisory banner — only when staff has flagged */}
      <AdvisoryBanner recommendation={freqRec} />

      {/* Pool status snapshot + last service + next visit — only when active */}
      {!isPreActivation && (
        <>
          <PoolStatusSnapshot lastRecord={lastRecord} />
          <div className="grid grid-cols-2 gap-3">
        <Card>
          <CardContent className="pt-4 pb-4 space-y-1">
            <p className="text-xs text-gray-400 uppercase tracking-wider">Last Service</p>
            {lastRecord?.testDate ? (
              <p className="font-semibold text-sm text-gray-800">
                {format(new Date(lastRecord.testDate), 'MMM d')}
              </p>
            ) : (
              <p className="text-sm text-gray-400">Not recorded</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4 space-y-1">
            <p className="text-xs text-gray-400 uppercase tracking-wider">Next Visit</p>
            {serviceEvent?.scheduledDate ? (
              <div>
                <p className="font-semibold text-sm text-gray-800">
                  {format(new Date(serviceEvent.scheduledDate), 'MMM d')}
                </p>
                {serviceEvent.timeWindow && (
                  <p className="text-xs text-gray-400">{serviceEvent.timeWindow}</p>
                )}
              </div>
            ) : (
              <p className="text-sm text-gray-400">TBD</p>
            )}
          </CardContent>
        </Card>
      </div>
      )}

      {/* CTA buttons */}
      <div className="grid grid-cols-2 gap-3">
        <Link to={createPageUrl('CustomerServiceHistory')}>
          <Button variant="outline" className="w-full h-12 text-sm">
            <Clock className="w-4 h-4 mr-2" />
            Service History
          </Button>
        </Link>
        <Link to={createPageUrl('CustomerMessagingPage')}>
          <Button className="w-full h-12 text-sm bg-teal-600 hover:bg-teal-700">
            <MessageSquare className="w-4 h-4 mr-2" />
            Message Us
          </Button>
        </Link>
      </div>
    </div>
  );
}