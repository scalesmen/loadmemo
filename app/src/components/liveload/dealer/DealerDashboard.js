// src/components/liveload/dealer/DealerDashboard.js
// Dashboard for dealers to manage their LiveLoads

import React, { useState, useEffect, useCallback } from 'react';
import { collection, query, where, orderBy, onSnapshot, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../../firebase';
import CreateLiveLoadModal from './CreateLiveLoadModal';
import { 
  LIVELOAD_STATUS, 
  LIVELOAD_STATUS_COLORS,
  BID_STATUS 
} from '../utils/liveLoadConstants';
import {
  formatCurrency,
  formatTimeRemaining,
  formatLocationDisplay,
  formatVehicleDisplay,
  getStatusDisplayText,
  sortBids
} from '../utils/liveLoadHelpers';

// Icons
const PlusIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
  </svg>
);

const ClockIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

const CheckIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
  </svg>
);

const XMarkIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
  </svg>
);

export default function DealerDashboard({ loggedInUser, dealerProfile }) {
  // State
  const [myLoads, setMyLoads] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedLoadForBids, setSelectedLoadForBids] = useState(null);
  const [bids, setBids] = useState([]);
  const [activeTab, setActiveTab] = useState('active'); // active | completed | expired
  
  // Stats
  const [stats, setStats] = useState({
    activeLoads: 0,
    totalBids: 0,
    completedThisMonth: 0
  });

  // Fetch dealer's LiveLoads
  useEffect(() => {
    if (!loggedInUser?.uid) return;

    setIsLoading(true);

    const loadsQuery = query(
      collection(db, 'liveLoads'),
      where('dealerId', '==', loggedInUser.uid),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(loadsQuery, (snapshot) => {
      const loads = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      
      setMyLoads(loads);
      
      // Calculate stats
      const active = loads.filter(l => 
        [LIVELOAD_STATUS.POSTED, LIVELOAD_STATUS.BIDDING, LIVELOAD_STATUS.ACCEPTED, LIVELOAD_STATUS.IN_TRANSIT].includes(l.status)
      ).length;
      
      const totalBids = loads.reduce((sum, l) => sum + (l.bidCount || 0), 0);
      
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);
      
      const completed = loads.filter(l => {
        if (l.status !== LIVELOAD_STATUS.COMPLETED && l.status !== LIVELOAD_STATUS.DELIVERED) return false;
        const completedAt = l.completedAt?.toDate?.() || l.createdAt?.toDate?.();
        return completedAt >= startOfMonth;
      }).length;
      
      setStats({ activeLoads: active, totalBids, completedThisMonth: completed });
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [loggedInUser?.uid]);

  // Fetch bids for selected load
  useEffect(() => {
    if (!selectedLoadForBids) {
      setBids([]);
      return;
    }

    const bidsQuery = query(
      collection(db, 'liveLoadBids'),
      where('liveLoadId', '==', selectedLoadForBids.id),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(bidsQuery, (snapshot) => {
      const bidsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setBids(bidsData);
    });

    return () => unsubscribe();
  }, [selectedLoadForBids?.id]);

  // Filter loads by tab
  const filteredLoads = myLoads.filter(load => {
    switch (activeTab) {
      case 'active':
        return [LIVELOAD_STATUS.POSTED, LIVELOAD_STATUS.BIDDING, LIVELOAD_STATUS.ACCEPTED, LIVELOAD_STATUS.IN_TRANSIT].includes(load.status);
      case 'completed':
        return [LIVELOAD_STATUS.DELIVERED, LIVELOAD_STATUS.COMPLETED].includes(load.status);
      case 'expired':
        return [LIVELOAD_STATUS.EXPIRED, LIVELOAD_STATUS.CANCELLED].includes(load.status);
      default:
        return true;
    }
  });

  // Handle bid acceptance
  const handleAcceptBid = async (bid) => {
    if (!selectedLoadForBids) return;
    
    try {
      // Update the bid
      await updateDoc(doc(db, 'liveLoadBids', bid.id), {
        status: BID_STATUS.ACCEPTED,
        'dealerResponse.action': 'accepted',
        'dealerResponse.respondedAt': serverTimestamp()
      });
      
      // Update the LiveLoad
      await updateDoc(doc(db, 'liveLoads', selectedLoadForBids.id), {
        status: LIVELOAD_STATUS.ACCEPTED,
        acceptedBid: {
          bidId: bid.id,
          carrierId: bid.carrierId,
          carrierName: bid.carrierName,
          bidAmount: bid.bidAmount,
          platformFee: bid.bidAmount * 0.05,
          totalCharge: bid.bidAmount * 1.05,
          acceptedAt: serverTimestamp()
        }
      });
      
      // Decline other pending bids
      const otherBids = bids.filter(b => b.id !== bid.id && b.status === BID_STATUS.PENDING);
      for (const otherBid of otherBids) {
        await updateDoc(doc(db, 'liveLoadBids', otherBid.id), {
          status: BID_STATUS.DECLINED,
          'dealerResponse.action': 'declined',
          'dealerResponse.respondedAt': serverTimestamp(),
          'dealerResponse.declineReason': 'Another bid was accepted'
        });
      }
      
      alert('Bid accepted! The carrier will be notified.');
      setSelectedLoadForBids(null);
      
    } catch (error) {
      console.error('Error accepting bid:', error);
      alert('Failed to accept bid. Please try again.');
    }
  };

  // Handle bid decline
  const handleDeclineBid = async (bid) => {
    try {
      await updateDoc(doc(db, 'liveLoadBids', bid.id), {
        status: BID_STATUS.DECLINED,
        'dealerResponse.action': 'declined',
        'dealerResponse.respondedAt': serverTimestamp()
      });
    } catch (error) {
      console.error('Error declining bid:', error);
    }
  };

  // Handle load creation
  const handleLoadCreated = (loadId) => {
    setShowCreateModal(false);
    // Show success message or navigate to the new load
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-orange-500 to-orange-600 shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-white">
                LiveLoad Dashboard
              </h1>
              <p className="text-orange-100 mt-1">
                Manage your vehicle transport posts
              </p>
            </div>
            
            <button
              onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-2 px-6 py-3 bg-white text-orange-600 rounded-lg font-medium hover:bg-orange-50 transition-colors shadow-lg"
            >
              <PlusIcon />
              Post New LiveLoad
            </button>
          </div>
          
          {/* Stats */}
          <div className="grid grid-cols-3 gap-4 mt-6">
            <div className="bg-white/10 backdrop-blur-sm rounded-lg px-4 py-3 text-center">
              <div className="text-3xl font-bold text-white">{stats.activeLoads}</div>
              <div className="text-sm text-orange-100">Active Loads</div>
            </div>
            <div className="bg-white/10 backdrop-blur-sm rounded-lg px-4 py-3 text-center">
              <div className="text-3xl font-bold text-white">{stats.totalBids}</div>
              <div className="text-sm text-orange-100">Total Bids</div>
            </div>
            <div className="bg-white/10 backdrop-blur-sm rounded-lg px-4 py-3 text-center">
              <div className="text-3xl font-bold text-white">{stats.completedThisMonth}</div>
              <div className="text-sm text-orange-100">Completed This Month</div>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Tabs */}
        <div className="flex gap-2 mb-6 bg-white rounded-lg p-1 shadow-sm">
          {[
            { key: 'active', label: 'Active', count: stats.activeLoads },
            { key: 'completed', label: 'Completed' },
            { key: 'expired', label: 'Expired/Cancelled' }
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
                activeTab === tab.key
                  ? 'bg-orange-500 text-white'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              {tab.label}
              {tab.count !== undefined && (
                <span className="ml-2 bg-white/20 px-2 py-0.5 rounded-full text-xs">
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Loads List */}
        {isLoading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-4 border-orange-500 border-t-transparent mx-auto"></div>
            <p className="mt-4 text-gray-600">Loading your LiveLoads...</p>
          </div>
        ) : filteredLoads.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-xl shadow-sm">
            <div className="w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-orange-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
              </svg>
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">No LiveLoads Found</h3>
            <p className="text-gray-600 mb-4">
              {activeTab === 'active' 
                ? "You don't have any active LiveLoads. Post one to get started!"
                : `No ${activeTab} loads to display.`}
            </p>
            {activeTab === 'active' && (
              <button
                onClick={() => setShowCreateModal(true)}
                className="px-6 py-2 bg-orange-500 text-white rounded-lg font-medium hover:bg-orange-600"
              >
                Post Your First LiveLoad
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {filteredLoads.map(load => {
              const timeRemaining = formatTimeRemaining(load.expiresAt);
              const pendingBids = load.bidCount || 0;
              
              return (
                <div 
                  key={load.id}
                  className="bg-white rounded-xl shadow-sm overflow-hidden hover:shadow-md transition-shadow"
                >
                  <div className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="font-semibold text-gray-900">
                            {load.vehicleDisplaySummary || formatVehicleDisplay(load.vehicles?.[0])}
                          </h3>
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${LIVELOAD_STATUS_COLORS[load.status]}`}>
                            {getStatusDisplayText(load.status)}
                          </span>
                        </div>
                        
                        <p className="text-sm text-gray-600 mb-2">
                          {formatLocationDisplay(load.pickup)} → {formatLocationDisplay(load.delivery)}
                        </p>
                        
                        <div className="flex items-center gap-4 text-sm">
                          <span className="text-green-600 font-medium">
                            {load.suggestedPrice ? formatCurrency(load.suggestedPrice) : 'Open'}
                          </span>
                          <span className={`flex items-center gap-1 ${timeRemaining.isUrgent ? 'text-red-600' : 'text-gray-500'}`}>
                            <ClockIcon />
                            {timeRemaining.text}
                          </span>
                          {pendingBids > 0 && (
                            <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                              {pendingBids} bid{pendingBids !== 1 ? 's' : ''}
                            </span>
                          )}
                        </div>
                      </div>
                      
                      {/* Actions */}
                      <div className="flex gap-2">
                        {pendingBids > 0 && load.status !== LIVELOAD_STATUS.ACCEPTED && (
                          <button
                            onClick={() => setSelectedLoadForBids(load)}
                            className="px-4 py-2 bg-orange-500 text-white rounded-lg text-sm font-medium hover:bg-orange-600"
                          >
                            View Bids
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  {/* Accepted Bid Info */}
                  {load.acceptedBid && (
                    <div className="px-4 py-3 bg-green-50 border-t border-green-200">
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="text-sm text-green-700">Accepted Carrier:</span>
                          <span className="ml-2 font-medium text-green-800">{load.acceptedBid.carrierName}</span>
                        </div>
                        <span className="font-bold text-green-700">{formatCurrency(load.acceptedBid.bidAmount)}</span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <CreateLiveLoadModal
          onClose={() => setShowCreateModal(false)}
          onCreated={handleLoadCreated}
          loggedInUser={loggedInUser}
          dealerProfile={dealerProfile}
        />
      )}

      {/* Bids Modal */}
      {selectedLoadForBids && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-hidden">
            <div className="bg-gradient-to-r from-blue-500 to-blue-600 px-6 py-4 text-white flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold">Bids Received</h2>
                <p className="text-blue-100 text-sm">
                  {selectedLoadForBids.vehicleDisplaySummary}
                </p>
              </div>
              <button
                onClick={() => setSelectedLoadForBids(null)}
                className="p-2 hover:bg-white/20 rounded-full"
              >
                <XMarkIcon />
              </button>
            </div>
            
            <div className="p-4 max-h-[60vh] overflow-y-auto">
              {bids.length === 0 ? (
                <p className="text-center text-gray-500 py-8">No bids yet</p>
              ) : (
                <div className="space-y-3">
                  {sortBids(bids, 'price_low').map(bid => (
                    <div 
                      key={bid.id}
                      className={`p-4 rounded-lg border ${
                        bid.status === BID_STATUS.ACCEPTED 
                          ? 'bg-green-50 border-green-200'
                          : bid.status === BID_STATUS.DECLINED
                          ? 'bg-gray-50 border-gray-200 opacity-60'
                          : 'bg-white border-gray-200'
                      }`}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <p className="font-medium text-gray-900">{bid.carrierName}</p>
                          <div className="flex items-center gap-2 text-sm text-gray-500">
                            <span>Pickup: {bid.estimatedPickupDate}</span>
                            <span>•</span>
                            <span>Delivery: {bid.estimatedDeliveryDate}</span>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-xl font-bold text-green-600">{formatCurrency(bid.bidAmount)}</p>
                          <p className="text-xs text-gray-500">+ 5% fee = {formatCurrency(bid.bidAmount * 1.05)}</p>
                        </div>
                      </div>
                      
                      {bid.notes && (
                        <p className="text-sm text-gray-600 mb-3 bg-gray-50 p-2 rounded">
                          "{bid.notes}"
                        </p>
                      )}
                      
                      {bid.status === BID_STATUS.PENDING && (
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleAcceptBid(bid)}
                            className="flex-1 flex items-center justify-center gap-1 py-2 bg-green-500 text-white rounded-lg text-sm font-medium hover:bg-green-600"
                          >
                            <CheckIcon />
                            Accept
                          </button>
                          <button
                            onClick={() => handleDeclineBid(bid)}
                            className="flex-1 flex items-center justify-center gap-1 py-2 bg-gray-200 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-300"
                          >
                            <XMarkIcon />
                            Decline
                          </button>
                        </div>
                      )}
                      
                      {bid.status === BID_STATUS.ACCEPTED && (
                        <div className="text-center text-green-700 font-medium">
                          ✓ Accepted
                        </div>
                      )}
                      
                      {bid.status === BID_STATUS.DECLINED && (
                        <div className="text-center text-gray-500">
                          Declined
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
