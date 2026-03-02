import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ChevronDown, Loader2 } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';

const VALID_STAGES = [
  { value: 'new_lead', label: 'New Lead' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'quote_sent', label: 'Quote Sent' },
  { value: 'inspection_scheduled', label: 'Inspection Scheduled' },
  { value: 'inspection_confirmed', label: 'Inspection Confirmed' },
  { value: 'converted', label: 'Converted' },
  { value: 'lost', label: 'Lost' },
];

export default function StageUpdateButton({ leadId, currentStage, onStageUpdated }) {
  const [isLoading, setIsLoading] = useState(false);

  const handleStageChange = async (newStage) => {
    if (newStage === currentStage) {
      return; // No change needed
    }

    setIsLoading(true);
    try {
      const res = await base44.functions.invoke('updateLeadStageV1', {
        leadId,
        newStage,
        context: 'admin-manual',
        allowRegression: false
      });

      const result = res?.data ?? res;
      console.log('[StageUpdateButton] Backend response:', { leadId, newStage, success: result?.success, error: result?.error });

      if (result?.success) {
        toast.success(`Stage updated to ${VALID_STAGES.find(s => s.value === newStage)?.label || newStage}`);
        if (onStageUpdated) {
          onStageUpdated(newStage);
        }
      } else {
        toast.error(result?.error || 'Failed to update stage');
      }
    } catch (err) {
      console.error('[StageUpdateButton] Error:', err);
      toast.error('Failed to update stage');
    } finally {
      setIsLoading(false);
    }
  };

  const currentStageLabel = VALID_STAGES.find(s => s.value === currentStage)?.label || currentStage;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" disabled={isLoading} className="gap-2">
          {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
          {!isLoading && <ChevronDown className="w-4 h-4" />}
          {currentStageLabel}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel>Move to stage</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {VALID_STAGES.map((stage) => (
          <DropdownMenuItem
            key={stage.value}
            onClick={() => handleStageChange(stage.value)}
            disabled={stage.value === currentStage || isLoading}
            className={stage.value === currentStage ? 'opacity-50' : ''}
          >
            {stage.label}
            {stage.value === currentStage && <span className="ml-auto text-xs text-gray-400">current</span>}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}