import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';
import { Download, Image, CheckCircle } from 'lucide-react';

export default function ServiceRecordCard({ record, dosePlan }) {
  const [downloading, setDownloading] = useState(false);

  const notes = [];
  if (dosePlan?.actions?.length > 0) {
    const applied = dosePlan.actions.filter(a => a.applied !== false);
    if (applied.length > 0) notes.push(`${applied.length} chemical adjustment${applied.length > 1 ? 's' : ''} made`);
  }
  if (dosePlan?.retestRequired) notes.push('Follow-up monitoring scheduled');
  if (record?.notes) notes.push(record.notes);

  const beforePhotos = record?.photoBefore || [];
  const afterPhotos = record?.photoAfter || [];
  const allPhotos = [...beforePhotos, ...afterPhotos];

  const handleDownloadReport = async () => {
    setDownloading(true);
    try {
      const res = await base44.functions.invoke('exportChemistryCSV', { poolId: record.poolId });
      const blob = new Blob([res.data], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `service-report-${format(new Date(record.testDate), 'yyyy-MM-dd')}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setDownloading(false);
    }
  };

  if (!record) return null;

  return (
    <Card className="border-gray-100">
      <CardContent className="pt-5 space-y-4">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-teal-600" />
              <p className="font-semibold text-gray-900 text-sm">Service Completed</p>
            </div>
            <p className="text-xs text-gray-500 mt-0.5 pl-6">
              {format(new Date(record.testDate), "EEEE, MMMM d 'at' h:mm a")}
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDownloadReport}
            disabled={downloading}
            className="text-xs text-gray-400 hover:text-gray-600 h-7"
          >
            <Download className="w-3 h-3 mr-1" />
            {downloading ? 'Downloading…' : 'Download Report'}
          </Button>
        </div>

        {/* Before/After photos */}
        {allPhotos.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs text-gray-400 uppercase tracking-wide font-medium flex items-center gap-1.5">
              <Image className="w-3 h-3" /> Photos
            </p>
            <div className="grid grid-cols-3 gap-2">
              {allPhotos.slice(0, 6).map((url, i) => (
                <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                  <img
                    src={url}
                    alt={`Service photo ${i + 1}`}
                    className="w-full h-20 object-cover rounded-lg border border-gray-100 hover:opacity-90 transition-opacity"
                  />
                </a>
              ))}
            </div>
          </div>
        )}

        {/* Service notes */}
        {notes.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs text-gray-400 uppercase tracking-wide font-medium">Notes</p>
            <ul className="space-y-1">
              {notes.map((note, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-gray-600">
                  <span className="mt-1.5 w-1 h-1 rounded-full bg-gray-300 flex-shrink-0" />
                  {note}
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}