import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { ChevronLeft, Loader2, Calendar, CheckCircle2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import PublicScheduler from './PublicScheduler';

const TEAL = '#1B9B9F';

// ── Step definitions ──────────────────────────────────────────────────────────

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

// ── Quote result display ─────────────────────────────────────────────────────

function QuoteResultDisplay({ result, firstName, email, leadId }) {
  const { isRange, quote } = result;
  const [showScheduler, setShowScheduler] = useState(false);

  const priceDisplay = isRange
    ? `$${quote.minMonthly} – $${quote.maxMonthly}`
    : `$${quote.finalMonthlyPrice}`;

  const freqLabel = quote.frequency === 'twice_weekly' ? 'Twice Weekly' : 'Weekly';

  const oneTimeDisplay = isRange
    ? (quote.minOneTimeFees > 0 ? `$${quote.minOneTimeFees}–$${quote.maxOneTimeFees}` : null)
    : (quote.oneTimeFees > 0 ? `$${quote.oneTimeFees}` : null);

  if (showScheduler) {
    return (
      <PublicScheduler
        leadId={leadId}
        clientEmail={email}
        clientFirstName={firstName}
      />
    );
  }

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
          {quote.frequencyAutoRequired && (
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
        <button
          onClick={() => setShowScheduler(true)}
          className="w-full flex items-center justify-center gap-2 py-4 rounded-xl text-white text-base font-semibold shadow-md hover:shadow-lg transition-all hover:-translate-y-0.5"
          style={{ backgroundColor: TEAL }}
        >
          <Calendar className="w-5 h-5" />
          Schedule Your Free Inspection
        </button>
        <p className="text-xs text-center text-gray-400">No obligation. Homeowner or designated caretaker must be present.</p>
      </div>
    </div>
  );
}

// ── Thank you (not ready) ─────────────────────────────────────────────────────

function ThankYouDisplay({ firstName, navigate }) {
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
          onClick={() => navigate(createPageUrl('PreQualification'))}
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

export default function PublicQuoteWizard() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState({});
  const [firstName, setFirstName] = useState('');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null); // { releaseReady, quote?, isRange? }
  const [error, setError] = useState('');

  // Determine steps dynamically (trees only shown if unscreened)
  const showTrees = answers.enclosure === 'unscreened';

  const baseSteps = [
    'poolSize',
    'enclosure',
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
    const newAnswers = { ...answers, [key]: value };
    // Clear trees if switching to screened
    if (key === 'enclosure' && value !== 'unscreened') delete newAnswers.treesOverhead;
    setAnswers(newAnswers);
    // Auto-advance
    setTimeout(() => setStep(s => Math.min(totalSteps - 1, s + 1)), 120);
  };

  const handleSubmit = async () => {
    setError('');
    if (!firstName.trim()) { setError('Please enter your first name.'); return; }
    if (!email.trim() || !email.includes('@')) { setError('Please enter a valid email address.'); return; }
    setLoading(true);
    try {
      const payload = {
        questionnaireData: {
          ...answers,
          clientFirstName: firstName.trim(),
          clientEmail: email.trim().toLowerCase(),
          petsAccess: answers.petsAccess === true,
        }
      };
      const res = await base44.functions.invoke('publicGetQuote', payload);
      setResult(res.data);
    } catch (e) {
      setError('Something went wrong. Please try again or call us at (321) 524-3838.');
    } finally {
      setLoading(false);
    }
  };

  // ── Render result ──
  if (result) {
    if (result.releaseReady) {
      return <QuoteResultDisplay result={result} firstName={firstName} navigate={navigate} />;
    }
    return <ThankYouDisplay firstName={firstName} navigate={navigate} />;
  }

  // ── Step renderers ──
  const stepConfig = {
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
            <label className="block text-sm font-medium text-gray-700 mb-1">First Name</label>
            <input
              type="text"
              value={firstName}
              onChange={e => setFirstName(e.target.value)}
              placeholder="Your first name"
              className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:outline-none transition-colors text-gray-900"
              style={{ '--tw-ring-color': TEAL }}
              onFocus={e => e.target.style.borderColor = TEAL}
              onBlur={e => e.target.style.borderColor = '#e5e7eb'}
              autoComplete="given-name"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email Address</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:outline-none transition-colors text-gray-900"
              onFocus={e => e.target.style.borderColor = TEAL}
              onBlur={e => e.target.style.borderColor = '#e5e7eb'}
              autoComplete="email"
            />
          </div>
          {error && <p className="text-red-500 text-sm">{error}</p>}
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 py-4 rounded-xl text-white text-base font-semibold shadow-md hover:shadow-lg transition-all disabled:opacity-60"
            style={{ backgroundColor: TEAL }}
          >
            {loading ? <><Loader2 className="w-5 h-5 animate-spin" /> Calculating...</> : 'Get My Free Quote'}
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