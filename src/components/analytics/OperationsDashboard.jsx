import React from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

export default function OperationsDashboard({ filters }) {
  const { data, isLoading } = useQuery({
    queryKey: ['operationsAnalytics', filters],
    queryFn: async () => {
      const response = await base44.functions.invoke('getAnalyticsData', {
        dashboard: 'operations',
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

  const jobsByDay = data?.jobsByDay || {};
  const rescheduleReasons = data?.rescheduleReasons || {};
  const accessIssues = data?.accessIssues || {};

  // Calculate average jobs per day
  const totalJobs = Object.values(jobsByDay).reduce((sum, dayData) => {
    return sum + Object.values(dayData).reduce((daySum, count) => daySum + count, 0);
  }, 0);
  const avgJobsPerDay = Object.keys(jobsByDay).length > 0 
    ? (totalJobs / Object.keys(jobsByDay).length).toFixed(1)
    : 0;

  const rescheduleData = Object.entries(rescheduleReasons)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([reason, count]) => ({
      reason: reason.replace(/_/g, ' '),
      count
    }));

  const accessIssueData = Object.entries(accessIssues).map(([reason, count]) => ({
    name: reason.replace(/_/g, ' '),
    value: count
  }));

  const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8'];

  return (
    <div className="space-y-6">
      {/* Key Metrics */}
      <div className="grid md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-gray-600">Total Jobs</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{totalJobs}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-gray-600">Avg Jobs/Day</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{avgJobsPerDay}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-gray-600">Access Issues</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-red-600">
              {Object.values(accessIssues).reduce((sum, val) => sum + val, 0)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Reschedule Reasons */}
      {rescheduleData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Reschedule Reasons</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={rescheduleData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" />
                <YAxis dataKey="reason" type="category" width={150} />
                <Tooltip />
                <Bar dataKey="count" fill="#1B9B9F" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Access Issues */}
      {accessIssueData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Access Issue Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={accessIssueData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {accessIssueData.map((entry, index) => (
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