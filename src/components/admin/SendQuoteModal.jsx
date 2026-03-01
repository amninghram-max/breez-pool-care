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

    // Check if lead has required quote inputs
    const requiredQuoteFields = ['poolSize', 'poolType', 'enclosure', 'filterType', 'chlorinationMethod', 'useFrequency', 'poolCondition'];
    const missingQuoteFields = requiredQuoteFields.filter(f => !lead[f]);

    if (missingQuoteFields.length > 0) {
      setError(`Lead is missing required information: ${missingQuoteFields.join(', ')}. Please complete the quote flow first.`);
      return;
    }

    setLoading(true);
    try {
      // Update lead email if changed
      if (email !== lead.email) {
        await base44.entities.Lead.update(lead.id, { email });
      }

      // Generate quote for this lead using lead pool data
      const quoteRes = await base44.functions.invoke('calculateQuote', {
        questionnaireData: {
          poolSize: lead.poolSize,
          poolType: lead.poolType,
          spaPresent: lead.spaPresent,
          enclosure: lead.screenedArea,
          treesOverhead: lead.treesOverhead,
          filterType: lead.filterType,
          chlorinationMethod: lead.sanitizerType,
          chlorinatorType: lead.tabletFeederType,
          useFrequency: lead.usageFrequency,
          petsAccess: lead.hasPets,
          petSwimFrequency: lead.petSwimFrequency,
          poolCondition: lead.poolCondition,
          clientEmail: email,
          clientFirstName: lead.firstName,
          clientPhone: lead.mobilePhone
        }
      });

      if (quoteRes.status !== 200) {
        const errorData = quoteRes.data;
        const errorMsg = errorData.missingFields 
          ? `Missing pool information: ${errorData.missingFields.join(', ')}. Complete lead details first.`
          : errorData.message || errorData.error || 'Failed to generate quote';
        setError(errorMsg);
        console.error('Quote generation error:', errorData);
        toast.error(errorMsg);
        return;
      }

      if (!quoteRes.data?.quote) {
        setError('Quote generation returned no data');
        console.error('Quote generation returned empty:', quoteRes.data);
        toast.error('Quote generation failed');
        return;
      }

      const quote = quoteRes.data.quote;

      // Send quote email with generated quote
      const emailRes = await base44.functions.invoke('sendQuoteEmail', {
        quote,
        firstName: lead.firstName,
        email
      });

      if (!emailRes.data?.success) {
        const emailErr = emailRes.data?.error || 'Failed to send quote email';
        setError(emailErr);
        toast.error(emailErr);
        return;
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
      const errorMsg = err.response?.data 
        ? JSON.stringify(err.response.data)
        : err.message || 'Failed to send quote';
      setError(errorMsg);
      toast.error(errorMsg);
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