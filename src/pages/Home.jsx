import React, { useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { createPageUrl } from '@/utils';
import { useNavigate } from 'react-router-dom';
import { getHomePageForRole } from '../components/auth/roleCapabilities';
import PublicHome from './PublicHome';

export default function Home() {
  const navigate = useNavigate();

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

  // If authenticated, redirect to role-specific home
  useEffect(() => {
    if (userLoading || !user) return;
    const homePage = getHomePageForRole(user.role || 'customer');
    navigate(createPageUrl(homePage), { replace: true });
  }, [user, userLoading, navigate]);

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