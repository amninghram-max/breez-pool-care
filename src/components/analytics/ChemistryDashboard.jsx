import React from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export default function ChemistryDashboard({ filters }) {
  const { data, isLoading } = useQuery({
    queryKey: ['chemistryAnalytics', filters],
    queryFn: async () => {
      const response = await base44.functions.invoke('getAnalyticsData', {
        dashboard: 'chemistry',
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

  const outOfRangeByMetric = data?.outOfRangeByMetric || {};
  const greenPoolCount = data?.greenPoolCount || 0;
  const readingsLogged = data?.readingsLogged || 0;

  const outOfRangeData = Object.entries(outOfRangeByMetric)
    .sort(([, a], [, b]) => b - a)
    .map(([metric, count]) => ({
      metric,
      count
    }));

  const totalOutOfRange = Object.values(outOfRangeByMetric).reduce((sum, val) => sum + val, 0);
  const inRangeRate = readingsLogged > 0
    ? (((readingsLogged - totalOutOfRange) / readingsLogged) * 100).toFixed(1)
    : 0;

  return (
    <div className="space-y-6">
      {/* Key Metrics */}
      <div className="grid md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-gray-600">Readings Logged</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{readingsLogged}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-gray-600">In-Range Rate</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-600">{inRangeRate}%</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-gray-600">Green Pool Recoveries</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-orange-600">{greenPoolCount}</div>
          </CardContent>
        </Card>
      </div>

      {/* Out of Range by Metric */}
      {outOfRangeData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Out-of-Range Readings by Metric</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={outOfRangeData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="metric" />
                <YAxis />
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