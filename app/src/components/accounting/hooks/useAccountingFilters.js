// src/components/accounting/hooks/useAccountingFilters.js
// ⭐ UPDATED: Overdue filter no longer manipulates dates — queries ALL loads server-side
// Other quick filters still use Option A (keep custom dates or default 30 days)

import { useState, useEffect } from 'react';
import { useTimezone } from '../../../contexts/TimezoneContext';
import { getDateRangeDisplay } from '../utils/dateFormatters';

// Helper to get date string in YYYY-MM-DD format
const getDateString = (date) => {
  return date.toISOString().split('T')[0];
};

// Get today's date string
const getTodayDate = () => {
  return getDateString(new Date());
};

// Get date 30 days ago
const get30DaysAgo = () => {
  const date = new Date();
  date.setDate(date.getDate() - 30);
  return getDateString(date);
};

export function useAccountingFilters() {
  const { applicationTimeZone, isLoadingTimeZone } = useTimezone();
  
  // Store original dates before quick filter was applied
  const [originalDates, setOriginalDates] = useState({ startDate: '', endDate: '' });
  
  const [filters, setFilters] = useState({
    driverId: 'all',
    truckId: 'all',
    startDate: '',
    endDate: '',
    brokerId: 'all',
    dispatcherId: 'all',
    loadIdSearch: '',
    showPickedUp: false,
    quickFilter: 'all', // 'all' | 'overdue' | 'invoiced' | 'paid' | 'uninvoiced' | 'unpaid'
    secondaryFilter: 'all', // 'all' | 'invoiced' | 'uninvoiced' | 'paid' | 'unpaid' (only when overdue is active)
    companyFilter: 'all'
  });

  const [mainFilterRangeDisplay, setMainFilterRangeDisplay] = useState({ 
    start: '', 
    end: '' 
  });

  // Update filter range display when dates or timezone changes
  useEffect(() => {
    const display = getDateRangeDisplay(
      filters.startDate,
      filters.endDate,
      applicationTimeZone,
      isLoadingTimeZone
    );
    setMainFilterRangeDisplay(display);
  }, [filters.startDate, filters.endDate, applicationTimeZone, isLoadingTimeZone]);

  const handleFilterChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFilters(prev => ({ 
      ...prev, 
      [name]: type === 'checkbox' ? checked : value 
    }));
  };

  // Quick filter handler
  // - "overdue": does NOT touch dates — Firestore query skips date filters and fetches ALL loads
  // - Other filters: respects custom dates if set, otherwise defaults to 30 days
  const handleQuickFilterChange = (filterType) => {
    setFilters(prev => {
      // If overdue is active and user clicks a secondary filter
      if (prev.quickFilter === 'overdue' && filterType !== 'overdue') {
        const isDeactivatingSecondary = prev.secondaryFilter === filterType;
        return {
          ...prev,
          secondaryFilter: isDeactivatingSecondary ? 'all' : filterType
        };
      }

      // Clicking overdue itself
      if (filterType === 'overdue') {
        const isDeactivating = prev.quickFilter === 'overdue';
        if (isDeactivating) {
          return {
            ...prev,
            quickFilter: 'all',
            secondaryFilter: 'all',
            startDate: originalDates.startDate,
            endDate: originalDates.endDate
          };
        } else {
          if (prev.quickFilter === 'all') {
            setOriginalDates({ startDate: prev.startDate, endDate: prev.endDate });
          }
          return {
            ...prev,
            quickFilter: 'overdue',
            secondaryFilter: 'all'
          };
        }
      }

      // Clicking unpaid (standalone)
      if (filterType === 'unpaid') {
        const isDeactivating = prev.quickFilter === 'unpaid';
        if (isDeactivating) {
          return {
            ...prev,
            quickFilter: 'all',
            secondaryFilter: 'all',
            startDate: originalDates.startDate,
            endDate: originalDates.endDate
          };
        } else {
          if (prev.quickFilter === 'all') {
            setOriginalDates({ startDate: prev.startDate, endDate: prev.endDate });
          }
          return {
            ...prev,
            quickFilter: 'unpaid',
            secondaryFilter: 'all'
          };
        }
      }

      // Other filters (invoiced, uninvoiced, paid, on_delivery) — standalone
      const isDeactivating = prev.quickFilter === filterType;
      if (isDeactivating) {
        return {
          ...prev,
          quickFilter: 'all',
          secondaryFilter: 'all',
          startDate: originalDates.startDate,
          endDate: originalDates.endDate
        };
      } else {
        if (prev.quickFilter === 'all') {
          setOriginalDates({ startDate: prev.startDate, endDate: prev.endDate });
        }
        return {
          ...prev,
          quickFilter: filterType,
          secondaryFilter: 'all'
        };
      }
    });
  };

  const resetFilters = () => {
    setOriginalDates({ startDate: '', endDate: '' });
    setFilters({
      driverId: 'all',
      truckId: 'all',
      startDate: '',
      endDate: '',
      brokerId: 'all',
      dispatcherId: 'all',
      loadIdSearch: '',
      showPickedUp: false,
      quickFilter: 'all',
      secondaryFilter: 'all',
      companyFilter: 'all'
    });
  };

  return {
    filters,
    handleFilterChange,
    handleQuickFilterChange,
    resetFilters,
    mainFilterRangeDisplay,
    applicationTimeZone,
    isLoadingTimeZone
  };
}