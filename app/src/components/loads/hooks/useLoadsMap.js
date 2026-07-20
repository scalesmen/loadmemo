// src/components/loads/hooks/useLoadsMap.js
import { useState, useCallback, useEffect } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../../../firebase';

export const useLoadsMap = (loggedInUser, filters) => {
  const [showMapView, setShowMapView] = useState(false);
  const [driverLocations, setDriverLocations] = useState({});
  const [isLoadingMap, setIsLoadingMap] = useState(false);

  // Toggle map view
  const toggleMapView = useCallback(() => {
    setShowMapView(prev => !prev);
  }, []);

  // Listen to driver locations (if you have real-time tracking)
  useEffect(() => {
    if (!showMapView || !loggedInUser) return;

    // This would connect to your real-time driver tracking
    // For now, we'll create a placeholder
    const unsubscribe = onSnapshot(
      collection(db, 'driverLocations'),
      (snapshot) => {
        const locations = {};
        snapshot.forEach((doc) => {
          locations[doc.id] = doc.data();
        });
        setDriverLocations(locations);
      },
      (error) => {
        console.error('Error fetching driver locations:', error);
      }
    );

    return () => unsubscribe();
  }, [showMapView, loggedInUser]);

  // Filter loads for map display
  const getFilteredLoadsForMap = useCallback((loads) => {
    // Apply the same filters as the table view
    return loads.filter(load => {
      // Status filter
      if (filters.status && load.status !== filters.status) return false;
      
      // Driver filter
      if (filters.driverId && load.driverId !== filters.driverId) return false;
      
      // Truck filter
      if (filters.truckId && load.truckId !== filters.truckId) return false;
      
      // Broker filter
      if (filters.brokerId && load.brokerId !== filters.brokerId) return false;
      
      // Dispatcher filter
      if (filters.dispatcherId && load.dispatcherId !== filters.dispatcherId) return false;
      
      // Search filter (load ID)
      if (filters.search && !load.load_id.toLowerCase().includes(filters.search.toLowerCase())) {
        return false;
      }
      
      return true;
    });
  }, [filters]);

  return {
    showMapView,
    toggleMapView,
    driverLocations,
    isLoadingMap,
    getFilteredLoadsForMap
  };
};