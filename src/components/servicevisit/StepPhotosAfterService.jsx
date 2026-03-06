import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ChevronRight, X, ImagePlus, Loader2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

// Modal for retest override confirmation
function SkipRetestModal({ onConfirm, onCancel }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/40">
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-xl p-6 space-y-4">
        <div className="flex items-start justify-between">
          <h3 className="font-bold text-gray-900 text-lg">Skip Retest?</h3>
          <button onClick={onCancel} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-orange-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-orange-900">Skip post-treatment retest?</p>
            <p className="text-xs text-orange-700 mt-1">The pool was treated. A retest is recommended to verify treatment success. You can proceed to closeout, but a follow-up revisit may be flagged.</p>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <Button
            className="w-full bg-teal-600 hover:bg-teal-700 h-11"
            onClick={() => { console.log('[StepPhotosAfterService] manual override confirmed'); onConfirm(); }}
          >
            Yes, Skip Retest & Close
          </Button>
          <Button
            variant="outline"
            className="w-full border-orange-400 text-orange-700 hover:bg-orange-50 h-11"
            onClick={onCancel}
          >
            Cancel, Return to Retest
          </Button>
        </div>
      </div>
    </div>
  );
}

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

export default function StepPhotosAfterService({ visitData, advance }) {
  const [photosAfter, setPhotosAfter] = useState(visitData.photosAfter || []);
  const [uploading, setUploading] = useState(false);

  const upload = async (file) => {
    if (!file) return;
    setUploading(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      setPhotosAfter(prev => [...prev, file_url]);
      toast.success('Photo uploaded');
    } finally {
      setUploading(false);
    }
  };

  const handleAdd = (e) => upload(e.target.files?.[0]);
  const removeAfter = (i) => setPhotosAfter(prev => prev.filter((_, idx) => idx !== i));

  const canAdvance = photosAfter.length > 0 && !uploading;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">After Photos</h2>
        <p className="text-gray-500 text-sm mt-1">Capture the pool condition after service</p>
      </div>

      <Card>
        <CardContent className="pt-5 space-y-3">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-gray-700">
                Pool Condition
                {photosAfter.length === 0 && <span className="text-orange-500 ml-1">*</span>}
              </p>
              <span className="text-xs text-gray-400">{photosAfter.length} photo{photosAfter.length !== 1 ? 's' : ''}</span>
            </div>

            <label className={`flex items-center gap-2 cursor-pointer border-2 border-dashed rounded-lg px-3 py-2.5 transition-colors
              ${uploading ? 'border-gray-200 opacity-60' : 'border-gray-200 hover:border-teal-400'}`}>
              {uploading
                ? <Loader2 className="w-4 h-4 animate-spin text-teal-600 flex-shrink-0" />
                : <ImagePlus className="w-4 h-4 text-gray-400 flex-shrink-0" />}
              <span className="text-sm text-gray-500">
                {uploading ? 'Uploading…' : photosAfter.length > 0 ? 'Add another photo' : 'Tap to capture or choose photo'}
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

            <PhotoGrid photos={photosAfter} onRemove={removeAfter} />
          </div>
        </CardContent>
      </Card>

      {!canAdvance && (
        <p className="text-xs text-center text-orange-500">
          Add at least one after-service photo before closing
        </p>
      )}

      <Button
        className="w-full bg-teal-600 hover:bg-teal-700 h-14 text-base"
        disabled={!canAdvance}
        onClick={() => advance({ photosAfter })}
      >
        <ChevronRight className="w-5 h-5 mr-2" />
        Photos Done → Close Visit
      </Button>
    </div>
  );
}