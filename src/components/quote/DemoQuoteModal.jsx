import React, { useState } from 'react';
import { X } from 'lucide-react';
import QuoteWizard from './QuoteWizard';
import QuoteResult from './QuoteResult';

/**
 * DemoQuoteModal — Admin "Quick Quote (Demo)" mode.
 * No persistence. Shows price + disclaimer + "Convert to Real Quote" button.
 */
export default function DemoQuoteModal({ onClose, onConvertToReal }) {
  const [quoteData, setQuoteData] = useState(null);
  const [answeredFormData, setAnsweredFormData] = useState(null);

  const handleComplete = (data, formData) => {
    setQuoteData(data);
    setAnsweredFormData(formData);
  };

  const handleConvert = (formData) => {
    onClose();
    if (onConvertToReal) onConvertToReal(formData);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b sticky top-0 bg-white z-10">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Quick Demo Quote</h2>
            <p className="text-sm text-amber-700">Unofficial estimate — nothing will be saved</p>
          </div>
          <button onClick={onClose}><X className="w-5 h-5 text-gray-500" /></button>
        </div>
        <div className="p-6">
          {!quoteData ? (
            <QuoteWizard mode="demo" onComplete={handleComplete} />
          ) : (
            <QuoteResult
              quote={quoteData.quote || quoteData}
              quoteId={null}
              expiresAt={null}
              formData={answeredFormData}
              isDemo={true}
              onConvertToReal={handleConvert}
              onModify={() => setQuoteData(null)}
            />
          )}
        </div>
      </div>
    </div>
  );
}