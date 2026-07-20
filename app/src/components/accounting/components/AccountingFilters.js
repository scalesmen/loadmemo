// src/components/accounting/components/AccountingFilters.js

import React from 'react';

export default function AccountingFilters({ 
  filters, 
  handleFilterChange,
  handleQuickFilterChange,
  drivers, 
  trucks, 
  brokers,
  companies = [],
  dispatchers,
  mainFilterRangeDisplay 
}) {
  const [searchInput, setSearchInput] = React.useState(filters.loadIdSearch || '');
  const [debounceTimer, setDebounceTimer] = React.useState(null);

  const isLocalChange = React.useRef(false);
  
  React.useEffect(() => {
    if (!isLocalChange.current) {
      setSearchInput(filters.loadIdSearch || '');
    }
    isLocalChange.current = false;
  }, [filters.loadIdSearch]);

  React.useEffect(() => {
    return () => {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
    };
  }, [debounceTimer]);

  const handleSearchChange = (e) => {
    const value = e.target.value;
    setSearchInput(value);
    
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }
    
    const timer = setTimeout(() => {
      isLocalChange.current = true;
      handleFilterChange({
        target: {
          name: 'loadIdSearch',
          value: value
        }
      });
    }, 500);
    
    setDebounceTimer(timer);
  };

  const handleSearchKeyPress = (e) => {
    if (e.key === 'Enter') {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
      isLocalChange.current = true;
      handleFilterChange({
        target: {
          name: 'loadIdSearch',
          value: searchInput
        }
      });
    }
  };

  const handleSearchClear = () => {
    setSearchInput('');
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }
    isLocalChange.current = true;
    handleFilterChange({
      target: {
        name: 'loadIdSearch',
        value: ''
      }
    });
  };

  // Quick filter button configuration
  const quickFilterOptions = [
    { 
      id: 'overdue', 
      label: 'Overdue', 
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
      activeColor: 'bg-red-100 text-red-800 border-red-300',
      hoverColor: 'hover:bg-red-50'
    },
    { 
      id: 'uninvoiced', 
      label: 'Not Invoiced', 
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      ),
      activeColor: 'bg-yellow-100 text-yellow-800 border-yellow-300',
      hoverColor: 'hover:bg-yellow-50'
    },
    { 
      id: 'invoiced', 
      label: 'Invoiced', 
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
      activeColor: 'bg-blue-100 text-blue-800 border-blue-300',
      hoverColor: 'hover:bg-blue-50'
    },
    { 
      id: 'unpaid', 
      label: 'Unpaid', 
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
      activeColor: 'bg-orange-100 text-orange-800 border-orange-300',
      hoverColor: 'hover:bg-orange-50'
    },
    { 
      id: 'on_delivery', 
      label: 'On Delivery', 
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
      ),
      activeColor: 'bg-teal-100 text-teal-800 border-teal-300',
      hoverColor: 'hover:bg-teal-50'
    },
    { 
      id: 'paid', 
      label: 'Paid', 
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
      activeColor: 'bg-green-100 text-green-800 border-green-300',
      hoverColor: 'hover:bg-green-50'
    }
  ];

  // Build the active filter description
  const getFilterDescription = () => {
    if (filters.quickFilter === 'all') return null;
    
    const filterLabels = {
      overdue: 'Overdue',
      uninvoiced: 'Not Invoiced',
      invoiced: 'Invoiced',
      unpaid: 'Unpaid',
      on_delivery: 'On Delivery',
      paid: 'Paid'
    };

    const label = filterLabels[filters.quickFilter] || filters.quickFilter;

    if (filters.quickFilter === 'overdue') {
      const secondaryLabels = {
        invoiced: ' → Invoiced only',
        uninvoiced: ' → Not Invoiced only',
        paid: ' → Paid only',
        unpaid: ' → Unpaid only',
        on_delivery: ' → On Delivery only'
      };
      const secondaryText = filters.secondaryFilter !== 'all' ? (secondaryLabels[filters.secondaryFilter] || '') : '';
      return {
        text: `${label} loads${secondaryText} — scanning last 180 days`,
        hint: 'Click other filters to narrow down. Click "Load More" for additional results.',
        color: 'bg-red-50 border-red-200 text-red-800'
      };
    }

    return {
      text: `${label} loads`,
      hint: 'Use date range filters to narrow down results.',
      color: 'bg-blue-50 border-blue-200 text-blue-800'
    };
  };

  const filterDesc = getFilterDescription();

  return (
    <div className="bg-white p-4 rounded-lg shadow mb-6">
      {/* Toggle for showing picked up loads + Quick Filters on same line */}
      <div className="mb-4 pb-3 border-b border-gray-200">
        <div className="flex flex-wrap items-center gap-4">
          {/* Show Picked Up checkbox */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              name="showPickedUp"
              checked={filters.showPickedUp}
              onChange={handleFilterChange}
              className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
            />
            <span className="text-sm font-medium text-gray-700">
              Show Picked Up (in Transit)
            </span>
          </label>

          {/* Divider */}
          <div className="h-6 w-px bg-gray-300 hidden sm:block"></div>

          {/* Quick Filters */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Quick:</span>
            {quickFilterOptions.map(option => {
              const isActive = filters.quickFilter === option.id;
              const isSecondaryActive = filters.quickFilter === 'overdue' && filters.secondaryFilter === option.id;
              return (
                <button
                  key={option.id}
                  onClick={() => handleQuickFilterChange(option.id)}
                  className={`
                    inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium 
                    border transition-all duration-150
                    ${isActive 
                      ? option.activeColor 
                      : isSecondaryActive
                        ? `${option.activeColor} ring-2 ring-red-300`
                        : `bg-white text-gray-600 border-gray-300 ${option.hoverColor}`
                    }
                  `}
                >
                  {option.icon}
                  {option.label}
                  {(isActive || isSecondaryActive) && (
                    <svg className="w-3 h-3 ml-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  )}
                </button>
              );
            })}
          </div>
        </div>
        
        {/* Active filter indicator */}
        {filterDesc && (
          <div className={`mt-2 p-2 border rounded-md ${filterDesc.color}`}>
            <p className="text-xs">
              <span className="font-medium">📋 Showing:</span>{' '}
              {filterDesc.text}
              <span className="ml-1 opacity-75">
                — {filterDesc.hint}
              </span>
            </p>
          </div>
        )}
      </div>

<div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-8 gap-2 items-end"> 
  {/* Search */}
        <div className="relative">
          <label htmlFor="accLoadIdSearch" className="block text-xs font-medium text-gray-700">
            Search Loads
          </label>
          <div className="relative mt-1">
            <input 
              type="text" 
              id="accLoadIdSearch" 
              value={searchInput} 
              onChange={handleSearchChange}
              onKeyPress={handleSearchKeyPress}
              placeholder="Load ID, VIN, Make, Model, Broker" 
              className="block w-full py-1.5 px-2 pr-8 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-xs" 
            />
            {searchInput && (
              <button
                onClick={handleSearchClear}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                title="Clear search"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
          {searchInput && (
            <p className="text-xs text-gray-500 mt-1">Searching all loads...</p>
          )}
        </div>
        
        <div>
          <label htmlFor="accDriverFilter" className="block text-xs font-medium text-gray-700">
            Driver
          </label>
          <select 
            name="driverId" 
            id="accDriverFilter" 
            value={filters.driverId} 
            onChange={handleFilterChange} 
            className="mt-1 block w-full py-1.5 px-2 border border-gray-300 bg-white rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-xs"          >
            <option value="all">All Drivers</option>
            {[...drivers]
              .sort((a, b) => {
                const aActive = a.status === 'Active';
                const bActive = b.status === 'Active';
                if (aActive && !bActive) return -1;
                if (!aActive && bActive) return 1;
                return (a.name || '').localeCompare(b.name || '');
              })
              .map(d => {
                const isInactive = d.status !== 'Active';
                return (
                  <option key={d.id} value={d.id}>
                    {d.name}{isInactive ? ` (${d.status})` : ''}
                  </option>
                );
              })}
          </select>
        </div>
        
        <div>
          <label htmlFor="accTruckFilter" className="block text-xs font-medium text-gray-700">
            Truck #
          </label>
          <select 
            name="truckId" 
            id="accTruckFilter" 
            value={filters.truckId} 
            onChange={handleFilterChange} 
            className="mt-1 block w-full py-1.5 px-2 border border-gray-300 bg-white rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-xs"          >
            <option value="all">All Trucks</option>
            {trucks.map(t => (
              <option key={t.id} value={t.id}>{t.unitNumber}</option>
            ))}
          </select>
        </div>
        
        <div>
          <label htmlFor="accStartDate" className="block text-xs font-medium text-gray-700">
            From {filters.startDate && <span className="text-gray-400 font-normal">({mainFilterRangeDisplay.start?.split(' ').pop() || 'UTC'})</span>}
          </label>
          <input 
            type="date" 
            name="startDate" 
            id="accStartDate" 
            value={filters.startDate} 
            onChange={handleFilterChange} 
            className="mt-1 block w-full py-1.5 px-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-xs" 
          />
        </div>
        <div>
          <label htmlFor="accEndDate" className="block text-xs font-medium text-gray-700">
            To {filters.endDate && <span className="text-gray-400 font-normal">({mainFilterRangeDisplay.end?.split(' ').pop() || 'UTC'})</span>}
          </label>
          <input 
            type="date" 
            name="endDate" 
            id="accEndDate" 
            value={filters.endDate} 
            onChange={handleFilterChange} 
            className="mt-1 block w-full py-1.5 px-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-xs" 
          />
        </div>
        
        <div>
          <label htmlFor="accBrokerFilter" className="block text-xs font-medium text-gray-700">
            Broker
          </label>
          <select 
            name="brokerId" 
            id="accBrokerFilter" 
            value={filters.brokerId} 
            onChange={handleFilterChange} 
            className="mt-1 block w-full py-1.5 px-2 border border-gray-300 bg-white rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-xs"          >
            <option value="all">All Brokers</option>
            {brokers.map(b => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </div>
{companies.length > 1 && (
          <div>
            <label htmlFor="accCompanyFilter" className="block text-xs font-medium text-gray-700">
              Company
            </label>
            <select 
              name="companyFilter" 
              id="accCompanyFilter" 
              value={filters.companyFilter || 'all'} 
              onChange={handleFilterChange} 
              className="mt-1 block w-full py-1.5 px-2 border border-gray-300 bg-white rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-xs"            >
              <option value="all">All Companies</option>
              {companies.map(c => (
                <option key={c.id} value={c.name}>{c.name}</option>
              ))}
            </select>
          </div>
        )}
        <div>
          <label htmlFor="accDispatcherFilter" className="block text-xs font-medium text-gray-700">
            Dispatcher
          </label>
          <select 
            name="dispatcherId" 
            id="accDispatcherFilter" 
            value={filters.dispatcherId} 
            onChange={handleFilterChange} 
            className="mt-1 block w-full py-1.5 px-2 border border-gray-300 bg-white rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-xs"          >
            <option value="all">All Dispatchers</option>
            {dispatchers.map(d => (
              <option key={d.id} value={d.id}>{d.name || d.email}</option>
            ))}
          </select>
        </div>
      </div>
      
     
    </div>
  );
}