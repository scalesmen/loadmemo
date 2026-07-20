// src/components/loads/hooks/useEmptyDrivers.js
import { useState, useEffect, useMemo, useRef } from 'react';
import { db } from '../../../firebase';
import { collection, query, where, onSnapshot, orderBy } from 'firebase/firestore';

// Cache duration: 15 minutes (in milliseconds)
const CACHE_DURATION = 15 * 60 * 1000;

// Global cache object (persists across component remounts)
const dataCache = {
  deliveredLoads: null,
  timestamp: null,
  tenantId: null
};

/**
 * Custom hook to track drivers without active loads and calculate their idle time
 * 
 * CACHING STRATEGY:
 * - Delivered loads are cached for 15 minutes (rarely change)
 * - ALL current loads use REAL-TIME updates (need immediate updates when assignments change)
 * - Manual refresh button can force a cache clear
 * 
 * LOGIC:
 * - A driver is "empty" ONLY if they have NO loads assigned at all
 * - We check ALL loads regardless of status (Booked, Dispatched, Picked Up, etc.)
 * - Only truly unassigned drivers appear in the widget
 * 
 * TIME CALCULATION NOTE:
 * - Firestore Timestamps are stored in UTC
 * - .toDate() converts to JavaScript Date (UTC)
 * - Date.now() returns current time in UTC milliseconds
 * - Duration calculations (idle time) are timezone-independent
 * - applicationTimeZone is included for potential future display features
 * 
 * @param {Object} loggedInUser - Current logged in user
 * @param {Array} drivers - All drivers from the system
 * @param {string} applicationTimeZone - Application timezone (for display purposes)
 * @param {boolean} shouldFetchData - Whether to fetch data (for lazy loading)
 * @returns {Object} Empty drivers data and state
 */
export const useEmptyDrivers = (loggedInUser, drivers, applicationTimeZone, shouldFetchData = true) => {
  const [deliveredLoads, setDeliveredLoads] = useState([]);
  const [allCurrentLoads, setAllCurrentLoads] = useState([]); // ALL loads regardless of status
  const [isLoading, setIsLoading] = useState(true);
  const [lastFetchTime, setLastFetchTime] = useState(null);
  const unsubscribeRefs = useRef({ current: null, delivered: null });

  /**
   * Check if delivered loads cache is valid for current tenant
   */
  const isCacheValid = () => {
    if (!dataCache.timestamp || !dataCache.tenantId) return false;
    if (dataCache.tenantId !== loggedInUser?.tenantId) return false;
    
    const now = Date.now();
    const cacheAge = now - dataCache.timestamp;
    return cacheAge < CACHE_DURATION;
  };

  /**
   * Load delivered loads from cache
   */
  const loadFromCache = () => {
    console.log('📦 Loading delivered loads from cache');
    setDeliveredLoads(dataCache.deliveredLoads || []);
    setLastFetchTime(dataCache.timestamp);
  };

  /**
   * Save delivered loads to cache
   */
  const saveToCache = (delivered) => {
    const now = Date.now();
    dataCache.deliveredLoads = delivered;
    dataCache.timestamp = now;
    dataCache.tenantId = loggedInUser?.tenantId;
    setLastFetchTime(now);
    console.log('💾 Saved delivered loads to cache');
  };

  /**
   * Clear cache and force refresh
   */
  const clearCache = () => {
    dataCache.deliveredLoads = null;
    dataCache.timestamp = null;
    dataCache.tenantId = null;
    setLastFetchTime(null);
    console.log('🗑️ Cache cleared, will fetch fresh data');
  };

  // Fetch ALL CURRENT LOADS (real-time, no cache) to check driver assignments
  useEffect(() => {
    if (!loggedInUser?.tenantId || !shouldFetchData) {
      setAllCurrentLoads([]);
      return;
    }

    console.log('🔄 Setting up real-time listener for ALL current loads');

    // Query ALL loads that are NOT archived or completed
    // This includes: Available, Booked, Dispatched, Picked Up, In Transit, At Delivery, At Shipper, etc.
    const currentStatuses = [
      'Available',
      'Booked', 
      'Dispatched',
      'Picked Up',
      'In Transit',
      'At Delivery',
      'At Shipper'
    ];
    
    const currentLoadsQuery = query(
      collection(db, 'loads'),
      where('tenantId', '==', loggedInUser.tenantId),
      where('status', 'in', currentStatuses)
    );

    // Real-time listener for current loads (always active)
    unsubscribeRefs.current.current = onSnapshot(
      currentLoadsQuery,
      (snapshot) => {
        const loads = snapshot.docs.map(doc => ({
          docId: doc.id,
          ...doc.data()
        }));
        setAllCurrentLoads(loads);
        console.log(`📦 Real-time update: ${loads.length} current loads (any status)`);
        
        // Log drivers with loads for debugging
        const driversWithLoads = new Set(
          loads
            .filter(load => load.driverId && load.driverId.trim() !== '')
            .map(load => load.driverId)
        );
        console.log(`🚛 ${driversWithLoads.size} drivers have loads assigned`, Array.from(driversWithLoads));
      },
      (error) => {
        console.error('❌ Error fetching current loads for empty drivers:', error);
      }
    );

    return () => {
      if (unsubscribeRefs.current.current) {
        unsubscribeRefs.current.current();
        unsubscribeRefs.current.current = null;
        console.log('🔌 Unsubscribed from current loads listener');
      }
    };
  }, [loggedInUser?.tenantId, shouldFetchData]);

  // Fetch DELIVERED LOADS (cached for 15 minutes) for idle time calculation
  useEffect(() => {
    if (!loggedInUser?.tenantId || !shouldFetchData) {
      setDeliveredLoads([]);
      setIsLoading(false);
      return;
    }

    // Check if we can use cached delivered loads
    if (isCacheValid()) {
      loadFromCache();
      setIsLoading(false);
      return;
    }

    // Cache is invalid, fetch fresh delivered loads
    console.log('🔄 Cache expired or invalid, fetching fresh delivered loads');
    setIsLoading(true);

    const deliveredQuery = query(
      collection(db, 'loads'),
      where('tenantId', '==', loggedInUser.tenantId),
      where('status', '==', 'Delivered'),
      orderBy('actualDEL', 'desc')
    );

    // One-time fetch of delivered loads, then unsubscribe
    unsubscribeRefs.current.delivered = onSnapshot(
      deliveredQuery,
      (snapshot) => {
        const loads = snapshot.docs.map(doc => ({
          docId: doc.id,
          ...doc.data()
        }));
        setDeliveredLoads(loads);
        saveToCache(loads);
        setIsLoading(false);
        console.log(`✅ Loaded ${loads.length} delivered loads for idle time calculation`);
        
        // Unsubscribe after first fetch (we don't need real-time updates for delivered loads)
        if (unsubscribeRefs.current.delivered) {
          unsubscribeRefs.current.delivered();
          unsubscribeRefs.current.delivered = null;
        }
      },
      (error) => {
        console.error('❌ Error fetching delivered loads:', error);
        setIsLoading(false);
      }
    );

    return () => {
      if (unsubscribeRefs.current.delivered) {
        unsubscribeRefs.current.delivered();
        unsubscribeRefs.current.delivered = null;
      }
    };
  }, [loggedInUser?.tenantId, shouldFetchData, lastFetchTime]); // Include lastFetchTime to trigger refresh

  // Calculate empty drivers with idle times
  const emptyDrivers = useMemo(() => {
    if (!drivers || drivers.length === 0) return [];

    // Get current time in UTC (this is always correct regardless of timezone)
    const nowUTC = Date.now();

    // Get all driver IDs that have ANY load assigned (regardless of status)
    const driversWithLoads = new Set(
      allCurrentLoads
        .filter(load => load.driverId && load.driverId.trim() !== '')
        .map(load => load.driverId)
    );

    console.log(`🚛 ${driversWithLoads.size} drivers currently have loads assigned (any status)`);

    // Filter to only active drivers WITHOUT any current loads
    const idleDrivers = drivers.filter(driver => 
      driver.status === 'Active' && 
      !driversWithLoads.has(driver.id)
    );

    console.log(`💤 ${idleDrivers.length} active drivers without ANY loads`);

    // Calculate idle time for each driver
    const driversWithIdleTime = idleDrivers.map(driver => {
      // Find the most recent delivered load for this driver
      const lastDeliveredLoad = deliveredLoads.find(
        load => load.driverId === driver.id
      );

      let idleTimeMs = 0;
      let lastDeliveryTime = null;

      if (lastDeliveredLoad && lastDeliveredLoad.actualDEL) {
        // Convert Firestore Timestamp to JavaScript Date
        lastDeliveryTime = lastDeliveredLoad.actualDEL.toDate 
          ? lastDeliveredLoad.actualDEL.toDate() 
          : new Date(lastDeliveredLoad.actualDEL);
        
        // Calculate idle time in milliseconds
        idleTimeMs = nowUTC - lastDeliveryTime.getTime();
      } else {
        // If no delivery record, consider them idle for a very long time
        idleTimeMs = 999 * 60 * 60 * 1000; // 999 hours
      }

      const idleHours = idleTimeMs / (1000 * 60 * 60);
      const idleMinutes = (idleTimeMs % (1000 * 60 * 60)) / (1000 * 60);

      return {
        ...driver,
        lastDeliveryTime,
        idleTimeMs,
        idleHours: Math.floor(idleHours),
        idleMinutes: Math.floor(idleMinutes),
        colorCode: getColorCode(idleHours)
      };
    });

    // Sort by idle time (longest idle first)
    return driversWithIdleTime.sort((a, b) => b.idleTimeMs - a.idleTimeMs);
  }, [drivers, allCurrentLoads, deliveredLoads]);

  // Return ALL empty drivers (removed the 1-hour filter to show all empty drivers)
  const allEmptyDrivers = useMemo(() => {
    return emptyDrivers;
  }, [emptyDrivers]);

  // Calculate time until next refresh (for delivered loads cache)
  const timeUntilRefresh = useMemo(() => {
    if (!lastFetchTime) return null;
    const elapsed = Date.now() - lastFetchTime;
    const remaining = CACHE_DURATION - elapsed;
    return Math.max(0, Math.ceil(remaining / 1000 / 60)); // Minutes
  }, [lastFetchTime]);

  return {
    emptyDrivers: allEmptyDrivers,
    isLoading,
    totalEmptyDrivers: allEmptyDrivers.length,
    lastFetchTime,
    timeUntilRefresh,
    clearCache // Expose for manual refresh
  };
};

/**
 * Get color code based on idle hours
 * NOW WITH 4 COLORS:
 * - Light green: < 1 hour
 * - Yellow: 1-2 hours
 * - Orange: 2-4 hours
 * - Red: 4+ hours
 * 
 * @param {number} idleHours - Hours driver has been idle
 * @returns {string} Color indicator
 */
function getColorCode(idleHours) {
  if (idleHours >= 4) return 'red';
  if (idleHours >= 2) return 'orange';
  if (idleHours >= 1) return 'yellow';
  return 'green'; // Less than 1 hour
}

/**
 * Format idle time for display
 * @param {number} hours - Idle hours
 * @param {number} minutes - Idle minutes
 * @returns {string} Formatted time string
 */
export function formatIdleTime(hours, minutes) {
  if (hours === 0) {
    return `${minutes}m`;
  }
  return `${hours}h ${minutes}m`;
}