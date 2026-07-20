// src/components/liveload/components/LiveLoadFilters.js
// Filters component for LiveLoad list

import React, { useState } from 'react';
import { DISTANCE_FILTERS, EXPIRATION_FILTERS } from '../utils/liveLoadConstants';

const FilterIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
  </svg>
);

const XIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
  </svg>
);

const ChevronDownIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
  </svg>
);

const LocationPinIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
);

const DollarIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

const ClockIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

export default function LiveLoadFilters({
  filters,
  onFilterChange,
  onClearFilters,
  hasActiveFilters,
  userLocation
}) {
  const [isExpanded, setIsExpanded] = useState(false);

  // Count active filters
  const activeFilterCount = [
    filters.distance !== 'all',
    filters.expiration !== 'all',
    filters.minPrice,
    filters.maxPrice
  ].filter(Boolean).length;

  return (
    <div className="bg-white border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Mobile Filter Toggle */}
        <div className="md:hidden py-3">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex items-center justify-between w-full px-4 py-2 bg-gray-50 rounded-lg"
          >
            <div className="flex items-center gap-2">
              <FilterIcon />
              <span className="font-medium text-gray-700">Filters</span>
              {activeFilterCount > 0 && (
                <span className="bg-orange-500 text-white text-xs rounded-full px-2 py-0.5">
                  {activeFilterCount}
                </span>
              )}
            </div>
            <ChevronDownIcon />
          </button>
        </div>

        {/* Desktop Filters / Mobile Expanded */}
        <div className={`${isExpanded ? 'block' : 'hidden'} md:block py-3`}>
          <div className="flex flex-wrap items-center gap-3">
            {/* Distance Filter */}
            <div className="relative">
              <div className="flex items-center gap-1.5 text-sm text-gray-500 mb-1">
                <LocationPinIcon />
                <span>Distance</span>
              </div>
              <select
                value={filters.distance}
                onChange={(e) => onFilterChange('distance', e.target.value)}
                disabled={!userLocation}
                className={`appearance-none bg-white border rounded-lg px-3 py-2 pr-8 text-sm focus:ring-2 focus:ring-orange-500 focus:border-orange-500 min-w-[140px] ${
                  !userLocation ? 'bg-gray-100 cursor-not-allowed' : 'border-gray-300'
                } ${filters.distance !== 'all' ? 'border-orange-500 bg-orange-50' : ''}`}
              >
                {DISTANCE_FILTERS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
              {!userLocation && (
                <div className="text-xs text-gray-400 mt-1">
                  Enable location for distance filter
                </div>
              )}
            </div>

            {/* Expiration Filter */}
            <div className="relative">
              <div className="flex items-center gap-1.5 text-sm text-gray-500 mb-1">
                <ClockIcon />
                <span>Expires</span>
              </div>
              <select
                value={filters.expiration}
                onChange={(e) => onFilterChange('expiration', e.target.value)}
                className={`appearance-none bg-white border rounded-lg px-3 py-2 pr-8 text-sm focus:ring-2 focus:ring-orange-500 focus:border-orange-500 min-w-[140px] ${
                  filters.expiration !== 'all' ? 'border-orange-500 bg-orange-50' : 'border-gray-300'
                }`}
              >
                {EXPIRATION_FILTERS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>

            {/* Price Range */}
            <div className="relative">
              <div className="flex items-center gap-1.5 text-sm text-gray-500 mb-1">
                <DollarIcon />
                <span>Price</span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  placeholder="Min"
                  value={filters.minPrice}
                  onChange={(e) => onFilterChange('minPrice', e.target.value)}
                  className={`w-20 px-2 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-orange-500 focus:border-orange-500 ${
                    filters.minPrice ? 'border-orange-500 bg-orange-50' : 'border-gray-300'
                  }`}
                />
                <span className="text-gray-400">-</span>
                <input
                  type="number"
                  placeholder="Max"
                  value={filters.maxPrice}
                  onChange={(e) => onFilterChange('maxPrice', e.target.value)}
                  className={`w-20 px-2 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-orange-500 focus:border-orange-500 ${
                    filters.maxPrice ? 'border-orange-500 bg-orange-50' : 'border-gray-300'
                  }`}
                />
              </div>
            </div>

            {/* Clear Filters Button */}
            {hasActiveFilters && (
              <div className="ml-auto">
                <button
                  onClick={onClearFilters}
                  className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <XIcon />
                  Clear Filters
                </button>
              </div>
            )}
          </div>

          {/* Active Filter Pills */}
          {hasActiveFilters && (
            <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t border-gray-100">
              <span className="text-xs text-gray-500">Active:</span>
              
              {filters.distance !== 'all' && (
                <span className="inline-flex items-center gap-1 px-2 py-1 bg-orange-100 text-orange-800 text-xs rounded-full">
                  {DISTANCE_FILTERS.find(d => d.value.toString() === filters.distance)?.label}
                  <button
                    onClick={() => onFilterChange('distance', 'all')}
                    className="hover:text-orange-900"
                  >
                    <XIcon />
                  </button>
                </span>
              )}
              
              {filters.expiration !== 'all' && (
                <span className="inline-flex items-center gap-1 px-2 py-1 bg-orange-100 text-orange-800 text-xs rounded-full">
                  {EXPIRATION_FILTERS.find(e => e.value === filters.expiration)?.label}
                  <button
                    onClick={() => onFilterChange('expiration', 'all')}
                    className="hover:text-orange-900"
                  >
                    <XIcon />
                  </button>
                </span>
              )}
              
              {(filters.minPrice || filters.maxPrice) && (
                <span className="inline-flex items-center gap-1 px-2 py-1 bg-orange-100 text-orange-800 text-xs rounded-full">
                  ${filters.minPrice || '0'} - ${filters.maxPrice || '∞'}
                  <button
                    onClick={() => {
                      onFilterChange('minPrice', '');
                      onFilterChange('maxPrice', '');
                    }}
                    className="hover:text-orange-900"
                  >
                    <XIcon />
                  </button>
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
