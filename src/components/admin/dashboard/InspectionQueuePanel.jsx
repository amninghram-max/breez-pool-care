import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ClipboardCheck, ChevronRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { format, parseISO } from 'date-fns';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import InspectionFinalizePanel from '../InspectionFinalizePanel';

export default function InspectionQueuePanel() {
  const [selectedId, setSelectedId] = useState(null);

  const { data: pending = [] } = useQuery({
    queryKey: ['pendingInspections'],
    queryFn: () => base44.entities.InspectionRecord.filter(
      { finalizationStatus: 'pending_finalization' }, '-submittedAt'
    )
  });

  const { data: leads = [] } = useQuery({
    queryKey: ['leadsMinimal'],
    queryFn: () => base44.entities.Lead.list('-created_date', 200)
  });

  const leadMap = Object.fromEntries(leads.map(l => [l.id, l]));
  const selected = pending.find(r => r.id === selectedId);
  const selectedLead = selected ? leadMap[selected.leadId] : null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <ClipboardCheck className="w-4 h-4" /> Inspection Queue
            {pending.length > 0 && (
              <Badge className="bg-orange-100 text-orange-800 ml-1">{pending.length} pending</Badge>
            )}
          </CardTitle>
          <Link to={createPageUrl('InspectionFinalization')} className="text-xs text-teal-600 hover:underline">Full queue →</Link>
        </div>
      </CardHeader>
      <CardContent>
        {pending.length === 0 ? (
          <p className="text-sm text-gray-500">No inspections pending finalization.</p>
        ) : (
          <div className="space-y-2">
            {pending.slice(0, 5).map(record => {
              const lead = leadMap[record.leadId];
              return (
                <div
                  key={record.id}
                  className={`border rounded-lg p-3 cursor-pointer transition-colors ${
                    selectedId === record.id ? 'border-teal-400 bg-teal-50' : 'border-gray-200 hover:bg-gray-50'
                  }`}
                  onClick={() => setSelectedId(selectedId === record.id ? null : record.id)}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-gray-900">
                        {lead ? `${lead.firstName} ${lead.lastName || ''}`.trim() : 'Unknown Customer'}
                      </p>
                      <p className="text-xs text-gray-400">
                        {record.submittedAt ? format(parseISO(record.submittedAt), 'MMM d, h:mm a') : '—'} · by {record.submittedByName}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className="bg-orange-100 text-orange-800 text-xs capitalize">
                        {record.confirmedPoolCondition?.replace(/_/g, ' ')}
                      </Badge>
                      <ChevronRight className={`w-4 h-4 text-gray-400 transition-transform ${selectedId === record.id ? 'rotate-90' : ''}`} />
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Inline finalize panel */}
            {selected && selectedLead && (
              <div className="border border-teal-200 rounded-xl p-4 bg-teal-50/40 mt-2">
                <InspectionFinalizePanel
                  inspectionRecord={selected}
                  lead={selectedLead}
                  onFinalized={() => setSelectedId(null)}
                />
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}