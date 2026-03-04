import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Phone, Mail, MessageSquare, AlertCircle, Check, Wrench, Plus, RefreshCw, ChevronDown, Eye, Settings, Trash2, Calendar, FileText, ArrowRight, Send, MoreVertical, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger 
} from '@/components/ui/dropdown-menu';
import UnstickLeadPanel from '@/components/admin/UnstickLeadPanel';
import NewLeadModal from '@/components/admin/NewLeadModal';
import RemoveLeadPanel from '@/components/admin/RemoveLeadPanel';
import LinkUserToLeadPanel from '@/components/admin/LinkUserToLeadPanel';
import StageActionButton from '@/components/admin/StageActionButton';
import StageValidationError from '@/components/admin/StageValidationError';
import StartInspectionButton from '@/components/admin/StartInspectionButton';
import SendQuoteModal from '@/components/admin/SendQuoteModal';
import SendInspectionLinkModal from '@/components/admin/SendInspectionLinkModal';

// Canonical stage order (business rule)
const STAGES = [
  { key: 'new_lead', label: 'New (Uncontacted)', color: 'bg-blue-100 text-blue-800', defaultExpanded: true },
  { key: 'contacted', label: 'Quoted / Contacted', color: 'bg-purple-100 text-purple-800', defaultExpanded: true },
  { key: 'inspection_scheduled', label: 'Inspection Scheduled', color: 'bg-yellow-100 text-yellow-800', defaultExpanded: true },
  { key: 'inspection_confirmed', label: 'Ready for Conversion', color: 'bg-green-100 text-green-800', defaultExpanded: true },
  { key: 'quote_sent', label: 'Pending Acceptance (Post-Inspection)', color: 'bg-indigo-100 text-indigo-800', defaultExpanded: false },
  { key: 'converted', label: 'Active', color: 'bg-emerald-100 text-emerald-800', defaultExpanded: false },
  { key: 'inspection_confirmed', label: 'Ready for Conversion', color: 'bg-teal-100 text-teal-800', defaultExpanded: true },
  { key: 'converted', label: 'Active Customer', color: 'bg-emerald-100 text-emerald-800', defaultExpanded: false },
  { key: 'lost', label: 'Lost', color: 'bg-gray-100 text-gray-800', defaultExpanded: false }
];

const STAGE_OPTIONS = [
  ...STAGES,
  { key: 'quote_sent', label: 'Pending Acceptance (Post-Inspection)', color: 'bg-indigo-100 text-indigo-800' }
];

export default function LeadsPipeline() {
  const queryClient = useQueryClient();
  const [selectedLead, setSelectedLead] = useState(null);
  const [repairResult, setRepairResult] = useState(null);
  const [showNewLead, setShowNewLead] = useState(false);
  const [expandedStages, setExpandedStages] = useState(STAGES.filter(s => s.defaultExpanded).map(s => s.key));

  // Batch selection state
  const [selectedLeadIds, setSelectedLeadIds] = useState(new Set());
  const [batchConfirmation, setBatchConfirmation] = useState(null);
  const [batchResults, setBatchResults] = useState(null);

  const repairMutation = useMutation({
    mutationFn: () => base44.functions.invoke('repairInspectionScheduledLeads', {}),
    onSuccess: (res) => {
      const summary = res.data?.summary;
      setRepairResult(summary);
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      
      // Surface result to operator
      if (summary?.repaired > 0) {
        toast.success(`Repaired ${summary.repaired} lead(s) — ${summary.intact} already valid, ${summary.errors} errors`);
      } else if (summary?.checked > 0) {
        toast.info(`Scan complete: ${summary.checked} checked, all valid`);
      } else {
        toast.info('No leads in inspection_scheduled state');
      }
    },
    onError: (error) => {
      toast.error(`Repair failed: ${error.message}`);
    }
  });

  const { data: user } = useQuery({
    queryKey: ['user'],
    queryFn: () => base44.auth.me(),
  });

  const { data: leads = [] } = useQuery({
    queryKey: ['leads'],
    queryFn: async () => {
      const all = await base44.entities.Lead.list('-created_date');
      return all.filter(l => !l.isDeleted);
    }
  });

  const updateLeadStageMutation = useMutation({
    mutationFn: ({ leadId, stage, notes, lostReason }) => 
      base44.functions.invoke('updateLeadStageV1', {
        leadId,
        newStage: stage,
        notes,
        lostReason
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      toast.success('Lead updated');
    },
    onError: (err) => {
      toast.error(err.message || 'Failed to update lead');
    }
  });

  const sendAcceptanceMutation = useMutation({
    mutationFn: (leadId) => base44.functions.invoke('sendAcceptanceLink', { leadId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
    }
  });

  const batchFollowUpMutation = useMutation({
    mutationFn: ({ leadIds, templateType }) =>
      base44.functions.invoke('batchFollowUpEmailV1', {
        leadIds: Array.from(leadIds),
        templateType,
        initiatedBy: user?.email
      }),
    onSuccess: (res) => {
      setBatchResults(res.data);
      setSelectedLeadIds(new Set());
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      setTimeout(() => {
        setBatchConfirmation(null);
        setTimeout(() => setBatchResults(null), 4000);
      }, 500);
    },
    onError: (err) => {
      toast.error(`Batch send failed: ${err.message}`);
      setBatchConfirmation(null);
    }
  });

  if (user?.role !== 'admin') {
    return (
      <div className="p-8 text-center">
        <AlertCircle className="w-12 h-12 text-red-600 mx-auto mb-4" />
        <p className="text-gray-600">Admin access required</p>
      </div>
    );
  }

  const handleStageChange = (leadId, newStage, oldStage) => {
    // Detect backward move (manual override) and allow regression
    const oldIdx = STAGES.findIndex(s => s.key === oldStage);
    const newIdx = STAGES.findIndex(s => s.key === newStage);
    const isBackwardMove = newIdx < oldIdx && newStage !== 'lost';
    
    updateLeadStageMutation.mutate({ 
      leadId, 
      stage: newStage,
      allowRegression: isBackwardMove 
    }, {
      onSuccess: () => {
        const newStageLabel = STAGES.find(s => s.key === newStage)?.label || newStage;
        toast.success(`Moved to ${newStageLabel}`, {
          action: {
            label: 'Undo',
            onClick: () => updateLeadStageMutation.mutate({ 
              leadId, 
              stage: oldStage,
              allowRegression: true 
            })
          }
        });
      }
    });
  };

  const getLeadsByStage = (stage) => {
    if (stage === 'inspection_confirmed') {
      return leads.filter((lead) => lead.stage === 'inspection_confirmed' || lead.stage === 'quote_sent');
    }
    return leads.filter((lead) => lead.stage === stage);
    };

  const toggleLeadSelect = (leadId) => {
    setSelectedLeadIds(prev => {
      const next = new Set(prev);
      next.has(leadId) ? next.delete(leadId) : next.add(leadId);
      return next;
    });
  };

  const selectVisibleLeads = (visibleLeadIds) => {
    setSelectedLeadIds(prev => {
      const next = new Set(prev);
      visibleLeadIds.forEach(id => {
        next.has(id) ? next.delete(id) : next.add(id);
      });
      return next;
    });
  };

  const handleBatchFollowUp = (templateType) => {
    if (selectedLeadIds.size === 0) {
      toast.error('No leads selected');
      return;
    }
    setBatchConfirmation({
      count: selectedLeadIds.size,
      templateType
    });
  };

  const confirmBatchFollowUp = () => {
    if (batchConfirmation) {
      batchFollowUpMutation.mutate({
        leadIds: selectedLeadIds,
        templateType: batchConfirmation.templateType
      });
    }
  };
  
  const toggleStageExpand = (stageKey) => {
    setExpandedStages(prev => 
      prev.includes(stageKey) ? prev.filter(s => s !== stageKey) : [...prev, stageKey]
    );
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Lead Pipeline</h1>
          <p className="text-gray-600 mt-1">Manage customer onboarding and inspections</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-center">
            <p className="text-2xl font-bold text-teal-600">{leads.filter(l => l.isEligible).length}</p>
            <p className="text-xs text-gray-600">Eligible</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-gray-600">{leads.filter(l => !l.isEligible).length}</p>
            <p className="text-xs text-gray-600">Disqualified</p>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowNewLead(true)}
            className="border-teal-300 text-teal-700 hover:bg-teal-50"
          >
            <Plus className="w-4 h-4 mr-1" />
            Add Lead Manually
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="border-orange-300 text-orange-700 hover:bg-orange-50"
            onClick={() => repairMutation.mutate()}
            disabled={repairMutation.isPending}
          >
            <Wrench className="w-4 h-4 mr-2" />
            {repairMutation.isPending ? 'Scanning...' : 'Repair Stuck Leads'}
          </Button>
        </div>
      </div>

      {repairResult && (
        <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 flex items-center justify-between text-sm">
          <span className="text-orange-800">
            Repair complete: <strong>{repairResult.checked}</strong> checked, <strong>{repairResult.repaired}</strong> fixed, <strong>{repairResult.intact}</strong> intact.
            {repairResult.errors > 0 && <span className="text-red-600 ml-2">{repairResult.errors} errors.</span>}
          </span>
          <button onClick={() => setRepairResult(null)} className="text-orange-600 hover:text-orange-800 ml-4">✕</button>
        </div>
      )}

      {/* Batch Results Modal */}
      {batchResults && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <CardHeader>
              <CardTitle>Batch Send Results</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-green-50 rounded-lg p-3 text-center">
                  <div className="text-2xl font-bold text-green-700">{batchResults.sentCount}</div>
                  <div className="text-xs text-gray-600">Sent</div>
                </div>
                <div className="bg-yellow-50 rounded-lg p-3 text-center">
                  <div className="text-2xl font-bold text-yellow-700">{batchResults.skippedCount}</div>
                  <div className="text-xs text-gray-600">Skipped</div>
                </div>
                <div className="bg-red-50 rounded-lg p-3 text-center">
                  <div className="text-2xl font-bold text-red-700">{batchResults.failedCount}</div>
                  <div className="text-xs text-gray-600">Failed</div>
                </div>
              </div>

              {batchResults.failed && batchResults.failed.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 max-h-32 overflow-y-auto">
                  <p className="text-xs font-semibold text-red-900 mb-2">Failed Leads:</p>
                  <div className="text-xs text-red-700 space-y-1">
                    {batchResults.failed.map(f => (
                      <div key={f.leadId}>
                        <strong>{f.leadName}</strong> ({f.email}): {f.error}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <Button onClick={() => setBatchResults(null)} className="w-full">
                Close
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Batch Confirmation Modal */}
      {batchConfirmation && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <CardHeader>
              <CardTitle>Confirm Batch Send</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <p className="text-sm text-blue-900">
                  <strong>{batchConfirmation.count}</strong> lead{batchConfirmation.count > 1 ? 's' : ''} will receive{' '}
                  <strong>
                    {batchConfirmation.templateType === 'new_lead_followup' 
                      ? 'new lead follow-up email'
                      : 'quote follow-up email'}
                  </strong>
                </p>
              </div>

              <div className="text-xs text-gray-600 bg-gray-50 p-2 rounded">
                Duplicate sends within 24h will be skipped. Failed emails will be reported.
              </div>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => setBatchConfirmation(null)}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button
                  onClick={confirmBatchFollowUp}
                  disabled={batchFollowUpMutation.isPending}
                  className="flex-1 bg-blue-600 hover:bg-blue-700"
                >
                  {batchFollowUpMutation.isPending ? 'Sending...' : 'Send'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Batch Action Bar (sticky) */}
      {selectedLeadIds.size > 0 && (
        <div className="fixed bottom-0 left-0 right-0 bg-blue-900 text-white p-4 z-40 shadow-lg">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <div className="text-sm">
              <strong>{selectedLeadIds.size}</strong> lead{selectedLeadIds.size > 1 ? 's' : ''} selected
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setSelectedLeadIds(new Set())}
                className="border-white text-white hover:bg-blue-800"
              >
                Clear Selection
              </Button>
              <Button
                size="sm"
                onClick={() => handleBatchFollowUp('new_lead_followup')}
                className="bg-blue-500 hover:bg-blue-600"
              >
                Follow Up New Leads
              </Button>
              <Button
                size="sm"
                onClick={() => handleBatchFollowUp('quoted_followup')}
                className="bg-teal-500 hover:bg-teal-600"
              >
                Follow Up Quoted Leads
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Compact Accordion Pipeline View */}
      <div className="space-y-2" style={{ paddingBottom: selectedLeadIds.size > 0 ? '80px' : '0' }}>
        {STAGES.map(stage => {
          const stageLeads = getLeadsByStage(stage);
          const isExpanded = expandedStages.includes(stage.key);
          return (
            <div key={stage.key} className="border border-gray-200 rounded-lg overflow-hidden">
              {/* Stage Header */}
              <button
                onClick={() => toggleStageExpand(stage.key)}
                className="w-full bg-gray-50 hover:bg-gray-100 px-4 py-3 flex items-center justify-between transition-colors"
              >
                <div className="flex items-center gap-3">
                  <ChevronDown className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-0' : '-rotate-90'}`} />
                  <h3 className="font-semibold text-gray-900">{stage.label}</h3>
                  <Badge className={stage.color}>{stageLeads.length}</Badge>
                </div>
                {/* Select all for visible section */}
                {isExpanded && stageLeads.length > 0 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      selectVisibleLeads(stageLeads.map(l => l.id));
                    }}
                    className="text-xs text-blue-600 hover:text-blue-800"
                  >
                    Select All
                  </button>
                )}
              </button>

              {/* Stage Rows */}
              {isExpanded && (
                <div className="divide-y divide-gray-100 bg-white">
                  {stageLeads.length === 0 ? (
                    <div className="p-4 text-center text-gray-400 text-sm">No leads</div>
                  ) : (
                    stageLeads.map(lead => (
                      <LeadRow
                        key={lead.id}
                        lead={lead}
                        stage={stage}
                        groupedSection={null}
                        onAdvance={() => handleAdvance(lead)}
                        onStageChange={(newStage) => handleStageChange(lead.id, newStage, lead.stage)}
                        onEdit={() => setSelectedLead(lead)}
                        queryClient={queryClient}
                        isSelected={selectedLeadIds.has(lead.id)}
                        onToggleSelect={() => toggleLeadSelect(lead.id)}
                      />
                    ))
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {selectedLead && (
       <LeadDetailModal 
         lead={selectedLead} 
         onClose={() => setSelectedLead(null)}
         onUpdate={(data) => updateLeadStageMutation.mutate(data)}
         onSendAcceptance={(leadId) => sendAcceptanceMutation.mutate(leadId)}
         onRemoved={() => setSelectedLead(null)}
       />
      )}

      {showNewLead && <NewLeadModal onClose={() => setShowNewLead(false)} />}
    </div>
  );
}

function LeadRow({ lead, stage, groupedSection, onAdvance, onStageChange, onEdit, queryClient, isSelected, onToggleSelect }) {
  const [validationError, setValidationError] = React.useState(null);
  const [showSendQuoteModal, setShowSendQuoteModal] = React.useState(false);
  const [showSendInspectionModal, setShowSendInspectionModal] = React.useState(false);
  const [showRemovePanel, setShowRemovePanel] = React.useState(false);
  
  const { data: user } = useQuery({
    queryKey: ['user'],
    queryFn: () => base44.auth.me()
  });
  
  // Extract first line of address
  const addressLine = lead.serviceAddress?.split(',')[0] || 'No address';
  
  // Format last update
  const lastUpdate = new Date(lead.updated_date || lead.created_date);
  const daysAgo = Math.floor((Date.now() - lastUpdate) / (1000 * 60 * 60 * 24));
  const timeStr = daysAgo === 0 ? 'Today' : `${daysAgo}d ago`;

  // Extract last email sent timestamp from notes
  const getLastEmailSent = () => {
    if (!lead.notes) return null;
    const quoteMatch = lead.notes.match(/\[QUOTE_EMAIL_SENT\]\s([\dT\-:.Z]+)/);
    const inspectionMatch = lead.notes.match(/\[INSPECTION_LINK_SENT\]\s([\dT\-:.Z]+)/);
    const latest = [quoteMatch?.[1], inspectionMatch?.[1]].filter(Boolean).sort().pop();
    if (latest) {
      const date = new Date(latest);
      return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    return null;
  };

  const lastEmailSent = getLastEmailSent();

  const handleStageAction = (newStage, data) => {
    if (newStage) {
      onStageChange(newStage);
    }
    setValidationError(null);
    // Refresh leads if notes updated
    if (data?.notes) {
      queryClient?.invalidateQueries({ queryKey: ['leads'] });
    }
  };

  const handleValidationError = (msg) => {
    setValidationError(msg);
  };

  const handleSendQuoteSuccess = () => {
    queryClient?.invalidateQueries({ queryKey: ['leads'] });
  };

  const handleSendInspectionSuccess = () => {
    queryClient?.invalidateQueries({ queryKey: ['leads'] });
  };

  const handleRemoveSuccess = () => {
    setShowRemovePanel(false);
    queryClient?.invalidateQueries({ queryKey: ['leads'] });
  };

  return (
    <div className={`px-4 py-3 space-y-2 transition-colors ${isSelected ? 'bg-blue-50' : 'hover:bg-gray-50'}`}>
      {/* Validation Error */}
      {validationError && (
        <StageValidationError error={validationError} onEditInfo={onEdit} />
      )}

      {/* Row — Desktop layout (hidden on mobile) */}
      <div className="hidden sm:flex items-center justify-between gap-2 text-sm">
        {/* Checkbox */}
        <input
          type="checkbox"
          checked={isSelected}
          onChange={onToggleSelect}
          className="w-4 h-4 rounded cursor-pointer flex-shrink-0"
          aria-label="Select lead"
        />
        {/* Lead Info */}
        <div className="flex-1 min-w-0 cursor-pointer" onClick={onEdit}>
          <div className="flex items-start gap-2">
            <div className="flex-1 min-w-0">
              <p className="font-medium text-gray-900">{lead.firstName} {lead.lastName}</p>
              <p className="text-xs text-gray-600 truncate">{addressLine}</p>
              {lastEmailSent && (
                <p className="text-xs text-gray-400 mt-1">📧 {lastEmailSent}</p>
              )}
            </div>
            {!lead.isEligible && <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-1" />}
          </div>
        </div>

        {/* Grouped badge (if in merged section) */}
        {groupedSection && (
          <Badge variant="outline" className="text-xs flex-shrink-0">
            {lead.stage === 'inspection_confirmed' ? 'Inspected' : 'Awaiting'}
          </Badge>
        )}

        {/* Metadata */}
        <div className="text-xs text-gray-500 w-12 text-right flex-shrink-0">{timeStr}</div>

        {/* Stage-Specific Primary Action */}
        <div className="flex-shrink-0">
          {lead.stage === 'new_lead' ? (
            <Button
              size="sm"
              variant="default"
              onClick={() => setShowSendQuoteModal(true)}
              className="gap-1"
            >
              <Send className="w-3 h-3" />
              Quote
            </Button>
          ) : lead.stage === 'contacted' ? (
            <Button
              size="sm"
              variant="default"
              onClick={() => setShowSendInspectionModal(true)}
              className="gap-1"
            >
              <Calendar className="w-3 h-3" />
              Schedule
            </Button>
          ) : lead.stage === 'inspection_scheduled' ? (
            <StartInspectionButton leadId={lead.id} />
          ) : (
            <StageActionButton
              lead={lead}
              currentStage={lead.stage}
              onAction={handleStageAction}
              onValidationError={handleValidationError}
            />
          )}
        </div>

        {/* Stage Dropdown */}
        <Select value={lead.stage} onValueChange={onStageChange}>
          <SelectTrigger className="w-28 h-8 text-xs flex-shrink-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STAGE_OPTIONS.map(s => (
              <SelectItem key={s.key} value={s.key}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Actions Menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="icon" variant="outline" className="h-8 w-8 flex-shrink-0">
              <MoreVertical className="w-4 h-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild>
              <Link to={createPageUrl('CustomerTimeline') + `?leadId=${lead.id}`}>
                <Eye className="w-3 h-3 mr-2" />
                View Timeline
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link to={createPageUrl('EquipmentProfileAdmin') + `?leadId=${lead.id}`}>
                <Settings className="w-3 h-3 mr-2" />
                Equipment
              </Link>
            </DropdownMenuItem>
            {user?.role === 'admin' && lead.stage === 'new_lead' && (
              <DropdownMenuItem onClick={() => setShowRemovePanel(true)} className="text-red-600">
                <Trash2 className="w-3 h-3 mr-2" />
                Delete
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Mobile layout (shown on mobile only) */}
      <div className="sm:hidden space-y-3">
        {/* Checkbox + Lead Info */}
        <div className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={isSelected}
            onChange={onToggleSelect}
            className="w-4 h-4 rounded cursor-pointer mt-1 flex-shrink-0"
            aria-label="Select lead"
          />
          <div className="flex-1 cursor-pointer" onClick={onEdit}>
            <div>
              <p className="font-medium text-gray-900">{lead.firstName} {lead.lastName}</p>
              <p className="text-xs text-gray-600 truncate">{addressLine}</p>
              <div className="flex items-center gap-2 mt-2">
                {groupedSection && (
                  <Badge variant="outline" className="text-xs">
                    {lead.stage === 'inspection_confirmed' ? 'Inspected' : 'Awaiting'}
                  </Badge>
                )}
                <span className="text-xs text-gray-500">{timeStr}</span>
                {!lead.isEligible && <AlertCircle className="w-3 h-3 text-red-600" />}
              </div>
            </div>
          </div>
        </div>

        {/* Mobile Actions Stack */}
        <div className="flex flex-col gap-2">
          {lead.stage === 'new_lead' ? (
            <Button
              size="sm"
              variant="default"
              onClick={() => setShowSendQuoteModal(true)}
              className="w-full gap-2 justify-center"
            >
              <Send className="w-3 h-3" />
              Send Quote
            </Button>
          ) : lead.stage === 'contacted' ? (
            <Button
              size="sm"
              variant="default"
              onClick={() => setShowSendInspectionModal(true)}
              className="w-full gap-2 justify-center"
            >
              <Calendar className="w-3 h-3" />
              Schedule
            </Button>
          ) : lead.stage === 'inspection_scheduled' ? (
            <StartInspectionButton leadId={lead.id} />
          ) : (
            <StageActionButton
              lead={lead}
              currentStage={lead.stage}
              onAction={handleStageAction}
              onValidationError={handleValidationError}
            />
          )}

          <div className="flex gap-2">
            <Select value={lead.stage} onValueChange={onStageChange}>
              <SelectTrigger className="flex-1 h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STAGES.map(s => (
                  <SelectItem key={s.key} value={s.key}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="icon" variant="outline" className="h-8 w-8">
                  <MoreVertical className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem asChild>
                  <Link to={createPageUrl('CustomerTimeline') + `?leadId=${lead.id}`}>
                    <Eye className="w-3 h-3 mr-2" />
                    Timeline
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link to={createPageUrl('EquipmentProfileAdmin') + `?leadId=${lead.id}`}>
                    <Settings className="w-3 h-3 mr-2" />
                    Equipment
                  </Link>
                </DropdownMenuItem>
                {user?.role === 'admin' && lead.stage === 'new_lead' && (
                  <DropdownMenuItem onClick={() => setShowRemovePanel(true)} className="text-red-600">
                    <Trash2 className="w-3 h-3 mr-2" />
                    Delete
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      {/* Remove Lead Panel */}
      {showRemovePanel && (
        <div className="mt-4">
          <RemoveLeadPanel
            lead={lead}
            onClose={() => setShowRemovePanel(false)}
            onRemoved={handleRemoveSuccess}
          />
        </div>
      )}

      {/* Modals */}
      <SendQuoteModal
        lead={lead}
        isOpen={showSendQuoteModal}
        onClose={() => setShowSendQuoteModal(false)}
        onSuccess={handleSendQuoteSuccess}
      />
      <SendInspectionLinkModal
        lead={lead}
        isOpen={showSendInspectionModal}
        onClose={() => setShowSendInspectionModal(false)}
        onSuccess={handleSendInspectionSuccess}
      />
    </div>
  );
}

function LeadDetailModal({ lead, onClose, onUpdate, onSendAcceptance, onRemoved }) {
  const [lostReason, setLostReason] = React.useState('');
  const [showLostForm, setShowLostForm] = React.useState(false);
  const [showUnstick, setShowUnstick] = React.useState(false);
  const [showRemove, setShowRemove] = React.useState(false);
  const [resendingConfirmation, setResendingConfirmation] = React.useState(false);

  const handleResendConfirmation = async () => {
    setResendingConfirmation(true);
    try {
      const res = await base44.functions.invoke('sendInspectionConfirmation', {
        leadId: lead.id,
        firstName: lead.firstName,
        email: lead.email,
        mobilePhone: lead.mobilePhone,
        inspectionDate: lead.requestedInspectionDate,
        inspectionTime: lead.requestedInspectionTime,
        serviceAddress: lead.serviceAddress,
        preferredContact: lead.preferredContact,
        force: true,
      });
      if (res.data?.success) {
        toast.success('Confirmation email resent');
      } else {
        toast.error(res.data?.error || 'Failed to resend');
      }
    } catch {
      toast.error('Failed to resend confirmation');
    } finally {
      setResendingConfirmation(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <Card className="max-w-2xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>{lead.firstName} {lead.lastName}</CardTitle>
            <Button variant="outline" size="sm" onClick={onClose}>Close</Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Contact Info */}
          <div>
            <h3 className="font-semibold mb-3">Contact Information</h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-gray-600">Email</p>
                <p className="font-medium">{lead.email}</p>
              </div>
              <div>
                <p className="text-gray-600">Phone</p>
                <p className="font-medium">{lead.mobilePhone}</p>
              </div>
              <div>
                <p className="text-gray-600">Address</p>
                <p className="font-medium">{lead.serviceAddress}</p>
              </div>
              <div>
                <p className="text-gray-600">Preferred Contact</p>
                <p className="font-medium capitalize">{lead.preferredContact}</p>
              </div>
            </div>
          </div>

          {/* Eligibility Status */}
          <div>
            <h3 className="font-semibold mb-3">Eligibility Status</h3>
            {lead.isEligible ? (
              <Badge className="bg-green-100 text-green-800">✅ Eligible for Service</Badge>
            ) : (
              <div className="space-y-2">
                <Badge className="bg-red-100 text-red-800">❌ Not Eligible</Badge>
                <p className="text-sm text-gray-600">{lead.disqualificationReason}</p>
              </div>
            )}
          </div>

          {/* Pool Details */}
          <div>
            <h3 className="font-semibold mb-3">Pool Details</h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-gray-600">Pool Type</p>
                <p className="font-medium capitalize">{lead.poolType?.replace(/_/g, ' ')}</p>
              </div>
              <div>
                <p className="text-gray-600">Surface</p>
                <p className="font-medium capitalize">{lead.poolSurface?.replace(/_/g, ' ')}</p>
              </div>
              <div>
                <p className="text-gray-600">Filter</p>
                <p className="font-medium uppercase">{lead.filterType}</p>
              </div>
              <div>
                <p className="text-gray-600">Sanitizer</p>
                <p className="font-medium capitalize">{lead.sanitizerType?.replace(/_/g, ' ')}</p>
              </div>
              <div>
                <p className="text-gray-600">Screened</p>
                <p className="font-medium capitalize">{lead.screenedArea?.replace(/_/g, ' ')}</p>
              </div>
              <div>
                <p className="text-gray-600">Condition</p>
                <p className="font-medium capitalize">{lead.poolCondition?.replace(/_/g, ' ')}</p>
              </div>
            </div>
          </div>

          {/* Inspection */}
          {lead.requestedInspectionDate && (
            <div>
              <h3 className="font-semibold mb-3">Inspection Request</h3>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-gray-600">Requested Date</p>
                  <p className="font-medium">{lead.requestedInspectionDate}</p>
                </div>
                <div>
                  <p className="text-gray-600">Requested Time</p>
                  <p className="font-medium capitalize">{lead.requestedInspectionTime}</p>
                </div>
                {lead.assignedInspector && (
                  <div>
                    <p className="text-gray-600">Assigned Inspector</p>
                    <p className="font-medium">{lead.assignedInspector}</p>
                  </div>
                )}
                <div>
                  <p className="text-gray-600">Confirmation Email</p>
                  <div className="flex items-center gap-2">
                    {lead.inspectionConfirmationSent ? (
                      <Badge className="bg-green-100 text-green-800 text-xs">Sent</Badge>
                    ) : (
                      <Badge className="bg-gray-100 text-gray-600 text-xs">Not Sent</Badge>
                    )}
                    {lead.confirmationSentAt && (
                      <span className="text-xs text-gray-400">
                        {new Date(lead.confirmationSentAt).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                </div>
                <div>
                  <p className="text-gray-600">Inspection Event ID</p>
                  <p className="font-mono text-xs text-gray-500">
                    {lead.inspectionEventId || <span className="text-red-500">None (⚠ stuck?)</span>}
                  </p>
                </div>
              </div>
              <div className="mt-3">
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-2 text-teal-700 border-teal-300 hover:bg-teal-50"
                  onClick={handleResendConfirmation}
                  disabled={resendingConfirmation}
                >
                  <RefreshCw className={`w-3 h-3 ${resendingConfirmation ? 'animate-spin' : ''}`} />
                  {lead.inspectionConfirmationSent ? 'Resend Confirmation Email' : 'Send Confirmation Email'}
                </Button>
              </div>
            </div>
          )}

          {/* Admin: Unstick Lead (only for inspection_scheduled) */}
          {lead.stage === 'inspection_scheduled' && (
            <div>
              {!showUnstick ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="border-orange-300 text-orange-700 hover:bg-orange-50"
                  onClick={() => setShowUnstick(true)}
                >
                  <Wrench className="w-4 h-4 mr-2" />
                  Unstick Lead (Admin)
                </Button>
              ) : (
                <UnstickLeadPanel
                  lead={lead}
                  onClose={() => setShowUnstick(false)}
                  onUpdated={onClose}
                />
              )}
            </div>
          )}

          {/* Access */}
          {lead.accessRestrictions !== 'none' && (
            <div>
              <h3 className="font-semibold mb-3">Property Access</h3>
              <div className="text-sm space-y-2">
                <p className="text-gray-600">Access Type: <span className="font-medium capitalize">{lead.accessRestrictions?.replace(/_/g, ' ')}</span></p>
                {lead.gateCode && (
                  <p className="text-gray-600">Gate Code: <span className="font-mono bg-gray-100 px-2 py-1 rounded">{lead.gateCode}</span></p>
                )}
              </div>
            </div>
          )}

          {/* Conversion Status */}
          {(lead.agreementsAccepted || lead.activationPaymentStatus) && (
            <div>
              <h3 className="font-semibold mb-3">Conversion Progress</h3>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  {lead.agreementsAccepted ? (
                    <Check className="w-4 h-4 text-green-600" />
                  ) : (
                    <div className="w-4 h-4 border-2 rounded" />
                  )}
                  <span className="text-sm">Agreements Accepted</span>
                  {lead.agreementsAcceptedAt && (
                    <span className="text-xs text-gray-500">
                      {new Date(lead.agreementsAcceptedAt).toLocaleDateString()}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {lead.activationPaymentStatus === 'paid' ? (
                    <Check className="w-4 h-4 text-green-600" />
                  ) : (
                    <div className="w-4 h-4 border-2 rounded" />
                  )}
                  <span className="text-sm">Activation Payment</span>
                  <Badge className={
                    lead.activationPaymentStatus === 'paid' ? 'bg-green-100 text-green-800' :
                    lead.activationPaymentStatus === 'failed' ? 'bg-red-100 text-red-800' :
                    'bg-gray-100 text-gray-800'
                  }>
                    {lead.activationPaymentStatus || 'Pending'}
                  </Badge>
                </div>
              </div>
            </div>
          )}

          {/* Quick Actions */}
          {lead.isEligible && lead.stage !== 'converted' && lead.stage !== 'lost' && (
            <div className="space-y-3 pt-4 border-t">
              <div className="flex gap-3">
                <Button size="sm" className="flex-1 gap-2">
                  <Phone className="w-4 h-4" />
                  Call
                </Button>
                <Button size="sm" variant="outline" className="flex-1 gap-2">
                  <Mail className="w-4 h-4" />
                  Email
                </Button>
                <Button size="sm" variant="outline" className="flex-1 gap-2">
                  <MessageSquare className="w-4 h-4" />
                  Text
                </Button>
              </div>

              {/* Conversion Actions */}
              {lead.stage === 'inspection_confirmed' && (
                <Button 
                  onClick={() => onSendAcceptance(lead.id)}
                  className="w-full bg-teal-600 hover:bg-teal-700"
                  size="sm"
                >
                  Send Acceptance Link
                </Button>
              )}

              {/* Mark Lost */}
              {!showLostForm ? (
                <Button 
                  onClick={() => setShowLostForm(true)}
                  variant="outline"
                  className="w-full text-red-600 border-red-300 hover:bg-red-50"
                  size="sm"
                >
                  Mark as Lost
                </Button>
              ) : (
                <div className="space-y-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-xs font-semibold text-red-900">Reason for marking lost:</p>
                  <select
                    value={lostReason}
                    onChange={(e) => setLostReason(e.target.value)}
                    className="w-full p-2 border border-red-300 rounded text-sm"
                  >
                    <option value="">Select a reason...</option>
                    <option value="Denied Service">Denied Service</option>
                    <option value="Canceled">Canceled</option>
                    <option value="Other">Other (provide details below)</option>
                  </select>
                  {lostReason === 'Other' && (
                    <textarea
                      placeholder="Provide additional details..."
                      onChange={(e) => setLostReason(`Other: ${e.target.value}`)}
                      className="w-full p-2 border rounded text-sm"
                      rows="2"
                    />
                  )}
                  <div className="flex gap-2">
                    <Button 
                      onClick={() => {
                        onUpdate({ 
                          leadId: lead.id, 
                          stage: 'lost', 
                          lostReason 
                        });
                        setShowLostForm(false);
                        onClose();
                      }}
                      className="flex-1 bg-red-600 hover:bg-red-700"
                      size="sm"
                      disabled={!lostReason}
                    >
                      Confirm Lost
                    </Button>
                    <Button 
                      onClick={() => {
                        setShowLostForm(false);
                        setLostReason('');
                      }}
                      variant="outline"
                      size="sm"
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Lost Reason Display */}
          {lead.stage === 'lost' && lead.notes && lead.notes.includes('[LOST REASON]') && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <h4 className="font-semibold text-red-900 mb-1 text-sm">Lost Reason</h4>
              <p className="text-sm text-red-700">{lead.notes.split('[LOST REASON]')[1]?.trim()}</p>
            </div>
          )}

          {/* Admin: Link Customer Account */}
          <div className="pt-4 border-t">
            <LinkUserToLeadPanel lead={lead} />
          </div>

          {/* Admin: Remove Lead */}
          <div className="pt-4 border-t">
            {!showRemove ? (
              <button
                onClick={() => setShowRemove(true)}
                className="text-xs text-gray-400 hover:text-red-600 transition-colors flex items-center gap-1"
              >
                <Trash2Icon className="w-3 h-3" />
                Remove Lead
              </button>
            ) : (
              <RemoveLeadPanel
                lead={lead}
                onClose={() => setShowRemove(false)}
                onRemoved={onRemoved || onClose}
              />
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Trash2Icon(props) {
  return (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
    </svg>
  );
}