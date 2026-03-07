import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FlaskConical, ChevronRight } from 'lucide-react';

export default function StepTrichlor({ visitData, advance }) {
  const [tabletCount, setTabletCount] = useState(
    visitData.chemicalsAdded?.chlorineTablets != null
      ? String(visitData.chemicalsAdded.chlorineTablets)
      : ''
  );
  const [placement, setPlacement] = useState(
    visitData.chemicalsAdded?.trichlorPlacement || ''
  );

  const handleContinue = () => {
    const trichlor = {};
    if (tabletCount !== '' && parseFloat(tabletCount) >= 0) {
      trichlor.chlorineTablets = parseFloat(tabletCount);
    }
    if (placement) {
      trichlor.trichlorPlacement = placement;
    }

    console.log('[StepTrichlor] ADVANCE', { trichlor });

    advance({
      chemicalsAdded: {
        ...(visitData.chemicalsAdded || {}),
        ...trichlor
      }
    });
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Trichlor Tablets</h2>
        <p className="text-gray-500 text-sm mt-1">Record any tablets added during this visit</p>
      </div>

      <Card>
        <CardContent className="pt-5 space-y-4">
          <div className="flex items-center gap-2">
            <FlaskConical className="w-4 h-4 text-teal-600" />
            <p className="text-sm font-bold text-gray-700 uppercase tracking-wide">Trichlor Tablets</p>
          </div>

          <div>
            <Label htmlFor="trichlor-count" className="text-sm text-gray-700 block mb-2">
              Tablet Count
            </Label>
            <Input
              id="trichlor-count"
              type="number"
              placeholder="e.g., 3"
              min="0"
              step="1"
              value={tabletCount}
              onChange={e => setTabletCount(e.target.value)}
              className="text-sm"
            />
          </div>

          <div>
            <Label htmlFor="trichlor-placement" className="text-sm text-gray-700 block mb-2">
              Placement Location
            </Label>
            <select
              id="trichlor-placement"
              value={placement}
              onChange={e => setPlacement(e.target.value)}
              className="w-full text-sm px-3 py-2 border border-gray-300 rounded-md bg-white hover:border-gray-400 focus:outline-none focus:ring-1 focus:ring-teal-500"
            >
              <option value="">— Select placement —</option>
              <option value="skimmer">Skimmer</option>
              <option value="floater">Floater</option>
              <option value="inline_feeder">Inline Feeder</option>
            </select>
          </div>

          {tabletCount !== '' && placement && (
            <div className="p-2 rounded bg-teal-50 border border-teal-200">
              <p className="text-xs text-teal-700">
                ✓ {tabletCount} tablet{tabletCount !== '1' ? 's' : ''} placed in{' '}
                {{ skimmer: 'skimmer', floater: 'floater', inline_feeder: 'inline feeder' }[placement]}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <Button
        className="w-full bg-teal-600 hover:bg-teal-700 h-14 text-base"
        onClick={handleContinue}
      >
        <ChevronRight className="w-5 h-5 mr-2" />
        {tabletCount !== '' || placement ? 'Continue' : 'Skip — No Tablets Added'}
      </Button>
    </div>
  );
}