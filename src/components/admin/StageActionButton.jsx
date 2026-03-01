import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { base44 } from '@/api/base44Client';

/**
 * Stage-specific action button with validation gating
 */
export default function StageActionButton({ lead, currentStage, onAction, onValidationError }) {
  const [loading, setLoading] = useState(false);

  const validateRequired = (fields) => {
    const missing = [];
    fields.forEach(field => {
      if (!lead[field]) missing.push(field);
    });
    return missing;
  };

  const handleSendQuote = async () => {
    const missing = validateRequired(['firstName', 'email']);
    if (missing.length > 0) {
      onValidationError(`Missing: ${missing.map(f => f.replace(/([A-Z])/g, ' $1')).join(', ')}`);
      return;
    }

    setLoading(true);
    try {
      const res = await base44.functions.invoke('sendQuoteEmail', {
        leadId: lead.id,
        firstName: lead.firstName,
        email: lead.email,
        clientPhone: lead.mobilePhone
      });

      if (res.data?.success) {
        // Log timestamp in notes
        const newNotes = (lead.notes || '') + `\n[QUOTE_SENT] ${new Date().toISOString()}`;
        await onAction('quoted', { notes: newNotes });
        toast.success('Quote sent', {
          action: { label: 'Resend', onClick: () => {} }
        });
      } else {
        toast.error(res.data?.error || 'Failed to send quote');
      }
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleScheduleInspection = async () => {
    const missing = validateRequired(['serviceAddress', 'mobilePhone']);
    if (missing.length > 0) {
      onValidationError(`Required to schedule: ${missing.map(f => f.replace(/([A-Z])/g, ' $1')).join(', ')}`);
      return;
    }

    // Open scheduling modal/form
    onAction('inspection_scheduled', {
      notes: (lead.notes || '') + `\n[INSPECTION_SCHEDULED] ${new Date().toISOString()}`
    });
  };

  const handleSendInvite = async () => {
    setLoading(true);
    try {
      // Trigger activation/invite flow
      const res = await base44.functions.invoke('sendAcceptanceLink', { leadId: lead.id });
      
      if (res.data?.success) {
        const newNotes = (lead.notes || '') + `\n[INVITE_SENT] ${new Date().toISOString()}`;
        await onAction('pending', { notes: newNotes });
        toast.success('Invite sent');
      } else {
        toast.error(res.data?.error || 'Failed to send invite');
      }
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  const actionMap = {
    new_lead: {
      label: 'Send Quote',
      onClick: handleSendQuote,
      variant: 'default'
    },
    contacted: {
      label: 'Schedule Inspection',
      onClick: handleScheduleInspection,
      variant: 'default'
    },
    inspection_scheduled: null, // No primary action; see StartInspectionButton
    inspection_confirmed: {
      label: 'Send Invite',
      onClick: handleSendInvite,
      variant: 'default'
    },
    quote_sent: {
      label: 'Schedule Inspection',
      onClick: handleScheduleInspection,
      variant: 'default'
    },
    pending: {
      label: 'Resend Invite',
      onClick: handleSendInvite,
      variant: 'outline'
    },
    converted: null,
    lost: null
  };

  const action = actionMap[currentStage];
  if (!action) return null;

  return (
    <Button
      size="sm"
      variant={action.variant}
      onClick={action.onClick}
      disabled={loading}
      className="gap-2"
    >
      {action.label}
    </Button>
  );
}