import React, { useState, useEffect } from 'react';
import { X, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import QuoteWizard from './QuoteWizard';
import { toast } from 'sonner';

/**
 * InPersonSalesModal — Staff in-person sales flow.
 * 
 * Steps:
 * 1. Pricing: QuoteWizard (pool questions)
 * 2. Lock Quote + Contact: lockInPersonSalesSessionQuote, then collect firstName, email, phone
 * 3. Inspection: Draft notes, photosLinks, eligible flag, needsFollowup flag
 * 4. Convert: convertInPersonSalesSessionToLead using stored contactDraft
 * 
 * State:
 * - sessionId: created on mount
 * - currentStep: 1=pricing, 2=lock+contact, 3=inspection, 4=convert
 * - pricingInputs: from QuoteWizard
 * - quoteSnapshot: from lockInPersonSalesSessionQuote
 * - contactDraft: firstName, email, phone
 * - inspectionDraft: notes, photosLinks, eligible, needsFollowup
 * - quoteLocked: flag to prevent pricing edits after lock
 */

export default function InPersonSalesModal({ open, onOpenChange }) {
  const [sessionId, setSessionId] = useState(null);
  const [currentStep, setCurrentStep] = useState(1);
  const [pricingInputs, setPricingInputs] = useState(null);
  const [estimatePreview, setEstimatePreview] = useState(null);
  const [quoteSnapshot, setQuoteSnapshot] = useState(null);
  const [contactDraft, setContactDraft] = useState({ firstName: '', email: '', phone: '' });
  const [inspectionDraft, setInspectionDraft] = useState({ notes: '', photosLinks: '', eligible: true, needsFollowup: false });
  const [activationLink, setActivationLink] = useState(null);
  const [quoteLocked, setQuoteLocked] = useState(false);
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
        setEstimatePreview(null);
        setQuoteSnapshot(null);
        setContactDraft({ firstName: '', email: '', phone: '' });
        setInspectionDraft({ notes: '', photosLinks: '', eligible: true, needsFollowup: false });
        setActivationLink(null);
        setQuoteLocked(false);
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

  const normalizeSnapshot = (raw) => {
    if (!raw) return null;
    // Verify monthly price exists and is numeric
    const monthlyPrice = raw.finalMonthlyPrice || raw.monthly;
    if (monthlyPrice === undefined || monthlyPrice === null || typeof monthlyPrice !== 'number') {
      console.error('[normalizeSnapshot] Missing or invalid monthly price:', { keys: Object.keys(raw), monthly: monthlyPrice });
      return null;
    }
    return raw;
  };

  const lockQuoteMutation = useMutation({
    mutationFn: async () => {
      return await base44.functions.invoke('lockInPersonSalesSessionQuote', {
        sessionId
      });
    },
    onSuccess: (res) => {
      // Log raw response shape (no PII)
      console.log('[lockQuoteMutation] Raw response keys:', Object.keys(res.data || res));

      // Extract snapshot deterministically
      let snapshot = res.data?.quoteSnapshot || res.quoteSnapshot;
      if (!snapshot) {
        console.error('[lockQuoteMutation] No quoteSnapshot in response');
        toast.error('Lock returned no pricing data');
        return;
      }

      // Normalize to ensure valid monthly price
      snapshot = normalizeSnapshot(snapshot);
      if (!snapshot) {
        console.error('[lockQuoteMutation] Snapshot normalization failed');
        toast.error('Lock returned no monthly price');
        // Keep estimatePreview displayed
        return;
      }

      console.log('[lockQuoteMutation] Locked successfully:', { monthly: snapshot.finalMonthlyPrice || snapshot.monthly });
      setQuoteSnapshot(snapshot);
      setQuoteLocked(true);
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
      setEstimatePreview(null);
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
    
    // Estimate mode: store normalized estimate and advance to lock step
    if (!data.raw) {
      // Already normalized (from estimate path)
      console.log('[InPersonSalesModal] Estimate completed, advancing to lock step', { monthly: data.monthly });
      setEstimatePreview(data);
      
      try {
        // Best-effort: store estimate in session draftData
        await updateSessionMutation.mutateAsync({
          currentStep: 2,
          pricingInputs: formData
        });
      } catch (e) {
        console.warn('Failed to update session (best-effort):', e);
      }
      setCurrentStep(2);
      return;
    }

    // Persist mode: advance normally
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

  const handleSaveContactInfo = async () => {
    // Only persist if at least one field is non-empty
    if (!contactDraft.firstName && !contactDraft.email && !contactDraft.phone) {
      toast.info('Please enter at least one contact field');
      return;
    }
    try {
      await updateSessionMutation.mutateAsync({
        contactDraft
      });
      toast.success('Contact info saved');
    } catch (e) {
      toast.error('Failed to save contact info');
    }
  };

  const handleContinueToConvert = async () => {
    try {
      await updateSessionMutation.mutateAsync({
        currentStep: 4,
        inspectionDraft
      });
      setCurrentStep(4);
    } catch (e) {
      toast.error('Failed to save inspection data');
    }
  };

  const handleConvert = async (e) => {
    if (e && e.preventDefault) e.preventDefault();

    // At Step 4, firstName and email are required; save if needed then convert
    if (!contactDraft.firstName || !contactDraft.email) {
      toast.error('First name and email are required to convert');
      return;
    }

    // Save contact info if not yet persisted
    if (contactDraft.firstName || contactDraft.email || contactDraft.phone) {
      try {
        await updateSessionMutation.mutateAsync({
          contactDraft
        });
      } catch (err) {
        toast.error('Failed to save contact info');
        return;
      }
    }

    convertMutation.mutate();
  };

  const handleStartNew = () => {
    startNewMutation.mutate();
  };

  const handleBackToPricing = () => {
    if (quoteLocked) {
      toast.info('Quote is locked. Pricing cannot be edited.');
      return;
    }
    setCurrentStep(1);
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
            <>
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
              </>
              ) : currentStep === 1 ? (
            // ── Step 1: Pricing (QuoteWizard) ──
            <div className="space-y-4">
              <QuoteWizard
                persistQuote={false}
                initialAnswers={pricingInputs}
                onComplete={handleQuoteWizardComplete}
              />
              <div className="flex gap-3 pt-2 border-t">
                <Button
                  onClick={() => setCurrentStep(4)}
                  variant="outline"
                  className="flex-1 text-teal-600 border-teal-600 hover:bg-teal-50"
                >
                  Convert Now
                </Button>
              </div>
            </div>
          ) : currentStep === 2 ? (
           // ── Step 2: Lock Quote ──
           <div className="space-y-4">
             {quoteSnapshot ? (
               // ── Already locked: show locked summary ──
               <>
                 <Card>
                   <CardHeader>
                     <CardTitle>Locked Quote Summary</CardTitle>
                   </CardHeader>
                   <CardContent className="space-y-4">
                     <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                       <p className="text-sm text-green-700 mb-2">Monthly: <strong>${(quoteSnapshot.finalMonthlyPrice || quoteSnapshot.monthly || 0).toFixed(2)}</strong></p>
                       {quoteSnapshot.estimatedPerVisitPrice && (
                         <p className="text-sm text-green-700">Per visit: ${quoteSnapshot.estimatedPerVisitPrice.toFixed(2)}</p>
                       )}
                       {quoteSnapshot.estimatedOneTimeFees && quoteSnapshot.estimatedOneTimeFees > 0 && (
                         <p className="text-sm text-green-700">One-time fees: ${quoteSnapshot.estimatedOneTimeFees.toFixed(2)}</p>
                       )}
                     </div>
                     <div className="flex gap-3 pt-4 border-t">
                       <Button onClick={() => setCurrentStep(3)} className="flex-1 bg-teal-600 hover:bg-teal-700">
                         Continue to Inspection
                       </Button>
                       <Button onClick={() => setCurrentStep(4)} variant="outline" className="flex-1 text-teal-600 border-teal-600 hover:bg-teal-50">
                         Convert Now
                       </Button>
                     </div>
                   </CardContent>
                 </Card>

                 <Card>
                   <CardHeader>
                     <CardTitle className="text-base">Add Contact Info (Optional)</CardTitle>
                   </CardHeader>
                   <CardContent className="space-y-4">
                     <div className="grid grid-cols-2 gap-4">
                       <div>
                         <Label>First Name</Label>
                         <Input
                           value={contactDraft.firstName}
                           onChange={e => setContactDraft(d => ({ ...d, firstName: e.target.value }))}
                           placeholder="John"
                           className="mt-1.5"
                         />
                       </div>
                       <div>
                         <Label>Email</Label>
                         <Input
                           type="email"
                           value={contactDraft.email}
                           onChange={e => setContactDraft(d => ({ ...d, email: e.target.value }))}
                           placeholder="john@example.com"
                           className="mt-1.5"
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
                     {(contactDraft.firstName || contactDraft.email || contactDraft.phone) && (
                       <Button
                         type="button"
                         onClick={handleSaveContactInfo}
                         disabled={updateSessionMutation.isPending}
                         className="w-full bg-gray-200 hover:bg-gray-300 text-gray-800"
                         size="sm"
                       >
                         {updateSessionMutation.isPending ? (
                           <><Loader2 className="w-3 h-3 mr-2 animate-spin" />Saving...</>
                         ) : (
                           'Save Contact Info'
                         )}
                       </Button>
                     )}
                   </CardContent>
                 </Card>
               </>
             ) : estimatePreview ? (
               // ── Estimate preview: show and allow locking ──
               <>
                 <Card>
                   <CardHeader>
                     <CardTitle>Estimate Preview</CardTitle>
                   </CardHeader>
                   <CardContent className="space-y-4">
                     <div className="bg-teal-50 border border-teal-200 rounded-lg p-4">
                       <p className="text-sm text-teal-700 mb-2">Monthly: <strong>${(estimatePreview.monthly || 0).toFixed(2)}</strong></p>
                       {estimatePreview.perVisit && (
                         <p className="text-sm text-teal-700">Per visit: ${estimatePreview.perVisit.toFixed(2)}</p>
                       )}
                       {estimatePreview.oneTime && estimatePreview.oneTime > 0 && (
                         <p className="text-sm text-teal-700">One-time fees: ${estimatePreview.oneTime.toFixed(2)}</p>
                       )}
                     </div>
                     <p className="text-xs text-gray-600">
                       Lock this estimate to proceed through inspection. You can edit contact information anytime.
                     </p>
                     <div className="flex gap-3">
                       <Button
                         onClick={handleBackToPricing}
                         variant="outline"
                         className="flex-1"
                         disabled={lockQuoteMutation.isPending}
                       >
                         Back
                       </Button>
                       <Button
                         onClick={() => setCurrentStep(4)}
                         variant="outline"
                         className="flex-1 text-teal-600 border-teal-600 hover:bg-teal-50"
                         disabled={lockQuoteMutation.isPending}
                       >
                         Convert Now
                       </Button>
                       <Button
                         onClick={handleLockQuote}
                         className="flex-1 bg-teal-600 hover:bg-teal-700"
                         disabled={lockQuoteMutation.isPending}
                       >
                         {lockQuoteMutation.isPending ? (
                           <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Locking...</>
                         ) : (
                           'Lock Estimate'
                         )}
                       </Button>
                     </div>
                   </CardContent>
                 </Card>
               </>
             ) : (
               // ── No estimate yet ──
               <Card>
                 <CardHeader>
                   <CardTitle>No Estimate Yet</CardTitle>
                 </CardHeader>
                 <CardContent className="space-y-4">
                   <p className="text-sm text-gray-600">
                     Please go back and generate an estimate first.
                   </p>
                   <Button
                     onClick={handleBackToPricing}
                     variant="outline"
                     className="w-full"
                   >
                     Back to Pricing
                   </Button>
                 </CardContent>
               </Card>
             )}
           </div>
          ) : currentStep === 3 ? (
            // ── Step 3: Inspection ──
            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Inspection Details</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label>Notes</Label>
                    <Textarea
                      value={inspectionDraft.notes}
                      onChange={e => setInspectionDraft(d => ({ ...d, notes: e.target.value }))}
                      placeholder="Inspection observations..."
                      className="mt-1.5 h-20"
                    />
                  </div>
                  <div>
                    <Label>Photo Links (comma-separated, optional)</Label>
                    <Input
                      value={inspectionDraft.photosLinks}
                      onChange={e => setInspectionDraft(d => ({ ...d, photosLinks: e.target.value }))}
                      placeholder="https://example.com/photo1.jpg, https://example.com/photo2.jpg"
                      className="mt-1.5"
                    />
                  </div>
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="eligible"
                        checked={inspectionDraft.eligible}
                        onCheckedChange={v => setInspectionDraft(d => ({ ...d, eligible: v }))}
                      />
                      <Label htmlFor="eligible" className="cursor-pointer font-normal">
                        Property is eligible for service
                      </Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="followup"
                        checked={inspectionDraft.needsFollowup}
                        onCheckedChange={v => setInspectionDraft(d => ({ ...d, needsFollowup: v }))}
                      />
                      <Label htmlFor="followup" className="cursor-pointer font-normal">
                        Needs follow-up
                      </Label>
                    </div>
                  </div>
                  <div className="flex gap-3 pt-4 border-t">
                    <Button
                      onClick={() => setCurrentStep(2)}
                      variant="outline"
                      className="flex-1"
                      disabled={updateSessionMutation.isPending}
                    >
                      Back
                    </Button>
                    <Button
                      onClick={() => setCurrentStep(4)}
                      variant="outline"
                      className="flex-1 text-teal-600 border-teal-600 hover:bg-teal-50"
                      disabled={updateSessionMutation.isPending}
                    >
                      Convert Now
                    </Button>
                    <Button
                      onClick={handleContinueToConvert}
                      disabled={updateSessionMutation.isPending}
                      className="flex-1 bg-teal-600 hover:bg-teal-700"
                    >
                      {updateSessionMutation.isPending ? (
                        <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving...</>
                      ) : (
                        'Continue to Convert'
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          ) : currentStep === 4 ? (
            // ── Step 4: Convert ──
            <div className="space-y-4">
              {contactDraft.firstName && contactDraft.email ? (
                // Contact info already provided
                <Card>
                  <CardHeader>
                    <CardTitle>Review & Convert</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="bg-gray-50 p-4 rounded-lg space-y-2 text-sm">
                      <p><strong>Name:</strong> {contactDraft.firstName}</p>
                      <p><strong>Email:</strong> {contactDraft.email}</p>
                      {contactDraft.phone && <p><strong>Phone:</strong> {contactDraft.phone}</p>}
                    </div>

                    {convertMutation.isError && (
                      <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-800">
                        <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                        {convertMutation.error?.message || 'Failed to convert'}
                      </div>
                    )}

                    <div className="flex gap-3 pt-4 border-t">
                      <Button
                        onClick={() => setCurrentStep(3)}
                        variant="outline"
                        className="flex-1"
                        disabled={convertMutation.isPending}
                      >
                        Back
                      </Button>
                      <Button
                        onClick={handleConvert}
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
                  </CardContent>
                </Card>
              ) : (
                // Require contact info at conversion
                <Card>
                  <CardHeader>
                    <CardTitle>Customer Information Required</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <p className="text-sm text-gray-600">
                      To convert this session to a lead, we need the customer's contact information.
                    </p>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>First Name *</Label>
                        <Input
                          value={contactDraft.firstName}
                          onChange={e => setContactDraft(d => ({ ...d, firstName: e.target.value }))}
                          placeholder="John"
                          className="mt-1.5"
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
                        onClick={() => setCurrentStep(3)}
                        variant="outline"
                        className="flex-1"
                        disabled={convertMutation.isPending}
                      >
                        Back
                      </Button>
                      <Button
                        onClick={handleConvert}
                        disabled={!contactDraft.firstName || !contactDraft.email || convertMutation.isPending}
                        className="flex-1 bg-teal-600 hover:bg-teal-700"
                      >
                        {convertMutation.isPending ? (
                          <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Converting...</>
                        ) : (
                          'Convert to Lead'
                        )}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
            ) : null}
            </div>
            </div>
            </div>
            );
            }