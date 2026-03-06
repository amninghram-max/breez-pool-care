import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ChevronRight, CheckSquare, Square } from 'lucide-react';

// Mirrors ServiceVisit.servicesPerformed enum exactly
const CHECKLIST_ITEMS = [
  { key: 'skim',          label: 'Skim surface debris' },
  { key: 'brush',         label: 'Brush walls & steps' },
  { key: 'vacuum',        label: 'Vacuum pool floor' },
  { key: 'empty_baskets', label: 'Empty skimmer & pump baskets' },
  { key: 'filter_check',  label: 'Inspect filter / gauge' },
  { key: 'backwash',      label: 'Backwash filter' },
  { key: 'test_equipment',label: 'Test pump, timer & equipment' },
];

// Tasks that are always expected — at least these should be checked before proceeding
const EXPECTED_TASKS = ['skim', 'brush', 'empty_baskets', 'filter_check'];

export default function StepChecklist({ visitData, advance }) {
  const [checked, setChecked] = useState(() => {
    // Rehydrate from persisted visitData if available
    if (visitData?.servicesPerformed && visitData.servicesPerformed.length > 0) {
      console.log('[StepChecklist] hydrating from visitData.servicesPerformed:', visitData.servicesPerformed);
      return new Set(visitData.servicesPerformed);
    }
    return new Set();
  });

  const toggle = (key) => {
    setChecked(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const missingExpected = EXPECTED_TASKS.filter(k => !checked.has(k));
  const canAdvance = missingExpected.length === 0;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Service Tasks</h2>
        <p className="text-gray-500 text-sm mt-1">Check off each task as you complete it</p>
      </div>

      <Card>
        <CardContent className="pt-4 pb-2 divide-y divide-gray-100">
          {CHECKLIST_ITEMS.map(({ key, label }) => {
            const isChecked = checked.has(key);
            const isExpected = EXPECTED_TASKS.includes(key);
            return (
              <button
                key={key}
                onClick={() => toggle(key)}
                className={`w-full flex items-center gap-3 py-3.5 px-1 text-left transition-colors rounded
                  ${isChecked ? 'text-teal-800' : 'text-gray-700 hover:bg-gray-50'}`}
              >
                {isChecked
                  ? <CheckSquare className="w-5 h-5 text-teal-600 flex-shrink-0" />
                  : <Square className="w-5 h-5 text-gray-300 flex-shrink-0" />}
                <span className="font-medium text-sm flex-1">{label}</span>
                {isExpected && !isChecked && (
                  <span className="text-xs text-orange-500 font-medium">Required</span>
                )}
              </button>
            );
          })}
        </CardContent>
      </Card>

      {!canAdvance && (
        <p className="text-xs text-center text-orange-500">
          Complete all required tasks before continuing
        </p>
      )}

      <Button
        className="w-full bg-teal-600 hover:bg-teal-700 h-14 text-base"
        disabled={!canAdvance}
        onClick={() => advance({ servicesPerformed: Array.from(checked) })}
      >
        <ChevronRight className="w-5 h-5 mr-2" />
        Tasks Done → Filter PSI
      </Button>
    </div>
  );
}