import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Loader2, CheckCircle2, Calendar, Clock, AlertCircle } from 'lucide-react';

const TEAL = '#1B9B9F';

function getAvailableDates() {
  const dates = [];
  const d = new Date();
  d.setDate(d.getDate() + 1);
  while (dates.length < 14) {
    const day = d.getDay();
    if (day !== 0) {
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
  if (!d || !(d instanceof Date) || !Number.isFinite(d.getTime())) return null;
  return d.toISOString().split('T')[0];
}

export default function ScheduleInspection() {
  const navigate = useNavigate();
  const urlParams = new URLSearchParams(window.location.search);
  const token = urlParams.get('token');

  const [leadData, setLeadData] = useState(null);
  const [loadingLead, setLoadingLead] = useState(true);
  const [tokenError, setTokenError] = useState('');

  const [firstName, setFirstName] = useState('');
  const [phone, setPhone] = useState('');
  const [street, setStreet] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('FL');
  const [zip, setZip] = useState('');

  const [selectedDate, setSelectedDate] = useState(null);
   const [selectedSlot, setSelectedSlot] = useState(null);
   const [loading, setLoading] = useState(false);
   const [error, setError] = useState('');
   const [confirmed, setConfirmed] = useState(null);
   const [emailStatus, setEmailStatus] = useState(null);
   const [unavailableSlots, setUnavailableSlots] = useState({});

   const dates = getAvailableDates();

   // Check drive time conflicts when date changes
   useEffect(() => {
     if (!selectedDate) return;
     (async () => {
       try {
         const isoDate = toISODate(selectedDate);
         const events = await base44.entities.CalendarEvent.filter(
           { scheduledDate: isoDate, status: { $ne: 'cancelled' } },
           'startTime',
           100
         );

         const START_TIMES = { morning: 9, midday: 12, afternoon: 14 };
         const BUFFER = 30;
         const INSPECTION_DURATION = 30;
         const conflictingSlots = {};

         for (const slot of TIME_SLOTS) {
           const reqMinutes = START_TIMES[slot.value] * 60;
           let hasConflict = false;

           for (const evt of events || []) {
             if (!evt.startTime) continue;
             const [h, m] = evt.startTime.split(':').map(Number);
             const evtMinutes = h * 60 + m;
             const evtDuration = evt.estimatedDuration || 45;
             if (reqMinutes >= evtMinutes - BUFFER && reqMinutes <= evtMinutes + evtDuration + BUFFER) {
               hasConflict = true;
               break;
             }
           }
           if (hasConflict) conflictingSlots[slot.value] = true;
         }
         setUnavailableSlots(conflictingSlots);
       } catch (e) {
         console.warn('Failed to check slot availability:', e?.message);
       }
     })();
   }, [selectedDate]);

  useEffect(() => {
    if (!token) {
      setTokenError('No scheduling token provided. Please use the link from your quote email.');
      setLoadingLead(false);
      return;
    }
    (async () => {
      try {
        const res = await base44.functions.invoke('resolveQuoteTokenPublicV1', { token });
        const data = res?.data ?? res;
        if (data?.success && data?.leadId) {
          setLeadData(data);
          if (data.firstName) setFirstName(data.firstName);
          if (data.phone) setPhone(data.phone);
        } else {
          const codeMessages = {
            TOKEN_NOT_FOUND: 'This scheduling link is invalid or has expired.',
            INCOMPLETE_DATA: 'This link does not have complete information. Please contact Breez at (321) 524-3838.',
            LEAD_LOOKUP_FAILED: 'We could not verify your information. Please try again or call (321) 524-3838.',
          };
          setTokenError(codeMessages[data?.code] || data?.error || 'Unable to load your information. Please call (321) 524-3838.');
        }
      } catch (e) {
        setTokenError('Unable to load your information. Please call (321) 524-3838.');
      } finally {
        setLoadingLead(false);
      }
    })();
  }, [token]);

  const handleSubmit = async () => {
    if (!firstName.trim()) { setError('Please enter your first name.'); return; }
    if (!phone.trim()) { setError('Please enter your phone number.'); return; }
    if (!street.trim() || !city.trim() || !zip.trim()) { setError('Please complete your service address.'); return; }
    if (!selectedDate) { setError('Please select a date.'); return; }
    if (!selectedSlot) { setError('Please select a time window.'); return; }

    const isoDate = toISODate(selectedDate);
    if (!isoDate) { setError('Invalid date selected. Please try again.'); return; }

    setError('');
    setLoading(true);

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Request timed out')), 25000)
    );

    try {
      const schedulePayload = {
        token,
        firstName: firstName.trim(),
        phone: phone.trim(),
        email: leadData?.email,
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
      try {
        const res = await Promise.race([
          base44.functions.invoke('scheduleFirstInspectionPublicV2', schedulePayload),
          timeoutPromise
        ]);
        data = res?.data ?? res;
      } catch (v2Err) {
        const msg = String(v2Err?.message || v2Err || '');
        const shouldFallback = msg.includes('timed out') || msg.includes('Deployment does not exist') || msg.includes('FUNCTION_NOT_FOUND');
        if (!shouldFallback) throw v2Err;
      }

      // Fallback to V1 if V2 unavailable/timed out or V2 is blocked by platform create permissions
      const v2Unavailable = !data || (data?.success !== true && (String(data?.error || '').includes('Deployment does not exist') || data?.code === 'FUNCTION_NOT_FOUND'));
      const v2CreateBlocked = data?.success !== true && ['INSPECTION_CREATE_FAILED', 'INSPECTION_CREATE_FORBIDDEN'].includes(data?.code);
      if (v2Unavailable || v2CreateBlocked) {
        const v1Res = await Promise.race([
          base44.functions.invoke('scheduleFirstInspectionPublicV1', schedulePayload),
          timeoutPromise
        ]);
        data = v1Res?.data ?? v1Res;
      }

      if (data?.success === true) {
        setConfirmed(data);
        setEmailStatus(data.emailStatus === 'failed' ? 'failed' : 'sent');
      } else {
        const codeMessages = {
          TOKEN_NOT_FOUND: 'Invalid or expired token.',
          INCOMPLETE_DATA: 'Token does not have complete lead information.',
          QUERY_ERROR: 'We could not verify your quote token. Please try again.',
          INSPECTION_CREATE_FAILED: "We couldn't create your inspection. Please contact Breez at (321) 524-3838.",
          INSPECTION_CREATE_FORBIDDEN: "We couldn't create your inspection. Please contact Breez at (321) 524-3838."
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

  // Loading state
  if (loadingLead) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col">
        <header className="bg-white border-b border-gray-100 px-4 py-3 flex items-center justify-between">
          <img
            src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/699a2b2056054b0207cea969/0b0c31666_Breez2.png"
            alt="Breez Pool Care"
            className="h-10 w-auto cursor-pointer"
            onClick={() => navigate('/')}
          />
          <a href="tel:3215243838" className="text-sm text-gray-500 hover:text-gray-700">(321) 524-3838</a>
        </header>
        <div className="flex-1 flex items-center justify-center px-4">
          <div className="flex flex-col items-center gap-3 text-gray-500">
            <Loader2 className="w-8 h-8 animate-spin text-teal-600" />
            <p className="text-sm">Loading your scheduling link…</p>
          </div>
        </div>
      </div>
    );
  }

  // Token error state
  if (tokenError) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col">
        <header className="bg-white border-b border-gray-100 px-4 py-3 flex items-center justify-between">
          <img
            src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/699a2b2056054b0207cea969/0b0c31666_Breez2.png"
            alt="Breez Pool Care"
            className="h-10 w-auto cursor-pointer"
            onClick={() => navigate('/')}
          />
          <a href="tel:3215243838" className="text-sm text-gray-500 hover:text-gray-700">(321) 524-3838</a>
        </header>
        <div className="flex-1 flex items-center justify-center px-4">
          <div className="max-w-md w-full bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center space-y-4">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-red-50">
              <AlertCircle className="w-7 h-7 text-red-500" />
            </div>
            <h2 className="text-xl font-bold text-gray-900">Link Unavailable</h2>
            <p className="text-gray-600 text-sm">{tokenError}</p>
            <a
              href="tel:3215243838"
              className="inline-block mt-2 px-6 py-3 rounded-xl text-white font-semibold text-sm"
              style={{ backgroundColor: TEAL }}
            >
              Call (321) 524-3838
            </a>
          </div>
        </div>
      </div>
    );
  }

  // Confirmed state
  if (confirmed) {
    const [year, month, day] = confirmed.scheduledDate.split('-').map(Number);
    const dateObj = new Date(Date.UTC(year, month - 1, day));
    const formattedDate = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).format(dateObj);
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col">
        <header className="bg-white border-b border-gray-100 px-4 py-3 flex items-center justify-between">
          <img
            src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/699a2b2056054b0207cea969/0b0c31666_Breez2.png"
            alt="Breez Pool Care"
            className="h-10 w-auto cursor-pointer"
            onClick={() => navigate('/')}
          />
          <a href="tel:3215243838" className="text-sm text-gray-500 hover:text-gray-700">(321) 524-3838</a>
        </header>
        <div className="flex-1 flex items-center justify-center px-4 py-10">
          <div className="max-w-md w-full bg-white rounded-2xl shadow-sm border border-gray-100 p-8 space-y-5 text-center">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-full" style={{ backgroundColor: '#e8f8f9' }}>
              <CheckCircle2 className="w-7 h-7" style={{ color: TEAL }} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">Inspection Confirmed!</h2>
              {emailStatus !== 'failed' && leadData?.email && (
                <p className="text-gray-500 text-sm mt-1">A confirmation has been sent to {leadData.email}.</p>
              )}
            </div>
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
                  <div className="font-semibold text-gray-900">{confirmed.timeWindow}</div>
                </div>
              </div>
            </div>
            <div className="rounded-xl bg-gray-50 p-4 text-left text-sm text-gray-600 space-y-2">
              <p className="font-semibold text-gray-800">What to expect:</p>
              <ul className="space-y-1 list-disc list-inside">
                <li>We'll call approximately one hour before arrival.</li>
                <li>Inspection typically takes 20–30 minutes.</li>
                <li>We'll test water chemistry, inspect equipment, and answer questions.</li>
                <li>No obligation — this visit is completely free.</li>
              </ul>
            </div>
            <p className="text-xs text-gray-400">Questions? Call (321) 524-3838 · Mon–Sat 8am–6pm</p>
          </div>
        </div>
      </div>
    );
  }

  // Main scheduling form
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white border-b border-gray-100 px-4 py-3 flex items-center justify-between">
        <img
          src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/699a2b2056054b0207cea969/0b0c31666_Breez2.png"
          alt="Breez Pool Care"
          className="h-10 w-auto cursor-pointer"
          onClick={() => navigate('/')}
        />
        <a href="tel:3215243838" className="text-sm text-gray-500 hover:text-gray-700">(321) 524-3838</a>
      </header>

      <div className="flex-1 flex items-start justify-center px-4 py-8">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Schedule Your Free Inspection</h1>
            <p className="text-sm text-gray-500 mt-1">No obligation. Homeowner or caretaker must be present.</p>
          </div>

          {/* Contact info */}
          <div className="space-y-3">
            <p className="text-sm font-semibold text-gray-700">Your Information</p>
            <input
              type="text"
              placeholder="First name"
              value={firstName}
              onChange={e => setFirstName(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
            />
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
            <p className="text-sm font-semibold text-gray-700">Service Address</p>
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
            <p className="text-sm font-semibold text-gray-700 mb-2">Select a date</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {dates.map((d) => {
                const iso = toISODate(d);
                const isSelected = selectedDate && toISODate(selectedDate) === iso;
                return (
                  <button
                    key={iso}
                    onClick={() => setSelectedDate(d)}
                    className={`py-3 px-3 rounded-xl border-2 text-sm font-medium transition-all ${isSelected ? 'shadow-sm' : 'border-gray-200 hover:border-gray-300'}`}
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
            <p className="text-sm font-semibold text-gray-700 mb-2">Select a time window</p>
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

          {error && (
            <div className="flex items-start gap-2 text-red-600 text-sm bg-red-50 rounded-xl px-4 py-3">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <button
            onClick={handleSubmit}
            disabled={loading || !selectedDate || !selectedSlot}
            className="w-full flex items-center justify-center gap-2 py-4 rounded-xl text-white text-base font-semibold shadow-md hover:shadow-lg transition-all disabled:opacity-50"
            style={{ backgroundColor: TEAL }}
          >
            {loading ? <><Loader2 className="w-5 h-5 animate-spin" /> Scheduling…</> : 'Confirm Inspection'}
          </button>

          <p className="text-xs text-center text-gray-400">
            Need to change plans? Call (321) 524-3838 · Mon–Sat 8am–6pm
          </p>
        </div>
      </div>
    </div>
  );
}