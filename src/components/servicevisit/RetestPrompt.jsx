import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { AlertCircle } from 'lucide-react';

export default function RetestPrompt({ isOpen, onClose, onSelect, reason, isDismissed }) {
  const [dontAskAgain, setDontAskAgain] = useState(false);

  const handleSelect = (minutes) => {
    onSelect(minutes, dontAskAgain);
  };

  if (isDismissed) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <div className="flex items-start gap-2">
            <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <DialogTitle>Set a retest reminder?</DialogTitle>
          </div>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-sm text-gray-700">
            {reason}
          </p>

          <div className="grid grid-cols-3 gap-2">
            <Button
              onClick={() => handleSelect(30)}
              variant="outline"
              className="text-sm"
            >
              30 min
            </Button>
            <Button
              onClick={() => handleSelect(60)}
              variant="outline"
              className="text-sm bg-blue-50 border-blue-300 hover:bg-blue-100"
            >
              60 min
            </Button>
            <Button
              onClick={() => handleSelect(90)}
              variant="outline"
              className="text-sm"
            >
              90 min
            </Button>
          </div>

          <Button
            onClick={() => handleSelect(null)}
            variant="ghost"
            className="w-full text-sm text-gray-600"
          >
            Not needed
          </Button>

          <label className="flex items-center gap-2 pt-2 border-t">
            <Checkbox
              checked={dontAskAgain}
              onCheckedChange={setDontAskAgain}
            />
            <span className="text-xs text-gray-600">Don't ask again this visit</span>
          </label>
        </div>
      </DialogContent>
    </Dialog>
  );
}