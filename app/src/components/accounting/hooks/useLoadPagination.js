// src/components/accounting/hooks/useLoadPagination.js
// PHASE 2: Passes parentCompanyIds to accounting service for company filtering

import { useState, useEffect, useMemo } from 'react';
import { 
  fetchAccountingLoads, 
  fetchMoreAccountingLoads 
} from '../services/accountingService';

/**
 * Calculate business days between two dates (excludes weekends)
 */
function getBusinessDaysBetween(startDate, endDate) {
  let count = 0;
  const current = new Date(startDate);
  
  while (current <= endDate) {
    const dayOfWeek = current.getDay();
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      count++;
    }
    current.setDate(current.getDate() + 1);
  }
  
  return count;
}

/**
 * Check if a load is overdue based on payment terms
 */
function isLoadOverdue(load) {
  if (!load.actualDEL) return false;
  if (load.paymentStatus === 'paid') return false;
  
  let deliveryDate;
  if (load.actualDEL?.toDate) {
    deliveryDate = load.actualDEL.toDate();
  } else if (load.actualDEL instanceof Date) {
    deliveryDate = load.actualDEL;
  } else {
    return false;
  }
  
  const now = new Date();
  const paymentTerms = (load.paymentTerms || '').toLowerCase();
  
  if (paymentTerms === 'on_delivery' || paymentTerms === 'cod' || paymentTerms === 'cash_on_delivery') {
    return now > deliveryDate;
  }
  
  if (paymentTerms.includes('business') || paymentTerms.includes('bus')) {
    const match = paymentTerms.match(/(\d+)/);
    const businessDays = match ? parseInt(match[1], 10) : 5;
    const businessDaysPassed = getBusinessDaysBetween(deliveryDate, now);
    return businessDaysPassed > businessDays;
  }
  
  if (paymentTerms.includes('quick') || paymentTerms.includes('immediate')) {
    const businessDaysPassed = getBusinessDaysBetween(deliveryDate, now);
    return businessDaysPassed > 3;
  }
  
  let paymentTermDays = 30;
  
  if (paymentTerms.includes('15')) {
    paymentTermDays = 15;
  } else if (paymentTerms.includes('30')) {
    paymentTermDays = 30;
  } else if (paymentTerms.includes('45')) {
    paymentTermDays = 45;
  } else if (paymentTerms.includes('60')) {
    paymentTermDays = 60;
  } else if (paymentTerms.includes('90')) {
    paymentTermDays = 90;
  }
  
  const daysSinceDelivery = Math.floor((now - deliveryDate) / (1000 * 60 * 60 * 24));
  return daysSinceDelivery > paymentTermDays;
}

/**
 * Apply quick filters to loads array
 */
function applyQuickFilter(loads, quickFilter, secondaryFilter = 'all') {
  if (quickFilter === 'all' || !quickFilter) {
    return loads;
  }
  
  let filtered;
  switch (quickFilter) {
    case 'overdue':
      filtered = loads.filter(load => isLoadOverdue(load));
      break;
    case 'invoiced':
      return loads.filter(load => load.invoiceStatus === 'invoiced');
    case 'uninvoiced':
      return loads.filter(load => load.invoiceStatus !== 'invoiced' && load.paymentStatus !== 'paid');
    case 'paid':
      return loads.filter(load => load.paymentStatus === 'paid');
    case 'unpaid':
      filtered = loads.filter(load => load.paymentStatus !== 'paid');
      break;
    case 'on_delivery':
      return loads.filter(load => 
        load.paymentTerms === 'on_delivery' || load.paymentTerms === 'on_pickup'
      );
    default:
      return loads;
  }

  // Apply secondary filter on top of overdue/unpaid
  if (secondaryFilter && secondaryFilter !== 'all') {
    switch (secondaryFilter) {
      case 'invoiced':
        filtered = filtered.filter(load => load.invoiceStatus === 'invoiced');
        break;
      case 'uninvoiced':
        filtered = filtered.filter(load => load.invoiceStatus !== 'invoiced');
        break;
      case 'paid':
        filtered = filtered.filter(load => load.paymentStatus === 'paid');
        break;
      case 'unpaid':
        filtered = filtered.filter(load => load.paymentStatus !== 'paid');
        break;
      case 'on_delivery':
        filtered = filtered.filter(load => 
          load.paymentTerms === 'on_delivery' || load.paymentTerms === 'on_pickup'
        );
        break;
      default:
        break;
    }
  }

  return filtered;
}

// ============================================================================
// HELPER: Check if user is Super Admin
// ============================================================================
const isSuperAdmin = (user) => {
  if (!user) return false;
  const roles = Array.isArray(user.role) ? user.role : [user.role].filter(Boolean);
  return roles.includes('Super Admin');
};

export function useLoadPagination(
  filters, 
  loggedInUser, 
  applicationTimeZone, 
  isLoadingTimeZone,
  isAuthLoading,
  brokers = []
) {
  const [rawAccountingLoads, setRawAccountingLoads] = useState([]);
  const [isDataLoading, setIsDataLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastVisible, setLastVisible] = useState(null);
  const [hasMore, setHasMore] = useState(true);
  const [isFetchingMore, setIsFetchingMore] = useState(false);

  const isQuickFilterActive = filters.quickFilter && filters.quickFilter !== 'all';

  // ============================================================================
  // PHASE 2: Determine parent company IDs for filtering
  // null = no filter (Super Admin), array = filter by these companies
  // ============================================================================
  const parentCompanyIds = useMemo(() => {
    if (!loggedInUser) return null;
    if (isSuperAdmin(loggedInUser)) return null; // Super Admin sees all
    const hasCompanyField = loggedInUser.assignedParentCompanyIds !== undefined;
    if (!hasCompanyField) return null; // No field yet = no filter, see everything
    const ids = loggedInUser.assignedParentCompanyIds || [];
    return ids.length > 0 ? ids : []; // Empty array = see nothing
  }, [loggedInUser]);

  const accountingLoads = useMemo(() => {
    let filtered = applyQuickFilter(rawAccountingLoads, filters.quickFilter, filters.secondaryFilter);
    
    // Apply company filter (client-side)
    if (filters.companyFilter && filters.companyFilter !== 'all') {
      filtered = filtered.filter(load => {
        if (load.companyName === filters.companyFilter) return true;
        if (load.parentCompanyName === filters.companyFilter) return true;
        return false;
      });
    }
    
    console.log(`📊 Quick filter "${filters.quickFilter}"${filters.secondaryFilter !== 'all' ? ` + "${filters.secondaryFilter}"` : ''}${filters.companyFilter !== 'all' ? ` + company "${filters.companyFilter}"` : ''}: ${rawAccountingLoads.length} → ${filtered.length} loads`);
    return filtered;
  }, [rawAccountingLoads, filters.quickFilter, filters.secondaryFilter, filters.companyFilter]);

  // Fetch initial loads when filters change
  useEffect(() => {
    if (isAuthLoading || isLoadingTimeZone || !loggedInUser || !loggedInUser.tenantId) {
      setRawAccountingLoads([]);
      if (!loggedInUser || !loggedInUser.tenantId) setIsDataLoading(false);
      return;
    }

    // PHASE 2: If non-Super Admin has no companies assigned, show nothing
    if (parentCompanyIds !== null && parentCompanyIds.length === 0) {
      console.warn("⚠️ Non-Super Admin user has no assigned parent companies. Showing no accounting loads.");
      setRawAccountingLoads([]);
      setIsDataLoading(false);
      return;
    }

    const fetchInitialLoads = async () => {
      if (!filters.loadIdSearch) {
        setIsDataLoading(true);
      }
      setError(null);
      setHasMore(true);

      console.log('🔄 useLoadPagination: Fetching loads, quickFilter active:', isQuickFilterActive, 'parentCompanyIds:', parentCompanyIds);

      try {
        const { loadsData, lastDoc, hasMore: hasMoreData } = await fetchAccountingLoads(
          filters,
          loggedInUser.tenantId,
          applicationTimeZone,
          brokers,
          isQuickFilterActive,
          parentCompanyIds // PHASE 2: Pass parent company IDs
        );
        
        console.log('✅ useLoadPagination: Received loads:', loadsData.length);
        
        setRawAccountingLoads(loadsData);
        setLastVisible(lastDoc);
        setHasMore(hasMoreData);
      } catch (err) {
        console.error("Error fetching accounting loads:", err);
        if (err.code === 'failed-precondition') {
          setError(`Query requires an index. Firestore: ${err.message}. Please check Firestore console for index creation link.`);
        } else {
          setError("Failed to fetch accounting loads.");
        }
      } finally {
        setIsDataLoading(false);
      }
    };

    fetchInitialLoads();
  }, [loggedInUser, filters.driverId, filters.truckId, filters.startDate, filters.endDate, 
      filters.brokerId, filters.dispatcherId, filters.loadIdSearch, filters.showPickedUp,
      filters.quickFilter, isAuthLoading, isLoadingTimeZone, applicationTimeZone, isQuickFilterActive, parentCompanyIds]);

  // Handle load more
  const handleLoadMore = async () => {
    if (!lastVisible || !hasMore || isFetchingMore || !loggedInUser?.tenantId) return;

    setIsFetchingMore(true);
    setError(null);

    console.log('🔄 useLoadPagination: Loading more with brokers:', brokers.length);

    try {
      const { loadsData, lastDoc, hasMore: hasMoreData } = await fetchMoreAccountingLoads(
        filters,
        loggedInUser.tenantId,
        applicationTimeZone,
        lastVisible,
        brokers,
        parentCompanyIds // PHASE 2: Pass parent company IDs
      );

      console.log('✅ useLoadPagination: Received more loads:', loadsData.length);

      if (loadsData.length > 0) {
        setRawAccountingLoads(prevLoads => [...prevLoads, ...loadsData]);
        setLastVisible(lastDoc);
        setHasMore(hasMoreData);
      }
    } catch (err) {
      console.error("Error fetching more accounting loads:", err);
      setError("Failed to fetch more loads.");
    } finally {
      setIsFetchingMore(false);
    }
  };

  const updateLoadInList = (loadDocId, updates) => {
    setRawAccountingLoads(currentLoads =>
      currentLoads.map(load => {
        if (load.docId === loadDocId) {
          return { ...load, ...updates };
        }
        return load;
      })
    );
  };

  const removeLoadFromList = (loadDocId) => {
    setRawAccountingLoads(currentLoads =>
      currentLoads.filter(load => load.docId !== loadDocId)
    );
  };

  return {
    accountingLoads,
    rawLoadCount: rawAccountingLoads.length,
    isDataLoading,
    error,
    hasMore,
    isFetchingMore,
    handleLoadMore,
    updateLoadInList,
    removeLoadFromList,
    isQuickFilterActive
  };
}