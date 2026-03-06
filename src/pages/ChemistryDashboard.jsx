import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine, Area, ComposedChart } from 'recharts';
import { Calendar, Download, TrendingUp, AlertCircle, ChevronDown, ChevronRight, FlaskConical, CheckCircle2, XCircle } from 'lucide-react';
import { format } from 'date-fns';

export default function ChemistryDashboard() {
  const [propertyId, setPropertyId] = useState('');
  const [timeRange, setTimeRange] = useState(30);

  const { data: properties = [] } = useQuery({
    queryKey: ['properties'],
    queryFn: () => base44.entities.Property.list()
  });

  const { data: visits = [] } = useQuery({
    queryKey: ['serviceVisits', propertyId],
    queryFn: async () => {
      if (!propertyId) return [];
      const result = await base44.entities.ServiceVisit.filter({ propertyId }, '-visitDate');
      return result;
    },
    enabled: !!propertyId
  });

  const { data: targets } = useQuery({
    queryKey: ['chemistryTargets'],
    queryFn: async () => {
      const result = await base44.entities.ChemistryTargets.filter({ settingKey: 'default' });
      return result[0] || {};
    }
  });

  const { data: insights = [] } = useQuery({
    queryKey: ['trendInsights', propertyId],
    queryFn: async () => {
      if (!propertyId) return [];
      const response = await base44.functions.invoke('calculateTrendInsights', { propertyId });
      return response.data.insights || [];
    },
    enabled: !!propertyId
  });

  const filterByTimeRange = (visits) => {
    if (!timeRange) return visits;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - timeRange);
    return visits.filter(v => new Date(v.visitDate) >= cutoff);
  };

  const filteredVisits = filterByTimeRange(visits);

  const prepareChartData = (metric) => {
    return filteredVisits.map(v => ({
      date: format(new Date(v.visitDate), 'MM/dd'),
      value: v[metric],
      fullDate: v.visitDate,
      visitId: v.id
    })).reverse();
  };

  const exportCSV = async () => {
    const response = await base44.functions.invoke('exportChemistryCSV', { propertyId });
    const blob = new Blob([response.data.csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `chemistry-${propertyId}-${Date.now()}.csv`;
    a.click();
  };

  if (!propertyId) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <h1 className="text-3xl font-bold mb-6">Water Chemistry Dashboard</h1>
        <Card>
          <CardHeader>
            <CardTitle>Select Property</CardTitle>
          </CardHeader>
          <CardContent>
            <select
              value={propertyId}
              onChange={(e) => setPropertyId(e.target.value)}
              className="w-full p-3 border rounded-lg"
            >
              <option value="">Choose a property</option>
              {properties.map(p => (
                <option key={p.id} value={p.id}>{p.address}</option>
              ))}
            </select>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Water Chemistry Dashboard</h1>
          <p className="text-gray-600 mt-1">
            {properties.find(p => p.id === propertyId)?.address}
          </p>
        </div>
        <div className="flex gap-3">
          <select
            value={propertyId}
            onChange={(e) => setPropertyId(e.target.value)}
            className="p-2 border rounded-lg"
          >
            {properties.map(p => (
              <option key={p.id} value={p.id}>{p.address}</option>
            ))}
          </select>
          <Button variant="outline" onClick={exportCSV}>
            <Download className="w-4 h-4 mr-2" />
            Export CSV
          </Button>
        </div>
      </div>

      {/* Time Range Selector */}
      <div className="flex gap-2">
        {[7, 30, 90, 365].map(days => (
          <Button
            key={days}
            variant={timeRange === days ? 'default' : 'outline'}
            size="sm"
            onClick={() => setTimeRange(days)}
          >
            {days === 365 ? '1 Year' : `${days} Days`}
          </Button>
        ))}
        <Button
          variant={timeRange === null ? 'default' : 'outline'}
          size="sm"
          onClick={() => setTimeRange(null)}
        >
          All Time
        </Button>
      </div>

      {/* Trend Insights */}
      {insights.length > 0 && (
        <Card className="bg-amber-50 border-amber-200">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-amber-900">
              <TrendingUp className="w-5 h-5" />
              Trend Insights
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {insights.map((insight, i) => (
              <div key={i} className="flex items-start gap-3 p-3 bg-white rounded-lg">
                <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-gray-900">{insight.title}</p>
                  <p className="text-sm text-gray-600">{insight.description}</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Free Chlorine Chart */}
      <ChartCard
        title="Free Chlorine (FC)"
        subtitle="Sanitizer level"
        data={prepareChartData('freeChlorine')}
        dataKey="value"
        color="#16a34a"
        targetMin={targets?.freeChlorine?.min}
        targetMax={targets?.freeChlorine?.max}
        unit="ppm"
      />

      {/* pH Chart */}
      <ChartCard
        title="pH Level"
        subtitle="Acidity/alkalinity balance"
        data={prepareChartData('pH')}
        dataKey="value"
        color="#2563eb"
        targetMin={targets?.pH?.min}
        targetMax={targets?.pH?.max}
        unit="pH"
      />

      {/* Total Alkalinity Chart */}
      <ChartCard
        title="Total Alkalinity (TA)"
        subtitle="pH buffer capacity"
        data={prepareChartData('totalAlkalinity')}
        dataKey="value"
        color="#9333ea"
        targetMin={targets?.totalAlkalinity?.min}
        targetMax={targets?.totalAlkalinity?.max}
        unit="ppm"
      />

      {/* CYA Chart (if enabled) */}
      {targets?.optionalMetrics?.cyanuricAcid && (
        <ChartCard
          title="Cyanuric Acid (CYA)"
          subtitle="Stabilizer / UV protection"
          data={prepareChartData('cyanuricAcid')}
          dataKey="value"
          color="#ea580c"
          targetMin={targets?.cyanuricAcid?.min}
          targetMax={targets?.cyanuricAcid?.max}
          unit="ppm"
        />
      )}

      {/* Visit History */}
      <Card>
        <CardHeader>
          <CardTitle>Visit History</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {filteredVisits.map(visit => (
              <div key={visit.id} className="border rounded-lg p-4 hover:bg-gray-50">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-gray-600" />
                    <span className="font-medium">
                      {format(new Date(visit.visitDate), 'MMM dd, yyyy')}
                    </span>
                  </div>
                  <span className="text-sm text-gray-600">{visit.technicianName}</span>
                </div>
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <p className="text-gray-600">FC</p>
                    <p className="font-medium">{visit.freeChlorine} ppm</p>
                  </div>
                  <div>
                    <p className="text-gray-600">pH</p>
                    <p className="font-medium">{visit.pH}</p>
                  </div>
                  <div>
                    <p className="text-gray-600">TA</p>
                    <p className="font-medium">{visit.totalAlkalinity} ppm</p>
                  </div>
                </div>
                {visit.notes && (
                  <p className="text-sm text-gray-600 mt-3 p-3 bg-gray-50 rounded">
                    {visit.notes}
                  </p>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function ChartCard({ title, subtitle, data, dataKey, color, targetMin, targetMax, unit }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <p className="text-sm text-gray-600">{subtitle}</p>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <ComposedChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" />
            <YAxis />
            <Tooltip
              content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  return (
                    <div className="bg-white p-3 border rounded-lg shadow-lg">
                      <p className="text-sm font-medium">{payload[0].payload.date}</p>
                      <p className="text-sm text-gray-600">
                        {payload[0].value} {unit}
                      </p>
                    </div>
                  );
                }
                return null;
              }}
            />
            {targetMin !== undefined && targetMax !== undefined && (
              <>
                <ReferenceLine y={targetMin} stroke="#94a3b8" strokeDasharray="3 3" />
                <ReferenceLine y={targetMax} stroke="#94a3b8" strokeDasharray="3 3" />
                <Area
                  type="monotone"
                  dataKey={() => targetMax}
                  fill="#10b98120"
                  stroke="none"
                />
              </>
            )}
            <Line
              type="monotone"
              dataKey={dataKey}
              stroke={color}
              strokeWidth={2}
              dot={{ fill: color, r: 4 }}
              activeDot={{ r: 6 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}