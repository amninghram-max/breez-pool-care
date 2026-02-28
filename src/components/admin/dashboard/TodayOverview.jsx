import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Droplet, Users, ClipboardCheck, DollarSign, CheckCircle, Clock } from 'lucide-react';

function Metric({ label, value, sub, icon: Icon, color }) {
  return (
    <Card>
      <CardContent className="pt-5 pb-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wide">{label}</p>
            <p className={`text-2xl font-bold mt-1 ${color || 'text-gray-900'}`}>{value}</p>
            {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
          </div>
          {Icon && (
            <div className={`p-2.5 rounded-lg ${color?.includes('teal') ? 'bg-teal-100' : color?.includes('green') ? 'bg-green-100' : color?.includes('blue') ? 'bg-blue-100' : color?.includes('purple') ? 'bg-purple-100' : 'bg-gray-100'}`}>
              <Icon className={`w-4 h-4 ${color || 'text-gray-600'}`} />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default function TodayOverview({ todayEvents, leads, inspectionsToday }) {
  const today = new Date().toISOString().split('T')[0];
  const todayVisits = todayEvents.filter(e => e.eventType === 'service' || e.eventType === 'recovery' || e.eventType === 'retest');
  const completed = todayVisits.filter(e => e.status === 'completed').length;
  const remaining = todayVisits.length - completed;

  const activeCustomers = leads.filter(l => l.stage === 'converted' && l.accountStatus === 'active').length;
  const mrr = leads
    .filter(l => l.monthlyServiceAmount && l.accountStatus === 'active')
    .reduce((s, l) => s + l.monthlyServiceAmount, 0);

  const openLeads = leads.filter(l => ['new_lead', 'contacted', 'inspection_scheduled', 'inspection_confirmed', 'quote_sent'].includes(l.stage)).length;

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
      <Metric label="Visits Today" value={todayVisits.length} icon={Droplet} color="text-teal-600" />
      <Metric label="Completed" value={completed} sub={`of ${todayVisits.length}`} icon={CheckCircle} color="text-green-600" />
      <Metric label="Remaining" value={remaining} icon={Clock} color="text-blue-600" />
      <Metric label="Inspections Today" value={inspectionsToday} icon={ClipboardCheck} color="text-purple-600" />
      <Metric label="Active Customers" value={activeCustomers} icon={Users} color="text-teal-600" />
      <Metric label="MRR" value={`$${mrr.toFixed(0)}`} icon={DollarSign} color="text-green-600" />
    </div>
  );
}