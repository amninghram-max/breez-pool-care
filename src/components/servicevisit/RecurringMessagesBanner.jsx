import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { MessageSquare, ChevronDown, ChevronUp, Plus, Trash2, X } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { differenceInWeeks, differenceInMonths, parseISO } from 'date-fns';

function shouldShow(msg) {
  if (!msg.isActive) return false;
  if (msg.displaySchedule === 'every_visit') return true;
  if (msg.displaySchedule === 'next_visit_only') return true; // will be deactivated after visit
  if (msg.displaySchedule === 'x_weeks' && msg.scheduleValue) {
    if (!msg.lastShownAt) return true;
    return differenceInWeeks(new Date(), parseISO(msg.lastShownAt)) >= msg.scheduleValue;
  }
  if (msg.displaySchedule === 'x_months' && msg.scheduleValue) {
    if (!msg.lastShownAt) return true;
    return differenceInMonths(new Date(), parseISO(msg.lastShownAt)) >= msg.scheduleValue;
  }
  return false;
}

const SCHEDULE_LABELS = {
  next_visit_only: 'Next visit only',
  every_visit: 'Every visit',
  x_weeks: 'Every X weeks',
  x_months: 'Every X months',
};

export default function RecurringMessagesBanner({ leadId, user }) {
  const [expanded, setExpanded] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [newMsg, setNewMsg] = useState({ message: '', displaySchedule: 'every_visit', scheduleValue: 2 });
  const queryClient = useQueryClient();

  const { data: allMessages = [] } = useQuery({
    queryKey: ['recurringMessages', leadId],
    queryFn: () => base44.entities.RecurringMessage.filter({ leadId, isActive: true }),
    enabled: !!leadId,
  });

  const visible = allMessages.filter(shouldShow);

  const addMutation = useMutation({
    mutationFn: () => base44.entities.RecurringMessage.create({
      leadId,
      message: newMsg.message.trim(),
      displaySchedule: newMsg.displaySchedule,
      scheduleValue: ['x_weeks', 'x_months'].includes(newMsg.displaySchedule) ? newMsg.scheduleValue : undefined,
      createdByUserId: user?.id,
      createdByName: user?.full_name,
      isActive: true,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recurringMessages', leadId] });
      setNewMsg({ message: '', displaySchedule: 'every_visit', scheduleValue: 2 });
      setShowAdd(false);
      toast.success('Message added');
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.RecurringMessage.update(id, { isActive: false }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recurringMessages', leadId] });
      toast.success('Message removed');
    }
  });

  if (visible.length === 0 && !expanded) {
    return (
      <div className="flex items-center justify-between px-1">
        <span className="text-xs text-gray-400">No recurring messages</span>
        <button
          className="text-xs text-teal-600 underline underline-offset-2 flex items-center gap-1"
          onClick={() => { setExpanded(true); setShowAdd(true); }}
        >
          <Plus className="w-3 h-3" /> Add
        </button>
      </div>
    );
  }

  return (
    <Card className="border-purple-100 bg-purple-50">
      <CardContent className="pt-3 pb-3 space-y-2">
        <button
          className="w-full flex items-center justify-between"
          onClick={() => setExpanded(v => !v)}
        >
          <div className="flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-purple-600" />
            <span className="text-sm font-semibold text-purple-800">
              Recurring Messages ({visible.length})
            </span>
          </div>
          {expanded ? <ChevronUp className="w-4 h-4 text-purple-400" /> : <ChevronDown className="w-4 h-4 text-purple-400" />}
        </button>

        {/* Always show messages — collapsed shows preview */}
        {!expanded && visible.length > 0 && (
          <p className="text-sm text-purple-700 leading-snug pl-6">{visible[0].message}</p>
        )}

        {expanded && (
          <div className="space-y-2 pt-1">
            {visible.map(msg => (
              <div key={msg.id} className="flex items-start justify-between gap-2 bg-white rounded-lg border border-purple-100 p-2.5">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-800 leading-snug">{msg.message}</p>
                  <p className="text-xs text-gray-400 mt-1">{SCHEDULE_LABELS[msg.displaySchedule] || msg.displaySchedule}{msg.scheduleValue ? ` (${msg.scheduleValue})` : ''} · by {msg.createdByName || 'staff'}</p>
                </div>
                <button
                  onClick={() => deleteMutation.mutate(msg.id)}
                  className="text-gray-300 hover:text-red-400 flex-shrink-0 mt-0.5"
                  disabled={deleteMutation.isPending}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}

            {/* Add new message */}
            {showAdd ? (
              <div className="bg-white rounded-lg border border-purple-200 p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-gray-700">New Recurring Message</p>
                  <button onClick={() => setShowAdd(false)} className="text-gray-400 hover:text-gray-600"><X className="w-3.5 h-3.5" /></button>
                </div>
                <Textarea
                  placeholder="Message for technician at this stop…"
                  value={newMsg.message}
                  onChange={e => setNewMsg(p => ({ ...p, message: e.target.value }))}
                  rows={2}
                  className="text-sm"
                />
                <div className="flex gap-2">
                  <div className="flex-1">
                    <Label className="text-xs text-gray-600">Schedule</Label>
                    <Select value={newMsg.displaySchedule} onValueChange={v => setNewMsg(p => ({ ...p, displaySchedule: v }))}>
                      <SelectTrigger className="mt-1 h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="next_visit_only">Next visit only</SelectItem>
                        <SelectItem value="every_visit">Every visit</SelectItem>
                        <SelectItem value="x_weeks">Every X weeks</SelectItem>
                        <SelectItem value="x_months">Every X months</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {['x_weeks', 'x_months'].includes(newMsg.displaySchedule) && (
                    <div className="w-20">
                      <Label className="text-xs text-gray-600">Count</Label>
                      <Input
                        type="number"
                        min={1}
                        max={24}
                        value={newMsg.scheduleValue}
                        onChange={e => setNewMsg(p => ({ ...p, scheduleValue: parseInt(e.target.value) || 1 }))}
                        className="mt-1 h-8 text-xs"
                      />
                    </div>
                  )}
                </div>
                <Button
                  size="sm"
                  className="w-full bg-purple-600 hover:bg-purple-700 h-8 text-xs"
                  disabled={!newMsg.message.trim() || addMutation.isPending}
                  onClick={() => addMutation.mutate()}
                >
                  Save Message
                </Button>
              </div>
            ) : (
              <button
                className="text-xs text-teal-600 underline underline-offset-2 flex items-center gap-1 pl-1"
                onClick={() => setShowAdd(true)}
              >
                <Plus className="w-3 h-3" /> Add message
              </button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}