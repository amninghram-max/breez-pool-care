import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import StepArrive from '../components/servicevisit/StepArrive';
import StepTest from '../components/servicevisit/StepTest';
import StepAnalyze from '../components/servicevisit/StepAnalyze';
import StepDoseConfirm from '../components/servicevisit/StepDoseConfirm';
import StepWaitTimer from '../components/servicevisit/StepWaitTimer';
import StepRetest from '../components/servicevisit/StepRetest';
import StepCloseout from '../components/servicevisit/StepCloseout';

const STEPS = ['arrive', 'test', 'analyze', 'dose', 'wait', 'retest', 'close'];

export default function ServiceVisitFlow() {
  const urlParams = new URLSearchParams(window.location.search);
  const eventId = urlParams.get('eventId');
  const poolId = urlParams.get('poolId');

  // Restore step from localStorage (timer persistence + resume)
  const FLOW_KEY = eventId ? `breez_flow_${eventId}` : null;
  const savedFlow = FLOW_KEY ? (() => { try { return JSON.parse(localStorage.getItem(FLOW_KEY) || 'null'); } catch { return null; } })() : null;

  const [step, setStep] = useState(savedFlow?.step || 'arrive');
  const [visitData, setVisitData] = useState({
    eventId,
    poolId,
    testRecordId: null,
    riskEvents: [],
    dosePlan: null,
    retestRequired: false,
    retestWaitMinutes: 30,
    retestRecordId: null,
    firstChemApplied: false,
    ...(savedFlow?.visitData || {})
  });

  const { data: user } = useQuery({ queryKey: ['user'], queryFn: () => base44.auth.me() });
  const { data: settings } = useQuery({
    queryKey: ['adminSettings'],
    queryFn: async () => {
      const rows = await base44.entities.AdminSettings.list('-created_date', 1);
      return rows[0] || null;
    }
  });

  const advance = (data = {}) => {
    setVisitData(prev => ({ ...prev, ...data }));
    const idx = STEPS.indexOf(step);
    if (idx < STEPS.length - 1) setStep(STEPS[idx + 1]);
  };

  const goTo = (target) => setStep(target);

  const stepProps = { visitData, user, settings, advance, goTo };

  const stepLabels = {
    arrive: 'Arrive', test: 'Test', analyze: 'Analyze',
    dose: 'Dose', wait: 'Wait', retest: 'Retest', close: 'Close'
  };

  const currentIdx = STEPS.indexOf(step);

  return (
    <div className="max-w-lg mx-auto pb-24">
      {/* Progress strip */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-100 px-4 py-3">
        <div className="flex items-center gap-1">
          {STEPS.map((s, i) => {
            const done = i < currentIdx;
            const active = i === currentIdx;
            // skip retest if not required
            if (s === 'retest' && !visitData.retestRequired && !active) return null;
            return (
              <React.Fragment key={s}>
                <div className={`flex items-center gap-1 ${active ? 'opacity-100' : done ? 'opacity-60' : 'opacity-30'}`}>
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                    done ? 'bg-teal-500 text-white' : active ? 'bg-teal-600 text-white' : 'bg-gray-200 text-gray-500'
                  }`}>
                    {done ? '✓' : i + 1}
                  </div>
                  <span className={`text-xs font-medium hidden sm:inline ${active ? 'text-teal-700' : 'text-gray-500'}`}>
                    {stepLabels[s]}
                  </span>
                </div>
                {i < STEPS.length - 1 && <div className="flex-1 h-0.5 bg-gray-200 min-w-[6px]" />}
              </React.Fragment>
            );
          })}
        </div>
      </div>

      <div className="p-4">
        {step === 'arrive'   && <StepArrive   {...stepProps} />}
        {step === 'test'     && <StepTest     {...stepProps} />}
        {step === 'analyze'  && <StepAnalyze  {...stepProps} />}
        {step === 'dose'     && <StepDoseConfirm {...stepProps} />}
        {step === 'wait'     && <StepWaitTimer {...stepProps} />}
        {step === 'retest'   && <StepRetest   {...stepProps} />}
        {step === 'close'    && <StepCloseout {...stepProps} />}
      </div>
    </div>
  );
}