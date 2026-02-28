import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { toast } from 'sonner';

export default function SafetyPanel() {
  const queryClient = useQueryClient();

  const { data: incidents = [] } = useQuery({
    queryKey: ['fecalIncidents'],
    queryFn: () => base44.entities.FecalIncident.filter({ status: { $in: ['open', 'disinfecting'] } }, '-reportedAt')
  });

  const { data: leads = [] } = useQuery({
    queryKey: ['leadsMinimal'],
    queryFn: () => base44.entities.Lead.list('-created_date', 200)
  });

  const clearMutation = useMutation({
    mutationFn: async (incidentId) => {
      await base44.entities.FecalIncident.update(incidentId, {
        status: 'cleared',
        clearedAt: new Date().toISOString()
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fecalIncidents'] });
      toast.success('Incident cleared');
    }
  });

  const markDisinfectingMutation = useMutation({
    mutationFn: async (incidentId) => {
      await base44.entities.FecalIncident.update(incidentId, { status: 'disinfecting' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fecalIncidents'] });
      toast.success('Marked as disinfecting');
    }
  });

  const leadMap = Object.fromEntries(leads.map(l => [l.id, l]));

  if (incidents.length === 0) {
    return (
      <Card className="border-green-200">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <CheckCircle2 className="w-4 h-4 text-green-600" /> Safety — No Open Incidents
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-500">All pools are cleared. No active fecal incident reports.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-red-200">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base text-red-700">
          <AlertTriangle className="w-4 h-4" /> Safety Alerts ({incidents.length} open)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {incidents.map(incident => {
          const lead = leadMap[incident.leadId];
          const isClearing = clearMutation.isPending;
          return (
            <div key={incident.id} className="border border-red-200 rounded-lg p-3 bg-red-50 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-sm text-red-900">
                    {lead ? `${lead.firstName} ${lead.lastName || ''}`.trim() : 'Unknown Customer'}
                  </p>
                  {lead?.serviceAddress && <p className="text-xs text-red-700">{lead.serviceAddress}</p>}
                  <p className="text-xs text-gray-500 mt-0.5">
                    Reported: {incident.reportedAt ? format(parseISO(incident.reportedAt), 'MMM d h:mm a') : '—'} ·{' '}
                    Type: <span className="capitalize">{incident.incidentType?.replace(/_/g, ' ')}</span>
                  </p>
                </div>
                <Badge className={incident.status === 'disinfecting' ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800'}>
                  {incident.status}
                </Badge>
              </div>
              <div className="flex gap-2">
                {incident.status === 'open' && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-yellow-700 border-yellow-300 hover:bg-yellow-50"
                    onClick={() => markDisinfectingMutation.mutate(incident.id)}
                    disabled={markDisinfectingMutation.isPending}
                  >
                    Mark Disinfecting
                  </Button>
                )}
                <Button
                  size="sm"
                  className="bg-green-600 hover:bg-green-700 text-white"
                  onClick={() => clearMutation.mutate(incident.id)}
                  disabled={isClearing}
                >
                  {isClearing ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
                  Mark Cleared ✓
                </Button>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}