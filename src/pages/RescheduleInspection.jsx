import React, { useState, useEffect } from 'react';
import { Calendar, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';

const TEAL = '#1B9B9F';

export default function RescheduleInspection() {
  const [state, setState] = useState('loading'); // loading, form, success, error
  const [lead, setLead] = useState(null);
  const [event, setEvent] = useState(null);
  const [error, setError] = useState(null);
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedTime, setSelectedTime] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [requestId, setRequestId] = useState(null);
  const token = new URLSearchParams(window.location.search).get('token');

  // Load lead + event on mount
  useEffect(() => {
    const loadData = async () => {
      if (!token) {
        setError('Token is required');
        setState('error');
        return;
      }

      try {
        // Resolve token to leadId + fetch lead
        const resolveRes = await base44.functions.invoke('resolveQuoteTokenPublicV1', { token });
        if (!resolveRes.data?.success) {
          setError(resolveRes.data?.error || 'Invalid token');
          setState('error');
          return;
        }

        const { leadId, firstName } = resolveRes.data;
        if (!leadId) {
          setError('Lead information not found');
          setState('error');
          return;
        }

        // Load Lead details (public, no auth required via public function)
        // For now, we'll call the public resolver which should give us minimal info
        const leadInfo = resolveRes.data;
        setLead(leadInfo);

        // Try to load CalendarEvent via leadId (this is admin-only in real app)
        // For public, we'd need a public function to fetch the event
        // For MVP, assume event data comes from the resolve call or we show generic form

        setState('form');
      } catch (err) {
        console.error('Load error:', err);
        setError(err.message || 'Failed to load appointment details');
        setState('error');
      }
    };

    loadData();
  }, [token]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedDate || !selectedTime) {
      setError('Please select a date and time');
      return;
    }

    setSubmitting(true);
    try {
      const requestedStart = new Date(`${selectedDate}T${selectedTime}`).toISOString();

      const res = await base44.functions.invoke('requestReschedulePublicV1', {
        token,
        requestedStart,
        note: note || null
      });

      if (!res.data?.success) {
        const code = res.data?.code;
        if (code === 'LEAD_DELETED') {
          setError('This account has been closed. You cannot request reschedules at this time.');
        } else if (code === 'NO_APPOINTMENT') {
          setError('No scheduled appointment found to reschedule.');
        } else {
          setError(res.data?.error || 'Failed to submit reschedule request');
        }
        setState('error');
        return;
      }

      setRequestId(res.data.requestId);
      setState('success');
    } catch (err) {
      console.error('Submit error:', err);
      setError(err.message || 'Failed to submit request');
      setState('error');
    } finally {
      setSubmitting(false);
    }
  };

  // ============ Loading ============
  if (state === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4" style={{ color: TEAL }} />
          <p className="text-gray-600">Loading appointment details...</p>
        </div>
      </div>
    );
  }

  // ============ Error ============
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
            <div className="flex gap-3">
              <Button
                onClick={() => window.history.back()}
                variant="outline"
                className="flex-1"
              >
                Go Back
              </Button>
              <Button
                onClick={() => window.location.href = '/'}
                className="flex-1 bg-red-600 hover:bg-red-700"
              >
                Home
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ============ Success ============
  if (state === 'success') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              <div className="rounded-full bg-green-100 p-3">
                <CheckCircle2 className="w-8 h-8 text-green-600" />
              </div>
            </div>
            <CardTitle className="text-green-900">Request Submitted</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-center">
            <p className="text-gray-700">
              Your reschedule request has been submitted successfully.
            </p>
            <div className="bg-gray-50 p-4 rounded-lg">
              <p className="text-sm text-gray-600 mb-1">Request ID</p>
              <p className="font-mono text-sm text-gray-900">{requestId}</p>
            </div>
            <p className="text-sm text-gray-600">
              Our team will review your request and contact you within 24 hours to confirm your new appointment time.
            </p>
            <Button
              onClick={() => window.location.href = '/'}
              className="w-full"
              style={{ backgroundColor: TEAL }}
            >
              Back to Home
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ============ Form ============
  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-2xl mx-auto">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <Calendar className="w-6 h-6" style={{ color: TEAL }} />
              <CardTitle>Reschedule Your Inspection</CardTitle>
            </div>
          </CardHeader>

          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Current appointment summary */}
              {lead && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <p className="text-sm font-semibold text-blue-900 mb-2">Current Appointment</p>
                  <p className="text-sm text-blue-800">
                    We have you scheduled for a free pool inspection. 
                  </p>
                </div>
              )}

              {/* Date selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Preferred New Date
                </label>
                <Input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  min={format(new Date(), 'yyyy-MM-dd')}
                  className="w-full"
                  required
                />
                <p className="text-xs text-gray-500 mt-1">Select a date at least 2 days from today</p>
              </div>

              {/* Time selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Preferred Time
                </label>
                <Input
                  type="time"
                  value={selectedTime}
                  onChange={(e) => setSelectedTime(e.target.value)}
                  className="w-full"
                  required
                />
                <p className="text-xs text-gray-500 mt-1">Times between 8 AM and 5 PM</p>
              </div>

              {/* Optional note */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Reason for Reschedule (Optional)
                </label>
                <Textarea
                  placeholder="Tell us why you need to reschedule..."
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  className="w-full h-24"
                />
              </div>

              {/* Disclaimer */}
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                <p className="text-xs text-gray-600">
                  Your reschedule request will be reviewed by our team. We'll contact you within 24 hours to confirm your new appointment time.
                </p>
              </div>

              {/* Submit button */}
              <div className="flex gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => window.history.back()}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={submitting}
                  className="flex-1"
                  style={{ backgroundColor: TEAL }}
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Submitting...
                    </>
                  ) : (
                    'Submit Request'
                  )}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}