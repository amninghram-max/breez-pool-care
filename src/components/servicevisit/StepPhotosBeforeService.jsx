import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ChevronRight, X, ImagePlus, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

function PhotoGrid({ photos, onRemove }) {
  if (!photos.length) return null;
  return (
    <div className="flex flex-wrap gap-2 mt-2">
      {photos.map((url, i) => (
        <div key={url} className="relative">
          <img src={url} alt={`photo-${i}`} className="w-20 h-20 object-cover rounded-lg border border-gray-200" />
          {onRemove && (
            <button
              onClick={() => onRemove(i)}
              className="absolute -top-1.5 -right-1.5 bg-white rounded-full border border-gray-300 text-gray-500 hover:text-red-600 p-0.5"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

export default function StepPhotosBeforeService({ visitData, advance }) {
  const [photosBefore, setPhotosBefore] = useState(visitData.photosBefore || []);
  const [uploading, setUploading] = useState(false);

  const upload = async (file) => {
    if (!file) return;
    setUploading(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      setPhotosBefore(prev => [...prev, file_url]);
      toast.success('Photo uploaded');
    } finally {
      setUploading(false);
    }
  };

  const handleAdd = (e) => upload(e.target.files?.[0]);
  const removeBefore = (i) => setPhotosBefore(prev => prev.filter((_, idx) => idx !== i));

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Before Photos</h2>
        <p className="text-gray-500 text-sm mt-1">Capture the pool condition at arrival (optional)</p>
      </div>

      <Card>
        <CardContent className="pt-5 space-y-3">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-gray-700">Pool Condition</p>
              <span className="text-xs text-gray-400">{photosBefore.length} photo{photosBefore.length !== 1 ? 's' : ''}</span>
            </div>

            <label className={`flex items-center gap-2 cursor-pointer border-2 border-dashed rounded-lg px-3 py-2.5 transition-colors
              ${uploading ? 'border-gray-200 opacity-60' : 'border-gray-200 hover:border-teal-400'}`}>
              {uploading
                ? <Loader2 className="w-4 h-4 animate-spin text-teal-600 flex-shrink-0" />
                : <ImagePlus className="w-4 h-4 text-gray-400 flex-shrink-0" />}
              <span className="text-sm text-gray-500">
                {uploading ? 'Uploading…' : photosBefore.length > 0 ? 'Add another photo' : 'Tap to capture or choose photo'}
              </span>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                multiple={false}
                className="hidden"
                onChange={handleAdd}
                disabled={uploading}
              />
            </label>

            <PhotoGrid photos={photosBefore} onRemove={removeBefore} />
          </div>
        </CardContent>
      </Card>

      <Button
        className="w-full bg-teal-600 hover:bg-teal-700 h-14 text-base"
        onClick={() => advance({ photosBefore })}
      >
        <ChevronRight className="w-5 h-5 mr-2" />
        Continue → Service Tasks
      </Button>
    </div>
  );
}