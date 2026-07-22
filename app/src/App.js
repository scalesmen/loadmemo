// src/App.js

import React, { useEffect, useState, useMemo } from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import { auth, db } from "./firebase";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, getDoc, collection, query, where, getDocs } from "firebase/firestore";
import OnlineBOLPage from './components/OnlineBOLPage';
import CustomerRegistration from './components/CustomerRegistration';
import AdminApprovalDashboard from './components/AdminApprovalDashboard';
import HomePage from './components/HomePage';
import PrivacyPolicyPage from './components/PrivacyPolicyPage';
import ContactPage from './components/ContactPage';
import FeaturesPage from './components/FeaturesPage';
import SolutionsPage from './components/SolutionsPage';
import OnboardingGuide from './components/OnboardingGuide'; 
import DriverBOLPage from './components/DriverBOLPage';
import DispatchersPage from './components/DispatchersPage';



// IMPORTANT: Import SubscriptionWrapper
import SubscriptionWrapper from './components/SubscriptionWrapper';

// Import the TimezoneProvider
import { TimezoneProvider } from './contexts/TimezoneContext';

// Owner-admin "view as tenant" support
import { AdminViewProvider, useAdminView, OWNER_ADMIN_EMAIL } from './contexts/AdminViewContext';
import ImpersonationBanner from './components/admin/ImpersonationBanner';

// Import your page components
import Settings from "./components/Settings";
import FinishSignUp from "./components/FinishSignUp";
import Login from "./Login";
import CurrentLoadsPage from './components/CurrentLoadsPage';
import TrucksPage from './components/TrucksPage';
import DriversPage from './components/DriversPage';
import AccountingPage from './components/AccountingPage';
import DashboardPage from './components/DashboardPage';
import Header from './components/Header';
import BrokersPage from './components/BrokersPage';
import DriverLoadViewPage from './components/DriverLoadViewPage';
import StatementsPage from './components/StatementsPage';
import SafetyPage from './components/SafetyPage';
import IntegrationsPage from './components/IntegrationsPage';

// ============================================
// LIVELOAD IMPORTS
// ============================================
import LiveLoadPage from './components/liveload/LiveLoadPage';
import DealerDashboard from './components/liveload/dealer/DealerDashboard';
import DealerRegistration from './components/DealerRegistration';

// ============================================
// CARRIER LAYOUT - For trucking companies
// ============================================
const CarrierLayout = ({ children, profile, globalCompanyFilter, handleGlobalCompanyChange, isSidebarOpen, toggleSidebar }) => {
  return (
    <div className="flex h-screen bg-gray-100 overflow-hidden">
      <OnboardingGuide />
      <aside
        id="app-sidebar"
        className={`w-48 bg-gray-800 text-white flex flex-col fixed inset-y-0 left-0 z-30 transform md:relative md:translate-x-0 transition-transform duration-300 ease-in-out ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} md:flex md:shadow-lg`}
      >
        <div className="h-16 flex items-center justify-center text-xl font-bold border-b border-gray-700 shrink-0">
          LoadMemo
        </div>
        <nav className="flex-1 overflow-y-auto custom-scrollbar">
          <ul className="py-4">
            <li><a href="/dashboard" onClick={() => toggleSidebar()} className="block p-3 hover:bg-gray-700 rounded-md mx-2 my-1 text-sm">Dashboard</a></li>
            <li><a href="/current-loads" onClick={() => toggleSidebar()} className="block p-3 hover:bg-gray-700 rounded-md mx-2 my-1 text-sm">Current Loads</a></li>
            <li>
              <a href="/liveload" onClick={() => toggleSidebar()} className="block p-3 hover:bg-gray-700 rounded-md mx-2 my-1 text-sm flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <span className="text-red-400">●</span>
                  LiveLoad
                </span>
                <span className="bg-red-500 text-white text-xs px-1.5 py-0.5 rounded-full animate-pulse">LIVE</span>
              </a>
            </li>
            <li><a href="/drivers" onClick={() => toggleSidebar()} className="block p-3 hover:bg-gray-700 rounded-md mx-2 my-1 text-sm">Drivers</a></li>
            <li><a href="/dispatchers" onClick={() => toggleSidebar()} className="block p-3 hover:bg-gray-700 rounded-md mx-2 my-1 text-sm">Dispatchers</a></li>  {/* ADD THIS LINE */}

            <li><a href="/trucks" onClick={() => toggleSidebar()} className="block p-3 hover:bg-gray-700 rounded-md mx-2 my-1 text-sm">Trucks</a></li>
            <li><a href="/brokers" onClick={() => toggleSidebar()} className="block p-3 hover:bg-gray-700 rounded-md mx-2 my-1 text-sm">Brokers</a></li>
            <li><a href="/accounting" onClick={() => toggleSidebar()} className="block p-3 hover:bg-gray-700 rounded-md mx-2 my-1 text-sm">Accounting</a></li>
            <li><a href="/statements" onClick={() => toggleSidebar()} className="block p-3 hover:bg-gray-700 rounded-md mx-2 my-1 text-sm">Statements</a></li>
            <li><a href="/safety" onClick={() => toggleSidebar()} className="block p-3 hover:bg-gray-700 rounded-md mx-2 my-1 text-sm">Safety</a></li>
            <li><a href="/integrations" onClick={() => toggleSidebar()} className="block p-3 hover:bg-gray-700 rounded-md mx-2 my-1 text-sm">Integrations</a></li>
            <li><a href="/settings" onClick={() => toggleSidebar()} className="block p-3 hover:bg-gray-700 rounded-md mx-2 my-1 text-sm">Settings</a></li>
          </ul>
        </nav>
        {profile && (
          <div className="p-4 border-t border-gray-700">
            <div className="text-xs mb-2 text-gray-400">
              Logged in as: <span className="font-semibold text-white">{profile.email}</span>
            </div>
            <button
              className="w-full bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded text-sm font-medium"
              onClick={async () => {
                try { await signOut(auth); } catch (error) { console.error("Logout error:", error) }
              }}
            >
              Logout
            </button>
          </div>
        )}
      </aside>
      <div className="flex-1 flex flex-col overflow-hidden">
        <ImpersonationBanner />
        <Header loggedInUser={profile} onCompanyFilterChange={handleGlobalCompanyChange} onToggleSidebar={toggleSidebar} />
        <main className="flex-1 p-1 sm:p-2 bg-gray-100 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
};

// ============================================
// DEALER LAYOUT - For car dealers
// ============================================
const DealerLayout = ({ children, profile, isSidebarOpen, toggleSidebar }) => {
  return (
    <div className="flex h-screen bg-gray-100 overflow-hidden">
      <aside
        className={`w-48 bg-orange-900 text-white flex flex-col fixed inset-y-0 left-0 z-30 transform md:relative md:translate-x-0 transition-transform duration-300 ease-in-out ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} md:flex md:shadow-lg`}
      >
        <div className="h-16 flex items-center justify-center text-xl font-bold border-b border-orange-800 shrink-0">
          <span className="text-orange-300">●</span>
          <span className="ml-2">LiveLoad</span>
        </div>
        <nav className="flex-1 overflow-y-auto custom-scrollbar">
          <ul className="py-4">
            <li><a href="/dealer" onClick={() => toggleSidebar()} className="block p-3 hover:bg-orange-800 rounded-md mx-2 my-1 text-sm flex items-center gap-2"><i className="fas fa-tachometer-alt w-5"></i>Dashboard</a></li>
            <li><a href="/dealer/post" onClick={() => toggleSidebar()} className="block p-3 hover:bg-orange-800 rounded-md mx-2 my-1 text-sm flex items-center gap-2"><i className="fas fa-plus-circle w-5"></i>Post Load</a></li>
            <li><a href="/dealer/active" onClick={() => toggleSidebar()} className="block p-3 hover:bg-orange-800 rounded-md mx-2 my-1 text-sm flex items-center gap-2"><i className="fas fa-clock w-5"></i>Active Loads</a></li>
            <li><a href="/dealer/history" onClick={() => toggleSidebar()} className="block p-3 hover:bg-orange-800 rounded-md mx-2 my-1 text-sm flex items-center gap-2"><i className="fas fa-history w-5"></i>History</a></li>
            <li><a href="/dealer/settings" onClick={() => toggleSidebar()} className="block p-3 hover:bg-orange-800 rounded-md mx-2 my-1 text-sm flex items-center gap-2"><i className="fas fa-cog w-5"></i>Settings</a></li>
          </ul>
        </nav>
        {profile && (
          <div className="p-4 border-t border-orange-800">
            <div className="text-xs mb-1 text-orange-300">Dealer Account</div>
            <div className="text-xs mb-2 text-orange-200 truncate">{profile.email}</div>
            <button
              className="w-full bg-orange-700 hover:bg-orange-600 text-white px-3 py-1.5 rounded text-sm font-medium"
              onClick={async () => {
                try { await signOut(auth); } catch (error) { console.error("Logout error:", error) }
              }}
            >
              Logout
            </button>
          </div>
        )}
      </aside>
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="h-16 bg-white shadow-sm flex items-center justify-between px-4 md:px-6">
          <button onClick={toggleSidebar} className="md:hidden p-2 rounded-md text-gray-600 hover:bg-gray-100"><i className="fas fa-bars"></i></button>
          <div className="flex items-center gap-2">
            <span className="text-gray-600 text-sm">Welcome,</span>
            <span className="font-semibold text-gray-800">{profile?.contactName || profile?.businessName || 'Dealer'}</span>
          </div>
          <div className="flex items-center gap-4">
            <button className="p-2 rounded-full hover:bg-gray-100 relative">
              <i className="fas fa-bell text-gray-600"></i>
              <span className="absolute top-0 right-0 w-2 h-2 bg-red-500 rounded-full"></span>
            </button>
          </div>
        </header>
        <main className="flex-1 p-4 bg-gray-100 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
};

// Helper functions
const isDealer = (profile) => profile?.role === 'dealer';
const getDefaultPath = (profile) => isDealer(profile) ? '/dealer' : '/dashboard';

function AppContent() {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [checking, setChecking] = useState(true);
  const [globalCompanyFilter, setGlobalCompanyFilter] = useState("all");
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [companies, setCompanies] = useState([]);

  const { impersonatedTenant, clearImpersonation } = useAdminView();

  const handleGlobalCompanyChange = (companyIdentifier) => setGlobalCompanyFilter(companyIdentifier);
  const toggleSidebar = () => setIsSidebarOpen(!isSidebarOpen);

  // Only the owner-admin can impersonate a tenant.
  const isOwnerAdmin = profile?.email === OWNER_ADMIN_EMAIL;

  // The profile the rest of the app actually runs on. For a regular user this IS
  // the real profile (zero change). For the owner-admin who has selected a tenant
  // to view, we swap in that tenant's id (and grant full in-tenant visibility) so
  // every page — which scopes its data by loggedInUser.tenantId — shows that
  // tenant's data automatically. Identity (email/uid) stays the owner's.
  const effectiveProfile = useMemo(() => {
    if (isOwnerAdmin && impersonatedTenant?.id) {
      return {
        ...profile,
        tenantId: impersonatedTenant.id,
        role: 'Super Admin',
        roles: ['Super Admin'],
        assignedParentCompanyIds: undefined,
        assignedCompanyId: undefined,
        _impersonating: true,
        _ownerEmail: profile.email,
        _impersonatedCompanyName: impersonatedTenant.companyName,
      };
    }
    return profile;
  }, [profile, isOwnerAdmin, impersonatedTenant]);

  // Safety: if the signed-in account is not the owner-admin, never leave a stale
  // impersonation selection active.
  useEffect(() => {
    if (profile && !isOwnerAdmin && impersonatedTenant) {
      clearImpersonation();
    }
  }, [profile, isOwnerAdmin, impersonatedTenant, clearImpersonation]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (usr) => {
      setUser(usr);
      // Don't set checking=true on auth changes - only initial load uses checking state
      if (usr) {
        const userRef = doc(db, "users", usr.uid);
        try {
          const docSnap = await getDoc(userRef);
          if (docSnap.exists()) {
            const userData = docSnap.data();
            if (userData.role === 'dealer' && userData.dealerId) {
              const dealerRef = doc(db, "dealers", userData.dealerId);
              const dealerSnap = await getDoc(dealerRef);
              if (dealerSnap.exists()) {
                setProfile({ uid: usr.uid, email: usr.email, ...userData, ...dealerSnap.data() });
              } else {
                setProfile({ uid: usr.uid, email: usr.email, ...userData });
              }
            } else {
              setProfile({ uid: usr.uid, email: usr.email, ...userData });
            }
          } else {
            setProfile({ uid: usr.uid, email: usr.email, role: null, active: false, status: 'pending_approval' });
          }
        } catch (error) {
          setProfile({ uid: usr.uid, email: usr.email, role: null, active: false, status: 'pending_approval' });
        }
      } else {
        setProfile(null);
      }
      setChecking(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const loadCompanies = async () => {
      if (!effectiveProfile?.tenantId) return;
      try {
        const q = query(collection(db, 'companies'), where('tenantId', '==', effectiveProfile.tenantId));
        const querySnapshot = await getDocs(q);
        setCompanies(querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      } catch (error) {
        console.error('Error loading companies:', error);
      }
    };
    loadCompanies();
  }, [effectiveProfile]);

  // REMOVED: The ugly alert for disabled accounts
  // Users with active:false will simply be redirected to login by protected routes

  if (checking) {
    return <div className="flex items-center justify-center min-h-screen bg-gray-100"><p className="text-lg text-gray-600">Loading Application...</p></div>;
  }

  return (
    <TimezoneProvider>
      <Router>
        <Routes>
          {/* PUBLIC ROUTES */}
          <Route path="/finishSignUp" element={<FinishSignUp />} />
          <Route path="/login" element={user && profile?.active ? <Navigate to={getDefaultPath(profile)} replace /> : <Login />} />
          <Route path="/driver-view/:driverId" element={<DriverLoadViewPage />} />
          <Route path="/online-bol/:loadId" element={<OnlineBOLPage />} />
          <Route path="/register" element={<CustomerRegistration />} />
          <Route path="/dealer-register" element={<DealerRegistration />} />
          <Route path="/privacy" element={<PrivacyPolicyPage />} />
          <Route path="/contact" element={<ContactPage />} />
          <Route path="/features" element={<FeaturesPage />} />
          <Route path="/solutions" element={<SolutionsPage />} />
          <Route path="/" element={user && profile?.active ? <Navigate to={getDefaultPath(profile)} replace /> : <HomePage />} />
          <Route path="/driver-bol/:loadId" element={<DriverBOLPage />} />


          {/* DEALER ROUTES */}
          <Route path="/dealer" element={
            user && profile?.active ? (isDealer(profile) ? <DealerLayout profile={effectiveProfile} isSidebarOpen={isSidebarOpen} toggleSidebar={toggleSidebar}><DealerDashboard loggedInUser={effectiveProfile} /></DealerLayout> : <Navigate to="/dashboard" replace />) : <Navigate to="/login" replace />
          } />
          <Route path="/dealer/post" element={
            user && profile?.active ? (isDealer(profile) ? <DealerLayout profile={effectiveProfile} isSidebarOpen={isSidebarOpen} toggleSidebar={toggleSidebar}><DealerDashboard loggedInUser={effectiveProfile} initialTab="post" /></DealerLayout> : <Navigate to="/dashboard" replace />) : <Navigate to="/login" replace />
          } />
          <Route path="/dealer/active" element={
            user && profile?.active ? (isDealer(profile) ? <DealerLayout profile={effectiveProfile} isSidebarOpen={isSidebarOpen} toggleSidebar={toggleSidebar}><DealerDashboard loggedInUser={effectiveProfile} initialTab="active" /></DealerLayout> : <Navigate to="/dashboard" replace />) : <Navigate to="/login" replace />
          } />
          <Route path="/dealer/history" element={
            user && profile?.active ? (isDealer(profile) ? <DealerLayout profile={effectiveProfile} isSidebarOpen={isSidebarOpen} toggleSidebar={toggleSidebar}><DealerDashboard loggedInUser={effectiveProfile} initialTab="history" /></DealerLayout> : <Navigate to="/dashboard" replace />) : <Navigate to="/login" replace />
          } />
          <Route path="/dealer/settings" element={
            user && profile?.active ? (isDealer(profile) ? <DealerLayout profile={effectiveProfile} isSidebarOpen={isSidebarOpen} toggleSidebar={toggleSidebar}><Settings userProfile={effectiveProfile} /></DealerLayout> : <Navigate to="/dashboard" replace />) : <Navigate to="/login" replace />
          } />

          {/* CARRIER ROUTES */}
          <Route path="/dashboard" element={
            user && profile?.active ? (isDealer(profile) ? <Navigate to="/dealer" replace /> : <SubscriptionWrapper><CarrierLayout profile={effectiveProfile} globalCompanyFilter={globalCompanyFilter} handleGlobalCompanyChange={handleGlobalCompanyChange} isSidebarOpen={isSidebarOpen} toggleSidebar={toggleSidebar}><DashboardPage companyFilter={globalCompanyFilter} loggedInUser={effectiveProfile} /></CarrierLayout></SubscriptionWrapper>) : <Navigate to="/login" replace />
          } />
          <Route path="/current-loads" element={
            user && profile?.active ? (isDealer(profile) ? <Navigate to="/dealer" replace /> : <SubscriptionWrapper><CarrierLayout profile={effectiveProfile} globalCompanyFilter={globalCompanyFilter} handleGlobalCompanyChange={handleGlobalCompanyChange} isSidebarOpen={isSidebarOpen} toggleSidebar={toggleSidebar}><CurrentLoadsPage companyFilter={globalCompanyFilter} loggedInUser={effectiveProfile} /></CarrierLayout></SubscriptionWrapper>) : <Navigate to="/login" replace />
          } />
          <Route path="/liveload" element={
            user && profile?.active ? (isDealer(profile) ? <Navigate to="/dealer" replace /> : <SubscriptionWrapper><CarrierLayout profile={effectiveProfile} globalCompanyFilter={globalCompanyFilter} handleGlobalCompanyChange={handleGlobalCompanyChange} isSidebarOpen={isSidebarOpen} toggleSidebar={toggleSidebar}><LiveLoadPage loggedInUser={effectiveProfile} /></CarrierLayout></SubscriptionWrapper>) : <Navigate to="/login" replace />
          } />
          <Route path="/drivers" element={
            user && profile?.active ? (isDealer(profile) ? <Navigate to="/dealer" replace /> : <SubscriptionWrapper><CarrierLayout profile={effectiveProfile} globalCompanyFilter={globalCompanyFilter} handleGlobalCompanyChange={handleGlobalCompanyChange} isSidebarOpen={isSidebarOpen} toggleSidebar={toggleSidebar}><DriversPage companyFilter={globalCompanyFilter} loggedInUser={effectiveProfile} /></CarrierLayout></SubscriptionWrapper>) : <Navigate to="/login" replace />
          } />
          <Route path="/dispatchers" element={
  user && profile?.active ? (isDealer(profile) ? <Navigate to="/dealer" replace /> : <SubscriptionWrapper><CarrierLayout profile={effectiveProfile} globalCompanyFilter={globalCompanyFilter} handleGlobalCompanyChange={handleGlobalCompanyChange} isSidebarOpen={isSidebarOpen} toggleSidebar={toggleSidebar}><DispatchersPage companyFilter={globalCompanyFilter} loggedInUser={effectiveProfile} /></CarrierLayout></SubscriptionWrapper>) : <Navigate to="/login" replace />
} />
          <Route path="/trucks" element={
            user && profile?.active ? (isDealer(profile) ? <Navigate to="/dealer" replace /> : <SubscriptionWrapper><CarrierLayout profile={effectiveProfile} globalCompanyFilter={globalCompanyFilter} handleGlobalCompanyChange={handleGlobalCompanyChange} isSidebarOpen={isSidebarOpen} toggleSidebar={toggleSidebar}><TrucksPage companyFilter={globalCompanyFilter} loggedInUser={effectiveProfile} /></CarrierLayout></SubscriptionWrapper>) : <Navigate to="/login" replace />
          } />
          <Route path="/brokers" element={
            user && profile?.active ? (isDealer(profile) ? <Navigate to="/dealer" replace /> : <SubscriptionWrapper><CarrierLayout profile={effectiveProfile} globalCompanyFilter={globalCompanyFilter} handleGlobalCompanyChange={handleGlobalCompanyChange} isSidebarOpen={isSidebarOpen} toggleSidebar={toggleSidebar}><BrokersPage companyFilter={globalCompanyFilter} loggedInUser={effectiveProfile} /></CarrierLayout></SubscriptionWrapper>) : <Navigate to="/login" replace />
          } />
          <Route path="/accounting" element={
            user && profile?.active ? (isDealer(profile) ? <Navigate to="/dealer" replace /> : <SubscriptionWrapper><CarrierLayout profile={effectiveProfile} globalCompanyFilter={globalCompanyFilter} handleGlobalCompanyChange={handleGlobalCompanyChange} isSidebarOpen={isSidebarOpen} toggleSidebar={toggleSidebar}><AccountingPage companyFilter={globalCompanyFilter} loggedInUser={effectiveProfile} /></CarrierLayout></SubscriptionWrapper>) : <Navigate to="/login" replace />
          } />
          <Route path="/statements" element={
            user && profile?.active ? (isDealer(profile) ? <Navigate to="/dealer" replace /> : <SubscriptionWrapper><CarrierLayout profile={effectiveProfile} globalCompanyFilter={globalCompanyFilter} handleGlobalCompanyChange={handleGlobalCompanyChange} isSidebarOpen={isSidebarOpen} toggleSidebar={toggleSidebar}><StatementsPage companyFilter={globalCompanyFilter} loggedInUser={effectiveProfile} /></CarrierLayout></SubscriptionWrapper>) : <Navigate to="/login" replace />
          } />
          <Route path="/safety" element={
            user && profile?.active ? (isDealer(profile) ? <Navigate to="/dealer" replace /> : <SubscriptionWrapper><CarrierLayout profile={effectiveProfile} globalCompanyFilter={globalCompanyFilter} handleGlobalCompanyChange={handleGlobalCompanyChange} isSidebarOpen={isSidebarOpen} toggleSidebar={toggleSidebar}><SafetyPage companyFilter={globalCompanyFilter} loggedInUser={effectiveProfile} /></CarrierLayout></SubscriptionWrapper>) : <Navigate to="/login" replace />
          } />
          <Route path="/integrations" element={
            user && profile?.active ? (isDealer(profile) ? <Navigate to="/dealer" replace /> : <SubscriptionWrapper><CarrierLayout profile={effectiveProfile} globalCompanyFilter={globalCompanyFilter} handleGlobalCompanyChange={handleGlobalCompanyChange} isSidebarOpen={isSidebarOpen} toggleSidebar={toggleSidebar}><IntegrationsPage companyFilter={globalCompanyFilter} loggedInUser={effectiveProfile} companies={companies} /></CarrierLayout></SubscriptionWrapper>) : <Navigate to="/login" replace />
          } />
          <Route path="/settings" element={
            user && profile?.active ? (isDealer(profile) ? <Navigate to="/dealer/settings" replace /> : <CarrierLayout profile={effectiveProfile} globalCompanyFilter={globalCompanyFilter} handleGlobalCompanyChange={handleGlobalCompanyChange} isSidebarOpen={isSidebarOpen} toggleSidebar={toggleSidebar}><Settings userProfile={effectiveProfile} /></CarrierLayout>) : <Navigate to="/login" replace />
          } />
          <Route path="/admin/tenants" element={
            user && profile?.active ? (isDealer(profile) ? <Navigate to="/dealer" replace /> : <SubscriptionWrapper><CarrierLayout profile={effectiveProfile} globalCompanyFilter={globalCompanyFilter} handleGlobalCompanyChange={handleGlobalCompanyChange} isSidebarOpen={isSidebarOpen} toggleSidebar={toggleSidebar}><AdminApprovalDashboard /></CarrierLayout></SubscriptionWrapper>) : <Navigate to="/login" replace />
          } />
          
          {/* Catch all */}
          <Route path="*" element={user && profile?.active ? <Navigate to={getDefaultPath(profile)} replace /> : <Navigate to="/" replace />} />
        </Routes>
      </Router>
    </TimezoneProvider>
  );
}

function App() {
  return (
    <AdminViewProvider>
      <AppContent />
    </AdminViewProvider>
  );
}

export default App;