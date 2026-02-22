import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Search, Phone, MessageSquare } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

export default function FAQ() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');

  const { data: faqs = [], isLoading } = useQuery({
    queryKey: ['faqs'],
    queryFn: () => base44.entities.FAQ.filter({ isActive: true })
  });

  const { data: settings } = useQuery({
    queryKey: ['supportSettings'],
    queryFn: async () => {
      const result = await base44.entities.SupportSettings.filter({ settingKey: 'default' });
      return result[0] || {};
    }
  });

  // Filter FAQs
  const filteredFaqs = faqs.filter(faq => {
    const matchesSearch = !searchQuery || 
      faq.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
      faq.answer.toLowerCase().includes(searchQuery.toLowerCase()) ||
      faq.keywords?.some(kw => kw.toLowerCase().includes(searchQuery.toLowerCase()));
    
    const matchesCategory = selectedCategory === 'all' || faq.category === selectedCategory;
    
    return matchesSearch && matchesCategory;
  }).sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0));

  // Get unique categories
  const categories = ['all', ...new Set(faqs.map(f => f.category))];

  const categoryLabels = {
    all: 'All Topics',
    getting_started: 'Getting Started',
    billing: 'Billing & Payments',
    scheduling: 'Scheduling',
    service: 'Service Details',
    technical: 'Technical Support',
    account: 'Account Management'
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Frequently Asked Questions</h1>
        <p className="text-gray-600 mt-1">Find answers to common questions</p>
      </div>

      {/* Search */}
      <Card>
        <CardContent className="p-4">
          <div className="relative">
            <Search className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
            <Input
              placeholder="Search for answers..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </CardContent>
      </Card>

      {/* Category Filter */}
      <div className="flex flex-wrap gap-2">
        {categories.map(cat => (
          <Badge
            key={cat}
            onClick={() => setSelectedCategory(cat)}
            className={`cursor-pointer ${
              selectedCategory === cat 
                ? 'bg-teal-600 text-white' 
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {categoryLabels[cat] || cat}
          </Badge>
        ))}
      </div>

      {/* FAQ List */}
      {isLoading ? (
        <Card>
          <CardContent className="p-12 text-center">
            <p className="text-gray-600">Loading FAQs...</p>
          </CardContent>
        </Card>
      ) : filteredFaqs.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <p className="text-gray-600">No FAQs match your search.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {filteredFaqs.map(faq => (
            <Card key={faq.id}>
              <CardHeader>
                <CardTitle className="text-lg">{faq.question}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <ReactMarkdown className="text-gray-700 prose prose-sm max-w-none">
                  {faq.answer}
                </ReactMarkdown>
                
                {faq.relatedLinks && faq.relatedLinks.length > 0 && (
                  <div className="border-t pt-4">
                    <div className="text-sm font-semibold text-gray-700 mb-2">Related:</div>
                    <div className="flex flex-wrap gap-2">
                      {faq.relatedLinks.map((link, idx) => (
                        <Link key={idx} to={link.url}>
                          <Badge variant="outline" className="cursor-pointer hover:bg-gray-100">
                            {link.label}
                          </Badge>
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Still Need Help */}
      <Card className="border-teal-200 bg-teal-50">
        <CardContent className="p-6">
          <h3 className="font-semibold text-lg mb-3">Still need help?</h3>
          <div className="flex flex-wrap gap-3">
            <Link to={createPageUrl('Messages')}>
              <Button variant="outline" className="bg-white">
                <MessageSquare className="w-4 h-4 mr-2" />
                Message Our Team
              </Button>
            </Link>
            <a href={`tel:${settings?.businessPhone || '(321) 524-3838'}`}>
              <Button className="bg-teal-600 hover:bg-teal-700">
                <Phone className="w-4 h-4 mr-2" />
                Call {settings?.businessPhone || '(321) 524-3838'}
              </Button>
            </a>
          </div>
          <p className="text-xs text-gray-600 mt-3">
            Business Hours: 9am–6pm Mon–Sat (Closed Sunday)
          </p>
        </CardContent>
      </Card>
    </div>
  );
}