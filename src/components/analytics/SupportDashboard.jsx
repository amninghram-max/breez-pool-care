import React from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export default function SupportDashboard({ filters }) {
  const { data, isLoading } = useQuery({
    queryKey: ['supportAnalytics', filters],
    queryFn: async () => {
      const response = await base44.functions.invoke('getAnalyticsData', {
        dashboard: 'support',
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

  const supportStats = data || {};

  const aiResolutionRate = supportStats.aiChats > 0
    ? ((supportStats.aiResolved / supportStats.aiChats) * 100).toFixed(1)
    : 0;

  const escalationRate = supportStats.aiChats > 0
    ? ((supportStats.escalated / supportStats.aiChats) * 100).toFixed(1)
    : 0;

  const supportData = [
    { category: 'FAQ Views', count: supportStats.faqViews || 0 },
    { category: 'AI Chats', count: supportStats.aiChats || 0 },
    { category: 'AI Resolved', count: supportStats.aiResolved || 0 },
    { category: 'Escalated', count: supportStats.escalated || 0 },
    { category: 'Human Responses', count: supportStats.humanResponses || 0 }
  ];

  return (
    <div className="space-y-6">
      {/* Key Metrics */}
      <div className="grid md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-gray-600">FAQ Views</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{supportStats.faqViews || 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-gray-600">AI Resolution Rate</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-600">{aiResolutionRate}%</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-gray-600">Escalation Rate</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-orange-600">{escalationRate}%</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-gray-600">Avg Response Time</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{supportStats.avgResponseTime?.toFixed(1) || 0}h</div>
          </CardContent>
        </Card>
      </div>

      {/* Support Activity */}
      <Card>
        <CardHeader>
          <CardTitle>Support Activity</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={supportData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="category" angle={-45} textAnchor="end" height={100} />
              <YAxis />
              <Tooltip />
              <Bar dataKey="count" fill="#1B9B9F" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}