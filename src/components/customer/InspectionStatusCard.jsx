import React, { useState } from 'react';
import { Calendar, Clock, CheckCircle2, Phone, AlertCircle, Loader2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { createPageUrl } from '@/utils';
import { useNavigate } from 'react-router-dom';
import { format, parseISO } from 'date-fns';

const TEAL = '#1B9B9F';

/**
 * Shown after quote generated but before inspection is completed.
 * Reflects the current gate state and allows reschedule/cancel.
 */
export default function InspectionStatusCard({ lead, event, onRefresh }) {
  const navigate = useNavigate();
  const [cancelling, setCancelling] = useState(false);
  const [cancelled, setCancelled] = useState(false);

  const hasInspection = lead?.inspectionScheduled && event;

  const handleCancelReschedule = async () => {
    if (!window.confirm('Cancel your scheduled inspection? You can reschedule at any time.')) return;
    setCancelling(true);
    try {
      // Mark event as cancelled
      if (event?.id) {
        await base44.asServiceRole.entities.CalendarEvent.update(event.id, { status: 'cancelled' });
      }
      // Reset lead flags
      await base44.entities.Lead.update(lead.id, {
        inspectionScheduled: false,
        inspectionEventId: null,
        stage: 'quote_sent',
      });
      setCancelled(true);
      if (onRefresh) onRefresh();
    } catch (e) {
      alert('Could not cancel. Please call (321) 524-3838.');
    } finally {
      setCancelling(false);
    }
  };

  // ── No inspection scheduled yet — guide them to schedule ──
  if (!hasInspection) {
    return (
      <div className="rounded-2xl border-2 p-6 space-y-4" style={{ borderColor: TEAL, backgroundColor: '#f0fdfd' }}>
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: '#e8f8f9' }}>
            <Calendar className="w-5 h-5" style={{ color: TEAL }} />
          </div>
          <div>
            <h3 className="font-bold text-gray-900">Next Step: Schedule Your Free Inspection</h3>
            <p className="text-sm text-gray-500 mt-0.5">
              Your quote is ready. Schedule a free, no-obligation inspection to confirm details and get started.
            </p>
          </div>
        </div>
        <button
          onClick={() => navigate(createPageUrl('PreQualification'))}
          className="w-full py-3 rounded-xl text-white text-sm font-semibold transition-all hover:opacity-90"
          style={{ backgroundColor: TEAL }}
        >
          Schedule Free Inspection
        </button>
        <p className="text-xs text-center text-gray-400">No obligation. 20–30 minutes. We come to you.</p>
      </div>
    );
  }

  // ── Inspection scheduled ──
  const scheduledDate = event.scheduledDate;
  const dateFormatted = scheduledDate
    ? format(parseISO(scheduledDate), 'EEEE, MMMM d, yyyy')
    : 'Date TBD';

  if (cancelled) {
    return (
      <div className="rounded-2xl border border-gray-200 p-5 bg-gray-50 text-center space-y-3">
        <p className="text-gray-600 text-sm">Inspection cancelled. Ready to reschedule?</p>
        <button
          onClick={() => navigate(createPageUrl('PreQualification'))}
          className="px-6 py-2 rounded-xl text-white text-sm font-semibold"
          style={{ backgroundColor: TEAL }}
        >
          Schedule New Inspection
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border-2 p-6 space-y-4" style={{ borderColor: TEAL, backgroundColor: '#f0fdfd' }}>
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: 'white' }}>
          <CheckCircle2 className="w-5 h-5" style={{ color: TEAL }} />
        </div>
        <div>
          <h3 className="font-bold text-gray-900">Inspection Scheduled</h3>
          <p className="text-sm text-gray-500 mt-0.5">We're looking forward to meeting you.</p>
        </div>
      </div>

      {/* Details */}
      <div className="rounded-xl bg-white border border-gray-100 divide-y divide-gray-100">
        <div className="flex items-center gap-3 px-4 py-3">
          <Calendar className="w-4 h-4 text-gray-400" />
          <div>
            <div className="text-xs text-gray-400">Date</div>
            <div className="text-sm font-semibold text-gray-900">{dateFormatted}</div>
          </div>
        </div>
        <div className="flex items-center gap-3 px-4 py-3">
          <Clock className="w-4 h-4 text-gray-400" />
          <div>
            <div className="text-xs text-gray-400">Time Window</div>
            <div className="text-sm font-semibold text-gray-900">{event.timeWindow || 'To be confirmed'}</div>
          </div>
        </div>
        {event.assignedTechnician && (
          <div className="flex items-center gap-3 px-4 py-3">
            <Phone className="w-4 h-4 text-gray-400" />
            <div>
              <div className="text-xs text-gray-400">Inspector</div>
              <div className="text-sm font-semibold text-gray-900">{event.assignedTechnician}</div>
            </div>
          </div>
        )}
      </div>

      {/* What to expect */}
      <div className="rounded-xl bg-white border border-gray-100 p-4 text-sm text-gray-600 space-y-1.5">
        <p className="font-semibold text-gray-800 text-xs uppercase tracking-wide mb-2">What to expect</p>
        <p>📞 We'll call approximately one hour before arrival.</p>
        <p>⏱ Inspection typically takes 20–30 minutes.</p>
        <p>🧪 We'll test water chemistry and inspect equipment.</p>
        <p>✅ No obligation.</p>
      </div>

      {/* Cancel / reschedule */}
      <button
        onClick={handleCancelReschedule}
        disabled={cancelling}
        className="w-full py-2.5 rounded-xl text-sm font-medium border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors flex items-center justify-center gap-2"
      >
        {cancelling ? <><Loader2 className="w-4 h-4 animate-spin" /> Cancelling...</> : 'Cancel & Reschedule'}
      </button>
    </div>
  );
}