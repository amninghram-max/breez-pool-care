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
import Admin from './pages/Admin';
import AdminHome from './pages/AdminHome';
import AdminMessaging from './pages/AdminMessaging';
import AdminReinstatements from './pages/AdminReinstatements';
import Analytics from './pages/Analytics';
import Billing from './pages/Billing';
import Calendar from './pages/Calendar';
import ChemistryDashboard from './pages/ChemistryDashboard';
import ClientHome from './pages/ClientHome';
import DesignSystem from './pages/DesignSystem';
import FAQ from './pages/FAQ';
import HelpSupport from './pages/HelpSupport';
import Home from './pages/Home';
import LeadsPipeline from './pages/LeadsPipeline';
import MessageThread from './pages/MessageThread';
import Messages from './pages/Messages';
import Onboarding from './pages/Onboarding';
import PreQualification from './pages/PreQualification';
import ServiceReinstatement from './pages/ServiceReinstatement';
import ServiceVisitEntry from './pages/ServiceVisitEntry';
import StaffHome from './pages/StaffHome';
import StaffManagement from './pages/StaffManagement';
import TechnicianHome from './pages/TechnicianHome';
import TechnicianRoute from './pages/TechnicianRoute';
import Agreements from './pages/Agreements';
import PaymentSetup from './pages/PaymentSetup';
import PaymentSuccess from './pages/PaymentSuccess';
import PublicHome from './pages/PublicHome';
import __Layout from './Layout.jsx';


export const PAGES = {
    "AIChat": AIChat,
    "Admin": Admin,
    "AdminHome": AdminHome,
    "AdminMessaging": AdminMessaging,
    "AdminReinstatements": AdminReinstatements,
    "Analytics": Analytics,
    "Billing": Billing,
    "Calendar": Calendar,
    "ChemistryDashboard": ChemistryDashboard,
    "ClientHome": ClientHome,
    "DesignSystem": DesignSystem,
    "FAQ": FAQ,
    "HelpSupport": HelpSupport,
    "Home": Home,
    "LeadsPipeline": LeadsPipeline,
    "MessageThread": MessageThread,
    "Messages": Messages,
    "Onboarding": Onboarding,
    "PreQualification": PreQualification,
    "ServiceReinstatement": ServiceReinstatement,
    "ServiceVisitEntry": ServiceVisitEntry,
    "StaffHome": StaffHome,
    "StaffManagement": StaffManagement,
    "TechnicianHome": TechnicianHome,
    "TechnicianRoute": TechnicianRoute,
    "Agreements": Agreements,
    "PaymentSetup": PaymentSetup,
    "PaymentSuccess": PaymentSuccess,
    "PublicHome": PublicHome,
}

export const pagesConfig = {
    mainPage: "Home",
    Pages: PAGES,
    Layout: __Layout,
};