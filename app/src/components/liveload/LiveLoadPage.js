// src/components/liveload/LiveLoadPage.js
// Main page for carriers/dispatchers to browse and bid on LiveLoads

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { collection, query, where, orderBy, onSnapshot, limit } from 'firebase/firestore';
import { db } from '../../firebase';

// Components
import LiveLoadCard from './components/LiveLoadCard';
import LiveLoadFilters from './components/LiveLoadFilters';
import LiveLoadDetailModal from './components/LiveLoadDetailModal';
import BidModal from './components/BidModal';
import LiveLoadMap from './components/LiveLoadMap';

// Utils & Constants
import { 
  LIVELOAD_STATUS, 
  SORT_OPTIONS, 
  DISTANCE_FILTERS,
  EXPIRATION_FILTERS 
} from './utils/liveLoadConstants';
import { 
  formatTimeRemaining, 
  canReceiveBids,
  calculateDistanceMiles 
} from './utils/liveLoadHelpers';

// Icons
const MapIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
  </svg>
);

const ListIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
  </svg>
);

const RefreshIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
  </svg>
);

const TruckIcon = () => (
  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h8m-8 4h8m-8 4h8M3 7h.01M3 11h.01M3 15h.01M21 7h.01M21 11h.01M21 15h.01" />
  </svg>
);

// Loading Spinner
const LoadingSpinner = ({ message = "Loading LiveLoads..." }) => (
  <div className="flex flex-col items-center justify-center py-16">
    <div className="relative">
      <div className="w-16 h-16 border-4 border-orange-200 border-t-orange-500 rounded-full animate-spin"></div>
      <div className="absolute inset-0 flex items-center justify-center">
        <TruckIcon />
      </div>
    </div>
    <p className="mt-4 text-gray-600 font-medium">{message}</p>
  </div>
);

// Empty State
const EmptyState = ({ hasFilters, onClearFilters }) => (
  <div className="text-center py-16 px-4">
    <div className="mx-auto w-24 h-24 bg-orange-100 rounded-full flex items-center justify-center mb-6">
      <svg className="w-12 h-12 text-orange-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
      </svg>
    </div>
    <h3 className="text-xl font-semibold text-gray-800 mb-2">
      {hasFilters ? 'No LiveLoads Match Your Filters' : 'No LiveLoads Available'}
    </h3>
    <p className="text-gray-600 max-w-md mx-auto mb-6">
      {hasFilters 
        ? 'Try adjusting your filters to see more available loads.'
        : 'Check back soon! Dealers are constantly posting new vehicle transport opportunities.'}
    </p>
    {hasFilters && (
      <button
        onClick={onClearFilters}
        className="px-6 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors font-medium"
      >
        Clear All Filters
      </button>
    )}
  </div>
);

export default function LiveLoadPage({ loggedInUser }) {
  // State
  const [liveLoads, setLiveLoads] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // View Mode
  const [viewMode, setViewMode] = useState('list'); // 'list' | 'map'
  
  // Filters
  const [filters, setFilters] = useState({
    distance: 'all',
    expiration: 'all',
    sortBy: 'expiring_soon',
    searchTerm: '',
    minPrice: '',
    maxPrice: ''
  });
  
  // Modals
  const [selectedLoad, setSelectedLoad] = useState(null);
  const [showBidModal, setShowBidModal] = useState(false);
  const [loadToBid, setLoadToBid] = useState(null);
  
  // User's location for distance filtering
  const [userLocation, setUserLocation] = useState(null);
  
  // My Bids (to show which loads user already bid on)
  const [myBids, setMyBids] = useState({});
  
  // Stats
  const [stats, setStats] = useState({
    totalAvailable: 0,
    expiringIn1Hour: 0,
    avgPrice: 0
  });

  // Get user's location
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setUserLocation({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude
          });
        },
        (error) => {
          console.log('Location access denied or unavailable:', error);
        }
      );
    }
  }, []);

  // Fetch LiveLoads
  useEffect(() => {
    if (!loggedInUser) return;
    
    setIsLoading(true);
    
    // Query for active LiveLoads
    const loadsQuery = query(
      collection(db, 'liveLoads'),
      where('status', 'in', [LIVELOAD_STATUS.POSTED, LIVELOAD_STATUS.BIDDING]),
      where('expiresAt', '>', new Date()),
      orderBy('expiresAt', 'asc'),
      limit(100)
    );

    const unsubscribe = onSnapshot(
      loadsQuery,
      (snapshot) => {
        const loads = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        
        setLiveLoads(loads);
        
        // Calculate stats
        const now = new Date();
        const oneHourFromNow = new Date(now.getTime() + 60 * 60 * 1000);
        const expiringIn1Hour = loads.filter(l => {
          const expiry = l.expiresAt?.toDate?.() || new Date(l.expiresAt);
          return expiry <= oneHourFromNow;
        }).length;
        
        const prices = loads.map(l => l.suggestedPrice).filter(p => p > 0);
        const avgPrice = prices.length > 0 
          ? Math.round(prices.reduce((a, b) => a + b, 0) / prices.length)
          : 0;
        
        setStats({
          totalAvailable: loads.length,
          expiringIn1Hour,
          avgPrice
        });
        
        setIsLoading(false);
        setError(null);
      },
      (err) => {
        console.error('Error fetching LiveLoads:', err);
        setError('Failed to load LiveLoads. Please try again.');
        setIsLoading(false);
      }
    );

    return () => unsubscribe();
  }, [loggedInUser]);

  // Fetch user's bids
  useEffect(() => {
    if (!loggedInUser?.tenantId) return;
    
    const bidsQuery = query(
      collection(db, 'liveLoadBids'),
      where('carrierId', '==', loggedInUser.tenantId),
      where('status', '==', 'pending')
    );

    const unsubscribe = onSnapshot(bidsQuery, (snapshot) => {
      const bidsMap = {};
      snapshot.docs.forEach(doc => {
        const bid = doc.data();
        bidsMap[bid.liveLoadId] = {
          id: doc.id,
          ...bid
        };
      });
      setMyBids(bidsMap);
    });

    return () => unsubscribe();
  }, [loggedInUser?.tenantId]);

  // Filter and sort loads
  const filteredLoads = useMemo(() => {
    let result = [...liveLoads];
    
    // Distance filter (if user location available)
    if (filters.distance !== 'all' && userLocation) {
      const maxDistance = parseInt(filters.distance);
      result = result.filter(load => {
        if (!load.pickup?.geopoint) return true; // Include if no location data
        const distance = calculateDistanceMiles(
          userLocation,
          { 
            latitude: load.pickup.geopoint.latitude, 
            longitude: load.pickup.geopoint.longitude 
          }
        );
        return distance <= maxDistance;
      });
    }
    
    // Expiration filter
    if (filters.expiration !== 'all') {
      const now = new Date();
      result = result.filter(load => {
        const expiry = load.expiresAt?.toDate?.() || new Date(load.expiresAt);
        const hoursRemaining = (expiry - now) / (1000 * 60 * 60);
        
        switch (filters.expiration) {
          case '1h': return hoursRemaining <= 1;
          case '3h': return hoursRemaining <= 3;
          case '6h': return hoursRemaining <= 6;
          case 'today':
            return expiry.toDateString() === now.toDateString();
          default: return true;
        }
      });
    }
    
    // Price filter
    if (filters.minPrice) {
      const min = parseFloat(filters.minPrice);
      result = result.filter(load => (load.suggestedPrice || 0) >= min);
    }
    if (filters.maxPrice) {
      const max = parseFloat(filters.maxPrice);
      result = result.filter(load => (load.suggestedPrice || Infinity) <= max);
    }
    
    // Search filter
    if (filters.searchTerm) {
      const term = filters.searchTerm.toLowerCase();
      result = result.filter(load => {
        const searchFields = [
          load.vehicleDisplaySummary,
          load.pickup?.city,
          load.pickup?.state,
          load.delivery?.city,
          load.delivery?.state,
          load.dealerName
        ].filter(Boolean).join(' ').toLowerCase();
        return searchFields.includes(term);
      });
    }
    
    // Sorting
    switch (filters.sortBy) {
      case 'expiring_soon':
        result.sort((a, b) => {
          const dateA = a.expiresAt?.toDate?.() || new Date(a.expiresAt);
          const dateB = b.expiresAt?.toDate?.() || new Date(b.expiresAt);
          return dateA - dateB;
        });
        break;
      case 'newest':
        result.sort((a, b) => {
          const dateA = a.createdAt?.toDate?.() || new Date(a.createdAt);
          const dateB = b.createdAt?.toDate?.() || new Date(b.createdAt);
          return dateB - dateA;
        });
        break;
      case 'price_high':
        result.sort((a, b) => (b.suggestedPrice || 0) - (a.suggestedPrice || 0));
        break;
      case 'price_low':
        result.sort((a, b) => (a.suggestedPrice || 0) - (b.suggestedPrice || 0));
        break;
      case 'distance':
        if (userLocation) {
          result.sort((a, b) => {
            const distA = calculateDistanceMiles(userLocation, {
              latitude: a.pickup?.geopoint?.latitude,
              longitude: a.pickup?.geopoint?.longitude
            }) || Infinity;
            const distB = calculateDistanceMiles(userLocation, {
              latitude: b.pickup?.geopoint?.latitude,
              longitude: b.pickup?.geopoint?.longitude
            }) || Infinity;
            return distA - distB;
          });
        }
        break;
      default:
        break;
    }
    
    return result;
  }, [liveLoads, filters, userLocation]);

  // Handlers
  const handleFilterChange = useCallback((key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  }, []);

  const handleClearFilters = useCallback(() => {
    setFilters({
      distance: 'all',
      expiration: 'all',
      sortBy: 'expiring_soon',
      searchTerm: '',
      minPrice: '',
      maxPrice: ''
    });
  }, []);

  const handleLoadClick = useCallback((load) => {
    setSelectedLoad(load);
  }, []);

  const handleBidClick = useCallback((load) => {
    setLoadToBid(load);
    setShowBidModal(true);
  }, []);

  const handleBidSubmitted = useCallback(() => {
    setShowBidModal(false);
    setLoadToBid(null);
  }, []);

  const hasActiveFilters = filters.distance !== 'all' || 
    filters.expiration !== 'all' || 
    filters.searchTerm || 
    filters.minPrice || 
    filters.maxPrice;

  // Render
  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100">
      {/* Header */}
      <div className="bg-gradient-to-r from-orange-500 to-orange-600 shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-white flex items-center gap-3">
                <span className="bg-white/20 p-2 rounded-lg">
                  <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </span>
                LiveLoad
              </h1>
              <p className="text-orange-100 mt-1">
                Time-sensitive vehicle transport opportunities
              </p>
            </div>
            
            {/* Quick Stats */}
            <div className="flex gap-4">
              <div className="bg-white/10 backdrop-blur-sm rounded-lg px-4 py-2 text-center">
                <div className="text-2xl font-bold text-white">{stats.totalAvailable}</div>
                <div className="text-xs text-orange-100">Available</div>
              </div>
              <div className="bg-white/10 backdrop-blur-sm rounded-lg px-4 py-2 text-center">
                <div className="text-2xl font-bold text-white">{stats.expiringIn1Hour}</div>
                <div className="text-xs text-orange-100">Expiring Soon</div>
              </div>
              {stats.avgPrice > 0 && (
                <div className="bg-white/10 backdrop-blur-sm rounded-lg px-4 py-2 text-center">
                  <div className="text-2xl font-bold text-white">${stats.avgPrice}</div>
                  <div className="text-xs text-orange-100">Avg Price</div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
          <div className="flex flex-col md:flex-row md:items-center gap-4">
            {/* Search */}
            <div className="flex-1">
              <div className="relative">
                <input
                  type="text"
                  placeholder="Search by vehicle, city, or dealer..."
                  value={filters.searchTerm}
                  onChange={(e) => handleFilterChange('searchTerm', e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-colors"
                />
                <svg className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
            </div>
            
            {/* View Toggle */}
            <div className="flex items-center gap-2 bg-gray-100 rounded-lg p-1">
              <button
                onClick={() => setViewMode('list')}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  viewMode === 'list' 
                    ? 'bg-white text-gray-900 shadow-sm' 
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <ListIcon /> List
              </button>
              <button
                onClick={() => setViewMode('map')}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  viewMode === 'map' 
                    ? 'bg-white text-gray-900 shadow-sm' 
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <MapIcon /> Map
              </button>
            </div>
            
            {/* Refresh */}
            <button
              onClick={() => window.location.reload()}
              className="flex items-center gap-2 px-3 py-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <RefreshIcon />
              <span className="hidden sm:inline">Refresh</span>
            </button>
          </div>
        </div>
      </div>

      {/* Filters */}
      <LiveLoadFilters
        filters={filters}
        onFilterChange={handleFilterChange}
        onClearFilters={handleClearFilters}
        hasActiveFilters={hasActiveFilters}
        userLocation={userLocation}
      />

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {isLoading ? (
          <LoadingSpinner />
        ) : error ? (
          <div className="text-center py-16">
            <div className="bg-red-50 text-red-700 p-6 rounded-lg inline-block">
              <svg className="w-12 h-12 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <p>{error}</p>
              <button 
                onClick={() => window.location.reload()}
                className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
              >
                Retry
              </button>
            </div>
          </div>
        ) : filteredLoads.length === 0 ? (
          <EmptyState 
            hasFilters={hasActiveFilters} 
            onClearFilters={handleClearFilters} 
          />
        ) : viewMode === 'map' ? (
          <LiveLoadMap
            loads={filteredLoads}
            userLocation={userLocation}
            onLoadClick={handleLoadClick}
            onBidClick={handleBidClick}
            myBids={myBids}
          />
        ) : (
          <>
            {/* Results Count */}
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm text-gray-600">
                Showing <span className="font-semibold">{filteredLoads.length}</span> available load{filteredLoads.length !== 1 ? 's' : ''}
              </p>
              <select
                value={filters.sortBy}
                onChange={(e) => handleFilterChange('sortBy', e.target.value)}
                className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
              >
                {SORT_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            
            {/* Load Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredLoads.map(load => (
                <LiveLoadCard
                  key={load.id}
                  load={load}
                  onClick={() => handleLoadClick(load)}
                  onBidClick={() => handleBidClick(load)}
                  userLocation={userLocation}
                  existingBid={myBids[load.id]}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {/* Detail Modal */}
      {selectedLoad && (
        <LiveLoadDetailModal
          load={selectedLoad}
          onClose={() => setSelectedLoad(null)}
          onBidClick={() => {
            setLoadToBid(selectedLoad);
            setShowBidModal(true);
            setSelectedLoad(null);
          }}
          userLocation={userLocation}
          existingBid={myBids[selectedLoad.id]}
          loggedInUser={loggedInUser}
        />
      )}

      {/* Bid Modal */}
      {showBidModal && loadToBid && (
        <BidModal
          load={loadToBid}
          onClose={() => {
            setShowBidModal(false);
            setLoadToBid(null);
          }}
          onBidSubmitted={handleBidSubmitted}
          loggedInUser={loggedInUser}
        />
      )}
    </div>
  );
}
