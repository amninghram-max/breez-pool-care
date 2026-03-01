import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';

/**
 * Guard for customer-only pages.
 * Redirects:
 * - Unauthenticated users → PublicHome
 * - Unlinked customers → ClientHome
 * - Providers → their role-specific home
 * Allows render only if: authenticated + linkedLeadId + not a provider
 */
export function useCustomerPageGuard(user, isLoading) {
  const navigate = useNavigate();

  useEffect(() => {
    if (isLoading) return;

    // Unauthenticated → PublicHome
    if (!user) {
      navigate(createPageUrl('PublicHome'), { replace: true });
      return;
    }

    // Provider → role-specific home
    const isProvider = ['admin', 'staff', 'technician'].includes(user.role);
    if (isProvider) {
      const homePageMap = {
        admin: 'AdminHome',
        staff: 'StaffHome',
        technician: 'TechnicianHome'
      };
      const homePage = homePageMap[user.role] || 'Home';
      navigate(createPageUrl(homePage), { replace: true });
      return;
    }

    // Unlinked customer → ClientHome
    if (!user.linkedLeadId) {
      navigate(createPageUrl('ClientHome'), { replace: true });
    }
  }, [user, isLoading, navigate]);
}