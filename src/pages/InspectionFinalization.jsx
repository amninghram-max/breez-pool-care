import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ClipboardList, CheckCircle2, Clock, AlertCircle } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import InspectionFinalizePanel from '../components/inspection/InspectionFinalizePanel';

/**
 * Admin / authorized finalizer view.
 * Lists all pending inspections for finalization.
 */
export default function InspectionFinalization() {
  const [selectedId, setSelectedId] = useState(null);
  const [refresh, setRefresh] = useState(0);

  const { data: user } = useQuery({
    queryKey: ['user'],
    queryFn: () => base44.auth.me(),
  });

  const { data: pending = [], isLoading } = useQuery({
    queryKey: ['pendingInspections', refresh],
    queryFn: () =>
      base44.entities.InspectionRecord.filter({ finalizationStatus: 'pending_finalization' }, '-submittedAt', 50),
  });

  const { data: leads = [] } = useQuery({
    queryKey: ['allLeads'],
    queryFn: () => base44.entities.Lead.list('-created_date', 200),
  });

  const isAdmin = user?.role === 'admin';
  const isFinalizer = user?.canFinalizeInspections === true;

  if (!isAdmin && !isFinalizer) {
    return (
      <div className="max-w-xl mx-auto py-20 text-center">
        <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
        <h2 className="text-xl font-bold text-gray-800">Access Denied</h2>
        <p className="text-gray-500 mt-1">Admin or Inspection Finalizer permission required.</p>
      </div>
    );
  }

  const selectedRecord = pending.find(r => r.id === selectedId);
  const selectedLead = selectedRecord ? leads.find(l => l.id === selectedRecord.leadId) : null;

  const conditionBadge = (c) => {
    if (c === 'green') return <Badge className="bg-green-100 text-green-800">Green</Badge>;
    if (c === 'slightly_cloudy') return <Badge className="bg-yellow-100 text-yellow-800">Cloudy</Badge>;
    return <Badge className="bg-blue-100 text-blue-800">Clear</Badge>;
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Inspection Finalization</h1>
        <p className="text-sm text-gray-500 mt-0.5">Review and finalize submitted inspections</p>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-gray-400">Loading...</div>
      ) : (
        <div className="grid lg:grid-cols-5 gap-6">
          {/* Left: queue */}
          <div className="lg:col-span-2 space-y-3">
            {pending.length === 0 && (
              <div className="text-center py-12">
                <CheckCircle2 className="w-10 h-10 text-teal-400 mx-auto mb-3" />
                <p className="text-gray-500 text-sm">No pending inspections</p>
              </div>
            )}
            {pending.map(record => {
              const lead = leads.find(l => l.id === record.leadId);
              return (
                <Card
                  key={record.id}
                  className={`cursor-pointer transition-all hover:shadow-md ${selectedId === record.id ? 'ring-2 ring-teal-500' : ''}`}
                  onClick={() => setSelectedId(record.id)}
                >
                  <CardContent className="p-4 space-y-2">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-semibold text-sm text-gray-900">
                          {lead ? `${lead.firstName} ${lead.lastName}` : 'Unknown Lead'}
                        </p>
                        <p className="text-xs text-gray-400">{lead?.serviceAddress}</p>
                      </div>
                      {conditionBadge(record.confirmedPoolCondition)}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-gray-400">
                      <Clock className="w-3 h-3" />
                      {record.submittedAt ? format(parseISO(record.submittedAt), 'MMM d, h:mm a') : '—'}
                      <span>by {record.submittedByName}</span>
                    </div>
                    <Badge className="bg-amber-100 text-amber-800 text-xs">Pending Finalization</Badge>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Right: finalization panel */}
          <div className="lg:col-span-3">
            {selectedRecord ? (
              <InspectionFinalizePanel
                inspectionRecord={selectedRecord}
                lead={selectedLead}
                onFinalized={(outcome) => {
                  setSelectedId(null);
                  setRefresh(r => r + 1);
                }}
              />
            ) : (
              <Card className="border-dashed border-2">
                <CardContent className="py-16 text-center">
                  <ClipboardList className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-400 text-sm">Select an inspection to finalize</p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}
    </div>
  );
}