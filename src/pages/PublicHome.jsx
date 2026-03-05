import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { base44 } from '@/api/base44Client';
import {
  ShieldCheck, FileText, BarChart2, Lock, User,
  MessageSquare, CreditCard, Wrench, Camera,
  ChevronDown, ChevronUp, Clock, Droplets,
  Calendar, ClipboardList, CheckCircle, MapPin, Star } from 'lucide-react';

const TEAL = '#1B9B9F';

function CTAButtons({ navigate }) {
  return (
    <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
      <button
        onClick={() => navigate(createPageUrl('PreQualification'))}
        className="w-full sm:w-auto px-8 py-4 rounded-xl text-white text-lg font-semibold shadow-lg hover:shadow-xl transition-all hover:-translate-y-0.5"
        style={{ backgroundColor: TEAL }}>
        Get Free Instant Quote
      </button>
      <button
        onClick={() => navigate(createPageUrl('PreQualification'))}
        className="w-full sm:w-auto px-8 py-4 rounded-xl text-lg font-semibold border-2 bg-white hover:bg-gray-50 transition-all hover:-translate-y-0.5"
        style={{ borderColor: TEAL, color: TEAL }}>
        Schedule a Free Inspection
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
        onClick={() => setOpen(!open)}>
        <span className="font-semibold text-gray-900 pr-4">{q}</span>
        {open ? <ChevronUp className="w-5 h-5 text-gray-400 shrink-0" /> : <ChevronDown className="w-5 h-5 text-gray-400 shrink-0" />}
      </button>
      {open && (
        <div className="px-6 pb-5 bg-white">
          <p className="text-gray-600 leading-relaxed" dangerouslySetInnerHTML={{ __html: a }} />
        </div>
      )}
    </div>
  );
}

const faqs = [
  {
    q: 'How does the free instant quote work?',
    a: 'Answer a few quick questions and get a fast estimate—no payment info and no commitment.'
  },
  {
    q: 'Is Green-to-Clean included?',
    a: 'Yes. Green-to-clean recovery is <strong>included in the initial quote</strong>, then <strong>confirmed during the inspection</strong> based on pool size and severity.'
  },
  {
    q: 'What happens during the free inspection?',
    a: 'We test the water, inspect equipment and circulation, confirm pool details, and answer questions. It typically takes <strong>20–30 minutes</strong>. We\'ll call about <strong>1 hour before arrival</strong> to confirm someone is home.'
  },
  {
    q: 'Do I need to be home for service visits?',
    a: '<strong>No.</strong> You only need to be home for the <strong>free inspection</strong> (or have a designated caretaker present). After that, we just need <strong>safe access</strong> to the pool and equipment area.'
  },
  {
    q: 'How do payments work?',
    a: 'Service is billed <strong>one month in advance</strong> for upcoming service. Payments are handled securely in your dashboard.'
  },
  {
    q: 'Is AutoPay available?',
    a: 'Yes—AutoPay is available and saves <strong>$10 per month</strong>.'
  },
  {
    q: 'What if I\'m late on a payment?',
    a: 'There are no late fees. You have a <strong>72-hour grace period</strong> to pay. If unpaid after that, service and dashboard access may be suspended until reinstated.'
  },
  {
    q: 'Can I cancel anytime?',
    a: 'Yes. You can cancel anytime and service ends at the end of your current billing cycle.'
  }
];

export default function PublicHome() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-white font-sans text-gray-900" style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>

      {/* ── Header ── */}
      <header className="sticky top-0 z-50 bg-white/95 backdrop-blur border-b border-gray-100 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-20">
            <img
              src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/699a2b2056054b0207cea969/0b0c31666_Breez2.png"
              alt="Breez Pool Care"
              className="h-16 w-auto" />
            <div className="flex items-center gap-3">
              <button
                onClick={() => navigate(createPageUrl('PreQualification'))}
                className="hidden sm:inline-flex px-5 py-2 rounded-lg text-white text-sm font-semibold transition-all hover:opacity-90"
                style={{ backgroundColor: TEAL }}>
                Get Free Quote
              </button>
              <button
                onClick={() => base44.auth.redirectToLogin(window.location.href)}
                className="px-4 py-2 rounded-lg border border-gray-300 text-sm font-medium hover:bg-gray-50 transition-colors">
                Log In
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* ── Hero ── */}
      <section className="relative overflow-hidden py-24 px-4">
        <div className="absolute inset-0">
          <img
            src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/699a2b2056054b0207cea969/33c67f7d7_Pool.png"
            alt=""
            className="w-full h-full object-cover" />
          <div className="absolute inset-0" style={{ background: 'linear-gradient(135deg, rgba(240,253,253,0.92) 0%, rgba(232,248,249,0.88) 40%, rgba(240,247,255,0.90) 100%)' }} />
        </div>

        <div className="relative max-w-4xl mx-auto text-center">
          <div className="flex justify-center mb-8">
            <img
              src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/699a2b2056054b0207cea969/0b0c31666_Breez2.png"
              alt="Breez Pool Care"
              className="h-36 w-auto" />
          </div>

          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-medium mb-6 border" style={{ backgroundColor: '#e8f8f9', borderColor: '#b2e8ea', color: TEAL }}>
            <span className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: TEAL }} />
            Now Serving Palm Shores &amp; Nearby Melbourne, FL
          </div>

          <h1 className="text-5xl md:text-6xl font-bold text-gray-900 leading-tight mb-5">
            Effortless Pool Care.<br />
            <span style={{ color: TEAL }}>Total Transparency.</span>
          </h1>

          <p className="text-xl md:text-2xl font-semibold text-gray-700 mb-4 max-w-2xl mx-auto leading-relaxed">
            Stop hauling chemicals. Start enjoying your pool.
          </p>

          <p className="text-base text-gray-600 mb-10 max-w-2xl mx-auto leading-relaxed">
            Breez Pool Care delivers consistent residential pool cleaning, professional water testing, and chemical balancing—so your pool stays clear, comfortable, and <strong>swim-ready without the stress</strong>.
          </p>

          <CTAButtons navigate={navigate} />

          <p className="text-xs text-gray-400 mt-5 max-w-sm mx-auto leading-relaxed">
            Free instant quote. No payment info. No commitment.
          </p>
        </div>
      </section>

      {/* ── Quick Benefits ── */}
      <section className="py-12 px-4 bg-white border-b border-gray-100">
        <div className="max-w-4xl mx-auto">
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { icon: ShieldCheck, title: 'No more dangerous chemicals.', desc: 'We bring them, handle them, and apply them safely.' },
              { icon: Clock, title: 'Get your time back.', desc: 'No more weekends lost to brushing and guessing.' },
              { icon: Droplets, title: 'Swim with confidence.', desc: 'Water is tested and balanced consistently by a pro.' },
              { icon: Wrench, title: 'Fewer costly surprises.', desc: 'Stable chemistry + routine checks help prevent damage.' },
            ].map(({ icon: Icon, title, desc }) => (
              <div key={title} className="flex gap-3 items-start">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 mt-0.5" style={{ backgroundColor: '#e8f8f9' }}>
                  <Icon className="w-5 h-5" style={{ color: TEAL }} />
                </div>
                <div>
                  <p className="font-semibold text-gray-900 text-sm">{title}</p>
                  <p className="text-gray-500 text-sm leading-relaxed">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Dashboard Feature Grid ── */}
      <section className="py-20 px-4" style={{ backgroundColor: '#f8fdfd' }}>
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-3">Your pool, in your pocket—every visit documented</h2>
            <p className="text-gray-500 text-lg max-w-2xl mx-auto">
              Most pool companies tell you they came. Breez <strong>shows you</strong>—in your dashboard.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              { icon: FileText, title: 'Visit Logs (Instant)', desc: "Each visit is recorded and available right after completion." },
              { icon: Camera, title: 'Before & After Photos', desc: "Photos are taken at each visit so you can see the condition of your pool—not just read about it." },
              { icon: Clock, title: 'Service Timestamps', desc: "See exactly when your technician arrived and when service was completed—on every visit." },
              { icon: MessageSquare, title: 'Direct Messaging', desc: "Have a question between visits? Message us directly through the platform. No phone tag required." },
              { icon: CreditCard, title: 'Secure Payments + AutoPay', desc: "Billing is handled securely through your dashboard. AutoPay saves $10/month." },
              { icon: Wrench, title: 'Equipment Notes', desc: "If your technician observes something worth attention, it's noted and shared with you proactively." },
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

      {/* ── The Relief ── */}
      <section className="py-16 px-4 bg-white">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">No more heavy jugs. No more guesswork.</h2>
          <p className="text-gray-600 text-lg leading-relaxed">
            Pool ownership shouldn't feel like a chemistry class you didn't sign up for. We handle the cleaning and the chemistry—so you can enjoy the pool instead of managing it.
          </p>
        </div>
      </section>

      {/* ── What We Offer ── */}
      <section className="py-20 px-4" style={{ backgroundColor: '#f8fdfd' }}>
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-3">Weekly residential pool service that keeps your pool consistently swim-ready</h2>
          </div>
          <div className="bg-white rounded-2xl p-8 shadow-sm border border-gray-100">
            <p className="font-semibold text-gray-900 mb-5 text-lg">Every visit includes:</p>
            <div className="grid sm:grid-cols-2 gap-3">
              {[
                'Skimming debris + clearing baskets',
                'Brushing walls and tile line',
                'Vacuuming the pool',
                'Professional water testing + chemical balancing',
                'Equipment & circulation checks',
                'Full visit documentation in your dashboard',
              ].map(item => (
                <div key={item} className="flex items-center gap-3">
                  <CheckCircle className="w-5 h-5 shrink-0" style={{ color: TEAL }} />
                  <span className="text-gray-700 text-sm">{item}</span>
                </div>
              ))}
            </div>
            <p className="text-gray-500 text-sm mt-6 pt-6 border-t border-gray-100">
              <strong>Optional services</strong> (quoted as needed): filter cleans, salt system checks, green-to-clean recovery, and other specialty work.
            </p>
          </div>
        </div>
      </section>

      {/* ── Why Water Balance Matters ── */}
      <section className="py-20 px-4 bg-white">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-3">Balanced water isn't just clearer—it's safer and protective</h2>
          </div>
          <div className="grid md:grid-cols-2 gap-10 items-center">
            <div className="space-y-6">
              {[
                { icon: ShieldCheck, title: 'Comfort & Safety', desc: "Out-of-balance water can irritate skin and eyes. Consistent sanitation and balance keeps swimming comfortable." },
                { icon: Wrench, title: 'Protects Your Pool', desc: "Unstable chemistry can contribute to staining, scale, etching, and premature wear on equipment and plumbing." },
                { icon: Droplets, title: 'No Guessing', desc: "We test and adjust based on real readings—visit after visit." },
              ].map(({ icon: Icon, title, desc }) => (
                <div key={title} className="flex gap-4">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 mt-0.5" style={{ backgroundColor: '#e8f8f9' }}>
                    <Icon className="w-5 h-5" style={{ color: TEAL }} />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900 mb-1">{title}</h3>
                    <p className="text-gray-500 text-sm leading-relaxed">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="rounded-3xl overflow-hidden shadow-xl aspect-[4/3]">
              <img
                src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/699a2b2056054b0207cea969/8f63f3f99_Skimming_pool.png"
                alt="Breez Pool Care technician skimming pool"
                className="w-full h-full object-cover" />
            </div>
          </div>
        </div>
      </section>

      {/* ── Prevention / Repair Cost Section ── */}
      <section className="py-16 px-4" style={{ background: 'linear-gradient(135deg, #e8f8f9 0%, #f0f7ff 100%)' }}>
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">Consistency helps prevent expensive problems</h2>
          <p className="text-gray-600 text-lg leading-relaxed">
            When service is inconsistent, small issues can turn into costly ones. Breez reduces that risk with stable chemistry and routine system checks—so problems get caught early instead of becoming repair bills.
          </p>
        </div>
      </section>

      {/* ── Green Pool CTA ── */}
      <section className="py-14 px-4 bg-white">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-3">Green pool? Algae? We handle recoveries too.</h2>
          <p className="text-gray-600 mb-8 leading-relaxed">
            If your pool is green or out of control, we quote a Green-to-Clean recovery. Pricing depends on pool size and severity.
          </p>
          <button
            onClick={() => navigate(createPageUrl('PreQualification'))}
            className="px-8 py-4 rounded-xl text-white text-lg font-semibold shadow-lg hover:shadow-xl transition-all hover:-translate-y-0.5"
            style={{ backgroundColor: TEAL }}>
            Get Free Instant Quote
          </button>
        </div>
      </section>

      {/* ── Testimonial Placeholder ── */}
      <section className="py-20 px-4" style={{ backgroundColor: '#f8fdfd' }}>
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-3">Homeowners love the "set it and forget it" feeling</h2>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {[1,2,3].map(i => (
              <div key={i} className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
                <div className="flex gap-1 mb-3">
                  {[1,2,3,4,5].map(s => <Star key={s} className="w-4 h-4 fill-current text-yellow-400" />)}
                </div>
                <p className="text-gray-500 text-sm italic leading-relaxed mb-3">"(Customer quote goes here — 1–2 sentences.)"</p>
                <p className="text-gray-400 text-xs font-medium">— Name, City</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How It Works ── */}
      <section className="py-20 px-4 bg-white">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-3">Simple, professional, no-pressure</h2>
          </div>
          <div className="grid md:grid-cols-4 gap-8">
            {[
              { num: '1', title: 'Get a free instant quote', desc: 'No payment info, no commitment.' },
              { num: '2', title: 'Schedule a free inspection', desc: 'We come to you at a convenient time.' },
              { num: '3', title: 'We test water + check equipment', desc: 'About 20–30 minutes at your pool.' },
              { num: '4', title: 'Start service', desc: 'Enjoy a pool that stays swim-ready week after week.' },
            ].map(step => (
              <div key={step.num} className="flex flex-col items-center text-center">
                <div className="w-14 h-14 rounded-full flex items-center justify-center text-white text-xl font-bold mb-4 shadow-md" style={{ backgroundColor: TEAL }}>
                  {step.num}
                </div>
                <h3 className="font-semibold text-gray-900 mb-2 text-sm">{step.title}</h3>
                <p className="text-gray-500 text-sm leading-relaxed">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Why Breez ── */}
      <section className="py-16 px-4" style={{ backgroundColor: '#f8fdfd' }}>
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="text-3xl font-bold text-gray-900 mb-3">Why homeowners choose Breez Pool Care</h2>
          </div>
          <div className="space-y-4">
            {[
              "We handle the chemicals (you don't touch the dangerous stuff)",
              'Consistent weekly service that prevents problems instead of reacting to them',
              'Clear communication and documentation after visits',
              'Free inspection to confirm details and answer questions',
            ].map(item => (
              <div key={item} className="flex items-center gap-3 bg-white rounded-xl px-5 py-4 shadow-sm border border-gray-100">
                <CheckCircle className="w-5 h-5 shrink-0" style={{ color: TEAL }} />
                <span className="text-gray-700">{item}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section className="py-20 px-4 bg-white">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-3">Frequently Asked Questions</h2>
          </div>
          <div className="space-y-3">
            {faqs.map((faq) => (
              <FAQItem key={faq.q} q={faq.q} a={faq.a} />
            ))}
          </div>
        </div>
      </section>

      {/* ── Service Area ── */}
      <section className="py-16 px-4" style={{ background: 'linear-gradient(135deg, #e8f8f9 0%, #f0f7ff 100%)' }}>
        <div className="max-w-3xl mx-auto text-center">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-5" style={{ backgroundColor: 'white' }}>
            <MapPin className="w-7 h-7" style={{ color: TEAL }} />
          </div>
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-3">Proudly serving Palm Shores &amp; nearby Melbourne, FL</h2>
          <p className="text-gray-600 text-lg leading-relaxed mb-4">
            Serving <strong>Palm Shores, Melbourne, West Melbourne, Rockledge, Satellite Beach, Indian Harbour Beach, Indialantic, Palm Bay, Viera, Suntree, Eau Gallie, South Patrick Shores</strong>, and nearby neighborhoods within ~15 miles.
          </p>
          <p className="text-gray-500 text-sm">
            Not sure you're in range? Schedule a free inspection and we'll confirm.
          </p>
        </div>
      </section>

      {/* ── Final CTA ── */}
      <section className="py-24 px-4 bg-white">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-4xl md:text-5xl font-bold text-gray-900 mb-5 leading-tight">
            Ready to stop worrying about your pool?
          </h2>
          <p className="text-gray-600 text-lg mb-10 leading-relaxed">
            Book a free inspection and we'll set you up with a plan that keeps your pool clean, balanced, and ready when you are.
          </p>
          <CTAButtons navigate={navigate} />
          <p className="text-gray-500 text-sm mt-6">
            Questions? Call us: <a href="tel:+13215243838" className="font-medium hover:underline" style={{ color: TEAL }}>(321) 524-3838</a> · Breez Pool Services LLC
          </p>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="py-8 px-4 border-t border-gray-100 bg-gray-50">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row justify-between items-center gap-4">
          <img
            src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/699a2b2056054b0207cea969/0b0c31666_Breez2.png"
            alt="Breez Pool Care"
            className="h-10 w-auto" />
          <p className="text-gray-400 text-xs text-center">© {new Date().getFullYear()} Breez Pool Services LLC · Palm Shores, FL · (321) 524-3838</p>
          <button
            onClick={() => base44.auth.redirectToLogin(window.location.href)}
            className="text-xs text-gray-400 hover:text-gray-600 underline">
            Customer Login
          </button>
        </div>
      </footer>
    </div>
  );
}