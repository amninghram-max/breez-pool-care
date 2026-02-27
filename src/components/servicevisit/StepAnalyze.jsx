import React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, AlertTriangle, AlertCircle, ChevronRight, Droplet } from 'lucide-react';

const SEVERITY_MAP = {
  LOW_FC: 3, LOW_FC_CRITICAL: 5, HIGH_FC: 2, HIGH_FC_CRITICAL: 4,
  LOW_PH: 2, LOW_PH_CRITICAL: 4, HIGH_PH: 2, HIGH_PH_CRITICAL: 4,
  LOW_TA: 3, HIGH_TA: 2, LOW_CYA: 2, HIGH_CYA: 3,
  LOW_CH: 2, HIGH_CH: 2, LOW_SALT: 3, HIGH_SALT: 2,
  CC_HIGH: 4, CC_CRITICAL: 5, GREEN_ALGAE: 5
};

const EVENT_LABELS = {
  LOW_FC: 'Free Chlorine Low', LOW_FC_CRITICAL: 'Free Chlorine CRITICAL LOW',
  HIGH_FC: 'Free Chlorine High', HIGH_FC_CRITICAL: 'Free Chlorine CRITICAL HIGH',
  LOW_PH: 'pH Low', LOW_PH_CRITICAL: 'pH CRITICAL LOW',
  HIGH_PH: 'pH High', HIGH_PH_CRITICAL: 'pH CRITICAL HIGH',
  LOW_TA: 'Alkalinity Low', HIGH_TA: 'Alkalinity High',
  LOW_CYA: 'CYA Low', HIGH_CYA: 'CYA High',
  LOW_CH: 'Calcium Hardness Low', HIGH_CH: 'Calcium Hardness High',
  LOW_SALT: 'Salt Low', HIGH_SALT: 'Salt High',
  CC_HIGH: 'Combined Chlorine Elevated', CC_CRITICAL: 'Combined Chlorine CRITICAL',
  GREEN_ALGAE: 'Green Algae'
};

const FIELD_LABELS = {
  freeChlorine: 'FC', pH: 'pH', totalAlkalinity: 'TA',
  combinedChlorine: 'CC', cyanuricAcid: 'CYA', calciumHardness: 'CH',
  salt: 'Salt', waterTemp: 'Temp'
};

const FIELD_UNITS = {
  freeChlorine: 'ppm', pH: '', totalAlkalinity: 'ppm',
  combinedChlorine: 'ppm', cyanuricAcid: 'ppm', calciumHardness: 'ppm',
  salt: 'ppm', waterTemp: '°F'
};

function severityLevel(pts) {
  if (pts >= 5) return { label: 'Critical', color: 'bg-red-100 text-red-800 border-red-200', icon: AlertCircle, iconColor: 'text-red-500' };
  if (pts >= 3) return { label: 'High', color: 'bg-orange-100 text-orange-800 border-orange-200', icon: AlertTriangle, iconColor: 'text-orange-500' };
  return { label: 'Moderate', color: 'bg-yellow-100 text-yellow-800 border-yellow-200', icon: AlertTriangle, iconColor: 'text-yellow-500' };
}

export default function StepAnalyze({ visitData, advance, goTo }) {
  const events = visitData.riskEvents || [];
  const readings = visitData.readings || {};
  const totalScore = events.reduce((s, e) => s + (SEVERITY_MAP[e.eventType] ?? 0), 0);
  const hasIssues = events.length > 0;
  const criticalEvents = events.filter(e => (SEVERITY_MAP[e.eventType] ?? 0) >= 5);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Analysis</h2>
        <p className="text-gray-500 text-sm mt-1">Review what the readings show</p>
      </div>

      {/* Readings summary — no cost/pricing anywhere */}
      <Card>
        <CardContent className="pt-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Today's Readings</p>
          <div className="grid grid-cols-3 gap-3">
            {Object.entries(readings).map(([key, val]) => {
              if (val == null || FIELD_LABELS[key] == null) return null;
              const isOor = visitData.outOfRange?.includes(key);
              return (
                <div key={key} className={`p-2 rounded-lg border text-center ${isOor ? 'border-red-200 bg-red-50' : 'border-gray-100 bg-gray-50'}`}>
                  <p className="text-xs text-gray-500">{FIELD_LABELS[key]}</p>
                  <p className={`text-lg font-bold font-mono ${isOor ? 'text-red-700' : 'text-gray-900'}`}>
                    {val}
                  </p>
                  {FIELD_UNITS[key] && <p className="text-xs text-gray-400">{FIELD_UNITS[key]}</p>}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Risk summary */}
      {!hasIssues ? (
        <Card className="border-green-200 bg-green-50">
          <CardContent className="pt-5 flex items-center gap-3">
            <CheckCircle className="w-8 h-8 text-green-600 flex-shrink-0" />
            <div>
              <p className="font-bold text-green-900">All parameters in range</p>
              <p className="text-sm text-green-700">No chemical adjustment needed today</p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {criticalEvents.length > 0 && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg p-3">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
              <p className="text-sm font-semibold text-red-800">
                {criticalEvents.length} critical issue{criticalEvents.length > 1 ? 's' : ''} — treatment required
              </p>
            </div>
          )}

          {events.map((evt, i) => {
            const pts = SEVERITY_MAP[evt.eventType] ?? 0;
            const sev = severityLevel(pts);
            const Icon = sev.icon;
            return (
              <Card key={i} className={`border ${sev.color.split(' ')[2]}`}>
                <CardContent className="pt-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2">
                      <Icon className={`w-4 h-4 mt-0.5 flex-shrink-0 ${sev.iconColor}`} />
                      <div>
                        <p className="font-semibold text-sm">{EVENT_LABELS[evt.eventType] || evt.eventType}</p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          Read: <span className="font-mono font-bold">{evt.triggerValue}</span>
                          {' '}· Threshold: <span className="font-mono">{evt.thresholdValue}</span>
                        </p>
                      </div>
                    </div>
                    <Badge className={sev.color}>{sev.label}</Badge>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Next action */}
      {hasIssues ? (
        <Button
          className="w-full bg-teal-600 hover:bg-teal-700 h-14 text-base"
          onClick={() => advance()}
        >
          <Droplet className="w-5 h-5 mr-2" />
          View Dose Plan →
        </Button>
      ) : (
        <Button
          className="w-full bg-teal-600 hover:bg-teal-700 h-14 text-base"
          onClick={() => advance({ dosePlan: null, retestRequired: false })}
        >
          <ChevronRight className="w-5 h-5 mr-2" />
          No Treatment Needed → Close
        </Button>
      )}
    </div>
  );
}