import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { createPageUrl } from '@/utils';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import PublicScheduler from '../components/quote/PublicScheduler';

export default function ScheduleInspection() {
  const [token, setToken] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState('');

  // Extract token from URL
  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const t = searchParams.get('token');
    if (!t) {
      setToken(null);
    } else {
      setToken(t);
    }
  }, []);

  // Validate token
  const {
    data: validationResult,
    isLoading: validating,
    error: validationError
  } = useQuery({
    queryKey: ['scheduleToken', token],
    queryFn: async () => {
      if (!token) return null;
      const response = await base44.functions.invoke('validateScheduleToken', {
        scheduleToken: token
      });
      return response.data;
    },
    enabled: !!token,
    retry: false
  });

  // Handle scheduling submission
  const handleScheduleSubmit = async (selectedDate, selectedTimeWindow) => {
    setSubmitError('');
    try {
      const response = await base44.functions.invoke('scheduleInspectionByToken', {
        scheduleToken: token,
        requestedDate: selectedDate,
        requestedTimeSlot: selectedTimeWindow
      });

      if (response.data?.success) {
        setSubmitted(true);
      } else {
        setSubmitError(response.data?.error || 'Failed to schedule inspection');
      }
    } catch (error) {
      setSubmitError(error.message || 'An error occurred while scheduling');
    }
  };

  // Error state: no token provided
  if (token === null) {
    return (
      <div className="min-h-screen bg-gray-50 p-6 flex items-center justify-center">
        <Card className="border-red-200 bg-red-50 max-w-md">
          <CardHeader>
            <CardTitle className="text-red-900 flex items-center gap-2">
              <AlertCircle className="w-5 h-5" />
              Invalid Link
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-red-700">
              This scheduling link is missing the required token. Please check the link in your email and try again.
            </p>
            <Button
              onClick={() => window.location.href = createPageUrl('PublicHome')}
              className="w-full bg-blue-600 hover:bg-blue-700"
            >
              Go Back Home
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Loading state
  if (validating) {
    return (
      <div className="min-h-screen bg-gray-50 p-6 flex items-center justify-center">
        <Card className="max-w-md">
          <CardContent className="pt-6">
            <div className="text-center space-y-4">
              <div className="animate-spin w-8 h-8 border-4 border-gray-300 border-t-blue-600 rounded-full mx-auto" />
              <p className="text-gray-600">Loading scheduling options...</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Error state: token invalid/expired
  if (validationError || (validationResult && !validationResult.success)) {
    const errorMsg = validationError?.message || validationResult?.error || 'Invalid or expired scheduling link';
    return (
      <div className="min-h-screen bg-gray-50 p-6 flex items-center justify-center">
        <Card className="border-red-200 bg-red-50 max-w-md">
          <CardHeader>
            <CardTitle className="text-red-900 flex items-center gap-2">
              <AlertCircle className="w-5 h-5" />
              Link Expired or Invalid
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-red-700">
              {errorMsg}
            </p>
            <p className="text-sm text-gray-600">
              Please request a new quote to get a fresh scheduling link.
            </p>
            <Button
              onClick={() => window.location.href = createPageUrl('PublicHome')}
              className="w-full bg-blue-600 hover:bg-blue-700"
            >
              Go Back Home
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Success state: inspection scheduled
  if (submitted) {
    return (
      <div className="min-h-screen bg-gray-50 p-6 flex items-center justify-center">
        <Card className="border-green-200 bg-green-50 max-w-md">
          <CardHeader>
            <CardTitle className="text-green-900 flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5" />
              Inspection Scheduled!
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-green-700">
              Your free pool inspection has been scheduled. We'll send you a confirmation email with the details shortly.
            </p>
            <div className="bg-white rounded p-3 text-sm text-gray-600">
              <p className="font-semibold text-gray-900 mb-1">What's next:</p>
              <ul className="space-y-1 ml-4 list-disc text-xs">
                <li>Check your email for confirmation</li>
                <li>Our inspector will assess your pool</li>
                <li>Receive a customized service plan</li>
              </ul>
            </div>
            <Button
              onClick={() => window.location.href = createPageUrl('PublicHome')}
              className="w-full bg-blue-600 hover:bg-blue-700"
            >
              Return Home
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Main state: render scheduler
  if (validationResult?.success && validationResult.quote) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Schedule Your Free Inspection</h1>
            <p className="text-gray-600">
              Hi {validationResult.quote.clientFirstName || 'there'}! Let's find a time that works for you.
            </p>
          </div>

          {submitError && (
            <Card className="border-red-200 bg-red-50 mb-6">
              <CardContent className="pt-6">
                <div className="flex gap-3">
                  <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-red-700">{submitError}</p>
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardContent className="pt-6">
              <PublicScheduler
                onSuccess={handleScheduleSubmit}
                clientFirstName={validationResult.quote.clientFirstName}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return null;
}