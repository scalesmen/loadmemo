// src/components/CurrentLoadsPage.js
import React, { useEffect, useState, useCallback, useMemo, lazy, Suspense } from 'react';
import { auth, db } from '../firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc } from "firebase/firestore";

// Context
import { useTimezone } from '../contexts/TimezoneContext';

// Custom Hooks
import { useDropdownData } from './loads/hooks/useDropdownData';
import { useLoadsData } from './loads/hooks/useLoadsData';
import { useLoadForm } from './loads/hooks/useLoadForm';
import { useLoadActions } from './loads/hooks/useLoadActions';
import { useLoadsMap } from './loads/hooks/useLoadsMap';
import { useEmptyDrivers } from './loads/hooks/useEmptyDrivers';
import EmptyDriversWidget from './loads/components/EmptyDriversWidget';

// Utils
import { 
  canUserManageLoads, 
  canUserSeeDispatcherFilter 
} from './loads/utils/loadHelpers';
import { 
  getDefaultFilters,
  COMMODITY_TYPES 
} from './loads/utils/constants';
import {
  extractCityStateZip,
  formatDateOnly,
  formatTimestampForDisplay
} from './loads/utils/formatters';

// Components
import PDFupload from "./PDFupload";
import LoadDocuments from './LoadDocuments';

// Lazy load heavy components
const LoadsTable = lazy(() => import('./loads/components/LoadsTable'));
const LoadsFilters = lazy(() => import('./loads/components/LoadsFilters'));
const LoadModal = lazy(() => import('./loads/components/LoadModal'));
const DeleteConfirmationModal = lazy(() => import('./loads/components/DeleteConfirmationModal'));
const LoadsMapView = lazy(() => import('./loads/components/LoadsMapView'));

// ============================================================================
// IMPROVED LOADING COMPONENTS
// ============================================================================

/**
 * Main app loader with your logo
 * Shows during initial page load until all critical data is ready
 */
// REPLACE the AppLoader with this version:
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
          <div className="h-8 w-48 bg-gray-200 rounded animate-pulse"></div>
          <div className="h-3 w-64 bg-gray-200 rounded animate-pulse mt-2"></div>
        </div>
        <div className="flex gap-2">
          <div className="h-9 w-24 bg-blue-200 rounded animate-pulse"></div>
          <div className="h-9 w-32 bg-gray-200 rounded animate-pulse"></div>
        </div>
      </div>
    </div>

    {/* Skeleton Filters */}
    <div className="mb-4 flex gap-3 skeleton-row" style={{animationDelay: '100ms'}}>
      {[1,2,3,4].map(i => (
        <div key={i} className="h-9 w-36 bg-gray-200 rounded animate-pulse"></div>
      ))}
    </div>

    {/* Skeleton Table */}
    <div className="bg-white shadow-lg rounded-lg overflow-hidden">
      {/* Table Header */}
      <div className="bg-gray-100 border-b border-gray-200 px-4 py-3 flex gap-4 skeleton-row" style={{animationDelay: '200ms'}}>
        {[40, 80, 60, 100, 120, 80, 70, 60].map((w, i) => (
          <div key={i} className="h-3 bg-gray-300 rounded animate-pulse" style={{width: w}}></div>
        ))}
      </div>
      
      {/* Table Rows - staggered */}
      {[1,2,3,4,5,6,7,8,9,10,11,12,13,14].map(row => (
        <div 
          key={row} 
          className="px-4 py-4 border-b border-gray-100 flex gap-4 items-center skeleton-row"
          style={{animationDelay: `${200 + row * 120}ms`}}
        >
          <div className="h-4 w-6 bg-gray-200 rounded animate-pulse"></div>
          <div className="h-4 w-20 bg-blue-100 rounded animate-pulse"></div>
          <div className="h-6 w-6 bg-gray-200 rounded animate-pulse"></div>
          <div className="h-5 w-20 bg-green-100 rounded-full animate-pulse"></div>
          <div className="flex-1">
            <div className="h-3 w-32 bg-gray-200 rounded animate-pulse mb-1"></div>
            <div className="h-3 w-48 bg-gray-100 rounded animate-pulse"></div>
          </div>
          <div className="flex-1">
            <div className="h-3 w-28 bg-gray-200 rounded animate-pulse mb-1"></div>
            <div className="h-3 w-40 bg-gray-100 rounded animate-pulse"></div>
          </div>
          <div className="h-8 w-32 bg-gray-200 rounded animate-pulse"></div>
          <div className="h-4 w-16 bg-green-100 rounded animate-pulse"></div>
          <div className="h-3 w-20 bg-gray-200 rounded animate-pulse"></div>
        </div>
      ))}
    </div>

    {/* Loading indicator */}
    <div className="mt-4 flex items-center justify-center gap-2 text-sm text-gray-500 skeleton-row" style={{animationDelay: '1400ms'}}>
      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
      <span>{message}</span>
    </div>
  </div>
);

/**
 * Lightweight component loader for lazy-loaded components
 * Much less prominent than the main loader
 */
const ComponentLoader = () => (
  <div className="flex items-center justify-center p-4">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
  </div>
);

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function CurrentLoadsPage() {
  // Authentication state
  const [loggedInUser, setLoggedInUser] = useState(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  
  // Filter state
  const [filters, setFilters] = useState(getDefaultFilters());
  const [loadLimit, setLoadLimit] = useState(30);
  
  // PDF processing state
  const [pdfProcessingStatus, setPdfProcessingStatus] = useState('');
  
  const safeSetFilters = useCallback((newFilters) => {
    if (!newFilters) {
      console.error('Attempted to set undefined filters');
      setFilters(getDefaultFilters());
      return;
    }
    setFilters(newFilters);
  }, []);
  
  // Timezone context
  const { applicationTimeZone, isLoadingTimeZone } = useTimezone();

  // Permission checks (moved earlier to include in initial load check)
  const canManageLoads = canUserManageLoads(loggedInUser);
  const canSeeDispatcherFilter = canUserSeeDispatcherFilter(loggedInUser);

  // Custom hooks for data management
  const {
    drivers,
    trucks,
    dispatchers,
    brokers,
    commodityTypes,
    isAutomobileHauling,
    isDryVan,
    isReefer,
    isFlatbed,
    isTanker,
    isLoadingDropdowns
  } = useDropdownData(loggedInUser);

  // Pre-load Empty Drivers Widget data
   const isAdminLevel = useMemo(() => {
    if (!loggedInUser) return false;
    const roles = Array.isArray(loggedInUser.role) ? loggedInUser.role : [loggedInUser.role].filter(Boolean);
    return roles.includes('Super Admin') || roles.includes('Main Admin');
  }, [loggedInUser]);

  const { 
    emptyDrivers, 
    isLoading: isLoadingEmptyDrivers, 
    totalEmptyDrivers, 
    timeUntilRefresh,
    clearCache 
  } = useEmptyDrivers(
    loggedInUser,
    drivers,
    applicationTimeZone,
    isAdminLevel && !isLoadingDropdowns && !!loggedInUser // Only load for Super Admin and Main Admin
  );
  const {
    currentLoads,
    isLoading: isLoadingLoads,
    error: loadsError,
    totalLoads,
    filteredCount,
    displayedCount,
    hasMoreLoads,
    LOADS_PER_PAGE,
    MAX_LOADS
  } = useLoadsData(loggedInUser, filters, applicationTimeZone, isLoadingTimeZone, loadLimit);

  // ============================================================================
  // UNIFIED LOADING STATE - Key Improvement
  // ============================================================================
  
  /**
   * Determine if we should show the main app loader
   * Only show until ALL critical initial data is ready
   * Include Empty Drivers Widget in initial load
   */
  const isInitialLoading = isAuthLoading || isLoadingTimeZone || 
    (loggedInUser && (isLoadingDropdowns || (isLoadingLoads && currentLoads.length === 0)));

  /**
   * Show different loading messages based on what's loading
   */
  const getLoadingMessage = () => {
    if (isAuthLoading) return "Authenticating...";
    if (isLoadingTimeZone) return "Setting up timezone...";
    if (isLoadingDropdowns) return "Loading system data...";
    if (isLoadingEmptyDrivers) return "Checking driver availability...";
    if (isLoadingLoads) return "Loading your loads...";
    return "Loading...";
  };

  // ============================================================================
  // PAGINATION HANDLERS
  // ============================================================================

  const handleLoadMore = useCallback(() => {
    setLoadLimit(prev => prev + LOADS_PER_PAGE);
  }, [LOADS_PER_PAGE]);

  useEffect(() => {
    setLoadLimit(30);
  }, [filters]);

  // ============================================================================
  // FILTER DRIVERS/TRUCKS
  // ============================================================================

  const activeDrivers = useMemo(() => drivers.filter(driver => 
    !driver.isDeleted && 
    driver.status !== "Deleted" &&
    driver.status === "Active"
  ), [drivers]);

  const activeTrucks = useMemo(() => trucks.filter(truck => 
    !truck.isDeleted && 
    truck.status !== "Deleted" &&
    truck.status === "Active"
  ), [trucks]);

  // ============================================================================
  // FORM HOOKS
  // ============================================================================

  const {
    loadForm,
    setLoadForm,
    showLoadModal,
    setShowLoadModal,
    isEditing,
    setIsEditing,
    editDocId,
    setEditDocId,
    handleInputChange,
    handleVehicleChange,
    handleVehicleCountChange,
    resetForm,
    populateFormForEdit,
    populateFormFromPDF
  } = useLoadForm(isAutomobileHauling);

  const {
    handleStatusChange,
    handleDriverChange,
    handleTruckChange,
    handleBrokerChange,
    handleDispatcherChange,
    handleDeleteClick,
    handleDeleteLoad,
    handleLoadFormSubmit,
    showDeleteModal,
    setShowDeleteModal,
    loadToDelete,
    isProcessing,
    canManageLoads: canManage
  } = useLoadActions(loggedInUser, currentLoads, drivers, brokers);

  // Map view hook
  const {
    showMapView,
    toggleMapView,
    driverLocations,
    isLoadingMap,
    getFilteredLoadsForMap
  } = useLoadsMap(loggedInUser, filters);

  // ============================================================================
  // AUTHENTICATION EFFECT
  // ============================================================================

  useEffect(() => {
    console.log("Auth Effect: Running onAuthStateChanged setup.");
    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      console.log("Auth Effect: onAuthStateChanged callback fired. User:", user ? user.uid : 'null');
      if (user) {
        const userDocRef = doc(db, "users", user.uid);
        try {
          const docSnap = await getDoc(userDocRef);
          if (docSnap.exists()) {
            const userProfile = { uid: user.uid, email: user.email, ...docSnap.data() };
            console.log("Auth Effect: Profile fetched:", userProfile);
            setLoggedInUser(userProfile);
            if (userProfile.active === false) {
              alert("Your account has been disabled. Please contact an administrator.");
              signOut(auth).catch(err => console.error("Error during sign out for disabled account:", err));
            }
          } else {
            console.warn("Auth Effect: User profile not found for UID:", user.uid);
            setLoggedInUser({ uid: user.uid, email: user.email, role: null, active: false });
          }
        } catch (profileError) {
          console.error("Auth Effect: Error fetching user profile:", profileError);
          setLoggedInUser({ uid: user.uid, email: user.email, role: null, active: false });
        }
      } else {
        console.log("Auth Effect: No user signed in.");
        setLoggedInUser(null);
      }
      setIsAuthLoading(false);
      console.log("Auth Effect: isLoading set to false.");
    });
    
    return () => {
      console.log("Auth Effect: Cleaning up onAuthStateChanged.");
      unsubscribeAuth();
    };
  }, []);

  // ============================================================================
  // ESC KEY HANDLER
  // ============================================================================

  useEffect(() => {
    if (!showLoadModal && !showDeleteModal) return;

    const handleEscKey = (event) => {
      if (event.keyCode === 27) {
        if (showLoadModal) setShowLoadModal(false);
        if (showDeleteModal) setShowDeleteModal(false);
      }
    };

    document.addEventListener('keydown', handleEscKey);
    return () => document.removeEventListener('keydown', handleEscKey);
  }, [showLoadModal, showDeleteModal, setShowDeleteModal]);

  // ============================================================================
  // EVENT HANDLERS
  // ============================================================================

  const handleAddLoadClick = useCallback(() => {
    if (!canManageLoads) {
      alert("You don't have permission.");
      return;
    }
    resetForm();
    setLoadForm(prev => ({
      ...prev,
      dispatcherId: loggedInUser?.role === "Dispatcher" ? loggedInUser.uid : ""
    }));
    setShowLoadModal(true);
  }, [canManageLoads, resetForm, setLoadForm, loggedInUser, setShowLoadModal]);

  const handleEditLoadClick = useCallback((load) => {
    if (!canManageLoads) {
      alert("You don't have permission.");
      return;
    }
    populateFormForEdit(load);
  }, [canManageLoads, populateFormForEdit]);

  const handleFilterChange = useCallback((e) => {
  const { name, value, type, checked } = e.target;
  
  if (name === 'all') {
    setFilters(value);
  } else if (name === 'single') {
    setFilters(value);
  } else if (type === 'checkbox') {
    // Handle checkbox filters
    setFilters(prev => ({ ...prev, [name]: checked }));
  } else {
    setFilters(prev => ({ ...prev, [name]: value }));
  }
}, []);

  const handlePdfProcessingComplete = useCallback(({ data: loadDataFromAI, error: processingError }) => {
    setPdfProcessingStatus('');
    if (processingError) {
      alert("PDF Processing Error: " + processingError);
      console.error("PDF Processing Error reported by PDFupload component:", processingError);
      return;
    }
    if (!loadDataFromAI) {
      alert("AI did not return any data from the PDF.");
      console.warn("No data received from PDF processing.");
      return;
    }
    populateFormFromPDF(loadDataFromAI, brokers, loggedInUser);

    if (isAutomobileHauling && (loadDataFromAI.driverCollectionAmount > 0 || loadDataFromAI.brokerFeeCollection > 0)) {
      console.log("💰 Payment collection detected from PDF:", {
        driverCollection: loadDataFromAI.driverCollectionAmount,
        brokerFee: loadDataFromAI.brokerFeeCollection
      });
    }
  }, [populateFormFromPDF, brokers, loggedInUser, isAutomobileHauling]);

  const handleFormSubmit = useCallback(async (e) => {
    e.preventDefault();
    const result = await handleLoadFormSubmit(loadForm, isEditing, editDocId);
    if (result.success) {
      setShowLoadModal(false);
      resetForm();
    } else {
      alert("Error saving load: " + result.error);
    }
  }, [handleLoadFormSubmit, loadForm, isEditing, editDocId, setShowLoadModal, resetForm]);

  // ============================================================================
  // RENDER LOGIC - IMPROVED
  // ============================================================================

  // Show main app loader for initial loading
  if (isInitialLoading) {
    return <AppLoader message={getLoadingMessage()} />;
  }

  // Not logged in
  if (!loggedInUser) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center p-8 bg-white rounded-lg shadow-md">
          <svg className="w-16 h-16 text-gray-400 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
          <p className="text-gray-600 text-lg">Please log in to view current loads.</p>
        </div>
      </div>
    );
  }

  // Inactive account
  if (loggedInUser.active === false) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center p-8 bg-red-50 rounded-lg shadow-md border-2 border-red-200">
          <svg className="w-16 h-16 text-red-500 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <h3 className="text-xl font-semibold text-red-800 mb-2">Account Inactive</h3>
          <p className="text-red-700">Your account is inactive. Please contact an administrator.</p>
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
          <div className="flex items-center gap-4">
            <div>
              <h2 className="text-2xl sm:text-3xl font-bold text-gray-800">Current Loads</h2>
              <div className="text-xs text-gray-500 mt-1">
                {totalLoads > 0 && (
                  <>
                    {filters.searchLoadId && filters.searchLoadId.trim() !== '' ? (
                      `Showing ${displayedCount} matching load${displayedCount !== 1 ? 's' : ''}`
                    ) : (
                      <>
                        {displayedCount === filteredCount ? 
                          `Showing all ${displayedCount} load${displayedCount !== 1 ? 's' : ''}` : 
                          `Showing ${displayedCount} of ${filteredCount} load${filteredCount !== 1 ? 's' : ''}`
                        }
                        {filteredCount !== totalLoads && ` (${totalLoads} total)`}
                      </>
                    )}
                    {' • '}
                  </>
                )}
            
                Times displayed in: {applicationTimeZone || "Loading..."}
              </div>
            </div>
            
             {isAdminLevel && <EmptyDriversWidget
              loggedInUser={loggedInUser}
              drivers={drivers}
              applicationTimeZone={applicationTimeZone}
              emptyDrivers={emptyDrivers}
              isLoading={false} // Already loaded during initial load
              totalEmptyDrivers={totalEmptyDrivers}
              timeUntilRefresh={timeUntilRefresh}
              clearCache={clearCache}
            />}
            
            {/* Map View Toggle Button */}
            <button
              onClick={toggleMapView}
              className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${
                showMapView 
                  ? 'bg-blue-600 text-white hover:bg-blue-700' 
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
                  d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" 
                />
              </svg>
              {showMapView ? 'Hide Map' : 'Map View'}
            </button>
          </div>
          
          <div className="flex gap-2 items-center flex-wrap">
            {canManageLoads && (
              <>
                <button 
                  onClick={handleAddLoadClick} 
                  className="bg-blue-500 hover:bg-blue-600 text-white font-medium py-2 px-4 rounded-md text-sm flex items-center shadow-sm transition-colors"
                  disabled={isProcessing}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"/>
                  </svg>
                  Add Load
                </button>
                
                <PDFupload
                  onProcessingComplete={handlePdfProcessingComplete}
                  onUploadStart={() => setPdfProcessingStatus("Processing PDF...")}
                  onUploadError={(errMsg) => {
                    setPdfProcessingStatus('');
                    alert("Upload Error: " + errMsg);
                  }}
                  loggedInUser={loggedInUser}
                  disabled={isProcessing}
                />
              </>
            )}
            {pdfProcessingStatus && (
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                <span>{pdfProcessingStatus}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Error display */}
      {loadsError && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 flex items-start gap-3">
          <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div>
            <p className="font-medium">Error loading loads</p>
            <p className="text-sm mt-1">{loadsError}</p>
          </div>
        </div>
      )}

      {/* Map View */}
      {showMapView && (
        <div className="mb-6">
          <Suspense fallback={
            <div className="bg-white rounded-lg shadow-lg p-8">
              <div className="flex items-center justify-center">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
                  <p className="mt-4 text-gray-600">Loading map...</p>
                </div>
              </div>
            </div>
          }>
            <div className="bg-white rounded-lg shadow-lg overflow-hidden">
              <div className="p-4 bg-gray-50 border-b border-gray-200">
                <div className="flex justify-between items-center">
                  <h3 className="text-lg font-semibold text-gray-800">Loads Map View</h3>
                  <div className="text-sm text-gray-600">
                    <span className="inline-flex items-center gap-2">
                      <span className="flex items-center gap-1">
                        <span className="w-3 h-3 bg-green-500 rounded-full"></span> 
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="w-3 h-3 bg-blue-500 rounded-full"></span> 
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="w-3 h-3 bg-orange-500 rounded-full"></span> 
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="w-3 h-3 bg-gray-500 rounded-full"></span> 
                      </span>
                    </span>
                  </div>
                </div>
              </div>
              <LoadsMapView
                loads={currentLoads}
                drivers={drivers}
                trucks={trucks}
                brokers={brokers}
                isAutomobileHauling={isAutomobileHauling}
                googleMapsApiKey={process.env.REACT_APP_GOOGLE_MAPS_API_KEY}
                formatDateOnly={formatDateOnly}
                extractCityStateZip={extractCityStateZip}
                applicationTimeZone={applicationTimeZone}
                driverLocations={driverLocations}
              />
            </div>
          </Suspense>
        </div>
      )}

      {/* Filters */}
      <Suspense fallback={<ComponentLoader />}>
        <LoadsFilters
          filters={filters}
          onFilterChange={handleFilterChange}
          drivers={activeDrivers}
          trucks={activeTrucks}
          brokers={brokers}
          dispatchers={dispatchers}
          canSeeDispatcherFilter={canSeeDispatcherFilter}
        />
      </Suspense>

      {/* Table */}
      <Suspense fallback={<ComponentLoader />}>
        <LoadsTable
          loads={currentLoads}
          drivers={activeDrivers}
          trucks={trucks}
          brokers={brokers}
          dispatchers={dispatchers}
          isAutomobileHauling={isAutomobileHauling}
          canManageLoads={canManageLoads}
          canSeeDispatcherFilter={canSeeDispatcherFilter}
          onStatusChange={handleStatusChange}
          onDriverChange={handleDriverChange}
          onTruckChange={handleTruckChange}
          onBrokerChange={handleBrokerChange}
          onDispatcherChange={handleDispatcherChange}
          onEdit={handleEditLoadClick}
          onDelete={handleDeleteClick}
          formatDateOnly={formatDateOnly}
          formatTimestampForDisplay={formatTimestampForDisplay}
          extractCityStateZip={extractCityStateZip}
          applicationTimeZone={applicationTimeZone}
          isLoading={false} // Never show table skeleton after initial load
          loggedInUser={loggedInUser}
          LoadDocuments={LoadDocuments}
        />
      </Suspense>

      {/* Load More Button */}
      {hasMoreLoads && !filters.searchLoadId && (
        <div className="mt-6 flex justify-center">
          <button
            onClick={handleLoadMore}
            className="bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium py-3 px-6 rounded-lg border border-gray-300 transition-colors flex items-center gap-2"
            disabled={isLoadingLoads}
          >
            {isLoadingLoads ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-600"></div>
                Loading...
              </>
            ) : (
              <>
                <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
                Load More ({filteredCount - displayedCount} remaining)
              </>
            )}
          </button>
        </div>
      )}

      {/* Load Modal */}
      {showLoadModal && (
        <Suspense fallback={<ComponentLoader />}>
          <LoadModal
            isEditing={isEditing}
            loadForm={loadForm}
            onInputChange={handleInputChange}
            onSubmit={handleFormSubmit}
            onClose={() => {
              setShowLoadModal(false);
              resetForm();
            }}
            brokers={brokers}
            drivers={activeDrivers}
            trucks={activeTrucks}
            dispatchers={dispatchers}
            loggedInUser={loggedInUser}
            isAutomobileHauling={isAutomobileHauling}
            isDryVan={isDryVan}
            isReefer={isReefer}
            isFlatbed={isFlatbed}
            isTanker={isTanker}
            onVehicleChange={handleVehicleChange}
            onVehicleCountChange={handleVehicleCountChange}
            setLoadForm={setLoadForm}
            isProcessing={isProcessing}
          />
        </Suspense>
      )}

      {/* Delete Modal */}
      {showDeleteModal && (
        <Suspense fallback={null}>
          <DeleteConfirmationModal
            isOpen={showDeleteModal}
            onClose={() => {
              setShowDeleteModal(false);
            }}
            onConfirm={handleDeleteLoad}
            loadId={currentLoads.find(l => l.docId === loadToDelete)?.load_id || loadToDelete}
            isProcessing={isProcessing}
          />
        </Suspense>
      )}
    </div>
  );
}