import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ChevronDown, ChevronUp, AlertTriangle, CheckCircle } from 'lucide-react';

const INCIDENT_TYPES = [
  { value: 'formed_stool', label: 'Formed stool' },
  { value: 'diarrheal', label: 'Diarrheal release' },
  { value: 'unsure', label: "I'm not sure" },
];

export default function FecalIncidentForm({ leadId, onSubmitted, onCancel }) {
  const [incidentType, setIncidentType] = useState('');
  const [approxTime, setApproxTime] = useState('');
  const [anyoneSwam, setAnyoneSwam] = useState(null);
  const [notes, setNotes] = useState('');
  const [faqOpen, setFaqOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async () => {
    if (!incidentType) return;
    setSubmitting(true);
    await base44.functions.invoke('reportFecalIncident', {
      leadId,
      incidentType,
      approxTimeOccurred: approxTime,
      anyoneSwamSince: anyoneSwam === 'yes',
      notes,
    });
    setSubmitting(false);
    setSubmitted(true);
    setTimeout(() => onSubmitted?.(), 1500);
  };

  if (submitted) {
    return (
      <div className="flex items-center gap-3 py-6 justify-center">
        <CheckCircle className="w-5 h-5 text-teal-600" />
        <p className="text-sm text-gray-700 font-medium">Incident reported. We'll be in touch shortly.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <AlertTriangle className="w-4 h-4 text-gray-500" />
        <p className="text-sm text-gray-700 font-medium">Report a Fecal Incident</p>
      </div>

      {/* FAQ dropdown */}
      <div className="border border-gray-200 rounded-lg overflow-hidden">
        <button
          className="w-full flex items-center justify-between px-4 py-3 text-sm text-gray-600 bg-gray-50 text-left"
          onClick={() => setFaqOpen(v => !v)}
        >
          <span>What constitutes a fecal incident?</span>
          {faqOpen ? <ChevronUp className="w-4 h-4 flex-shrink-0" /> : <ChevronDown className="w-4 h-4 flex-shrink-0" />}
        </button>
        {faqOpen && (
          <div className="px-4 py-3 text-sm text-gray-600 space-y-2 bg-white leading-relaxed">
            <p>A fecal incident includes any situation where fecal matter — from a person or animal — enters the pool water. This includes accidents while swimming, swim diaper leaks, or incidents involving young children or pets.</p>
            <p className="text-gray-500">These things happen, and there's no need to feel embarrassed. Reporting promptly allows us to begin proper disinfection right away, keeping your family and anyone who uses the pool safe.</p>
            <p className="text-gray-500 font-medium">A few helpful reminders going forward: encourage everyone to use the restroom before swimming, and use swim diapers for young children.</p>
          </div>
        )}
      </div>

      {/* Incident type */}
      <div className="space-y-2">
        <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">What type of incident occurred?</p>
        <div className="space-y-2">
          {INCIDENT_TYPES.map(t => (
            <button
              key={t.value}
              onClick={() => setIncidentType(t.value)}
              className={`w-full text-left px-4 py-3 rounded-lg border text-sm transition-all ${
                incidentType === t.value
                  ? 'border-gray-700 bg-gray-50 text-gray-900 font-medium'
                  : 'border-gray-200 text-gray-600 hover:border-gray-300'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Approximate time */}
      <div className="space-y-2">
        <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Approximate time it occurred</p>
        <input
          type="text"
          placeholder="e.g., around 3pm today, this morning"
          value={approxTime}
          onChange={e => setApproxTime(e.target.value)}
          className="w-full border border-gray-200 rounded-lg px-4 py-3 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:border-gray-400"
        />
      </div>

      {/* Anyone swam since */}
      <div className="space-y-2">
        <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Has anyone swum since the incident?</p>
        <div className="flex gap-2">
          {['yes', 'no'].map(v => (
            <button
              key={v}
              onClick={() => setAnyoneSwam(v)}
              className={`flex-1 py-2.5 rounded-lg border text-sm capitalize transition-all ${
                anyoneSwam === v
                  ? 'border-gray-700 bg-gray-50 text-gray-900 font-medium'
                  : 'border-gray-200 text-gray-600 hover:border-gray-300'
              }`}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      {/* Notes */}
      <div className="space-y-2">
        <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Additional notes <span className="normal-case font-normal">(optional)</span></p>
        <Textarea
          placeholder="Any other details that might be helpful…"
          value={notes}
          onChange={e => setNotes(e.target.value)}
          className="text-sm resize-none"
          rows={3}
        />
      </div>

      <div className="flex gap-2 pt-1">
        <Button
          variant="outline"
          className="flex-1 text-sm"
          onClick={onCancel}
          disabled={submitting}
        >
          Cancel
        </Button>
        <Button
          className="flex-1 text-sm bg-gray-800 hover:bg-gray-900 text-white"
          onClick={handleSubmit}
          disabled={!incidentType || submitting}
        >
          {submitting ? 'Submitting…' : 'Submit Report'}
        </Button>
      </div>
    </div>
  );
}