import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Loader2, AlertCircle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import QuoteResultDisplay from '../components/quote/QuoteResultDisplay';

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

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-3 text-gray-500">
          <Loader2 className="w-8 h-8 animate-spin text-teal-600" />
          <p className="text-sm">Loading quote…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <Card className="max-w-md w-full border-red-200">
          <CardContent className="pt-6 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-gray-900">Quote Unavailable</p>
              <p className="text-sm text-gray-600 mt-1">{error}</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="text-center">
          <img
            src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/699a2b2056054b0207cea969/0b0c31666_Breez2.png"
            alt="Breez Pool Care"
            className="h-12 w-auto mx-auto mb-4"
          />
          <h1 className="text-2xl font-bold text-gray-900">Your Quote</h1>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold text-gray-700">Quote Status</CardTitle>
              <Badge className={STATUS_COLORS[quote.status] || 'bg-gray-100 text-gray-600'}>
                {quote.status}
              </Badge>
            </div>
          </CardHeader>
        </Card>

        {quote.quoteSnapshot ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-semibold text-gray-700">Quote Details</CardTitle>
            </CardHeader>
            <CardContent>
              <pre className="text-xs text-gray-700 bg-gray-50 rounded p-4 overflow-auto whitespace-pre-wrap border border-gray-200">
                {JSON.stringify(quote.quoteSnapshot, null, 2)}
              </pre>
            </CardContent>
          </Card>
        ) : (
          <Card className="border-dashed">
            <CardContent className="pt-6 flex items-center gap-3 text-gray-400">
              <Clock className="w-4 h-4 flex-shrink-0" />
              <p className="text-sm">Quote details will appear here once generated.</p>
            </CardContent>
          </Card>
        )}

        <div className="text-center">
          <Button
            disabled
            className="bg-teal-600 hover:bg-teal-700 text-white opacity-50 cursor-not-allowed"
          >
            Schedule Inspection (Step 2)
          </Button>
          <p className="text-xs text-gray-400 mt-2">Scheduling coming soon.</p>
        </div>
      </div>
    </div>
  );
}