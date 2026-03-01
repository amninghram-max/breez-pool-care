import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { History, ChevronDown, ChevronUp } from 'lucide-react';
import { format, parseISO } from 'date-fns';

export default function EquipmentChangeHistory({ equipmentId }) {
  const [open, setOpen] = useState(false);

  const { data: logs = [] } = useQuery({
    queryKey: ['eqChangeLogs', equipmentId],
    queryFn: () => base44.entities.EquipmentChangeLog.filter({ equipmentId }, '-changedAt'),
    enabled: open
  });

  return (
    <div className="border-t border-gray-100 mt-3 pt-2">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 transition-colors"
      >
        <History className="w-3.5 h-3.5" />
        Change history {logs.length > 0 && `(${logs.length})`}
        {open ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
      </button>

      {open && (
        <div className="mt-2 space-y-2 max-h-64 overflow-y-auto">
          {logs.length === 0 ? (
            <p className="text-xs text-gray-400">No changes recorded yet.</p>
          ) : logs.map(log => (
            <div key={log.id} className="bg-gray-50 rounded-lg p-2.5 text-xs">
              <div className="flex items-start justify-between gap-2">
                <span className="font-medium text-gray-700 capitalize">{log.fieldChanged.replace(/_/g, ' ')}</span>
                <span className="text-gray-400 flex-shrink-0">
                  {log.changedAt ? format(parseISO(log.changedAt), 'MMM d, yyyy h:mm a') : '—'}
                </span>
              </div>
              <p className="text-gray-500 mt-0.5">by {log.changedByName || log.changedByUserId}</p>
              {log.reason && <p className="text-gray-600 italic mt-0.5">"{log.reason}"</p>}
              <div className="mt-1.5 grid grid-cols-2 gap-2">
                {log.snapshotBefore && (
                  <div>
                    <span className="text-gray-400 block">Before</span>
                    <pre className="text-gray-600 whitespace-pre-wrap break-all text-xs bg-white rounded p-1 border mt-0.5">
                      {(() => { try { return JSON.stringify(JSON.parse(log.snapshotBefore), null, 2); } catch { return log.snapshotBefore; } })()}
                    </pre>
                  </div>
                )}
                {log.snapshotAfter && (
                  <div>
                    <span className="text-gray-400 block">After</span>
                    <pre className="text-gray-600 whitespace-pre-wrap break-all text-xs bg-white rounded p-1 border mt-0.5">
                      {(() => { try { return JSON.stringify(JSON.parse(log.snapshotAfter), null, 2); } catch { return log.snapshotAfter; } })()}
                    </pre>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}