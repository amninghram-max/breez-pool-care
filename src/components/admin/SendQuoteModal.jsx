import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AlertCircle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { base44 } from '@/api/base44Client';

const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

export default function SendQuoteModal({ lead, isOpen, onClose, onSuccess }) {
  const [email, setEmail] = useState(lead?.email || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSend = async () => {
    setError('');

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

      // Trigger quote email workflow
      const res = await base44.functions.invoke('sendQuoteEmail', {
        leadId: lead.id,
        email
      });

      if (!res.data?.success) {
        throw new Error(res.data?.error || 'Failed to send quote');
      }

      // Log timestamp in notes
      const timestamp = new Date().toISOString();
      const newNotes = (lead.notes || '') + `\n[QUOTE_EMAIL_SENT] ${timestamp}`;
      
      // Update lead to QUOTED stage with timestamp
      await base44.entities.Lead.update(lead.id, {
        stage: 'quoted',
        notes: newNotes,
        quoteEmailSent: true
      });

      toast.success('Quote email sent');
      onSuccess?.();
      onClose();
    } catch (err) {
      console.error('Send quote error:', err);
      setError(err.message || 'Failed to send quote');
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Send Quote</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
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
            />
            <p className="text-xs text-gray-500 mt-1">
              This email will receive the quote + scheduling link.
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
            disabled={loading || !email.trim()}
            className="bg-teal-600 hover:bg-teal-700"
          >
            {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {loading ? 'Sending...' : 'Send Quote'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}