import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import StepArrive from '../components/servicevisit/StepArrive';
import StepAccessWait from '../components/servicevisit/StepAccessWait';
import StepPhotosBeforeService from '../components/servicevisit/StepPhotosBeforeService';
import StepChecklist from '../components/servicevisit/StepChecklist';
import StepFilterPsi from '../components/servicevisit/StepFilterPsi';
import StepWaterLevel from '../components/servicevisit/StepWaterLevel';
import StepTest from '../components/servicevisit/StepTest';
import StepAnalyze from '../components/servicevisit/StepAnalyze';
import StepDoseConfirm from '../components/servicevisit/StepDoseConfirm';
import StepWaitTimer from '../components/servicevisit/StepWaitTimer';
import StepRetest from '../components/servicevisit/StepRetest';
import StepPhotosAfterService from '../components/servicevisit/StepPhotosAfterService';
import StepCloseout from '../components/servicevisit/StepCloseout';

// Steps: arrive → photos_before → test → analyze → dose → wait → retest → checklist → filter_psi → water_level → photos_after → close
// access_wait is conditional (only via explicit goTo), not part of normal sequence
const STEPS = ['arrive', 'photos_before', 'test', 'analyze', 'dose', 'wait', 'retest', 'checklist', 'filter_psi', 'water_level', 'photos_after', 'close'];

export default function ServiceVisitFlow() {
  const urlParams = new URLSearchParams(window.location.search);
  const eventId = urlParams.get('eventId');
  const poolId = urlParams.get('poolId');

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
    setVisitData(prev => {
      const next = { ...prev, ...data };
      if (FLOW_KEY) {
        // Determine next step: skip wait/retest if retestRequired === false
        let nextStepIdx = Math.min(STEPS.indexOf(step) + 1, STEPS.length - 1);
        if ((step === 'analyze' || step === 'dose') && next.retestRequired === false) {
          nextStepIdx = STEPS.indexOf('checklist');
        }
        const nextStep = STEPS[nextStepIdx];
        localStorage.setItem(FLOW_KEY, JSON.stringify({ step: nextStep, visitData: next }));
      }
      return next;
    });
    
    // Apply step transition (check new data only—do not use old visitData default as fallback)
    let nextStepIdx = Math.min(STEPS.indexOf(step) + 1, STEPS.length - 1);
    if ((step === 'analyze' || step === 'dose') && data.retestRequired === false) {
      console.log('[ServiceVisitFlow] skipping dose/wait/retest to checklist (retestRequired explicitly false)');
      nextStepIdx = STEPS.indexOf('checklist');
    }
    if (nextStepIdx < STEPS.length) setStep(STEPS[nextStepIdx]);
  };

  const goTo = (target) => {
    console.log('[ServiceVisitFlow] goTo', { from: step, to: target });
    setStep(target);
    if (FLOW_KEY) {
      localStorage.setItem(FLOW_KEY, JSON.stringify({ step: target, visitData }));
    }
  };

  const stepProps = { visitData, user, settings, advance, goTo };

  const stepLabels = {
    arrive: 'Arrive', access_wait: 'Wait', photos_before: 'Before', test: 'Test', analyze: 'Analyze',
    dose: 'Dose', wait: 'Wait', retest: 'Retest', checklist: 'Tasks', filter_psi: 'Filter', water_level: 'Water',
    photos_after: 'After', close: 'Close'
  };

  const currentIdx = STEPS.indexOf(step);

  return (
    <div className="max-w-lg mx-auto pb-24">
      {/* Progress strip */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-100 px-4 py-3">
        <div className="flex items-center gap-0.5 overflow-x-auto pb-0.5">
          {STEPS.map((s, i) => {
            const done = i < currentIdx;
            const active = i === currentIdx;
            if (s === 'retest' && !visitData.retestRequired && !active) return null;
            return (
              <React.Fragment key={s}>
                <div className={`flex items-center gap-1 flex-shrink-0 ${active ? 'opacity-100' : done ? 'opacity-60' : 'opacity-30'}`}>
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                    done ? 'bg-teal-500 text-white' : active ? 'bg-teal-600 text-white' : 'bg-gray-200 text-gray-500'
                  }`}>
                    {done ? '✓' : i + 1}
                  </div>
                  <span className={`text-xs font-medium hidden sm:inline ${active ? 'text-teal-700' : 'text-gray-500'}`}>
                    {stepLabels[s]}
                  </span>
                </div>
                {i < STEPS.length - 1 && <div className="flex-1 h-0.5 bg-gray-200 min-w-[4px]" />}
              </React.Fragment>
            );
          })}
        </div>
      </div>

      <div className="p-4">
         {step === 'arrive'         && <StepArrive              {...stepProps} />}
         {step === 'access_wait'    && <StepAccessWait         {...stepProps} />}
         {step === 'photos_before'  && <StepPhotosBeforeService {...stepProps} />}
         {step === 'checklist'      && <StepChecklist          {...stepProps} />}
         {step === 'filter_psi'     && <StepFilterPsi          {...stepProps} />}
         {step === 'water_level'    && <StepWaterLevel         {...stepProps} />}
         {step === 'test'           && <StepTest               {...stepProps} />}
         {step === 'analyze'        && <StepAnalyze            {...stepProps} />}
         {step === 'dose'           && <StepDoseConfirm        {...stepProps} />}
         {step === 'wait'           && <StepWaitTimer          {...stepProps} />}
         {step === 'retest'         && <StepRetest             {...stepProps} />}
         {step === 'photos_after'   && <StepPhotosAfterService {...stepProps} />}
         {step === 'close'          && <StepCloseout           {...stepProps} />}
       </div>
    </div>
  );
}