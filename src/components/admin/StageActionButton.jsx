import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { base44 } from '@/api/base44Client';

/**
 * Stage-specific action button with validation gating
 */
export default function StageActionButton({ lead, currentStage, onAction, onValidationError }) {
  const [loading, setLoading] = useState(false);

  // Determine action config first (before any early returns)
  const actionMap = {
    new_lead: {
      label: 'Send Quote',
      handler: 'sendQuote'
    },
    contacted: {
      label: 'Send Inspection Link',
      handler: 'scheduleInspection'
    },
    inspection_confirmed: {
      label: 'Send Acceptance Link',
      handler: 'sendInvite'
    },
    quote_sent: {
      label: 'Resend Acceptance Link',
      handler: 'sendInvite'
    }
  };

  const action = actionMap[currentStage];

  const validateRequired = (fields) => {
    const missing = [];
    fields.forEach(field => {
      if (!lead[field]) missing.push(field);
    });
    return missing;
  };

  const handleClick = async () => {
    if (action.handler === 'sendQuote') {
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
          const newNotes = (lead.notes || '') + `\n[QUOTE_SENT] ${new Date().toISOString()}`;
          onAction('contacted', { notes: newNotes });
          toast.success('Quote sent');
        } else {
          toast.error(res.data?.error || 'Failed to send quote');
        }
      } catch (err) {
        toast.error(err.message);
      } finally {
        setLoading(false);
      }
    } else if (action.handler === 'scheduleInspection') {
      const missing = validateRequired(['serviceAddress', 'mobilePhone']);
      if (missing.length > 0) {
        onValidationError(`Required to schedule: ${missing.map(f => f.replace(/([A-Z])/g, ' $1')).join(', ')}`);
        return;
      }
      onAction('inspection_scheduled', {
        notes: (lead.notes || '') + `\n[INSPECTION_SCHEDULED] ${new Date().toISOString()}`
      });
    } else if (action.handler === 'sendInvite') {
      setLoading(true);
      try {
        const res = await base44.functions.invoke('sendAcceptanceLink', { leadId: lead.id });
        
        if (res.data?.success) {
          const newNotes = (lead.notes || '') + `\n[INVITE_SENT] ${new Date().toISOString()}`;
          onAction('quote_sent', { notes: newNotes });
          toast.success('Invite sent');
        } else {
          toast.error(res.data?.error || 'Failed to send invite');
        }
      } catch (err) {
        toast.error(err.message);
      } finally {
        setLoading(false);
      }
    }
  };

  if (!action) return null;

  return (
    <Button
      size="sm"
      variant="default"
      onClick={handleClick}
      disabled={loading}
      className="gap-2"
    >
      {action.label}
    </Button>
  );
}