// src/components/loads/components/LoadsFilters/index.js
import React, { useState, useEffect } from 'react';
import { LOAD_STATUSES } from '../../utils/constants';

const LoadsFilters = ({ 
  filters, 
  onFilterChange, 
  drivers = [], 
  trucks = [], 
  brokers = [], 
  dispatchers = [],
  canSeeDispatcherFilter = false 
}) => {
  // Local state for debounced search
  const [searchInput, setSearchInput] = useState(filters?.searchLoadId || '');

  // Sync if filters reset externally
  useEffect(() => {
    setSearchInput(filters?.searchLoadId || '');
  }, [filters?.searchLoadId]);

  // Debounce: update parent after 400ms of no typing
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchInput !== (filters?.searchLoadId || '')) {
        onFilterChange({
          target: { name: 'searchLoadId', value: searchInput }
        });
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Early return after hooks
  if (!filters) {
    console.warn('LoadsFilters: filters prop is undefined');
    return null;
  }

  return (
    <div className="bg-white p-4 rounded-lg shadow mb-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 items-end">
        {/* Search - Now searches multiple fields */}
        <div>
          <label className="block text-xs font-medium text-gray-700">Search</label>
          <div className="relative">
            <input 
              type="text" 
              name="searchLoadId" 
              value={searchInput} 
              onChange={(e) => setSearchInput(e.target.value)} 
              placeholder="Load ID, VIN, location..."
              className="mt-1 border rounded-md py-2 px-3 pr-8 text-sm w-full focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
            {searchInput && (
              <button
                type="button"
                onClick={() => setSearchInput('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 mt-0.5 text-gray-400 hover:text-gray-600"
                title="Clear search"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
          <p className="text-xs text-gray-400 mt-1">ID, VIN, make, model, city</p>
        </div>

        {/* Driver Filter */}
        <div>
          <label className="block text-xs font-medium text-gray-700">Driver</label>
          <select 
            name="driverId" 
            value={filters.driverId || 'all'} 
            onChange={onFilterChange} 
            className="mt-1 border rounded-md py-2 px-3 text-sm w-full"
          >
            <option value="all">All Drivers</option>
            {drivers.map(d => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </div>

        {/* Truck Filter */}
        <div>
          <label className="block text-xs font-medium text-gray-700">Truck</label>
          <select 
            name="truckId" 
            value={filters.truckId || 'all'} 
            onChange={onFilterChange} 
            className="mt-1 border rounded-md py-2 px-3 text-sm w-full"
          >
            <option value="all">All Trucks</option>
            {trucks.map(t => (
              <option key={t.id} value={t.id}>{t.unitNumber}</option>
            ))}
          </select>
        </div>

        {/* Status Filter */}
        <div>
          <label className="block text-xs font-medium text-gray-700">Status</label>
          <select 
            name="status" 
            value={filters.status || 'all'} 
            onChange={onFilterChange} 
            className="mt-1 border rounded-md py-2 px-3 text-sm w-full"
          >
            <option value="all">All Current</option>
            {LOAD_STATUSES.map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>

        {/* Broker Filter */}
        <div>
          <label className="block text-xs font-medium text-gray-700">Broker</label>
          <select 
            name="brokerId" 
            value={filters.brokerId || 'all'} 
            onChange={onFilterChange} 
            className="mt-1 border rounded-md py-2 px-3 text-sm w-full"
          >
            <option value="all">All Brokers</option>
            {brokers.map(b => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </div>

        {/* Dispatcher Filter (Admin only) */}
        {canSeeDispatcherFilter && (
          <div>
            <label className="block text-xs font-medium text-gray-700">Dispatcher</label>
            <select 
              name="dispatcherId" 
              value={filters.dispatcherId || 'all'} 
              onChange={onFilterChange} 
              className="mt-1 border rounded-md py-2 px-3 text-sm w-full"
            >
              <option value="all">All Dispatchers</option>
              {dispatchers.map(d => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Checkbox Filters */}
      <div className="mt-4 pt-4 border-t border-gray-200 flex flex-wrap gap-6">
        {/* Show Completed Loads Checkbox */}
        <label className="flex items-center cursor-pointer">
          <input
            type="checkbox"
            name="showCompleted"
            checked={filters.showCompleted || false}
            onChange={(e) => {
              onFilterChange({
                target: {
                  name: 'showCompleted',
                  type: 'checkbox',
                  checked: e.target.checked
                }
              });
            }}
            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded cursor-pointer"
          />
          <span className="ml-2 text-sm text-gray-700">
            Show Delivered & Cancelled loads
          </span>
        </label>

        {/* Show Unassigned Loads Only Checkbox */}
        <label className="flex items-center cursor-pointer">
          <input
            type="checkbox"
            name="showUnassignedOnly"
            checked={filters.showUnassignedOnly || false}
            onChange={(e) => {
              onFilterChange({
                target: {
                  name: 'showUnassignedOnly',
                  type: 'checkbox',
                  checked: e.target.checked
                }
              });
            }}
            className="h-4 w-4 text-orange-600 focus:ring-orange-500 border-gray-300 rounded cursor-pointer"
          />
          <span className="ml-2 text-sm text-gray-700">
            Show Unassigned loads only
          </span>
        </label>

        {filters.showCompleted && (
          <div className="flex items-center gap-1.5 bg-orange-50 border border-orange-200 px-3 py-1.5 rounded-md">
            <svg className="w-4 h-4 text-orange-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-xs text-orange-700">
              Showing recent 500 only. For older loads use <span className="font-semibold">Accounting</span> page.
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

export default LoadsFilters;