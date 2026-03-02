import React from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { FileText, CalendarCheck, ClipboardCheck, CalendarPlus, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Persistent quick-action bar shown at top of AdminHome.
 * onNewQuote: opens the RealQuoteModal (passed from parent)
 * onOpenInPerson: opens the InPersonSalesModal (passed from parent)
 */
export default function TopActionsBar({ onNewQuote, onOpenInPerson }) {
  return (
    <div className="flex items-center gap-2 flex-wrap bg-white border border-gray-200 rounded-xl px-4 py-3 shadow-sm">
      <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider mr-1 hidden sm:inline">Quick Actions</span>

      <Button size="sm" onClick={onNewQuote} className="bg-teal-600 hover:bg-teal-700 text-white gap-1.5">
        <FileText className="w-3.5 h-3.5" />
        New Quote
      </Button>

      <Button size="sm" onClick={onOpenInPerson} variant="outline" className="gap-1.5">
        <FileText className="w-3.5 h-3.5" />
        In-Person Flow
      </Button>

      <Link to={createPageUrl('LeadsPipeline')}>
        <Button size="sm" variant="outline" className="gap-1.5">
          <CalendarCheck className="w-3.5 h-3.5" />
          Schedule Inspection
        </Button>
      </Link>

      <Link to={createPageUrl('InspectionFinalization')}>
        <Button size="sm" variant="outline" className="gap-1.5">
          <ClipboardCheck className="w-3.5 h-3.5" />
          Finalize Inspection
        </Button>
      </Link>

      <Link to={createPageUrl('Calendar')}>
        <Button size="sm" variant="outline" className="gap-1.5">
          <CalendarPlus className="w-3.5 h-3.5" />
          Service Calendar
        </Button>
      </Link>

      <Link to={createPageUrl('AdminMessaging')}>
        <Button size="sm" variant="outline" className="gap-1.5">
          <MessageSquare className="w-3.5 h-3.5" />
          Open Inbox
        </Button>
      </Link>
    </div>
  );
}