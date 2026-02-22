import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { createPageUrl } from '@/utils';

// Role hierarchy
const ROLES = {
  CUSTOMER: 'customer',
  TECHNICIAN: 'technician',
  STAFF: 'staff',
  ADMIN: 'admin'
};

const ROLE_HIERARCHY = {
  [ROLES.CUSTOMER]: 0,
  [ROLES.TECHNICIAN]: 1,
  [ROLES.STAFF]: 2,
  [ROLES.ADMIN]: 3
};

// Page permissions
const PAGE_PERMISSIONS = {
  ClientHome: [ROLES.CUSTOMER],
  Messages: [ROLES.CUSTOMER, ROLES.TECHNICIAN, ROLES.STAFF, ROLES.ADMIN],
  Billing: [ROLES.CUSTOMER],
  ServiceReinstatement: [ROLES.CUSTOMER],
  HelpSupport: [ROLES.CUSTOMER, ROLES.TECHNICIAN, ROLES.STAFF, ROLES.ADMIN],
  FAQ: [ROLES.CUSTOMER, ROLES.TECHNICIAN, ROLES.STAFF, ROLES.ADMIN],
  AIChat: [ROLES.CUSTOMER],
  TechnicianHome: [ROLES.TECHNICIAN, ROLES.STAFF, ROLES.ADMIN],
  TechnicianRoute: [ROLES.TECHNICIAN, ROLES.STAFF, ROLES.ADMIN],
  ServiceVisitEntry: [ROLES.TECHNICIAN, ROLES.STAFF, ROLES.ADMIN],
  StaffHome: [ROLES.STAFF, ROLES.ADMIN],
  Calendar: [ROLES.STAFF, ROLES.ADMIN],
  LeadsPipeline: [ROLES.STAFF, ROLES.ADMIN],
  AdminMessaging: [ROLES.STAFF, ROLES.ADMIN],
  AdminReinstatements: [ROLES.STAFF, ROLES.ADMIN],
  AdminHome: [ROLES.ADMIN],
  Admin: [ROLES.ADMIN],
  StaffManagement: [ROLES.ADMIN],
  Analytics: [ROLES.ADMIN],
  ChemistryDashboard: [ROLES.ADMIN],
  PreQualification: [ROLES.CUSTOMER, ROLES.STAFF, ROLES.ADMIN],
  Onboarding: [ROLES.CUSTOMER, ROLES.STAFF, ROLES.ADMIN],
};

export function getHomePageForRole(role) {
  switch (role) {
    case ROLES.CUSTOMER:
      return 'ClientHome';
    case ROLES.TECHNICIAN:
      return 'TechnicianHome';
    case ROLES.STAFF:
      return 'StaffHome';
    case ROLES.ADMIN:
      return 'AdminHome';
    default:
      return 'ClientHome';
  }
}

export function canAccessPage(userRole, pageName) {
  const allowedRoles = PAGE_PERMISSIONS[pageName];
  if (!allowedRoles) {
    return ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[ROLES.STAFF];
  }
  return allowedRoles.includes(userRole);
}

export default function RoleGuard({ pageName, children }) {
  const navigate = useNavigate();
  
  const { data: user, isLoading } = useQuery({
    queryKey: ['user'],
    queryFn: async () => {
      try {
        return await base44.auth.me();
      } catch (error) {
        return null;
      }
    },
  });

  useEffect(() => {
    if (!isLoading && user) {
      const userRole = user.role || ROLES.CUSTOMER;
      
      // Check if user can access this page
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