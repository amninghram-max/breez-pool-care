import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Home, BarChart3, MessageSquare, Settings, LogOut, Droplet, AlertCircle, Calendar as CalendarIcon, Navigation } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';

export default function Layout({ children, currentPageName }) {
  const location = useLocation();
  
  const { data: user } = useQuery({
    queryKey: ['user'],
    queryFn: async () => {
      try {
        return await base44.auth.me();
      } catch (error) {
        return null;
      }
    },
  });

  const userRole = user?.role || 'customer';
  const isAdmin = userRole === 'admin';
  const isStaff = userRole === 'staff' || isAdmin;
  const isTechnician = userRole === 'technician' || isStaff;
  const isCustomer = userRole === 'customer';

  // Role-based navigation
  const navigationItems = [];

  // Customer navigation
  if (isCustomer) {
    navigationItems.push(
      { name: 'Home', path: 'ClientHome', icon: Home },
      { name: 'Messages', path: 'Messages', icon: MessageSquare },
      { name: 'Billing', path: 'Billing', icon: BarChart3 },
      { name: 'Help & Support', path: 'HelpSupport', icon: MessageSquare }
    );
  }

  // Technician navigation
  if (isTechnician && !isCustomer) {
    navigationItems.push(
      { name: 'Home', path: 'TechnicianHome', icon: Home },
      { name: 'My Route', path: 'TechnicianRoute', icon: Navigation },
      { name: 'Service Entry', path: 'ServiceVisitEntry', icon: Droplet },
      { name: 'Messages', path: 'AdminMessaging', icon: MessageSquare }
    );
  }

  // Staff navigation (includes admin)
  if (isStaff && !isCustomer) {
    if (!isTechnician || isStaff) {
      navigationItems.push(
        { name: 'Dashboard', path: 'StaffHome', icon: Home },
        { name: 'Calendar', path: 'Calendar', icon: CalendarIcon },
        { name: 'Leads', path: 'LeadsPipeline', icon: BarChart3 },
        { name: 'Routes', path: 'TechnicianRoute', icon: Navigation },
        { name: 'Support Inbox', path: 'AdminMessaging', icon: MessageSquare },
        { name: 'Service Entry', path: 'ServiceVisitEntry', icon: Droplet },
        { name: 'Reinstatements', path: 'AdminReinstatements', icon: AlertCircle }
      );
    }
  }

  // Admin-only navigation
  if (isAdmin) {
    navigationItems.push(
      { name: 'Admin Home', path: 'AdminHome', icon: Settings },
      { name: 'Settings', path: 'Admin', icon: Settings },
      { name: 'Staff', path: 'StaffManagement', icon: Home },
      { name: 'Analytics', path: 'Analytics', icon: BarChart3 },
      { name: 'Chemistry', path: 'ChemistryDashboard', icon: Droplet }
    );
  }

  const handleLogout = () => {
    localStorage.clear();
    window.location.reload();
  };

  return (
    <div className="min-h-screen bg-white">
      <style>{`
        :root {
          --color-primary: #1B9B9F;
          --color-secondary: #5DADE2;
          --color-accent: #FF9999;
          --color-white: #FFFFFF;
          --color-off-white: #F9FAFB;
          --color-gray-light: #E5E7EB;
          --color-gray-medium: #D1D5DB;
          --color-gray-dark: #6B7280;
          --color-text: #1F2937;
          --shadow-sm: 0 1px 3px rgba(0,0,0,0.08);
          --shadow-md: 0 4px 12px rgba(0,0,0,0.08);
          --shadow-lg: 0 10px 25px rgba(0,0,0,0.1);
        }
        
        * {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', sans-serif;
        }
        
        button, a {
          transition: all 200ms ease;
        }
      `}</style>

      {/* Mobile-optimized header */}
      <header className="sticky top-0 z-50 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80 border-b border-gray-light">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <Link to={createPageUrl('Home')} className="flex items-center gap-2 group">
              <img 
                src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/699a2b2056054b0207cea969/0b0c31666_Breez2.png"
                alt="Breez Pool Care"
                className="h-12 w-auto group-hover:opacity-80 transition-opacity"
              />
            </Link>

            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-600 hidden sm:inline">{user?.full_name}</span>
              <button
                onClick={handleLogout}
                className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                title="Logout"
              >
                <LogOut className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main layout */}
      <div className="flex">
        {/* Sidebar navigation */}
        <nav className="hidden sm:flex flex-col w-64 border-r border-gray-light bg-white shadow-sm">
          <div className="flex-1 overflow-y-auto p-4 space-y-2">
            {navigationItems.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === `/${item.path}`;
              return (
                <Link
                  key={item.name}
                  to={createPageUrl(item.path)}
                  className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${
                    isActive
                      ? 'bg-teal-50 text-teal-700 border-l-4 border-teal-500'
                      : 'text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  <span className="font-medium text-sm">{item.name}</span>
                </Link>
              );
            })}
          </div>
        </nav>

        {/* Main content */}
        <main className="flex-1 overflow-auto">
          <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
            {children}
          </div>
        </main>
      </div>

      {/* Mobile bottom navigation */}
      <nav className="sm:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-light">
        <div className="flex justify-around items-center h-16">
          {navigationItems.slice(0, 3).map((item) => {
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

      {/* Mobile safe area padding */}
      <div className="sm:hidden h-20" />
    </div>
  );
}