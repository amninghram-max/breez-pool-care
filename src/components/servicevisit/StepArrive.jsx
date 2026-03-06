import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { MapPin, Key, AlertTriangle, Navigation, CheckCircle, PlayCircle, AlertCircle } from 'lucide-react';
import { useMutation, useQuery } from '@tanstack/react-query';
import LockBanner from './LockBanner';
import LastVisitSnapshot from './LastVisitSnapshot';
import RecurringMessagesBanner from './RecurringMessagesBanner';

// Helper: retry with exponential backoff for transient failures only
const invokeWithRetry = async (functionName, payload, maxRetries = 2) => {
  let lastError;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      if (attempt > 0) {
        console.log(`[StepArrive] Retry attempt ${attempt} for ${functionName}`);
      }
      const response = await base44.functions.invoke(functionName, payload);
      if (attempt > 0) {
        console.log(`[StepArrive] ${functionName} succeeded after ${attempt} retry(ies)`);
      }
      return response;
    } catch (error) {
      lastError = error;
      const status = error?.response?.status;
      const isTransient = status === 502 || status === 503 || status === 504 || error?.message?.includes('timeout') || error?.message?.includes('TIME_LIMIT');
      
      if (!isTransient || attempt === maxRetries) {
        console.error(`[StepArrive] ${functionName} failed (transient=${isTransient}):`, error?.message);
        throw error;
      }
      
      // Exponential backoff: 300ms, 600ms
      const delayMs = 300 * Math.pow(2, attempt);
      console.log(`[StepArrive] ${functionName} transient failure, retrying in ${delayMs}ms`);
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
  throw lastError;
};

export default function StepArrive({ visitData, user, advance }) {
  const [confirmed, setConfirmed] = useState(false);
  const [arrived, setArrived] = useState(false);
  const [retryingMutation, setRetryingMutation] = useState(null);

  // Lock derivation: prefer loaded dosePlan actions, fall back to visitData.dosePlan, then flag
  const { data: liveDosePlan } = useQuery({
    queryKey: ['dosePlanForLock', visitData.testRecordId],
    queryFn: () => base44.entities.DosePlan.filter({ testRecordId: visitData.testRecordId }, '-created_date', 1).then(r => r[0] || null),
    enabled: !!visitData.testRecordId
  });
  const locked =
    liveDosePlan?.actions?.some(a => a.applied) ??
    visitData.dosePlan?.actions?.some(a => a.applied) ??
    visitData.firstChemApplied === true;

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
        setRetryingMutation('mark_arrived');
        try {
          console.log('[StepArrive] markArrivedMutation: starting updateEventStatus for status=arrived');
          await invokeWithRetry('updateEventStatus', {
            eventId: visitData.eventId, status: 'arrived', sendNotification: false
          });
          console.log('[StepArrive] markArrivedMutation: success');
        } finally {
          setRetryingMutation(null);
        }
      }
    },
    onSuccess: () => setArrived(true)
  });

  const startVisitMutation = useMutation({
    mutationFn: async () => {
      if (visitData.eventId) {
        setRetryingMutation('start_visit');
        try {
          console.log('[StepArrive] startVisitMutation: starting updateEventStatus for status=in_progress');
          await invokeWithRetry('updateEventStatus', {
            eventId: visitData.eventId, status: 'in_progress', sendNotification: false
          });
          console.log('[StepArrive] startVisitMutation: success');
        } finally {
          setRetryingMutation(null);
        }
      }
    },
    onSuccess: () => advance({
      arrivedAt: new Date().toISOString(),
      visitStartedAt: new Date().toISOString(),
      // Propagate Lead.id so downstream steps (StepCloseout) can use it as ServiceVisit.propertyId
      leadId: lead?.id || null,
    })
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

      {/* Recurring messages for this customer */}
      {lead?.id && <RecurringMessagesBanner leadId={lead.id} user={user} />}

      {!locked && !arrived && (
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

          {retryingMutation === 'mark_arrived' && (
            <div className="flex items-center gap-2 text-sm text-orange-700 font-medium bg-orange-50 rounded-lg px-3 py-2.5 border border-orange-200">
              <AlertCircle className="w-4 h-4 text-orange-600 flex-shrink-0 animate-pulse" />
              Connecting to service tools… retrying
            </div>
          )}

          <Button
            className="w-full bg-teal-600 hover:bg-teal-700 h-14 text-base"
            disabled={!confirmed || markArrivedMutation.isPending}
            onClick={() => markArrivedMutation.mutate()}
          >
            <CheckCircle className="w-5 h-5 mr-2" />
            {markArrivedMutation.isPending ? 'Logging arrival...' : 'I\'m Here'}
          </Button>
        </>
      )}

      {!locked && arrived && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm text-teal-700 font-medium bg-teal-50 rounded-lg px-3 py-2.5 border border-teal-200">
            <CheckCircle className="w-4 h-4 text-teal-600 flex-shrink-0" />
            Arrival logged — ready to begin service
          </div>

          {retryingMutation === 'start_visit' && (
            <div className="flex items-center gap-2 text-sm text-orange-700 font-medium bg-orange-50 rounded-lg px-3 py-2.5 border border-orange-200">
              <AlertCircle className="w-4 h-4 text-orange-600 flex-shrink-0 animate-pulse" />
              Connecting to service tools… retrying
            </div>
          )}

          <Button
            className="w-full bg-teal-600 hover:bg-teal-700 h-14 text-base font-bold"
            disabled={startVisitMutation.isPending}
            onClick={() => startVisitMutation.mutate()}
          >
            <PlayCircle className="w-5 h-5 mr-2" />
            {startVisitMutation.isPending ? 'Starting visit...' : 'Start Service Visit'}
          </Button>
        </div>
      )}
    </div>
  );
}