import React, { useEffect } from 'react';
import { Calendar, CheckCircle2 } from 'lucide-react';

const TEAL = '#1B9B9F';

export default function QuoteResultDisplay({ result, firstName, email, leadId, quoteToken }) {
  const { isRange, quote, priceSummary: resultPriceSummary } = result;
  // Prefer priceSummary from result, fallback to quote fields
  const priceSummary = resultPriceSummary || {};
  const priceDisplay = priceSummary.monthlyPrice || (
    isRange && quote
      ? `$${quote.minMonthly} – $${quote.maxMonthly}`
      : quote?.finalMonthlyPrice ? `$${quote.finalMonthlyPrice}` : 'Price unavailable'
  );

  const freqLabel = priceSummary.visitFrequency || (quote?.frequency === 'twice_weekly' ? 'Twice Weekly' : 'Weekly');

  const oneTimeDisplay = priceSummary.oneTimeFees || (
    isRange && quote
      ? (quote.minOneTimeFees > 0 ? `$${quote.minOneTimeFees}–$${quote.maxOneTimeFees}` : null)
      : quote?.oneTimeFees > 0 ? `$${quote.oneTimeFees}` : null
  );

  useEffect(() => {
    console.log('[QuoteResultDisplay] Mounted/updated', { firstName, quoteToken, hasPrice: !!priceSummary.monthlyPrice });
  }, [quoteToken]);

  return (
    <div className="space-y-6">
      <div className="text-center">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-full mb-4" style={{ backgroundColor: '#e8f8f9' }}>
          <CheckCircle2 className="w-7 h-7" style={{ color: TEAL }} />
        </div>
        <h2 className="text-2xl font-bold text-gray-900 mb-1">Your Quote is Ready, {firstName}!</h2>
        <p className="text-gray-500 text-sm">A copy has been sent to your email.</p>
      </div>

      {/* Price card */}
      <div className="rounded-2xl border-2 p-6" style={{ borderColor: TEAL, backgroundColor: '#f0fdfd' }}>
        <div className="text-center mb-4">
          <div className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-1">Estimated Monthly Service</div>
          <div className="text-4xl font-bold" style={{ color: TEAL }}>{priceDisplay}<span className="text-lg font-normal text-gray-500">/mo*</span></div>
          {isRange && <div className="text-xs text-gray-400 mt-1">Range reflects pool size uncertainty</div>}
          <div className="mt-2 inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium bg-white border" style={{ borderColor: TEAL, color: TEAL }}>
            {freqLabel} Service
          </div>
          {quote?.frequencyAutoRequired && (
            <p className="text-xs text-amber-600 mt-2">Based on your pool's profile, twice-weekly service is recommended.</p>
          )}
        </div>
        {oneTimeDisplay && (
          <div className="border-t pt-4 text-center">
            <div className="text-xs text-gray-500 uppercase tracking-widest mb-1">One-Time Initial Fee</div>
            <div className="text-xl font-bold text-gray-800">{oneTimeDisplay}</div>
            <div className="text-xs text-gray-400">(Based on current pool condition)</div>
          </div>
        )}
      </div>

      {/* Asterisk note */}
      <p className="text-xs text-gray-400 leading-relaxed text-center px-2">
        *Final pricing is based on confirmation of pool size, condition, and equipment during inspection to ensure accuracy and consistency.
      </p>

      {/* CTA */}
      <div className="space-y-3">
        {!quoteToken ? (
           <div className="rounded-lg bg-red-50 border border-red-200 p-4">
             <p className="text-sm font-semibold text-red-900 mb-2">Quote token missing</p>
             <p className="text-xs text-red-700 mb-3">Cannot proceed without a valid quote reference.</p>
             <button
               type="button"
               onClick={() => window.location.href = '/PreQualification'}
               className="w-full py-2 px-3 rounded-lg text-sm font-medium text-white bg-red-600 hover:bg-red-700 transition-colors"
             >
               Restart Quote
             </button>
           </div>
         ) : (
           <button
             type="button"
             onClick={() => {
               const currentOrigin = window.location.origin;
               const scheduleUrl = `${currentOrigin}/ScheduleInspection?token=${encodeURIComponent(quoteToken)}`;
               console.log('Schedule click', { origin: currentOrigin, token: quoteToken.slice(0, 8), url: scheduleUrl });
               window.location.href = scheduleUrl;
             }}
             className="w-full flex items-center justify-center gap-2 py-4 rounded-xl text-white text-base font-semibold shadow-md hover:shadow-lg transition-all hover:-translate-y-0.5"
             style={{ backgroundColor: TEAL }}
           >
             <Calendar className="w-5 h-5" />
             Schedule Your Free Inspection
           </button>
         )}
        <p className="text-xs text-center text-gray-400">No obligation. Homeowner or designated caretaker must be present.</p>
      </div>
    </div>
  );
}