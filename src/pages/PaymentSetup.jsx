import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { CheckCircle2, CreditCard, DollarSign, Zap, AlertCircle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { loadStripe } from '@stripe/stripe-js';

// Guard: only initialize Stripe if publishable key is available
const stripePromise = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY 
  ? loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY)
  : null;

export default function PaymentSetup() {
  const navigate = useNavigate();
  const [autopayEnabled, setAutopayEnabled] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState(null);

  // Support ?inspectionId=... param from post-inspection flow
  const urlParams = new URLSearchParams(window.location.search);
  const inspectionId = urlParams.get('inspectionId');

  const { data: user } = useQuery({
    queryKey: ['user'],
    queryFn: () => base44.auth.me(),
  });

  const { data: lead } = useQuery({
    queryKey: ['myLead', user?.email],
    queryFn: async () => {
      const leads = await base44.entities.Lead.filter({ email: user.email });
      return leads[0] || null;
    },
    enabled: !!user,
  });

  const { data: inspectionRecord } = useQuery({
    queryKey: ['inspectionRecord', inspectionId],
    queryFn: () => base44.entities.InspectionRecord.get(inspectionId),
    enabled: !!inspectionId,
  });

  if (!user || !lead) {
    return <div className="flex items-center justify-center min-h-screen"><p className="text-gray-500">Loading...</p></div>;
  }

  if (!lead.agreementsAccepted) {
    navigate(createPageUrl('Agreements') + (inspectionId ? `?inspectionId=${inspectionId}` : ''));
    return null;
  }

  // Pricing: prefer locked inspection rate, fall back to lead.monthlyServiceAmount
  const baseMonthly = inspectionRecord?.lockedMonthlyRate || lead?.monthlyServiceAmount || 0;
  const lockedFrequency = inspectionRecord?.lockedFrequency || 'weekly';
  const visitsPerMonth = lockedFrequency === 'twice_weekly' ? 8 : 4;
  const perVisit = baseMonthly > 0 ? (baseMonthly / visitsPerMonth) : 0;
  const greenFee = inspectionRecord?.greenToCleanFee || 0;

  const autopayDiscount = 10;
  const monthlyAfterAutopay = autopayEnabled ? Math.max(0, baseMonthly - autopayDiscount) : baseMonthly;
  const totalDueToday = monthlyAfterAutopay + greenFee;

  const handlePayment = async () => {
    try {
      setProcessing(true);
      setError(null);

      const response = await base44.functions.invoke('createActivationPayment', {
        leadId: lead.id,
        autopayEnabled,
        inspectionRecordId: inspectionId || null,
      });

      if (response.data.error) {
        setError(response.data.error);
        setProcessing(false);
        return;
      }

      const stripe = await stripePromise;
      const { error: stripeError } = await stripe.redirectToCheckout({ sessionId: response.data.sessionId });
      if (stripeError) {
        setError(stripeError.message);
        setProcessing(false);
      }
    } catch (err) {
      setError(err.message || 'Payment failed. Please try again.');
      setProcessing(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto py-8 px-4">
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-teal-100 rounded-full mb-4">
          <CheckCircle2 className="w-8 h-8 text-teal-600" />
        </div>
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Activate Your Service</h1>
        <p className="text-lg text-gray-600">Review your service details and complete payment to get started</p>
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
            <span className="text-gray-600">Monthly Service</span>
            <span className="font-semibold">${baseMonthly.toFixed(2)}/month</span>
          </div>
          <div className="flex justify-between items-center pb-3 border-b">
            <span className="text-gray-600">Average per visit</span>
            <span className="text-gray-700">approximately ${perVisit.toFixed(2)}</span>
          </div>
          {greenFee > 0 && (
            <div className="flex justify-between items-center pb-3 border-b">
              <div>
                <span className="text-gray-600">Green-to-Clean Recovery</span>
                <p className="text-xs text-gray-400">One-time fee, first month only</p>
              </div>
              <span className="font-semibold text-orange-700">${greenFee.toFixed(2)}</span>
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
                <h3 className="font-semibold text-lg">Enable AutoPay & Save ${autopayDiscount}/month</h3>
              </div>
              <p className="text-sm text-gray-600 mb-3">Automatically charged each month. Cancel anytime from billing settings.</p>
              <ul className="text-sm text-gray-600 space-y-1">
                <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-teal-600" />${autopayDiscount} monthly discount</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-teal-600" />Never miss a payment</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-teal-600" />Hassle-free service continuation</li>
              </ul>
            </div>
            <Switch checked={autopayEnabled} onCheckedChange={setAutopayEnabled} className="mt-1" />
          </div>
        </CardContent>
      </Card>

      {/* Payment Summary */}
      <Card className="mb-6 bg-gray-50">
        <CardContent className="pt-6 space-y-3">
          <div className="flex justify-between text-lg">
            <span>Monthly Service</span>
            <span>${baseMonthly.toFixed(2)}</span>
          </div>
          {autopayEnabled && (
            <div className="flex justify-between text-teal-600">
              <span>AutoPay Discount</span>
              <span>-${autopayDiscount.toFixed(2)}</span>
            </div>
          )}
          {greenFee > 0 && (
            <div className="flex justify-between text-orange-700">
              <span>Green-to-Clean (one-time)</span>
              <span>${greenFee.toFixed(2)}</span>
            </div>
          )}
          <div className="flex justify-between text-2xl font-bold pt-3 border-t-2">
            <span>Total Due Today</span>
            <span className="text-teal-600">${totalDueToday.toFixed(2)}</span>
          </div>
        </CardContent>
      </Card>

      {error && (
        <Alert variant="destructive" className="mb-6">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Payment Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Button onClick={handlePayment} disabled={processing} className="w-full h-14 text-lg bg-teal-600 hover:bg-teal-700">
        {processing ? 'Processing...' : <><DollarSign className="w-5 h-5 mr-2" />Pay ${totalDueToday.toFixed(2)} & Activate Service</>}
      </Button>

      <p className="text-xs text-gray-500 text-center mt-4">Secure payment powered by Stripe.</p>
      <p className="text-sm text-gray-600 text-center mt-2">Questions? Call (321) 524-3838</p>
    </div>
  );
}