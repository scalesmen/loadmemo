// src/components/liveload/components/BidModal.js
// Modal for carriers to submit bids on LiveLoads

import React, { useState, useEffect } from 'react';
import { collection, addDoc, serverTimestamp, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../../firebase';
import { 
  PLATFORM_CONFIG,
  getInitialBidForm 
} from '../utils/liveLoadConstants';
import {
  formatCurrency,
  formatLocationDisplay,
  formatVehicleDisplay,
  formatTimeRemaining,
  calculateTotalCharge,
  estimateTransitDays
} from '../utils/liveLoadHelpers';

const XIcon = () => (
  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
  </svg>
);

const WarningIcon = () => (
  <svg className="w-5 h-5 text-yellow-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
  </svg>
);

const InfoIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

const CheckIcon = () => (
  <svg className="w-5 h-5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
  </svg>
);

export default function BidModal({ 
  load, 
  onClose, 
  onBidSubmitted, 
  loggedInUser 
}) {
  const [bidForm, setBidForm] = useState(getInitialBidForm());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [insuranceStatus, setInsuranceStatus] = useState({
    checking: true,
    verified: false,
    message: ''
  });

  const timeRemaining = formatTimeRemaining(load.expiresAt);
  const transitDays = load.distanceMiles ? estimateTransitDays(load.distanceMiles) : null;

  // Check carrier insurance verification
  useEffect(() => {
    const checkInsurance = async () => {
      if (!loggedInUser?.tenantId) {
        setInsuranceStatus({
          checking: false,
          verified: false,
          message: 'Please log in to submit bids'
        });
        return;
      }

      try {
        const q = query(
          collection(db, 'carrierInsuranceVerifications'),
          where('carrierId', '==', loggedInUser.tenantId),
          where('status', '==', 'verified')
        );
        const snapshot = await getDocs(q);
        
        if (snapshot.empty) {
          setInsuranceStatus({
            checking: false,
            verified: false,
            message: 'Your insurance must be verified to submit bids. Please contact support.'
          });
        } else {
          const verificationDoc = snapshot.docs[0].data();
          const expiresAt = verificationDoc.insuranceOnFile?.expiresAt?.toDate?.();
          
          if (expiresAt && expiresAt < new Date()) {
            setInsuranceStatus({
              checking: false,
              verified: false,
              message: 'Your insurance has expired. Please update your insurance documents.'
            });
          } else {
            setInsuranceStatus({
              checking: false,
              verified: true,
              message: 'Insurance verified'
            });
          }
        }
      } catch (err) {
        console.error('Error checking insurance:', err);
        setInsuranceStatus({
          checking: false,
          verified: false,
          message: 'Error verifying insurance status'
        });
      }
    };

    checkInsurance();
  }, [loggedInUser?.tenantId]);

  // Pre-fill estimated dates
  useEffect(() => {
    const today = new Date();
    const pickupDate = new Date(today);
    pickupDate.setDate(pickupDate.getDate() + 1); // Tomorrow
    
    const deliveryDate = new Date(pickupDate);
    deliveryDate.setDate(deliveryDate.getDate() + (transitDays || 2));

    setBidForm(prev => ({
      ...prev,
      estimatedPickupDate: pickupDate.toISOString().split('T')[0],
      estimatedDeliveryDate: deliveryDate.toISOString().split('T')[0]
    }));
  }, [transitDays]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setBidForm(prev => ({ ...prev, [name]: value }));
    setError(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    // Validation
    if (!bidForm.bidAmount || parseFloat(bidForm.bidAmount) < PLATFORM_CONFIG.MIN_BID_AMOUNT) {
      setError(`Minimum bid amount is ${formatCurrency(PLATFORM_CONFIG.MIN_BID_AMOUNT)}`);
      return;
    }

    if (!bidForm.estimatedPickupDate) {
      setError('Please enter an estimated pickup date');
      return;
    }

    if (!bidForm.estimatedDeliveryDate) {
      setError('Please enter an estimated delivery date');
      return;
    }

    if (new Date(bidForm.estimatedDeliveryDate) < new Date(bidForm.estimatedPickupDate)) {
      setError('Delivery date must be after pickup date');
      return;
    }

    if (!insuranceStatus.verified) {
      setError('Insurance verification required to submit bids');
      return;
    }

    setIsSubmitting(true);

    try {
      const bidData = {
        liveLoadId: load.id,
        carrierId: loggedInUser.tenantId,
        carrierUserId: loggedInUser.uid,
        carrierName: loggedInUser.companyName || loggedInUser.tenantName || 'Unknown Carrier',
        carrierEmail: loggedInUser.email,
        carrierRating: loggedInUser.carrierRating || null,
        carrierReviewCount: loggedInUser.carrierReviewCount || 0,
        
        bidAmount: parseFloat(bidForm.bidAmount),
        estimatedPickupDate: bidForm.estimatedPickupDate,
        estimatedDeliveryDate: bidForm.estimatedDeliveryDate,
        notes: bidForm.notes.trim(),
        trailerType: bidForm.trailerType,
        availableSpots: parseInt(bidForm.availableSpots) || 1,
        
        status: 'pending',
        createdAt: serverTimestamp(),
        expiresAt: load.expiresAt,
        
        insuranceVerified: true,
        insuranceVerifiedAt: serverTimestamp()
      };

      await addDoc(collection(db, 'liveLoadBids'), bidData);
      
      onBidSubmitted();
    } catch (err) {
      console.error('Error submitting bid:', err);
      setError('Failed to submit bid. Please try again.');
      setIsSubmitting(false);
    }
  };

  const chargeBreakdown = bidForm.bidAmount ? calculateTotalCharge(parseFloat(bidForm.bidAmount)) : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-orange-500 to-orange-600 px-6 py-4 text-white">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold">Place Your Bid</h2>
            <button
              onClick={onClose}
              className="p-1 hover:bg-white/20 rounded-full transition-colors"
            >
              <XIcon />
            </button>
          </div>
          <p className="text-orange-100 text-sm mt-1">
            {formatVehicleDisplay(load.vehicles?.[0])}
            {load.vehicleCount > 1 && ` + ${load.vehicleCount - 1} more`}
          </p>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-180px)]">
          {/* Load Summary */}
          <div className="bg-gray-50 rounded-xl p-4 mb-6">
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm">
                <span className="text-gray-500">Route:</span>
                <div className="font-medium text-gray-900">
                  {formatLocationDisplay(load.pickup)} → {formatLocationDisplay(load.delivery)}
                </div>
              </div>
              {load.distanceMiles && (
                <div className="text-right">
                  <div className="text-lg font-bold text-gray-900">{load.distanceMiles} mi</div>
                  <div className="text-xs text-gray-500">~{transitDays} day{transitDays !== 1 ? 's' : ''}</div>
                </div>
              )}
            </div>
            
            <div className="flex items-center justify-between pt-3 border-t border-gray-200">
              <div>
                <span className="text-sm text-gray-500">Suggested Price:</span>
                <span className="ml-2 text-lg font-bold text-green-600">
                  {load.suggestedPrice ? formatCurrency(load.suggestedPrice) : 'Open'}
                </span>
              </div>
              <div className={`text-sm px-3 py-1 rounded-full ${
                timeRemaining.isUrgent 
                  ? 'bg-red-100 text-red-700' 
                  : 'bg-gray-100 text-gray-700'
              }`}>
                ⏰ {timeRemaining.text}
              </div>
            </div>
          </div>

          {/* Insurance Status */}
          {insuranceStatus.checking ? (
            <div className="flex items-center gap-2 text-gray-500 mb-4">
              <div className="animate-spin rounded-full h-4 w-4 border-2 border-gray-400 border-t-transparent"></div>
              <span className="text-sm">Checking insurance status...</span>
            </div>
          ) : insuranceStatus.verified ? (
            <div className="flex items-center gap-2 text-green-700 bg-green-50 px-4 py-2 rounded-lg mb-4">
              <CheckIcon />
              <span className="text-sm font-medium">{insuranceStatus.message}</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-yellow-700 bg-yellow-50 px-4 py-2 rounded-lg mb-4">
              <WarningIcon />
              <span className="text-sm">{insuranceStatus.message}</span>
            </div>
          )}

          {/* Bid Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Bid Amount */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Your Bid Amount <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
                <input
                  type="number"
                  name="bidAmount"
                  value={bidForm.bidAmount}
                  onChange={handleInputChange}
                  placeholder="Enter your bid"
                  min={PLATFORM_CONFIG.MIN_BID_AMOUNT}
                  max={PLATFORM_CONFIG.MAX_BID_AMOUNT}
                  className="w-full pl-7 pr-4 py-3 text-lg font-semibold border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                  required
                />
              </div>
              {chargeBreakdown && (
                <div className="mt-2 text-sm text-gray-500 flex items-center gap-1">
                  <InfoIcon />
                  <span>
                    You'll receive: {formatCurrency(chargeBreakdown.bidAmount)} 
                    {' '}(Dealer pays {formatCurrency(chargeBreakdown.totalCharge)} incl. 5% platform fee)
                  </span>
                </div>
              )}
            </div>

            {/* Dates Row */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Est. Pickup Date <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  name="estimatedPickupDate"
                  value={bidForm.estimatedPickupDate}
                  onChange={handleInputChange}
                  min={new Date().toISOString().split('T')[0]}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Est. Delivery Date <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  name="estimatedDeliveryDate"
                  value={bidForm.estimatedDeliveryDate}
                  onChange={handleInputChange}
                  min={bidForm.estimatedPickupDate || new Date().toISOString().split('T')[0]}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                  required
                />
              </div>
            </div>

            {/* Trailer Type & Spots */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Trailer Type
                </label>
                <select
                  name="trailerType"
                  value={bidForm.trailerType}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                >
                  <option value="open">Open Carrier</option>
                  <option value="enclosed">Enclosed</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Available Spots
                </label>
                <select
                  name="availableSpots"
                  value={bidForm.availableSpots}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                >
                  {[1,2,3,4,5,6,7,8,9].map(n => (
                    <option key={n} value={n}>{n} spot{n > 1 ? 's' : ''}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Notes for Dealer
              </label>
              <textarea
                name="notes"
                value={bidForm.notes}
                onChange={handleInputChange}
                rows={3}
                placeholder="Any additional information (availability, special equipment, etc.)"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
              />
            </div>

            {/* Error */}
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                {error}
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 px-4 py-3 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 transition-colors"
                disabled={isSubmitting}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting || !insuranceStatus.verified}
                className="flex-1 px-4 py-3 bg-orange-500 text-white rounded-lg font-medium hover:bg-orange-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isSubmitting ? (
                  <>
                    <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent"></div>
                    Submitting...
                  </>
                ) : (
                  <>
                    Submit Bid
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                    </svg>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
