import React, { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Info, X } from 'lucide-react';

// Only shows if there's an active freq recommendation that staff has flagged.
// Dismissal is session-only — no DB writes.
export default function AdvisoryBanner({ recommendation }) {
  const [dismissed, setDismissed] = useState(false);

  if (!recommendation) return null;
  const showable = recommendation.status === 'contacted' || recommendation.status === 'monitoring';
  if (!showable || dismissed) return null;

  return (
    <Card className="border-blue-200 bg-blue-50">
      <CardContent className="pt-4 pb-4 flex items-start gap-3">
        <Info className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
        <div className="flex-1">
          <p className="text-sm font-semibold text-blue-900">A note from our team</p>
          <p className="text-sm text-blue-800 mt-0.5">
            We've been keeping a closer eye on your pool's water quality and may be in touch about your service plan. No action needed from you right now.
          </p>
          <button
            onClick={() => setDismissed(true)}
            className="mt-2 text-xs text-blue-500 hover:text-blue-700 underline underline-offset-2"
          >
            Hide for now
          </button>
        </div>
        <button
          onClick={() => setDismissed(true)}
          className="text-blue-400 hover:text-blue-600 flex-shrink-0"
          aria-label="Dismiss"
        >
          <X className="w-4 h-4" />
        </button>
      </CardContent>
    </Card>
  );
}