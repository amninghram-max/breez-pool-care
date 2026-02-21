import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Copy, Eye, Check } from 'lucide-react';
import { createPageUrl } from '@/utils';
import { Link } from 'react-router-dom';
import RiskScoreBadge from '@/components/RiskScoreBadge';

export default function QuoteResults() {
  const [copied, setCopied] = useState(false);
  const searchParams = new URLSearchParams(window.location.search);
  const quoteId = searchParams.get('quoteId');

  const { data: quote } = useQuery({
    queryKey: ['quote', quoteId],
    queryFn: () => base44.entities.Quote.get(quoteId),
    enabled: !!quoteId,
  });

  const { data: quoteBreakdown } = useQuery({
    queryKey: ['quoteBreakdown', quoteId],
    queryFn: async () => {
      const results = await base44.entities.QuoteBreakdown.filter({ quoteId });
      return results[0];
    },
    enabled: !!quoteId,
  });

  const { data: riskScoreFactors } = useQuery({
    queryKey: ['riskScoreFactors', quoteId],
    queryFn: async () => {
      const results = await base44.entities.RiskScoreFactors.filter({ quoteId });
      return results[0];
    },
    enabled: !!quoteId,
  });

  const handleCopy = (text) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!quote || !quoteBreakdown || !riskScoreFactors) {
    return <div className="p-6 text-center">Loading quote details...</div>;
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-semibold text-gray-900">Your Service Quote</h1>
        <p className="text-gray-600 mt-2">Personalized estimate for your pool</p>
      </div>

      {/* Main Quote Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Monthly Price */}
        <Card className="bg-gradient-to-br from-teal-50 to-cyan-50 border-teal-200">
          <CardContent className="pt-6">
            <p className="text-sm text-teal-700 font-medium mb-1">Estimated Monthly Price</p>
            <p className="text-4xl font-bold text-teal-900">${quote.monthlyBasePrice.toFixed(2)}</p>
            <p className="text-xs text-teal-600 mt-2">Weekly service included</p>
          </CardContent>
        </Card>

        {/* Per-Visit Price */}
        <Card className="bg-gradient-to-br from-sky-50 to-blue-50 border-sky-200">
          <CardContent className="pt-6">
            <p className="text-sm text-sky-700 font-medium mb-1">Per-Visit Price</p>
            <p className="text-4xl font-bold text-sky-900">${quote.perVisitPrice?.toFixed(2) || '—'}</p>
            <p className="text-xs text-sky-600 mt-2">~${(quote.monthlyBasePrice / 4.3).toFixed(2)} (weekly avg)</p>
          </CardContent>
        </Card>

        {/* Startup Add-ons */}
        <Card className={`bg-gradient-to-br ${quoteBreakdown.totalStartupAddOns > 0 ? 'from-orange-50 to-amber-50 border-orange-200' : 'from-gray-50 to-gray-50 border-gray-200'}`}>
          <CardContent className="pt-6">
            <p className="text-sm font-medium mb-1" style={{ color: quoteBreakdown.totalStartupAddOns > 0 ? '#92400e' : '#666' }}>
              One-Time Startup/Add-ons
            </p>
            <p className={`text-4xl font-bold ${quoteBreakdown.totalStartupAddOns > 0 ? 'text-orange-900' : 'text-gray-600'}`}>
              ${quoteBreakdown.totalStartupAddOns.toFixed(2)}
            </p>
            {quoteBreakdown.totalStartupAddOns > 0 && (
              <p className="text-xs text-orange-600 mt-2">First service only</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Risk Score */}
      <Card className="bg-white border-gray-200">
        <CardHeader>
          <CardTitle>Pool Maintenance Risk</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <RiskScoreBadge riskScore={riskScoreFactors.riskScore} riskLevel={riskScoreFactors.riskLevel} />

          {riskScoreFactors.topFiveFactors && riskScoreFactors.topFiveFactors.length > 0 && (
            <div>
              <h4 className="font-semibold text-gray-900 mb-3">Top Risk Factors:</h4>
              <ul className="space-y-2">
                {riskScoreFactors.topFiveFactors.map((factor, idx) => (
                  <li key={idx} className="flex gap-2 text-sm">
                    <span className="font-semibold text-teal-600 flex-shrink-0">{idx + 1}.</span>
                    <span className="text-gray-700">{factor}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Why This Quote? */}
      <Card className="bg-white border-gray-200">
        <CardHeader>
          <CardTitle>Why This Quote?</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-600 mb-4">
            These factors influenced your estimated price:
          </p>
          {quoteBreakdown.topThreeFactors && quoteBreakdown.topThreeFactors.length > 0 ? (
            <div className="space-y-2">
              {quoteBreakdown.topThreeFactors.map((factor, idx) => (
                <div key={idx} className="flex gap-3 p-3 bg-gray-50 rounded-lg">
                  <span className="text-teal-600 font-semibold flex-shrink-0">✓</span>
                  <span className="text-gray-700">{factor}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500">Standard pool conditions</p>
          )}
        </CardContent>
      </Card>

      {/* Pricing Breakdown */}
      {quoteBreakdown.modifiers && quoteBreakdown.modifiers.length > 0 && (
        <Card className="bg-white border-gray-200">
          <CardHeader>
            <CardTitle className="text-lg">Pricing Breakdown</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between text-sm pb-3 border-b">
              <span className="text-gray-600">Base monthly service</span>
              <span className="font-semibold">${quoteBreakdown.baseMonthlyPrice?.toFixed(2) || '—'}</span>
            </div>

            {quoteBreakdown.modifiers.map((mod, idx) => (
              <div key={idx} className="flex justify-between text-sm">
                <span className="text-gray-600">{mod.name}</span>
                <span className="text-gray-900 font-medium">+${mod.amount.toFixed(2)}</span>
              </div>
            ))}

            <div className="flex justify-between text-lg font-bold pt-3 border-t mt-3">
              <span>Total Monthly</span>
              <span className="text-teal-600">${quote.monthlyBasePrice.toFixed(2)}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Startup Add-ons Detail */}
      {quoteBreakdown.startupAddOns && quoteBreakdown.startupAddOns.length > 0 && (
        <Card className="bg-orange-50 border-orange-200">
          <CardHeader>
            <CardTitle className="text-lg text-orange-900">First Service Add-ons</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {quoteBreakdown.startupAddOns.map((addon, idx) => (
              <div key={idx} className="p-3 bg-white rounded-lg border border-orange-100">
                <div className="flex justify-between mb-1">
                  <span className="font-semibold text-gray-900">{addon.name}</span>
                  <span className="font-bold text-orange-700">${addon.amount.toFixed(2)}</span>
                </div>
                <p className="text-xs text-gray-600">{addon.reason}</p>
              </div>
            ))}
            <div className="text-sm text-orange-700 font-semibold pt-2">
              Total one-time: ${quoteBreakdown.totalStartupAddOns.toFixed(2)}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Technician Summary */}
      <Card className="bg-white border-gray-200">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Eye className="w-5 h-5" />
            Technician Summary
          </CardTitle>
          <Button
            size="sm"
            variant="outline"
            onClick={() => window.location.href = createPageUrl(`TechnicianSummary?quoteId=${quoteId}`)}
          >
            View Full Summary
          </Button>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-gray-500 mb-3">Click "View Full Summary" to see detailed technician notes (includes access information)</p>
        </CardContent>
      </Card>

      {/* Next Steps */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="bg-gradient-to-br from-teal-50 to-cyan-50 border-teal-200">
          <CardContent className="pt-6">
            <h3 className="font-semibold text-gray-900 mb-2">Ready to proceed?</h3>
            <p className="text-sm text-gray-600 mb-4">Schedule your first service or accept this quote.</p>
            <Button className="w-full bg-teal-600 hover:bg-teal-700 text-white">
              Schedule Service
            </Button>
          </CardContent>
        </Card>

        <Card className="bg-white border-gray-200">
          <CardContent className="pt-6">
            <h3 className="font-semibold text-gray-900 mb-2">Have questions?</h3>
            <p className="text-sm text-gray-600 mb-4">Contact our team for more details about your quote.</p>
            <Link to={createPageUrl('Home')}>
              <Button variant="outline" className="w-full">
                Go to Home
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}