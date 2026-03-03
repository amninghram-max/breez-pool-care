import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { base44 } from '@/api/base44Client';
import {
  ShieldCheck, FileText, BarChart2, Lock, User,
  MessageSquare, CreditCard, Wrench, Camera,
  ChevronDown, ChevronUp, Phone, Mail, Clock,
  Droplets, Calendar, ClipboardList
} from 'lucide-react';

const TEAL = '#1B9B9F';

function CTAButtons({ navigate }) {
  return (
    <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
      <button
        onClick={() => navigate(createPageUrl('PreQualification'))}
        className="w-full sm:w-auto px-8 py-4 rounded-xl text-white text-lg font-semibold shadow-lg hover:shadow-xl transition-all hover:-translate-y-0.5"
        style={{ backgroundColor: TEAL }}
      >
        Get Free Instant Quote
      </button>
      <button
        onClick={() => navigate(createPageUrl('PreQualification'))}
        className="w-full sm:w-auto px-8 py-4 rounded-xl text-lg font-semibold border-2 bg-white hover:bg-gray-50 transition-all hover:-translate-y-0.5"
        style={{ borderColor: TEAL, color: TEAL }}
      >
        Schedule Free Inspection
      </button>
    </div>
  );
}

function FAQItem({ q, a }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <button
        className="w-full flex justify-between items-center px-6 py-5 text-left bg-white hover:bg-gray-50 transition-colors"
        onClick={() => setOpen(!open)}
      >
        <span className="font-semibold text-gray-900 pr-4">{q}</span>
        {open ? <ChevronUp className="w-5 h-5 text-gray-400 shrink-0" /> : <ChevronDown className="w-5 h-5 text-gray-400 shrink-0" />}
      </button>
      {open && (
        <div className="px-6 pb-5 bg-white">
          <p className="text-gray-600 leading-relaxed">{a}</p>
        </div>
      )}
    </div>
  );
}

const faqs = [
  {
    q: 'Does it matter if my pool is screened or unscreened?',
    a: 'Yes — and we service both. Screened enclosures naturally reduce debris load and help maintain water chemistry between visits. Unscreened pools are exposed to more environmental factors like leaves, dust, and rainfall, which can affect balance more quickly. We factor your pool\'s environment into your service plan from the start.'
  },
  {
    q: 'What\'s the difference between saltwater and traditional chlorine pools?',
    a: 'Saltwater systems use a chlorinator cell to generate chlorine from dissolved salt, which many homeowners find gentler on skin and eyes. Traditional pools use liquid chlorine or tablets added directly. Both require regular balancing and professional monitoring — the delivery method is different, but proper chemistry care is equally important for either system.'
  },
  {
    q: 'My pool has turned green. Can you help?',
    a: 'Absolutely. A green pool is typically the result of algae growth from prolonged chemical imbalance or environmental exposure. We assess severity at the inspection and walk you through a recovery plan before any service begins. Green-to-clean is something we handle regularly and professionally.'
  },
  {
    q: 'How often will someone visit my pool?',
    a: 'Most pools are serviced weekly. In some cases — based on pool size, usage patterns, and environmental factors — twice-weekly service may be recommended. Your service frequency is determined during the inspection process and reflected transparently in your quote.'
  },
  {
    q: 'Is there a long-term contract? Can I cancel?',
    a: 'No long-term contracts. Service is provided on a recurring monthly basis and you can cancel at any time. We earn your continued business by doing a great job, not by locking you in.'
  },
  {
    q: 'Can I see records of every visit?',
    a: 'Yes — always. Every service visit is logged in your customer dashboard, including the date, completion time, and technician notes. Complete printable service reports are available anytime from your dashboard.'
  }
];

export default function PublicHome() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-white font-sans text-gray-900" style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>



      {/* ── Header ── */}
      <header className="sticky top-0 z-50 bg-white/95 backdrop-blur border-b border-gray-100 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <img
              src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/699a2b2056054b0207cea969/0b0c31666_Breez2.png"
              alt="Breez Pool Care"
              className="h-11 w-auto"
            />
            <div className="flex items-center gap-3">
              <button
                onClick={() => navigate(createPageUrl('PreQualification'))}
                className="hidden sm:inline-flex px-5 py-2 rounded-lg text-white text-sm font-semibold transition-all hover:opacity-90"
                style={{ backgroundColor: TEAL }}
              >
                Get Free Quote
              </button>
              <button
                onClick={() => base44.auth.redirectToLogin(window.location.href)}
                className="px-4 py-2 rounded-lg border border-gray-300 text-sm font-medium hover:bg-gray-50 transition-colors"
              >
                Log In
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* ── Hero ── */}
      <section className="relative overflow-hidden py-24 px-4">
        {/* Pool photo background */}
        <div className="absolute inset-0">
          <img
            src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/699a2b2056054b0207cea969/33c67f7d7_Pool.png"
            alt=""
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0" style={{ background: 'linear-gradient(135deg, rgba(240,253,253,0.92) 0%, rgba(232,248,249,0.88) 40%, rgba(240,247,255,0.90) 100%)' }} />
        </div>

        <div className="relative max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-medium mb-6 border" style={{ backgroundColor: '#e8f8f9', borderColor: '#b2e8ea', color: TEAL }}>
            <span className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: TEAL }} />
            Now Serving Melbourne, FL
          </div>

          <h1 className="text-5xl md:text-6xl font-bold text-gray-900 leading-tight mb-5">
            Effortless Pool Care.<br />
            <span style={{ color: TEAL }}>Total Transparency.</span>
          </h1>

          <p className="text-xl md:text-2xl text-gray-600 mb-4 max-w-2xl mx-auto leading-relaxed">
            Everything your pool needs — accessible anytime.
          </p>

          <p className="text-base text-gray-500 mb-10 max-w-xl mx-auto">
            Free instant quote. No payment info. No commitment.<br className="hidden sm:block" /> Just your first name and email.
          </p>

          <CTAButtons navigate={navigate} />

          <p className="text-xs text-gray-400 mt-5 max-w-sm mx-auto leading-relaxed">
            Homeowner or designated caretaker must be present for inspection. No obligation required.
          </p>
        </div>
      </section>

      {/* ── Trust Strip ── */}
      <section className="py-8 px-4 border-b border-gray-100 bg-white">
        <div className="max-w-5xl mx-auto space-y-6">
          <div className="flex flex-wrap justify-center items-center gap-x-10 gap-y-4">
            {[
              { icon: ShieldCheck, label: 'Licensed & Insured' },
              { icon: FileText, label: 'Digital Service Logs' },
              { icon: BarChart2, label: 'Transparent Pricing' },
              { icon: Lock, label: 'Private & Secure' },
              { icon: User, label: 'Owner Operated' },
            ].map(({ icon: Icon, label }) => (
              <div key={label} className="flex items-center gap-2 text-gray-600">
                <Icon className="w-5 h-5" style={{ color: TEAL }} />
                <span className="text-sm font-medium">{label}</span>
              </div>
            ))}
          </div>

        </div>
      </section>

      {/* ── How It Works ── */}
      <section className="py-20 px-4 bg-white">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-3">How It Works</h2>
            <p className="text-gray-500 text-lg">From quote to clean pool — three simple steps.</p>
          </div>
          <div className="grid md:grid-cols-3 gap-10">
            {[
              {
                icon: ClipboardList,
                num: '1',
                title: 'Tell Us About Your Pool',
                desc: 'Answer a few quick questions about your pool size, type, and current condition. Takes about two minutes. No payment info needed.'
              },
              {
                icon: BarChart2,
                num: '2',
                title: 'Get Your Quote',
                desc: 'Receive a transparent, personalized quote instantly — built around your pool\'s specific characteristics, not a one-size-fits-all rate.'
              },
              {
                icon: Calendar,
                num: '3',
                title: 'Schedule Your Free Inspection',
                desc: 'We visit your pool, confirm the details, answer any questions, and get you set up. No pressure, no obligation.'
              }
            ].map((step) => (
              <div key={step.num} className="flex flex-col items-center text-center">
                <div className="relative mb-5">
                  <div className="w-16 h-16 rounded-2xl flex items-center justify-center shadow-md" style={{ backgroundColor: '#e8f8f9' }}>
                    <step.icon className="w-7 h-7" style={{ color: TEAL }} />
                  </div>
                  <span className="absolute -top-2 -right-2 w-7 h-7 rounded-full text-white text-xs font-bold flex items-center justify-center shadow" style={{ backgroundColor: TEAL }}>
                    {step.num}
                  </span>
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">{step.title}</h3>
                <p className="text-gray-500 text-sm leading-relaxed">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Digital Service Experience ── */}
      <section className="py-20 px-4" style={{ backgroundColor: '#f8fdfd' }}>
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-3">A Service Experience Built for Homeowners</h2>
            <p className="text-gray-500 text-lg max-w-2xl mx-auto">
              We built a customer dashboard so you always know what's happening with your pool — without having to ask.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              {
                icon: FileText,
                title: 'Visit Logs, Always On',
                desc: 'Every service visit is recorded and accessible from your dashboard the moment it\'s completed.'
              },
              {
                icon: Camera,
                title: 'Before & After Photos',
                desc: 'Photos are taken at each visit so you can see the condition of your pool, not just read about it.'
              },
              {
                icon: Clock,
                title: 'Service Completion Time',
                desc: 'See exactly when your technician arrived and when service was completed — on every visit.'
              },
              {
                icon: MessageSquare,
                title: 'Direct Messaging',
                desc: 'Have a question between visits? Message us directly through the platform. No phone tag required.'
              },
              {
                icon: CreditCard,
                title: 'Secure Payments',
                desc: 'Billing is handled securely through your dashboard. AutoPay is available with a monthly discount.'
              },
              {
                icon: Wrench,
                title: 'Equipment Recommendations',
                desc: 'If your technician observes something worth attention, it\'s noted and shared with you proactively.'
              }
            ].map(({ icon: Icon, title, desc }) => (
              <div key={title} className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
                <div className="w-11 h-11 rounded-xl flex items-center justify-center mb-4" style={{ backgroundColor: '#e8f8f9' }}>
                  <Icon className="w-5 h-5" style={{ color: TEAL }} />
                </div>
                <h3 className="font-semibold text-gray-900 mb-2">{title}</h3>
                <p className="text-gray-500 text-sm leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
          <p className="text-center text-gray-500 text-sm mt-8">
            Complete printable service reports are available anytime from your dashboard.
          </p>
        </div>
      </section>

      {/* ── CPO Badge ── */}
      <div className="flex justify-center py-10 bg-white">
        <img
          src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/699a2b2056054b0207cea969/aed629531_CertifiedPoolSpaOperator.png"
          alt="Certified Pool & Spa Operator"
          className="h-80 w-auto"
        />
      </div>

      {/* ── Why Water Balance Matters ── */}
      <section className="py-20 px-4 bg-white">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-3">Why Water Balance Matters</h2>
            <p className="text-gray-500 text-lg">Properly balanced water isn't just about clarity — it protects your family and your investment.</p>
          </div>
          <div className="grid md:grid-cols-2 gap-10 items-center">
            <div className="space-y-6">
              <div className="flex gap-4">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 mt-0.5" style={{ backgroundColor: '#e8f8f9' }}>
                  <ShieldCheck className="w-5 h-5" style={{ color: TEAL }} />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 mb-1">Safety First</h3>
                  <p className="text-gray-500 text-sm leading-relaxed">
                    Water that's out of balance — too acidic, too alkaline, or under-sanitized — can irritate skin, eyes, and respiratory systems. Consistently balanced water keeps everyone in your home comfortable and safe to swim.
                  </p>
                </div>
              </div>
              <div className="flex gap-4">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 mt-0.5" style={{ backgroundColor: '#e8f8f9' }}>
                  <Wrench className="w-5 h-5" style={{ color: TEAL }} />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 mb-1">Equipment Protection</h3>
                  <p className="text-gray-500 text-sm leading-relaxed">
                    Corrosive or scale-forming water accelerates wear on your pump, filter, heater, and surfaces. Maintaining proper balance extends the life of your equipment and helps you avoid costly early replacements.
                  </p>
                </div>
              </div>
              <div className="flex gap-4">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 mt-0.5" style={{ backgroundColor: '#e8f8f9' }}>
                  <Droplets className="w-5 h-5" style={{ color: TEAL }} />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 mb-1">Professional-Grade Care</h3>
                  <p className="text-gray-500 text-sm leading-relaxed">
                    We use professional-grade balancing agents and test your water with precision instruments at every visit. There's no guessing — your water chemistry is adjusted based on actual readings, not estimation.
                  </p>
                </div>
              </div>
            </div>
            <div className="rounded-3xl overflow-hidden shadow-xl aspect-[4/3]">
              <img
                src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/699a2b2056054b0207cea969/8f63f3f99_Skimming_pool.png"
                alt="Breez Pool Care technician skimming pool"
                className="w-full h-full object-cover"
              />
            </div>
          </div>
        </div>
      </section>

      {/* ── Service Area ── */}
      <section className="py-16 px-4" style={{ background: 'linear-gradient(135deg, #e8f8f9 0%, #f0f7ff 100%)' }}>
        <div className="max-w-3xl mx-auto text-center">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-5" style={{ backgroundColor: 'white' }}>
            <ShieldCheck className="w-7 h-7" style={{ color: TEAL }} />
          </div>
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-3">Now Serving Melbourne</h2>
          <p className="text-gray-600 text-lg leading-relaxed max-w-xl mx-auto">
            We are a growing company. Service areas will expand as we build our team.
            If you're outside our current service area, enter your information and we'll reach out when we're in your neighborhood.
          </p>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section className="py-20 px-4 bg-white">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-3">Common Questions</h2>
            <p className="text-gray-500 text-lg">Straightforward answers to what homeowners typically ask.</p>
          </div>
          <div className="space-y-3">
            {faqs.map((faq) => (
              <FAQItem key={faq.q} q={faq.q} a={faq.a} />
            ))}
          </div>
        </div>
      </section>

      {/* ── Final CTA ── */}
      <section className="py-20 px-4 text-white" style={{ background: `linear-gradient(135deg, ${TEAL} 0%, #1688a0 100%)` }}>
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-3">Ready to Get Started?</h2>
          <p className="text-lg opacity-90 mb-10 max-w-xl mx-auto">
            Get your personalized quote in two minutes — no commitment, no payment info required.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <button
              onClick={() => navigate(createPageUrl('PreQualification'))}
              className="w-full sm:w-auto px-8 py-4 rounded-xl text-lg font-semibold bg-white shadow-lg hover:shadow-xl transition-all hover:-translate-y-0.5"
              style={{ color: TEAL }}
            >
              Get Free Instant Quote
            </button>
            <button
              onClick={() => navigate(createPageUrl('PreQualification'))}
              className="w-full sm:w-auto px-8 py-4 rounded-xl text-lg font-semibold border-2 border-white/60 hover:bg-white/10 transition-all hover:-translate-y-0.5 text-white"
            >
              Schedule Free Inspection
            </button>
          </div>
          <p className="text-xs opacity-60 mt-5">
            Homeowner or designated caretaker must be present for inspection. No obligation required.
          </p>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="bg-gray-900 text-white py-14 px-4">
        <div className="max-w-5xl mx-auto">
          <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-10 mb-10">
            <div>
              <img
                src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/699a2b2056054b0207cea969/0b0c31666_Breez2.png"
                alt="Breez Pool Care"
                className="h-10 w-auto mb-4 opacity-90"
              />
              <p className="text-gray-400 text-sm leading-relaxed">
                Breez Pool Care LLC<br />
                Owner / Operator: Matt Inghram
              </p>
            </div>
            <div>
              <h4 className="font-semibold text-sm uppercase tracking-wider text-gray-400 mb-4">Contact</h4>
              <div className="space-y-3">
                <a href="tel:3215243838" className="flex items-center gap-2 text-gray-300 hover:text-white transition-colors text-sm">
                  <Phone className="w-4 h-4" style={{ color: TEAL }} />
                  (321) 524-3838
                </a>
                <a href="mailto:info@breezpoolcare.com" className="flex items-center gap-2 text-gray-300 hover:text-white transition-colors text-sm">
                  <Mail className="w-4 h-4" style={{ color: TEAL }} />
                  info@breezpoolcare.com
                </a>
                <div className="flex items-center gap-2 text-gray-300 text-sm">
                  <Clock className="w-4 h-4" style={{ color: TEAL }} />
                  Mon – Sat: 8am – 6pm
                </div>
              </div>
            </div>
            <div>
              <h4 className="font-semibold text-sm uppercase tracking-wider text-gray-400 mb-4">Service Area</h4>
              <p className="text-gray-300 text-sm leading-relaxed">
                Melbourne, FL<br />
                Expanding across Brevard County
              </p>
            </div>
          </div>
          <div className="border-t border-gray-800 pt-6 text-center text-gray-500 text-xs">
            &copy; {new Date().getFullYear()} Breez Pool Care LLC. All rights reserved.
          </div>
        </div>
      </footer>

    </div>
  );
}