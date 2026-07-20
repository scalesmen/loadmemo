// src/components/accounting/hooks/useAccountingData.js
// UPDATED WITH MULTI-ROLE SUPPORT + PHASE 2 COMPANY FILTERING

import { useState, useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, onSnapshot, collection, query, where, orderBy } from 'firebase/firestore';
import { auth, db } from '../../../firebase';
import { 
  CAN_AMEND_ACCOUNTING_ROLES, 
  CAN_HARD_DELETE_ROLES,
  ALLOWED_ACCOUNTING_ROLES 
} from '../constants/accountingConstants';

const normalizeUserRoles = (user) => {
  if (!user) return [];
  
  if (Array.isArray(user.role) && user.role.length > 0) {
    return user.role;
  }
  
  if (user.role && typeof user.role === 'string') {
    return [user.role];
  }
  
  return [];
};

const userHasAnyRole = (user, rolesToCheck) => {
  const roles = normalizeUserRoles(user);
  return rolesToCheck.some(role => roles.includes(role));
};

// ============================================================================
// HELPER: Check if user is Super Admin
// ============================================================================
const isSuperAdmin = (user) => {
  if (!user) return false;
  const roles = normalizeUserRoles(user);
  return roles.includes('Super Admin');
};

export function useAccountingData() {
  const [loggedInUser, setLoggedInUser] = useState(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [canAmendAccounting, setCanAmendAccounting] = useState(false);
  const [canHardDelete, setCanHardDelete] = useState(false);
  const [hasAccess, setHasAccess] = useState(false);
  
  const [drivers, setDrivers] = useState([]);
  const [trucks, setTrucks] = useState([]);
  const [brokers, setBrokers] = useState([]);
  const [dispatchers, setDispatchers] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [isLoadingDropdowns, setIsLoadingDropdowns] = useState(true);

  // Handle authentication and user profile
  useEffect(() => {
    setIsAuthLoading(true);
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        const userDocRef = doc(db, "users", user.uid);
        const unsubProfile = onSnapshot(userDocRef, (docSnap) => {
          if (docSnap.exists()) {
            const userData = { uid: user.uid, email: user.email, ...docSnap.data() };
            setLoggedInUser(userData);
            
            setCanAmendAccounting(userHasAnyRole(userData, CAN_AMEND_ACCOUNTING_ROLES));
            setCanHardDelete(userHasAnyRole(userData, CAN_HARD_DELETE_ROLES));
            setHasAccess(userHasAnyRole(userData, ALLOWED_ACCOUNTING_ROLES));
          } else {
            setLoggedInUser({ uid: user.uid, email: user.email, role: null, roles: [] });
            setCanAmendAccounting(false);
            setCanHardDelete(false);
            setHasAccess(false);
            console.warn("AccountingPage: User profile document does NOT exist for UID:", user.uid);
          }
          setIsAuthLoading(false);
        }, (profileError) => {
          console.error("AccountingPage: Error fetching user profile:", profileError);
          setLoggedInUser({ uid: user.uid, email: user.email, role: null, roles: [] });
          setCanAmendAccounting(false);
          setCanHardDelete(false);
          setHasAccess(false);
          setIsAuthLoading(false);
        });
        return () => unsubProfile();
      } else {
        setLoggedInUser(null);
        setCanAmendAccounting(false);
        setCanHardDelete(false);
        setHasAccess(false);
        setIsAuthLoading(false);
      }
    });
    return unsubscribe;
  }, []);

  // Fetch related data (drivers, trucks, brokers, dispatchers, companies)
  // PHASE 2: Apply parent company filtering for non-Super Admin users
  useEffect(() => {
    if (!loggedInUser || !loggedInUser.tenantId) {
      setDrivers([]);
      setTrucks([]);
      setBrokers([]);
      setDispatchers([]);
      setCompanies([]);
      setIsLoadingDropdowns(false);
      return;
    }

    console.log('📦 useAccountingData: Fetching data for tenant:', loggedInUser.tenantId);
    setIsLoadingDropdowns(true);

    // ============================================================================
    // COMPANY FILTERING SETUP
    // ============================================================================
    const userIsSuper = isSuperAdmin(loggedInUser);
    const userParentCompanyIds = loggedInUser.assignedParentCompanyIds || [];
    const hasCompanyFilter = !userIsSuper && userParentCompanyIds.length > 0;
const hasCompanyField = loggedInUser.assignedParentCompanyIds !== undefined;
    const hasNoCompanies = !userIsSuper && hasCompanyField && userParentCompanyIds.length === 0;
    if (hasNoCompanies) {
      console.warn("⚠️ Non-Super Admin user has no assigned parent companies. They will see no data.");
      setDrivers([]);
      setTrucks([]);
      setBrokers([]);
      setDispatchers([]);
      setCompanies([]);
      setIsLoadingDropdowns(false);
      return;
    }

    const unsubscribeFunctions = [];

    // ============================================================================
    // FETCH DRIVERS (filtered by parentCompanyId for non-Super Admin)
    // ============================================================================
    let driversQuery;
    if (hasCompanyFilter) {
      driversQuery = query(
        collection(db, "drivers"), 
        where("tenantId", "==", loggedInUser.tenantId),
        where("parentCompanyId", "in", userParentCompanyIds),
        orderBy("name", "asc")
      );
    } else {
      driversQuery = query(
        collection(db, "drivers"), 
        where("tenantId", "==", loggedInUser.tenantId), 
        orderBy("name", "asc")
      );
    }

    const unsubDrivers = onSnapshot(
      driversQuery, 
      (snap) => {
        setDrivers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        console.log(`✅ Drivers loaded: ${snap.docs.length}${hasCompanyFilter ? ' (company filtered)' : ''}`);
      },
      (err) => {
        console.error("Error fetching drivers:", err);
        // Fallback to client-side filter if index missing
        if (err.code === 'failed-precondition' && hasCompanyFilter) {
          console.warn("⚠️ Missing index, falling back to client-side filter for drivers");
          const fallbackQuery = query(
            collection(db, "drivers"),
            where("tenantId", "==", loggedInUser.tenantId),
            orderBy("name", "asc")
          );
          const unsub = onSnapshot(fallbackQuery, (snap) => {
            const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            setDrivers(all.filter(d => userParentCompanyIds.includes(d.parentCompanyId)));
          });
          unsubscribeFunctions.push(unsub);
        }
      }
    );
    unsubscribeFunctions.push(unsubDrivers);
    
    // ============================================================================
    // FETCH TRUCKS (filtered by parentCompanyId for non-Super Admin)
    // ============================================================================
    let trucksQuery;
    if (hasCompanyFilter) {
      trucksQuery = query(
        collection(db, "trucks"), 
        where("tenantId", "==", loggedInUser.tenantId),
        where("parentCompanyId", "in", userParentCompanyIds),
        orderBy("unitNumber", "asc")
      );
    } else {
      trucksQuery = query(
        collection(db, "trucks"), 
        where("tenantId", "==", loggedInUser.tenantId), 
        orderBy("unitNumber", "asc")
      );
    }

    const unsubTrucks = onSnapshot(
      trucksQuery, 
      (snap) => {
        setTrucks(snap.docs.map(t => ({ id: t.id, ...t.data() })));
        console.log(`✅ Trucks loaded: ${snap.docs.length}${hasCompanyFilter ? ' (company filtered)' : ''}`);
      },
      (err) => {
        console.error("Error fetching trucks:", err);
        if (err.code === 'failed-precondition' && hasCompanyFilter) {
          console.warn("⚠️ Missing index, falling back to client-side filter for trucks");
          const fallbackQuery = query(
            collection(db, "trucks"),
            where("tenantId", "==", loggedInUser.tenantId),
            orderBy("unitNumber", "asc")
          );
          const unsub = onSnapshot(fallbackQuery, (snap) => {
            const all = snap.docs.map(t => ({ id: t.id, ...t.data() }));
            setTrucks(all.filter(t => userParentCompanyIds.includes(t.parentCompanyId)));
          });
          unsubscribeFunctions.push(unsub);
        }
      }
    );
    unsubscribeFunctions.push(unsubTrucks);
    
    // ============================================================================
    // FETCH BROKERS (shared across companies — no company filter)
    // ============================================================================
    const unsubBrokers = onSnapshot(
      query(
        collection(db, "brokers"), 
        where("tenantId", "==", loggedInUser.tenantId), 
        orderBy("name", "asc")
      ), 
      (snap) => {
        setBrokers(snap.docs.map(b => ({ id: b.id, ...b.data() })));
        console.log('✅ Brokers loaded:', snap.docs.length);
      }
    );
    unsubscribeFunctions.push(unsubBrokers);
    
    // ============================================================================
    // FETCH DISPATCHERS (filtered by shared parent companies for non-Super Admin)
    // ============================================================================
    const unsubDispatchers = onSnapshot(
      query(
        collection(db, "users"), 
        where("tenantId", "==", loggedInUser.tenantId)
      ), 
      (snap) => {
        const allUsers = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        
        // Filter to only include users who have "Dispatcher" role
        let dispatcherUsers = allUsers.filter(user => {
          const userRoles = normalizeUserRoles(user);
          return userRoles.includes("Dispatcher");
        });

        // For non-Super Admin: only show dispatchers who share at least one parent company
        if (hasCompanyFilter) {
          dispatcherUsers = dispatcherUsers.filter(dispatcher => {
            const dispatcherCompanies = dispatcher.assignedParentCompanyIds || [];
            return dispatcherCompanies.some(id => userParentCompanyIds.includes(id));
          });
        }
        
        setDispatchers(dispatcherUsers);
        console.log(`✅ Dispatchers loaded: ${dispatcherUsers.length}${hasCompanyFilter ? ' (company filtered)' : ''}`);
      }
    );
    unsubscribeFunctions.push(unsubDispatchers);
    
    // ============================================================================
    // FETCH COMPANIES (show parent + subdivisions user has access to)
    // ============================================================================
    const unsubCompanies = onSnapshot(
      query(
        collection(db, "companies"), 
        where("tenantId", "==", loggedInUser.tenantId),
        orderBy("name", "asc")
      ), 
      (snap) => {
        let companiesList = snap.docs.map(c => ({ id: c.id, ...c.data() }));
        
        // For non-Super Admin: filter to show only companies under their assigned parent companies
        if (hasCompanyFilter) {
          companiesList = companiesList.filter(company => {
            // Show if it IS one of their parent companies
            if (userParentCompanyIds.includes(company.id)) return true;
            // Show if it's a subdivision OF one of their parent companies
            if (company.parentCompanyId && userParentCompanyIds.includes(company.parentCompanyId)) return true;
            return false;
          });
        }
        
        setCompanies(companiesList);
        console.log(`✅ Companies loaded: ${companiesList.length}${hasCompanyFilter ? ' (company filtered)' : ''}`);
      },
      (error) => {
        console.error('❌ Error loading companies:', error);
        setCompanies([]);
      }
    );
    unsubscribeFunctions.push(unsubCompanies);

    // Mark dropdowns as loaded after a short delay to ensure all listeners fired
    const loadingTimeout = setTimeout(() => {
      setIsLoadingDropdowns(false);
    }, 1500);
    
    return () => {
      clearTimeout(loadingTimeout);
      unsubscribeFunctions.forEach(unsub => unsub());
    };
  }, [loggedInUser]);

  return {
    loggedInUser,
    isAuthLoading,
    canAmendAccounting,
    canHardDelete,
    hasAccess,
    drivers,
    trucks,
    brokers,
    dispatchers,
    companies,
    isLoadingDropdowns
  };
}