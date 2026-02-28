import React from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Card, CardContent } from '@/components/ui/card';
import { MessageSquare, Phone, Mail } from 'lucide-react';
import { format } from 'date-fns';

export default function CommunicationSection({ lead, recentMessages = [] }) {
  const phone = lead?.mobilePhone;
  const email = lead?.email;

  const contactOptions = [
    {
      label: 'Message',
      icon: MessageSquare,
      href: createPageUrl('CustomerMessagingPage'),
      isLink: true,
    },
    phone && {
      label: 'Call',
      icon: Phone,
      href: `tel:${phone}`,
      isLink: false,
    },
    phone && {
      label: 'Text',
      icon: Phone,
      href: `sms:${phone}`,
      isLink: false,
    },
    email && {
      label: 'Email',
      icon: Mail,
      href: `mailto:${email}`,
      isLink: false,
    },
  ].filter(Boolean);

  return (
    <Card className="border-gray-100">
      <CardContent className="pt-5 space-y-4">
        <p className="text-xs text-gray-400 uppercase tracking-wide font-medium">Get in Touch</p>

        <div className="grid grid-cols-4 gap-2">
          {contactOptions.map(opt => {
            const Icon = opt.icon;
            const inner = (
              <div className="flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl border border-gray-200 hover:border-gray-300 hover:bg-gray-50 transition-all cursor-pointer">
                <Icon className="w-4 h-4 text-gray-600" />
                <span className="text-xs text-gray-600 font-medium">{opt.label}</span>
              </div>
            );
            return opt.isLink ? (
              <Link key={opt.label} to={opt.href}>{inner}</Link>
            ) : (
              <a key={opt.label} href={opt.href}>{inner}</a>
            );
          })}
        </div>

        {/* Recent message preview */}
        {recentMessages.length > 0 && (
          <div className="border-t border-gray-100 pt-3 space-y-2">
            <p className="text-xs text-gray-400">Recent</p>
            {recentMessages.slice(0, 2).map((msg, i) => (
              <div key={i} className="text-xs text-gray-500 flex items-start gap-2">
                <span className="mt-0.5 w-1 h-1 rounded-full bg-gray-300 flex-shrink-0" />
                <span className="leading-relaxed line-clamp-2">{msg.body || msg.content}</span>
              </div>
            ))}
            <Link to={createPageUrl('CustomerMessagingPage')} className="text-xs text-teal-600 font-medium hover:underline">
              View all messages →
            </Link>
          </div>
        )}
      </CardContent>
    </Card>
  );
}