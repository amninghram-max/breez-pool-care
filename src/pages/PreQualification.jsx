import React, { useState } from 'react';
import QuoteWizard from '../components/quote/QuoteWizard';
import QuoteResult from '../components/quote/QuoteResult';

export default function PreQualification() {
  const [quoteResult, setQuoteResult] = useState(null);
  const [answeredFormData, setAnsweredFormData] = useState(null);

  const handleComplete = (data, formData) => {
    setQuoteResult(data);
    setAnsweredFormData(formData);
  };

  if (quoteResult) {
    return (
      <div className="max-w-2xl mx-auto py-8">
        <QuoteResult
          quote={quoteResult.quote || quoteResult}
          quoteId={quoteResult.quoteId}
          expiresAt={quoteResult.expiresAt}
          formData={answeredFormData}
          isDemo={false}
          onModify={() => setQuoteResult(null)}
        />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto py-8 space-y-4">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Get Your Free Quote</h1>
        <p className="text-gray-600 mt-1">Answer a few quick questions about your pool</p>
      </div>
      <QuoteWizard mode="real" onComplete={handleComplete} />
    </div>
  );
}