import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { CreditCard, Plus, Trash2 } from 'lucide-react';
import { CardElement, useStripe, useElements } from '@stripe/react-stripe-js';

export default function PaymentMethodManager({ leadId, stripeCustomerId, autopayEnabled }) {
  const [showAddCard, setShowAddCard] = useState(false);
  const [enableAutopay, setEnableAutopay] = useState(autopayEnabled);
  const stripe = useStripe();
  const elements = useElements();
  const queryClient = useQueryClient();

  const { data: paymentMethods = [] } = useQuery({
    queryKey: ['paymentMethods', leadId],
    queryFn: () => base44.entities.PaymentMethod.filter({ leadId }),
    enabled: !!leadId
  });

  const { data: billingSettings } = useQuery({
    queryKey: ['billingSettings'],
    queryFn: async () => {
      const settings = await base44.entities.BillingSettings.filter({ settingKey: 'default' });
      return settings[0] || {};
    }
  });

  const addPaymentMethodMutation = useMutation({
    mutationFn: async ({ paymentMethodId, setAsDefault, enableAutopay }) => {
      // Create Stripe customer if needed
      if (!stripeCustomerId) {
        const customerResponse = await base44.functions.invoke('createStripeCustomer', { leadId });
        stripeCustomerId = customerResponse.data.customerId;
      }

      const response = await base44.functions.invoke('addPaymentMethod', {
        leadId,
        paymentMethodId,
        setAsDefault,
        enableAutopay
      });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['paymentMethods'] });
      queryClient.invalidateQueries({ queryKey: ['currentLead'] });
      setShowAddCard(false);
    }
  });

  const updateAutoPayMutation = useMutation({
    mutationFn: async (enabled) => {
      await base44.entities.Lead.update(leadId, { autopayEnabled: enabled });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['currentLead'] });
    }
  });

  const handleAddCard = async (e) => {
    e.preventDefault();
    
    if (!stripe || !elements) return;

    const cardElement = elements.getElement(CardElement);
    const { error, paymentMethod } = await stripe.createPaymentMethod({
      type: 'card',
      card: cardElement,
    });

    if (error) {
      alert(error.message);
      return;
    }

    addPaymentMethodMutation.mutate({
      paymentMethodId: paymentMethod.id,
      setAsDefault: paymentMethods.length === 0,
      enableAutopay: enableAutopay
    });
  };

  const handleAutopayToggle = (enabled) => {
    setEnableAutopay(enabled);
    updateAutoPayMutation.mutate(enabled);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-teal-600" />
            Payment Methods
          </span>
          {!showAddCard && (
            <Button size="sm" onClick={() => setShowAddCard(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Add Card
            </Button>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* AutoPay Toggle */}
        {billingSettings?.autopayEnabled && paymentMethods.length > 0 && (
          <div className="bg-teal-50 border border-teal-200 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-medium text-teal-900">Enable AutoPay</h3>
                <p className="text-sm text-teal-700">
                  Save ${billingSettings.autopayDiscountAmount || 10}/month when you enroll in AutoPay
                </p>
              </div>
              <Switch
                checked={enableAutopay}
                onCheckedChange={handleAutopayToggle}
              />
            </div>
          </div>
        )}

        {/* Add Card Form */}
        {showAddCard && (
          <form onSubmit={handleAddCard} className="space-y-4 p-4 border rounded-lg">
            <div>
              <label className="block text-sm font-medium mb-2">Card Details</label>
              <div className="border rounded p-3">
                <CardElement options={{
                  style: {
                    base: {
                      fontSize: '16px',
                      color: '#424770',
                      '::placeholder': {
                        color: '#aab7c4',
                      },
                    },
                  },
                }} />
              </div>
            </div>
            <div className="flex gap-2">
              <Button type="submit" disabled={addPaymentMethodMutation.isPending}>
                {addPaymentMethodMutation.isPending ? 'Adding...' : 'Add Card'}
              </Button>
              <Button type="button" variant="outline" onClick={() => setShowAddCard(false)}>
                Cancel
              </Button>
            </div>
          </form>
        )}

        {/* Payment Methods List */}
        {paymentMethods.length === 0 && !showAddCard ? (
          <div className="text-center py-8 text-gray-500">
            <CreditCard className="w-12 h-12 mx-auto mb-2 opacity-50" />
            <p>No payment methods added yet</p>
          </div>
        ) : (
          <div className="space-y-3">
            {paymentMethods.map((method) => (
              <div key={method.id} className="flex items-center justify-between p-4 border rounded-lg">
                <div className="flex items-center gap-3">
                  <CreditCard className="w-5 h-5 text-gray-400" />
                  <div>
                    <div className="font-medium">
                      {method.brand.toUpperCase()} ···· {method.last4}
                    </div>
                    {method.expirationMonth && method.expirationYear && (
                      <div className="text-sm text-gray-500">
                        Expires {method.expirationMonth}/{method.expirationYear}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {method.isDefault && <Badge>Default</Badge>}
                  {method.status === 'expired' && <Badge variant="destructive">Expired</Badge>}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}