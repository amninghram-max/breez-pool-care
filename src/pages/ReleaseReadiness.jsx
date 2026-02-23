import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  CheckCircle2, 
  XCircle, 
  AlertTriangle, 
  Loader2,
  Shield,
  Rocket,
  Lock
} from 'lucide-react';

export default function ReleaseReadiness() {
  const [readinessResults, setReadinessResults] = useState(null);

  const { data: user } = useQuery({
    queryKey: ['user'],
    queryFn: () => base44.auth.me()
  });

  const checkReadiness = useMutation({
    mutationFn: async () => {
      const response = await base44.functions.invoke('checkReleaseReadiness', {});
      return response.data;
    },
    onSuccess: (data) => {
      setReadinessResults(data);
    }
  });

  if (user?.role !== 'admin') {
    return (
      <Alert>
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>Admin access required</AlertDescription>
      </Alert>
    );
  }

  const results = readinessResults;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
          <Shield className="w-8 h-8 text-blue-600" />
          Production Release Readiness
        </h1>
        <p className="text-gray-600 mt-2">
          Pre-deployment validation gate — ensures all critical checks pass before production deploy
        </p>
      </div>

      {/* Status Banner */}
      {results && (
        <Card className={`border-2 ${
          results.releaseReady 
            ? 'border-green-500 bg-green-50' 
            : 'border-red-500 bg-red-50'
        }`}>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              {results.releaseReady ? (
                <>
                  <CheckCircle2 className="w-12 h-12 text-green-600" />
                  <div>
                    <h2 className="text-2xl font-bold text-green-900">✅ RELEASE READY</h2>
                    <p className="text-green-700">All critical checks passed. Safe to deploy to production.</p>
                  </div>
                  <Rocket className="w-8 h-8 text-green-600 ml-auto" />
                </>
              ) : (
                <>
                  <XCircle className="w-12 h-12 text-red-600" />
                  <div>
                    <h2 className="text-2xl font-bold text-red-900">🚨 DEPLOYMENT BLOCKED</h2>
                    <p className="text-red-700">Critical issues detected. Fix blockers before deploying.</p>
                  </div>
                  <Lock className="w-8 h-8 text-red-600 ml-auto" />
                </>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Check Button */}
      <Card>
        <CardHeader>
          <CardTitle>Run Release Readiness Check</CardTitle>
          <CardDescription>
            Validates all critical conditions before production deploy
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            onClick={() => checkReadiness.mutate()}
            disabled={checkReadiness.isPending}
            className="w-full bg-[var(--color-primary)] hover:bg-[var(--color-primary)]/90"
            size="lg"
          >
            {checkReadiness.isPending ? (
              <>
                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                Running Checks...
              </>
            ) : (
              <>
                <Shield className="w-5 h-5 mr-2" />
                Check Release Readiness
              </>
            )}
          </Button>
          {checkReadiness.isPending && (
            <p className="text-sm text-gray-600 mt-3 text-center">
              Running full test suite and validating config... This may take 10-15 seconds.
            </p>
          )}
        </CardContent>
      </Card>

      {checkReadiness.isError && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{checkReadiness.error.message}</AlertDescription>
        </Alert>
      )}

      {/* Blockers */}
      {results && results.blockers.length > 0 && (
        <Card className="border-red-500">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-red-700">
              <XCircle className="w-5 h-5" />
              Deployment Blockers ({results.blockers.length})
            </CardTitle>
            <CardDescription>These issues MUST be resolved before deploy</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {results.blockers.map((blocker, idx) => (
                <div key={idx} className="flex items-start gap-3 p-3 bg-red-50 border border-red-200 rounded-lg">
                  <XCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                  <p className="text-red-800 font-medium">{blocker}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Warnings */}
      {results && results.warnings.length > 0 && (
        <Card className="border-amber-500">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-amber-700">
              <AlertTriangle className="w-5 h-5" />
              Warnings ({results.warnings.length})
            </CardTitle>
            <CardDescription>Non-blocking concerns — review recommended</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {results.warnings.map((warning, idx) => (
                <div key={idx} className="flex items-start gap-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                  <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                  <p className="text-amber-800">{warning}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Detailed Checks */}
      {results && (
        <Card>
          <CardHeader>
            <CardTitle>Detailed Check Results</CardTitle>
            <CardDescription>Status of each validation condition</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {Object.entries(results.checks).map(([checkName, check]) => (
                <div key={checkName} className={`flex items-start gap-3 p-4 border rounded-lg ${
                  check.passed ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'
                }`}>
                  {check.passed ? (
                    <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                  ) : (
                    <XCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                  )}
                  <div className="flex-1">
                    <p className={`font-semibold ${
                      check.passed ? 'text-green-900' : 'text-red-900'
                    }`}>
                      {checkName.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}
                    </p>
                    <p className={`text-sm ${
                      check.passed ? 'text-green-700' : 'text-red-700'
                    }`}>
                      {check.details || (check.passed ? 'Passed' : 'Failed')}
                    </p>
                    {check.error && (
                      <p className="text-xs text-red-600 mt-1">Error: {check.error}</p>
                    )}
                    {check.criticalFailed !== undefined && (
                      <p className="text-xs text-gray-600 mt-1">
                        Critical failures: {check.criticalFailed}
                      </p>
                    )}
                    {check.mismatches !== undefined && (
                      <p className="text-xs text-gray-600 mt-1">
                        Snapshot mismatches: {check.mismatches}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Test Summary */}
      {results?.testResults && (
        <Card>
          <CardHeader>
            <CardTitle>Test Suite Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
              <div>
                <p className="text-2xl font-bold">{results.testResults.totalTests}</p>
                <p className="text-sm text-gray-600">Total Tests</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-green-600">{results.testResults.passed}</p>
                <p className="text-sm text-gray-600">Passed</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-red-600">{results.testResults.failed}</p>
                <p className="text-sm text-gray-600">Failed</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-amber-600">{results.testResults.criticalFailed}</p>
                <p className="text-sm text-gray-600">Critical Failed</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}