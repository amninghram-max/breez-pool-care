import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { base44 } from '@/api/base44Client';
import { CheckCircle2, Loader2, Calendar, Home } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export default function PaymentSuccess() {
  const navigate = useNavigate();
  const [processing, setProcessing] = useState(true);
  const [error, setError] = useState(null);
  const [firstServiceDate, setFirstServiceDate] = useState(null);

  useEffect(() => {
    const handleSuccess = async () => {
      const urlParams = new URLSearchParams(window.location.search);
      const sessionId = urlParams.get('session_id');

      if (!sessionId) {
        setError('No session ID found');
        setProcessing(false);
        return;
      }

      try {
        // Process activation
        const response = await base44.functions.invoke('handleActivationPayment', {
          sessionId
        });

        if (response.data.error) {
          setError(response.data.error);
        }

        setProcessing(false);
      } catch (err) {
        setError(err.message || 'Failed to process activation');
        setProcessing(false);
      }
    };

    handleSuccess();
  }, []);

  if (processing) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen">
        <Loader2 className="w-16 h-16 text-teal-600 animate-spin mb-4" />
        <p className="text-lg text-gray-600">Activating your service...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-2xl mx-auto py-12 px-4">
        <Card className="border-red-200">
          <CardContent className="pt-6 text-center">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="w-8 h-8 text-red-600" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">
              Activation Error
            </h2>
            <p className="text-gray-600 mb-6">{error}</p>
            <Button onClick={() => navigate(createPageUrl('PaymentSetup'))}>
              Try Again
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto py-12 px-4">
      <Card className="border-teal-200 bg-teal-50/30">
        <CardContent className="pt-8 text-center">
          <div className="w-20 h-20 bg-teal-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 className="w-12 h-12 text-teal-600" />
          </div>
          
          <h1 className="text-3xl font-bold text-gray-900 mb-3">
            Welcome to Breez! 🎉
          </h1>
          
          <p className="text-lg text-gray-700 mb-6">
            Your service is now active and we're scheduling your first visit.
          </p>

          <div className="bg-white rounded-lg p-6 mb-6 text-left space-y-4">
            <h3 className="font-semibold text-lg mb-3">What happens next:</h3>
            
            <div className="flex items-start gap-3">
              <Calendar className="w-5 h-5 text-teal-600 mt-1" />
              <div>
                <p className="font-medium">We're scheduling your first service</p>
                <p className="text-sm text-gray-600">
                  You'll receive an email with your appointment details within 24 hours.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-teal-600 mt-1" />
              <div>
                <p className="font-medium">Prepare your pool area</p>
                <p className="text-sm text-gray-600">
                  Make sure our technician can access your pool and equipment.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <Home className="w-5 h-5 text-teal-600 mt-1" />
              <div>
                <p className="font-medium">Track everything in your dashboard</p>
                <p className="text-sm text-gray-600">
                  View upcoming services, billing, and contact support anytime.
                </p>
              </div>
            </div>
          </div>

          <Button
            onClick={() => navigate(createPageUrl('ClientHome'))}
            className="w-full h-12 text-lg bg-teal-600 hover:bg-teal-700"
          >
            Go to Dashboard
          </Button>

          <p className="text-sm text-gray-600 mt-6">
            Questions? Call us at (321) 524-3838
          </p>
        </CardContent>
      </Card>
    </div>
  );
}