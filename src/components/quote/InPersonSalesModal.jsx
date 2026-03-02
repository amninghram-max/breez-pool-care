import React, { useState, useEffect } from 'react';
import { X, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import QuoteWizard from './QuoteWizard';
import { toast } from 'sonner';

/**
 * InPersonSalesModal — Staff in-person sales flow.
 * 
 * Steps:
 * 1. Pricing: QuoteWizard (steps 1-2 from pool questions)
 * 2. Lock Quote: "Lock Quote" button → lockInPersonSalesSessionQuote
 * 3. Convert: Contact form (firstName, email, phone) → convertInPersonSalesSessionToLead
 * 
 * State:
 * - sessionId: created on mount
 * - currentStep: 1=pricing, 2=lock, 3=convert
 * - pricingInputs: from QuoteWizard
 * - quoteSnapshot: from lockInPersonSalesSessionQuote
 * - contactDraft: firstName, email, phone
 */

export default function InPersonSalesModal({ open, onOpenChange }) {
  const [sessionId, setSessionId] = useState(null);
  const [currentStep, setCurrentStep] = useState(1);
  const [pricingInputs, setPricingInputs] = useState(null);
  const [quoteSnapshot, setQuoteSnapshot] = useState(null);
  const [contactDraft, setContactDraft] = useState({ firstName: '', email: '', phone: '' });
  const [activationLink, setActivationLink] = useState(null);
  const [loading, setLoading] = useState(false);

  // ── Create session on modal open ──
  useEffect(() => {
    if (!open || sessionId) return;
    
    const initSession = async () => {
      try {
        setLoading(true);
        const res = await base44.functions.invoke('createInPersonSalesSession', {
          pricingInputs: null
        });
        setSessionId(res.data?.sessionId || res.sessionId);
        setCurrentStep(1);
        setPricingInputs(null);
        setQuoteSnapshot(null);
        setContactDraft({ firstName: '', email: '', phone: '' });
        setActivationLink(null);
      } catch (e) {
        console.error('Failed to create session:', e);
        toast.error('Failed to start in-person flow');
      } finally {
        setLoading(false);
      }
    };

    initSession();
  }, [open, sessionId]);

  // ── Best-effort abandon on close ──
  const handleClose = async () => {
    if (sessionId && open) {
      try {
        await base44.functions.invoke('abandonInPersonSalesSession', { sessionId });
      } catch (e) {
        console.warn('Failed to abandon session on close (best-effort):', e);
      }
    }
    setSessionId(null);
    onOpenChange(false);
  };

  const updateSessionMutation = useMutation({
    mutationFn: async (data) => {
      return await base44.functions.invoke('updateInPersonSalesSession', {
        sessionId,
        ...data
      });
    }
  });

  const lockQuoteMutation = useMutation({
    mutationFn: async () => {
      return await base44.functions.invoke('lockInPersonSalesSessionQuote', {
        sessionId
      });
    },
    onSuccess: (res) => {
      const snapshot = res.data?.quoteSnapshot || res.quoteSnapshot;
      setQuoteSnapshot(snapshot);
      setCurrentStep(3);
      toast.success('Quote locked');
    },
    onError: (err) => {
      toast.error(err.message || 'Failed to lock quote');
    }
  });

  const convertMutation = useMutation({
    mutationFn: async () => {
      return await base44.functions.invoke('convertInPersonSalesSessionToLead', {
        sessionId,
        contact: contactDraft
      });
    },
    onSuccess: (res) => {
      const link = res.data?.activationLink || res.activationLink;
      setActivationLink(link);
      toast.success('Lead created');
    },
    onError: (err) => {
      toast.error(err.message || 'Failed to convert to lead');
    }
  });

  const startNewMutation = useMutation({
    mutationFn: async () => {
      return await base44.functions.invoke('abandonAndCreateNewInPersonSalesSession', {
        sessionId
      });
    },
    onSuccess: (res) => {
      const newId = res.data?.sessionId || res.sessionId;
      setSessionId(newId);
      setCurrentStep(1);
      setPricingInputs(null);
      setQuoteSnapshot(null);
      setContactDraft({ firstName: '', email: '', phone: '' });
      setActivationLink(null);
      toast.success('Started new session');
    },
    onError: (err) => {
      toast.error(err.message || 'Failed to create new session');
    }
  });

  const handleQuoteWizardComplete = async (data, formData) => {
    setPricingInputs(formData);
    try {
      await updateSessionMutation.mutateAsync({
        currentStep: 2,
        pricingInputs: formData
      });
      setCurrentStep(2);
    } catch (e) {
      toast.error('Failed to save pricing inputs');
    }
  };

  const handleLockQuote = () => {
    lockQuoteMutation.mutate();
  };

  const handleConvert = async (e) => {
    e.preventDefault();
    if (!contactDraft.firstName || !contactDraft.email) {
      toast.error('First name and email required');
      return;
    }
    convertMutation.mutate();
  };

  const handleStartNew = () => {
    startNewMutation.mutate();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={handleClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b sticky top-0 bg-white z-10">
          <div>
            <h2 className="text-lg font-bold text-gray-900">In-Person Sales Flow</h2>
            <p className="text-sm text-gray-500">Staff-led quote on-site</p>
          </div>
          <button onClick={handleClose} disabled={loading}><X className="w-5 h-5 text-gray-500" /></button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-teal-600" />
            </div>
          ) : activationLink ? (
            // ── Success: Activation Link ──
            <div className="space-y-4">
              <div className="flex items-start gap-3 bg-green-50 border border-green-200 rounded-lg p-4">
                <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-green-800">
                  <p className="font-semibold mb-2">Lead created successfully!</p>
                  <p className="mb-3">Share this activation link with the customer:</p>
                  <code className="block bg-white p-2 rounded text-xs border border-green-200 mb-3 break-all">
                    {window.location.origin}{activationLink}
                  </code>
                  <Button
                    size="sm"
                    onClick={() => {
                      navigator.clipboard.writeText(`${window.location.origin}${activationLink}`);
                      toast.success('Link copied to clipboard');
                    }}
                    className="bg-green-600 hover:bg-green-700"
                  >
                    Copy Link
                  </Button>
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <Button onClick={handleStartNew} className="flex-1 bg-teal-600 hover:bg-teal-700">
                  Start New Session
                </Button>
                <Button onClick={handleClose} variant="outline" className="flex-1">
                  Close
                </Button>
              </div>
            </div>
          ) : currentStep === 1 ? (
            // ── Step 1: Pricing (QuoteWizard) ──
            <div className="space-y-4">
              <QuoteWizard
                mode="demo"
                initialAnswers={pricingInputs}
                onComplete={handleQuoteWizardComplete}
              />
            </div>
          ) : currentStep === 2 ? (
            // ── Step 2: Lock Quote ──
            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Lock Quote</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm text-gray-600">
                    Once locked, the quote will be finalized and customer pricing cannot be adjusted. Proceed to contact info collection.
                  </p>
                  <div className="flex gap-3">
                    <Button
                      onClick={() => setCurrentStep(1)}
                      variant="outline"
                      className="flex-1"
                      disabled={lockQuoteMutation.isPending}
                    >
                      Back
                    </Button>
                    <Button
                      onClick={handleLockQuote}
                      className="flex-1 bg-teal-600 hover:bg-teal-700"
                      disabled={lockQuoteMutation.isPending}
                    >
                      {lockQuoteMutation.isPending ? (
                        <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Locking...</>
                      ) : (
                        'Lock Quote'
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          ) : (
            // ── Step 3: Convert (Contact Info) ──
            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Customer Information</CardTitle>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleConvert} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>First Name *</Label>
                        <Input
                          value={contactDraft.firstName}
                          onChange={e => setContactDraft(d => ({ ...d, firstName: e.target.value }))}
                          placeholder="John"
                          className="mt-1.5"
                          required
                        />
                      </div>
                      <div>
                        <Label>Email *</Label>
                        <Input
                          type="email"
                          value={contactDraft.email}
                          onChange={e => setContactDraft(d => ({ ...d, email: e.target.value }))}
                          placeholder="john@example.com"
                          className="mt-1.5"
                          required
                        />
                      </div>
                    </div>
                    <div>
                      <Label>Phone (Optional)</Label>
                      <Input
                        type="tel"
                        value={contactDraft.phone}
                        onChange={e => setContactDraft(d => ({ ...d, phone: e.target.value }))}
                        placeholder="(555) 000-0000"
                        className="mt-1.5"
                      />
                    </div>

                    {convertMutation.isError && (
                      <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-800">
                        <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                        {convertMutation.error?.message || 'Failed to convert'}
                      </div>
                    )}

                    <div className="flex gap-3 pt-4 border-t">
                      <Button
                        type="button"
                        onClick={() => setCurrentStep(2)}
                        variant="outline"
                        className="flex-1"
                        disabled={convertMutation.isPending}
                      >
                        Back
                      </Button>
                      <Button
                        type="submit"
                        className="flex-1 bg-teal-600 hover:bg-teal-700"
                        disabled={convertMutation.isPending}
                      >
                        {convertMutation.isPending ? (
                          <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Converting...</>
                        ) : (
                          'Convert to Lead'
                        )}
                      </Button>
                    </div>
                  </form>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}