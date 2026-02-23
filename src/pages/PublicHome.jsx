import React from 'react';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { CheckCircle2, Calendar, FileText, Droplet, Zap, Phone, Mail, Clock } from 'lucide-react';

export default function PublicHome() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/95 backdrop-blur border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-2">
              <img 
                src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/699a2b2056054b0207cea969/0b0c31666_Breez2.png"
                alt="Breez Pool Care"
                className="h-12 w-auto"
              />
            </div>
            <div className="flex items-center gap-3">
              <Button 
                onClick={() => navigate(createPageUrl('PreQualification'))}
                className="bg-teal-600 hover:bg-teal-700 hidden sm:flex"
              >
                Get a Free Quote
              </Button>
              <Button 
                onClick={() => navigate(createPageUrl('Login'))}
                variant="outline"
              >
                Login
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="bg-gradient-to-br from-teal-50 to-blue-50 py-20 px-4">
        <div className="max-w-6xl mx-auto text-center">
          <h1 className="text-5xl md:text-6xl font-bold text-gray-900 mb-6">
            Sparkling pool care,<br />made effortless.
          </h1>
          <p className="text-xl md:text-2xl text-gray-700 mb-8 max-w-3xl mx-auto">
            Chemicals included. Simple monthly pricing. Reliable service.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button 
              onClick={() => navigate(createPageUrl('PreQualification'))}
              size="lg"
              className="bg-teal-600 hover:bg-teal-700 h-14 px-8 text-lg"
            >
              Get a Free Quote
            </Button>
            <Button 
              onClick={() => navigate(createPageUrl('PreQualification'))}
              size="lg"
              variant="outline"
              className="h-14 px-8 text-lg"
            >
              <Calendar className="w-5 h-5 mr-2" />
              Schedule a Free Inspection
            </Button>
          </div>
        </div>
      </section>

      {/* Trust & Social Proof */}
      <section className="py-12 bg-white border-b">
        <div className="max-w-6xl mx-auto px-4">
          <div className="flex flex-wrap justify-center items-center gap-8 text-center">
            <div>
              <p className="text-sm text-gray-600">Locally Owned</p>
              <p className="font-semibold text-gray-900">Space Coast, Florida</p>
            </div>
            <div className="hidden sm:block w-px h-12 bg-gray-300"></div>
            <div>
              <p className="text-sm text-gray-600">Licensed & Insured</p>
              <p className="font-semibold text-gray-900">Professional Service</p>
            </div>
            <div className="hidden sm:block w-px h-12 bg-gray-300"></div>
            <div>
              <p className="text-sm text-gray-600">Service Area</p>
              <p className="font-semibold text-gray-900">Brevard County</p>
            </div>
          </div>
        </div>
      </section>

      {/* What's Included */}
      <section className="py-20 px-4">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-4xl font-bold text-center text-gray-900 mb-4">
            What's Included
          </h2>
          <p className="text-center text-gray-600 mb-12 text-lg">
            Everything your pool needs to stay crystal clear
          </p>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              { icon: Droplet, title: 'Chemicals Included', desc: 'All chemicals and treatments provided at no extra cost' },
              { icon: Zap, title: 'Water Testing & Balancing', desc: 'Professional testing and precise chemical balancing' },
              { icon: CheckCircle2, title: 'Brushing & Vacuuming', desc: 'Thorough cleaning of walls, steps, and floor' },
              { icon: Droplet, title: 'Debris Removal', desc: 'Skimming and removal of leaves and debris' },
              { icon: CheckCircle2, title: 'Skimmer & Filter Check', desc: 'Regular inspection and maintenance of equipment' },
              { icon: FileText, title: 'Digital Service Reports', desc: 'Track every visit and chemistry reading' }
            ].map((item, idx) => (
              <Card key={idx} className="hover:shadow-lg transition-shadow">
                <CardContent className="p-6">
                  <div className="w-12 h-12 bg-teal-100 rounded-lg flex items-center justify-center mb-4">
                    <item.icon className="w-6 h-6 text-teal-600" />
                  </div>
                  <h3 className="font-semibold text-lg mb-2">{item.title}</h3>
                  <p className="text-gray-600 text-sm">{item.desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-20 px-4 bg-gray-50">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-4xl font-bold text-center text-gray-900 mb-4">
            How It Works
          </h2>
          <p className="text-center text-gray-600 mb-12 text-lg">
            Get started in three simple steps
          </p>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              { 
                num: '1', 
                title: 'Get a Free Quote', 
                desc: 'Answer a few quick questions about your pool and get an instant quote tailored to your needs.'
              },
              { 
                num: '2', 
                title: 'Schedule Your Free Inspection', 
                desc: 'We'll visit your property, assess your pool, and answer any questions you have.'
              },
              { 
                num: '3', 
                title: 'Activate & Relax', 
                desc: 'Accept our service agreement, complete payment, and we'll schedule your first visit. That's it!'
              }
            ].map((step) => (
              <div key={step.num} className="text-center">
                <div className="w-16 h-16 bg-teal-600 text-white rounded-full flex items-center justify-center text-2xl font-bold mx-auto mb-4">
                  {step.num}
                </div>
                <h3 className="font-semibold text-xl mb-2">{step.title}</h3>
                <p className="text-gray-600">{step.desc}</p>
              </div>
            ))}
          </div>
          <div className="text-center mt-12">
            <Button 
              onClick={() => navigate(createPageUrl('PreQualification'))}
              size="lg"
              className="bg-teal-600 hover:bg-teal-700 h-14 px-8 text-lg"
            >
              Get Your Free Quote Now
            </Button>
          </div>
        </div>
      </section>

      {/* Plans */}
      <section className="py-20 px-4">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-4xl font-bold text-center text-gray-900 mb-4">
            Simple, Transparent Pricing
          </h2>
          <p className="text-center text-gray-600 mb-12 text-lg">
            Choose the plan that works for you
          </p>
          <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            <Card className="border-2 hover:border-teal-500 hover:shadow-xl transition-all">
              <CardContent className="p-8">
                <h3 className="text-2xl font-bold mb-2">Weekly Service</h3>
                <p className="text-gray-600 mb-6">
                  Best for pools with heavy use, pets, or high debris
                </p>
                <ul className="space-y-3">
                  {['52 visits per year', 'All chemicals included', 'Priority scheduling', 'Ideal for most pools'].map((item) => (
                    <li key={item} className="flex items-start gap-2">
                      <CheckCircle2 className="w-5 h-5 text-teal-600 mt-0.5" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
                <Button 
                  onClick={() => navigate(createPageUrl('PreQualification'))}
                  className="w-full mt-8 bg-teal-600 hover:bg-teal-700"
                >
                  Get Quote
                </Button>
              </CardContent>
            </Card>
            <Card className="border-2 hover:border-teal-500 hover:shadow-xl transition-all">
              <CardContent className="p-8">
                <h3 className="text-2xl font-bold mb-2">Bi-Weekly Service</h3>
                <p className="text-gray-600 mb-6">
                  For lighter use pools in ideal conditions
                </p>
                <ul className="space-y-3">
                  {['26 visits per year', 'All chemicals included', 'Flexible scheduling', 'Budget-friendly option'].map((item) => (
                    <li key={item} className="flex items-start gap-2">
                      <CheckCircle2 className="w-5 h-5 text-teal-600 mt-0.5" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
                <Button 
                  onClick={() => navigate(createPageUrl('PreQualification'))}
                  className="w-full mt-8"
                  variant="outline"
                >
                  Get Quote
                </Button>
              </CardContent>
            </Card>
          </div>
          <p className="text-center text-gray-600 mt-8">
            Exact pricing based on your pool size, type, and conditions. Get your custom quote in 2 minutes.
          </p>
        </div>
      </section>

      {/* FAQ Highlight */}
      <section className="py-20 px-4 bg-gray-50">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-4xl font-bold text-gray-900 mb-4">
            Questions?
          </h2>
          <p className="text-gray-600 mb-8 text-lg">
            We've got answers. Check out our frequently asked questions.
          </p>
          <Button 
            onClick={() => navigate(createPageUrl('FAQ'))}
            size="lg"
            variant="outline"
            className="h-12 px-8"
          >
            View All FAQs
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-white py-12 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="grid md:grid-cols-3 gap-8 mb-8">
            <div>
              <h4 className="font-semibold text-lg mb-4">Contact Us</h4>
              <div className="space-y-2 text-gray-300">
                <div className="flex items-center gap-2">
                  <Phone className="w-4 h-4" />
                  <a href="tel:3215243838" className="hover:text-teal-400">(321) 524-3838</a>
                </div>
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4" />
                  <span>Mon-Sat: 9am - 6pm</span>
                </div>
              </div>
            </div>
            <div>
              <h4 className="font-semibold text-lg mb-4">Service Area</h4>
              <p className="text-gray-300">
                Brevard County, Florida<br />
                Space Coast & surrounding areas
              </p>
            </div>
            <div>
              <h4 className="font-semibold text-lg mb-4">Legal</h4>
              <div className="space-y-2 text-gray-300">
                <a href="#" className="block hover:text-teal-400">Terms of Service</a>
                <a href="#" className="block hover:text-teal-400">Privacy Policy</a>
                <a href="#" className="block hover:text-teal-400">Service Policies</a>
              </div>
            </div>
          </div>
          <div className="border-t border-gray-800 pt-8 text-center text-gray-400 text-sm">
            <p>&copy; 2026 Breez Pool Care. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}