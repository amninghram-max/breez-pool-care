// Backend role guard utility for API-level security
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

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

// Check if user has required role or higher
export function hasRole(userRole, requiredRole) {
  return ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[requiredRole];
}

// Authenticate and check role - returns user or throws error
export async function requireRole(req, requiredRole) {
  const base44 = createClientFromRequest(req);
  
  try {
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json(
        { error: 'Unauthorized: Authentication required' },
        { status: 401 }
      );
    }

    const userRole = user.role || ROLES.CUSTOMER;

    if (!hasRole(userRole, requiredRole)) {
      return Response.json(
        { error: `Forbidden: ${requiredRole} role required` },
        { status: 403 }
      );
    }

    return { user, userRole };
  } catch (error) {
    return Response.json(
      { error: 'Authentication failed' },
      { status: 401 }
    );
  }
}

// Filter sensitive fields from data based on user role
export function filterSensitiveFields(data, userRole) {
  if (!data) return data;
  
  // Fields that should never be exposed to customers
  const customerExcludedFields = [
    'gateCode',
    'accessNotes',
    'estimatedMonthlyChemicalCOGS',
    'chemDemandIndex',
    'marginAdjustmentApplied',
    'marginAdjustmentReason',
    'estimatedGrossMarginPercent',
    'cogsBreakdown',
    'quoteBreakdown',
    'riskScore',
    'technicianNotes',
    'internalNotes',
    'stripePaymentIntentId',
    'paymentDeclineCode'
  ];

  // Fields only visible to admin
  const adminOnlyFields = [
    'marginAdjustmentApplied',
    'estimatedGrossMarginPercent',
    'cogsBreakdown'
  ];

  const filtered = Array.isArray(data) 
    ? data.map(item => ({ ...item }))
    : { ...data };

  const filterItem = (item) => {
    // Remove customer-excluded fields
    if (userRole === ROLES.CUSTOMER) {
      customerExcludedFields.forEach(field => {
        if (field in item) delete item[field];
      });
    }

    // Remove admin-only fields for non-admins
    if (userRole !== ROLES.ADMIN) {
      adminOnlyFields.forEach(field => {
        if (field in item) delete item[field];
      });
    }

    return item;
  };

  if (Array.isArray(filtered)) {
    return filtered.map(filterItem);
  }

  return filterItem(filtered);
}

// Example usage in a backend function:
/*
Deno.serve(async (req) => {
  // Require staff role or higher
  const authResult = await requireRole(req, ROLES.STAFF);
  if (authResult instanceof Response) return authResult; // Error response
  
  const { user, userRole } = authResult;

  // Your function logic here
  const data = await fetchSomeData();
  
  // Filter sensitive fields before returning
  const filtered = filterSensitiveFields(data, userRole);
  
  return Response.json(filtered);
});
*/