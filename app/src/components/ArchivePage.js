// src/components/ArchivePage.js

import React, { useState } from 'react';
import { useArchiveData } from './archive/hooks/useArchiveData';
import { formatTimestampInAppZone } from './accounting/utils/dateFormatters';
import { useTimezone } from '../contexts/TimezoneContext';

// ============================================================================
// LOADING COMPONENTS
// ============================================================================

const AppLoader = ({ message = "Loading..." }) => (
  <div className="flex items-center justify-center min-h-screen bg-gray-50">
    <div className="text-center">
      <div className="relative w-24 h-24 mx-auto mb-6">
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-16 h-16 bg-blue-600 rounded-lg flex items-center justify-center">
            <svg className="w-10 h-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
            </svg>
          </div>
        </div>
        <div className="absolute inset-0 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
      </div>
      <p className="text-lg font-medium text-gray-700">{message}</p>
      <p className="text-sm text-gray-500 mt-2">Please wait...</p>
    </div>
  </div>
);

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function ArchivePage() {
  const {
    loggedInUser,
    isAuthLoading,
    hasAccess,
    drivers,
    trucks,
    brokers,
    dispatchers,
    archivedLoads,
    isLoadingLoads,
    error,
    hasMore,
    isFetchingMore,
    filters,
    setFilters,
    loadMoreArchivedLoads,
    handleRestoreLoad,
    handlePermanentDelete,
    handleBulkPermanentDelete,
    handleCleanOldArchives,
    getDaysUntilDeletion
  } = useArchiveData();

  const { applicationTimeZone, isLoadingTimeZone } = useTimezone();

  // Checkbox selection state
  const [selectedLoads, setSelectedLoads] = useState(new Set());
  const [isAllSelected, setIsAllSelected] = useState(false);

  // ============================================================================
  // CHECKBOX HANDLERS
  // ============================================================================

  const handleSelectAll = () => {
    if (isAllSelected) {
      setSelectedLoads(new Set());
      setIsAllSelected(false);
    } else {
      const allLoadIds = new Set(archivedLoads.map(load => load.docId));
      setSelectedLoads(allLoadIds);
      setIsAllSelected(true);
    }
  };

  const handleSelectLoad = (loadDocId) => {
    const newSelected = new Set(selectedLoads);
    if (newSelected.has(loadDocId)) {
      newSelected.delete(loadDocId);
    } else {
      newSelected.add(loadDocId);
    }
    setSelectedLoads(newSelected);
    setIsAllSelected(newSelected.size === archivedLoads.length && archivedLoads.length > 0);
  };

  const handleBulkDelete = async () => {
    if (selectedLoads.size === 0) {
      alert('Please select at least one load to delete.');
      return;
    }

    const loadIds = archivedLoads
      .filter(load => selectedLoads.has(load.docId))
      .map(load => load.load_id)
      .join(', ');

    if (!window.confirm(
      `⚠️ PERMANENT DELETE WARNING ⚠️\n\n` +
      `Are you sure you want to PERMANENTLY DELETE ${selectedLoads.size} load(s)?\n\n` +
      `Load IDs: ${loadIds}\n\n` +
      `This action CANNOT be undone!\n` +
      `Drivers will be unassigned from these loads.`
    )) {
      return;
    }

    try {
      await handleBulkPermanentDelete(Array.from(selectedLoads));
      setSelectedLoads(new Set());
      setIsAllSelected(false);
      alert(`Successfully deleted ${selectedLoads.size} load(s).\n\nDrivers have been unassigned.`);
    } catch (err) {
      console.error('Error bulk deleting loads:', err);
      alert('Failed to delete loads: ' + err.message);
    }
  };

  // ============================================================================
  // HELPER FUNCTIONS
  // ============================================================================

  const getDriverName = (driverId) => {
    return drivers.find(d => d.id === driverId)?.name || 'N/A';
  };

  const getTruckNumber = (truckId) => {
    return trucks.find(t => t.id === truckId)?.unitNumber || 'N/A';
  };

  const getBrokerName = (load) => {
    return brokers.find(b => b.id === load.brokerId)?.name || load.brokerName || 'N/A';
  };

  const getDispatcherName = (dispatcherId) => {
    const dispatcher = dispatchers.find(d => d.id === dispatcherId);
    return dispatcher ? (dispatcher.name || dispatcher.email) : 'N/A';
  };

  const getArchivedByName = (archivedByEmail) => {
    return archivedByEmail || 'System';
  };

  // ============================================================================
  // RENDER LOGIC
  // ============================================================================

  if (isAuthLoading || isLoadingTimeZone) {
    return <AppLoader message="Loading archive..." />;
  }

  if (!loggedInUser) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center p-8 bg-white rounded-lg shadow-md">
          <svg className="w-16 h-16 text-gray-400 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
          <p className="text-gray-600 text-lg">Please log in to view archived loads.</p>
        </div>
      </div>
    );
  }

  if (!hasAccess) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center p-8 bg-red-50 rounded-lg shadow-md border-2 border-red-200">
          <svg className="w-16 h-16 text-red-500 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <h3 className="text-xl font-semibold text-red-800 mb-2">Access Denied</h3>
          <p className="text-red-700">You don't have permission to access the archive.</p>
          <p className="text-sm text-red-600 mt-2">Role: {loggedInUser?.role || 'Unknown'}</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="max-w-md w-full p-8 bg-red-50 rounded-lg shadow-md border-2 border-red-200">
          <div className="flex items-start gap-3">
            <svg className="w-6 h-6 text-red-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <h3 className="text-lg font-semibold text-red-800 mb-2">Error Loading Archive</h3>
              <p className="text-red-700 text-sm">{error}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ============================================================================
  // MAIN PAGE CONTENT
  // ============================================================================

  return (
    <div className="max-w-full mx-auto py-4 px-1 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="mb-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-800">Archived Loads</h2>
            <p className="text-sm text-gray-500 mt-1">
              Loads are automatically deleted 30 days after archiving
            </p>
            {selectedLoads.size > 0 && (
              <p className="text-sm text-blue-600 font-medium mt-1">
                {selectedLoads.size} load(s) selected
              </p>
            )}
          </div>
          
          <div className="flex gap-3">
            <button
              onClick={handleBulkDelete}
              disabled={selectedLoads.size === 0}
              className={`${
                selectedLoads.size === 0
                  ? 'bg-gray-300 cursor-not-allowed'
                  : 'bg-red-600 hover:bg-red-700'
              } text-white font-medium py-2 px-4 rounded-md text-sm flex items-center shadow-sm transition-colors`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              Delete Selected
            </button>
            
            <button
              onClick={handleCleanOldArchives}
              className="bg-orange-500 hover:bg-orange-600 text-white font-medium py-2 px-4 rounded-md text-sm flex items-center shadow-sm transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              Clean Old (30+ days)
            </button>
          </div>
        </div>
      </div>

      {/* Info Banner */}
      <div className="mb-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <svg className="w-6 h-6 text-blue-600 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div className="text-sm text-blue-800">
            <p className="font-medium mb-1">About Archived Loads:</p>
            <ul className="list-disc list-inside space-y-1">
              <li>Archived loads are hidden from all regular views</li>
              <li>Loads can be restored within 30 days</li>
              <li>After 30 days, loads are permanently deleted automatically</li>
              <li>Use "Delete Selected" to remove multiple loads at once</li>
              <li>Use "Clean Old Archives" to manually delete loads older than 30 days</li>
              <li>Drivers are unassigned when loads are permanently deleted</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="mb-6 bg-white rounded-lg shadow-sm p-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Search by Load ID</label>
            <input
              type="text"
              placeholder="Enter Load ID"
              value={filters.loadIdSearch}
              onChange={(e) => setFilters(prev => ({ ...prev, loadIdSearch: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Driver</label>
            <select
              value={filters.driverId}
              onChange={(e) => setFilters(prev => ({ ...prev, driverId: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Drivers</option>
              {drivers.map(d => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Dispatcher</label>
            <select
              value={filters.dispatcherId}
              onChange={(e) => setFilters(prev => ({ ...prev, dispatcherId: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Dispatchers</option>
              {dispatchers.map(d => (
                <option key={d.id} value={d.id}>{d.name || d.email}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Loading State */}
      {isLoadingLoads ? (
        <div className="p-8 bg-white rounded-lg shadow text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-500">Loading archived loads...</p>
        </div>
      ) : archivedLoads.length === 0 ? (
        <div className="p-8 bg-white rounded-lg shadow text-center">
          <svg className="w-16 h-16 text-gray-400 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
          </svg>
          <p className="text-gray-500 text-lg">No archived loads found</p>
          <p className="text-gray-400 text-sm mt-2">Archived loads will appear here</p>
        </div>
      ) : (
        <>
          {/* Table */}
          <div className="overflow-x-auto bg-white shadow-lg rounded-lg">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-100 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-center">
                    <input
                      type="checkbox"
                      checked={isAllSelected}
                      onChange={handleSelectAll}
                      className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                    />
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Load ID</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase hidden md:table-cell">Driver</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase hidden md:table-cell">Truck</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase hidden lg:table-cell">Broker</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase hidden lg:table-cell">Dispatcher</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Archived Date</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase hidden sm:table-cell">Archived By</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Days Left</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {archivedLoads.map(load => {
                  const deletionInfo = getDaysUntilDeletion(load.archivedAt);
                  const isExpiringSoon = deletionInfo && deletionInfo.daysRemaining <= 7;
                  const isSelected = selectedLoads.has(load.docId);
                  
                  return (
                    <tr 
                      key={load.docId} 
                      className={`transition ${isSelected ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
                    >
                      <td className="px-4 py-3 text-center">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleSelectLoad(load.docId)}
                          className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                        />
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap font-medium text-blue-700">
                        {load.load_id}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="px-2 py-1 text-xs font-medium rounded-full bg-gray-100 text-gray-700">
                          {load.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-gray-600 hidden md:table-cell">
                        {getDriverName(load.driverId)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-gray-600 hidden md:table-cell">
                        {getTruckNumber(load.truckId)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-gray-600 hidden lg:table-cell">
                        {getBrokerName(load)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-gray-600 hidden lg:table-cell">
                        {getDispatcherName(load.dispatcherId)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-gray-600">
                        {formatTimestampInAppZone(load.archivedAt, applicationTimeZone)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-gray-600 hidden sm:table-cell">
                        {getArchivedByName(load.archivedByEmail)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {deletionInfo ? (
                          <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                            isExpiringSoon 
                              ? 'bg-red-100 text-red-800' 
                              : 'bg-yellow-100 text-yellow-800'
                          }`}>
                            {deletionInfo.daysRemaining} days
                          </span>
                        ) : (
                          <span className="text-gray-400">N/A</span>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleRestoreLoad(load.docId, load.load_id)}
                            className="text-green-600 hover:text-green-800 text-xs font-medium px-2 py-1 rounded hover:bg-green-50"
                            title="Restore this load"
                          >
                            Restore
                          </button>
                          <button
                            onClick={() => handlePermanentDelete(load.docId, load.load_id)}
                            className="text-red-600 hover:text-red-800 text-xs font-medium px-2 py-1 rounded hover:bg-red-50"
                            title="Permanently delete this load"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Load More Button */}
          {hasMore && (
            <div className="mt-6 flex justify-center">
              <button
                onClick={loadMoreArchivedLoads}
                className="bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium py-3 px-6 rounded-lg border border-gray-300 transition-colors flex items-center gap-2"
                disabled={isFetchingMore}
              >
                {isFetchingMore ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-600"></div>
                    Loading...
                  </>
                ) : (
                  <>
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                    Load More
                  </>
                )}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}