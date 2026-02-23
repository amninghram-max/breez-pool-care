import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { CheckCircle2, FileText, Shield, AlertTriangle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

export default function Agreements() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [accepted, setAccepted] = useState(false);

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

  const acceptAgreementsMutation = useMutation({
    mutationFn: async () => {
      const timestamp = new Date().toISOString();
      await base44.entities.Lead.update(lead.id, {
        agreementsAcceptedAt: timestamp,
        agreementsAccepted: true,
        stage: 'quote_sent' // Move to next stage
      });
      
      // Log analytics event
      await base44.integrations.Core.InvokeLLM({
        prompt: `Log analytics event: AgreementsAccepted for lead ${lead.id}`
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['myLead'] });
      navigate(createPageUrl('PaymentSetup'));
    }
  });

  const agreements = [
    {
      title: 'Terms of Service',
      description: 'Our standard service terms and conditions',
      icon: FileText,
      required: true
    },
    {
      title: 'Privacy Policy',
      description: 'How we handle your personal information',
      icon: Shield,
      required: true
    },
    {
      title: 'Service Disclaimers',
      description: 'Chemical safety and pool maintenance disclaimers',
      icon: AlertTriangle,
      required: true
    },
    {
      title: 'Liability & Damage Exclusions',
      description: 'Equipment damage, chemical damage, and liability limits',
      icon: AlertTriangle,
      required: true
    },
    {
      title: 'Photo & Media Consent',
      description: 'Service documentation and marketing photos',
      icon: FileText,
      required: false
    },
    {
      title: 'Billing Rules',
      description: 'Monthly prepay, AutoPay discount, grace periods, suspensions',
      icon: FileText,
      required: true
    }
  ];

  if (lead?.poolCondition === 'green') {
    agreements.push({
      title: 'Green-to-Clean Recovery Agreement',
      description: 'Multi-visit treatment plan and expectations',
      icon: AlertTriangle,
      required: true
    });
  }

  if (!user || !lead) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-gray-500">Loading...</p>
      </div>
    );
  }

  if (lead.agreementsAccepted) {
    return (
      <div className="max-w-3xl mx-auto py-12">
        <Alert>
          <CheckCircle2 className="h-4 w-4" />
          <AlertDescription>
            You've already accepted the agreements. Proceeding to payment setup...
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto py-8 px-4">
      {/* Header */}
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-3">
          Welcome to Breez Pool Care
        </h1>
        <p className="text-lg text-gray-600">
          Let's get your service started — please review and accept our agreements below
        </p>
      </div>

      {/* Agreements List */}
      <div className="space-y-4 mb-8">
        {agreements.map((agreement, index) => {
          const Icon = agreement.icon;
          return (
            <Card key={index} className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex items-start gap-4">
                  <div className="p-2 bg-teal-50 rounded-lg">
                    <Icon className="w-6 h-6 text-teal-600" />
                  </div>
                  <div className="flex-1">
                    <CardTitle className="text-lg mb-1">
                      {agreement.title}
                      {agreement.required && (
                        <span className="text-red-500 ml-1">*</span>
                      )}
                    </CardTitle>
                    <p className="text-sm text-gray-600">
                      {agreement.description}
                    </p>
                  </div>
                </div>
              </CardHeader>
            </Card>
          );
        })}
      </div>

      {/* Acceptance Checkbox */}
      <Card className="border-2 border-teal-500 bg-teal-50/50 mb-6">
        <CardContent className="pt-6">
          <div className="flex items-start gap-3">
            <Checkbox
              id="accept-all"
              checked={accepted}
              onCheckedChange={setAccepted}
              className="mt-1"
            />
            <label
              htmlFor="accept-all"
              className="text-sm font-medium leading-relaxed cursor-pointer"
            >
              I have reviewed and accept all required agreements listed above, including:
              Terms of Service, Privacy Policy, Service Disclaimers, Liability Exclusions,
              and Billing Rules.
              {lead?.poolCondition === 'green' && ' I also accept the Green-to-Clean Recovery Agreement.'}
              <br />
              <span className="text-gray-600 font-normal">
                By checking this box, you acknowledge that you have read and agree to be bound
                by these terms. Accepted on {new Date().toLocaleDateString()}.
              </span>
            </label>
          </div>
        </CardContent>
      </Card>

      {/* Action Buttons */}
      <div className="flex gap-4">
        <Button
          onClick={() => acceptAgreementsMutation.mutate()}
          disabled={!accepted || acceptAgreementsMutation.isPending}
          className="flex-1 h-12 text-lg bg-teal-600 hover:bg-teal-700"
        >
          {acceptAgreementsMutation.isPending ? (
            'Processing...'
          ) : (
            <>
              <CheckCircle2 className="w-5 h-5 mr-2" />
              Accept All and Continue to Payment
            </>
          )}
        </Button>
      </div>

      <p className="text-xs text-gray-500 text-center mt-6">
        Questions? Contact us at (321) 524-3838 before proceeding.
      </p>
    </div>
  );
}