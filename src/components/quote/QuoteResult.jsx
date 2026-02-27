import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Check, AlertCircle } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { createPageUrl } from '@/utils';
import { QuoteTrustBadges, QuoteDisclaimer } from './QuoteMicrocopy';

/**
 * QuoteResult — displays quote output.
 * isDemo=true → amber disclaimer + "Convert to Real Quote" CTA
 * isDemo=false → normal CTA to schedule inspection
 */
export default function QuoteResult({ quote, quoteId, expiresAt, formData, isDemo = false, onConvertToReal, onModify }) {
  const { data: user } = useQuery({
    queryKey: ['user'],
    queryFn: async () => { try { return await base44.auth.me(); } catch { return null; } }
  });

  const isStaffOrAdmin = user && ['admin', 'staff'].includes(user.role);
  const [showBreakdown, setShowBreakdown] = React.useState(false);

  const isExpired = expiresAt && new Date(expiresAt) < new Date();
  const expiryDate = expiresAt ? new Date(expiresAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : null;

  const handleScheduleInspection = () => {
    localStorage.setItem('quoteData', JSON.stringify({ quote, quoteId, formData, timestamp: new Date().toISOString() }));
    window.location.href = createPageUrl('Onboarding');
  };

  if (isExpired) {
    return (
      <Card className="bg-amber-50 border-amber-200">
        <CardContent className="pt-6 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0" />
          <div>
            <p className="font-semibold text-amber-900">This quote has expired</p>
            <p className="text-sm text-amber-800 mt-1">Quotes are valid for 14 days. Please generate a new quote for updated pricing.</p>
            <Button className="mt-4 bg-teal-600 hover:bg-teal-700" onClick={() => window.location.reload()}>
              Generate New Quote
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const monthly = quote.estimatedMonthlyPrice ?? quote.finalMonthlyPrice ?? 0;
  const perVisit = quote.estimatedPerVisitPrice ?? 0;
  const oneTime = quote.estimatedOneTimeFees ?? quote.oneTimeFees ?? 0;
  const firstMonth = quote.estimatedFirstMonthTotal ?? 0;

  return (
    <div className="space-y-5">
      {/* Trust + disclaimer */}
      <QuoteTrustBadges />
      <QuoteDisclaimer isDemo={isDemo} />

      {/* Demo banner */}
      {isDemo && (
        <Card className="bg-amber-50 border-amber-300">
          <CardContent className="pt-4 pb-4">
            <p className="text-sm text-amber-800 font-medium mb-3">This is an unofficial estimate. No data has been saved.</p>
            {onConvertToReal && (
              <Button onClick={() => onConvertToReal(formData)} className="bg-amber-600 hover:bg-amber-700 text-white text-sm">
                Convert to Real Quote
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Main pricing card */}
      <Card className="bg-gradient-to-br from-teal-50 to-blue-50 border-teal-200">
        <CardContent className="pt-6 space-y-5">
          <div className="text-center">
            <p className="text-sm text-gray-600 font-medium">Monthly Service</p>
            <p className="text-5xl font-bold text-gray-900 mt-2">${monthly.toFixed(2)}</p>
            <p className="text-sm text-gray-600 mt-1">
              {quote.frequencySelectedOrRequired === 'weekly' ? 'Weekly visits' : 'Twice-weekly visits'}
            </p>
          </div>

          <div className="border-t pt-4 text-center">
            <p className="text-sm text-gray-600">Per Visit</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">${perVisit.toFixed(2)}</p>
          </div>

          {oneTime > 0 && (
            <div className="border-t pt-4 text-center">
              <p className="text-sm text-gray-600">One-Time Setup</p>
              <p className="text-2xl font-bold text-teal-700 mt-1">${oneTime.toFixed(2)}</p>
              <p className="text-xs text-gray-500 mt-1">Water balancing & recovery</p>
            </div>
          )}

          {quote.autopayDiscountAmount > 0 && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-3">
              <p className="text-sm text-green-900">💰 Save ${quote.autopayDiscountAmount}/month with AutoPay</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* What's included */}
      <Card>
        <CardHeader><CardTitle className="text-base">What's Included</CardTitle></CardHeader>
        <CardContent>
          <ul className="space-y-2.5">
            {['All chemicals included', 'Water testing & balancing', 'Brushing & vacuuming', 'Debris removal', 'Skimmer & filter check/cleaning', 'Digital service reports'].map(item => (
              <li key={item} className="flex items-center gap-2.5 text-sm">
                <Check className="w-4 h-4 text-teal-600 flex-shrink-0" />
                <span className="text-gray-700">{item}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {/* CTA */}
      {!isDemo && (
        <Card className="bg-gradient-to-r from-teal-600 to-blue-600 text-white border-0">
          <CardContent className="pt-6 text-center">
            <h3 className="text-xl font-bold mb-1">Ready to get started?</h3>
            <p className="text-teal-100 text-sm mb-5">Schedule your free pool inspection</p>
            <Button onClick={handleScheduleInspection} size="lg" className="bg-white text-teal-600 hover:bg-gray-100 px-8">
              Schedule Free Inspection
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Staff/admin internal breakdown */}
      {isStaffOrAdmin && (
        <Card className="border-amber-200 bg-amber-50">
          <CardHeader>
            <div className="flex justify-between items-center">
              <CardTitle className="text-amber-900 text-sm">Internal Breakdown (Staff/Admin Only)</CardTitle>
              <Button size="sm" variant="outline" onClick={() => setShowBreakdown(v => !v)}>
                {showBreakdown ? 'Hide' : 'Show'}
              </Button>
            </div>
          </CardHeader>
          {showBreakdown && (
            <CardContent className="space-y-3 text-sm">
              <Row label="Size Tier" val={quote.sizeTier?.toUpperCase()} />
              <Row label="Base Monthly" val={`$${quote.baseMonthly?.toFixed(2)}`} />
              {quote.additiveTokensApplied?.length > 0 && (
                <div>
                  <p className="font-semibold text-amber-900 mb-1">Tokens</p>
                  {quote.additiveTokensApplied.map((t, i) => (
                    <Row key={i} label={t.token_name} val={`+$${t.amount.toFixed(2)}`} />
                  ))}
                </div>
              )}
              <Row label="Raw Risk" val={quote.rawRisk?.toFixed(2)} />
              <Row label="Adjusted Risk" val={quote.adjustedRisk?.toFixed(2)} />
              <Row label="Risk Bracket" val={quote.riskBracket} />
              <Row label="Risk Add-on" val={`+$${quote.riskAddonAmount?.toFixed(2)}`} />
              <Row label="Frequency" val={quote.frequencySelectedOrRequired?.replace('_', ' ')} />
              <Row label="Freq. Multiplier" val={`${quote.frequencyMultiplier}x`} />
              {quoteId && <Row label="Quote ID" val={<span className="font-mono text-xs">{quoteId}</span>} />}
              <Row label="Engine" val={<span className="font-mono text-xs">{quote.quoteLogicVersionId}</span>} />
            </CardContent>
          )}
        </Card>
      )}

      <div className="flex gap-3">
        {onModify && (
          <Button variant="outline" className="flex-1" onClick={onModify}>Modify Answers</Button>
        )}
      </div>

      {expiryDate && !isDemo && (
        <p className="text-xs text-gray-400 text-center">Quote valid until {expiryDate}</p>
      )}
    </div>
  );
}

function Row({ label, val }) {
  return (
    <div className="flex justify-between">
      <span className="text-amber-800">{label}:</span>
      <span className="font-bold text-amber-900">{val}</span>
    </div>
  );
}