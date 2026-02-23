import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { CheckCircle2, CreditCard, DollarSign, Zap, AlertCircle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { loadStripe } from '@stripe/stripe-js';

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY);

export default function PaymentSetup() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [autopayEnabled, setAutopayEnabled] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState(null);

  const { data: user } = useQuery({
    queryKey: ['user'],
    queryFn: () => base44.auth.me()
  });

  const { data: lead } = useQuery({
    queryKey: ['myLead', user?.email],
    queryFn: async () => {
      const leads = await base44.entities.Lead.filter({ email: user.email });
      return leads[0] || null;
    },
    enabled: !!user
  });

  const { data: quote } = useQuery({
    queryKey: ['myQuote', lead?.id],
    queryFn: async () => {
      if (!lead?.id) return null;
      const quotes = await base44.entities.PoolQuestionnaire.filter({ 
        clientEmail: lead.email 
      });
      return quotes[0] || null;
    },
    enabled: !!lead
  });

  const handlePayment = async () => {
    try {
      setProcessing(true);
      setError(null);

      // Call backend to create payment session
      const response = await base44.functions.invoke('createActivationPayment', {
        leadId: lead.id,
        autopayEnabled
      });

      if (response.data.error) {
        setError(response.data.error);
        setProcessing(false);
        return;
      }

      // Redirect to Stripe Checkout
      const stripe = await stripePromise;
      const { error: stripeError } = await stripe.redirectToCheckout({
        sessionId: response.data.sessionId
      });

      if (stripeError) {
        setError(stripeError.message);
        setProcessing(false);
      }
    } catch (err) {
      setError(err.message || 'Payment failed. Please try again.');
      setProcessing(false);
    }
  };

  if (!user || !lead || !quote) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-gray-500">Loading...</p>
      </div>
    );
  }

  if (!lead.agreementsAccepted) {
    navigate(createPageUrl('Agreements'));
    return null;
  }

  // Calculate totals
  const monthlyAmount = autopayEnabled 
    ? (quote.estimatedMonthlyPrice || 0) - 10 
    : (quote.estimatedMonthlyPrice || 0);
  
  const oneTimeFees = quote.estimatedOneTimeFees || 0;
  const totalDueToday = monthlyAmount + oneTimeFees;

  const frequency = quote.clientSelectedFrequency || quote.recommendedFrequency || 'weekly';

  return (
    <div className="max-w-3xl mx-auto py-8 px-4">
      {/* Header */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-teal-100 rounded-full mb-4">
          <CheckCircle2 className="w-8 h-8 text-teal-600" />
        </div>
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          Activate Your Service
        </h1>
        <p className="text-lg text-gray-600">
          Review your service details and complete payment to get started
        </p>
      </div>

      {/* Service Summary */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-teal-600" />
            Your Service Plan
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex justify-between items-center pb-3 border-b">
            <span className="text-gray-600">Service Frequency</span>
            <Badge className="bg-teal-100 text-teal-700">
              {frequency.charAt(0).toUpperCase() + frequency.slice(1)} Service
            </Badge>
          </div>
          <div className="flex justify-between items-center pb-3 border-b">
            <span className="text-gray-600">Monthly Service (prepaid)</span>
            <span className="font-semibold">${quote.estimatedMonthlyPrice?.toFixed(2)}</span>
          </div>
          {oneTimeFees > 0 && (
            <div className="flex justify-between items-center pb-3 border-b">
              <div>
                <span className="text-gray-600">One-Time Fees</span>
                {quote.greenRecoveryTier && quote.greenRecoveryTier !== 'none' && (
                  <p className="text-xs text-gray-500">Green-to-clean startup + treatment</p>
                )}
              </div>
              <span className="font-semibold">${oneTimeFees.toFixed(2)}</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* AutoPay Option */}
      <Card className="mb-6 border-2 border-teal-200 bg-teal-50/30">
        <CardContent className="pt-6">
          <div className="flex items-start gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <CreditCard className="w-5 h-5 text-teal-600" />
                <h3 className="font-semibold text-lg">Enable AutoPay & Save $10/month</h3>
              </div>
              <p className="text-sm text-gray-600 mb-3">
                Your payment will be automatically charged each month on the same day. 
                You can cancel anytime from your billing settings.
              </p>
              <ul className="text-sm text-gray-600 space-y-1 mb-4">
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-teal-600" />
                  <span>$10 monthly discount</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-teal-600" />
                  <span>Never miss a payment</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-teal-600" />
                  <span>Hassle-free service continuation</span>
                </li>
              </ul>
            </div>
            <Switch
              checked={autopayEnabled}
              onCheckedChange={setAutopayEnabled}
              className="mt-1"
            />
          </div>
        </CardContent>
      </Card>

      {/* Payment Summary */}
      <Card className="mb-6 bg-gray-50">
        <CardContent className="pt-6">
          <div className="space-y-3">
            <div className="flex justify-between text-lg">
              <span className="font-medium">Monthly Service</span>
              <span>${quote.estimatedMonthlyPrice?.toFixed(2)}</span>
            </div>
            {autopayEnabled && (
              <div className="flex justify-between text-teal-600">
                <span>AutoPay Discount</span>
                <span>-$10.00</span>
              </div>
            )}
            {oneTimeFees > 0 && (
              <div className="flex justify-between">
                <span>One-Time Fees</span>
                <span>${oneTimeFees.toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between text-2xl font-bold pt-3 border-t-2">
              <span>Total Due Today</span>
              <span className="text-teal-600">${totalDueToday.toFixed(2)}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Error Alert */}
      {error && (
        <Alert variant="destructive" className="mb-6">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Payment Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Action Button */}
      <Button
        onClick={handlePayment}
        disabled={processing}
        className="w-full h-14 text-lg bg-teal-600 hover:bg-teal-700"
      >
        {processing ? (
          'Processing...'
        ) : (
          <>
            <DollarSign className="w-5 h-5 mr-2" />
            Pay ${totalDueToday.toFixed(2)} & Activate Service
          </>
        )}
      </Button>

      <p className="text-xs text-gray-500 text-center mt-4">
        Secure payment powered by Stripe. Your service will be activated immediately after payment.
      </p>

      <p className="text-sm text-gray-600 text-center mt-6">
        Questions about billing? Call us at (321) 524-3838
      </p>
    </div>
  );
}