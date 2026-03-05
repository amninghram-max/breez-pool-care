import React, { useState } from 'react';
import { ChevronLeft, Loader2, CheckCircle2, Calendar, Clock } from 'lucide-react';
import { base44 } from '@/api/base44Client';

const TEAL = '#1B9B9F';

// Generate next 14 available days (Mon–Sat only)
function getAvailableDates() {
  const dates = [];
  const d = new Date();
  d.setDate(d.getDate() + 1); // start tomorrow
  while (dates.length < 14) {
    const day = d.getDay();
    if (day !== 0) { // skip Sunday
      dates.push(new Date(d));
    }
    d.setDate(d.getDate() + 1);
  }
  return dates;
}

const TIME_SLOTS = [
  { value: 'morning',   label: 'Morning',   sub: '8:00 AM – 11:00 AM' },
  { value: 'midday',    label: 'Midday',     sub: '11:00 AM – 2:00 PM' },
  { value: 'afternoon', label: 'Afternoon',  sub: '2:00 PM – 5:00 PM' },
];

function formatDate(d) {
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function toISODate(d) {
  if (!d || !(d instanceof Date) || !Number.isFinite(d.getTime())) {
    return null;
  }
  return d.toISOString().split('T')[0];
}

export default function PublicScheduler({ leadId, clientEmail, clientFirstName, onSuccess, token }) {
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [phone, setPhone] = useState('');
  const [street, setStreet] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('FL');
  const [zip, setZip] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [confirmed, setConfirmed] = useState(null);

  const dates = getAvailableDates();

  const handleSubmit = async () => {
    if (!phone.trim()) {
      setError('Please enter your phone number.');
      return;
    }
    if (!street.trim() || !city.trim() || !zip.trim()) {
      setError('Please complete your service address.');
      return;
    }
    if (!selectedDate || !selectedSlot) {
      setError('Please select a date and time window.');
      return;
    }
    const isoDate = toISODate(selectedDate);
    if (!isoDate) {
      setError('Invalid date selected. Please try again.');
      return;
    }
    setError('');
    setLoading(true);

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Request timed out')), 25000)
    );

    try {
      const payload = {
        token: token || null,
        firstName: clientFirstName.trim(),
        phone: phone.trim(),
        email: clientEmail,
        serviceAddress: {
          street: street.trim(),
          city: city.trim(),
          state: state.trim(),
          zip: zip.trim()
        },
        requestedDate: isoDate,
        requestedTimeSlot: selectedSlot,
      };

      let data;
      let v2PlatformError = false;
      
      try {
        const res = await Promise.race([
          base44.functions.invoke('scheduleFirstInspectionPublicV2', payload),
          timeoutPromise
        ]);
        data = res?.data ?? res;
      } catch (v2Err) {
        const msg = String(v2Err?.message || v2Err || '');
        const isPlatformError = msg.includes('timed out') || msg.includes('Deployment does not exist') || msg.includes('FUNCTION_NOT_FOUND');
        console.log('SCHED_V2_FAIL', { error: msg, isPlatformError });
        
        if (!isPlatformError) {
          throw v2Err;
        }
        v2PlatformError = true;
      }

      // Fallback to V1 ONLY if V2 had a platform/deployment error AND no structured response
      const isStructuredError = data && typeof data === 'object' && (data.success !== undefined || data.code !== undefined || data.error !== undefined);
      const businessRuleFailure = isStructuredError && data?.success === false && ![
        'FUNCTION_NOT_FOUND', 'INSPECTION_CREATE_FAILED', 'INSPECTION_CREATE_FORBIDDEN'
      ].includes(data?.code);
      
      if ((v2PlatformError || !data) && !businessRuleFailure) {
        console.log('SCHED_FALLBACK_V1_USED', { reason: v2PlatformError ? 'platform_error' : 'no_response' });
        try {
          const v1Res = await Promise.race([
            base44.functions.invoke('scheduleFirstInspectionPublicV1', payload),
            timeoutPromise
          ]);
          data = v1Res?.data ?? v1Res;
        } catch (v1Err) {
          console.warn('SCHED_V1_FALLBACK_FAILED', { error: String(v1Err?.message || v1Err || '') });
          throw v1Err;
        }
      } else if (businessRuleFailure) {
        console.log('SCHED_V2_BUSINESS_RULE_ERROR', { code: data?.code, error: data?.error });
      }

      if (data?.success === true) {
        setConfirmed(data);
        if (onSuccess) onSuccess(data);
      } else {
        const codeMessages = {
          TOKEN_NOT_FOUND: 'Invalid or expired token.',
          INCOMPLETE_DATA: 'Token does not have complete lead information.',
          QUERY_ERROR: 'We could not verify your quote token. Please try again.',
          INSPECTION_CREATE_FAILED: "We couldn't create your inspection. Please contact Breez at (321) 524-3838.",
          INSPECTION_CREATE_FORBIDDEN: "We couldn't create your inspection. Please contact Breez at (321) 524-3838.",
          OUTSIDE_SERVICE_AREA: 'This address is outside our current service area. Please call (321) 524-3838 to verify.',
          TECH_DAILY_CAP_REACHED: 'No availability on this date. Please select another date or call (321) 524-3838.',
          INVALID_TIME_WINDOW: 'Selected time window is not available. Please choose another.',
          VALIDATION_ERROR: 'Please verify your information and try again.'
        };
        const errorMsg = codeMessages[data?.code] || data?.error || 'Failed to schedule inspection. Please call (321) 524-3838.';
        setError(errorMsg);
      }
    } catch (e) {
      setError(e?.message || 'Something went wrong. Please call us at (321) 524-3838.');
    } finally {
      setLoading(false);
    }
  };

  if (confirmed) {
    const slotLabels = { morning: '8:00 AM – 11:00 AM', midday: '11:00 AM – 2:00 PM', afternoon: '2:00 PM – 5:00 PM' };
    // Parse YYYY-MM-DD deterministically using UTC to avoid timezone shifts
    const [year, month, day] = confirmed.scheduledDate.split('-').map(Number);
    const dateObj = new Date(Date.UTC(year, month - 1, day));
    const formattedDate = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).format(dateObj);
    return (
      <div className="space-y-5 text-center">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-full" style={{ backgroundColor: '#e8f8f9' }}>
          <CheckCircle2 className="w-7 h-7" style={{ color: TEAL }} />
        </div>
        <div>
          <h2 className="text-xl font-bold text-gray-900">Inspection Confirmed!</h2>
          <p className="text-gray-500 text-sm mt-1">A confirmation has been sent to {clientEmail}.</p>
        </div>
        {confirmed?.degradedMode === true && (
          <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-left">
            <p className="text-xs text-amber-700">Scheduling confirmed; internal sync pending.</p>
          </div>
        )}
        <div className="rounded-2xl border-2 p-5 text-left space-y-3" style={{ borderColor: TEAL, backgroundColor: '#f0fdfd' }}>
          <div className="flex items-center gap-3">
            <Calendar className="w-5 h-5 shrink-0" style={{ color: TEAL }} />
            <div>
              <div className="text-xs text-gray-400 uppercase tracking-wide">Date</div>
              <div className="font-semibold text-gray-900">{formattedDate}</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Clock className="w-5 h-5 shrink-0" style={{ color: TEAL }} />
            <div>
              <div className="text-xs text-gray-400 uppercase tracking-wide">Time Window</div>
              <div className="font-semibold text-gray-900">{slotLabels[selectedSlot] || confirmed.timeWindow}</div>
            </div>
          </div>
        </div>
        <div className="rounded-xl bg-gray-50 p-4 text-left text-sm text-gray-600 space-y-2">
          <p className="font-semibold text-gray-800">What to expect:</p>
          <ul className="space-y-1 list-disc list-inside">
            <li>We'll call approximately one hour before arrival.</li>
            <li>Inspection typically takes 20–30 minutes.</li>
            <li>We'll test water chemistry, inspect equipment, and answer questions.</li>
            <li>No obligation.</li>
          </ul>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-gray-900">Schedule Your Free Inspection</h2>
        <p className="text-sm text-gray-500 mt-0.5">No obligation. Homeowner or caretaker must be present.</p>
      </div>

      {/* Phone & address */}
      <div className="space-y-3">
        <p className="text-sm font-medium text-gray-700">Your Information</p>
        <input
          type="tel"
          placeholder="Phone number"
          value={phone}
          onChange={e => setPhone(e.target.value)}
          className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
        />
      </div>

      {/* Service address */}
      <div className="space-y-3">
        <p className="text-sm font-medium text-gray-700">Service Address</p>
        <input
          type="text"
          placeholder="Street address"
          value={street}
          onChange={e => setStreet(e.target.value)}
          className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
        />
        <div className="grid grid-cols-2 gap-3">
          <input
            type="text"
            placeholder="City"
            value={city}
            onChange={e => setCity(e.target.value)}
            className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
          />
          <input
            type="text"
            placeholder="ZIP"
            value={zip}
            onChange={e => setZip(e.target.value)}
            className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
          />
        </div>
        <input
          type="text"
          placeholder="State"
          value={state}
          onChange={e => setState(e.target.value)}
          className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
        />
      </div>

      {/* Date picker */}
      <div>
        <p className="text-sm font-medium text-gray-700 mb-2">Select a date</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {dates.map((d) => {
            const iso = toISODate(d);
            const isSelected = selectedDate && toISODate(selectedDate) === iso;
            return (
              <button
                key={iso}
                onClick={() => setSelectedDate(d)}
                className={`py-3 px-4 rounded-xl border-2 text-sm font-medium transition-all ${isSelected ? 'shadow-sm' : 'border-gray-200 hover:border-gray-300'}`}
                style={isSelected ? { borderColor: TEAL, backgroundColor: '#f0fdfd', color: TEAL } : {}}
              >
                {formatDate(d)}
              </button>
            );
          })}
        </div>
      </div>

      {/* Time slot */}
      <div>
        <p className="text-sm font-medium text-gray-700 mb-2">Select a time window</p>
        <div className="space-y-2">
          {TIME_SLOTS.map((slot) => {
            const isSelected = selectedSlot === slot.value;
            return (
              <button
                key={slot.value}
                onClick={() => setSelectedSlot(slot.value)}
                className={`w-full text-left px-5 py-4 rounded-xl border-2 transition-all ${isSelected ? 'shadow-sm' : 'border-gray-200 hover:border-gray-300'}`}
                style={isSelected ? { borderColor: TEAL, backgroundColor: '#f0fdfd' } : {}}
              >
                <div className="font-semibold text-gray-900">{slot.label}</div>
                <div className="text-sm text-gray-500">{slot.sub}</div>
              </button>
            );
          })}
        </div>
      </div>

      {error && <p className="text-red-500 text-sm">{error}</p>}

      <button
        onClick={handleSubmit}
        disabled={loading || !selectedDate || !selectedSlot}
        className="w-full flex items-center justify-center gap-2 py-4 rounded-xl text-white text-base font-semibold shadow-md hover:shadow-lg transition-all disabled:opacity-50"
        style={{ backgroundColor: TEAL }}
      >
        {loading ? <><Loader2 className="w-5 h-5 animate-spin" /> Scheduling...</> : 'Confirm Inspection'}
      </button>

      <p className="text-xs text-center text-gray-400">
        Need to change plans? Call (321) 524-3838 · Mon–Sat 8am–6pm
      </p>
    </div>
  );
}