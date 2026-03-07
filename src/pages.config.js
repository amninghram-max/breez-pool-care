/**
 * pages.config.js - Page routing configuration
 * 
 * This file is AUTO-GENERATED. Do not add imports or modify PAGES manually.
 * Pages are auto-registered when you create files in the ./pages/ folder.
 * 
 * THE ONLY EDITABLE VALUE: mainPage
 * This controls which page is the landing page (shown when users visit the app).
 * 
 * Example file structure:
 * 
 *   import HomePage from './pages/HomePage';
 *   import Dashboard from './pages/Dashboard';
 *   import Settings from './pages/Settings';
 *   
 *   export const PAGES = {
 *       "HomePage": HomePage,
 *       "Dashboard": Dashboard,
 *       "Settings": Settings,
 *   }
 *   
 *   export const pagesConfig = {
 *       mainPage: "HomePage",
 *       Pages: PAGES,
 *   };
 * 
 * Example with Layout (wraps all pages):
 *
 *   import Home from './pages/Home';
 *   import Settings from './pages/Settings';
 *   import __Layout from './Layout.jsx';
 *
 *   export const PAGES = {
 *       "Home": Home,
 *       "Settings": Settings,
 *   }
 *
 *   export const pagesConfig = {
 *       mainPage: "Home",
 *       Pages: PAGES,
 *       Layout: __Layout,
 *   };
 *
 * To change the main page from HomePage to Dashboard, use find_replace:
 *   Old: mainPage: "HomePage",
 *   New: mainPage: "Dashboard",
 *
 * The mainPage value must match a key in the PAGES object exactly.
 */
import AIChat from './pages/AIChat';
import AccessSetup from './pages/AccessSetup';
import Activate from './pages/Activate';
import AdminHome from './pages/AdminHome';
import AdminMessaging from './pages/AdminMessaging';
import AdminPricingConfig from './pages/AdminPricingConfig';
import AdminReinstatements from './pages/AdminReinstatements';
import AdminReviewDashboard from './pages/AdminReviewDashboard';
import AdminSettingsSetup from './pages/AdminSettingsSetup';
import Agreements from './pages/Agreements';
import Analytics from './pages/Analytics';
import Billing from './pages/Billing';
import Calendar from './pages/Calendar';
import ChemicalAnalytics from './pages/ChemicalAnalytics';
import ChemicalRegistry from './pages/ChemicalRegistry';
import ChemistryDashboard from './pages/ChemistryDashboard';
import ClientHome from './pages/ClientHome';
import CustomerEquipment from './pages/CustomerEquipment';
import CustomerMessagingPage from './pages/CustomerMessagingPage';
import CustomerServiceHistory from './pages/CustomerServiceHistory';
import CustomerTimeline from './pages/CustomerTimeline';
import DesignSystem from './pages/DesignSystem';
import EquipmentProfileAdmin from './pages/EquipmentProfileAdmin';
import EquipmentProfiles from './pages/EquipmentProfiles';
import FAQ from './pages/FAQ';
import HelpSupport from './pages/HelpSupport';
import Home from './pages/Home';
import InspectionFinalization from './pages/InspectionFinalization';
import InspectionSubmit from './pages/InspectionSubmit';
import LeadsPipeline from './pages/LeadsPipeline';
import MarginStressTest from './pages/MarginStressTest';
import MessageThread from './pages/MessageThread';
import Messages from './pages/Messages';
import Onboarding from './pages/Onboarding';
import PaymentSetup from './pages/PaymentSetup';
import PaymentSuccess from './pages/PaymentSuccess';
import PreQualification from './pages/PreQualification';
import PublicHome from './pages/PublicHome';
import QuoteView from './pages/QuoteView';
import ReleaseReadiness from './pages/ReleaseReadiness';
import RescheduleInspection from './pages/RescheduleInspection';
import ScheduleInspection from './pages/ScheduleInspection';
import ServiceReinstatement from './pages/ServiceReinstatement';
import ServiceVisitEntry from './pages/ServiceVisitEntry';
import ServiceVisitFlow from './pages/ServiceVisitFlow';
import StaffHome from './pages/StaffHome';
import StaffManagement from './pages/StaffManagement';
import TechnicianHome from './pages/TechnicianHome';
import TechnicianRoute from './pages/TechnicianRoute';
import TestDashboard from './pages/TestDashboard';
import architectureContext from './pages/_ARCHITECTURE_CONTEXT';
import SchedulingSettings from './pages/SchedulingSettings';
import __Layout from './Layout.jsx';


export const PAGES = {
    "AIChat": AIChat,
    "AccessSetup": AccessSetup,
    "Activate": Activate,
    "AdminHome": AdminHome,
    "AdminMessaging": AdminMessaging,
    "AdminPricingConfig": AdminPricingConfig,
    "AdminReinstatements": AdminReinstatements,
    "AdminReviewDashboard": AdminReviewDashboard,
    "AdminSettingsSetup": AdminSettingsSetup,
    "Agreements": Agreements,
    "Analytics": Analytics,
    "Billing": Billing,
    "Calendar": Calendar,
    "ChemicalAnalytics": ChemicalAnalytics,
    "ChemicalRegistry": ChemicalRegistry,
    "ChemistryDashboard": ChemistryDashboard,
    "ClientHome": ClientHome,
    "CustomerEquipment": CustomerEquipment,
    "CustomerMessagingPage": CustomerMessagingPage,
    "CustomerServiceHistory": CustomerServiceHistory,
    "CustomerTimeline": CustomerTimeline,
    "DesignSystem": DesignSystem,
    "EquipmentProfileAdmin": EquipmentProfileAdmin,
    "EquipmentProfiles": EquipmentProfiles,
    "FAQ": FAQ,
    "HelpSupport": HelpSupport,
    "Home": Home,
    "InspectionFinalization": InspectionFinalization,
    "InspectionSubmit": InspectionSubmit,
    "LeadsPipeline": LeadsPipeline,
    "MarginStressTest": MarginStressTest,
    "MessageThread": MessageThread,
    "Messages": Messages,
    "Onboarding": Onboarding,
    "PaymentSetup": PaymentSetup,
    "PaymentSuccess": PaymentSuccess,
    "PreQualification": PreQualification,
    "PublicHome": PublicHome,
    "QuoteView": QuoteView,
    "ReleaseReadiness": ReleaseReadiness,
    "RescheduleInspection": RescheduleInspection,
    "ScheduleInspection": ScheduleInspection,
    "ServiceReinstatement": ServiceReinstatement,
    "ServiceVisitEntry": ServiceVisitEntry,
    "ServiceVisitFlow": ServiceVisitFlow,
    "StaffHome": StaffHome,
    "StaffManagement": StaffManagement,
    "TechnicianHome": TechnicianHome,
    "TechnicianRoute": TechnicianRoute,
    "TestDashboard": TestDashboard,
    "_ARCHITECTURE_CONTEXT": architectureContext,
    "SchedulingSettings": SchedulingSettings,
}

export const pagesConfig = {
    mainPage: "AdminHome",
    Pages: PAGES,
    Layout: __Layout,
};