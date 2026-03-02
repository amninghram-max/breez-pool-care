import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { AlertCircle } from 'lucide-react';

const ALERT_TEMPLATES = [
  {
    id: 'green_cloudy',
    label: 'Green / Cloudy Water',
    subject: 'Alert: Pool Water Quality Issue',
    body: 'We detected green or cloudy water in your pool. We recommend immediate treatment. Please let us know if you have any questions.'
  },
  {
    id: 'no_access',
    label: 'No Access / Gate Locked',
    subject: 'Alert: Unable to Access Property',
    body: 'We were unable to access your property today due to a locked gate. Please provide gate code or access instructions so we can complete your service.'
  },
  {
    id: 'payment',
    label: 'Payment Issue',
    subject: 'Alert: Payment Failed',
    body: 'We encountered an issue processing your payment. Please update your payment method to continue service.'
  },
  {
    id: 'equipment',
    label: 'Equipment Issue',
    subject: 'Alert: Equipment Needs Attention',
    body: 'We identified an issue with your pool equipment that may require professional service. Please contact us to discuss options.'
  },
  {
    id: 'general',
    label: 'General Update',
    subject: 'Message from Pool Care Service',
    body: 'Thank you for your continued business. Please let us know if you have any questions or concerns.'
  }
];

export default function SendAlertModal({ leadId, isOpen, onClose, onSuccess }) {
  const queryClient = useQueryClient();
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [editedSubject, setEditedSubject] = useState('');
  const [editedBody, setEditedBody] = useState('');

  const createThreadMutation = useMutation({
    mutationFn: async () => {
      return await base44.entities.MessageThread.create({
        leadId,
        subject: editedSubject,
        category: selectedTemplate?.id || 'general',
        status: 'in_progress',
        lastMessageAt: new Date().toISOString(),
        lastMessageBy: 'staff',
        internalNotes: editedBody
      });
    },
    onSuccess: () => {
      toast.success('Alert created');
      queryClient.invalidateQueries({ queryKey: ['messageThreads', leadId] });
      resetForm();
      onClose();
      onSuccess?.();
    },
    onError: (err) => {
      toast.error(`Failed to create alert: ${err?.message || 'Unknown error'}`);
    }
  });

  const resetForm = () => {
    setSelectedTemplate(null);
    setEditedSubject('');
    setEditedBody('');
  };

  const handleSelectTemplate = (template) => {
    setSelectedTemplate(template);
    setEditedSubject(template.subject);
    setEditedBody(template.body);
  };

  const handleSubmit = () => {
    if (!editedSubject.trim()) {
      toast.error('Subject is required');
      return;
    }
    createThreadMutation.mutate();
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="outline" className="gap-2">
            <AlertCircle className="w-3 h-3" />
            Send Alert
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {ALERT_TEMPLATES.map(template => (
            <DropdownMenuItem key={template.id} onClick={() => handleSelectTemplate(template)}>
              {template.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {selectedTemplate && (
        <Dialog open={!!selectedTemplate} onOpenChange={(open) => !open && resetForm()}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Create Alert</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Subject
                </label>
                <Input
                  value={editedSubject}
                  onChange={(e) => setEditedSubject(e.target.value)}
                  placeholder="Alert subject"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Message
                </label>
                <Textarea
                  value={editedBody}
                  onChange={(e) => setEditedBody(e.target.value)}
                  placeholder="Alert message"
                  rows={4}
                />
              </div>
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => resetForm()}>
                Cancel
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={createThreadMutation.isPending}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {createThreadMutation.isPending ? 'Creating...' : 'Send Alert'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}