import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle, CheckCircle } from 'lucide-react';

export default function ServiceReinstatement() {
  const [customerMessage, setCustomerMessage] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const queryClient = useQueryClient();

  const { data: user } = useQuery({
    queryKey: ['user'],
    queryFn: () => base44.auth.me()
  });

  const { data: lead } = useQuery({
    queryKey: ['currentLead', user?.email],
    queryFn: async () => {
      const leads = await base44.entities.Lead.filter({ email: user.email });
      return leads[0] || null;
    },
    enabled: !!user
  });

  const { data: openRequests = [] } = useQuery({
    queryKey: ['reinstatementRequests', lead?.id],
    queryFn: () => base44.entities.ReinstatementRequest.filter({ 
      leadId: lead.id,
      status: 'pending'
    }),
    enabled: !!lead
  });

  const submitRequestMutation = useMutation({
    mutationFn: async () => {
      await base44.entities.ReinstatementRequest.create({
        leadId: lead.id,
        status: 'pending',
        requestDate: new Date().toISOString(),
        customerMessage
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reinstatementRequests'] });
      setSubmitted(true);
    }
  });

  // Redirect if not suspended
  if (lead && !lead.accountStatus?.includes('suspended')) {
    window.location.href = '/Billing';
    return null;
  }

  if (!user || !lead) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="p-12 text-center">
            <p className="text-gray-600">Loading...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (submitted || openRequests.length > 0) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-teal-50 to-blue-50 flex items-center justify-center p-4">
        <Card className="max-w-md w-full text-center">
          <CardHeader>
            <div className="mx-auto mb-4 w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
              <CheckCircle className="w-8 h-8 text-green-600" />
            </div>
            <CardTitle className="text-2xl">Request Received</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-gray-700">
              We've received your reinstatement request and will review it shortly.
            </p>
            <p className="text-sm text-gray-600">
              You'll receive an email with next steps within 24-48 hours.
            </p>
            <Button variant="outline" onClick={() => window.location.href = '/'}>
              Back to Dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center p-4">
      <Card className="max-w-md w-full">
        <CardHeader>
          <div className="mx-auto mb-4 w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center">
            <AlertCircle className="w-8 h-8 text-gray-600" />
          </div>
          <CardTitle className="text-2xl text-center">Service Paused</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <Alert className="bg-blue-50 border-blue-200">
            <AlertDescription className="text-blue-900">
              Your service is currently paused because we didn't receive your monthly payment.
            </AlertDescription>
          </Alert>

          <div className="space-y-4">
            <p className="text-gray-700">
              To restart service, please request reinstatement and we'll confirm next steps.
            </p>

            <div>
              <label className="block text-sm font-medium mb-2">
                Message (Optional)
              </label>
              <Textarea
                value={customerMessage}
                onChange={(e) => setCustomerMessage(e.target.value)}
                placeholder="Is there anything you'd like us to know?"
                rows={4}
              />
            </div>

            <Button 
              className="w-full bg-teal-600 hover:bg-teal-700"
              onClick={() => submitRequestMutation.mutate()}
              disabled={submitRequestMutation.isPending}
            >
              {submitRequestMutation.isPending ? 'Submitting...' : 'Request Reinstatement'}
            </Button>

            <p className="text-xs text-gray-500 text-center">
              We'll review your request and contact you within 24-48 hours with payment details to restart service.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}