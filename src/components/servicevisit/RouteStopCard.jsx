import React, { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Navigation, Key, FileText, Timer, CheckCircle, ChevronRight, MessageSquare } from 'lucide-react';
import { createPageUrl } from '@/utils';
import RecurringMessagesBanner from './RecurringMessagesBanner';

const EVENT_TYPE_LABELS = {
  service: 'Service',
  inspection: 'Inspection',
  recovery: 'Recovery / Green-to-Clean',
  retest: 'Retest / Follow-up',
};

const EVENT_TYPE_COLORS = {
  service: 'bg-teal-100 text-teal-800',
  inspection: 'bg-blue-100 text-blue-800',
  recovery: 'bg-orange-100 text-orange-800',
  retest: 'bg-purple-100 text-purple-800',
};

function WaitCountdown({ eventId, getTimer }) {
  const timer = getTimer(eventId);
  if (!timer || timer.remaining <= 0) {
    return <span className="text-xs font-semibold text-green-700">Timer complete — ready to retest</span>;
  }
  const m = Math.floor(timer.remaining / 60);
  const s = timer.remaining % 60;
  return <span className="text-xs font-semibold text-yellow-700">Waiting: {m}:{String(s).padStart(2, '0')} remaining</span>;
}

export default function RouteStopCard({ event, idx, visitState, user, getTimer, effectiveDate, effectiveTechnician, onNavigate, onUpdateStatus }) {
  const [showDetails, setShowDetails] = useState(false);

  const isCompleted = visitState === 'completed';
  const isWaiting = visitState === 'waiting';
  const isInProgress = visitState === 'in_progress';

  const typeLabel = EVENT_TYPE_LABELS[event.eventType] || event.eventType || 'Service';
  const typeColor = EVENT_TYPE_COLORS[event.eventType] || 'bg-gray-100 text-gray-800';

  const pageName = event.eventType === 'inspection' ? 'InspectionSubmit' : 'ServiceVisitFlow';
  const startVisitParams = new URLSearchParams({ eventId: event.id, poolId: event.poolId || '' });
  if (event.eventType !== 'inspection' && effectiveDate && effectiveTechnician) {
    startVisitParams.set('returnTo', 'TechnicianRoute');
    startVisitParams.set('date', effectiveDate);
    startVisitParams.set('technician', effectiveTechnician);
  }
  const startVisitUrl = `${createPageUrl(pageName)}?${startVisitParams.toString()}`;

  return (
    <Card className={`border-2 transition-colors ${
      isCompleted   ? 'border-green-200 opacity-70' :
      isWaiting     ? 'border-yellow-400' :
      isInProgress  ? 'border-teal-400' :
      'border-gray-200'
    }`}>
      <CardContent className="pt-4 pb-4 space-y-3">
        {/* Header row */}
        <div className="flex items-start gap-3">
          <div className={`flex items-center justify-center w-9 h-9 rounded-full flex-shrink-0 font-bold text-sm ${
            isCompleted   ? 'bg-green-100 text-green-700' :
            isWaiting     ? 'bg-yellow-100 text-yellow-700' :
            isInProgress  ? 'bg-teal-100 text-teal-700' :
            'bg-gray-100 text-gray-700'
          }`}>
            {isCompleted ? <CheckCircle className="w-4 h-4" /> :
             isWaiting   ? <Timer className="w-4 h-4" /> :
             event.routePosition || idx + 1}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge className={typeColor}>{typeLabel}</Badge>
              {isCompleted && <Badge className="bg-green-100 text-green-800">Done</Badge>}
              {isInProgress && <Badge className="bg-teal-100 text-teal-800">In Progress</Badge>}
              {isWaiting && <Badge className="bg-yellow-100 text-yellow-800">Waiting</Badge>}
            </div>

            {/* Customer name + address */}
            <p className="font-semibold text-gray-900 mt-1 text-sm leading-tight">
              {event.customerName || event.serviceAddress?.split(',')[0]}
            </p>
            <p className="text-xs text-gray-500 truncate">{event.serviceAddress}</p>

            {isWaiting && (
              <div className="mt-1">
                <WaitCountdown eventId={event.id} getTimer={getTimer} />
              </div>
            )}
          </div>
        </div>

        {/* CTA */}
        {!isCompleted && (
          <a href={startVisitUrl}>
            <Button className={`w-full h-10 ${
              isWaiting || isInProgress ? 'bg-teal-600 hover:bg-teal-700' : 'bg-teal-600 hover:bg-teal-700'
            }`}>
              <ChevronRight className="w-4 h-4 mr-1" />
              {isWaiting || isInProgress ? 'Resume Visit' : 'Start Visit'}
            </Button>
          </a>
        )}

        {/* Navigate + Details */}
        <div className="flex gap-2">
          {!isCompleted && (
            <Button variant="outline" size="sm" className="flex-1" onClick={() => onNavigate(event)}>
              <Navigation className="w-3.5 h-3.5 mr-1" />
              Navigate
            </Button>
          )}
          <Button variant="outline" size="sm" className={isCompleted ? 'w-full' : 'flex-1'} onClick={() => setShowDetails(v => !v)}>
            {showDetails ? 'Hide' : 'Details'}
          </Button>
        </div>

        {/* Expanded details */}
        {showDetails && (
          <div className="space-y-3 pt-2 border-t">
            {event.accessNotes && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-2.5">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-yellow-900 mb-1">
                  <Key className="w-3.5 h-3.5" /> Access Instructions
                </div>
                <p className="text-xs text-yellow-800">{event.accessNotes}</p>
              </div>
            )}

            {event.specialNotes && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-2.5">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-blue-900 mb-1">
                  <FileText className="w-3.5 h-3.5" /> Special Notes
                </div>
                <p className="text-xs text-blue-800">{event.specialNotes}</p>
              </div>
            )}

            {event.customerNotes && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-2.5">
                <p className="text-xs font-semibold text-blue-900 mb-1">Customer Notes</p>
                <p className="text-xs text-blue-800">{event.customerNotes}</p>
              </div>
            )}

            {/* Recurring messages */}
            {event.leadId && (
              <RecurringMessagesBanner leadId={event.leadId} user={user} />
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}