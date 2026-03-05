import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';

const STAGES = [
  { key: 'new_lead',               label: 'New',                color: 'bg-gray-100 text-gray-700' },
  { key: 'contacted',              label: 'Contacted',          color: 'bg-blue-100 text-blue-700' },
  { key: 'inspection_scheduled',   label: 'Insp. Scheduled',    color: 'bg-yellow-100 text-yellow-700' },
  { key: 'inspection_confirmed',   label: 'Insp. Confirmed',    color: 'bg-orange-100 text-orange-700' },
  { key: 'quote_sent',             label: 'Quote Sent',         color: 'bg-purple-100 text-purple-700' },
  { key: 'converted',              label: 'Converted',          color: 'bg-green-100 text-green-700' },
  { key: 'lost',                   label: 'Lost',               color: 'bg-red-100 text-red-700' },
];

export default function LeadPipelinePanel({ leads }) {
  const counts = STAGES.map(s => ({
    ...s,
    count: leads.filter(l => !l.isDeleted && l.stage === s.key).length
  }));

  const total = leads.filter(l => !l.isDeleted).length;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="w-4 h-4" /> Lead Pipeline
          </CardTitle>
          <Link to={createPageUrl('LeadsPipeline')} className="text-xs text-teal-600 hover:underline">
            View all →
          </Link>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
          {counts.map(s => (
            <Link
              key={s.key}
              to={`${createPageUrl('LeadsPipeline')}?stage=${s.key}`}
              className="flex flex-col items-center bg-gray-50 hover:bg-gray-100 transition-colors rounded-lg p-2 text-center cursor-pointer"
            >
              <span className={`text-2xl font-bold ${s.count > 0 ? 'text-gray-900' : 'text-gray-300'}`}>
                {s.count}
              </span>
              <Badge className={`mt-1 text-xs font-normal whitespace-normal text-center ${s.color}`}>
                {s.label}
              </Badge>
            </Link>
          ))}
        </div>
        <p className="text-xs text-gray-400 mt-3 text-right">{total} total leads</p>
      </CardContent>
    </Card>
  );
}