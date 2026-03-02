import React, { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Plus, X, Search } from 'lucide-react';
import { toast } from 'sonner';
import RetestPrompt from './RetestPrompt';
import { getRetestEligibility } from './retestHeuristics';

function ChemicalDoseModal({ isOpen, onClose, onAddDose, chemicals = [], propertyId, visitReadings, onDoseApplied }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedChemicalId, setSelectedChemicalId] = useState('');
  const [amount, setAmount] = useState('');
  const [suggestion, setSuggestion] = useState(null);
  const [loadingSuggestion, setLoadingSuggestion] = useState(false);
  const [wasSuggestionUsed, setWasSuggestionUsed] = useState(false);

  const filteredChemicals = useMemo(() => {
    if (!searchQuery.trim()) return chemicals;
    const q = searchQuery.toLowerCase();
    return chemicals.filter(
      chem =>
        chem.name.toLowerCase().includes(q) ||
        chem.activeIngredient?.toLowerCase().includes(q) ||
        chem.tags?.some(tag => tag.toLowerCase().includes(q))
    );
  }, [chemicals, searchQuery]);

  const selectedChemical = chemicals.find(c => c.id === selectedChemicalId);

  // Fetch suggestion when chemical is selected
  React.useEffect(() => {
    setSuggestion(null);
    setLoadingSuggestion(false);

    if (!selectedChemicalId || !propertyId || !visitReadings?.freeChlorine || !visitReadings?.pH || !visitReadings?.totalAlkalinity) {
      return;
    }

    const fetchSuggestion = async () => {
      try {
        setLoadingSuggestion(true);
        const response = await base44.functions.invoke('calculateChemicalSuggestions', {
          propertyId,
          readings: {
            freeChlorine: parseFloat(visitReadings.freeChlorine),
            pH: parseFloat(visitReadings.pH),
            totalAlkalinity: parseFloat(visitReadings.totalAlkalinity)
          }
        });

        if (response.data && response.data.adjustments) {
          // Find suggestion matching this chemical's serviceVisitKey
          const chemical = selectedChemical;
          const match = response.data.adjustments.find(
            adj => adj.chemical?.toLowerCase() === chemical.serviceVisitKey.replace(/([A-Z])/g, ' $1').toLowerCase().trim()
          );

          if (match) {
            setSuggestion({
              amount: match.amount,
              unit: match.unit,
              reason: match.reason
            });
          }
        }
      } catch (error) {
        console.error('Error fetching suggestion:', error);
      } finally {
        setLoadingSuggestion(false);
      }
    };

    fetchSuggestion();
  }, [selectedChemicalId, propertyId, visitReadings]);

  const handleUseSuggestion = () => {
    if (suggestion) {
      setAmount(suggestion.amount.toString());
      setWasSuggestionUsed(true);
    }
  };

  const handleSave = () => {
    if (!selectedChemicalId || !amount) {
      toast.error('Please select a chemical and enter an amount');
      return;
    }

    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      toast.error('Amount must be a positive number');
      return;
    }

    const dose = {
      chemicalId: selectedChemicalId,
      chemicalName: selectedChemical.name,
      serviceVisitKey: selectedChemical.serviceVisitKey,
      amount: amountNum,
      unit: selectedChemical.defaultDoseUnit
    };

    onAddDose(dose);

    // Signal to parent to check retest eligibility
    if (onDoseApplied) {
      onDoseApplied(dose, wasSuggestionUsed, suggestion?.reason);
    }

    // Reset
    setSearchQuery('');
    setSelectedChemicalId('');
    setAmount('');
    setSuggestion(null);
    setWasSuggestionUsed(false);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add Chemical Dose</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Chemical Search */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Select Chemical</label>
            <div className="relative mb-2">
              <Search className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
              <Input
                placeholder="Search chemicals..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
                autoFocus
              />
            </div>

            {/* Dropdown */}
            {filteredChemicals.length > 0 && (
              <div className="border border-gray-300 rounded-lg max-h-48 overflow-y-auto bg-white">
                {filteredChemicals.map(chem => (
                  <button
                    key={chem.id}
                    onClick={() => setSelectedChemicalId(chem.id)}
                    className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-100 transition-colors border-b last:border-b-0 ${
                      selectedChemicalId === chem.id ? 'bg-blue-50 border-l-2 border-l-blue-600' : ''
                    }`}
                  >
                    <div className="font-medium text-gray-900">{chem.name}</div>
                    <div className="text-xs text-gray-600">
                      {chem.activeIngredient && `${chem.activeIngredient} • `}
                      {chem.defaultDoseUnit}
                    </div>
                  </button>
                ))}
              </div>
            )}

            {filteredChemicals.length === 0 && searchQuery && (
              <p className="text-sm text-gray-600 py-2">No chemicals found</p>
            )}
          </div>

          {/* Selected Chemical Info & Suggestion */}
          {selectedChemical && (
            <div className="space-y-3">
              <div className="bg-blue-50 border border-blue-200 p-3 rounded-lg text-sm">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="font-semibold text-gray-900">{selectedChemical.name}</p>
                    <p className="text-xs text-gray-600 mt-1">
                      <span className="font-semibold">Logs as:</span> {selectedChemical.serviceVisitKey}
                    </p>
                  </div>
                </div>
                <p className="text-xs text-gray-600">
                  <span className="font-semibold">Default unit:</span> {selectedChemical.defaultDoseUnit}
                </p>
              </div>

              {/* Suggested Dose */}
              {loadingSuggestion ? (
                <div className="bg-amber-50 border border-amber-200 p-3 rounded-lg text-sm">
                  <p className="text-xs text-amber-700">Calculating suggestion...</p>
                </div>
              ) : suggestion ? (
                <div className="bg-green-50 border border-green-200 p-3 rounded-lg text-sm space-y-2">
                  <div>
                    <p className="font-semibold text-green-900">Suggested Dose</p>
                    <p className="text-xs text-green-700 mt-1">{suggestion.reason}</p>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-green-900">
                      {suggestion.amount} {suggestion.unit}
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleUseSuggestion}
                      className="text-xs border-green-300 hover:bg-green-100"
                    >
                      Use Suggested
                    </Button>
                  </div>
                </div>
              ) : (
                !loadingSuggestion && (
                  <div className="bg-gray-50 border border-gray-200 p-3 rounded-lg text-sm">
                    <p className="text-xs text-gray-600">No suggestion available for this chemical.</p>
                  </div>
                )
              )}
            </div>
          )}

          {/* Amount Input */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Amount ({selectedChemical?.defaultDoseUnit || 'unit'})
            </label>
            <Input
              type="number"
              step="0.01"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.0"
              className="text-lg"
            />
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-4 border-t">
            <Button
              onClick={handleSave}
              disabled={!selectedChemicalId || !amount}
              className="flex-1 bg-blue-600 hover:bg-blue-700"
            >
              Add Dose
            </Button>
            <Button variant="outline" onClick={onClose} className="flex-1">
              Cancel
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function ChemicalsAddedSection({ chemicalsAdded, onChemicalsChange, propertyId, visitReadings, technicianId }) {
  const queryClient = useQueryClient();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [bucketUnits, setBucketUnits] = useState({});
  const [retestPromptOpen, setRetestPromptOpen] = useState(false);
  const [retestDetails, setRetestDetails] = useState(null);
  const [dismissRetestPrompt, setDismissRetestPrompt] = useState(false);

  const { data: chemicals = [] } = useQuery({
    queryKey: ['chemicalCatalogForService'],
    queryFn: () => base44.entities.ChemicalCatalogItem.list('-updated_date', 100)
  });

  const createRetestMutation = useMutation({
    mutationFn: async (retestData) => {
      return base44.entities.RetestRecord.create(retestData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['retestRecords'] });
      toast.success(`Retest reminder set for ${retestDetails.minutes} minutes.`);
      setRetestPromptOpen(false);
      setRetestDetails(null);
    }
  });

  const handleAddDose = (dose) => {
    const key = dose.serviceVisitKey;
    const priorUnit = bucketUnits[key];

    // Unit consistency check
    if (priorUnit && priorUnit !== dose.unit) {
      toast.error(
        `Unit mismatch: "${key}" is tracked in ${priorUnit}. Selected chemical uses ${dose.unit}.`
      );
      return;
    }

    // If this is the first dose for this bucket, lock in the unit
    if (!priorUnit) {
      setBucketUnits({
        ...bucketUnits,
        [key]: dose.unit
      });
    }

    const currentValue = parseFloat(chemicalsAdded[key]) || 0;
    const newValue = (currentValue + dose.amount).toString();

    onChemicalsChange({
      ...chemicalsAdded,
      [key]: newValue
    });

    toast.success(`Added ${dose.amount} ${dose.unit} to ${dose.chemicalName}`);
  };

  const handleRemoveChemical = (key) => {
    onChemicalsChange({
      ...chemicalsAdded,
      [key]: ''
    });
    // Clear the unit tracking for this bucket
    const newUnits = { ...bucketUnits };
    delete newUnits[key];
    setBucketUnits(newUnits);
  };

  const handleDoseApplied = (dose, wasSuggested, suggestionReason) => {
    if (dismissRetestPrompt) return;

    const eligibility = getRetestEligibility(dose, wasSuggested, suggestionReason);
    if (eligibility.eligible) {
      setRetestDetails({
        dose,
        minutes: eligibility.minutes,
        reason: eligibility.reason
      });
      setRetestPromptOpen(true);
    }
  };

  const handleRetestSelection = (minutes, dontAskAgain) => {
    if (dontAskAgain) {
      setDismissRetestPrompt(true);
    }

    if (minutes) {
      const now = new Date();
      const retestDate = new Date(now.getTime() + minutes * 60000);

      createRetestMutation.mutate({
        leadId: propertyId,
        poolId: propertyId,
        originalTestId: 'pending', // Placeholder until actual test is saved
        retestDate: retestDate.toISOString(),
        technicianId: technicianId || 'unknown',
        reasonForRetest: 'post_treatment'
      });
    } else {
      setRetestPromptOpen(false);
      setRetestDetails(null);
    }
  };

  // Build display list: group chemicals by serviceVisitKey, show which registry items map to it
  const displayItems = useMemo(() => {
    const items = [];
    Object.entries(chemicalsAdded).forEach(([key, value]) => {
      if (value && parseFloat(value) > 0) {
        const registryItems = chemicals.filter(c => c.serviceVisitKey === key);
        items.push({
          key,
          value: parseFloat(value),
          registryItems
        });
      }
    });
    return items;
  }, [chemicalsAdded, chemicals]);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Chemicals Added</CardTitle>
          <ChemicalDoseModal
            isOpen={isModalOpen}
            onClose={() => setIsModalOpen(false)}
            onAddDose={handleAddDose}
            chemicals={chemicals}
            propertyId={propertyId}
            visitReadings={visitReadings}
            onDoseApplied={handleDoseApplied}
          />
          <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="bg-blue-600 hover:bg-blue-700">
                <Plus className="w-4 h-4 mr-2" />
                Add Dose
              </Button>
            </DialogTrigger>
          </Dialog>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {displayItems.length === 0 ? (
          <p className="text-gray-600 text-sm">No chemicals added yet. Click "Add Dose" to start.</p>
        ) : (
          <div className="space-y-3">
            {displayItems.map(item => (
              <div key={item.key} className="border border-gray-200 rounded-lg p-3 bg-gray-50">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="font-semibold text-gray-900">
                        {item.value} <span className="font-mono text-sm text-gray-600">{bucketUnits[item.key] || item.registryItems[0]?.defaultDoseUnit || '?'}</span>
                      </span>
                      <Badge variant="outline" className="text-xs font-mono">
                        {item.key}
                      </Badge>
                    </div>

                    {/* Show which registry items map to this key */}
                    {item.registryItems.length > 0 && (
                      <div className="text-xs text-gray-600 space-y-1">
                        {item.registryItems.length === 1 ? (
                          <p>{item.registryItems[0].name}</p>
                        ) : (
                          <>
                            <p className="font-semibold">Possible sources:</p>
                            <ul className="ml-3 list-disc">
                              {item.registryItems.map(reg => (
                                <li key={reg.id}>{reg.name}</li>
                              ))}
                            </ul>
                            <p className="italic text-gray-500 mt-1">
                              (Total stored as {item.value} under "{item.key}")
                            </p>
                          </>
                        )}
                      </div>
                    )}
                  </div>

                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleRemoveChemical(item.key)}
                    className="text-red-600 hover:bg-red-50"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      {/* Retest Prompt */}
      {retestDetails && (
        <RetestPrompt
          isOpen={retestPromptOpen}
          onClose={() => {
            setRetestPromptOpen(false);
            setRetestDetails(null);
          }}
          onSelect={handleRetestSelection}
          reason={retestDetails.reason}
          isDismissed={dismissRetestPrompt}
        />
      )}
    </Card>
  );
}