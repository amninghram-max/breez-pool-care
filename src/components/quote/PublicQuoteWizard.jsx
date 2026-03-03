import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { ChevronLeft, Loader2, Calendar, CheckCircle2, AlertCircle } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import PublicScheduler from './PublicScheduler';
import QuoteResultDisplay from './QuoteResultDisplay';

const TEAL = '#1B9B9F';

// ── Step definitions ──────────────────────────────────────────────────────────

const POOL_TYPE_OPTIONS = [
  { value: 'in_ground_concrete', label: 'In-Ground Concrete/Plaster', sub: 'Concrete or plaster pool' },
  { value: 'fiberglass',         label: 'Fiberglass', sub: 'Fiberglass pool' },
  { value: 'vinyl',              label: 'Vinyl Liner', sub: 'Vinyl liner pool' },
  { value: 'above_ground',       label: 'Above-Ground', sub: 'Above-ground pool' },
  { value: 'unknown',            label: 'Not Sure', sub: "We'll assess at inspection" },
];

const POOL_SIZE_OPTIONS = [
  { value: 'under_10k', label: 'Under 10,000 gal', sub: 'Small pool' },
  { value: '10_15k',    label: '10,000 – 15,000 gal', sub: 'Standard' },
  { value: '15_20k',    label: '15,000 – 20,000 gal', sub: 'Medium' },
  { value: '20_30k',    label: '20,000 – 30,000 gal', sub: 'Large' },
  { value: '30k_plus',  label: 'Over 30,000 gal', sub: 'Very large' },
  { value: 'not_sure',  label: 'Not Sure', sub: "We'll figure it out at inspection" },
];

const ENCLOSURE_OPTIONS = [
  { value: 'fully_screened', label: 'Screened Enclosure', sub: 'Pool cage or fully enclosed lanai' },
  { value: 'unscreened',     label: 'Unscreened / Open Air', sub: 'No enclosure or partial coverage' },
];

const FILTER_TYPE_OPTIONS = [
  { value: 'cartridge', label: 'Cartridge', sub: 'Cartridge filter system' },
  { value: 'sand',      label: 'Sand',      sub: 'Sand filter system' },
  { value: 'de',        label: 'DE (Diatomaceous Earth)', sub: 'DE filter system' },
  { value: 'unknown',   label: 'Not Sure',  sub: "We'll determine at inspection" },
];

const CHLORINATION_OPTIONS = [
  { value: 'saltwater',    label: 'Saltwater System', sub: 'Salt chlorine generator' },
  { value: 'traditional',  label: 'Traditional Chlorine', sub: 'Tablets, liquid, or inline feeder' },
  { value: 'not_sure',     label: 'Not Sure', sub: "We'll assess at inspection" },
];

const FREQUENCY_OPTIONS = [
  { value: 'rarely',       label: 'Rarely', sub: 'A few times a season' },
  { value: 'weekends',     label: 'Weekends', sub: 'Primarily Sat/Sun' },
  { value: 'several_week', label: 'Several Times a Week', sub: '3–4 days/week' },
  { value: 'daily',        label: 'Daily', sub: 'Almost every day' },
];

const TREES_OPTIONS = [
  { value: 'yes', label: 'Yes', sub: 'Trees hang over or near the pool' },
  { value: 'no',  label: 'No',  sub: 'No trees overhead' },
];

const PETS_OPTIONS = [
  { value: true,  label: 'Yes', sub: 'Pets swim or access the pool area' },
  { value: false, label: 'No',  sub: 'No pets in the pool area' },
];

const CONDITION_OPTIONS = [
  { value: 'clear',          label: 'Clear & Balanced', sub: 'Water looks great' },
  { value: 'slightly_cloudy', label: 'Slightly Cloudy',  sub: 'Mild haze or cloudiness' },
  { value: 'green',          label: 'Green',             sub: 'Algae visible, water is green' },
  { value: 'dark_algae',     label: 'Dark / Heavy Algae', sub: 'Black or very thick algae growth' },
];

// ── Option card ──────────────────────────────────────────────────────────────

function OptionCard({ option, selected, onSelect }) {
  const isSelected = selected === option.value;
  return (
    <button
      onClick={() => onSelect(option.value)}
      className={`w-full text-left px-5 py-4 rounded-xl border-2 transition-all ${
        isSelected ? 'shadow-md' : 'border-gray-200 hover:border-gray-300 hover:shadow-sm'
      }`}
      style={isSelected ? { borderColor: TEAL, backgroundColor: '#f0fdfd' } : {}}
    >
      <div className="font-semibold text-gray-900">{option.label}</div>
      {option.sub && <div className="text-sm text-gray-500 mt-0.5">{option.sub}</div>}
    </button>
  );
}

// ── Progress bar ─────────────────────────────────────────────────────────────

function ProgressBar({ current, total }) {
  const pct = Math.round((current / total) * 100);
  return (
    <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
      <div
        className="h-full rounded-full transition-all duration-500"
        style={{ width: `${pct}%`, backgroundColor: TEAL }}
      />
    </div>
  );
}

// ── Quote result display (now in QuoteResultDisplay.jsx) ──────────────────

// ── Thank you (not ready) ─────────────────────────────────────────────────────

function ThankYouDisplay({ firstName, email, leadId, quoteToken }) {
  return (
    <div className="space-y-6 text-center">
      <div className="inline-flex items-center justify-center w-14 h-14 rounded-full mb-2" style={{ backgroundColor: '#e8f8f9' }}>
        <CheckCircle2 className="w-7 h-7" style={{ color: TEAL }} />
      </div>
      <div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Thanks, {firstName}!</h2>
        <p className="text-gray-500 leading-relaxed max-w-sm mx-auto">
          We've received your information and will send your personalized quote shortly. No action needed on your end.
        </p>
      </div>
      <div className="space-y-3">
        <button
          type="button"
          onClick={() => {
            const schedulingUrl = `/ScheduleInspection?token=${encodeURIComponent(quoteToken || '')}`;
            console.log('[ThankYouDisplay] Navigating to scheduling:', { quoteToken, schedulingUrl });
            window.location.href = schedulingUrl;
          }}
          className="w-full flex items-center justify-center gap-2 py-4 rounded-xl text-white text-base font-semibold shadow-md hover:shadow-lg transition-all"
          style={{ backgroundColor: TEAL }}
        >
          <Calendar className="w-5 h-5" />
          Schedule Your Free Inspection
        </button>
        <p className="text-xs text-gray-400">No obligation. We'll confirm your quote before the visit.</p>
      </div>
    </div>
  );
}

// ── Main wizard ───────────────────────────────────────────────────────────────

export default function PublicQuoteWizard({ 
  prefillData,
  finalizing,
  setFinalizing,
  finalizeState,
  setFinalizeState,
  finalizeError,
  setFinalizeError,
  lastFinalizeRequest,
  setLastFinalizeRequest,
  lastFinalizeResponse,
  setLastFinalizeResponse,
  finishClickedAt,
  setFinishClickedAt
}) {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState({});
  const [firstName, setFirstName] = useState(prefillData?.firstName || '');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null); // { releaseReady, quote?, isRange?, priceSummary? }
  const [error, setError] = useState('');

  // Determine steps dynamically (trees only shown if unscreened, contact skipped if token present)
  const showTrees = answers.enclosure === 'unscreened';
  const hasToken = prefillData?.token;
  const [disqualified, setDisqualified] = useState(null); // null, 'pool_type', 'filter_type'

  const baseSteps = [
    'poolType',
    'poolSize',
    'enclosure',
    'filterType',
    'chlorinationMethod',
    'useFrequency',
    ...(showTrees ? ['treesOverhead'] : []),
    'petsAccess',
    'poolCondition',
    'contact',
  ];

  const totalSteps = baseSteps.length;
  const currentKey = baseSteps[step];



  const goBack = () => setStep(s => Math.max(0, s - 1));

  const handleSelect = (key, value) => {
    // Check for pool type disqualification (non-concrete/plaster)
    if (key === 'poolType' && ['fiberglass', 'vinyl', 'above_ground'].includes(value)) {
      setDisqualified('pool_type');
      return;
    }
    // Check for filter type disqualification (DE filters)
    if (key === 'filterType' && value === 'de') {
      setDisqualified('filter_type');
      return;
    }

    const newAnswers = { ...answers, [key]: value };
    // Clear trees if switching to screened
    if (key === 'enclosure' && value !== 'unscreened') delete newAnswers.treesOverhead;
    setAnswers(newAnswers);
    // Auto-advance or auto-submit if already on last step
    setTimeout(() => {
      const nextStepNum = Math.min(totalSteps - 1, step + 1);
      if (nextStepNum === step && hasToken) {
        // Already on last step and token present: auto-submit
        handleSubmit();
      } else if (nextStepNum === step) {
        // Already on last step without token: do nothing (contact form will handle submit)
      } else {
        // Advance to next step
        setStep(nextStepNum);
      }
    }, 120);
  };

  const handleSubmit = async (e) => {
    if (e?.preventDefault) e.preventDefault();
    console.log('DEBUG: Finish clicked');

    setError('');

    // Use resolved data from prefillData if token present, otherwise use form input
    const finalFirstName = hasToken ? (prefillData?.firstName || firstName) : firstName;
    const finalEmail = hasToken ? (prefillData?.email || email) : email;

    // VALIDATION: Show inline error and stay on page
    const missingFields = [];
    if (!finalFirstName.trim()) missingFields.push('first name');
    if (!finalEmail.trim() || !finalEmail.includes('@') || finalEmail.trim() === 'guest@breezpoolcare.com') missingFields.push('email');
    
    if (missingFields.length > 0) {
      const fieldText = missingFields.length === 1 ? missingFields[0] : missingFields.join(' and ');
      setError(`Please enter your ${fieldText}.`);
      return;
    }

    // MILESTONE: clicked
    setFinalizeState('clicked');
    setFinishClickedAt(new Date().toLocaleTimeString());
    setFinalizeError(null);
    setLastFinalizeRequest(null);
    setLastFinalizeResponse(null);
    setResult(null);
    setFinalizing(true);

    // MILESTONE: starting
    setFinalizeState('starting');

    try {

      // BUILD PAYLOAD
      const payload = {
        questionnaireData: {
          ...answers,
          clientFirstName: finalFirstName.trim(),
          clientEmail: finalEmail.trim().toLowerCase(),
          petsAccess: answers.petsAccess === true,
        }
      };
      console.log('DEBUG: Finish payload', payload);

      // Validate payload has no invalid dates
      const hasInvalidDates = Object.values(payload.questionnaireData || {}).some(
        v => v instanceof Date && !Number.isFinite(v.getTime())
      );
      if (hasInvalidDates) {
        setFinalizeError('Invalid data in form. Please refresh and try again.');
        setFinalizeState('done_error');
        setFinalizing(false);
        return;
      }

      setLastFinalizeRequest(payload);

      // MILESTONE: invoking
      setFinalizeState('invoking');

      // STEP 1: Call publicGetQuote
      const res = await base44.functions.invoke('publicGetQuote', payload);
      const data = res?.data ?? res;
      console.log('DEBUG: publicGetQuote raw response', res);
      console.log('DEBUG: publicGetQuote parsed data', data);

      if (data?.success !== true) {
        setFinalizeError(data?.error || 'Failed to generate quote. Please try again.');
        setLastFinalizeResponse(data);
        setFinalizeState('done_error');
        setFinalizing(false);
        return;
      }

      // STEP 2: If releaseReady with quote, persist to V2
      if (data?.releaseReady && data?.quote) {
        const finalizePayload = {
          token: prefillData?.token || null,
          prequalAnswers: answers,
          clientFirstName: finalFirstName.trim(),
          clientLastName: answers.lastName?.trim() || null,
          clientEmail: finalEmail.trim().toLowerCase()
        };
        console.log('DEBUG: Calling finalizePrequalQuoteV2 with', finalizePayload);
        setLastFinalizeRequest(finalizePayload);

        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Finalize request timed out (15s)')), 15000);
        });

        const finalizeRes = await Promise.race([
          base44.functions.invoke('finalizePrequalQuoteV2', finalizePayload),
          timeoutPromise
        ]);
        console.log('DEBUG: Finalize raw response', finalizeRes);
        const finalizeData = finalizeRes?.data ?? finalizeRes;
        console.log('DEBUG: Finalize parsed data', finalizeData);
        setLastFinalizeResponse(finalizeData);

        // MILESTONE: response_received
        setFinalizeState('response_received');

        if (finalizeData?.success === true && finalizeData?.priceSummary) {
          const normalizedResult = {
            ...data,
            quote: finalizeData.quoteSnapshot || data.quote,
            priceSummary: finalizeData.priceSummary,
          };
          console.log('DEBUG: Setting result after finalize success', normalizedResult);
          setResult(normalizedResult);
          setFinalizeState('done_success');
        } else {
          const errorMsg = `${finalizeData?.error || 'Failed to finalize quote'} (${finalizeData?.build || 'unknown'})`;
          console.log('DEBUG: Finalize failed', errorMsg);
          setFinalizeError(errorMsg);
          setResult({ error: errorMsg });
          setFinalizeState('done_error');
        }
      } else if (data?.releaseReady) {
        console.log('DEBUG: releaseReady but no quote, showing ThankYou');
        setLastFinalizeResponse(data);
        setFinalizeState('done_success');
        setResult(data);
      } else {
        console.log('DEBUG: Not ready, showing ThankYou');
        setLastFinalizeResponse(data);
        setFinalizeState('done_success');
        setResult(data);
      }
    } catch (err) {
      const errorMsg = err?.message || 'Something went wrong. Please try again or call us at (321) 524-3838.';
      console.log('DEBUG: Outer catch error', errorMsg);
      setFinalizeError(errorMsg);
      setResult({ error: errorMsg });
      setFinalizeState('done_error');
    } finally {
      setFinalizing(false);
    }
  };

  // ── Render disqualification ──
  if (disqualified === 'pool_type') {
    return (
      <div className="space-y-6 text-center">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-full" style={{ backgroundColor: '#fef3c7' }}>
          <AlertCircle className="w-7 h-7 text-amber-600" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">We Don't Service This Pool Type</h2>
          <p className="text-gray-600 leading-relaxed max-w-sm mx-auto">
            Breez currently services in-ground concrete and plaster pools only. We're unable to service fiberglass, vinyl liner, or above-ground pools at this time.
          </p>
        </div>
        <p className="text-xs text-gray-400">
          Have questions? Call us at (321) 524-3838
        </p>
      </div>
    );
  }

  if (disqualified === 'filter_type') {
    return (
      <div className="space-y-6 text-center">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-full" style={{ backgroundColor: '#fef3c7' }}>
          <AlertCircle className="w-7 h-7 text-amber-600" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">We Don't Service DE Filters</h2>
          <p className="text-gray-600 leading-relaxed max-w-sm mx-auto">
            Breez specializes in saltwater and traditional chlorine systems. We're unable to service pools with diatomaceous earth (DE) filters.
          </p>
        </div>
        <p className="text-xs text-gray-400">
          Have questions? Call us at (321) 524-3838
        </p>
      </div>
    );
  }

  // ── Render finalize error ──
  if (finalizeError) {
    return (
      <div className="space-y-4 text-center">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-red-100">
          <AlertCircle className="w-6 h-6 text-red-600" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-gray-900">Unable to Complete Quote</h2>
          <p className="text-sm text-gray-600 mt-1">{finalizeError}</p>
        </div>
        <button
          onClick={() => { setStep(0); setFinalizeError(''); setResult(null); }}
          className="w-full py-3 px-4 rounded-xl text-white text-sm font-semibold"
          style={{ backgroundColor: TEAL }}
        >
          Start Over
        </button>
        <p className="text-xs text-gray-400">Support: (321) 524-3838</p>
      </div>
    );
  }

  // ── Render result or error ──
  if (result) {
    console.log('DEBUG: Completion Decision', {
      result,
      hasPriceSummary: !!result?.priceSummary,
      hasQuote: !!result?.quote,
      finalMonthly: result?.quote?.finalMonthlyPrice,
      isRange: result?.isRange
    });

    if (result.error) {
      return (
        <div className="space-y-4 text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-red-100">
            <AlertCircle className="w-6 h-6 text-red-600" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-gray-900">Something Went Wrong</h2>
            <p className="text-sm text-gray-600 mt-1">{result.error}</p>
          </div>
          <button
            onClick={() => { setStep(0); setResult(null); setFinalizeError(''); }}
            className="w-full py-3 px-4 rounded-xl text-white text-sm font-semibold"
            style={{ backgroundColor: TEAL }}
          >
            Start Over
          </button>
          <p className="text-xs text-gray-400">Support: (321) 524-3838</p>
        </div>
      );
    }

    if (result.releaseReady && result.priceSummary) {
      const displayFirstName = hasToken ? (prefillData?.firstName || firstName) : firstName;
      const displayEmail = hasToken ? (prefillData?.email || email) : email;
      return <QuoteResultDisplay result={result} firstName={displayFirstName} email={displayEmail} leadId={result.leadId} quoteToken={result.quoteToken} />;
    }
    if (result.releaseReady) {
      // Should not happen with finalization, but fallback
      const displayFirstName = hasToken ? (prefillData?.firstName || firstName) : firstName;
      const displayEmail = hasToken ? (prefillData?.email || email) : email;
      return <QuoteResultDisplay result={result} firstName={displayFirstName} email={displayEmail} leadId={result.leadId} quoteToken={result.quoteToken} />;
    }
    const displayFirstName = hasToken ? (prefillData?.firstName || firstName) : firstName;
    const displayEmail = hasToken ? (prefillData?.email || email) : email;
    return <ThankYouDisplay firstName={displayFirstName} email={displayEmail} leadId={result.leadId} quoteToken={result.quoteToken} />;
  }

  // If finalizing, show loading state
  if (finalizing) {
    return (
      <div className="space-y-4 text-center">
        <Loader2 className="w-8 h-8 animate-spin mx-auto" style={{ color: TEAL }} />
        <p className="text-gray-600 text-sm">Generating your quote...</p>
      </div>
    );
  }

  // Validation errors are shown inline — do NOT show the full error page for them

  // ── Step renderers ──
  const stepConfig = {
    poolType: {
      title: 'What type of pool do you have?',
      sub: 'Helps us understand your pool\'s construction and service requirements.',
      render: () => (
        <div className="space-y-3">
          {POOL_TYPE_OPTIONS.map(o => (
            <OptionCard key={o.value} option={o} selected={answers.poolType} onSelect={v => handleSelect('poolType', v)} />
          ))}
        </div>
      )
    },
    poolSize: {
      title: 'How big is your pool?',
      sub: 'This helps us calculate your base service price.',
      render: () => (
        <div className="space-y-3">
          {POOL_SIZE_OPTIONS.map(o => (
            <OptionCard key={o.value} option={o} selected={answers.poolSize} onSelect={v => handleSelect('poolSize', v)} />
          ))}
        </div>
      )
    },
    enclosure: {
      title: 'Is your pool screened?',
      sub: 'Pool enclosures affect debris load and service needs.',
      render: () => (
        <div className="space-y-3">
          {ENCLOSURE_OPTIONS.map(o => (
            <OptionCard key={o.value} option={o} selected={answers.enclosure} onSelect={v => handleSelect('enclosure', v)} />
          ))}
        </div>
      )
    },
    filterType: {
      title: 'What type of filter does your pool have?',
      sub: 'Helps us understand your pool\'s equipment and service needs.',
      render: () => (
        <div className="space-y-3">
          {FILTER_TYPE_OPTIONS.map(o => (
            <OptionCard key={o.value} option={o} selected={answers.filterType} onSelect={v => handleSelect('filterType', v)} />
          ))}
        </div>
      )
    },
    chlorinationMethod: {
      title: 'What sanitation system does your pool use?',
      sub: 'Helps us understand your pool\'s chemistry needs.',
      render: () => (
        <div className="space-y-3">
          {CHLORINATION_OPTIONS.map(o => (
            <OptionCard key={o.value} option={o} selected={answers.chlorinationMethod} onSelect={v => handleSelect('chlorinationMethod', v)} />
          ))}
        </div>
      )
    },
    useFrequency: {
      title: 'How often is your pool used?',
      sub: 'Usage frequency affects water chemistry demand.',
      render: () => (
        <div className="space-y-3">
          {FREQUENCY_OPTIONS.map(o => (
            <OptionCard key={o.value} option={o} selected={answers.useFrequency} onSelect={v => handleSelect('useFrequency', v)} />
          ))}
        </div>
      )
    },
    treesOverhead: {
      title: 'Are there trees hanging over or near your pool?',
      sub: 'Overhead trees increase debris and affect chemistry.',
      render: () => (
        <div className="space-y-3">
          {TREES_OPTIONS.map(o => (
            <OptionCard key={o.value} option={o} selected={answers.treesOverhead} onSelect={v => handleSelect('treesOverhead', v)} />
          ))}
        </div>
      )
    },
    petsAccess: {
      title: 'Do pets swim in or regularly access your pool?',
      sub: 'Pet activity affects chlorine demand and water balance.',
      render: () => (
        <div className="space-y-3">
          {PETS_OPTIONS.map(o => (
            <OptionCard key={String(o.value)} option={o} selected={answers.petsAccess} onSelect={v => handleSelect('petsAccess', v)} />
          ))}
        </div>
      )
    },
    poolCondition: {
      title: 'What does your pool look like right now?',
      sub: 'Current condition helps determine if an initial treatment is needed.',
      render: () => (
        <div className="space-y-3">
          {CONDITION_OPTIONS.map(o => (
            <OptionCard key={o.value} option={o} selected={answers.poolCondition} onSelect={v => handleSelect('poolCondition', v)} />
          ))}
        </div>
      )
    },
    contact: {
       title: 'Last step — where should we send your quote?',
       sub: 'No payment info needed. No spam. Just your quote.',
       render: () => (
         <div className="space-y-4">
           <div>
             <label className="block text-sm font-medium text-gray-700 mb-1">
               First Name <span className="text-red-600">*</span>
             </label>
             <input
               type="text"
               value={firstName}
               onChange={e => setFirstName(e.target.value)}
               placeholder="Your first name"
               className={`w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:outline-none transition-colors text-gray-900`}
               style={{ '--tw-ring-color': TEAL }}
               onFocus={e => e.target.style.borderColor = TEAL}
               onBlur={e => e.target.style.borderColor = '#e5e7eb'}
               autoComplete="given-name"
             />
           </div>
           <div>
             <label className="block text-sm font-medium text-gray-700 mb-1">Last Name</label>
             <input
               type="text"
               value={answers.lastName || ''}
               onChange={e => setAnswers({ ...answers, lastName: e.target.value })}
               placeholder="Your last name (optional)"
               className={`w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:outline-none transition-colors text-gray-900`}
               style={{ '--tw-ring-color': TEAL }}
               onFocus={e => e.target.style.borderColor = TEAL}
               onBlur={e => e.target.style.borderColor = '#e5e7eb'}
               autoComplete="family-name"
             />
           </div>
           <div>
             <label className="block text-sm font-medium text-gray-700 mb-1">
               Email Address <span className="text-red-600">*</span>
             </label>
             <input
               type="email"
               value={email}
               onChange={e => setEmail(e.target.value)}
               placeholder="Enter Your Email"
               className={`w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:outline-none transition-colors text-gray-900 placeholder-gray-400`}
               style={{ '--tw-ring-color': TEAL }}
               onFocus={e => e.target.style.borderColor = TEAL}
               onBlur={e => e.target.style.borderColor = '#e5e7eb'}
               autoComplete="email"
             />
           </div>
           {error && <p className="text-red-500 text-sm font-medium">{error}</p>}
           <button
             onClick={handleSubmit}
             disabled={loading || finalizing}
             className="w-full flex items-center justify-center gap-2 py-4 rounded-xl text-white text-base font-semibold shadow-md hover:shadow-lg transition-all disabled:opacity-60"
             style={{ backgroundColor: TEAL }}
           >
             {loading || finalizing ? <><Loader2 className="w-5 h-5 animate-spin" /> Generating your quote...</> : 'Get My Free Quote'}
           </button>
           <p className="text-xs text-center text-gray-400">No payment info required. No commitment.</p>
         </div>
       )
     }
  };

  const config = stepConfig[currentKey];

  return (
    <div className="space-y-6">
      {/* Progress */}
      <div className="space-y-2">
        <div className="flex justify-between items-center text-xs text-gray-400">
          <span>Step {step + 1} of {totalSteps}</span>
          <span>{Math.round(((step + 1) / totalSteps) * 100)}% complete</span>
        </div>
        <ProgressBar current={step + 1} total={totalSteps} />
      </div>

      {/* Question */}
      <div>
        <h2 className="text-xl font-bold text-gray-900 mb-1">{config.title}</h2>
        {config.sub && <p className="text-sm text-gray-500">{config.sub}</p>}
      </div>

      {/* Options */}
      {config.render()}

      {/* Back button */}
      {step > 0 && (
        <button
          onClick={goBack}
          className="flex items-center gap-1 text-sm text-gray-400 hover:text-gray-600 transition-colors mt-2"
        >
          <ChevronLeft className="w-4 h-4" /> Back
        </button>
      )}
    </div>
  );
}