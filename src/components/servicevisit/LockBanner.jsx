import React from 'react';
import { Lock } from 'lucide-react';

export default function LockBanner() {
  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-gray-100 border border-gray-200 rounded-lg text-sm text-gray-600">
      <Lock className="w-4 h-4 flex-shrink-0 text-gray-400" />
      <span>Locked after chemical application for accuracy and audit.</span>
    </div>
  );
}