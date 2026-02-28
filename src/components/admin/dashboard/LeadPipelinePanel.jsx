import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';

const STAGES = [
  { key: 'new_lead', label: 'New', color: 'bg-gray-100 text-gray-700' },
  { key: 'contacted', label: 'Contacted', color: 'bg-blue-100 text-blue-700' },
  { key: 'quote_sent', label: 'Quoted', color: 'bg-indigo-100 text-indigo-700' },
  { key: 'inspection_scheduled', label: 'Insp. Scheduled', color: 'bg-yellow-100 text-yellow-700' },
  { key: 'inspection_confirmed', label: 'Insp. Confirmed', color: 'bg-orange-100 text-orange-700' },
  { key: 'converted', label: 'Converted', color: 'bg-green-100 text-green-700' },
  { key: 'lost', label: 'Lost / No Decision', color: 'bg-red-100 text-red-700' },
];

export default function LeadPipelinePanel({ leads }) {
  const counts = STAGES.map(s => ({
    ...s,
    count: leads.filter(l => l.stage === s.key).length
  }));

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="w-4 h-4" /> Lead Pipeline
          </CardTitle>
          <Link to={createPageUrl('LeadsPipeline')} className="text-xs text-teal-600 hover:underline">View all →</Link>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-3">
          {counts.map(s => (
            <div key={s.key} className="flex flex-col items-center bg-gray-50 rounded-lg p-3 min-w-[90px] text-center">
              <span className={`text-2xl font-bold ${s.count > 0 ? 'text-gray-900' : 'text-gray-300'}`}>{s.count}</span>
              <Badge className={`mt-1 text-xs font-normal ${s.color}`}>{s.label}</Badge>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}