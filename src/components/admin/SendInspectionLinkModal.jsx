import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AlertCircle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { base44 } from '@/api/base44Client';

const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

export default function SendInspectionLinkModal({ lead, isOpen, onClose, onSuccess }) {
  const [email, setEmail] = useState(lead?.email || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSend = async () => {
    setError('');

    // Validate required fields
    if (!lead?.serviceAddress) {
      setError('Address is required to schedule inspection');
      return;
    }
    if (!lead?.mobilePhone) {
      setError('Phone number is required to schedule inspection');
      return;
    }

    if (!email.trim()) {
      setError('Email is required');
      return;
    }

    if (!isValidEmail(email)) {
      setError('Please enter a valid email address');
      return;
    }

    setLoading(true);
    try {
      // Update lead email if changed
      if (email !== lead.email) {
        await base44.entities.Lead.update(lead.id, { email });
      }

      // Trigger inspection scheduling email workflow
      const res = await base44.functions.invoke('sendScheduleNotification', {
        leadId: lead.id,
        email,
        serviceAddress: lead.serviceAddress,
        mobilePhone: lead.mobilePhone
      });

      if (!res.data?.success) {
        throw new Error(res.data?.error || 'Failed to send inspection link');
      }

      // Log timestamp in notes
      const timestamp = new Date().toISOString();
      const newNotes = (lead.notes || '') + `\n[INSPECTION_LINK_SENT] ${timestamp}`;
      
      // Keep QUOTED stage, just log the action
      await base44.entities.Lead.update(lead.id, {
        notes: newNotes
      });

      toast.success('Inspection link sent');
      onSuccess?.();
      onClose();
    } catch (err) {
      console.error('Send inspection link error:', err);
      setError(err.message || 'Failed to send inspection link');
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Check for missing required fields
  const missingFields = [];
  if (!lead?.serviceAddress) missingFields.push('Address');
  if (!lead?.mobilePhone) missingFields.push('Phone');

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Send Inspection Scheduling Link</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Missing Fields Alert */}
          {missingFields.length > 0 && (
            <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="text-amber-800 font-medium">Missing required information:</p>
                <p className="text-amber-700 mt-1">{missingFields.join(', ')}</p>
              </div>
            </div>
          )}

          {/* Lead Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Customer</label>
            <div className="px-3 py-2 bg-gray-50 rounded border border-gray-200 text-sm text-gray-900">
              {lead?.firstName} {lead?.lastName}
            </div>
          </div>

          {/* Email Input */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <Input
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setError('');
              }}
              placeholder="customer@example.com"
              className="w-full"
              disabled={missingFields.length > 0}
            />
            <p className="text-xs text-gray-500 mt-1">
              This email will receive the inspection scheduling link.
            </p>
          </div>

          {/* Error Display */}
          {error && (
            <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
              <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button
            onClick={handleSend}
            disabled={loading || !email.trim() || missingFields.length > 0}
            className="bg-teal-600 hover:bg-teal-700"
          >
            {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {loading ? 'Sending...' : 'Send Link'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}