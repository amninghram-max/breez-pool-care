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
import AdminReinstatements from './pages/AdminReinstatements';
import Billing from './pages/Billing';
import Calendar from './pages/Calendar';
import ChemistryDashboard from './pages/ChemistryDashboard';
import DesignSystem from './pages/DesignSystem';
import FAQ from './pages/FAQ';
import HelpSupport from './pages/HelpSupport';
import Home from './pages/Home';
import LeadsPipeline from './pages/LeadsPipeline';
import Messages from './pages/Messages';
import Onboarding from './pages/Onboarding';
import PreQualification from './pages/PreQualification';
import ServiceReinstatement from './pages/ServiceReinstatement';
import ServiceVisitEntry from './pages/ServiceVisitEntry';
import TechnicianRoute from './pages/TechnicianRoute';
import MessageThread from './pages/MessageThread';
import AdminMessaging from './pages/AdminMessaging';
import Analytics from './pages/Analytics';
import __Layout from './Layout.jsx';


export const PAGES = {
    "AIChat": AIChat,
    "Admin": Admin,
    "AdminReinstatements": AdminReinstatements,
    "Billing": Billing,
    "Calendar": Calendar,
    "ChemistryDashboard": ChemistryDashboard,
    "DesignSystem": DesignSystem,
    "FAQ": FAQ,
    "HelpSupport": HelpSupport,
    "Home": Home,
    "LeadsPipeline": LeadsPipeline,
    "Messages": Messages,
    "Onboarding": Onboarding,
    "PreQualification": PreQualification,
    "ServiceReinstatement": ServiceReinstatement,
    "ServiceVisitEntry": ServiceVisitEntry,
    "TechnicianRoute": TechnicianRoute,
    "MessageThread": MessageThread,
    "AdminMessaging": AdminMessaging,
    "Analytics": Analytics,
}

export const pagesConfig = {
    mainPage: "Home",
    Pages: PAGES,
    Layout: __Layout,
};