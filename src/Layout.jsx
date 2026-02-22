import React from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { LogOut } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import CustomerNav from '../components/navigation/CustomerNav';
import ProviderNav from '../components/navigation/ProviderNav';

export default function Layout({ children, currentPageName }) {
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
  const isCustomer = userRole === 'customer';

  const handleLogout = async () => {
    await base44.auth.logout('/');
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

      {/* Main layout with role-specific navigation */}
      <div className="flex">
        {/* Render appropriate navigation based on role */}
        {isCustomer ? (
          <CustomerNav />
        ) : (
          <ProviderNav userRole={userRole} />
        )}

        {/* Main content */}
        <main className="flex-1 overflow-auto">
          <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
            {children}
          </div>
        </main>
      </div>

      {/* Mobile safe area padding */}
      <div className="sm:hidden h-20" />
    </div>
  );
}