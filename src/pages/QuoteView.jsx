import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Loader2, AlertCircle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import QuoteResultDisplay from '../components/quote/QuoteResultDisplay.jsx';

const TEAL = '#1B9B9F';

function resolveToken(paramsToken) {
  if (paramsToken && paramsToken.trim()) return paramsToken.trim();
  // Fallback: parse /QuoteView/<token> from pathname
  const match = window.location.pathname.match(/\/QuoteView\/([^/?#]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

export default function QuoteView() {
  const navigate = useNavigate();
  const params = useParams();
  // Resolve once at mount — stored in a ref so it never changes and doesn't cause re-renders
  const quoteToken = useRef(resolveToken(params?.quoteToken)).current;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [quote, setQuote] = useState(null);

  useEffect(() => {
    if (!quoteToken) {
      setError('Missing quote token.');
      setLoading(false);
      return;
    }

    let cancelled = false;

    const load = async () => {
      try {
        const res = await base44.functions.invoke('getQuotePublicV1', { quoteToken });
        if (cancelled) return;
        const data = res?.data ?? res;
        if (data?.success === true) {
          setQuote(data.quote);
        } else {
          setError(data?.error || 'Failed to load quote.');
        }
      } catch (err) {
        if (!cancelled) setError(err?.message || 'Failed to load quote.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();

    return () => { cancelled = true; };
  }, [quoteToken]); // stable ref value — fires exactly once

  // Loading state
  if (loading) {
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
            <Loader2 className="w-8 h-8 animate-spin" style={{ color: TEAL }} />
            <p className="text-sm">Loading quote…</p>
          </div>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
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
                  <p className="font-semibold text-gray-900">Quote Unavailable</p>
                  <p className="text-sm text-gray-600 mt-1">{error}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // Render full quote result using unified component
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
      <div className="flex-1 flex items-start justify-center px-4 py-10">
        <div className="w-full max-w-lg bg-white rounded-2xl shadow-lg p-8">
          <QuoteResultDisplay
            result={{ quote: quote.quoteSnapshot, priceSummary: quote.quoteSnapshot }}
            firstName={quote.clientFirstName || 'Guest'}
            email={quote.clientEmail}
            leadId={quote.leadId}
            quoteToken={quoteToken}
          />
        </div>
      </div>
      <footer className="text-center text-xs text-gray-400 py-4 pb-8">
        Breez Pool Care LLC · Melbourne, FL · (321) 524-3838
      </footer>
    </div>
  );
}