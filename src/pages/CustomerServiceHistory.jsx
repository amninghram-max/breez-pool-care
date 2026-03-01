import React from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { ChevronLeft, Download } from 'lucide-react';
import { createPageUrl } from '@/utils';
import { Link } from 'react-router-dom';
import VisitHistoryCard from '../components/customer/VisitHistoryCard';

export default function CustomerServiceHistory() {
  const { data: user } = useQuery({
    queryKey: ['user'],
    queryFn: () => base44.auth.me(),
  });

  const { data: lead } = useQuery({
    queryKey: ['customerLead'],
    queryFn: async () => {
      const leads = await base44.entities.Lead.filter({ email: user.email });
      return leads[0] || null;
    },
    enabled: !!user,
  });

  const { data: pool } = useQuery({
    queryKey: ['customerPool', lead?.id],
    queryFn: () => base44.entities.Pool.filter({ leadId: lead.id }).then(r => r[0]),
    enabled: !!lead,
  });

  const { data: records = [], isLoading } = useQuery({
    queryKey: ['allChemRecords', pool?.id],
    queryFn: () => base44.entities.ChemTestRecord.filter({ poolId: pool.id }, '-testDate', 50),
    enabled: !!pool,
  });

  const { data: dosePlans = [] } = useQuery({
    queryKey: ['allDosePlans', pool?.id],
    queryFn: () => base44.entities.DosePlan.filter({ poolId: pool.id }, '-createdDate', 50),
    enabled: !!pool,
  });

  const { data: retestRecords = [] } = useQuery({
    queryKey: ['allRetestRecords', pool?.id],
    queryFn: () => base44.entities.RetestRecord.filter({ poolId: pool.id }, '-retestDate', 50),
    enabled: !!pool,
  });

  // Build lookup maps
  const dosePlanByTestRecord = Object.fromEntries(dosePlans.map(d => [d.testRecordId, d]));
  const retestByOriginalTest = Object.fromEntries(retestRecords.map(r => [r.originalTestId, r]));

  return (
    <div className="space-y-5 max-w-xl mx-auto">
      <div className="flex items-center gap-3">
        <Link to={createPageUrl('ClientHome')}>
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <ChevronLeft className="w-4 h-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Service History</h1>
          <p className="text-xs text-gray-500">Your recorded pool service visits</p>
        </div>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin w-6 h-6 border-4 border-teal-500 border-t-transparent rounded-full" />
        </div>
      )}

      {!isLoading && records.length === 0 && (
        <div className="text-center py-12 text-gray-400 text-sm">
          No service visits recorded yet
        </div>
      )}

      <div className="space-y-3">
        {records.map(record => (
          <div key={record.id} className="space-y-1">
            <VisitHistoryCard
              record={record}
              dosePlan={dosePlanByTestRecord[record.id]}
              retestRecord={retestByOriginalTest[record.id]}
            />
            <div className="flex justify-end px-1">
              <Button
                variant="ghost"
                size="sm"
                className="text-xs text-gray-400 h-7 cursor-not-allowed"
                disabled
                title="Coming soon"
              >
                Download Full Service Report
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}