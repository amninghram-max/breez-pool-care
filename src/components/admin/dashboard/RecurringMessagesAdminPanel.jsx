import React from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { MessageSquare, Trash2, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';

const SCHEDULE_LABELS = {
  next_visit_only: 'Next visit only',
  every_visit: 'Every visit',
  x_weeks: 'Every X weeks',
  x_months: 'Every X months',
};

export default function RecurringMessagesAdminPanel() {
  const queryClient = useQueryClient();

  const { data: messages = [] } = useQuery({
    queryKey: ['allRecurringMessages'],
    queryFn: () => base44.entities.RecurringMessage.filter({ isActive: true }, '-created_date')
  });

  const { data: leads = [] } = useQuery({
    queryKey: ['leadsMinimal'],
    queryFn: () => base44.entities.Lead.list('-created_date', 200)
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.RecurringMessage.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['allRecurringMessages'] });
      toast.success('Message deleted');
    }
  });

  const leadMap = Object.fromEntries(leads.map(l => [l.id, l]));

  if (messages.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <MessageSquare className="w-4 h-4" /> Recurring Messages
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-500">No active recurring messages.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <MessageSquare className="w-4 h-4" /> Recurring Messages ({messages.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 max-h-80 overflow-y-auto">
        {messages.map(msg => {
          const lead = leadMap[msg.leadId];
          return (
            <div key={msg.id} className="flex items-start justify-between gap-3 p-3 rounded-lg border border-gray-100 hover:bg-gray-50">
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-teal-700">
                  {lead ? `${lead.firstName} ${lead.lastName || ''}`.trim() : msg.leadId}
                </p>
                <p className="text-sm text-gray-800 mt-0.5 leading-snug">{msg.message}</p>
                <div className="flex items-center gap-2 mt-1">
                  <Badge className="bg-gray-100 text-gray-600 text-xs font-normal">
                    {SCHEDULE_LABELS[msg.displaySchedule] || msg.displaySchedule}
                    {(msg.displaySchedule === 'x_weeks' || msg.displaySchedule === 'x_months') && msg.scheduleValue
                      ? ` (${msg.scheduleValue})`
                      : ''}
                  </Badge>
                  {msg.createdByName && (
                    <span className="text-xs text-gray-400">by {msg.createdByName}</span>
                  )}
                </div>
              </div>
              <Button
                size="icon"
                variant="ghost"
                className="flex-shrink-0 text-red-400 hover:text-red-600 hover:bg-red-50 h-7 w-7"
                onClick={() => deleteMutation.mutate(msg.id)}
                disabled={deleteMutation.isPending}
              >
                {deleteMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
              </Button>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}