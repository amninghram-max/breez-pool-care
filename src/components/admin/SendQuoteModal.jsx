import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AlertCircle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { base44 } from '@/api/base44Client';

const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

// Check if lead has questionnaireData (pool details filled in)
const hasQuestionnaireData = (lead) => {
  const requiredFields = ['poolSize', 'poolType', 'enclosure', 'filterType', 'chlorinationMethod', 'useFrequency', 'poolCondition'];
  return requiredFields.every(f => lead?.[f]);
};

// Extract error message from SDK throws, handling JSON parse failures
const extractErrorMessage = (err, fallback = 'Failed to send quote link email') => {
  // Priority 1: err.response.data (SDK attaches on non-2xx)
  if (err?.response?.data) {
    return typeof err.response.data === 'object' 
      ? JSON.stringify(err.response.data) 
      : String(err.response.data);
  }
  
  // Priority 2: err.data (SDK may attach directly)
  if (err?.data) {
    return typeof err.data === 'object' 
      ? JSON.stringify(err.data) 
      : String(err.data);
  }
  
  // Priority 3: err.message (likely "Unexpected end of JSON input" or other SDK error)
  if (err?.message) {
    return err.message;
  }
  
  // Fallback
  return fallback;
};

export default function SendQuoteModal({ lead, isOpen, onClose, onSuccess }) {
  const [email, setEmail] = useState(lead?.email || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Determine flow: NEW stage sends link only, QUOTED can send pricing if data exists
  const isNewStage = lead?.stage === 'new_lead';
  const hasData = hasQuestionnaireData(lead);

  const handleSendQuoteLink = async () => {
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

      // Send quote link via dedicated function (no quote required)
      const payload = { leadId: lead.id, firstName: lead.firstName, email };
      console.log('📧 Invoking sendQuoteLinkEmail', payload);
      const res = await base44.functions.invoke('sendQuoteLinkEmail', payload);

      if (!res.data?.success) {
        const errMsg = typeof res.data?.error === 'object' 
          ? JSON.stringify(res.data.error)
          : res.data?.error || 'Failed to send quote link';
        throw new Error(errMsg);
      }

      toast.success('Quote link sent');
      onSuccess?.();
      onClose();
    } catch (err) {
      console.error('Send quote link error:', err);
      const errorMsg = extractErrorMessage(err, 'Failed to send quote link email');
      setError(errorMsg);
      toast.error(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  const handleSendPricingEmail = async () => {
    setError('');

    if (!email.trim()) {
      setError('Email is required');
      return;
    }

    if (!isValidEmail(email)) {
      setError('Please enter a valid email address');
      return;
    }

    if (!hasData) {
      setError('Customer must complete quote questions first');
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
        const errorMsg = typeof errorData === 'object' 
          ? JSON.stringify(errorData)
          : errorData?.error || 'Failed to generate quote';
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
        const emailErr = typeof emailRes.data?.error === 'object'
          ? JSON.stringify(emailRes.data.error)
          : emailRes.data?.error || 'Failed to send quote email';
        setError(emailErr);
        toast.error(emailErr);
        return;
      }

      // Log timestamp in notes
      const timestamp = new Date().toISOString();
      const newNotes = (lead.notes || '') + `\n[QUOTE_EMAIL_SENT] ${timestamp}`;
      
      // Update lead notes with timestamp
      await base44.entities.Lead.update(lead.id, {
        notes: newNotes
      });

      toast.success('Quote email sent');
      onSuccess?.();
      onClose();
    } catch (err) {
      console.error('Send quote error:', err);
      const errorMsg = err.response?.data 
        ? (typeof err.response.data === 'object' ? JSON.stringify(err.response.data) : err.response.data)
        : err.message || 'Failed to send quote';
      setError(errorMsg);
      toast.error(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  const handleClick = isNewStage ? handleSendQuoteLink : handleSendPricingEmail;
  const buttonLabel = isNewStage ? 'Send Link' : (hasData ? 'Send Quote' : 'Send Link');

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{isNewStage ? 'Send Quote Link' : 'Send Quote'}</DialogTitle>
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
              {isNewStage 
                ? 'This email will receive the quote wizard link.' 
                : 'This email will receive the quote details + scheduling link.'}
            </p>
          </div>

          {/* Warning: Missing Pool Data */}
          {!isNewStage && !hasData && (
            <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="text-amber-800 font-medium">Pool information incomplete</p>
                <p className="text-amber-700 text-xs mt-1">Customer must complete the quote questions first. Send quote link instead.</p>
              </div>
            </div>
          )}

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
            onClick={handleClick}
            disabled={loading || !email.trim() || (!isNewStage && !hasData && !error)}
            className="bg-teal-600 hover:bg-teal-700"
          >
            {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {loading ? 'Sending...' : buttonLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}