import React, { useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { createPageUrl } from '@/utils';
import { useNavigate, useLocation } from 'react-router-dom';
import { getHomePageForRole } from '../components/auth/roleCapabilities';
import PublicHome from './PublicHome';

export default function Home() {
  const navigate = useNavigate();
  const location = useLocation();

  const { data: user, isLoading: userLoading } = useQuery({
    queryKey: ['user'],
    queryFn: async () => {
      try {
        return await base44.auth.me();
      } catch {
        return null; // Not authenticated — render public landing below
      }
    },
  });

  // If authenticated, redirect to role-specific home (prevent loop)
  useEffect(() => {
    if (userLoading || !user) return;
    const homePage = getHomePageForRole(user.role || 'customer');
    const targetPath = createPageUrl(homePage);
    console.info('[HOME_REDIRECT_DEBUG]', {
      userLoading,
      user,
      email: user?.email,
      role: user?.role,
      homePage,
      targetPath,
      currentPathname: location.pathname,
    });
    // Prevent redirect loop: only navigate if not already at target
    if (location.pathname !== targetPath) {
      navigate(targetPath, { replace: true });
    }
  }, [user, userLoading, navigate, location.pathname]);

  // While checking auth, show nothing; once resolved render public landing if not authed
  if (userLoading) return null;
  if (!user) return <PublicHome />;

  // Authenticated — show spinner while redirecting to role home
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-8 h-8 border-4 border-teal-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}