import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import PublicQuoteWizard from '../components/quote/PublicQuoteWizard';
import QuoteWizard from '../components/quote/QuoteWizard';
import QuoteResult from '../components/quote/QuoteResult';
import { base44 } from '@/api/base44Client';
import { AlertCircle, Loader2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export default function PreQualification() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const [debugState, setDebugState] = useState({
    lastFinalizeRequest: null,
    lastFinalizeResponse: null,
    isFinalizing: false,
    finalizeError: null,
    currentStep: 0,
    currentStepName: ''
  });
  
  const [user, setUser] = useState(undefined); // undefined = loading, null = guest
  const [quoteResult, setQuoteResult] = useState(null);
  const [answeredFormData, setAnsweredFormData] = useState(null);
  const [prefillData, setPrefillData] = useState(null); // { email, leadId }
  const [prefillError, setPrefillError] = useState('');
  const [loadingPrefill, setLoadingPrefill] = useState(false);

  useEffect(() => {
    base44.auth.me().then(setUser).catch(() => setUser(null));
  }, []);

  // Load prefill data from token if present
  useEffect(() => {
    if (!token) return;
    
    const loadPrefill = async () => {
      setLoadingPrefill(true);
      try {
        const res = await base44.functions.invoke('getQuoteRequestPublicV1', { token });
        const data = res?.data ?? res;
        if (data?.success === true && data.request) {
          setPrefillData({ 
            email: data.request.email, 
            firstName: data.request.firstName || null,
            leadId: data.request.leadId 
          });
        } else {
          setPrefillError(data?.error || 'Invalid or expired link');
        }
      } catch (err) {
        setPrefillError(err?.message || 'Failed to load quote request');
      } finally {
        setLoadingPrefill(false);
      }
    };
    
    loadPrefill();
  }, [token]);

  const handleComplete = (data, formData) => {
    setQuoteResult(data);
    setAnsweredFormData(formData);
  };

  // Authenticated staff/admin path — use the existing full wizard
  if (user && (user.role === 'admin' || user.role === 'staff')) {
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

  // Token loading state
  if (token && loadingPrefill) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col">
        <header className="bg-white border-b border-gray-100 px-4 py-3 flex items-center justify-between">
          <img
            src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/699a2b2056054b0207cea969/0b0c31666_Breez2.png"
            alt="Breez Pool Care"
            className="h-10 w-auto cursor-pointer"
            onClick={() => navigate('/')}
          />
          <a href="tel:3215243838" className="text-sm text-gray-500 hover:text-gray-700">(321) 524-3838</a>
        </header>
        <div className="flex-1 flex items-center justify-center px-4">
          <div className="flex flex-col items-center gap-3 text-gray-500">
            <Loader2 className="w-8 h-8 animate-spin text-teal-600" />
            <p className="text-sm">Loading your quote request…</p>
          </div>
        </div>
      </div>
    );
  }

  // Token error state
  if (token && prefillError) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col">
        <header className="bg-white border-b border-gray-100 px-4 py-3 flex items-center justify-between">
          <img
            src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/699a2b2056054b0207cea969/0b0c31666_Breez2.png"
            alt="Breez Pool Care"
            className="h-10 w-auto cursor-pointer"
            onClick={() => navigate('/')}
          />
          <a href="tel:3215243838" className="text-sm text-gray-500 hover:text-gray-700">(321) 524-3838</a>
        </header>
        <div className="flex-1 flex items-center justify-center px-4 py-10">
          <Card className="max-w-md w-full border-red-200">
            <CardContent className="pt-6 flex flex-col gap-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-gray-900">Link Invalid or Expired</p>
                  <p className="text-sm text-gray-600 mt-1">{prefillError}</p>
                </div>
              </div>
              <Button
                onClick={() => navigate('/')}
                className="w-full bg-teal-600 hover:bg-teal-700 text-white"
              >
                Request a New Quote Link
              </Button>
            </CardContent>
          </Card>
        </div>
        <footer className="text-center text-xs text-gray-400 py-4 pb-8">
          Breez Pool Care LLC · Melbourne, FL · (321) 524-3838
        </footer>
      </div>
    );
  }

  // Guest / customer path — minimal public wizard
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Simple header */}
      <header className="bg-white border-b border-gray-100 px-4 py-3 flex items-center justify-between">
        <img
          src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/699a2b2056054b0207cea969/0b0c31666_Breez2.png"
          alt="Breez Pool Care"
          className="h-10 w-auto cursor-pointer"
          onClick={() => navigate('/')}
        />
        <a href="tel:3215243838" className="text-sm text-gray-500 hover:text-gray-700">(321) 524-3838</a>
      </header>

      {/* Wizard card */}
      <div className="flex-1 flex items-start justify-center px-4 py-10">
        <div className="w-full max-w-lg bg-white rounded-2xl shadow-lg p-8">
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-gray-900">Get Your Free Instant Quote</h1>
            <p className="text-gray-500 text-sm mt-1">1 question at a time. Takes about 2 minutes.</p>
          </div>
          <PublicQuoteWizard prefillData={prefillData} />
        </div>
      </div>

      <footer className="text-center text-xs text-gray-400 py-4 pb-8">
        Breez Pool Care LLC · Melbourne, FL · (321) 524-3838
      </footer>
    </div>
  );
}