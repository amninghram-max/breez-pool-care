import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Eye, ArrowRight, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { createPageUrl } from '@/utils';

const SOURCE_LABELS = {
  landing_page: 'Landing',
  prequalification: 'Pre-qual',
  public_quote_wizard: 'Quote Wizard'
};

function ViewRequestModal({ request, onClose }) {
  if (!request) return null;

  let questionnaire;
  try {
    questionnaire = typeof request.questionnaireData === 'string'
      ? JSON.parse(request.questionnaireData)
      : request.questionnaireData;
  } catch {
    questionnaire = { error: 'Failed to parse questionnaireData' };
  }

  return (
    <Dialog open={!!request} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Quote Request Details</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="bg-gray-100 rounded-lg p-4">
            <p className="text-xs font-semibold text-gray-600 mb-2">REQUEST INFO</p>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <p className="text-gray-500">Name</p>
                <p className="font-medium">{request.firstName}</p>
              </div>
              <div>
                <p className="text-gray-500">Email</p>
                <p className="font-medium truncate">{request.email}</p>
              </div>
              <div>
                <p className="text-gray-500">Source</p>
                <p className="font-medium">{SOURCE_LABELS[request.source] || request.source}</p>
              </div>
              <div>
                <p className="text-gray-500">Submitted</p>
                <p className="font-medium">{format(new Date(request.created_date), 'MMM d, HH:mm')}</p>
              </div>
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold text-gray-600 mb-2">QUESTIONNAIRE DATA</p>
            <pre className="text-xs bg-gray-50 border border-gray-200 p-3 rounded overflow-auto max-h-96 font-mono text-gray-700">
              {JSON.stringify(questionnaire, null, 2)}
            </pre>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function QuoteRequestQueuePanel() {
  const queryClient = useQueryClient();
  const [viewingRequest, setViewingRequest] = useState(null);

  const { data: requests = [], isLoading } = useQuery({
    queryKey: ['publicQuoteRequests'],
    queryFn: () => base44.entities.PublicQuoteRequest.filter(
      { status: 'pending' },
      '-created_date',
      50
    )
  });

  const convertMutation = useMutation({
    mutationFn: (requestId) => base44.functions.invoke('convertQuoteRequestToLead', { requestId }),
    onSuccess: (res) => {
      if (res.data?.success) {
        toast.success('Lead created successfully');
        queryClient.invalidateQueries({ queryKey: ['publicQuoteRequests'] });
        // Optional: navigate to LeadsPipeline
        // window.location.href = createPageUrl('LeadsPipeline');
      } else {
        toast.error(res.data?.error || 'Conversion failed');
      }
    },
    onError: (err) => {
      toast.error(err.message || 'Conversion failed');
    }
  });

  // Don't render if loading or empty
  if (isLoading || requests.length === 0) {
    return null;
  }

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <FileText className="w-4 h-4" />
              Quote Requests
              <Badge variant="secondary">{requests.length}</Badge>
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {requests.map((req) => (
              <div
                key={req.id}
                className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-sm text-gray-900">{req.firstName}</p>
                  <p className="text-xs text-gray-500 truncate">{req.email}</p>
                  <div className="flex items-center gap-2 mt-1.5">
                    <Badge variant="outline" className="text-xs">
                      {SOURCE_LABELS[req.source] || req.source}
                    </Badge>
                    <span className="text-xs text-gray-400">
                      {format(new Date(req.created_date), 'MMM d, HH:mm')}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1 ml-3 shrink-0">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setViewingRequest(req)}
                    title="View details"
                  >
                    <Eye className="w-4 h-4" />
                  </Button>
                  <Button
                    size="sm"
                    className="bg-teal-600 hover:bg-teal-700"
                    onClick={() => convertMutation.mutate(req.id)}
                    disabled={convertMutation.isPending}
                    title="Convert to lead"
                  >
                    <ArrowRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <ViewRequestModal request={viewingRequest} onClose={() => setViewingRequest(null)} />
    </>
  );
}