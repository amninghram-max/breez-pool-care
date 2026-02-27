import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { TrendingUp, Clock, CheckCircle, X, Eye } from 'lucide-react';

const STATUS_COLORS = {
  pending_review: 'bg-yellow-100 text-yellow-800',
  monitoring: 'bg-blue-100 text-blue-800',
  contacted: 'bg-teal-100 text-teal-800',
  quote_generated: 'bg-green-100 text-green-800',
  dismissed: 'bg-gray-100 text-gray-600',
};

const STATUS_LABELS = {
  pending_review: 'Pending Review',
  monitoring: 'Monitoring',
  contacted: 'Contacted',
  quote_generated: 'Quote Sent',
  dismissed: 'Dismissed',
};

export default function ReviewFrequencyRecs({ recs = [], leads = [] }) {
  const queryClient = useQueryClient();
  const leadMap = Object.fromEntries(leads.map(l => [l.id, l]));
  const [updating, setUpdating] = useState(null);

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }) => {
      return base44.entities.FrequencyRecommendation.update(id, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['freqRecs'] });
      setUpdating(null);
    }
  });

  const activeRecs = recs.filter(r => r.status !== 'dismissed');

  if (activeRecs.length === 0) {
    return (
      <div className="text-center py-8 text-gray-400 text-sm">No open frequency recommendations</div>
    );
  }

  return (
    <div className="space-y-3">
      {activeRecs.map(rec => {
        const lead = leadMap[rec.leadId];
        return (
          <Card key={rec.id} className="border-yellow-200">
            <CardContent className="pt-4 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-sm text-gray-900">
                    {lead ? `${lead.firstName} ${lead.lastName || ''}`.trim() : `Lead ${rec.leadId?.slice(-6)}`}
                  </p>
                  {lead?.serviceAddress && (
                    <p className="text-xs text-gray-500">{lead.serviceAddress}</p>
                  )}
                </div>
                <Badge className={STATUS_COLORS[rec.status] || 'bg-gray-100 text-gray-600'}>
                  {STATUS_LABELS[rec.status] || rec.status}
                </Badge>
              </div>

              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="bg-gray-50 rounded p-2">
                  <p className="text-xs text-gray-500">Risk Score</p>
                  <p className="font-bold text-sm text-orange-600">{rec.riskScore}</p>
                </div>
                <div className="bg-gray-50 rounded p-2">
                  <p className="text-xs text-gray-500">Threshold</p>
                  <p className="font-bold text-sm text-gray-700">{rec.effectiveThreshold}</p>
                </div>
                <div className="bg-gray-50 rounded p-2">
                  <p className="text-xs text-gray-500">Consecutive</p>
                  <p className="font-bold text-sm text-gray-700">{rec.consecutiveVisitsAbove} visits</p>
                </div>
              </div>

              <div className="flex gap-2">
                {rec.status === 'pending_review' && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1 text-xs"
                    disabled={updating === rec.id}
                    onClick={() => {
                      setUpdating(rec.id);
                      updateMutation.mutate({ id: rec.id, data: { status: 'monitoring', reviewedAt: new Date().toISOString() } });
                    }}
                  >
                    <Eye className="w-3 h-3 mr-1" />
                    Monitor
                  </Button>
                )}
                {(rec.status === 'pending_review' || rec.status === 'monitoring') && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1 text-xs border-teal-300 text-teal-700 hover:bg-teal-50"
                    disabled={updating === rec.id}
                    onClick={() => {
                      setUpdating(rec.id);
                      updateMutation.mutate({ id: rec.id, data: { status: 'contacted', contactedAt: new Date().toISOString() } });
                    }}
                  >
                    <CheckCircle className="w-3 h-3 mr-1" />
                    Mark Contacted
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-xs text-gray-400 hover:text-gray-600"
                  disabled={updating === rec.id}
                  onClick={() => {
                    setUpdating(rec.id);
                    updateMutation.mutate({ id: rec.id, data: { status: 'dismissed', dismissalReason: 'manual_override' } });
                  }}
                >
                  <X className="w-3 h-3" />
                </Button>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}