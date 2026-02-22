import React from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

export default function SalesFunnelDashboard({ filters }) {
  const { data, isLoading } = useQuery({
    queryKey: ['salesAnalytics', filters],
    queryFn: async () => {
      const response = await base44.functions.invoke('getAnalyticsData', {
        dashboard: 'sales',
        ...filters
      });
      return response.data;
    }
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-12 text-center">
          <p className="text-gray-600">Loading analytics...</p>
        </CardContent>
      </Card>
    );
  }

  const funnelData = data?.funnelData || {};
  const lostReasons = data?.lostReasons || {};

  const funnelChartData = [
    { stage: 'Quotes Started', count: funnelData.quoteStarted || 0 },
    { stage: 'Quotes Completed', count: funnelData.quoteCompleted || 0 },
    { stage: 'Inspections Scheduled', count: funnelData.inspectionScheduled || 0 },
    { stage: 'Inspections Confirmed', count: funnelData.inspectionConfirmed || 0 },
    { stage: 'Converted', count: funnelData.converted || 0 }
  ];

  const lostReasonData = Object.entries(lostReasons).map(([reason, count]) => ({
    name: reason,
    value: count
  }));

  const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8'];

  const conversionRate = funnelData.quoteStarted > 0 
    ? ((funnelData.converted / funnelData.quoteStarted) * 100).toFixed(1)
    : 0;

  return (
    <div className="space-y-6">
      {/* Key Metrics */}
      <div className="grid md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-gray-600">Quotes Started</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{funnelData.quoteStarted || 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-gray-600">Converted</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-600">{funnelData.converted || 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-gray-600">Conversion Rate</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{conversionRate}%</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-gray-600">Lost Leads</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-red-600">{funnelData.lost || 0}</div>
          </CardContent>
        </Card>
      </div>

      {/* Funnel Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Sales Funnel</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={funnelChartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="stage" angle={-45} textAnchor="end" height={100} />
              <YAxis />
              <Tooltip />
              <Bar dataKey="count" fill="#1B9B9F" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Lost Reasons */}
      {lostReasonData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Lost Lead Reasons</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={lostReasonData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {lostReasonData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
    </div>
  );
}