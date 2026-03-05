import React from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function AgreementModal({ agreement, isOpen, onClose }) {
  if (!isOpen || !agreement) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-lg max-w-2xl w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <div>
            <h2 className="text-xl font-bold text-gray-900">{agreement.title}</h2>
            <p className="text-xs text-gray-500 mt-1">Version {agreement.version}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="prose prose-sm prose-gray max-w-none text-gray-700 whitespace-pre-wrap">
            {agreement.text}
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t bg-gray-50 flex justify-end">
          <Button onClick={onClose} className="bg-teal-600 hover:bg-teal-700">
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}