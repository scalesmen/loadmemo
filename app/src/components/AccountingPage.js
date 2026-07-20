// src/components/AccountingPage.js
// COMPLETE VERSION WITH ADMIN NOTE + EMAIL INVOICE

import React, { useState, lazy, Suspense } from 'react';
import { Timestamp, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import AccountingSummaryStats from './accounting/components/AccountingSummaryStats';


// Hooks
import { 
  useAccountingData, 
  useAccountingFilters, 
  useLoadPagination 
} from './accounting/hooks';

// Archive Hook
import { useArchiveData } from './archive/hooks/useArchiveData';

// Components
import {
  AccountingHeader,
  AccountingFilters,
  AccountingTable,
  LoadMoreButton
} from './accounting/components';

// Shared Components
import LoadingSpinner from './shared/LoadingSpinner';
import ErrorMessage from './shared/ErrorMessage';
import AccessDenied from './shared/AccessDenied';
import EmptyState from './shared/EmptyState';

// Services
import { 
  updateLoadPayTerms,
  updateLoadPaymentMethod,
  updateLoadPaymentStatus,
  deleteLoad as archiveLoadService,
  saveAccountingNote,
  markLoadAsInvoiced,
  emailInvoiceToBoker
} from './accounting/services/accountingService';

import {
  bulkArchiveLoads
} from './archive/services/archiveService';

import { 
  logPaymentTermsUpdate,
  logLoadArchive,
  logBulkArchive,
  logAudit
} from './accounting/services/auditService';

// Utils
import { formatForDateTimeLocal, convertToUTCTimestamp, formatTimestampInAppZone } from './accounting/utils/dateFormatters';
import { useTimezone } from '../contexts/TimezoneContext';

// Lazy loaded Modals
const LoadEditModal = lazy(() => import('./accounting/modals/LoadEditModal'));

// Lazy loaded PDF Generators
const LazyPDFGenerators = {
  generateBOLPdf: () => import('./accounting/utils/generateBOLPdf').then(module => module.generateBOLPdf),
  generateInvoicePdf: () => import('./accounting/utils/generateInvoicePdf').then(module => module.generateInvoicePdf)
};

// ============================================================================
// IMPROVED LOADING COMPONENTS
// ============================================================================


const AppLoader = ({ message = "Loading..." }) => (
  <div className="max-w-full mx-auto py-4 px-1 sm:px-6 lg:px-8 bg-gray-50 min-h-screen">
    <style>{`
      @keyframes slideIn {
        from { opacity: 0; transform: translateY(8px); }
        to { opacity: 1; transform: translateY(0); }
      }
      .skeleton-row {
        opacity: 0;
        animation: slideIn 0.3s ease-out forwards;
      }
    `}</style>

    {/* Skeleton Header */}
    <div className="mb-6 skeleton-row" style={{animationDelay: '0ms'}}>
      <div className="flex justify-between items-center">
        <div>
          <div className="h-8 w-56 bg-gray-200 rounded animate-pulse"></div>
          <div className="h-3 w-72 bg-gray-200 rounded animate-pulse mt-2"></div>
        </div>
      </div>
    </div>

    {/* Skeleton Tabs */}
    <div className="mb-6 skeleton-row" style={{animationDelay: '80ms'}}>
      <div className="border-b border-gray-200 flex gap-8">
        <div className="h-4 w-24 bg-blue-200 rounded animate-pulse mb-3"></div>
        <div className="h-4 w-20 bg-gray-200 rounded animate-pulse mb-3"></div>
      </div>
    </div>

    {/* Skeleton Filters */}
    <div className="bg-white p-4 rounded-lg shadow mb-6 skeleton-row" style={{animationDelay: '160ms'}}>
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        {[1,2,3,4,5,6].map(i => (
          <div key={i}>
            <div className="h-3 w-16 bg-gray-200 rounded animate-pulse mb-2"></div>
            <div className="h-9 bg-gray-100 rounded animate-pulse"></div>
          </div>
        ))}
      </div>
      <div className="flex gap-3 mt-4 pt-4 border-t border-gray-200">
        {[1,2,3,4,5].map(i => (
          <div key={i} className="h-8 w-24 bg-gray-100 rounded-full animate-pulse"></div>
        ))}
      </div>
    </div>

    {/* Skeleton Table */}
    <div className="bg-white shadow-lg rounded-lg overflow-hidden">
      {/* Table Header */}
      <div className="bg-gray-100 border-b border-gray-200 px-4 py-3 flex gap-4 skeleton-row" style={{animationDelay: '240ms'}}>
        {[20, 70, 60, 50, 90, 90, 60, 50, 60, 50].map((w, i) => (
          <div key={i} className="h-3 bg-gray-300 rounded animate-pulse" style={{width: w}}></div>
        ))}
      </div>
      
      {/* Table Rows - staggered */}
      {[1,2,3,4,5,6,7,8,9,10,11,12,13,14].map(row => (
        <div 
          key={row} 
          className="px-4 py-4 border-b border-gray-100 flex gap-4 items-center skeleton-row"
          style={{animationDelay: `${240 + row * 120}ms`}}
        >
          <div className="h-4 w-4 bg-gray-200 rounded animate-pulse"></div>
          <div className="h-4 w-20 bg-blue-100 rounded animate-pulse"></div>
          <div className="h-5 w-20 bg-green-100 rounded-full animate-pulse"></div>
          <div className="h-4 w-16 bg-green-100 rounded animate-pulse"></div>
          <div className="flex-1">
            <div className="h-3 w-28 bg-gray-200 rounded animate-pulse mb-1"></div>
            <div className="h-3 w-40 bg-gray-100 rounded animate-pulse"></div>
          </div>
          <div className="flex-1">
            <div className="h-3 w-24 bg-gray-200 rounded animate-pulse mb-1"></div>
            <div className="h-3 w-36 bg-gray-100 rounded animate-pulse"></div>
          </div>
          <div className="h-4 w-20 bg-gray-200 rounded animate-pulse"></div>
          <div className="h-5 w-16 bg-yellow-100 rounded-full animate-pulse"></div>
          <div className="h-4 w-14 bg-gray-200 rounded animate-pulse"></div>
          <div className="flex gap-1">
            <div className="h-7 w-14 bg-gray-200 rounded animate-pulse"></div>
            <div className="h-7 w-14 bg-gray-200 rounded animate-pulse"></div>
          </div>
        </div>
      ))}
    </div>

    {/* Loading indicator */}
    <div className="mt-4 flex items-center justify-center gap-2 text-sm text-gray-500 skeleton-row" style={{animationDelay: '2000ms'}}>
      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
      <span>{message}</span>
    </div>
  </div>
);

const ComponentLoader = () => (
  <div className="flex items-center justify-center p-4">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
  </div>
);

// ============================================================================
// ARCHIVE TAB COMPONENT (with bulk delete)
// ============================================================================

const ArchiveTab = ({ 
  loggedInUser, 
  drivers, 
  trucks, 
  brokers, 
  dispatchers,
  applicationTimeZone 
}) => {
  const {
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

  // Checkbox selection state
  const [selectedLoads, setSelectedLoads] = useState(new Set());
  const [isAllSelected, setIsAllSelected] = useState(false);

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
      `This action CANNOT be undone!`
    )) {
      return;
    }

    try {
      await handleBulkPermanentDelete(Array.from(selectedLoads));
      setSelectedLoads(new Set());
      setIsAllSelected(false);
      alert(`Successfully deleted ${selectedLoads.size} load(s).`);
    } catch (err) {
      console.error('Error bulk deleting loads:', err);
      alert('Failed to delete loads: ' + err.message);
    }
  };

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

  if (error) {
    return (
      <div className="p-8 bg-red-50 rounded-lg border border-red-200">
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
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with bulk actions */}
      <div className="flex justify-between items-center">
        <div>
          {selectedLoads.size > 0 && (
            <p className="text-sm text-blue-600 font-medium">
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
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            Delete Selected
          </button>
          
          <button
            onClick={handleCleanOldArchives}
            className="bg-orange-500 hover:bg-orange-600 text-white font-medium py-2 px-4 rounded-md text-sm flex items-center shadow-sm transition-colors whitespace-nowrap"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            Clean Old (30+ days)
          </button>
        </div>
      </div>

      {/* Info Banner */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <svg className="w-6 h-6 text-blue-600 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div className="text-sm text-blue-800 flex-1">
            <p className="font-medium mb-1">About Archived Loads:</p>
            <ul className="list-disc list-inside space-y-1">
              <li>Archived loads are hidden from all regular views</li>
              <li>Loads can be restored within 30 days</li>
              <li>After 30 days, loads are permanently deleted automatically</li>
              <li>Drivers are automatically unassigned when loads are archived</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow-sm p-4">
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
            <div className="flex justify-center">
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
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function AccountingPage() {
  const [activeTab, setActiveTab] = useState('accounting');

  const {
    loggedInUser,
    isAuthLoading,
    canAmendAccounting,
    canHardDelete,
    hasAccess,
    drivers,
    trucks,
    brokers,
    dispatchers,
    companies,
    isLoadingDropdowns
  } = useAccountingData();

  const {
    filters,
    handleFilterChange,
    handleQuickFilterChange,
    mainFilterRangeDisplay,
    applicationTimeZone,
    isLoadingTimeZone
  } = useAccountingFilters();

 const {
    accountingLoads,
    rawLoadCount,
    isDataLoading,
    error,
    hasMore,
    isFetchingMore,
    handleLoadMore,
    updateLoadInList,
    removeLoadFromList,
    isQuickFilterActive
  } = useLoadPagination(
    filters,
    loggedInUser,
    applicationTimeZone,
    isLoadingTimeZone,
    isAuthLoading,
    brokers
  );

  const [selectedLoads, setSelectedLoads] = useState(new Set());
  const [isAllSelected, setIsAllSelected] = useState(false);
  const [showStats, setShowStats] = useState(false);

  const isInitialLoading = 
    isAuthLoading || 
    isLoadingTimeZone || 
    !applicationTimeZone ||
    (loggedInUser && hasAccess && (isLoadingDropdowns || isDataLoading) && accountingLoads.length === 0 && !filters.loadIdSearch && filters.quickFilter === 'all');

  const getLoadingMessage = () => {
    if (isAuthLoading) return "Authenticating...";
    if (isLoadingTimeZone || !applicationTimeZone) return "Setting up timezone...";
    if (isDataLoading && accountingLoads.length === 0) return "Loading accounting data...";
    return "Loading...";
  };

  const [showLoadEditModal, setShowLoadEditModal] = useState(false);
  const [editingLoad, setEditingLoad] = useState(null);
  const [loadForm, setLoadForm] = useState({});

  // ============================================================================
  // HANDLERS
  // ============================================================================

  const handleSelectAll = () => {
    if (isAllSelected) {
      setSelectedLoads(new Set());
      setIsAllSelected(false);
    } else {
      const allLoadIds = new Set(accountingLoads.map(load => load.docId));
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
    setIsAllSelected(newSelected.size === accountingLoads.length && accountingLoads.length > 0);
  };

  const handleBulkArchive = async () => {
    if (!canHardDelete) {
      alert("You do not have permission to archive loads.");
      return;
    }

    if (selectedLoads.size === 0) {
      alert('Please select at least one load to archive.');
      return;
    }

    const loadIds = accountingLoads
      .filter(load => selectedLoads.has(load.docId))
      .map(load => load.load_id)
      .join(', ');

    if (!window.confirm(
      `Are you sure you want to ARCHIVE ${selectedLoads.size} load(s)?\n\n` +
      `Load IDs: ${loadIds}\n\n` +
      `These loads will be moved to the archive and permanently deleted after 30 days.`
    )) {
      return;
    }

    try {
      await bulkArchiveLoads(
        Array.from(selectedLoads),
        loggedInUser.uid,
        loggedInUser.email,
        loggedInUser.tenantId
      );

      selectedLoads.forEach(loadDocId => {
        removeLoadFromList(loadDocId);
      });

      await logBulkArchive({
        user: loggedInUser,
        loadCount: selectedLoads.size
      });

      setSelectedLoads(new Set());
      setIsAllSelected(false);

      alert(
        `Successfully archived ${selectedLoads.size} load(s).\n\n` +
        `They will be permanently deleted in 30 days.\n` +
        `You can restore them from the Archive tab before then.`
      );
    } catch (err) {
      console.error('Error bulk archiving loads:', err);
      alert('Failed to archive loads: ' + err.message);
    }
  };

  const handleOpenEditModal = (load) => {
    if (!canAmendAccounting) {
      alert("You do not have permission to edit accounting data.");
      return;
    }
    
    setEditingLoad(load);
    const formattedLoad = { ...load };

    formattedLoad.pickupDateTime = formatForDateTimeLocal(
      load.pickupDateTime, 
      applicationTimeZone, 
      isLoadingTimeZone
    );
    formattedLoad.deliveryDateTime = formatForDateTimeLocal(
      load.deliveryDateTime, 
      applicationTimeZone, 
      isLoadingTimeZone
    );

    if (!formattedLoad.companyName) {
      const driver = drivers.find(d => d.id === load.driverId);
      if (driver?.assignedCompanyName) {
        formattedLoad.companyName = driver.assignedCompanyName;
      } else {
        formattedLoad.companyName = '';
      }
    }
    
    setLoadForm(formattedLoad);
    setShowLoadEditModal(true);
  };

  const handleCloseEditModal = () => {
    setShowLoadEditModal(false);
    setEditingLoad(null);
    setLoadForm({});
  };

  const handlePayTermsChange = async (loadDocId, newPayTerms) => {
    if (!canAmendAccounting) return;
    
    try {
      await updateLoadPayTerms(loadDocId, newPayTerms);
      updateLoadInList(loadDocId, { paymentTerms: newPayTerms });
      await logPaymentTermsUpdate({
        user: loggedInUser,
        loadDocId,
        newPayTerms
      });
    } catch (err) {
      console.error("Error updating payment terms:", err);
      alert("Failed to update payment terms: " + err.message);
    }
  };

  const handlePaymentMethodChange = async (loadDocId, newPaymentMethod) => {
    if (!canAmendAccounting) return;
    
    try {
      await updateLoadPaymentMethod(loadDocId, newPaymentMethod);
      updateLoadInList(loadDocId, { paymentMethod: newPaymentMethod });
      await logAudit({
        userId: loggedInUser.uid,
        userEmail: loggedInUser.email,
        action: "update_payment_method",
        targetType: "load",
        targetId: loadDocId,
        tenantId: loggedInUser.tenantId,
        details: {
          paymentMethod: newPaymentMethod,
          message: `Payment method updated to ${newPaymentMethod}`
        }
      });
    } catch (err) {
      console.error("Error updating payment method:", err);
      alert("Failed to update payment method: " + err.message);
    }
  };

  const handlePaymentStatusChange = async (loadDocId, newStatus) => {
    if (!canAmendAccounting) {
      alert('You do not have permission to update payment status.');
      return;
    }
    
    try {
      await updateLoadPaymentStatus(loadDocId, newStatus);
      updateLoadInList(loadDocId, { 
        paymentStatus: newStatus,
        paymentMarkedAt: newStatus === 'paid' ? new Date() : null
      });
      await logAudit({
        userId: loggedInUser.uid,
        userEmail: loggedInUser.email,
        action: "update_payment_status",
        targetType: "load",
        targetId: loadDocId,
        tenantId: loggedInUser.tenantId,
        details: {
          paymentStatus: newStatus,
          message: `Payment marked as ${newStatus}`
        }
      });
    } catch (err) {
      console.error("Error updating payment status:", err);
      alert("Failed to update payment status: " + err.message);
    }
  };

  const handleDeleteLoad = async (loadDocId, loadIdentifier) => {
  if (!canHardDelete) {
    alert("You do not have permission to archive loads.");
    return;
  }
  
  if (window.confirm(`Are you sure you want to ARCHIVE Load ID: ${loadIdentifier}?\n\nThis load will be moved to the archive and permanently deleted after 30 days.`)) {
    try {
      const loadToArchive = accountingLoads.find(l => l.docId === loadDocId);
      
      // Unassign driver and truck BEFORE archiving
      if (loadToArchive?.driverId || loadToArchive?.truckId) {
        await updateDoc(doc(db, "loads", loadDocId), {
          driverId: null,
          truckId: null,
          updatedAt: serverTimestamp()
        });
        
        await logAudit({
          userId: loggedInUser.uid,
          userEmail: loggedInUser.email,
          action: "driver_unassigned_before_archive",
          targetType: "load",
          targetId: loadDocId,
          tenantId: loggedInUser.tenantId,
          details: {
            message: `Driver and truck unassigned before archiving load ${loadIdentifier}`,
            previousDriverId: loadToArchive?.driverId,
            previousTruckId: loadToArchive?.truckId
          }
        });
      }
      
      await archiveLoadService(loadDocId, loggedInUser.uid, loggedInUser.email, loggedInUser.tenantId);
      removeLoadFromList(loadDocId);
      await logLoadArchive({
        user: loggedInUser,
        loadDocId,
        loadId: loadIdentifier
      });
      alert(`Load ${loadIdentifier} archived successfully.\n\nDriver and truck have been unassigned.\n\nIt will be permanently deleted in 30 days.\n\nYou can restore it from the Archive tab before then.`);
    } catch (err) {
      console.error("Error archiving load:", err);
      alert("Failed to archive load: " + err.message);
    }
  }
};

  const handleGenerateBOL = async (load, drivers) => {
    try {
      const generateBOLPdf = await LazyPDFGenerators.generateBOLPdf();
      await generateBOLPdf(load, drivers, loggedInUser);
    } catch (error) {
      console.error('Error generating BOL:', error);
      alert('Failed to generate BOL PDF');
    }
  };

  const handleGenerateInvoice = async (load) => {
    try {
      const generateInvoicePdf = await LazyPDFGenerators.generateInvoicePdf();
      await generateInvoicePdf(load, drivers, brokers, loggedInUser);
    } catch (error) {
      console.error('Error generating Invoice:', error);
      alert('Failed to generate Invoice PDF');
    }
  };

  const handleSaveAdminNote = async (loadDocId, note) => {
    try {
      await saveAccountingNote(loadDocId, note);
      updateLoadInList(loadDocId, { 
        accountingNote: note,
        accountingNoteUpdatedAt: new Date()
      });
      await logAudit({
        userId: loggedInUser.uid,
        userEmail: loggedInUser.email,
        action: "save_accounting_note",
        targetType: "load",
        targetId: loadDocId,
        tenantId: loggedInUser.tenantId,
        details: {
          note: note,
          message: `Accounting note saved`
        }
      });
    } catch (err) {
      console.error("Error saving accounting note:", err);
      throw err;
    }
  };

const handleEmailInvoice = async (load, brokerEmail, includeBOL = true, includeInvoice = true) => {
  try {
    // Derive companyName if missing (for email CC/reply-to)
    let companyNameToSave = load.companyName || '';
    let derivedCompanyId = null;
    if (!companyNameToSave) {
      const driver = drivers.find(d => d.id === load.driverId);
      if (driver?.assignedCompanyName) {
        companyNameToSave = driver.assignedCompanyName;
        derivedCompanyId = driver.assignedCompanyId || null;
        console.log('📋 Derived companyName from driver for email:', companyNameToSave);
      }
    }

    // Pre-save: Ensure companyName is saved so email function can find CC/reply-to
    console.log('💾 Pre-saving load data before email...');
    const loadRef = doc(db, 'loads', load.docId);
    await updateDoc(loadRef, {
      companyName: companyNameToSave,
      updatedAt: serverTimestamp()
    });
    console.log('✅ Load data synced before generating documents');

    // Use updated load with companyName for PDF generation and email
    const loadWithCompany = { ...load, companyName: companyNameToSave };

    // Resolve company doc ID (case-insensitive) so backend doesn't rely on name matching
    const matchedCompany = (companies || []).find(
      c => (c.name || '').toLowerCase().trim() === (companyNameToSave || '').toLowerCase().trim()
    );
    if (matchedCompany) {
      loadWithCompany.companyId = matchedCompany.id;
      console.log('🏢 Resolved companyId for email:', matchedCompany.id);
    } else if (derivedCompanyId) {
      loadWithCompany.companyId = derivedCompanyId; // Driver's exact BOL company doc ID
      console.log('🏢 Using driver assignedCompanyId for email:', derivedCompanyId);
    } else {
      loadWithCompany.companyId = null; // Never trust stale companyId from the load doc
      console.warn('⚠️ Could not resolve companyId for:', companyNameToSave);
    }

    // Generate Invoice PDF if requested
    let invoicePdfBlob = null;
    if (includeInvoice) {
      const generateInvoicePdf = await LazyPDFGenerators.generateInvoicePdf();
      invoicePdfBlob = await generateInvoicePdf(loadWithCompany, drivers, brokers, loggedInUser, true);
    }
    
    // Generate BOL PDF if requested
    let bolPdfBlob = null;
    if (includeBOL) {
      console.log('📄 Generating BOL PDF for email attachment...');
      const generateBOLPdf = await LazyPDFGenerators.generateBOLPdf();
      bolPdfBlob = await generateBOLPdf(loadWithCompany, drivers, loggedInUser, true);
    }
    
    // Send email with attachments
    await emailInvoiceToBoker(loadWithCompany, brokerEmail, invoicePdfBlob, bolPdfBlob);
    
    await markLoadAsInvoiced(load.docId);
    
    updateLoadInList(load.docId, { 
      invoiceStatus: 'invoiced',
      invoicedAt: new Date(),
      brokerEmail: brokerEmail
    });
    
    await logAudit({
      userId: loggedInUser.uid,
      userEmail: loggedInUser.email,
      action: "email_invoice",
      targetType: "load",
      targetId: load.docId,
      tenantId: loggedInUser.tenantId,
      details: {
        loadId: load.load_id,
        brokerName: brokers.find(b => b.id === load.brokerId)?.name || load.brokerName,
        brokerEmail: brokerEmail,
        includedBOL: includeBOL,
        includedInvoice: includeInvoice,
        message: `${[includeInvoice && 'Invoice', includeBOL && 'BOL'].filter(Boolean).join(' and ')} emailed to ${brokerEmail} and marked as invoiced`
      }
    });
    
    const sentDocs = [includeInvoice && 'Invoice', includeBOL && 'BOL'].filter(Boolean).join(' and ');
    alert(`${sentDocs} sent successfully to ${brokerEmail}!`);
  } catch (err) {
    console.error("Error emailing invoice:", err);
    alert('Failed to email invoice: ' + err.message);
  }
};

  // Always show skeleton if we haven't confirmed data is ready
  if (isInitialLoading || (loggedInUser && hasAccess && !accountingLoads.length && isDataLoading)) {
    return <AppLoader message={getLoadingMessage()} />;
  }

  if (!loggedInUser) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center p-8 bg-white rounded-lg shadow-md">
          <svg className="w-16 h-16 text-gray-400 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
          <p className="text-gray-600 text-lg">Please log in to view accounting data.</p>
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
          <p className="text-red-700">You don't have permission to access the accounting page.</p>
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
              <h3 className="text-lg font-semibold text-red-800 mb-2">Error Loading Data</h3>
              <p className="text-red-700 text-sm">{error}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-full mx-auto py-4 px-1 sm:px-6 lg:px-8">
      <AccountingHeader applicationTimeZone={applicationTimeZone} />

      <div className="mb-6">
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex items-center">
            <div className="flex space-x-8 flex-1">
              <button
                onClick={() => setActiveTab('accounting')}
                className={`${
                  activeTab === 'accounting'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors`}
              >
                <div className="flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                  </svg>
                  Accounting
                </div>
              </button>
              
              <button
                onClick={() => setActiveTab('archive')}
                className={`${
                  activeTab === 'archive'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors`}
              >
                <div className="flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                  </svg>
                  Archive
                </div>
              </button>
            </div>

            {activeTab === 'accounting' && (
              <div className="flex items-center gap-3 pb-1">
                {accountingLoads.length > 0 && (
                  <button
                    onClick={() => setShowStats(!showStats)}
                    className={`flex items-center gap-1.5 py-1.5 px-3 rounded-md text-xs font-medium transition-colors ${
                      showStats
                        ? 'bg-blue-600 text-white hover:bg-blue-700'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200 border border-gray-300'
                    }`}
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                    {showStats ? 'Hide Stats' : 'Stats'}
                  </button>
                )}
                {canHardDelete && (
                  <>
                {selectedLoads.size > 0 && (
                  <span className="text-xs text-blue-600 font-medium">
                    {selectedLoads.size} selected
                  </span>
                )}
                <button
                  onClick={handleBulkArchive}
                  disabled={selectedLoads.size === 0}
                  className={`${
                    selectedLoads.size === 0
                      ? 'bg-gray-300 cursor-not-allowed'
                      : 'bg-orange-500 hover:bg-orange-600'
                  } text-white font-medium py-1.5 px-3 rounded-md text-xs flex items-center shadow-sm transition-colors`}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                  </svg>
                  Archive Selected
                </button>
                  </>
                )}
              </div>
            )}
          </nav>
        </div>
      </div>

      {activeTab === 'accounting' ? (
        <>

         <AccountingFilters
            filters={filters}
            handleFilterChange={handleFilterChange}
            handleQuickFilterChange={handleQuickFilterChange}
            drivers={drivers}
            trucks={trucks}
            brokers={brokers}
            companies={companies || []}
            dispatchers={dispatchers}
            mainFilterRangeDisplay={mainFilterRangeDisplay}
          />

          {isQuickFilterActive && rawLoadCount > 0 && (
            <div className="mb-4 px-4 py-2 bg-blue-50 border border-blue-200 rounded-lg flex items-center gap-2">
              <svg className="w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-sm text-blue-800">
                Found <span className="font-semibold">{accountingLoads.length}</span>{' '}
                {filters.quickFilter} load{accountingLoads.length !== 1 ? 's' : ''} out of{' '}
                <span className="font-semibold">{rawLoadCount}</span> total
              </p>
            </div>
          )}
        {showStats && accountingLoads.length > 0 && (
            <div className="mb-4">
              <AccountingSummaryStats
                accountingLoads={accountingLoads}
                drivers={drivers}
                dispatchers={dispatchers}
                brokers={brokers}
                filters={filters}
                onHideStats={() => setShowStats(false)}
              />
            </div>
          )}
         {isDataLoading && accountingLoads.length === 0 && !filters.loadIdSearch ? (
            <div className="p-8 bg-white rounded-lg shadow text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
              <p className="text-gray-500">Loading accounting data...</p>
            </div>
          ) : (
            <>
              <AccountingTable
                accountingLoads={accountingLoads}
                loggedInUser={loggedInUser}
                drivers={drivers}
                trucks={trucks}
                brokers={brokers}
                dispatchers={dispatchers}
                companies={companies || []}
                applicationTimeZone={applicationTimeZone}
                canAmendAccounting={canAmendAccounting}
                canHardDelete={canHardDelete}
                onOpenEditModal={handleOpenEditModal}
                onDeleteLoad={handleDeleteLoad}
                onPayTermsChange={handlePayTermsChange}
                onPaymentMethodChange={handlePaymentMethodChange}
                onPaymentStatusChange={handlePaymentStatusChange}
                onGenerateBOL={handleGenerateBOL}
                onGenerateInvoice={handleGenerateInvoice}
                onSaveAdminNote={handleSaveAdminNote}
                onEmailInvoice={handleEmailInvoice}
                updateLoadInList={updateLoadInList}
                selectedLoads={selectedLoads}
                onSelectLoad={handleSelectLoad}
                isAllSelected={isAllSelected}
                onSelectAll={handleSelectAll}
              />

              {hasMore && accountingLoads.length > 0 && (
                <div className="mt-6 flex justify-center">
                  <button
                    onClick={handleLoadMore}
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
          )}        </>
      ) : (
        <ArchiveTab
          loggedInUser={loggedInUser}
          drivers={drivers}
          trucks={trucks}
          brokers={brokers}
          dispatchers={dispatchers}
          applicationTimeZone={applicationTimeZone}
        />
      )}

      <Suspense fallback={<ComponentLoader />}>
        {showLoadEditModal && editingLoad && (
          <LoadEditModal
            isOpen={showLoadEditModal}
            onClose={handleCloseEditModal}
            editingLoad={editingLoad}
            loadForm={loadForm}
            setLoadForm={setLoadForm}
            canAmendAccounting={canAmendAccounting}
            loggedInUser={loggedInUser}
            applicationTimeZone={applicationTimeZone}
            isLoadingTimeZone={isLoadingTimeZone}
            updateLoadInList={updateLoadInList}
          />
        )}
      </Suspense>
    </div>
  );
}