// User Capability Matrix - Defines strict separation between Customer and Provider experiences

export const ROLES = {
  CUSTOMER: 'customer',
  TECHNICIAN: 'technician',
  STAFF: 'staff',
  ADMIN: 'admin'
};

// Page access by role - enforces hard separation
export const PAGE_ACCESS = {
  // ============ PUBLIC PAGES (No auth required) ============
  PublicHome: ['public'], // Anyone can access
  PreQualification: ['public'], // Quote form accessible to all
  
  // ============ CUSTOMER APP (Customer Portal) ============
  ClientHome: [ROLES.CUSTOMER],
  Messages: [ROLES.CUSTOMER], // Customer's own message threads
  Billing: [ROLES.CUSTOMER], // Customer's own billing
  ServiceReinstatement: [ROLES.CUSTOMER],
  HelpSupport: [ROLES.CUSTOMER],
  FAQ: [ROLES.CUSTOMER],
  AIChat: [ROLES.CUSTOMER],
  PreQualification: [ROLES.CUSTOMER], // Customer-facing quote flow
  Onboarding: [ROLES.CUSTOMER], // Customer onboarding
  Agreements: [ROLES.CUSTOMER],
  AccessSetup: [ROLES.CUSTOMER],
  PaymentSetup: [ROLES.CUSTOMER],
  PaymentSuccess: [ROLES.CUSTOMER],
  MessageThread: [ROLES.CUSTOMER], // Customer view of their thread
  
  // ============ PROVIDER PORTAL (Operations) ============
  // Technician pages
  TechnicianHome: [ROLES.TECHNICIAN, ROLES.STAFF, ROLES.ADMIN],
  TechnicianRoute: [ROLES.TECHNICIAN, ROLES.STAFF, ROLES.ADMIN],
  ServiceVisitEntry: [ROLES.TECHNICIAN, ROLES.STAFF, ROLES.ADMIN],
  
  // Staff/Dispatcher pages
  StaffHome: [ROLES.STAFF, ROLES.ADMIN],
  Calendar: [ROLES.STAFF, ROLES.ADMIN],
  LeadsPipeline: [ROLES.STAFF, ROLES.ADMIN],
  AdminMessaging: [ROLES.TECHNICIAN, ROLES.STAFF, ROLES.ADMIN], // Provider inbox
  AdminReinstatements: [ROLES.STAFF, ROLES.ADMIN],
  
  // Admin-only pages
  AdminHome: [ROLES.ADMIN],
  Admin: [ROLES.ADMIN], // Quote logic + pricing settings
  AdminPricingConfig: [ROLES.ADMIN], // New pricing engine config
  StaffManagement: [ROLES.ADMIN],
  Analytics: [ROLES.ADMIN],
  ChemistryDashboard: [ROLES.ADMIN],
  DesignSystem: [ROLES.ADMIN],
};

// Data field access by role - field-level security
export const FIELD_ACCESS = {
  // Sensitive fields only visible to provider roles
  gateCode: [ROLES.TECHNICIAN, ROLES.STAFF, ROLES.ADMIN],
  accessNotes: [ROLES.TECHNICIAN, ROLES.STAFF, ROLES.ADMIN],
  
  // Quote pricing internals
  estimatedMonthlyChemicalCOGS: [ROLES.STAFF, ROLES.ADMIN],
  chemDemandIndex: [ROLES.STAFF, ROLES.ADMIN],
  marginAdjustmentApplied: [ROLES.ADMIN],
  estimatedGrossMarginPercent: [ROLES.ADMIN],
  cogsBreakdown: [ROLES.ADMIN],
  
  // System settings
  quoteLogicSettings: [ROLES.ADMIN],
  pricingModifiers: [ROLES.ADMIN],
  profitMarginSettings: [ROLES.ADMIN],
  
  // Payment processor details
  stripePaymentIntentId: [ROLES.STAFF, ROLES.ADMIN],
  paymentDeclineCode: [ROLES.STAFF, ROLES.ADMIN],
  
  // Analytics
  analyticsData: [ROLES.STAFF, ROLES.ADMIN],
  aggregatedMetrics: [ROLES.STAFF, ROLES.ADMIN],
};

// Action permissions by role
export const ACTION_PERMISSIONS = {
  // Customer actions
  'customer.viewOwnSchedule': [ROLES.CUSTOMER],
  'customer.viewOwnBilling': [ROLES.CUSTOMER],
  'customer.payInvoice': [ROLES.CUSTOMER],
  'customer.updatePaymentMethod': [ROLES.CUSTOMER],
  'customer.sendMessage': [ROLES.CUSTOMER],
  'customer.requestReinstatement': [ROLES.CUSTOMER],
  
  // Technician actions
  'technician.viewRoute': [ROLES.TECHNICIAN, ROLES.STAFF, ROLES.ADMIN],
  'technician.completeService': [ROLES.TECHNICIAN, ROLES.STAFF, ROLES.ADMIN],
  'technician.logChemistry': [ROLES.TECHNICIAN, ROLES.STAFF, ROLES.ADMIN],
  'technician.viewGateCode': [ROLES.TECHNICIAN, ROLES.STAFF, ROLES.ADMIN],
  'technician.respondToMessage': [ROLES.TECHNICIAN, ROLES.STAFF, ROLES.ADMIN],
  
  // Staff actions
  'staff.manageCalendar': [ROLES.STAFF, ROLES.ADMIN],
  'staff.optimizeRoutes': [ROLES.STAFF, ROLES.ADMIN],
  'staff.managePipeline': [ROLES.STAFF, ROLES.ADMIN],
  'staff.viewAllMessages': [ROLES.STAFF, ROLES.ADMIN],
  'staff.processReinstatement': [ROLES.STAFF, ROLES.ADMIN],
  'staff.bulkReschedule': [ROLES.STAFF, ROLES.ADMIN],
  'staff.viewBillingStatus': [ROLES.STAFF, ROLES.ADMIN],
  
  // Admin-only actions
  'admin.modifyQuoteLogic': [ROLES.ADMIN],
  'admin.modifyPricing': [ROLES.ADMIN],
  'admin.viewAnalytics': [ROLES.ADMIN],
  'admin.exportData': [ROLES.ADMIN],
  'admin.manageStaff': [ROLES.ADMIN],
  'admin.systemSettings': [ROLES.ADMIN],
};

// Helper functions
export function canAccessPage(userRole, pageName) {
  const allowedRoles = PAGE_ACCESS[pageName];
  
  // Public pages accessible by anyone
  if (allowedRoles && allowedRoles.includes('public')) {
    return true;
  }
  
  if (!allowedRoles) {
    // Default: deny customer, allow staff+
    return userRole !== ROLES.CUSTOMER;
  }
  return allowedRoles.includes(userRole);
}

export function canAccessField(userRole, fieldName) {
  const allowedRoles = FIELD_ACCESS[fieldName];
  if (!allowedRoles) return true; // Non-sensitive field
  return allowedRoles.includes(userRole);
}

export function canPerformAction(userRole, actionName) {
  const allowedRoles = ACTION_PERMISSIONS[actionName];
  if (!allowedRoles) return false;
  return allowedRoles.includes(userRole);
}

export function getHomePageForRole(role) {
  switch (role?.toLowerCase()) {
    case ROLES.CUSTOMER:
    case 'customer':
      return 'ClientHome';
    case ROLES.TECHNICIAN:
    case 'technician':
      return 'TechnicianHome';
    case ROLES.STAFF:
    case 'staff':
      return 'StaffHome';
    case ROLES.ADMIN:
    case 'admin':
      return 'AdminHome';
    default:
      return 'ClientHome';
  }
}

// Filter sensitive fields from entity data based on role
export function filterSensitiveFields(data, userRole) {
  if (!data) return data;
  
  const filtered = { ...data };
  
  // Remove sensitive fields the user cannot access
  Object.keys(FIELD_ACCESS).forEach(fieldName => {
    if (!canAccessField(userRole, fieldName) && fieldName in filtered) {
      delete filtered[fieldName];
    }
  });
  
  return filtered;
}