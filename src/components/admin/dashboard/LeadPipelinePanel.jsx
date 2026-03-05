import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Users, FileText, Calendar, CheckCircle, Star } from 'lucide-react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';

// These 4 buckets map to the business stages the user cares about on the dashboard
const BUCKETS = [
  {
    key: 'quoted',
    label: 'Quoted / Contacted',
    description: 'Quote sent, awaiting scheduling',
    stages: ['quote_sent', 'contacted'],
    color: 'bg-purple-50 border-purple-200 text-purple-700',
    numColor: 'text-purple-700',
    icon: FileText,
    iconColor: 'text-purple-500',
    pipelineStage: 'contacted',
  },
  {
    key: 'inspection_scheduled',
    label: 'Inspection Scheduled',
    description: 'Inspection booked or confirmed',
    stages: ['inspection_scheduled'],
    color: 'bg-yellow-50 border-yellow-200 text-yellow-700',
    numColor: 'text-yellow-700',
    icon: Calendar,
    iconColor: 'text-yellow-500',
    pipelineStage: 'inspection_scheduled',
  },
  {
    key: 'pending_acceptance',
    label: 'Pending Acceptance',
    description: 'Awaiting payment / activation',
    stages: ['inspection_confirmed'],
    color: 'bg-orange-50 border-orange-200 text-orange-700',
    numColor: 'text-orange-700',
    icon: CheckCircle,
    iconColor: 'text-orange-500',
    pipelineStage: 'pending_acceptance',
  },
  {
    key: 'converted',
    label: 'Active Customers',
    description: 'Paying, active service',
    stages: ['converted'],
    color: 'bg-teal-50 border-teal-200 text-teal-700',
    numColor: 'text-teal-700',
    icon: Star,
    iconColor: 'text-teal-500',
    pipelineStage: 'converted',
  },
];

export default function LeadPipelinePanel({ leads }) {
  const buckets = BUCKETS.map(b => ({
    ...b,
    count: leads.filter(l => !l.isDeleted && b.stages.includes(l.stage)).length,
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
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {buckets.map(b => {
            const Icon = b.icon;
            return (
              <Link
                key={b.key}
                to={`${createPageUrl('LeadsPipeline')}?stage=${b.pipelineStage}`}
                className={`flex flex-col items-center border rounded-xl p-4 text-center transition-all hover:shadow-md hover:-translate-y-0.5 ${b.color}`}
              >
                <Icon className={`w-5 h-5 mb-2 ${b.iconColor}`} />
                <span className={`text-3xl font-bold ${b.numColor} ${b.count === 0 ? 'opacity-30' : ''}`}>
                  {b.count}
                </span>
                <span className="mt-1 text-xs font-semibold leading-tight">{b.label}</span>
                <span className="mt-0.5 text-xs opacity-60 leading-tight hidden sm:block">{b.description}</span>
              </Link>
            );
          })}
        </div>
        <p className="text-xs text-gray-400 mt-3 text-right">{total} total leads</p>
      </CardContent>
    </Card>
  );
}