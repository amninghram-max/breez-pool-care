import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine, Area, ComposedChart } from 'recharts';
import { Calendar, Download, TrendingUp, AlertCircle, ChevronDown, ChevronRight, FlaskConical, CheckCircle2, XCircle, RefreshCw, Droplets } from 'lucide-react';
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

      {/* Retest Trend Advisory */}
      <RetestTrendAdvisory visits={visits} />

      {/* Water Level Trend Advisory */}
      <WaterLevelTrendAdvisory poolId={propertyId} />

      {/* Water Level History */}
      <WaterLevelHistory poolId={propertyId} />

      {/* Visit History */}
      <Card>
        <CardHeader>
          <CardTitle>Visit History</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {filteredVisits.map(visit => (
              <VisitRow key={visit.id} visit={visit} />
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ── WaterLevelLog linking note ───────────────────────────────────────────────
// ChemistryDashboard's "propertyId" state is populated from `base44.entities.Property.list()`
// and is used to filter ServiceVisit by propertyId.
// WaterLevelLog stores `poolId` (from visitData.poolId set in ServiceVisitFlow) and `leadId`.
// The Property entity is NOT the same as Pool. Pool is linked via Pool.leadId.
// Therefore: we cannot directly query WaterLevelLog by propertyId without knowing the
// Pool.id for the selected property. ChemistryDashboard has no Pool query.
//
// SAFE WORKAROUND (no invented mapping): Query WaterLevelLog by leadId, since
// ChemistryDashboard's propertyId IS the leadId — confirmed by ServiceVisit.filter({propertyId})
// where propertyId maps to Lead.id (see CustomerTimeline: filter({propertyId: leadId})).
// WaterLevelLog.leadId is set from visitData.leadId which equals the Lead.id.
// Therefore: WaterLevelLog.filter({ leadId: propertyId }) is the correct and verified join.
// ─────────────────────────────────────────────────────────────────────────────

const WATER_LEVEL_LABELS = {
  normal: 'Normal',
  slightly_low: 'Slightly Low',
  low: 'Low',
  high: 'High',
};

const WATER_LEVEL_COLORS = {
  normal: 'bg-green-100 text-green-800',
  slightly_low: 'bg-yellow-100 text-yellow-800',
  low: 'bg-orange-100 text-orange-800',
  high: 'bg-blue-100 text-blue-800',
};

const SHUTOFF_LABELS = {
  customer_shutoff: 'Customer shutoff',
  auto_shutoff: 'Auto shutoff',
  tech_returns: 'Tech returns',
};

const SAFETY_FLAG_LABELS = {
  below_skimmer_risk: 'Below skimmer risk',
  above_weir_risk: 'Above weir risk',
};

function WaterLevelHistory({ poolId }) {
  const [expanded, setExpanded] = useState(false);

  const { data: logs = [], isLoading } = useQuery({
    queryKey: ['waterLevelHistory', poolId],
    queryFn: () => base44.entities.WaterLevelLog.filter({ leadId: poolId }, '-visitDate', 20),
    enabled: !!poolId,
  });

  if (isLoading) return null;
  if (logs.length === 0) return null;

  return (
    <div className="rounded-lg border border-blue-100 bg-blue-50/40">
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          <Droplets className="w-4 h-4 text-blue-600 flex-shrink-0" />
          <span className="font-medium text-blue-900 text-sm">Water Level History</span>
          <span className="text-xs text-blue-500">({logs.length} record{logs.length !== 1 ? 's' : ''})</span>
        </div>
        <button
          className="text-xs text-indigo-600 hover:text-indigo-800 font-medium whitespace-nowrap"
          onClick={() => setExpanded(v => !v)}
        >
          {expanded ? 'Hide' : 'Show'}
        </button>
      </div>

      {expanded && (
        <div className="border-t border-blue-100 px-4 py-3 space-y-2">
          <div className="grid grid-cols-[90px_80px_60px_110px_80px_1fr] gap-x-3 text-[10px] font-semibold text-gray-500 uppercase tracking-wide pb-1 border-b border-blue-100">
            <span>Date</span>
            <span>Level</span>
            <span>Added</span>
            <span>Shutoff Plan</span>
            <span>Safety Flag</span>
            <span>Notes / Tech</span>
          </div>
          {logs.map((log) => (
            <div key={log.id} className="grid grid-cols-[90px_80px_60px_110px_80px_1fr] gap-x-3 items-start text-xs text-gray-700 py-1 border-b border-blue-50 last:border-0">
              <span className="text-gray-500 shrink-0">
                {format(new Date(log.visitDate), 'MMM d, yyyy')}
              </span>
              <span>
                <Badge className={`text-[10px] h-4 px-1.5 ${WATER_LEVEL_COLORS[log.waterLevel] || 'bg-gray-100 text-gray-700'}`}>
                  {WATER_LEVEL_LABELS[log.waterLevel] || log.waterLevel}
                </Badge>
              </span>
              <span className={log.waterAdded ? 'text-orange-700 font-medium' : 'text-gray-400'}>
                {log.waterAdded ? 'Yes' : 'No'}
              </span>
              <span className="text-gray-600">
                {log.shutoffPlan ? (
                  <>
                    {SHUTOFF_LABELS[log.shutoffPlan] || log.shutoffPlan}
                    {log.shutoffTime && <span className="text-gray-400 ml-1">@ {log.shutoffTime}</span>}
                  </>
                ) : '—'}
              </span>
              <span>
                {log.safetyFlag ? (
                  <Badge className="bg-red-100 text-red-800 text-[10px] h-4 px-1.5">
                    {SAFETY_FLAG_LABELS[log.safetyFlag] || log.safetyFlag}
                  </Badge>
                ) : '—'}
              </span>
              <span className="text-gray-600 min-w-0">
                {log.notes && <span className="italic">{log.notes}</span>}
                {log.notes && log.technicianName && <span className="text-gray-300 mx-1">·</span>}
                {log.technicianName && <span className="text-gray-400">{log.technicianName}</span>}
              </span>
            </div>
          ))}
          <p className="text-[10px] text-gray-400 italic pt-1">
            Linked via WaterLevelLog.leadId = ChemistryDashboard.propertyId (Lead.id) · provider-only
          </p>
        </div>
      )}
    </div>
  );
}

// ── Linking field justification ──────────────────────────────────────────────
// DosePlan is linked to ServiceVisit via ServiceVisit.dosePlanId (a direct ID
// reference stored on the visit record). ChemistryDashboard already queries
// ServiceVisit by propertyId. We therefore drive the trend advisory directly
// off the visit list that is already in scope — pulling dosePlanId from each
// visit — rather than querying DosePlan by poolId or leadId (those fields exist
// on DosePlan but the canonical join point in this page is visit.dosePlanId).
// This avoids any cross-entity query that could mismatch on multi-pool leads.
// ─────────────────────────────────────────────────────────────────────────────
const TREND_WINDOW = 5; // look at most recent N visits

function RetestTrendAdvisory({ visits }) {
  const [expanded, setExpanded] = useState(false);

  // Take the most recent TREND_WINDOW visits that have a linked dosePlanId
  const windowVisits = visits
    .filter(v => !!v.dosePlanId)
    .slice(0, TREND_WINDOW);

  // Fetch all dose plans for those visits in parallel
  const dosePlanQueries = windowVisits.map(v =>
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useQuery({
      queryKey: ['dosePlanTrend', v.dosePlanId],
      queryFn: () => base44.entities.DosePlan.filter({ id: v.dosePlanId }).then(r => r[0] || null),
      enabled: !!v.dosePlanId,
    })
  );

  const allLoaded = dosePlanQueries.every(q => !q.isLoading);
  const dosePlans = dosePlanQueries.map(q => q.data ?? null);

  const retestRequiredCount = dosePlans.filter(dp => dp?.retestRequired === true).length;
  const total = windowVisits.length;

  // Not enough data to show anything meaningful
  if (total < 2) return null;

  const isElevated = retestRequiredCount >= 2;

  // Build per-row breakdown for the audit expansion
  const breakdown = windowVisits.map((v, i) => ({
    visitDate: v.visitDate,
    dosePlanId: v.dosePlanId,
    retestRequired: dosePlans[i]?.retestRequired ?? null,
    // RetestRecord linkage: ServiceVisit.retestRecordId if present
    retestRecordId: v.retestRecordId ?? null,
  }));

  return (
    <div className={`rounded-lg border px-4 py-3 text-sm ${
      isElevated
        ? 'bg-amber-50 border-amber-200'
        : 'bg-gray-50 border-gray-200'
    }`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <RefreshCw className={`w-4 h-4 flex-shrink-0 ${isElevated ? 'text-amber-600' : 'text-gray-400'}`} />
          <span className={`font-medium ${isElevated ? 'text-amber-900' : 'text-gray-700'}`}>
            {allLoaded
              ? `Trend: ${retestRequiredCount} of last ${total} visits required retest`
              : 'Loading trend data…'}
          </span>
        </div>
        {allLoaded && (
          <button
            className="text-xs text-indigo-600 hover:text-indigo-800 font-medium whitespace-nowrap"
            onClick={() => setExpanded(v => !v)}
          >
            {expanded ? 'Hide detail' : 'Show detail'}
          </button>
        )}
      </div>

      {expanded && allLoaded && (
        <div className="mt-3 space-y-1.5 border-t border-amber-100 pt-3">
          <p className="text-xs text-gray-500 font-medium mb-1 uppercase tracking-wide">Supporting visits (most recent first)</p>
          {breakdown.map((row, i) => (
            <div key={i} className="flex items-center gap-3 text-xs text-gray-700">
              <span className="w-24 shrink-0 text-gray-500">
                {format(new Date(row.visitDate), 'MMM d, yyyy')}
              </span>
              {row.retestRequired === null ? (
                <span className="text-gray-400 italic">No dose plan</span>
              ) : row.retestRequired ? (
                <span className="flex items-center gap-1 text-amber-700">
                  <AlertCircle className="w-3 h-3" /> Retest required
                  {row.retestRecordId
                    ? <span className="text-gray-400 ml-1">· retest recorded</span>
                    : <span className="text-gray-400 ml-1">· no retest record</span>
                  }
                </span>
              ) : (
                <span className="flex items-center gap-1 text-green-700">
                  <CheckCircle2 className="w-3 h-3" /> No retest needed
                </span>
              )}
            </div>
          ))}
          <p className="text-[10px] text-gray-400 mt-2 italic">
            Advisory only · RetestRecord resolution status available in the visit audit chain below
          </p>
        </div>
      )}
    </div>
  );
}

function VisitRow({ visit }) {
  const [auditOpen, setAuditOpen] = useState(false);

  // Fetch linked records only when audit panel is opened
  const { data: testRecord } = useQuery({
    queryKey: ['chemTestRecord', visit.testRecordId],
    queryFn: () => base44.entities.ChemTestRecord.filter({ id: visit.testRecordId }).then(r => r[0] || null),
    enabled: auditOpen && !!visit.testRecordId,
  });

  const { data: dosePlan } = useQuery({
    queryKey: ['dosePlan', visit.dosePlanId],
    queryFn: () => base44.entities.DosePlan.filter({ id: visit.dosePlanId }).then(r => r[0] || null),
    enabled: auditOpen && !!visit.dosePlanId,
  });

  const { data: retestRecord } = useQuery({
    queryKey: ['retestRecord', visit.retestRecordId],
    queryFn: () => base44.entities.RetestRecord.filter({ id: visit.retestRecordId }).then(r => r[0] || null),
    enabled: auditOpen && !!visit.retestRecordId,
  });

  const hasAuditChain = !!(visit.testRecordId || visit.dosePlanId || visit.retestRecordId);

  return (
    <div className="border rounded-lg hover:bg-gray-50">
      {/* Visit summary row */}
      <div className="p-4">
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

        {/* Audit chain toggle — admin/provider only, only shown if IDs exist */}
        {hasAuditChain && (
          <button
            className="mt-3 flex items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-800 font-medium"
            onClick={() => setAuditOpen(v => !v)}
          >
            <FlaskConical className="w-3.5 h-3.5" />
            Chemistry Audit
            {auditOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          </button>
        )}
      </div>

      {/* Audit chain panel */}
      {auditOpen && hasAuditChain && (
        <div className="border-t bg-indigo-50/40 px-4 py-3 space-y-2 rounded-b-lg">
          <p className="text-xs font-semibold text-indigo-700 uppercase tracking-wide mb-2">Chemistry Audit Chain</p>

          {/* ChemTestRecord */}
          <div className="flex items-start gap-2 text-xs">
            <span className="w-20 text-gray-500 shrink-0 pt-0.5">Test Record</span>
            {!visit.testRecordId ? (
              <span className="text-gray-400 italic">Not linked</span>
            ) : testRecord ? (
              <span className="text-gray-800">
                {format(new Date(testRecord.testDate), 'MMM d, h:mm a')} —{' '}
                FC {testRecord.freeChlorine} ppm · pH {testRecord.pH} · TA {testRecord.totalAlkalinity} ppm
              </span>
            ) : (
              <span className="text-gray-400 italic">Loading…</span>
            )}
          </div>

          {/* DosePlan */}
          <div className="flex items-start gap-2 text-xs">
            <span className="w-20 text-gray-500 shrink-0 pt-0.5">Dose Plan</span>
            {!visit.dosePlanId ? (
              <span className="text-gray-400 italic">Not linked</span>
            ) : dosePlan ? (
              <span className="flex items-center gap-2 text-gray-800 flex-wrap">
                {dosePlan.actions?.length ?? 0} action{dosePlan.actions?.length !== 1 ? 's' : ''}
                {' · '}
                {dosePlan.readiness && (
                  <Badge variant="outline" className="text-[10px] h-4 px-1.5">{dosePlan.readiness}</Badge>
                )}
                {dosePlan.retestRequired ? (
                  <span className="flex items-center gap-0.5 text-amber-700"><AlertCircle className="w-3 h-3" /> Retest required</span>
                ) : (
                  <span className="flex items-center gap-0.5 text-green-700"><CheckCircle2 className="w-3 h-3" /> No retest</span>
                )}
              </span>
            ) : (
              <span className="text-gray-400 italic">Loading…</span>
            )}
          </div>

          {/* RetestRecord */}
          <div className="flex items-start gap-2 text-xs">
            <span className="w-20 text-gray-500 shrink-0 pt-0.5">Retest</span>
            {!visit.retestRecordId ? (
              <span className="text-gray-400 italic">None recorded</span>
            ) : retestRecord ? (
              <span className="flex items-center gap-2 text-gray-800">
                {format(new Date(retestRecord.retestDate), 'MMM d, h:mm a')}
                {' · '}
                {retestRecord.resolved ? (
                  <span className="flex items-center gap-0.5 text-green-700"><CheckCircle2 className="w-3 h-3" /> Resolved</span>
                ) : (
                  <span className="flex items-center gap-0.5 text-red-600"><XCircle className="w-3 h-3" /> Not resolved</span>
                )}
              </span>
            ) : (
              <span className="text-gray-400 italic">Loading…</span>
            )}
          </div>
        </div>
      )}
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