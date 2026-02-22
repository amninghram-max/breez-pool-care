import React from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';

export default function RevenueDashboard({ filters }) {
  const { data, isLoading } = useQuery({
    queryKey: ['revenueAnalytics', filters],
    queryFn: async () => {
      const response = await base44.functions.invoke('getAnalyticsData', {
        dashboard: 'revenue',
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

  const revenueByMonth = data?.revenueByMonth || {};
  const autopayStats = data?.autopayStats || {};
  const failureReasons = data?.failureReasons || {};

  const revenueChartData = Object.entries(revenueByMonth)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, amount]) => ({
      month: month.substring(5),
      revenue: amount
    }));

  const totalRevenue = Object.values(revenueByMonth).reduce((sum, val) => sum + val, 0);
  const autopayRate = autopayStats.enabled + autopayStats.disabled > 0
    ? ((autopayStats.enabled / (autopayStats.enabled + autopayStats.disabled)) * 100).toFixed(1)
    : 0;

  const failureData = Object.entries(failureReasons)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([reason, count]) => ({
      reason: reason.replace(/_/g, ' '),
      count
    }));

  return (
    <div className="space-y-6">
      {/* Key Metrics */}
      <div className="grid md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-gray-600">Total Revenue</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">${totalRevenue.toLocaleString()}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-gray-600">AutoPay Adoption</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-600">{autopayRate}%</div>
            <div className="text-sm text-gray-600 mt-1">
              {autopayStats.enabled} enabled / {autopayStats.disabled} disabled
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-gray-600">Payment Failures</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-red-600">
              {Object.values(failureReasons).reduce((sum, val) => sum + val, 0)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Revenue Trend */}
      <Card>
        <CardHeader>
          <CardTitle>Revenue by Month</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={revenueChartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis />
              <Tooltip formatter={(value) => `$${value.toLocaleString()}`} />
              <Line type="monotone" dataKey="revenue" stroke="#1B9B9F" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Payment Failure Reasons */}
      {failureData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Top Payment Failure Reasons</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={failureData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" />
                <YAxis dataKey="reason" type="category" width={150} />
                <Tooltip />
                <Bar dataKey="count" fill="#FF8042" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
    </div>
  );
}