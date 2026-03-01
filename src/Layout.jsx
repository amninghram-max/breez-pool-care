import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { LogOut, AlertCircle } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import CustomerNav from '../components/navigation/CustomerNav';
import ProviderNav from '../components/navigation/ProviderNav';

// ErrorBoundary for catching page render errors
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    if (typeof window !== 'undefined') {
      console.error('[Layout ErrorBoundary]', error, errorInfo);
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <Card className="border-red-200 bg-red-50 max-w-2xl mx-auto mt-8">
          <CardHeader>
            <CardTitle className="text-red-900">Page Error</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div className="bg-white p-4 rounded border border-red-200">
              <p className="font-semibold text-gray-800 mb-2">Error Details</p>
              <p className="text-red-700 whitespace-pre-wrap font-mono">
                {this.state.error?.message}
              </p>
              {this.state.error?.stack && (
                <p className="text-gray-600 text-xs mt-3 whitespace-pre-wrap max-h-48 overflow-auto">
                  {this.state.error.stack}
                </p>
              )}
            </div>
            <div className="flex gap-3">
              <Button
                onClick={() => window.location.href = createPageUrl('AdminHome')}
                className="bg-blue-600 hover:bg-blue-700"
              >
                Go Home
              </Button>
              <Button
                onClick={() => window.location.reload()}
                variant="outline"
              >
                Reload Page
              </Button>
            </div>
          </CardContent>
        </Card>
      );
    }

    return this.props.children;
  }
}

export default function Layout({ children, currentPageName }) {
  const location = useLocation();
  const [layoutTimedOut, setLayoutTimedOut] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      console.info('[Layout] mount at', location.pathname);
    }
  }, [location.pathname]);

  const { data: user, isLoading: userIsLoading } = useQuery({
    queryKey: ['user'],
    queryFn: async () => {
      try {
        if (typeof window !== 'undefined') {
          console.info('[Layout] auth query started');
        }
        const result = await base44.auth.me();
        if (typeof window !== 'undefined') {
          console.info('[Layout] auth resolved, user:', result?.email);
        }
        return result;
      } catch (error) {
        if (typeof window !== 'undefined') {
          console.info('[Layout] auth error', error?.message);
        }
        return null;
      }
    },
  });

  // Route loading watchdog: if still loading after 8 seconds, show diagnostic
  useEffect(() => {
    const timer = setTimeout(() => {
      if (userIsLoading) {
        if (typeof window !== 'undefined') {
          console.info('[Layout] 8-second timeout - still loading');
        }
        setLayoutTimedOut(true);
      }
    }, 8000);
    return () => clearTimeout(timer);
  }, [userIsLoading]);

  const userRole = user?.role || '';
  const isProvider = ['admin', 'staff', 'technician'].includes(userRole);
  const isLinkedCustomer = !!user?.linkedLeadId && !isProvider;

  const handleLogout = async () => {
    await base44.auth.logout(createPageUrl('PublicHome'));
  };

  // Layout timeout diagnostic
  if (layoutTimedOut) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <Card className="border-red-200 bg-red-50 max-w-2xl mx-auto">
          <CardHeader>
            <CardTitle className="text-red-900">Layout Loading Diagnostics</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div className="bg-white p-4 rounded border border-red-200">
              <p className="font-semibold text-gray-800 mb-2">Route Info</p>
              <div className="text-gray-700 space-y-1 ml-4">
                <p>Current path: {location.pathname}</p>
                <p>Current page: {currentPageName || 'Unknown'}</p>
              </div>
            </div>

            <div className="bg-white p-4 rounded border border-red-200">
              <p className="font-semibold text-gray-800 mb-2">Auth State</p>
              <div className="text-gray-700 space-y-1 ml-4">
                <p>Auth loading: {userIsLoading}</p>
                <p>User present: {user ? 'Yes' : 'No'}</p>
                <p>User email: {user?.email || 'N/A'}</p>
                <p>User role: {user?.role || 'N/A'}</p>
                <p>User linkedLeadId: {user?.linkedLeadId || 'N/A'}</p>
              </div>
            </div>

            <div className="bg-white p-4 rounded border border-red-200">
              <p className="font-semibold text-gray-800 mb-2">Possible Causes</p>
              <ul className="text-gray-700 space-y-1 ml-4 list-disc">
                <li>Auth query stuck or network timeout</li>
                <li>Page component failing to render</li>
                <li>Browser console may have additional errors</li>
              </ul>
            </div>

            <div className="flex gap-3">
              <Button
                onClick={() => window.location.reload()}
                className="bg-blue-600 hover:bg-blue-700"
              >
                Reload Page
              </Button>
              <Button
                onClick={() => window.location.href = createPageUrl('AdminHome')}
                variant="outline"
              >
                Go Home
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Minimal layout for Activate page - no header/sidebar chrome
  if (currentPageName === 'Activate') {
    return (
      <div className="min-h-screen bg-gray-50">
        <ErrorBoundary>
          {children}
        </ErrorBoundary>
      </div>
    );
  }

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
        {isProvider ? (
          <ProviderNav userRole={userRole} />
        ) : isLinkedCustomer ? (
          <CustomerNav />
        ) : null}

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