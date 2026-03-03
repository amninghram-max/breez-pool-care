import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { ChevronLeft, Loader2, CheckCircle2, AlertCircle, Calendar, Clock } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

const TEAL = '#1B9B9F';

// Generate next 14 available days (Mon–Sat only)
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
  { value: 'morning', label: 'Morning', sub: '8:00 AM – 11:00 AM' },
  { value: 'midday', label: 'Midday', sub: '11:00 AM – 2:00 PM' },
  { value: 'afternoon', label: 'Afternoon', sub: '2:00 PM – 5:00 PM' },
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

export default function ScheduleInspection() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');

  const [leadData, setLeadData] = useState(null);
  const [loadingLead, setLoadingLead] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [firstName, setFirstName] = useState('');
  const [phone, setPhone] = useState('');
  const [street, setStreet] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [zip, setZip] = useState('');
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [confirmed, setConfirmed] = useState(null);
  const [emailStatus, setEmailStatus] = useState('idle'); // idle | sending | sent | failed

  const dates = getAvailableDates();

  // Load lead data from token
  useEffect(() => {
    if (!token) {
      setLoadError('Missing token. Please follow the link from your quote email.');
      setLoadingLead(false);
      return;
    }

    const loadLead = async () => {
      setLoadingLead(true);
      setLoadError('');
      try {
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Request timed out. Please try again.')), 10000)
        );
        
        const res = await Promise.race([
          base44.functions.invoke('resolveQuoteTokenPublicV1', { token }),
          timeoutPromise
        ]);
        
        const data = res?.data ?? res;
        
        if (data?.success === true && data.leadId && data.email) {
          setLeadData({
            leadId: data.leadId,
            email: data.email,
            firstName: data.firstName || null,
            token: token
          });
          // Prefill firstName if available
          if (data.firstName) {
            setFirstName(data.firstName);
          }
        } else {
          const errorMsg = data?.error || data?.code || 'Invalid or expired token';
          setLoadError(errorMsg);
        }
      } catch (err) {
        setLoadError(err?.message || 'Failed to load request details');
      } finally {
        setLoadingLead(false);
      }
    };

    loadLead();
  }, [token]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    // Validation
    if (!firstName.trim()) {
      setError('First name is required.');
      return;
    }
    if (!phone.trim()) {
      setError('Phone number is required.');
      return;
    }
    if (!street.trim() || !city.trim() || !state.trim() || !zip.trim()) {
      setError('Service address (street, city, state, zip) is required.');
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

    setLoading(true);
    setError('');
    try {
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Request timed out. Please try again.')), 15000)
      );

      const res = await Promise.race([
        base44.functions.invoke('scheduleFirstInspectionPublicV1', {
          token: token,
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
        }),
        timeoutPromise
      ]);
      
      const data = res?.data ?? res;

      if (data?.success === true) {
        setConfirmed(data);
        // Best-effort email trigger — does not block success path
        if (leadData?.leadId) {
          setEmailStatus('sending');
          base44.functions.invoke('sendInspectionConfirmation', { leadId: leadData.leadId })
            .then(() => setEmailStatus('sent'))
            .catch(() => setEmailStatus('failed'));
        }
      } else {
        const errorMsg = data?.error || 'Failed to schedule inspection. Please call (321) 524-3838.';
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
            <p className="text-sm">Loading…</p>
          </div>
        </div>
      </div>
    );
  }

  // Error state
  if (loadError) {
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
          <Card className="max-w-md w-full border-red-200">
            <CardContent className="pt-6 flex flex-col gap-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-gray-900">Unable to Load</p>
                  <p className="text-sm text-gray-600 mt-1">{loadError}</p>
                </div>
              </div>
              <Button
                onClick={() => navigate('/')}
                className="w-full bg-teal-600 hover:bg-teal-700 text-white"
              >
                Go Home
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // Confirmation state
  if (confirmed) {
    const slotLabels = { morning: '8:00 AM – 11:00 AM', midday: '11:00 AM – 2:00 PM', afternoon: '2:00 PM – 5:00 PM' };
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
        <div className="flex-1 flex items-start justify-center px-4 py-10">
          <div className="w-full max-w-lg bg-white rounded-2xl shadow-lg p-8">
            <div className="space-y-5 text-center">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-full" style={{ backgroundColor: '#e8f8f9' }}>
                <CheckCircle2 className="w-7 h-7" style={{ color: TEAL }} />
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-900">Inspection Confirmed!</h2>
                <p className="text-gray-500 text-sm mt-1">A confirmation has been sent to {leadData?.email}.</p>
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
                    <div className="font-semibold text-gray-900">{slotLabels[selectedSlot]}</div>
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
              <Button
                onClick={() => navigate('/')}
                className="w-full bg-teal-600 hover:bg-teal-700 text-white"
              >
                Back Home
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Form state
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

      <div className="flex-1 flex items-start justify-center px-4 py-10">
        <div className="w-full max-w-lg bg-white rounded-2xl shadow-lg p-8">
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Schedule Your Free Inspection</h1>
              <p className="text-gray-500 text-sm mt-1">No obligation. Homeowner or caretaker must be present.</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              {/* First name (prefilled from token if available) */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">First Name</label>
                <input
                  type="text"
                  value={firstName}
                  onChange={e => setFirstName(e.target.value)}
                  placeholder="Your first name"
                  disabled={!!leadData?.firstName}
                  className={`w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:outline-none transition-colors text-gray-900 ${leadData?.firstName ? 'bg-gray-50 opacity-75' : ''}`}
                  onFocus={e => !leadData?.firstName && (e.target.style.borderColor = TEAL)}
                  onBlur={e => !leadData?.firstName && (e.target.style.borderColor = '#e5e7eb')}
                />
                {leadData?.firstName && <p className="text-xs text-gray-400 mt-1">From your quote request</p>}
              </div>

              {/* Phone number */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number</label>
                <input
                  type="tel"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  placeholder="(123) 456-7890"
                  className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:outline-none transition-colors text-gray-900"
                  onFocus={e => e.target.style.borderColor = TEAL}
                  onBlur={e => e.target.style.borderColor = '#e5e7eb'}
                />
              </div>

              {/* Service address */}
              <div className="space-y-3">
                <p className="text-sm font-medium text-gray-700">Service Address</p>
                <input
                  type="text"
                  value={street}
                  onChange={e => setStreet(e.target.value)}
                  placeholder="Street address"
                  className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:outline-none transition-colors text-gray-900"
                  onFocus={e => e.target.style.borderColor = TEAL}
                  onBlur={e => e.target.style.borderColor = '#e5e7eb'}
                />
                <div className="grid grid-cols-2 gap-3">
                  <input
                    type="text"
                    value={city}
                    onChange={e => setCity(e.target.value)}
                    placeholder="City"
                    className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:outline-none transition-colors text-gray-900"
                    onFocus={e => e.target.style.borderColor = TEAL}
                    onBlur={e => e.target.style.borderColor = '#e5e7eb'}
                  />
                  <input
                    type="text"
                    value={state}
                    onChange={e => setState(e.target.value.toUpperCase())}
                    placeholder="State"
                    maxLength="2"
                    className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:outline-none transition-colors text-gray-900 text-center"
                    onFocus={e => e.target.style.borderColor = TEAL}
                    onBlur={e => e.target.style.borderColor = '#e5e7eb'}
                  />
                </div>
                <input
                  type="text"
                  value={zip}
                  onChange={e => setZip(e.target.value)}
                  placeholder="ZIP code"
                  className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:outline-none transition-colors text-gray-900"
                  onFocus={e => e.target.style.borderColor = TEAL}
                  onBlur={e => e.target.style.borderColor = '#e5e7eb'}
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
                        type="button"
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
                        type="button"
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

              <Button
                type="submit"
                disabled={loading || !firstName.trim() || !phone.trim() || !street.trim() || !city.trim() || !state.trim() || !zip.trim()}
                className="w-full flex items-center justify-center gap-2 py-4 rounded-xl text-white text-base font-semibold shadow-md hover:shadow-lg transition-all disabled:opacity-50"
                style={{ backgroundColor: TEAL }}
              >
                {loading ? <><Loader2 className="w-5 h-5 animate-spin" /> Scheduling...</> : 'Confirm Inspection'}
              </Button>

              <p className="text-xs text-center text-gray-400">
                Need to change plans? Call (321) 524-3838 · Mon–Sat 8am–6pm
              </p>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}