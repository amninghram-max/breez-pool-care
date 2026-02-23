import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { PlayCircle, Download, CheckCircle, XCircle, Clock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

export default function TestDashboard() {
  const [testResults, setTestResults] = useState(null);

  const { data: user } = useQuery({
    queryKey: ['user'],
    queryFn: () => base44.auth.me()
  });

  const runTestsMutation = useMutation({
    mutationFn: async () => {
      const response = await base44.functions.invoke('test-runner', { runAll: true });
      return response.data;
    },
    onSuccess: (data) => {
      setTestResults(data);
    }
  });

  const downloadHTMLReport = async () => {
    const response = await base44.functions.invoke('test-runner', { runAll: true, format: 'html' });
    const blob = new Blob([response.data], { type: 'text/html' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `breez-test-report-${new Date().toISOString().split('T')[0]}.html`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    a.remove();
  };

  if (user?.role !== 'admin') {
    return (
      <Alert className="border-red-200 bg-red-50">
        <AlertDescription className="text-red-800">
          Admin access required to view test dashboard.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-gray-900">Test Dashboard</h1>
          <p className="text-gray-600 mt-1">Automated test suite for Breez pricing engine, workflows, and security</p>
        </div>
        <div className="flex gap-3">
          <Button
            onClick={() => runTestsMutation.mutate()}
            disabled={runTestsMutation.isPending}
            className="bg-teal-600 hover:bg-teal-700"
          >
            <PlayCircle className="w-4 h-4 mr-2" />
            {runTestsMutation.isPending ? 'Running Tests...' : 'Run All Tests'}
          </Button>
          {testResults && (
            <Button
              onClick={downloadHTMLReport}
              variant="outline"
            >
              <Download className="w-4 h-4 mr-2" />
              Download HTML Report
            </Button>
          )}
        </div>
      </div>

      {runTestsMutation.isPending && (
        <Card className="border-blue-200 bg-blue-50">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Clock className="w-5 h-5 text-blue-600 animate-spin" />
              <p className="text-blue-800">Running comprehensive test suite...</p>
            </div>
          </CardContent>
        </Card>
      )}

      {testResults && (
        <>
          {/* Summary Card */}
          <Card className={`border-2 ${testResults.summary.failed === 0 ? 'border-green-500 bg-green-50' : 'border-red-500 bg-red-50'}`}>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span className="flex items-center gap-2">
                  {testResults.summary.failed === 0 ? (
                    <CheckCircle className="w-6 h-6 text-green-600" />
                  ) : (
                    <XCircle className="w-6 h-6 text-red-600" />
                  )}
                  Test Results
                </span>
                <span className="text-sm text-gray-600">
                  {new Date(testResults.summary.timestamp).toLocaleString()}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-5 gap-4">
                <div className="text-center">
                  <div className="text-3xl font-bold text-gray-900">{testResults.summary.totalTests}</div>
                  <div className="text-sm text-gray-600">Total Tests</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-green-600">{testResults.summary.passed}</div>
                  <div className="text-sm text-gray-600">Passed</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-red-600">{testResults.summary.failed}</div>
                  <div className="text-sm text-gray-600">Failed</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-gray-600">{testResults.summary.skipped}</div>
                  <div className="text-sm text-gray-600">Skipped</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-teal-600">{testResults.coverage.overall}%</div>
                  <div className="text-sm text-gray-600">Coverage</div>
                </div>
              </div>
              <div className="mt-4 text-sm text-gray-600">
                Duration: {(testResults.summary.duration / 1000).toFixed(2)}s
              </div>
            </CardContent>
          </Card>

          {/* Coverage by Module */}
          <Card>
            <CardHeader>
              <CardTitle>Coverage by Module</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                {Object.entries(testResults.coverage).filter(([k]) => k !== 'overall').map(([name, pct]) => (
                  <div key={name} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                    <span className="font-medium">{name.replace('-', ' ').toUpperCase()}</span>
                    <Badge className={pct >= 80 ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}>
                      {pct}%
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Test Suites */}
          <Card>
            <CardHeader>
              <CardTitle>Test Suites</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {Object.entries(testResults.suites).map(([name, suite]) => (
                  <div key={name} className="border rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="font-semibold">{name.replace('-', ' ').toUpperCase()}</h3>
                      <Badge className={suite.failed === 0 ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}>
                        {suite.passed}/{suite.total}
                      </Badge>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div 
                        className="bg-green-500 h-2 rounded-full transition-all"
                        style={{ width: `${(suite.passed / suite.total) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Failures */}
          {testResults.failures.length > 0 && (
            <Card className="border-red-200">
              <CardHeader>
                <CardTitle className="text-red-800">Failures ({testResults.failures.length})</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {testResults.failures.map((failure, idx) => (
                    <div key={idx} className="bg-red-50 border border-red-200 rounded-lg p-4">
                      <div className="font-semibold text-red-900 mb-2">
                        {failure.suite} / {failure.test}
                      </div>
                      <div className="text-sm space-y-1">
                        <div><strong>Expected:</strong> {JSON.stringify(failure.expected)}</div>
                        <div><strong>Actual:</strong> {JSON.stringify(failure.actual)}</div>
                      </div>
                      {failure.stack && (
                        <pre className="mt-2 text-xs bg-white p-2 rounded overflow-x-auto">
                          {failure.stack}
                        </pre>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* Test Suites Documentation */}
      <Card>
        <CardHeader>
          <CardTitle>Test Suites Coverage</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4 text-sm">
            <div>
              <h4 className="font-semibold text-teal-700">Pricing Engine (Unit Tests)</h4>
              <p className="text-gray-600">Base tiers, additive tokens, one-time fees, risk engine, frequency overrides, floor enforcement</p>
            </div>
            <div>
              <h4 className="font-semibold text-teal-700">Lead Pipeline (Integration)</h4>
              <p className="text-gray-600">Quote → Lead creation → Inspection → Agreements → Payment → Activation</p>
            </div>
            <div>
              <h4 className="font-semibold text-teal-700">Billing & AutoPay (Integration)</h4>
              <p className="text-gray-600">AutoPay discount, grace periods, suspension, reinstatement</p>
            </div>
            <div>
              <h4 className="font-semibold text-teal-700">Security & RBAC (Critical)</h4>
              <p className="text-gray-600">Role-based access control, data leak prevention, admin-only fields hidden</p>
            </div>
            <div>
              <h4 className="font-semibold text-teal-700">Scheduling & Routing (Integration)</h4>
              <p className="text-gray-600">Mon-Sat scheduling, customer constraints, storm rescheduling</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}