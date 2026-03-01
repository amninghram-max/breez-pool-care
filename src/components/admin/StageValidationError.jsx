import React from 'react';
import { AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function StageValidationError({ error, onEditInfo }) {
  if (!error) return null;

  return (
    <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 flex items-center justify-between gap-3 text-sm">
      <div className="flex items-center gap-2">
        <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0" />
        <p className="text-red-700">{error}</p>
      </div>
      <Button
        size="sm"
        variant="outline"
        className="text-red-600 border-red-300 hover:bg-red-50"
        onClick={onEditInfo}
      >
        Edit Info
      </Button>
    </div>
  );
}