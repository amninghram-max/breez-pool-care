import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, CheckSquare, Square, Gauge, AlertTriangle, Camera, Loader2, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';

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
  // --- Checklist state ---
  const [checked, setChecked] = useState(() => {
    if (visitData?.servicesPerformed && visitData.servicesPerformed.length > 0) {
      console.log('[StepChecklist] hydrating from visitData.servicesPerformed:', visitData.servicesPerformed);
      return new Set(visitData.servicesPerformed);
    }
    return new Set();
  });

  // --- Filter PSI state (hydrate from visitData if resuming) ---
  const [psi, setPsi] = useState(visitData?.filterPsi != null ? String(visitData.filterPsi) : '');
  const [action, setAction] = useState(visitData?.filterAction || '');
  const [afterPsi, setAfterPsi] = useState(visitData?.filterAfterPsi != null ? String(visitData.filterAfterPsi) : '');
  const [cartridgePhoto, setCartridgePhoto] = useState(visitData?.filterCartridgePhotoUrl || null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [filterNotes, setFilterNotes] = useState(visitData?.filterNotes || '');

  // --- Load pool + equipment for normal PSI reference ---
  const { data: pool } = useQuery({
    queryKey: ['pool', visitData.poolId],
    queryFn: () => base44.entities.Pool.filter({ id: visitData.poolId }).then(r => r[0]),
    enabled: !!visitData.poolId
  });

  const { data: equipment = [] } = useQuery({
    queryKey: ['poolEquipmentForPsi', pool?.leadId],
    queryFn: () => base44.entities.PoolEquipment.filter({ leadId: pool.leadId, isActive: true }),
    enabled: !!pool?.leadId
  });

  const filterEquip = equipment.find(e => e.equipmentType === 'filter');
  const normalPsi = filterEquip?.normalPsi;
  const filterType = pool?.filterType || filterEquip?.confirmedFilterType;

  const psiNum = parseFloat(psi);
  const isHigh = normalPsi && !isNaN(psiNum) && psiNum >= normalPsi + 10;
  const isSand = filterType === 'sand';
  const isCartridge = filterType === 'cartridge' || filterType === 'de';

  // --- Toggle checklist items ---
  const toggle = (key) => {
    setChecked(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  // Sync checklist state to localStorage without navigating
  useEffect(() => {
    if (visitData?.eventId) {
      const FLOW_KEY = `breez_flow_${visitData.eventId}`;
      const stored = localStorage.getItem(FLOW_KEY);
      if (stored) {
        const flowState = JSON.parse(stored);
        flowState.visitData.servicesPerformed = Array.from(checked);
        localStorage.setItem(FLOW_KEY, JSON.stringify(flowState));
      }
    }
  }, [checked, visitData]);

  // --- Photo upload ---
  const handlePhotoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingPhoto(true);
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    setCartridgePhoto(file_url);
    setUploadingPhoto(false);
    toast.success('Photo uploaded');
  };

  // --- Validation ---
  const missingExpected = EXPECTED_TASKS.filter(k => !checked.has(k));
  const checklistDone = missingExpected.length === 0;

  const psiEntered = psi !== '' && !isNaN(psiNum);
  const psiActionDone = (() => {
    if (!psiEntered) return false;
    if (!isHigh) return true;
    if (isSand) return action === 'backwash' && afterPsi !== '';
    if (isCartridge) return action === 'inspect_cartridge' && !!cartridgePhoto;
    return true;
  })();

  const canAdvance = checklistDone && psiActionDone;

  // --- Advance ---
  const handleContinue = () => {
    const payload = {
      servicesPerformed: Array.from(checked),
      filterPsi: psiNum,
      filterPsiNormal: normalPsi,
      filterPsiHigh: isHigh,
      filterAction: action || 'none',
      filterAfterPsi: afterPsi ? parseFloat(afterPsi) : undefined,
      filterCartridgePhotoUrl: cartridgePhoto,
      filterNotes: filterNotes || undefined,
    };
    console.log('[StepChecklist] advance payload (checklist + filter PSI):', payload);
    advance(payload);
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Service Tasks</h2>
        <p className="text-gray-500 text-sm mt-1">Check off each task and record filter pressure</p>
      </div>

      {/* ── Service Activities ── */}
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

      {!checklistDone && (
        <p className="text-xs text-center text-orange-500">
          Complete all required tasks before continuing
        </p>
      )}

      {/* ── Filter Pressure Gauge ── */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <Gauge className="w-4 h-4 text-teal-600" />
          <h3 className="font-semibold text-gray-800 text-sm">Filter Pressure Gauge</h3>
        </div>

        {normalPsi && (
          <div className="flex items-center gap-2 text-sm text-gray-600 bg-gray-50 rounded-lg px-3 py-2 mb-3">
            <Gauge className="w-4 h-4 text-teal-500" />
            <span>Normal PSI for this filter: <strong>{normalPsi} psi</strong></span>
          </div>
        )}

        <Card>
          <CardContent className="pt-4 space-y-4">
            <div>
              <Label className="text-sm font-medium text-gray-700">Current Filter PSI</Label>
              <Input
                type="number"
                step="0.5"
                min={0}
                placeholder="e.g. 18"
                value={psi}
                onChange={e => { setPsi(e.target.value); setAction(''); setAfterPsi(''); setCartridgePhoto(null); }}
                className="mt-1 text-lg font-mono"
              />
              {normalPsi && !isNaN(psiNum) && psi !== '' && (
                <p className={`text-xs mt-1 font-medium ${isHigh ? 'text-red-600' : 'text-green-600'}`}>
                  {isHigh
                    ? `⚠ Elevated — ${psiNum - normalPsi} psi above normal (${normalPsi})`
                    : `✓ Within normal range (normal: ${normalPsi} psi)`}
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* High PSI Actions */}
        {isHigh && (
          <Card className="border-orange-200 bg-orange-50 mt-3">
            <CardContent className="pt-4 space-y-4">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-5 h-5 text-orange-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-orange-900 text-sm">Filter pressure elevated — action required</p>
                  {isSand && <p className="text-xs text-orange-700 mt-0.5">Sand filter: perform backwash and record PSI after</p>}
                  {isCartridge && <p className="text-xs text-orange-700 mt-0.5">Cartridge/DE filter: inspect, photograph, clean if necessary</p>}
                </div>
              </div>

              {isSand && (
                <div className="space-y-3">
                  {action !== 'backwash' ? (
                    <Button className="w-full bg-orange-600 hover:bg-orange-700" onClick={() => setAction('backwash')}>
                      Perform Backwash
                    </Button>
                  ) : (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 text-sm text-green-700 font-medium">
                        <CheckCircle className="w-4 h-4" />
                        Backwash performed
                      </div>
                      <div>
                        <Label className="text-sm font-medium text-gray-700">PSI After Backwash</Label>
                        <Input
                          type="number"
                          step="0.5"
                          min={0}
                          placeholder="e.g. 12"
                          value={afterPsi}
                          onChange={e => setAfterPsi(e.target.value)}
                          className="mt-1 text-lg font-mono"
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}

              {isCartridge && (
                <div className="space-y-3">
                  {action !== 'inspect_cartridge' ? (
                    <Button className="w-full bg-orange-600 hover:bg-orange-700" onClick={() => setAction('inspect_cartridge')}>
                      Inspect Cartridge
                    </Button>
                  ) : (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 text-sm text-green-700 font-medium">
                        <CheckCircle className="w-4 h-4" />
                        Inspecting cartridge
                      </div>
                      <div>
                        <Label className="text-sm font-medium text-gray-700">Required: Photo of Cartridge</Label>
                        <label className="mt-1 flex items-center gap-2 cursor-pointer border-2 border-dashed border-gray-200 rounded-lg p-3 hover:border-teal-400 transition-colors">
                          {uploadingPhoto ? <Loader2 className="w-4 h-4 animate-spin text-teal-600" /> : <Camera className="w-4 h-4 text-gray-400" />}
                          <span className="text-sm text-gray-500">
                            {uploadingPhoto ? 'Uploading...' : cartridgePhoto ? 'Photo uploaded ✓' : 'Tap to photograph cartridge'}
                          </span>
                          <input type="file" accept="image/*" capture="environment" className="hidden" onChange={handlePhotoUpload} disabled={uploadingPhoto} />
                        </label>
                        {cartridgePhoto && (
                          <img src={cartridgePhoto} alt="cartridge" className="mt-2 w-24 h-24 object-cover rounded-lg border" />
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        <div className="mt-3">
          <Label className="text-sm font-medium text-gray-700">Filter Notes (optional)</Label>
          <Textarea
            placeholder="Any observations about the filter or equipment…"
            value={filterNotes}
            onChange={e => setFilterNotes(e.target.value)}
            className="mt-1"
            rows={2}
          />
        </div>
      </div>

      {!canAdvance && isHigh && psiEntered && (
        <p className="text-xs text-center text-orange-500">
          {isSand ? 'Backwash and record after-PSI before continuing' : 'Photograph the cartridge before continuing'}
        </p>
      )}

      <Button
        className="w-full bg-teal-600 hover:bg-teal-700 h-14 text-base"
        disabled={!canAdvance}
        onClick={handleContinue}
      >
        <ChevronRight className="w-5 h-5 mr-2" />
        {isHigh && psiEntered && !psiActionDone ? 'Complete filter action above' : 'Tasks Done → Continue'}
      </Button>
    </div>
  );
}