import React, { useState, useEffect } from 'react';
import { Calendar, AlertCircle, CheckCircle2, Loader2, Clock } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { format, addDays } from 'date-fns';

const TEAL = '#1B9B9F';

const TIME_SLOTS = [
  { value: 'morning',   label: 'Morning',   sub: '8:00 AM – 11:00 AM' },
  { value: 'midday',    label: 'Midday',    sub: '11:00 AM – 2:00 PM' },
  { value: 'afternoon', label: 'Afternoon', sub: '2:00 PM – 5:00 PM' },
];

export default function RescheduleInspection() {
  const [state, setState] = useState('loading');
  const [lead, setLead] = useState(null);
  const [currentDate, setCurrentDate] = useState(null);
  const [currentTimeWindow, setCurrentTimeWindow] = useState(null);
  const [error, setError] = useState(null);
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedTimeSlot, setSelectedTimeSlot] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [newTimeWindow, setNewTimeWindow] = useState('');
  const [newDate, setNewDate] = useState('');

  const token = new URLSearchParams(window.location.search).get('token');

  useEffect(() => {
    if (!token) {
      setError('No scheduling token found. Please use the link from your confirmation email.');
      setState('error');
      return;
    }

    (async () => {
      try {
        const res = await base44.functions.invoke('resolveQuoteTokenPublicV1', { token });
        if (!res.data?.success) {
          setError(res.data?.error || 'Invalid or expired link.');
          setState('error');
          return;
        }

        const { leadId } = res.data;
        if (!leadId) {
          setError('Could not find your appointment details.');
          setState('error');
          return;
        }

        // Load current inspection details
        try {
          const inspRes = await base44.functions.invoke('getPublicInspectionDetails', { leadId, token });
          if (inspRes.data?.scheduledDate) {
            setCurrentDate(inspRes.data.scheduledDate);
            setCurrentTimeWindow(inspRes.data.timeWindow);
          }
        } catch (e) {
          // Non-fatal — still show the form
        }

        setLead(res.data);
        setState('form');
      } catch (err) {
        setError('Failed to load appointment details. Please try again or call (321) 524-3838.');
        setState('error');
      }
    })();
  }, [token]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedDate || !selectedTimeSlot) {
      setError('Please select a date and time slot.');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const res = await base44.functions.invoke('requestReschedulePublicV2', {
        token,
        requestedDate: selectedDate,
        requestedTimeSlot: selectedTimeSlot,
        note: note || null
      });

      if (!res.data?.success) {
        const code = res.data?.code;
        if (code === 'NO_APPOINTMENT') setError('No scheduled inspection found to reschedule.');
        else if (code === 'LEAD_NOT_FOUND') setError('Account not found.');
        else setError(res.data?.error || 'Failed to reschedule. Please call (321) 524-3838.');
        return;
      }

      const slotLabel = TIME_SLOTS.find(s => s.value === selectedTimeSlot)?.sub || '';
      setNewDate(selectedDate);
      setNewTimeWindow(res.data.timeWindow || slotLabel);
      setState('success');
    } catch (err) {
      setError('Something went wrong. Please call us at (321) 524-3838.');
    } finally {
      setSubmitting(false);
    }
  };

  const minDate = format(addDays(new Date(), 2), 'yyyy-MM-dd');

  if (state === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4" style={{ color: TEAL }} />
          <p className="text-gray-600">Loading your appointment...</p>
        </div>
      </div>
    );
  }

  if (state === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <Card className="w-full max-w-md border-red-200 bg-red-50">
          <CardHeader>
            <div className="flex items-center gap-3">
              <AlertCircle className="w-6 h-6 text-red-600" />
              <CardTitle className="text-red-900">Unable to Process</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-red-700">{error}</p>
            <p className="text-sm text-gray-600">Need help? Call or text us at <strong>(321) 524-3838</strong>.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (state === 'success') {
    const dateFormatted = newDate
      ? new Date(newDate + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
      : newDate;
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              <div className="rounded-full bg-green-100 p-3">
                <CheckCircle2 className="w-8 h-8 text-green-600" />
              </div>
            </div>
            <CardTitle className="text-green-900">Inspection Rescheduled!</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-center">
            <div style={{ backgroundColor: '#e8f8f9', border: `2px solid ${TEAL}` }} className="rounded-lg p-5">
              <p className="text-xs uppercase tracking-wide font-semibold mb-1" style={{ color: TEAL }}>New Appointment</p>
              <p className="text-lg font-bold text-gray-900">{dateFormatted}</p>
              <p className="text-base text-gray-700 mt-1">{newTimeWindow}</p>
            </div>
            <p className="text-sm text-gray-600">
              Your calendar has been updated. We'll call about 1 hour before arrival. Questions? Call <strong>(321) 524-3838</strong>.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-lg mx-auto">
        {/* Header */}
        <div className="text-center mb-6">
          <img
            src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/699a2b2056054b0207cea969/0b0c31666_Breez2.png"
            alt="Breez Pool Care"
            className="h-10 mx-auto mb-3"
          />
          <h1 className="text-xl font-bold text-gray-900">Reschedule Your Inspection</h1>
          <p className="text-sm text-gray-500 mt-1">Choose a new date and arrival window</p>
        </div>

        <Card>
          <CardContent className="pt-6">
            {/* Current appointment */}
            {currentDate && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
                <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide mb-1">Current Appointment</p>
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-blue-600" />
                  <p className="text-sm text-blue-900 font-medium">
                    {new Date(currentDate + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                    {currentTimeWindow ? ` · ${currentTimeWindow}` : ''}
                  </p>
                </div>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Date */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">New Date</label>
                <Input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  min={minDate}
                  className="w-full"
                  required
                />
                <p className="text-xs text-gray-500 mt-1">Must be at least 2 days from today</p>
              </div>

              {/* Time slot */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Arrival Window</label>
                <div className="grid grid-cols-3 gap-2">
                  {TIME_SLOTS.map(slot => (
                    <button
                      key={slot.value}
                      type="button"
                      onClick={() => setSelectedTimeSlot(slot.value)}
                      className={`rounded-lg border-2 p-3 text-center transition-all ${
                        selectedTimeSlot === slot.value
                          ? 'border-teal-500 bg-teal-50 text-teal-800'
                          : 'border-gray-200 hover:border-gray-300 text-gray-700'
                      }`}
                    >
                      <p className="text-sm font-semibold">{slot.label}</p>
                      <p className="text-xs mt-0.5 text-gray-500">{slot.sub}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Note */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Reason (Optional)</label>
                <Textarea
                  placeholder="e.g. conflict with work, family obligation..."
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  className="w-full h-20 text-sm"
                />
              </div>

              {error && (
                <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              <Button
                type="submit"
                disabled={submitting || !selectedDate || !selectedTimeSlot}
                className="w-full text-white font-semibold"
                style={{ backgroundColor: TEAL }}
              >
                {submitting ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Rescheduling...</>
                ) : 'Confirm New Appointment'}
              </Button>

              <p className="text-center text-xs text-gray-500">
                Need help? Call or text <strong>(321) 524-3838</strong>
              </p>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}