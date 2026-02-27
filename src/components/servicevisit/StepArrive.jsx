import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { MapPin, Key, AlertTriangle, Navigation, CheckCircle } from 'lucide-react';
import { useMutation, useQuery } from '@tanstack/react-query';
import LockBanner from './LockBanner';
import LastVisitSnapshot from './LastVisitSnapshot';

export default function StepArrive({ visitData, user, advance }) {
  const [confirmed, setConfirmed] = useState(false);

  // firstChemApplied → lock this step
  const locked = visitData.firstChemApplied === true;

  const { data: event } = useQuery({
    queryKey: ['calEvent', visitData.eventId],
    queryFn: () => visitData.eventId
      ? base44.entities.CalendarEvent.filter({ id: visitData.eventId }).then(r => r[0])
      : null,
    enabled: !!visitData.eventId
  });

  const { data: pool } = useQuery({
    queryKey: ['pool', visitData.poolId],
    queryFn: () => base44.entities.Pool.filter({ id: visitData.poolId }).then(r => r[0]),
    enabled: !!visitData.poolId
  });

  const { data: lead } = useQuery({
    queryKey: ['lead', pool?.leadId],
    queryFn: () => base44.entities.Lead.filter({ id: pool?.leadId }).then(r => r[0]),
    enabled: !!pool?.leadId
  });

  const markArrivedMutation = useMutation({
    mutationFn: async () => {
      if (visitData.eventId) {
        await base44.functions.invoke('updateEventStatus', {
          eventId: visitData.eventId, status: 'arrived', sendNotification: false
        });
      }
    },
    onSuccess: () => advance({ arrivedAt: new Date().toISOString() })
  });

  const handleNavigate = () => {
    const addr = event?.serviceAddress || lead?.serviceAddress;
    if (addr) window.open(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(addr)}`, '_blank');
  };

  const address = event?.serviceAddress || lead?.serviceAddress || 'Address not set';
  const hasAccess = event?.accessNotes || lead?.gateCode;
  const hasPets = lead?.hasPets || lead?.petsEnterPoolArea;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Arrive</h2>
        <p className="text-gray-500 text-sm mt-1">Confirm you've arrived at the property</p>
      </div>

      {locked && <LockBanner />}

      <Card>
        <CardContent className="pt-5 space-y-4">
          <div className="flex items-start gap-3">
            <MapPin className="w-5 h-5 text-teal-600 mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-semibold text-gray-900">{address}</p>
              {lead && <p className="text-sm text-gray-500">{lead.firstName} {lead.lastName}</p>}
            </div>
          </div>

          <Button variant="outline" className="w-full" onClick={handleNavigate}>
            <Navigation className="w-4 h-4 mr-2" />
            Open in Maps
          </Button>
        </CardContent>
      </Card>

      {hasAccess && (
        <Card className="border-yellow-200 bg-yellow-50">
          <CardContent className="pt-4">
            <div className="flex items-start gap-2">
              <Key className="w-4 h-4 text-yellow-700 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-semibold text-yellow-900">Access Instructions</p>
                <p className="text-sm text-yellow-800 mt-1">{event?.accessNotes || lead?.gateCode}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {hasPets && (
        <Card className="border-orange-200 bg-orange-50">
          <CardContent className="pt-4">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-orange-700 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-semibold text-orange-900">Pets on Property</p>
                <p className="text-sm text-orange-800 mt-1">
                  {lead?.petsCanBeSecured ? 'Owner can secure pets — ring doorbell if needed.' : 'Pets may be loose. Use caution near pool area.'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {event?.customerNotes && (
        <Card className="border-blue-200 bg-blue-50">
          <CardContent className="pt-4">
            <p className="text-sm font-semibold text-blue-900">Customer Notes</p>
            <p className="text-sm text-blue-800 mt-1">{event.customerNotes}</p>
          </CardContent>
        </Card>
      )}

      {/* Last visit snapshot */}
      {visitData.poolId && <LastVisitSnapshot poolId={visitData.poolId} />}

      {!locked && (
        <>
          <div className="flex items-center gap-3 p-4 bg-gray-50 rounded-lg border">
            <input
              type="checkbox"
              id="confirmed"
              checked={confirmed}
              onChange={e => setConfirmed(e.target.checked)}
              className="w-5 h-5 rounded accent-teal-600"
            />
            <label htmlFor="confirmed" className="text-sm text-gray-700 font-medium cursor-pointer">
              I have arrived at the property and can access the pool
            </label>
          </div>

          <Button
            className="w-full bg-teal-600 hover:bg-teal-700 h-14 text-base"
            disabled={!confirmed || markArrivedMutation.isPending}
            onClick={() => markArrivedMutation.mutate()}
          >
            <CheckCircle className="w-5 h-5 mr-2" />
            {markArrivedMutation.isPending ? 'Logging arrival...' : 'Confirm Arrival → Test'}
          </Button>
        </>
      )}
    </div>
  );
}