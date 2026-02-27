import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Loader2, CheckCircle, AlertCircle } from 'lucide-react';

/**
 * QuoteAcceptanceUI
 * Post-inspection: customer accepts quote → payment setup.
 * Deterministic pricing, no overrides.
 */

export default function QuoteAcceptanceUI({ quote, onAccepted }) {
  const queryClient = useQueryClient();
  const [autopay, setAutopay] = useState(false);
  const [step, setStep] = useState('confirm'); // confirm | payment | complete

  const acceptMutation = useMutation({
    mutationFn: async () => {
      const res = await base44.functions.invoke('acceptQuote', { quoteId: quote.id });
      return res.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['quotes'] });
      setStep('payment');
    }
  });

  const createCustomerMutation = useMutation({
    mutationFn: async (acceptData) => {
      const res = await base44.functions.invoke('createStripeCustomerFromQuote', {
        leadId: acceptData.leadId,
        quoteId: quote.id,
        clientEmail: acceptData.clientEmail,
        clientFirstName: quote.clientFirstName
      });
      return res.data;
    },
    onSuccess: (customerData) => {
      paymentMutation.mutate(customerData.stripeCustomerId);
    }
  });

  const paymentMutation = useMutation({
    mutationFn: async (stripeCustomerId) => {
      const res = await base44.functions.invoke('processFirstPayment', {
        leadId: acceptMutation.data?.leadId,
        quoteId: quote.id,
        stripeCustomerId,
        monthlyPrice: quote.outputMonthlyPrice,
        oneTimeFees: quote.outputOneTimeFees,
        autopayEnrolled: autopay
      });
      return res.data;
    },
    onSuccess: (paymentData) => {
      scheduleServiceMutation.mutate();
    }
  });

  const scheduleServiceMutation = useMutation({
    mutationFn: async () => {
      const res = await base44.functions.invoke('scheduleFirstService', {
        leadId: acceptMutation.data?.leadId,
        quoteId: quote.id,
        frequency: quote.outputFrequency,
        assignedTechnician: 'Matt'
      });
      return res.data;
    },
    onSuccess: (serviceData) => {
      setStep('complete');
      if (onAccepted) onAccepted(serviceData);
    }
  });

  const handleAccept = async () => {
    await acceptMutation.mutateAsync();
    // Next: customer setup with Stripe
    if (acceptMutation.data) {
      createCustomerMutation.mutate(acceptMutation.data);
    }
  };

  if (step === 'complete') {
    return (
      <Card className="bg-green-50 border-green-200">
        <CardHeader>
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle className="w-6 h-6 text-green-600" />
            <CardTitle>You're All Set! 🎉</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 text-green-800">
          <p>Thank you for accepting. Your first service is scheduled to begin next week.</p>
          <div className="bg-white rounded-lg p-4 space-y-2 text-sm">
            <p><strong>Monthly Service:</strong> ${quote.outputMonthlyPrice?.toFixed(2)}/month</p>
            <p><strong>Frequency:</strong> {quote.outputFrequency === 'twice_weekly' ? 'Twice weekly' : 'Weekly'}</p>
            <p><strong>AutoPay:</strong> {autopay ? 'Enabled' : 'Not enrolled'}</p>
          </div>
          <p className="text-xs text-green-700">Check your email for payment receipt and service schedule details.</p>
        </CardContent>
      </Card>
    );
  }

  if (step === 'payment') {
    return (
      <Card className="bg-blue-50 border-blue-200">
        <CardHeader>
          <CardTitle className="text-blue-900">Set Up Payment</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-white rounded-lg p-4 space-y-2 border border-blue-200">
            <div className="flex justify-between text-sm">
              <span>Monthly service:</span>
              <strong>${quote.outputMonthlyPrice?.toFixed(2)}</strong>
            </div>
            {(quote.outputOneTimeFees || 0) > 0 && (
              <div className="flex justify-between text-sm pb-2 border-b">
                <span>Initial fees:</span>
                <strong>${quote.outputOneTimeFees?.toFixed(2)}</strong>
              </div>
            )}
            <div className="flex justify-between text-base font-bold pt-2">
              <span>First month total:</span>
              <strong>${quote.outputFirstMonthTotal?.toFixed(2)}</strong>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Checkbox id="autopay" checked={autopay} onCheckedChange={setAutopay} />
              <Label htmlFor="autopay" className="cursor-pointer font-normal">
                Enroll in AutoPay (save ${autopay ? '10' : '$10'}/month)
              </Label>
            </div>
            <p className="text-xs text-gray-600 ml-6">Auto-renews monthly. Cancel anytime.</p>
          </div>

          <Button
            onClick={handleAccept}
            disabled={acceptMutation.isPending || createCustomerMutation.isPending || paymentMutation.isPending || scheduleServiceMutation.isPending}
            className="w-full bg-teal-600 hover:bg-teal-700 text-white"
          >
            {acceptMutation.isPending || createCustomerMutation.isPending || paymentMutation.isPending || scheduleServiceMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Processing...
              </>
            ) : (
              <>Complete & Start Service</>
            )}
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Ready to Get Started?</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert>
          <CheckCircle className="h-4 w-4" />
          <AlertDescription>
            Your inspection is complete. Matt confirmed the pricing below. Ready to begin?
          </AlertDescription>
        </Alert>

        <div className="bg-gray-50 rounded-lg p-4 space-y-3 border border-gray-200">
          <h3 className="font-semibold text-gray-900">Your Pricing</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span>Monthly service:</span>
              <strong className="text-lg text-teal-700">${quote.outputMonthlyPrice?.toFixed(2)}/mo</strong>
            </div>
            {(quote.outputOneTimeFees || 0) > 0 && (
              <div className="flex justify-between text-gray-600">
                <span>Initial fees (one-time):</span>
                <strong>${quote.outputOneTimeFees?.toFixed(2)}</strong>
              </div>
            )}
            <div className="pt-2 border-t border-gray-200 flex justify-between font-bold text-gray-900">
              <span>First month due:</span>
              <strong className="text-lg">${quote.outputFirstMonthTotal?.toFixed(2)}</strong>
            </div>
          </div>
          <p className="text-xs text-gray-600 italic">
            {quote.outputFrequency === 'twice_weekly' ? 'Service twice per week' : 'Service once per week'} (deterministic pricing confirmed at inspection)
          </p>
        </div>

        <Button
          onClick={() => acceptMutation.mutate()}
          disabled={acceptMutation.isPending}
          className="w-full bg-teal-600 hover:bg-teal-700 text-white py-6 text-base"
        >
          {acceptMutation.isPending ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Accepting...
            </>
          ) : (
            'Yes, Accept & Continue'
          )}
        </Button>

        <p className="text-xs text-gray-600 text-center">
          By accepting, you agree to our service terms. Pricing is locked and immutable.
        </p>
      </CardContent>
    </Card>
  );
}