import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Clock, ChevronRight, CheckCircle } from 'lucide-react';

export default function StepWaitTimer({ visitData, advance }) {
  const waitMinutes = visitData.retestWaitMinutes || 30;
  const [startTime] = useState(() => Date.now());
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [startTime]);

  const totalSeconds = waitMinutes * 60;
  const remaining = Math.max(0, totalSeconds - elapsed);
  const progress = Math.min(100, (elapsed / totalSeconds) * 100);
  const canAdvance = remaining === 0;

  const fmt = (s) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${String(sec).padStart(2, '0')}`;
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Wait / Circulate</h2>
        <p className="text-gray-500 text-sm mt-1">Allow chemicals to distribute before retesting</p>
      </div>

      <Card>
        <CardContent className="pt-6 pb-6 text-center space-y-4">
          <div className={`text-6xl font-mono font-bold ${canAdvance ? 'text-green-600' : 'text-teal-600'}`}>
            {canAdvance ? <CheckCircle className="w-16 h-16 mx-auto text-green-500" /> : fmt(remaining)}
          </div>

          {/* Progress ring */}
          <div className="relative w-32 h-32 mx-auto">
            <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
              <circle cx="18" cy="18" r="15.9" fill="none" stroke="#e5e7eb" strokeWidth="2" />
              <circle
                cx="18" cy="18" r="15.9" fill="none"
                stroke={canAdvance ? '#22c55e' : '#0d9488'}
                strokeWidth="2.5"
                strokeDasharray={`${progress} 100`}
                strokeLinecap="round"
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-sm font-semibold text-gray-600">{Math.round(progress)}%</span>
            </div>
          </div>

          <div className="text-sm text-gray-500">
            {canAdvance
              ? 'Circulate complete — ready to retest'
              : `${waitMinutes} minute circulation window · ${fmt(elapsed)} elapsed`}
          </div>
        </CardContent>
      </Card>

      <Card className="border-blue-100 bg-blue-50">
        <CardContent className="pt-4">
          <p className="text-sm font-semibold text-blue-900 mb-2">While you wait:</p>
          <ul className="text-sm text-blue-800 space-y-1 list-disc list-inside">
            <li>Brush pool walls and floor</li>
            <li>Skim surface debris</li>
            <li>Empty skimmer and pump baskets</li>
            <li>Check filter pressure gauge</li>
          </ul>
        </CardContent>
      </Card>

      <Button
        className={`w-full h-14 text-base ${canAdvance ? 'bg-green-600 hover:bg-green-700' : 'bg-teal-600 hover:bg-teal-700'}`}
        disabled={!canAdvance}
        onClick={() => advance()}
      >
        <ChevronRight className="w-5 h-5 mr-2" />
        {canAdvance ? 'Retest Now →' : `Retest available in ${fmt(remaining)}`}
      </Button>
    </div>
  );
}