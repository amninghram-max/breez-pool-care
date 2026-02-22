import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertTriangle, Download } from 'lucide-react';

import SalesFunnelDashboard from '../components/analytics/SalesFunnelDashboard';
import RevenueDashboard from '../components/analytics/RevenueDashboard';
import OperationsDashboard from '../components/analytics/OperationsDashboard';
import ChemistryDashboard from '../components/analytics/ChemistryDashboard';
import SupportDashboard from '../components/analytics/SupportDashboard';
import AnalyticsFilters from '../components/analytics/AnalyticsFilters';

export default function Analytics() {
  const [filters, setFilters] = useState({
    dateRange: '30d',
    startDate: null,
    endDate: null,
    technician: null,
    city: null,
    zipCode: null
  });

  const { data: user } = useQuery({
    queryKey: ['user'],
    queryFn: () => base44.auth.me()
  });

  const handleExport = async (exportType) => {
    try {
      const response = await base44.functions.invoke('exportAnalytics', {
        exportType,
        startDate: filters.startDate,
        endDate: filters.endDate
      });

      const blob = new Blob([response.data], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${exportType}-export-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      a.remove();
    } catch (error) {
      alert('Failed to export data');
    }
  };

  if (user && user.role !== 'admin') {
    return (
      <div className="max-w-4xl mx-auto">
        <Card>
          <CardContent className="p-12 text-center">
            <AlertTriangle className="w-16 h-16 mx-auto mb-4 text-gray-400" />
            <h2 className="text-xl font-bold mb-2">Access Denied</h2>
            <p className="text-gray-600">This page is only accessible to administrators.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Analytics</h1>
          <p className="text-gray-600 mt-1">Business performance and insights</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => handleExport('events')}>
            <Download className="w-4 h-4 mr-2" />
            Export Events
          </Button>
          <Button variant="outline" size="sm" onClick={() => handleExport('invoices')}>
            <Download className="w-4 h-4 mr-2" />
            Export Invoices
          </Button>
        </div>
      </div>

      {/* Filters */}
      <AnalyticsFilters filters={filters} setFilters={setFilters} />

      {/* Dashboards */}
      <Tabs defaultValue="sales" className="space-y-6">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="sales">Sales Funnel</TabsTrigger>
          <TabsTrigger value="revenue">Revenue</TabsTrigger>
          <TabsTrigger value="operations">Operations</TabsTrigger>
          <TabsTrigger value="chemistry">Chemistry</TabsTrigger>
          <TabsTrigger value="support">Support</TabsTrigger>
        </TabsList>

        <TabsContent value="sales">
          <SalesFunnelDashboard filters={filters} />
        </TabsContent>

        <TabsContent value="revenue">
          <RevenueDashboard filters={filters} />
        </TabsContent>

        <TabsContent value="operations">
          <OperationsDashboard filters={filters} />
        </TabsContent>

        <TabsContent value="chemistry">
          <ChemistryDashboard filters={filters} />
        </TabsContent>

        <TabsContent value="support">
          <SupportDashboard filters={filters} />
        </TabsContent>
      </Tabs>
    </div>
  );
}