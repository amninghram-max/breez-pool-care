import React from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { AlertTriangle, CheckCircle, MessageSquare, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function FecalIncidentBanner({ incident }) {
  if (!incident) return null;

  const isCleared = incident.status === 'cleared';

  if (isCleared) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white px-5 py-4 flex items-center gap-3 shadow-sm">
        <CheckCircle className="w-5 h-5 text-teal-600 flex-shrink-0" />
        <div>
          <p className="font-semibold text-gray-900 text-sm">Pool Status: Safe to Swim</p>
          <p className="text-xs text-gray-500 mt-0.5">Disinfection procedures have been completed. Your pool has been cleared.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border-2 border-gray-300 bg-gray-50 px-5 py-4 space-y-3">
      <div className="flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-gray-700 flex-shrink-0 mt-0.5" />
        <div>
          <p className="font-bold text-gray-900 text-sm tracking-wide uppercase">Pool Status: Avoid Swimming — Disinfection Pending</p>
          <p className="text-sm text-gray-600 mt-1 leading-relaxed">
            A fecal incident has been reported. Please avoid swimming until proper disinfection procedures are completed.
            We will contact you shortly with next steps.
          </p>
        </div>
      </div>
      <div className="flex gap-2 pt-1">
        <Link to={createPageUrl('CustomerMessagingPage')}>
          <Button size="sm" variant="outline" className="text-xs h-8 border-gray-300">
            <MessageSquare className="w-3.5 h-3.5 mr-1.5" />
            Message Us
          </Button>
        </Link>
      </div>
    </div>
  );
}