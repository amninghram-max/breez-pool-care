import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { AlertCircle, Phone, MessageSquare } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';

const REASON_OPTIONS = [
  { key: 'dog_present', label: 'Dog present' },
  { key: 'gate_locked', label: 'Gate locked' },
  { key: 'denied_guard_shack', label: 'Denied at guard shack' },
  { key: 'no_answer', label: 'No answer at door' },
  { key: 'other', label: 'Other access issue' },
];

export default function AccessIssueModal({ isOpen, onClose, eventId, lead, user, onAccessIssueConfirmed }) {
  const [selectedReason, setSelectedReason] = useState(null);
  const [calledCustomer, setCalledCustomer] = useState(false);
  const [textedCustomer, setTextedCustomer] = useState(false);

  const techName = user?.full_name || 'Technician';
  const reasonLabel = REASON_OPTIONS.find(r => r.key === selectedReason)?.label || '';

  const confirmMutation = useMutation({
    mutationFn: async () => {
      console.log('[AccessIssueModal] confirm attempt', {
        eventId,
        reason: selectedReason,
        calledCustomer,
        textedCustomer,
      });

      await base44.functions.invoke('updateEventStatus', {
        eventId,
        status: 'could_not_access',
        couldNotAccessReason: reasonLabel,
        sendNotification: false,
      });
    },
    onSuccess: () => {
      console.log('[AccessIssueModal] confirm success, routing to access_wait', { eventId, reason: selectedReason, reasonLabel });
      onAccessIssueConfirmed({ accessIssueReason: reasonLabel });
    },
    onError: (error) => {
      console.error('[AccessIssueModal] confirm failed', { error: error?.message });
    },
  });

  const canConfirm = selectedReason && calledCustomer && textedCustomer;

  const messagePreview = selectedReason
    ? `Hi, this is ${techName} from Breez. I'm unable to access your pool today due to ${reasonLabel.toLowerCase()}. I'll wait 10 minutes for your reply before rescheduling to tomorrow. Please reply if you can help me access the property.`
    : '';

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Could Not Access Pool</DialogTitle>
          <DialogDescription>
            Select the reason for access issue and confirm contact attempts
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Reason selection */}
          <div>
            <p className="text-sm font-semibold text-gray-900 mb-3">Select Reason for Access Issue</p>
            <div className="space-y-2">
              {REASON_OPTIONS.map((option) => (
                <button
                  key={option.key}
                  onClick={() => setSelectedReason(option.key)}
                  className={`w-full text-left px-4 py-3 rounded-lg border-2 transition-all ${
                    selectedReason === option.key
                      ? 'border-teal-600 bg-teal-50'
                      : 'border-gray-200 bg-white hover:border-gray-300'
                  }`}
                >
                  <p className="font-medium text-gray-900">{option.label}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Contact attempt checkboxes */}
          <div>
            <p className="text-sm font-semibold text-gray-900 mb-3">
              Contact Attempts <span className="text-red-600">*</span>
            </p>
            <p className="text-xs text-gray-600 mb-3">Both attempts must be made before proceeding</p>
            <div className="space-y-3">
              <label className="flex items-center gap-3 cursor-pointer p-3 rounded-lg border border-gray-200 hover:bg-gray-50">
                <input
                  type="checkbox"
                  checked={calledCustomer}
                  onChange={(e) => setCalledCustomer(e.target.checked)}
                  className="w-5 h-5 rounded accent-teal-600"
                />
                <Phone className="w-4 h-4 text-gray-600 flex-shrink-0" />
                <span className="text-sm text-gray-900 font-medium">Attempted to call customer</span>
              </label>

              <label className="flex items-center gap-3 cursor-pointer p-3 rounded-lg border border-gray-200 hover:bg-gray-50">
                <input
                  type="checkbox"
                  checked={textedCustomer}
                  onChange={(e) => setTextedCustomer(e.target.checked)}
                  className="w-5 h-5 rounded accent-teal-600"
                />
                <MessageSquare className="w-4 h-4 text-gray-600 flex-shrink-0" />
                <span className="text-sm text-gray-900 font-medium">Attempted to text customer</span>
              </label>
            </div>
          </div>

          {/* Text message preview */}
          {messagePreview && (
            <Card className="border-blue-200 bg-blue-50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-blue-900">Message Preview</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-blue-900 leading-relaxed">{messagePreview}</p>
                <p className="text-xs text-blue-700 mt-2">
                  ✓ This message describes the access issue and your wait window
                </p>
              </CardContent>
            </Card>
          )}

          {/* Confirmation action */}
          <div className="space-y-3">
            {confirmMutation.isError && (
              <div className="flex items-start gap-2 text-sm text-red-700 bg-red-50 p-3 rounded-lg border border-red-200">
                <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <p>{confirmMutation.error?.message || 'Failed to mark access issue'}</p>
              </div>
            )}

            <Button
              onClick={() => confirmMutation.mutate()}
              disabled={!canConfirm || confirmMutation.isPending}
              className="w-full bg-teal-600 hover:bg-teal-700 h-11 text-base"
            >
              {confirmMutation.isPending
                ? 'Marking access issue...'
                : 'Mark Could Not Access'}
            </Button>

            <Button
              onClick={onClose}
              variant="outline"
              className="w-full h-10"
              disabled={confirmMutation.isPending}
            >
              Cancel
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}