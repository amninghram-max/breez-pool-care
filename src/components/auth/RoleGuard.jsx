import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { createPageUrl } from '@/utils';

import { ROLES, PAGE_ACCESS, getHomePageForRole, canAccessPage } from '../auth/roleCapabilities';

export default function RoleGuard({ pageName, children }) {
  const navigate = useNavigate();
  
  // Check if this is a public page by looking at PAGE_ACCESS
  const allowedRoles = PAGE_ACCESS[pageName];
  const isPublic = allowedRoles?.includes('public');
  
  // For public pages, skip auth.me() query entirely
  const { data: user, isLoading } = useQuery({
    queryKey: ['user'],
    queryFn: async () => {
      try {
        return await base44.auth.me();
      } catch (error) {
        return null;
      }
    },
    enabled: !isPublic, // Don't run auth.me() for public pages
  });

  useEffect(() => {
    if (!isLoading && user) {
      const userRole = user.role || ROLES.CUSTOMER;
      
      // Check if user can access this page (strict separation)
      if (!canAccessPage(userRole, pageName)) {
        // Redirect to appropriate home
        const homePage = getHomePageForRole(userRole);
        navigate(createPageUrl(homePage));
      }
    }
  }, [user, isLoading, pageName, navigate]);

  // Show nothing while checking
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-gray-600">Loading...</div>
      </div>
    );
  }

  // If user doesn't have access, show nothing (redirect will happen)
  if (user && !canAccessPage(user.role || ROLES.CUSTOMER, pageName)) {
    return null;
  }

  return children;
}