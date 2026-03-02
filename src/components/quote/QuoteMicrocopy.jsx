import React from 'react';
import { Check, Info } from 'lucide-react';

export function QuoteTrustBadges() {
  return (
    <div className="flex flex-wrap gap-4 justify-center text-sm text-teal-800">
      {['Free inspection', 'No obligation', 'Transparent pricing'].map((item) => (
        <span key={item} className="flex items-center gap-1.5 bg-teal-50 border border-teal-200 rounded-full px-3 py-1">
          <Check className="w-3.5 h-3.5 text-teal-600" />
          {item}
        </span>
      ))}
    </div>
  );
}

export function QuoteDisclaimer() {
  return (
    <div className="flex items-start gap-2 rounded-lg px-4 py-3 text-xs bg-gray-50 border border-gray-200 text-gray-600">
      <Info className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
      <span>
        This quote is based on the pool details provided. Final pricing is confirmed during the free inspection and may change if actual conditions differ.
      </span>
    </div>
  );
}

export function PriceConfirmedBadge() {
  return (
    <span className="inline-flex items-center gap-1.5 bg-green-100 text-green-800 border border-green-300 rounded-full px-3 py-1 text-sm font-medium">
      <Check className="w-3.5 h-3.5" />
      Price Confirmed
    </span>
  );
}

export function PriceAdjustedBadge() {
  return (
    <span className="inline-flex items-center gap-1.5 bg-blue-100 text-blue-800 border border-blue-300 rounded-full px-3 py-1 text-sm font-medium">
      <Info className="w-3.5 h-3.5" />
      Price Updated After Inspection
    </span>
  );
}

const FRIENDLY_REASON_LABELS = {
  SIZE_MISMATCH: 'Pool size differed from estimate',
  SCREENING_STATUS_MISMATCH: 'Pool enclosure status changed',
  TREE_EXPOSURE_MISMATCH: 'Tree/debris exposure updated',
  CHLORINATION_METHOD_MISMATCH: 'Chlorination method updated',
  USAGE_MISMATCH: 'Pool usage frequency updated',
  PETS_MISMATCH: 'Pet access details updated',
  CONDITION_MISMATCH: 'Pool condition updated',
  FILTER_MISMATCH: 'Filter type updated',
  POOL_TYPE_MISMATCH: 'Pool type updated',
  SPA_MISMATCH: 'Spa/hot tub status updated'
};

export function AdjustmentReasons({ codes }) {
  if (!codes || codes.length === 0) return null;
  return (
    <ul className="mt-2 space-y-1 text-sm text-blue-800">
      {codes.map(code => (
        <li key={code} className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-500 flex-shrink-0" />
          {FRIENDLY_REASON_LABELS[code] || code}
        </li>
      ))}
    </ul>
  );
}