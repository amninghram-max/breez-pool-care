/**
 * Route: /q/:quoteToken
 *
 * Base44 flat-pages cannot register /q/:quoteToken via filename alone.
 * This page reads the token directly from window.location.pathname
 * so that /q/SOMETOKEN works without relying on useParams().
 */
import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Loader2, AlertCircle, Clock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const STATUS_COLORS = {
  SENT: 'bg-blue-100 text-blue-800',
  VIEWED: 'bg-yellow-100 text-yellow-800',
  SCHEDULED: 'bg-purple-100 text-purple-800',
  INSPECTED: 'bg-orange-100 text-orange-800',
  ACCEPTED: 'bg-green-100 text-green-800',
  EXPIRED: 'bg-gray-100 text-gray-600',
};

function getTokenFromPath() {
  // Matches /q/<token> — token is everything after the second slash segment
  const match = window.location.pathname.match(/\/q\/(.+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

export default function QRoute() {
  const quoteToken = getTokenFromPath();
  const [state, setState] = useState({ loading: true, error: null, quote: null });

  useEffect(() => {
    if (!quoteToken) {
      setState({ loading: false, error: 'No quote token provided.', quote: null });
      return;
    }

    const load = async () => {
      try {
        const res = await base44.functions.invoke('getQuotePublicV1', { quoteToken });
        const data = res?.data ?? res;
        if (data?.success === true) {
          setState({ loading: false, error: null, quote: data.quote });
        } else {
          setState({ loading: false, error: data?.error || 'Failed to load quote.', quote: null });
        }
      } catch (err) {
        setState({ loading: false, error: err?.message || 'Failed to load quote.', quote: null });
      }
    };

    load();
  }, [quoteToken]);

  if (state.loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-3 text-gray-500">
          <Loader2 className="w-8 h-8 animate-spin text-teal-600" />
          <p className="text-sm">Loading quote…</p>
        </div>
      </div>
    );
  }

  if (state.error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <Card className="max-w-md w-full border-red-200">
          <CardContent className="pt-6 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-gray-900">Quote Unavailable</p>
              <p className="text-sm text-gray-600 mt-1">{state.error}</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { quote } = state;

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