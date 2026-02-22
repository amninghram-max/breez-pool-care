import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, CheckCircle, XCircle } from 'lucide-react';

export default function AdminReinstatements() {
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [reinstatementFee, setReinstatementFee] = useState(50);
  const [adminNotes, setAdminNotes] = useState('');
  const queryClient = useQueryClient();

  const { data: user } = useQuery({
    queryKey: ['user'],
    queryFn: () => base44.auth.me()
  });

  const { data: requests = [] } = useQuery({
    queryKey: ['reinstatementRequests'],
    queryFn: () => base44.entities.ReinstatementRequest.filter({ status: 'pending' })
  });

  const { data: billingSettings } = useQuery({
    queryKey: ['billingSettings'],
    queryFn: async () => {
      const settings = await base44.entities.BillingSettings.filter({ settingKey: 'default' });
      return settings[0] || {};
    }
  });

  const processDecisionMutation = useMutation({
    mutationFn: async ({ requestId, decision, reinstatementFee, adminNotes }) => {
      const response = await base44.functions.invoke('processReinstatementDecision', {
        requestId,
        decision,
        reinstatementFee,
        adminNotes
      });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reinstatementRequests'] });
      setSelectedRequest(null);
      setAdminNotes('');
      alert('Decision processed successfully');
    }
  });

  // Check admin access
  if (user && user.role !== 'admin') {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <Card>
          <CardContent className="p-12 text-center">
            <AlertCircle className="w-16 h-16 mx-auto mb-4 text-gray-400" />
            <h2 className="text-xl font-bold mb-2">Access Denied</h2>
            <p className="text-gray-600">This page is only accessible to administrators.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Reinstatement Requests</h1>
        <p className="text-gray-600 mt-1">Review and process customer reinstatement requests</p>
      </div>

      {requests.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <CheckCircle className="w-16 h-16 mx-auto mb-4 text-green-400" />
            <p className="text-gray-600">No pending reinstatement requests</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6">
          {requests.map((request) => (
            <RequestCard 
              key={request.id}
              request={request}
              billingSettings={billingSettings}
              onSelect={setSelectedRequest}
              isSelected={selectedRequest?.id === request.id}
              reinstatementFee={reinstatementFee}
              setReinstatementFee={setReinstatementFee}
              adminNotes={adminNotes}
              setAdminNotes={setAdminNotes}
              onProcess={processDecisionMutation.mutate}
              isProcessing={processDecisionMutation.isPending}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function RequestCard({ 
  request, 
  billingSettings, 
  onSelect, 
  isSelected, 
  reinstatementFee, 
  setReinstatementFee,
  adminNotes,
  setAdminNotes,
  onProcess,
  isProcessing
}) {
  const { data: lead } = useQuery({
    queryKey: ['lead', request.leadId],
    queryFn: () => base44.entities.Lead.get(request.leadId)
  });

  const { data: invoices = [] } = useQuery({
    queryKey: ['invoices', request.leadId],
    queryFn: () => base44.entities.Invoice.filter({ leadId: request.leadId }),
    enabled: !!request.leadId
  });

  const pastDueInvoices = invoices.filter(inv => inv.status === 'past_due' || inv.status === 'open');

  if (!lead) return null;

  return (
    <Card className={isSelected ? 'border-teal-500 border-2' : ''}>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle>{lead.firstName} {lead.lastName}</CardTitle>
            <p className="text-sm text-gray-500">{lead.email}</p>
            <p className="text-sm text-gray-500">{lead.serviceAddress}</p>
          </div>
          <Badge className="bg-yellow-100 text-yellow-800">Pending</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="bg-gray-50 rounded-lg p-4">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-gray-600">Request Date:</span>
              <div className="font-medium">{new Date(request.requestDate).toLocaleDateString()}</div>
            </div>
            <div>
              <span className="text-gray-600">Account Status:</span>
              <div className="font-medium capitalize">{lead.accountStatus?.replace(/_/g, ' ')}</div>
            </div>
            <div>
              <span className="text-gray-600">Monthly Amount:</span>
              <div className="font-medium">${lead.monthlyServiceAmount?.toFixed(2) || '0.00'}</div>
            </div>
            <div>
              <span className="text-gray-600">Past Due Invoices:</span>
              <div className="font-medium">{pastDueInvoices.length}</div>
            </div>
          </div>
        </div>

        {request.customerMessage && (
          <div>
            <Label className="text-xs text-gray-600">Customer Message:</Label>
            <p className="text-sm mt-1 p-3 bg-blue-50 rounded">{request.customerMessage}</p>
          </div>
        )}

        {!isSelected ? (
          <Button onClick={() => onSelect(request)} className="w-full">
            Review Request
          </Button>
        ) : (
          <div className="space-y-4 border-t pt-4">
            <div>
              <Label>Reinstatement Fee</Label>
              <Input
                type="number"
                value={reinstatementFee}
                onChange={(e) => setReinstatementFee(parseFloat(e.target.value))}
                className="mt-2"
              />
              <p className="text-xs text-gray-500 mt-1">
                Default: ${billingSettings.defaultReinstatementFee || 50}
              </p>
            </div>

            <div>
              <Label>Internal Notes</Label>
              <Textarea
                value={adminNotes}
                onChange={(e) => setAdminNotes(e.target.value)}
                placeholder="Add notes about this decision..."
                rows={3}
                className="mt-2"
              />
            </div>

            <div className="flex gap-3">
              <Button
                onClick={() => onProcess({
                  requestId: request.id,
                  decision: 'reinstate',
                  reinstatementFee,
                  adminNotes
                })}
                disabled={isProcessing}
                className="flex-1 bg-green-600 hover:bg-green-700"
              >
                <CheckCircle className="w-4 h-4 mr-2" />
                Approve Reinstatement
              </Button>
              <Button
                onClick={() => onProcess({
                  requestId: request.id,
                  decision: 'cancel',
                  reinstatementFee: 0,
                  adminNotes
                })}
                disabled={isProcessing}
                variant="destructive"
                className="flex-1"
              >
                <XCircle className="w-4 h-4 mr-2" />
                Cancel Service
              </Button>
            </div>

            <Button variant="outline" onClick={() => onSelect(null)} className="w-full">
              Cancel
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}