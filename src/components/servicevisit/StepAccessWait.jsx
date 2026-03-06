import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Clock, CheckCircle, AlertCircle } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';

function getAccessWaitKey(eventId) {
  return `breez_access_wait_${eventId}`;
}

function loadTimer(eventId, waitMinutes) {
  const key = getAccessWaitKey(eventId);
  const stored = localStorage.getItem(key);
  if (stored) {
    const { startTs } = JSON.parse(stored);
    return startTs;
  }
  const startTs = Date.now();
  localStorage.setItem(key, JSON.stringify({ startTs, waitMinutes }));
  return startTs;
}

export default function StepAccessWait({ visitData, advance, goTo }) {
  const waitMinutes = 10;
  const eventId = visitData.eventId || 'unknown';

  // Guard: if access_wait reached without accessIssueReason, this is likely a bug or stale localStorage
  const [startTime] = useState(() => {
    console.log('[StepAccessWait] initializing timer', { eventId, waitMinutes, hasAccessIssueReason: !!visitData.accessIssueReason });
    if (!visitData.accessIssueReason) {
      console.warn('[StepAccessWait] WARNING: access_wait entered without accessIssueReason, should have been redirected by goTo guard');
    }
    return loadTimer(eventId, waitMinutes);
  });
  const [elapsed, setElapsed] = useState(Math.floor((Date.now() - startTime) / 1000));
  const [completed, setCompleted] = useState(false);
  const [rescheduleSuccess, setRescheduleSuccess] = useState(null);

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [startTime]);

  const totalSeconds = waitMinutes * 60;
  const remaining = Math.max(0, totalSeconds - elapsed);
  const progress = Math.min(100, (elapsed / totalSeconds) * 100);
  const canAdvance = remaining === 0;

  const fmt = (s) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${String(sec).padStart(2, '0')}`;
  };

  const continueVisitMutation = useMutation({
    mutationFn: async () => {
      console.log('[StepAccessWait] continue-visit action triggered', { eventId });
      await base44.functions.invoke('updateEventStatus', {
        eventId,
        status: 'arrived',
        sendNotification: false,
      });
      console.log('[StepAccessWait] continue-visit mutation success', { eventId });
    },
    onSuccess: () => {
      localStorage.removeItem(getAccessWaitKey(eventId));
      console.log('[StepAccessWait] continue-visit complete, navigating to photos_before');
      goTo('photos_before');
    },
    onError: (error) => {
      console.error('[StepAccessWait] continue-visit mutation failed', { error: error?.message });
    },
  });

  const rescheduleMutation = useMutation({
    mutationFn: async () => {
      console.log('[StepAccessWait] reschedule-visit action triggered', { eventId, accessIssueReason: visitData.accessIssueReason });
      const result = await base44.functions.invoke('handleAccessReschedule', {
        eventId,
        accessIssueReason: visitData.accessIssueReason
      });
      console.log('[StepAccessWait] reschedule-visit mutation success', { eventId, newDate: result.data?.newScheduledDate });
      return result.data;
    },
    onSuccess: (data) => {
      localStorage.removeItem(getAccessWaitKey(eventId));
      console.log('[StepAccessWait] reschedule complete, showing success state', { newDate: data?.newScheduledDate });
      setCompleted(true);
      setRescheduleSuccess({ newDate: data?.newScheduledDate, message: data?.message });
    },
    onError: (error) => {
      console.error('[StepAccessWait] reschedule-visit mutation failed', { error: error?.message });
    },
  });

  const handleReschedule = () => {
    console.log('[StepAccessWait] reschedule button clicked, initiating mutation');
    rescheduleMutation.mutate();
  };

  if (completed) {
    if (rescheduleSuccess?.newDate) {
      return (
        <div className="space-y-4">
          <div>
            <h2 className="text-2xl font-bold text-green-900">Visit Rescheduled</h2>
            <p className="text-gray-600 text-sm mt-1">Automatically scheduled for next available day</p>
          </div>

          <Card className="border-green-200 bg-green-50">
            <CardContent className="pt-6 pb-6">
              <div className="flex items-start gap-3">
                <CheckCircle className="w-6 h-6 text-green-600 flex-shrink-0 mt-0.5" />
                <div className="space-y-2">
                  <p className="font-semibold text-green-900">Visit rescheduled to {rescheduleSuccess.newDate}</p>
                  <p className="text-sm text-green-800">
                    Customer has been notified automatically of the new appointment time.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Button
            variant="outline"
            className="w-full h-11"
            onClick={() => {
              console.log('[StepAccessWait] exit visit after successful reschedule');
              window.location.href = '/';
            }}
          >
            Exit Visit
          </Button>
        </div>
      );
    } else {
      // Manual completion state (if reschedule was not triggered via mutation)
      return (
        <div className="space-y-4">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Visit Marked for Reschedule</h2>
            <p className="text-gray-500 text-sm mt-1">Next steps</p>
          </div>

          <Card className="border-teal-200 bg-teal-50">
            <CardContent className="pt-6 pb-6">
              <div className="flex items-start gap-3">
                <CheckCircle className="w-6 h-6 text-teal-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-teal-900">Visit marked as needs reschedule</p>
                  <p className="text-sm text-teal-800 mt-2">
                    Contact your office to complete the reschedule. The customer will be notified of the new appointment time.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Button
            variant="outline"
            className="w-full h-11"
            onClick={() => {
              console.log('[StepAccessWait] exit visit after manual reschedule mark');
              window.location.href = '/';
            }}
          >
            Exit Visit
          </Button>
        </div>
      );
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Waiting for Customer</h2>
        <p className="text-gray-500 text-sm mt-1">
          {visitData.accessIssueReason
            ? `Access issue: ${visitData.accessIssueReason}`
            : 'Waiting for customer response...'}
        </p>
      </div>

      <Card>
        <CardContent className="pt-6 pb-6 text-center space-y-4">
          <div className={`text-6xl font-mono font-bold ${canAdvance ? 'text-green-600' : 'text-teal-600'}`}>
            {canAdvance ? (
              <CheckCircle className="w-16 h-16 mx-auto text-green-500" />
            ) : (
              fmt(remaining)
            )}
          </div>

          {/* Progress ring */}
          <div className="relative w-32 h-32 mx-auto">
            <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
              <circle cx="18" cy="18" r="15.9" fill="none" stroke="#e5e7eb" strokeWidth="2" />
              <circle
                cx="18"
                cy="18"
                r="15.9"
                fill="none"
                stroke={canAdvance ? '#22c55e' : '#0d9488'}
                strokeWidth="2.5"
                strokeDasharray={`${progress} 100`}
                strokeLinecap="round"
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-sm font-semibold text-gray-600">{Math.round(progress)}%</span>
            </div>
          </div>

          <div className="text-sm text-gray-500">
            {canAdvance
              ? 'Minimum wait period reached'
              : `Wait at least ${waitMinutes} minutes · ${fmt(elapsed)} elapsed`}
          </div>
        </CardContent>
      </Card>

      {!canAdvance && (
        <div className="flex items-start gap-2 text-sm text-gray-700 bg-gray-50 p-3 rounded-lg border border-gray-200">
          <Clock className="w-4 h-4 text-gray-600 flex-shrink-0 mt-0.5" />
          <p>
            Technician must wait until the timer expires before proceeding. This gives the customer time to respond.
          </p>
        </div>
      )}

      <div className="space-y-2">
        <Button
          className="w-full bg-teal-600 hover:bg-teal-700 h-12"
          disabled={!canAdvance || continueVisitMutation.isPending}
          onClick={() => continueVisitMutation.mutate()}
        >
          {continueVisitMutation.isPending ? 'Resuming visit...' : 'Continue Visit'}
        </Button>

        <Button
          variant="outline"
          className="w-full h-12 border-red-200 hover:bg-red-50 text-red-700"
          disabled={!canAdvance || rescheduleMutation.isPending}
          onClick={handleReschedule}
        >
          {rescheduleMutation.isPending ? 'Rescheduling...' : 'Reschedule Visit'}
        </Button>
      </div>

      {continueVisitMutation.isError && (
        <div className="flex items-start gap-2 text-sm text-red-700 bg-red-50 p-3 rounded-lg border border-red-200">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <p>{continueVisitMutation.error?.message || 'Failed to resume visit'}</p>
        </div>
      )}

      {rescheduleMutation.isError && (
        <div className="flex items-start gap-2 text-sm text-red-700 bg-red-50 p-3 rounded-lg border border-red-200">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <p>{rescheduleMutation.error?.message || 'Failed to reschedule visit'}</p>
        </div>
      )}
    </div>
  );
}