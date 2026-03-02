import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertCircle, Trash2, CheckCircle2, Clock } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useToast } from '@/components/ui/use-toast';

export default function BulkTestDataCleanup() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [dryRunResult, setDryRunResult] = useState(null);
  const [step, setStep] = useState('idle'); // idle, dryRun, confirming, deleting, done

  const handleDryRun = async () => {
    setLoading(true);
    try {
      // Step 1: Discover test leads (no execution yet)
      const discoverRes = await base44.functions.invoke('bulkSoftDeleteTestLeadsV2', {
        dryRun: true,
        data_env: 'dev'
        // No leadIds - triggers discover mode
      });
      const discoverData = discoverRes?.data ?? discoverRes;

      if (!discoverData.success) {
        toast({
          title: 'Dry Run Failed',
          description: discoverData.error || 'Unknown error',
          variant: 'destructive'
        });
        setLoading(false);
        return;
      }

      // Step 2: Execute dry run on discovered leads (dryRun = true, no mutations)
      const dryRunRes = await base44.functions.invoke('bulkSoftDeleteTestLeadsV2', {
        dryRun: true,
        data_env: 'dev',
        leadIds: discoverData.leadIds
      });
      const dryRunData = dryRunRes?.data ?? dryRunRes;

      if (dryRunData.success) {
        setDryRunResult(dryRunData);
        setStep('confirming');
        toast({
          title: 'Dry Run Complete',
          description: `Found ${dryRunData.matchedCount} test leads. Review and confirm to delete.`,
          duration: 5000
        });
      } else {
        toast({
          title: 'Dry Run Failed',
          description: dryRunData.error || 'Unknown error',
          variant: 'destructive'
        });
      }
    } catch (e) {
      toast({
        title: 'Error',
        description: e.message,
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmDelete = async () => {
    setLoading(true);
    setStep('deleting');
    try {
      const res = await base44.functions.invoke('bulkSoftDeleteTestLeadsV1', {
        dryRun: false
      });
      const data = res?.data ?? res;

      if (data.success) {
        setDryRunResult(data);
        setStep('done');
        toast({
          title: 'Success',
          description: `Deleted ${data.deletedCount} test leads.`,
          duration: 5000
        });
      } else {
        toast({
          title: 'Delete Failed',
          description: data.error || 'Unknown error',
          variant: 'destructive'
        });
        setStep('confirming');
      }
    } catch (e) {
      toast({
        title: 'Error',
        description: e.message,
        variant: 'destructive'
      });
      setStep('confirming');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setDryRunResult(null);
    setStep('idle');
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Trash2 className="w-4 h-4" /> Clean Test Data
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {step === 'idle' && (
          <div className="space-y-3">
            <p className="text-sm text-gray-600">
              Remove all test customer leads (test.customer*.@breezpoolcare.com) and their scheduled appointments.
            </p>
            <Button
              onClick={handleDryRun}
              disabled={loading}
              variant="outline"
              className="w-full"
            >
              {loading ? 'Checking...' : 'Review Test Data'}
            </Button>
          </div>
        )}

        {step === 'confirming' && dryRunResult && (
          <div className="space-y-3">
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
                <div className="text-sm">
                  <p className="font-semibold text-amber-900">Found {dryRunResult.matchedCount} test leads</p>
                  <p className="text-amber-700 text-xs mt-1">
                    This will soft-delete the leads and cancel all linked appointments. This cannot be undone.
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-gray-50 rounded-lg p-3 space-y-2">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <p className="text-gray-500 text-xs">Total Matched</p>
                  <p className="font-semibold text-lg">{dryRunResult.matchedCount}</p>
                </div>
                <div>
                  <p className="text-gray-500 text-xs">Ready to Delete</p>
                  <p className="font-semibold text-lg text-amber-600">{dryRunResult.skippedCount}</p>
                </div>
              </div>
              {dryRunResult.leadIds && dryRunResult.leadIds.length > 0 && (
                <div className="mt-3 pt-3 border-t border-gray-200">
                  <p className="text-xs text-gray-600 mb-1">Lead IDs:</p>
                  <div className="bg-white p-2 rounded border border-gray-200 max-h-32 overflow-y-auto text-xs font-mono text-gray-700">
                    {dryRunResult.leadIds.join('\n')}
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-2">
              <Button
                onClick={handleConfirmDelete}
                disabled={loading}
                className="flex-1 bg-red-600 hover:bg-red-700"
              >
                {loading ? 'Deleting...' : 'Confirm Delete'}
              </Button>
              <Button
                onClick={handleReset}
                disabled={loading}
                variant="outline"
                className="flex-1"
              >
                Cancel
              </Button>
            </div>
          </div>
        )}

        {step === 'deleting' && (
          <div className="space-y-3">
            <div className="flex items-center justify-center gap-2 text-sm text-blue-600">
              <Clock className="w-4 h-4 animate-spin" />
              Deleting test leads...
            </div>
          </div>
        )}

        {step === 'done' && dryRunResult && (
          <div className="space-y-3">
            <div className="bg-green-50 border border-green-200 rounded-lg p-3">
              <div className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                <div className="text-sm">
                  <p className="font-semibold text-green-900">Clean Complete</p>
                  <p className="text-green-700 text-xs mt-1">
                    {dryRunResult.deletedCount} leads and {dryRunResult.deletedCount} appointment sets deleted.
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-gray-50 rounded-lg p-3">
              <div className="grid grid-cols-3 gap-2 text-sm text-center">
                <div>
                  <p className="text-gray-500 text-xs">Matched</p>
                  <p className="font-semibold text-lg">{dryRunResult.matchedCount}</p>
                </div>
                <div>
                  <p className="text-gray-500 text-xs">Deleted</p>
                  <p className="font-semibold text-lg text-green-600">{dryRunResult.deletedCount}</p>
                </div>
                <div>
                  <p className="text-gray-500 text-xs">Skipped</p>
                  <p className="font-semibold text-lg text-gray-600">{dryRunResult.skippedCount}</p>
                </div>
              </div>
            </div>

            <Button onClick={handleReset} className="w-full">
              Done
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}