import React from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { MessageSquare, Bot, Phone, BookOpen, Clock } from 'lucide-react';

export default function HelpSupport() {
  const { data: settings } = useQuery({
    queryKey: ['supportSettings'],
    queryFn: async () => {
      const result = await base44.entities.SupportSettings.filter({ settingKey: 'default' });
      return result[0] || {};
    }
  });

  const businessPhone = settings?.businessPhone || '(321) 524-3838';
  const isBusinessHours = checkBusinessHours(settings?.businessHours);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Help & Support</h1>
        <p className="text-gray-600 mt-1">We're here to help! Choose how you'd like to get support.</p>
      </div>

      {/* Call Us - Always Prominent */}
      <Card className="border-teal-200 bg-teal-50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Phone className="w-5 h-5 text-teal-600" />
            Prefer to Talk?
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <a href={`tel:${businessPhone}`} className="text-2xl font-bold text-teal-700">
              {businessPhone}
            </a>
          </div>
          <div className="flex items-center gap-2 text-sm text-gray-700">
            <Clock className="w-4 h-4" />
            Business Hours: 9am–6pm Mon–Sat (Closed Sunday)
          </div>
          {!isBusinessHours && (
            <div className="bg-orange-100 border border-orange-200 rounded p-3 text-sm text-orange-900">
              We're currently closed. Please message us in the app and we'll respond by the next business day.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Support Options */}
      <div className="grid md:grid-cols-2 gap-4">
        {/* FAQ */}
        <Link to={createPageUrl('FAQ')}>
          <Card className="hover:shadow-lg transition-shadow cursor-pointer h-full">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-blue-600" />
                Browse FAQ
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-gray-600">
                Find quick answers to common questions about billing, scheduling, and service.
              </p>
            </CardContent>
          </Card>
        </Link>

        {/* AI Chatbot */}
        {settings?.aiEnabled && (
          <Link to={createPageUrl('AIChat')}>
            <Card className="hover:shadow-lg transition-shadow cursor-pointer h-full">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Bot className="w-5 h-5 text-purple-600" />
                  Chat with Breez Assistant
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-600">
                  Get instant answers to general questions about our service and app.
                </p>
              </CardContent>
            </Card>
          </Link>
        )}

        {/* Direct Messaging */}
        <Link to={createPageUrl('Messages')}>
          <Card className="hover:shadow-lg transition-shadow cursor-pointer h-full">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-teal-600" />
                Message Our Team
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-gray-600">
                Send us a message about your account, service, or billing.
              </p>
              <p className="text-sm text-gray-500 mt-2">
                ⏱️ We respond within 48 hours or by the next business day
              </p>
            </CardContent>
          </Card>
        </Link>
      </div>
    </div>
  );
}

function checkBusinessHours(businessHours) {
  if (!businessHours) return false;
  
  const now = new Date();
  const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const dayName = dayNames[now.getDay()];
  const dayConfig = businessHours[dayName];
  
  if (!dayConfig || dayConfig.closed) return false;
  
  const currentTime = now.getHours() * 60 + now.getMinutes();
  const [openHour, openMin] = dayConfig.open.split(':').map(Number);
  const [closeHour, closeMin] = dayConfig.close.split(':').map(Number);
  const openTime = openHour * 60 + openMin;
  const closeTime = closeHour * 60 + closeMin;
  
  return currentTime >= openTime && currentTime < closeTime;
}