import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Clock, ChevronRight, CheckCircle } from 'lucide-react';

const CHECKLIST_ITEMS = [
  { id: 'brush',   label: 'Brush walls & floor' },
  { id: 'skim',    label: 'Skim surface debris' },
  { id: 'baskets', label: 'Empty skimmer & pump baskets' },
  { id: 'pump',    label: 'Check filter pressure gauge' },
];

function getTimerKey(eventId) {
  return `breez_timer_${eventId}`;
}

function loadTimer(eventId, waitMinutes) {
  const key = getTimerKey(eventId);
  const stored = localStorage.getItem(key);
  if (stored) {
    const { startTs } = JSON.parse(stored);
    return startTs;
  }
  const startTs = Date.now();
  localStorage.setItem(key, JSON.stringify({ startTs, waitMinutes }));
  return startTs;
}

function loadChecklist(eventId) {
  const key = `breez_checklist_${eventId}`;
  const stored = localStorage.getItem(key);
  return stored ? JSON.parse(stored) : {};
}

function saveChecklist(eventId, checked) {
  localStorage.setItem(`breez_checklist_${eventId}`, JSON.stringify(checked));
}

export default function StepWaitTimer({ visitData, advance, goTo }) {
  const waitMinutes = visitData.retestWaitMinutes || 30;
  const eventId = visitData.eventId || 'unknown';

  const [startTime] = useState(() => loadTimer(eventId, waitMinutes));
  const [elapsed, setElapsed] = useState(Math.floor((Date.now() - startTime) / 1000));
  const [checked, setChecked] = useState(() => loadChecklist(eventId));

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

  const toggleItem = (id) => {
    const next = { ...checked, [id]: !checked[id] };
    setChecked(next);
    saveChecklist(eventId, next);
  };

  const handleAdvance = () => {
    // Clean up timer from localStorage on successful advance
    localStorage.removeItem(getTimerKey(eventId));
    advance();
  };

  const handleContinueServiceTasks = () => {
    console.log('[StepWaitTimer] CONTINUE_SERVICE_TASKS', { eventId, remaining, navigatingToChecklist: true });
    // Navigate to checklist while timer remains active/running in background
    // Timer state is preserved in localStorage; will resume if user returns
    goTo('checklist');
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
              : `${waitMinutes} min window · ${fmt(elapsed)} elapsed`}
          </div>
        </CardContent>
      </Card>

      <Button
        className={`w-full h-14 text-base ${canAdvance ? 'bg-green-600 hover:bg-green-700' : 'bg-teal-600 hover:bg-teal-700'}`}
        disabled={!canAdvance}
        onClick={handleAdvance}
      >
        <ChevronRight className="w-5 h-5 mr-2" />
        {canAdvance ? 'Retest Now →' : `Retest available in ${fmt(remaining)}`}
      </Button>

      {!canAdvance && (
        <Button
          variant="outline"
          className="w-full h-12 text-sm"
          onClick={handleContinueServiceTasks}
        >
          Continue Service Tasks
        </Button>
      )}
    </div>
  );
}