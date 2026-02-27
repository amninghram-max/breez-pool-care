import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Info } from 'lucide-react';

// Only shows if there's an active freq recommendation that staff has flagged
export default function AdvisoryBanner({ recommendation }) {
  if (!recommendation) return null;
  const showable = recommendation.status === 'contacted' || recommendation.status === 'monitoring';
  if (!showable) return null;

  return (
    <Card className="border-blue-200 bg-blue-50">
      <CardContent className="pt-4 pb-4 flex items-start gap-3">
        <Info className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
        <div>
          <p className="text-sm font-semibold text-blue-900">A note from our team</p>
          <p className="text-sm text-blue-800 mt-0.5">
            We've been keeping a closer eye on your pool's water quality and may be in touch about your service plan. No action needed from you right now.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}