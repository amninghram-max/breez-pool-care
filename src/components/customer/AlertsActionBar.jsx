import React from 'react';
import { base44 } from '@/api/base44Client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { AlertTriangle } from 'lucide-react';

export default function AlertsActionBar({ leadId, user }) {
  const queryClient = useQueryClient();
  const isAdminOrStaff = user && ['admin', 'staff'].includes(user.role);

  const createFecalMutation = useMutation({
    mutationFn: async () => {
      return await base44.entities.FecalIncident.create({
        leadId,
        status: 'open',
        reportedAt: new Date().toISOString(),
        reportedBy: user.email
      });
    },
    onSuccess: () => {
      toast.success('Fecal incident reported');
      queryClient.invalidateQueries({ queryKey: ['fecalIncidents', leadId] });
    },
    onError: (err) => {
      toast.error(`Failed to create incident: ${err?.message || 'Unknown error'}`);
    }
  });

  if (!isAdminOrStaff) {
    return null;
  }

  return (
    <div className="flex gap-2">
      <Button
        size="sm"
        variant="outline"
        className="gap-2 border-red-200 hover:bg-red-50"
        onClick={() => createFecalMutation.mutate()}
        disabled={createFecalMutation.isPending}
      >
        <AlertTriangle className="w-3 h-3 text-red-600" />
        {createFecalMutation.isPending ? 'Reporting...' : 'Report Fecal Incident'}
      </Button>
    </div>
  );
}