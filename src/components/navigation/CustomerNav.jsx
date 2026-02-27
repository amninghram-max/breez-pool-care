import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Home, MessageSquare, DollarSign, HelpCircle, Droplet, History } from 'lucide-react';

export default function CustomerNav() {
  const location = useLocation();

  const navItems = [
    { name: 'My Pool', path: 'CustomerDashboard', icon: Droplet },
    { name: 'History', path: 'CustomerServiceHistory', icon: History },
    { name: 'Messages', path: 'CustomerMessagingPage', icon: MessageSquare },
    { name: 'Billing', path: 'Billing', icon: DollarSign },
    { name: 'Help & Support', path: 'HelpSupport', icon: HelpCircle },
  ];

  return (
    <>
      {/* Desktop Sidebar */}
      <nav className="hidden sm:flex flex-col w-64 border-r border-gray-light bg-white shadow-sm">
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {navItems.map((item) => {
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

      {/* Mobile Bottom Navigation */}
      <nav className="sm:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-light z-50">
        <div className="flex justify-around items-center h-16">
          {navItems.map((item) => {
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