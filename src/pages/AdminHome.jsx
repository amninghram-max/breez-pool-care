import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Settings, BarChart3, Users, Shield, FileText, Zap, Eye } from 'lucide-react';
import { createPageUrl } from '@/utils';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';

import DemoQuoteModal from '../components/quote/DemoQuoteModal';
import InPersonSalesModal from '../components/quote/InPersonSalesModal';
import TopActionsBar from '../components/admin/dashboard/TopActionsBar';
import NextUpCard from '../components/admin/dashboard/NextUpCard';
import TodayOverview from '../components/admin/dashboard/TodayOverview';
import TodaySchedulePanel from '../components/admin/dashboard/TodaySchedulePanel';
import LeadPipelinePanel from '../components/admin/dashboard/LeadPipelinePanel';
import InspectionQueuePanel from '../components/admin/dashboard/InspectionQueuePanel';
import SafetyPanel from '../components/admin/dashboard/SafetyPanel';
import PaymentStatusPanel from '../components/admin/dashboard/PaymentStatusPanel';
import SystemHealthPanel from '../components/admin/dashboard/SystemHealthPanel';
import TechnicianPermissionsPanel from '../components/admin/dashboard/TechnicianPermissionsPanel';
import EquipmentManualPanel from '../components/admin/dashboard/EquipmentManualPanel';
import RecurringMessagesAdminPanel from '../components/admin/dashboard/RecurringMessagesAdminPanel';
import QuoteRequestQueuePanel from '../components/admin/dashboard/QuoteRequestQueuePanel';
import TechnicianHome from './TechnicianHome';

export default function AdminHome() {
  const [showDemo, setShowDemo] = useState(false);
  const [showInPerson, setShowInPerson] = useState(false);
  const [viewAsTech, setViewAsTech] = useState(false);

  const { data: user } = useQuery({
    queryKey: ['user'],
    queryFn: () => base44.auth.me()
  });

  const { data: leads = [] } = useQuery({
    queryKey: ['leads'],
    queryFn: () => base44.entities.Lead.filter({ isDeleted: false }, '-created_date', 500)
  });

  const { data: events = [] } = useQuery({
    queryKey: ['allEvents'],
    queryFn: () => base44.entities.CalendarEvent.list('-scheduledDate', 200)
  });

  const today = format(new Date(), 'yyyy-MM-dd');
  const todayEvents = events.filter(e => e.scheduledDate === today);
  const inspectionsToday = todayEvents.filter(e => e.eventType === 'inspection').length;
  const openLeads = leads.filter(l =>
    !l.isDeleted && ['new_lead', 'contacted', 'inspection_scheduled', 'inspection_confirmed', 'quote_sent'].includes(l.stage)
  ).length;

  // "View as Technician" mode — renders TechnicianHome in a sandboxed view
  if (viewAsTech) {
    return (
      <div>
        <div className="sticky top-0 z-40 bg-amber-50 border-b border-amber-300 px-4 py-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Badge className="bg-amber-200 text-amber-900">Viewing as Technician</Badge>
            <span className="text-sm text-amber-800">This is how technicians see their dashboard.</span>
          </div>
          <Button size="sm" variant="outline" onClick={() => setViewAsTech(false)}>
            ← Back to Admin
          </Button>
        </div>
        <div className="p-4">
          <TechnicianHome />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Admin Dashboard</h1>
          <p className="text-sm text-gray-500 mt-0.5">{format(new Date(), 'EEEE, MMMM d, yyyy')}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setViewAsTech(true)}
            className="border-amber-300 text-amber-800 hover:bg-amber-50"
          >
            <Eye className="w-4 h-4 mr-1.5" />
            View as Technician
          </Button>
        </div>
      </div>

      {/* Top Actions Bar */}
      <TopActionsBar onOpenInPerson={() => setShowInPerson(true)} />

      {/* Next Up — priority blockers */}
      <NextUpCard />

      {/* 1. Today Overview Metrics */}
      <TodayOverview
        todayEvents={todayEvents}
        leads={leads}
        inspectionsToday={inspectionsToday}
      />

      {/* 2. Schedule + Lead Pipeline — side by side on large screens */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <TodaySchedulePanel events={events} />
        <LeadPipelinePanel leads={leads} />
      </div>

      {/* 3. Inspection Queue + Safety — side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <InspectionQueuePanel />
        <SafetyPanel />
      </div>

      {/* 4. Payment Status + System Health + Quote Requests */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <PaymentStatusPanel leads={leads} />
        <SystemHealthPanel />
        <QuoteRequestQueuePanel />
      </div>

      {/* 5. Admin Actions Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <TechnicianPermissionsPanel />
        <EquipmentManualPanel />
        <RecurringMessagesAdminPanel />
      </div>

      {/* 6. Quick nav to other admin tools */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {[
          { label: 'Pricing & Settings', path: 'AdminPricingConfig', icon: Settings, color: 'bg-orange-600 hover:bg-orange-700' },
          { label: 'Staff Management', path: 'StaffManagement', icon: Users, color: 'bg-blue-600 hover:bg-blue-700' },
          { label: 'Analytics', path: 'Analytics', icon: BarChart3, color: 'bg-purple-600 hover:bg-purple-700' },
          { label: 'Chemistry Review', path: 'AdminReviewDashboard', icon: Shield, color: 'bg-red-600 hover:bg-red-700' },
          { label: 'Reinstatements', path: 'AdminReinstatements', icon: Shield, color: 'bg-gray-600 hover:bg-gray-700' },
        ].map(({ label, path, icon: Icon, color }) => (
          <Link key={path} to={createPageUrl(path)}>
            <Button className={`w-full text-white text-xs h-auto py-3 flex-col gap-1.5 ${color}`}>
              <Icon className="w-5 h-5" />
              <span className="leading-tight text-center">{label}</span>
            </Button>
          </Link>
        ))}
      </div>

      {/* 7. Tools (Admin/Dev) Section */}
      {user?.role && ['admin', 'staff'].includes(user.role) && (
        <div className="space-y-3 pt-4 border-t border-gray-200">
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-1">Tools (Admin/Dev)</h3>
            <p className="text-xs text-gray-500 mb-3">Internal calculators and test utilities</p>
          </div>
          <Button
            onClick={() => setShowDemo(true)}
            size="sm"
            variant="outline"
            className="border-amber-400 text-amber-800 hover:bg-amber-50"
          >
            <Zap className="w-4 h-4 mr-1.5" />
            Demo Quote
          </Button>
        </div>
      )}

      {/* Modals */}
      {showDemo && (
        <DemoQuoteModal
          onClose={() => setShowDemo(false)}
        />
      )}
      <InPersonSalesModal open={showInPerson} onOpenChange={setShowInPerson} />
    </div>
  );
}