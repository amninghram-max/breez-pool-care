import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { FlaskConical, Clock } from 'lucide-react';
import { format } from 'date-fns';

const STATUS_COLORS = {
  pending: 'bg-yellow-100 text-yellow-800',
  verified: 'bg-green-100 text-green-800',
  rejected: 'bg-red-100 text-red-800',
};

export default function ReviewPendingDosePlans({ dosePlans = [], leads = [] }) {
  const leadMap = Object.fromEntries(leads.map(l => [l.id, l]));

  const pending = dosePlans.filter(p => p.verificationStatus === 'pending');

  if (pending.length === 0) {
    return (
      <div className="text-center py-8 text-gray-400 text-sm">No pending dose plan verifications</div>
    );
  }

  return (
    <div className="space-y-3">
      {pending.map(plan => {
        const lead = leadMap[plan.leadId];
        return (
          <Card key={plan.id} className="border-blue-100">
            <CardContent className="pt-4 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-sm text-gray-900">
                    {lead ? `${lead.firstName} ${lead.lastName || ''}`.trim() : `Lead ${plan.leadId?.slice(-6)}`}
                  </p>
                  <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                    <Clock className="w-3 h-3" />
                    {plan.createdDate ? format(new Date(plan.createdDate), 'MMM d, h:mm a') : 'Unknown date'}
                  </p>
                </div>
                <Badge className={STATUS_COLORS[plan.verificationStatus] || 'bg-gray-100 text-gray-600'}>
                  {plan.verificationStatus}
                </Badge>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {plan.actions?.map((a, i) => (
                  <span key={i} className="inline-flex items-center gap-1 text-xs bg-teal-50 text-teal-700 px-2 py-0.5 rounded-full">
                    <FlaskConical className="w-3 h-3" />
                    {a.chemicalType?.replace(/_/g, ' ')} — {a.dosePrimary} {a.primaryUnit}
                  </span>
                ))}
              </div>

              {plan.retestRequired && (
                <p className="text-xs text-blue-600 flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  Retest required · {plan.retestWaitMinutes} min wait
                </p>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}