// src/components/loads/hooks/useLoadsData.js
import { useState, useEffect, useMemo } from 'react';
import { db } from '../../../firebase';
import { collection, query, where, onSnapshot, orderBy, limit } from "firebase/firestore";
import { DEFAULT_CURRENT_STATUSES, ALL_STATUSES } from '../utils/constants';
import { determineTenantId, filterLoadsBySearch } from '../utils/loadHelpers';

const LOADS_PER_PAGE = 30;

// ============================================================================
// HELPER: Check if user is Super Admin
// ============================================================================
const isSuperAdmin = (user) => {
  if (!user) return false;
  const roles = Array.isArray(user.role) ? user.role : [user.role].filter(Boolean);
  return roles.includes('Super Admin');
};

/**
 * Custom hook to fetch and manage loads data with pagination
 * PHASE 2: Non-Super Admin users only see loads belonging to their parent companies
 * Note: parentCompanyId filtering is done CLIENT-SIDE because Firestore
 * doesn't allow two 'in' operators in the same query (status already uses 'in')
 * @param {Object} loggedInUser - Current logged in user
 * @param {Object} filters - Active filters
 * @param {string} applicationTimeZone - Application timezone
 * @param {boolean} isLoadingTimeZone - Whether timezone is still loading
 * @param {number} loadLimit - Number of loads to display (for pagination)
 * @returns {Object} Loads data and state
 */
export const useLoadsData = (loggedInUser, filters, applicationTimeZone, isLoadingTimeZone, loadLimit = LOADS_PER_PAGE) => {
  const [allLoads, setAllLoads] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const currentTenantId = determineTenantId(loggedInUser);

    // ============================================================================
    // COMPANY FILTERING SETUP (computed inside useEffect to avoid dependency issues)
    // ============================================================================
    const isSuper = isSuperAdmin(loggedInUser);
    const parentCompanyIds = loggedInUser?.assignedParentCompanyIds || [];
    const shouldFilterByCompany = !isSuper && parentCompanyIds.length > 0;
const hasCompanyField = loggedInUser?.assignedParentCompanyIds !== undefined;
const userHasNoCompanies = !isSuper && hasCompanyField && parentCompanyIds.length === 0;
    
    if (!loggedInUser || !loggedInUser.uid || isLoadingTimeZone) { 
      console.log("Loads Fetch Effect: Conditions not met", {
        loggedInUser: !!loggedInUser,
        isLoadingTimeZone
      });
      setAllLoads([]); 
      setIsLoading(false);
      return; 
    }

    if (!currentTenantId) {
      console.error("❌ No tenant ID found for user. Cannot load tenant-specific data.");
      setError("Tenant information missing. Please contact administrator.");
      setIsLoading(false);
      return;
    }

    // If non-Super Admin has no assigned companies, show nothing
    if (userHasNoCompanies) {
      console.warn("⚠️ Non-Super Admin user has no assigned parent companies. Showing no loads.");
      setAllLoads([]);
      setIsLoading(false);
      return;
    }

    console.log("Loads Fetch Effect: Fetching current loads. Filters:", filters);
    setError(null);
    setIsLoading(true);

    let conditions = [];
    
    // Build query conditions
    const statusArray = filters.showCompleted ? ALL_STATUSES : DEFAULT_CURRENT_STATUSES;
    
    if (filters.status !== 'all') {
      conditions.push(where("status", "==", filters.status));
    } else {
      conditions.push(where("status", "in", statusArray));
    }
    
    if (filters.driverId !== 'all') conditions.push(where("driverId", "==", filters.driverId));
    if (filters.truckId !== 'all') conditions.push(where("truckId", "==", filters.truckId));
    if (filters.brokerId !== 'all') conditions.push(where("brokerId", "==", filters.brokerId));
    if (filters.dispatcherId !== 'all') conditions.push(where("dispatcherId", "==", filters.dispatcherId));

    try {
      const queryParts = [
        collection(db, "loads"),
        where("tenantId", "==", currentTenantId),
        ...conditions,
        orderBy("createdAt", "desc")
      ];

      // Role-based load cap
      const MAX_LOADS = isSuperAdmin(loggedInUser) ? 1000 : 500;
      queryParts.push(limit(MAX_LOADS));

      const q = query(...queryParts);

      const unsubscribe = onSnapshot(
        q, 
        (snapshot) => {
          console.log("🔍 DEBUG: Received loads snapshot:", {
            totalDocs: snapshot.docs.length,
            tenantId: currentTenantId,
            showCompleted: filters.showCompleted
          });

          let loads = snapshot.docs.map(doc => ({ 
            docId: doc.id, 
            ...doc.data() 
          }));

          // ✅ ALWAYS filter out archived loads
          loads = loads.filter(load => {
            const isArchived = load.isArchived === true;
            if (isArchived) {
              console.log('🗑️ Filtering out archived load:', load.load_id);
            }
            return !isArchived;
          });

          // ============================================================================
          // PHASE 2: CLIENT-SIDE PARENT COMPANY FILTER
          // ============================================================================
         if (shouldFilterByCompany) {
  const beforeCount = loads.length;
  loads = loads.filter(load => {
    if (!load.parentCompanyId) {
      return true; // Show untagged loads to everyone until they get tagged
    }
    return parentCompanyIds.includes(load.parentCompanyId);
  });
            console.log(`🏢 Company filter: ${beforeCount} → ${loads.length} loads (user companies: ${parentCompanyIds.length})`);
          }

          // Filter for unassigned loads if checkbox is checked
          const finalLoads = filters.showUnassignedOnly 
            ? loads.filter(load => !load.driverId || load.driverId === '')
            : loads;

          console.log("🔍 DEBUG: Final loads count:", finalLoads.length);

          setAllLoads(finalLoads);
          setIsLoading(false);
        }, 
        (err) => {
          console.error("❌ Loads Fetch Effect: Error fetching loads:", err);
          setError("Failed to fetch loads. " + (err?.message || "Ensure Firestore indexes are set up."));
          setIsLoading(false);
        }
      );

      return () => {
        console.log("Loads Fetch Effect: Cleaning up loads listener.");
        unsubscribe();
      };
    } catch (err) {
      console.error("❌ Loads Fetch Effect: Error constructing query:", err);
      setError("Error constructing query. Please check filter logic.");
      setIsLoading(false);
    }
  }, [loggedInUser, filters, isLoadingTimeZone, applicationTimeZone]);

  // Apply client-side filtering for Load ID search
  const filteredLoads = useMemo(() => {
    return filterLoadsBySearch(allLoads, filters.searchLoadId);
  }, [allLoads, filters.searchLoadId]);

  // Apply pagination limit (only if NOT searching by Load ID)
  const displayedLoads = useMemo(() => {
    if (filters.searchLoadId && filters.searchLoadId.trim() !== '') {
      return filteredLoads;
    }
    return filteredLoads.slice(0, loadLimit);
  }, [filteredLoads, loadLimit, filters.searchLoadId]);

  const hasMoreLoads = filteredLoads.length > displayedLoads.length;

  const MAX_LOADS = isSuperAdmin(loggedInUser) ? 1000 : 500;

  return {
    currentLoads: displayedLoads,
    isLoading,
    error,
    totalLoads: allLoads.length,
    filteredCount: filteredLoads.length,
    displayedCount: displayedLoads.length,
    hasMoreLoads,
    LOADS_PER_PAGE,
    MAX_LOADS
  };
};