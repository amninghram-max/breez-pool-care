import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { CreditCard, AlertCircle, CheckCircle, Calendar, Loader2 } from 'lucide-react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements } from '@stripe/react-stripe-js';
import { useCustomerPageGuard } from '@/components/auth/useCustomerPageGuard';
import PaymentMethodManager from '@/components/billing/PaymentMethodManager';
import InvoiceList from '@/components/billing/InvoiceList';

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || 'pk_test_51QYourKeyHere');

export default function Billing() {
  const { data: user, isLoading: userLoading } = useQuery({
    queryKey: ['user'],
    queryFn: () => base44.auth.me()
  });

  useCustomerPageGuard(user, userLoading);

  const { data: lead } = useQuery({
    queryKey: ['currentLead', user?.email],
    queryFn: async () => {
      const leads = await base44.entities.Lead.filter({ email: user.email });
      return leads[0] || null;
    },
    enabled: !!user
  });

  const { data: invoices = [] } = useQuery({
    queryKey: ['invoices', lead?.id],
    queryFn: () => base44.entities.Invoice.filter({ leadId: lead.id }),
    enabled: !!lead
  });

  const { data: billingSettings } = useQuery({
    queryKey: ['billingSettings'],
    queryFn: async () => {
      const settings = await base44.entities.BillingSettings.filter({ settingKey: 'default' });
      return settings[0] || {};
    }
  });

  // Check for suspended or past due status
  const isSuspended = lead?.accountStatus?.includes('suspended');
  const hasPastDue = invoices.some(inv => inv.status === 'past_due' || inv.status === 'open');

  if (userLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-teal-600" />
      </div>
    );
  }

  if (!user || !lead) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <Card>
          <CardContent className="p-12 text-center">
            <p className="text-gray-600">Loading billing information...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Redirect suspended customers
  if (isSuspended) {
    window.location.href = '/ServiceReinstatement';
    return null;
  }

  return (
    <Elements stripe={stripePromise}>
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Billing & Payments</h1>
          <p className="text-gray-600 mt-1">Manage your payment methods and invoices</p>
        </div>

        {/* Payment Alert Banner */}
        {hasPastDue && (
          <Alert className="bg-red-50 border-red-200">
            <AlertCircle className="h-5 w-5 text-red-600" />
            <AlertDescription className="text-red-900">
              <strong>Payment needed to keep services active.</strong>
              {billingSettings?.gracePeriodHours && (
                <span className="ml-2">
                  You have {billingSettings.gracePeriodHours} hours from the due date to make payment.
                </span>
              )}
            </AlertDescription>
          </Alert>
        )}

        {/* AutoPay Status */}
        {lead.autopayEnabled && (
          <Alert className="bg-green-50 border-green-200">
            <CheckCircle className="h-5 w-5 text-green-600" />
            <AlertDescription className="text-green-900">
              <strong>AutoPay is enabled.</strong> You're saving ${billingSettings?.autopayDiscountAmount || 10}/month!
            </AlertDescription>
          </Alert>
        )}

        {/* Account Overview */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="w-5 h-5 text-teal-600" />
              Account Overview
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between">
              <span className="text-gray-600">Monthly Service Amount</span>
              <span className="font-semibold">${lead.monthlyServiceAmount?.toFixed(2) || '0.00'}</span>
            </div>
            {lead.autopayEnabled && billingSettings?.autopayEnabled && (
              <div className="flex justify-between">
                <span className="text-gray-600">AutoPay Discount</span>
                <span className="font-semibold text-green-600">
                  -${billingSettings.autopayDiscountAmount?.toFixed(2) || '10.00'}
                </span>
              </div>
            )}
            <div className="flex justify-between pt-2 border-t">
              <span className="font-medium">Total Monthly</span>
              <span className="font-bold text-lg">
                ${((lead.monthlyServiceAmount || 0) - (lead.autopayEnabled ? (billingSettings?.autopayDiscountAmount || 10) : 0)).toFixed(2)}
              </span>
            </div>
            {lead.nextBillingDate && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Next Billing Date</span>
                <span>{new Date(lead.nextBillingDate).toLocaleDateString()}</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Payment Methods */}
        <PaymentMethodManager 
          leadId={lead.id} 
          stripeCustomerId={lead.stripeCustomerId}
          autopayEnabled={lead.autopayEnabled}
        />

        {/* Invoices */}
        <InvoiceList invoices={invoices} leadId={lead.id} />
      </div>
    </Elements>
  );
}