import React, { useState } from 'react';
import { X, CheckCircle } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import QuoteWizard from './QuoteWizard';
import QuoteResult from './QuoteResult';

/**
 * RealQuoteModal — Admin "Start New Quote (Real)" — same canonical flow as public customers.
 * Pool questions first, then contact info. Creates Lead + persists Quote.
 * Optional initialAnswers for "Convert from Demo" pre-fill.
 */
export default function RealQuoteModal({ onClose, initialAnswers = null }) {
  const queryClient = useQueryClient();
  const [quoteData, setQuoteData] = useState(null);
  const [answeredFormData, setAnsweredFormData] = useState(null);
  const [leadCreated, setLeadCreated] = useState(false);

  const createLeadMutation = useMutation({
    mutationFn: async (formData) => {
      const serviceAddress = [formData.clientFirstName].filter(Boolean).join(', ');
      const lead = await base44.entities.Lead.create({
        firstName: formData.clientFirstName,
        lastName: formData.clientLastName,
        email: formData.clientEmail,
        mobilePhone: formData.clientPhone,
        stage: 'new_lead',
        isEligible: true,
        isDeleted: false,
        quoteGenerated: false,
        // Pool info from answers
        poolType: formData.poolType,
        poolSurface: formData.poolType === 'in_ground' ? 'concrete' : 'vinyl',
        filterType: formData.filterType,
        sanitizerType: formData.chlorinationMethod,
        screenedArea: formData.enclosure,
        treesOverhead: formData.treesOverhead || null,
        usageFrequency: formData.useFrequency,
        hasPets: formData.petsAccess || false,
        petSwimFrequency: formData.petSwimFrequency || 'never',
        poolCondition: formData.poolCondition,
        spaPresent: formData.spaPresent
      });
      // Mark lead as having a quote
      await base44.entities.Lead.update(lead.id, { quoteGenerated: true, stage: 'contacted' });
      return lead;
    }
  });

  const handleComplete = async (data, formData) => {
    setAnsweredFormData(formData);
    setQuoteData(data);
    // Create lead from formData
    createLeadMutation.mutate(formData, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['leads'] });
        setLeadCreated(true);
      }
    });
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b sticky top-0 bg-white z-10">
          <div>
            <h2 className="text-lg font-bold text-gray-900">New Quote</h2>
            <p className="text-sm text-gray-500">Real quote — creates lead and persists pricing</p>
          </div>
          <button onClick={onClose}><X className="w-5 h-5 text-gray-500" /></button>
        </div>

        <div className="p-6">
          {!quoteData ? (
            <QuoteWizard mode="real" initialAnswers={initialAnswers} onComplete={handleComplete} />
          ) : (
            <div className="space-y-4">
              {leadCreated && (
                <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-4 py-2 text-sm text-green-800">
                  <CheckCircle className="w-4 h-4" />
                  Lead created and linked to quote.
                </div>
              )}
              <QuoteResult
                quote={quoteData.quote || quoteData}
                quoteId={quoteData.quoteId}
                expiresAt={quoteData.expiresAt}
                formData={answeredFormData}
                isDemo={false}
                onModify={() => setQuoteData(null)}
              />
              <Button onClick={onClose} variant="outline" className="w-full">Close</Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}