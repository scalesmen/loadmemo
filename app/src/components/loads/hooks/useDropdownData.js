// src/components/loads/hooks/useDropdownData.js
import { useState, useEffect } from 'react';
import { db } from '../../../firebase';
import { collection, query, where, onSnapshot, orderBy, doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { COMMODITY_TYPES } from '../utils/constants';

// ============================================================================
// HELPER: Check if user is Super Admin
// ============================================================================
const isSuperAdmin = (user) => {
  if (!user) return false;
  const roles = Array.isArray(user.role) ? user.role : [user.role].filter(Boolean);
  return roles.includes('Super Admin');
};

/**
 * Custom hook to manage all dropdown data for loads
 * PHASE 2: Non-Super Admin users only see drivers/trucks/dispatchers 
 * assigned to their parent companies
 * @param {Object} loggedInUser - Current logged in user
 * @returns {Object} All dropdown data and loading states
 */
export const useDropdownData = (loggedInUser) => {
  const [drivers, setDrivers] = useState([]);
  const [trucks, setTrucks] = useState([]);
  const [dispatchers, setDispatchers] = useState([]);
  const [brokers, setBrokers] = useState([]);
  const [commodityTypes, setCommodityTypes] = useState([]);
  const [isLoadingDropdowns, setIsLoadingDropdowns] = useState(true);
  
  // Commodity type states
  const [isAutomobileHauling, setIsAutomobileHauling] = useState(false);
  const [isDryVan, setIsDryVan] = useState(false);
  const [isReefer, setIsReefer] = useState(false);
  const [isFlatbed, setIsFlatbed] = useState(false);
  const [isTanker, setIsTanker] = useState(false);

  // Helper function to determine tenant ID
  const determineTenantId = (user) => {
    if (!user) return null;
    
    if (user.tenantId) {
      return user.tenantId;
    } else if (user.assignedCompanyId) {
      return user.assignedCompanyId;
    } else if (user.assignedCompanyName) {
      return `tenant_${user.assignedCompanyName.toLowerCase().replace(/\s+/g, '_')}`;
    }
    return null;
  };

  // Helper function to create tenant settings from global template
  const createTenantSettingsFromGlobal = async (tenantId, companyName) => {
    try {
      console.log("Creating tenant settings for:", tenantId);
      
      // First try globalSettings/appConfig
      let globalData = null;
      const globalSettingsRef = doc(db, "globalSettings", "appConfig");
      const globalSettingsSnap = await getDoc(globalSettingsRef);
      
      if (globalSettingsSnap.exists()) {
        globalData = globalSettingsSnap.data();
      } else {
        // Fallback to appConfig/settings if globalSettings doesn't exist
        const appConfigRef = doc(db, "appConfig", "settings");
        const appConfigSnap = await getDoc(appConfigRef);
        if (appConfigSnap.exists()) {
          globalData = appConfigSnap.data();
        }
      }

      // Create tenant settings
      const tenantSettingsRef = doc(db, "tenantSettings", tenantId);
      const newSettings = {
        ...(globalData || {}),
        tenantId,
        companyName: companyName || loggedInUser?.companyName || tenantId,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        // Ensure commodity types exist
        commodityTypes: globalData?.commodityTypes || []
      };

      await setDoc(tenantSettingsRef, newSettings);
      console.log("Successfully created tenant settings");
      return newSettings;
    } catch (error) {
      console.error("Error creating tenant settings:", error);
      throw error;
    }
  };

  useEffect(() => {
    const currentTenantId = determineTenantId(loggedInUser);
    
    if (!loggedInUser || !loggedInUser.uid || !currentTenantId) {
      console.log("Dropdown Fetch Effect: No loggedInUser or tenantId, skipping dropdown data fetch.");
      setDrivers([]); 
      setTrucks([]); 
      setDispatchers([]); 
      setBrokers([]);
      setIsLoadingDropdowns(false);
      return;
    }

    console.log("Dropdown Fetch Effect: Fetching dropdown data for tenant:", currentTenantId);
    setIsLoadingDropdowns(true);

    // ============================================================================
    // COMPANY FILTERING SETUP
    // Super Admin sees everything. Other roles see only their assigned companies.
    // ============================================================================
    const userIsSuper = isSuperAdmin(loggedInUser);
    const userParentCompanyIds = loggedInUser.assignedParentCompanyIds || [];
    const hasCompanyFilter = !userIsSuper && userParentCompanyIds.length > 0;
    const hasNoCompanies = !userIsSuper && userParentCompanyIds.length === 0;

    if (hasNoCompanies) {
      console.warn("⚠️ Non-Super Admin user has no assigned parent companies. They will see no data.");
    }

    // Store all unsubscribe functions
    const unsubscribeFunctions = [];

    // ============================================================================
    // FETCH DRIVERS
    // For non-Super Admin: filter by parentCompanyId using Firestore 'in' query
    // ============================================================================
    let driversQuery;
    if (hasCompanyFilter) {
      // Firestore 'in' supports up to 30 values — more than enough for parent companies
      driversQuery = query(
        collection(db, "drivers"), 
        where("tenantId", "==", currentTenantId),
        where("parentCompanyId", "in", userParentCompanyIds),
        orderBy("name", "asc")
      );
    } else if (hasNoCompanies) {
      // No companies assigned — set empty and skip query
      setDrivers([]);
      driversQuery = null;
    } else {
      // Super Admin — fetch all
      driversQuery = query(
        collection(db, "drivers"), 
        where("tenantId", "==", currentTenantId),
        orderBy("name", "asc")
      );
    }

    if (driversQuery) {
      const unsubDrivers = onSnapshot(
        driversQuery, 
        (snap) => {
          setDrivers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
          console.log(`✅ Drivers loaded: ${snap.docs.length}${hasCompanyFilter ? ' (company filtered)' : ''}`);
        }, 
        (err) => {
          console.error("Error fetching drivers:", err);
          // If index doesn't exist yet, fall back to client-side filter
          if (err.code === 'failed-precondition') {
            console.warn("⚠️ Missing Firestore index for drivers parentCompanyId query. Falling back to client-side filter.");
            const fallbackQuery = query(
              collection(db, "drivers"),
              where("tenantId", "==", currentTenantId),
              orderBy("name", "asc")
            );
            const unsubFallback = onSnapshot(fallbackQuery, (snap) => {
              let driversList = snap.docs.map(d => ({ id: d.id, ...d.data() }));
              if (hasCompanyFilter) {
                driversList = driversList.filter(d => userParentCompanyIds.includes(d.parentCompanyId));
              }
              setDrivers(driversList);
              console.log(`✅ Drivers loaded (fallback): ${driversList.length}`);
            });
            unsubscribeFunctions.push(unsubFallback);
          }
        }
      );
      unsubscribeFunctions.push(unsubDrivers);
    }

    // ============================================================================
    // FETCH TRUCKS
    // Same pattern as drivers
    // ============================================================================
    let trucksQuery;
    if (hasCompanyFilter) {
      trucksQuery = query(
        collection(db, "trucks"), 
        where("tenantId", "==", currentTenantId),
        where("parentCompanyId", "in", userParentCompanyIds),
        orderBy("unitNumber", "asc")
      );
    } else if (hasNoCompanies) {
      setTrucks([]);
      trucksQuery = null;
    } else {
      trucksQuery = query(
        collection(db, "trucks"), 
        where("tenantId", "==", currentTenantId),
        orderBy("unitNumber", "asc")
      );
    }

    if (trucksQuery) {
      const unsubTrucks = onSnapshot(
        trucksQuery, 
        (snap) => {
          setTrucks(snap.docs.map(t => ({ id: t.id, ...t.data() })));
          console.log(`✅ Trucks loaded: ${snap.docs.length}${hasCompanyFilter ? ' (company filtered)' : ''}`);
        }, 
        (err) => {
          console.error("Error fetching trucks:", err);
          if (err.code === 'failed-precondition') {
            console.warn("⚠️ Missing Firestore index for trucks parentCompanyId query. Falling back to client-side filter.");
            const fallbackQuery = query(
              collection(db, "trucks"),
              where("tenantId", "==", currentTenantId),
              orderBy("unitNumber", "asc")
            );
            const unsubFallback = onSnapshot(fallbackQuery, (snap) => {
              let trucksList = snap.docs.map(t => ({ id: t.id, ...t.data() }));
              if (hasCompanyFilter) {
                trucksList = trucksList.filter(t => userParentCompanyIds.includes(t.parentCompanyId));
              }
              setTrucks(trucksList);
              console.log(`✅ Trucks loaded (fallback): ${trucksList.length}`);
            });
            unsubscribeFunctions.push(unsubFallback);
          }
        }
      );
      unsubscribeFunctions.push(unsubTrucks);
    }

    // ============================================================================
    // FETCH DISPATCHERS
    // For non-Super Admin: filter users who share at least one parent company
    // Firestore can't do array-contains-any + array field comparison, so we
    // fetch all tenant users and filter client-side
    // ============================================================================
    const unsubDispatchers = onSnapshot(
      query(
        collection(db, "users"), 
        where("tenantId", "==", currentTenantId)
      ), 
      (snap) => {
        const allUsers = snap.docs.map(d => ({ 
          id: d.id, 
          name: d.data().name || d.data().email, 
          email: d.data().email,
          role: d.data().role,
          assignedParentCompanyIds: d.data().assignedParentCompanyIds || []
        }));
        
        // Filter users who have "Dispatcher" role (handle both string and array)
        let dispatcherUsers = allUsers.filter(user => {
          if (Array.isArray(user.role)) {
            return user.role.includes("Dispatcher");
          }
          return user.role === "Dispatcher";
        });

        // For non-Super Admin: only show dispatchers who share at least one parent company
        if (hasCompanyFilter) {
          dispatcherUsers = dispatcherUsers.filter(dispatcher => {
            const dispatcherCompanies = dispatcher.assignedParentCompanyIds || [];
            // Show if there's any overlap between user's companies and dispatcher's companies
            return dispatcherCompanies.some(id => userParentCompanyIds.includes(id));
          });
        } else if (hasNoCompanies) {
          dispatcherUsers = [];
        }
        
        setDispatchers(dispatcherUsers);
        console.log(`✅ Dispatchers loaded: ${dispatcherUsers.length}${hasCompanyFilter ? ' (company filtered)' : ''}`);
      }, 
      (err) => console.error("Error fetching dispatchers:", err)
    );
    unsubscribeFunctions.push(unsubDispatchers);

    // ============================================================================
    // FETCH BROKERS (no company filter — brokers are shared across companies)
    // ============================================================================
    const unsubBrokers = onSnapshot(
      query(
        collection(db, "brokers"), 
        where("tenantId", "==", currentTenantId),
        orderBy("name", "asc")
      ), 
      (snap) => {
        setBrokers(snap.docs.map(b => ({ id: b.id, ...b.data() })));
      }, 
      (err) => console.error("Error fetching brokers:", err)
    );
    unsubscribeFunctions.push(unsubBrokers);
    
    // ============================================================================
    // FETCH TENANT SETTINGS (commodity types — shared across companies)
    // ============================================================================
    const tenantSettingsRef = doc(db, "tenantSettings", currentTenantId);
    let settingsHandled = false;
    
    const unsubSettings = onSnapshot(tenantSettingsRef, async (docSnap) => {
      if (docSnap.exists()) {
        const settingsData = docSnap.data();
        console.log("Tenant settings found:", settingsData);
        setCommodityTypes(settingsData.commodityTypes || []);
        setIsAutomobileHauling(settingsData.commodityTypes?.includes(COMMODITY_TYPES.AUTOMOBILE_HAULING) || false);
        setIsDryVan(settingsData.commodityTypes?.includes(COMMODITY_TYPES.DRY_VAN) || false);
        setIsReefer(settingsData.commodityTypes?.includes(COMMODITY_TYPES.REEFER) || false);
        setIsFlatbed(settingsData.commodityTypes?.includes(COMMODITY_TYPES.FLATBED) || false);
        setIsTanker(settingsData.commodityTypes?.includes(COMMODITY_TYPES.TANKER) || false);
        settingsHandled = true;
        setIsLoadingDropdowns(false);
      } else {
        // No tenant settings exist - create them from global template
        console.warn("No tenant settings found for tenant:", currentTenantId);
        
        try {
          const newSettings = await createTenantSettingsFromGlobal(currentTenantId, loggedInUser.companyName);
          // The snapshot listener will fire again once settings are created
        } catch (error) {
          console.error("Failed to create tenant settings, using defaults:", error);
          
          setCommodityTypes([]);
          setIsAutomobileHauling(false);
          setIsDryVan(false);
          setIsReefer(false);
          setIsFlatbed(false);
          setIsTanker(false);
          settingsHandled = true;
          setIsLoadingDropdowns(false);
        }
      }
    }, (err) => {
      console.error("Error fetching tenant settings:", err);
      setCommodityTypes([]);
      setIsAutomobileHauling(false);
      setIsDryVan(false);
      setIsReefer(false);
      setIsFlatbed(false);
      setIsTanker(false);
      setIsLoadingDropdowns(false);
    });
    
    unsubscribeFunctions.push(unsubSettings);

    // Ensure loading state is set to false after a timeout (failsafe)
    const timeoutId = setTimeout(() => {
      if (!settingsHandled) {
        console.warn("Settings loading timeout - forcing completion");
        setIsLoadingDropdowns(false);
      }
    }, 5000);

    return () => {
      clearTimeout(timeoutId);
      unsubscribeFunctions.forEach(unsub => unsub());
      console.log("Dropdown Fetch Effect: Cleaned up dropdown listeners.");
    };
  }, [loggedInUser]);

  return {
    drivers,
    trucks,
    dispatchers,
    brokers,
    commodityTypes,
    isAutomobileHauling,
    isDryVan,
    isReefer,
    isFlatbed,
    isTanker,
    isLoadingDropdowns
  };
};