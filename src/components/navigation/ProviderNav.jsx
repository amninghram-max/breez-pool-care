import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Home, Calendar, Users, MapPin, MessageSquare, Droplet, AlertCircle, Settings, BarChart3, Shield, Activity, ClipboardCheck } from 'lucide-react';

export default function ProviderNav({ userRole }) {
  const location = useLocation();
  const isAdmin = userRole === 'admin';
  const isStaff = userRole === 'staff' || isAdmin;
  const isTechnician = userRole === 'technician';

  const navItems = [];

  // Technician navigation
  if (isTechnician && !isStaff) {
    navItems.push(
      { name: 'Home', path: 'TechnicianHome', icon: Home, section: 'main' },
      { name: 'My Route', path: 'TechnicianRoute', icon: MapPin, section: 'main' },
      { name: 'Submit Inspection', path: 'InspectionSubmit', icon: ClipboardCheck, section: 'main' },
      { name: 'Messages', path: 'AdminMessaging', icon: MessageSquare, section: 'main' }
    );
  }

  // Staff navigation (dispatcher/ops)
  if (isStaff && !isAdmin) {
    navItems.push(
      { name: 'Dashboard', path: 'StaffHome', icon: Home, section: 'main' },
      { name: 'Calendar', path: 'Calendar', icon: Calendar, section: 'operations' },
      { name: 'Leads', path: 'LeadsPipeline', icon: Users, section: 'operations' },
      { name: 'Routes', path: 'TechnicianRoute', icon: MapPin, section: 'operations' },
      { name: 'Support Inbox', path: 'AdminMessaging', icon: MessageSquare, section: 'operations' },
      { name: 'Service Entry', path: 'ServiceVisitEntry', icon: Droplet, section: 'operations' },
      { name: 'Reinstatements', path: 'AdminReinstatements', icon: AlertCircle, section: 'operations' }
    );
  }

  // Admin navigation (full access)
  if (isAdmin) {
    navItems.push(
      { name: 'Admin Home', path: 'AdminHome', icon: Shield, section: 'admin' },
      { name: 'Dashboard', path: 'StaffHome', icon: Home, section: 'operations' },
      { name: 'Calendar', path: 'Calendar', icon: Calendar, section: 'operations' },
      { name: 'Leads', path: 'LeadsPipeline', icon: Users, section: 'operations' },
      { name: 'Routes', path: 'TechnicianRoute', icon: MapPin, section: 'operations' },
      { name: 'Support Inbox', path: 'AdminMessaging', icon: MessageSquare, section: 'operations' },
      { name: 'Service Entry', path: 'ServiceVisitEntry', icon: Droplet, section: 'operations' },
      { name: 'Reinstatements', path: 'AdminReinstatements', icon: AlertCircle, section: 'operations' },
      { name: 'Settings', path: 'Admin', icon: Settings, section: 'admin' },
      { name: 'Staff', path: 'StaffManagement', icon: Users, section: 'admin' },
      { name: 'Analytics', path: 'Analytics', icon: BarChart3, section: 'admin' },
      { name: 'Submit Inspection', path: 'InspectionSubmit', icon: ClipboardCheck, section: 'operations' },
      { name: 'Inspection Queue', path: 'InspectionFinalization', icon: ClipboardCheck, section: 'operations' },
      { name: 'Chemistry Review', path: 'AdminReviewDashboard', icon: AlertCircle, section: 'admin' },
      { name: 'Chemistry', path: 'ChemistryDashboard', icon: Droplet, section: 'admin' },
      { name: 'Margin Testing', path: 'MarginStressTest', icon: Activity, section: 'admin' },
      { name: 'Chemical Analytics', path: 'ChemicalAnalytics', icon: Droplet, section: 'admin' },
      { name: 'Release Readiness', path: 'ReleaseReadiness', icon: Shield, section: 'admin' },
      { name: 'Config Setup', path: 'AdminSettingsSetup', icon: Settings, section: 'admin' }
    );
  }

  const groupedItems = navItems.reduce((acc, item) => {
    if (!acc[item.section]) acc[item.section] = [];
    acc[item.section].push(item);
    return acc;
  }, {});

  const sectionLabels = {
    main: 'Main',
    operations: 'Operations',
    admin: 'Admin Controls'
  };

  return (
    <>
      {/* Desktop Sidebar */}
      <nav className="hidden sm:flex flex-col w-64 border-r border-gray-light bg-white shadow-sm">
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {Object.entries(groupedItems).map(([section, items]) => (
            <div key={section}>
              {sectionLabels[section] && (
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 px-4">
                  {sectionLabels[section]}
                </h3>
              )}
              <div className="space-y-1">
                {items.map((item) => {
                  const Icon = item.icon;
                  const isActive = location.pathname === `/${item.path}`;
                  return (
                    <Link
                      key={item.name}
                      to={createPageUrl(item.path)}
                      className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${
                        isActive
                          ? section === 'admin'
                            ? 'bg-orange-50 text-orange-700 border-l-4 border-orange-500'
                            : 'bg-teal-50 text-teal-700 border-l-4 border-teal-500'
                          : 'text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      <Icon className="w-5 h-5" />
                      <span className="font-medium text-sm">{item.name}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </nav>

      {/* Mobile Bottom Navigation */}
      <nav className="sm:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-light z-50">
        <div className="flex justify-around items-center h-16">
          {navItems.slice(0, 4).map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === `/${item.path}`;
            return (
              <Link
                key={item.name}
                to={createPageUrl(item.path)}
                className={`flex flex-col items-center gap-1 py-3 px-4 transition-colors ${
                  isActive ? 'text-teal-600' : 'text-gray-600'
                }`}
              >
                <Icon className="w-6 h-6" />
                <span className="text-xs font-medium">{item.name}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}