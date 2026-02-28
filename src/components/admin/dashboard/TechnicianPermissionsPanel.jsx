import React from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Shield, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export default function TechnicianPermissionsPanel() {
  const queryClient = useQueryClient();

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['staffUsers'],
    queryFn: () => base44.entities.User.filter({ role: 'technician' })
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ userId, canFinalize }) => {
      await base44.entities.User.update(userId, { canFinalizeInspections: canFinalize });
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['staffUsers'] });
      toast.success(vars.canFinalize ? 'Inspection finalizer enabled' : 'Inspection finalizer revoked');
    }
  });

  if (isLoading) return null;
  if (users.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Shield className="w-4 h-4" /> Technician Permissions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-500">No technician accounts found.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Shield className="w-4 h-4" /> Technician Permissions
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {users.map(user => (
          <div key={user.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
            <div>
              <p className="text-sm font-medium text-gray-900">{user.full_name}</p>
              <p className="text-xs text-gray-400">{user.email}</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">Inspection Finalizer</span>
              {toggleMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
              ) : (
                <Switch
                  checked={!!user.canFinalizeInspections}
                  onCheckedChange={(checked) =>
                    toggleMutation.mutate({ userId: user.id, canFinalize: checked })
                  }
                />
              )}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}