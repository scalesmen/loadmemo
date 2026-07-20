// src/components/loads/components/EmptyDriversWidget.js
import React, { useState } from 'react';
import { formatIdleTime } from '../hooks/useEmptyDrivers';

/**
 * Widget to display drivers without active loads
 * Color coded by idle time since last delivery
 * 
 * Note: This widget receives pre-loaded data from parent component
 * Data is loaded during initial app load for better UX
 * 
 * CACHING: Data refreshes every 15 minutes to reduce database load
 * Users can manually refresh if needed
 */
export default function EmptyDriversWidget({ 
  emptyDrivers, 
  isLoading, 
  totalEmptyDrivers, 
  timeUntilRefresh,
  clearCache 
}) {
  const [isExpanded, setIsExpanded] = useState(false);

  const toggleExpanded = () => setIsExpanded(!isExpanded);

  const handleManualRefresh = () => {
    clearCache();
    // Force a re-render by toggling expanded state if needed
    if (!isExpanded) {
      setIsExpanded(true);
    }
  };

  // Don't show widget if no empty drivers (after data loads)
  if (!isLoading && totalEmptyDrivers === 0) {
    return null;
  }

  return (
    <div className="relative">
      {/* Toggle Button */}
      <button
        onClick={toggleExpanded}
        className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${
          isExpanded
            ? 'bg-orange-600 text-white hover:bg-orange-700'
            : totalEmptyDrivers > 0
            ? 'bg-orange-100 text-orange-700 hover:bg-orange-200 border border-orange-300'
            : 'bg-gray-100 text-gray-700 hover:bg-gray-200 border border-gray-300'
        }`}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="w-5 h-5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
          />
        </svg>
        {isLoading ? (
          <span className="flex items-center gap-2">
            <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-current"></div>
            Loading...
          </span>
        ) : (
          <span>
            Empty Drivers ({totalEmptyDrivers})
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className={`w-4 h-4 ml-1 inline transition-transform ${
                isExpanded ? 'rotate-180' : ''
              }`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </span>
        )}
      </button>

      {/* Dropdown Panel */}
      {isExpanded && (
        <div className="absolute top-full right-0 mt-2 w-80 bg-white rounded-lg shadow-xl border border-gray-200 z-50 max-h-96 overflow-y-auto">
          <div className="p-4">
            <div className="flex items-center justify-between mb-3 pb-2 border-b border-gray-200">
              <div>
                <h3 className="text-sm font-semibold text-gray-800">Drivers Without Loads</h3>
                {timeUntilRefresh !== null && (
                  <p className="text-xs text-gray-500 mt-0.5">
                    Refreshes in {timeUntilRefresh}m
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2">
                {/* Manual Refresh Button */}
                <button
                  onClick={handleManualRefresh}
                  className="text-gray-400 hover:text-blue-600 transition-colors"
                  title="Refresh now"
                  disabled={isLoading}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                    />
                  </svg>
                </button>
                {/* Close Button */}
                <button
                  onClick={toggleExpanded}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="w-5 h-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {isLoading ? (
              <div className="text-center py-4 text-gray-500 text-sm">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-orange-600 mx-auto"></div>
                <p className="mt-2">Loading drivers...</p>
              </div>
            ) : emptyDrivers.length === 0 ? (
              <div className="text-center py-4 text-gray-500 text-sm">
                <p>All drivers are currently assigned to loads! 🎉</p>
              </div>
            ) : (
              <div className="space-y-2">
                {emptyDrivers.map((driver) => (
                  <DriverIdleCard key={driver.id} driver={driver} />
                ))}
              </div>
            )}

            {/* Legend */}
            {!isLoading && emptyDrivers.length > 0 && (
              <div className="mt-4 pt-3 border-t border-gray-200">
                <p className="text-xs text-gray-500 mb-2">Idle Time Legend:</p>
                <div className="flex flex-wrap gap-2 text-xs">
                  <div className="flex items-center gap-1">
                    <span className="w-3 h-3 bg-red-500 rounded-full"></span>
                    <span className="text-gray-600">4+ hours</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="w-3 h-3 bg-orange-500 rounded-full"></span>
                    <span className="text-gray-600">2-4 hours</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="w-3 h-3 bg-yellow-500 rounded-full"></span>
                    <span className="text-gray-600">1-2 hours</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="w-3 h-3 bg-green-500 rounded-full"></span>
                    <span className="text-gray-600">&lt; 1 hour</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Individual driver card showing idle time
 * Now supports 4 color codes: green, yellow, orange, red
 */
function DriverIdleCard({ driver }) {
  const colorClasses = {
    red: 'bg-red-50 border-red-200 text-red-800',
    orange: 'bg-orange-50 border-orange-200 text-orange-800',
    yellow: 'bg-yellow-50 border-yellow-200 text-yellow-800',
    green: 'bg-green-50 border-green-200 text-green-800'
  };

  const dotColors = {
    red: 'bg-red-500',
    orange: 'bg-orange-500',
    yellow: 'bg-yellow-500',
    green: 'bg-green-500'
  };

  return (
    <div
      className={`flex items-center gap-2 p-3 rounded-lg border ${
        colorClasses[driver.colorCode]
      }`}
    >
      <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${dotColors[driver.colorCode]}`}></span>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm truncate">{driver.name}</p>
        <p className="text-xs opacity-75">
          Idle: {formatIdleTime(driver.idleHours, driver.idleMinutes)}
        </p>
      </div>
    </div>
  );
}