import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import {
  Home, Calendar, Users, MapPin, MessageSquare, Droplet, AlertCircle,
  Settings, BarChart3, Shield, Activity, ClipboardCheck, ChevronDown, ChevronRight
} from 'lucide-react';

const SECTION_CONFIG = {
  command_center: { label: 'Command Center', color: 'teal' },
  operations:     { label: 'Operations',      color: 'teal' },
  customers:      { label: 'Customers',       color: 'teal' },
  system:         { label: 'System',          color: 'orange' },
  team_analytics: { label: 'Team & Analytics',color: 'orange' },
  main:           { label: 'Main',            color: 'teal' },
};

function NavSection({ sectionKey, items, location }) {
  const [open, setOpen] = useState(true);
  const cfg = SECTION_CONFIG[sectionKey] || { label: sectionKey, color: 'teal' };
  const isOrange = cfg.color === 'orange';

  return (
    <div>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-1.5 group"
      >
        <h3 className={`text-xs font-semibold uppercase tracking-wider ${isOrange ? 'text-orange-500' : 'text-gray-400'}`}>
          {cfg.label}
        </h3>
        {open
          ? <ChevronDown className="w-3 h-3 text-gray-400" />
          : <ChevronRight className="w-3 h-3 text-gray-400" />}
      </button>
      {open && (
        <div className="space-y-0.5 mt-1">
          {items.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === `/${item.path}`;
            return (
              <Link
                key={item.name}
                to={createPageUrl(item.path)}
                className={`flex items-center gap-3 px-4 py-2.5 rounded-lg transition-all ${
                  isActive
                    ? isOrange
                      ? 'bg-orange-50 text-orange-700 border-l-4 border-orange-500 font-semibold'
                      : 'bg-teal-50 text-teal-700 border-l-4 border-teal-500 font-semibold'
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                <Icon className="w-4 h-4 flex-shrink-0" />
                <span className="text-sm">{item.name}</span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function ProviderNav({ userRole }) {
  const location = useLocation();
  const isAdmin = userRole === 'admin';
  const isStaff = userRole === 'staff' || isAdmin;
  const isTechnician = userRole === 'technician';

  // ── Technician nav ──
  if (isTechnician && !isStaff) {
    const items = [
      { name: 'Home',               path: 'TechnicianHome',  icon: Home },
      { name: 'My Route',           path: 'TechnicianRoute', icon: MapPin },
      { name: 'Submit Inspection',  path: 'InspectionSubmit',icon: ClipboardCheck },
      { name: 'Messages',           path: 'AdminMessaging',  icon: MessageSquare },
    ];
    return (
      <>
        <nav className="hidden sm:flex flex-col w-60 border-r border-gray-200 bg-white shadow-sm">
          <div className="flex-1 overflow-y-auto p-3 space-y-4 pt-4">
            <NavSection sectionKey="main" items={items} location={location} />
          </div>
        </nav>
        <MobileNav items={items} location={location} />
      </>
    );
  }

  // ── Staff nav ──
  if (isStaff && !isAdmin) {
    const sections = [
      { key: 'command_center', items: [
        { name: 'Dashboard', path: 'StaffHome', icon: Home },
      ]},
      { key: 'operations', items: [
        { name: 'Calendar',          path: 'Calendar',             icon: Calendar },
        { name: 'Routes',            path: 'TechnicianRoute',      icon: MapPin },
        { name: 'Submit Inspection', path: 'InspectionSubmit',     icon: ClipboardCheck },
        { name: 'Service Entry',     path: 'ServiceVisitEntry',    icon: Droplet },
        { name: 'Reinstatements',    path: 'AdminReinstatements',  icon: AlertCircle },
      ]},
      { key: 'customers', items: [
        { name: 'Leads',             path: 'LeadsPipeline',        icon: Users },
      ]},
      { key: 'team_analytics', items: [
        { name: 'Support Inbox',     path: 'AdminMessaging',       icon: MessageSquare },
      ]},
    ];
    const allItems = sections.flatMap(s => s.items);
    return (
      <>
        <nav className="hidden sm:flex flex-col w-60 border-r border-gray-200 bg-white shadow-sm">
          <div className="flex-1 overflow-y-auto p-3 space-y-4 pt-4">
            {sections.map(s => <NavSection key={s.key} sectionKey={s.key} items={s.items} location={location} />)}
          </div>
        </nav>
        <MobileNav items={allItems} location={location} />
      </>
    );
  }

  // ── Admin nav ──
  const sections = [
    { key: 'command_center', items: [
      { name: 'Admin Home',  path: 'AdminHome', icon: Shield },
      { name: 'Staff Home',  path: 'StaffHome', icon: Home },
    ]},
    { key: 'operations', items: [
      { name: 'Calendar',              path: 'Calendar',             icon: Calendar },
      { name: 'Routes',                path: 'TechnicianRoute',      icon: MapPin },
      { name: 'Submit Inspection',     path: 'InspectionSubmit',     icon: ClipboardCheck },
      { name: 'Inspection Queue',      path: 'InspectionFinalization',icon: ClipboardCheck },
      { name: 'Service Entry',         path: 'ServiceVisitEntry',    icon: Droplet },
      { name: 'Reinstatements',        path: 'AdminReinstatements',  icon: AlertCircle },
    ]},
    { key: 'customers', items: [
      { name: 'Leads Pipeline',        path: 'LeadsPipeline',        icon: Users },
      { name: 'Equipment Profiles',    path: 'EquipmentProfile',     icon: Activity },
    ]},
    { key: 'system', items: [
      { name: 'Pricing & Settings',    path: 'Admin',                icon: Settings },
      { name: 'Config Setup',          path: 'AdminSettingsSetup',   icon: Settings },
      { name: 'Release Readiness',     path: 'ReleaseReadiness',     icon: Shield },
    ]},
    { key: 'team_analytics', items: [
      { name: 'Staff Management',      path: 'StaffManagement',      icon: Users },
      { name: 'Analytics',             path: 'Analytics',            icon: BarChart3 },
      { name: 'Chemistry Review',      path: 'AdminReviewDashboard', icon: AlertCircle },
      { name: 'Chemistry Dashboard',   path: 'ChemistryDashboard',   icon: Droplet },
      { name: 'Chemical Analytics',    path: 'ChemicalAnalytics',    icon: Droplet },
      { name: 'Margin Testing',        path: 'MarginStressTest',     icon: Activity },
      { name: 'Support Inbox',         path: 'AdminMessaging',       icon: MessageSquare },
    ]},
  ];

  const topMobileItems = [
    { name: 'Home',      path: 'AdminHome',    icon: Shield },
    { name: 'Calendar',  path: 'Calendar',     icon: Calendar },
    { name: 'Leads',     path: 'LeadsPipeline',icon: Users },
    { name: 'Inbox',     path: 'AdminMessaging',icon: MessageSquare },
  ];

  return (
    <>
      <nav className="hidden sm:flex flex-col w-60 border-r border-gray-200 bg-white shadow-sm">
        <div className="flex-1 overflow-y-auto p-3 space-y-4 pt-4">
          {sections.map(s => <NavSection key={s.key} sectionKey={s.key} items={s.items} location={location} />)}
        </div>
      </nav>
      <MobileNav items={topMobileItems} location={location} />
    </>
  );
}

function MobileNav({ items, location }) {
  const top4 = items.slice(0, 4);
  return (
    <nav className="sm:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-50">
      <div className="flex justify-around items-center h-16">
        {top4.map((item) => {
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
  );
}