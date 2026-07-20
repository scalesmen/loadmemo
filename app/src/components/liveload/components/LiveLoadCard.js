// src/components/liveload/components/LiveLoadCard.js
// Card component for displaying a LiveLoad in the list view

import React from 'react';
import { 
  LIVELOAD_STATUS_COLORS 
} from '../utils/liveLoadConstants';
import {
  formatCurrency,
  formatTimeRemaining,
  formatLocationDisplay,
  formatVehicleDisplay,
  calculateDistanceMiles,
  getStatusDisplayText
} from '../utils/liveLoadHelpers';

// Icons
const ClockIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

const LocationIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
);

const ArrowIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
  </svg>
);

const CarIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1V8a1 1 0 011-1h2.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V16a1 1 0 01-1 1h-1m-6-1a1 1 0 001 1h1M5 17a2 2 0 104 0m-4 0a2 2 0 114 0m6 0a2 2 0 104 0m-4 0a2 2 0 114 0" />
  </svg>
);

const StarIcon = ({ filled }) => (
  <svg className={`w-4 h-4 ${filled ? 'text-yellow-400 fill-current' : 'text-gray-300'}`} viewBox="0 0 20 20">
    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
  </svg>
);

const CheckCircleIcon = () => (
  <svg className="w-4 h-4 text-green-500" fill="currentColor" viewBox="0 0 20 20">
    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
  </svg>
);

export default function LiveLoadCard({ 
  load, 
  onClick, 
  onBidClick, 
  userLocation,
  existingBid 
}) {
  const timeRemaining = formatTimeRemaining(load.expiresAt);
  const distanceFromUser = userLocation && load.pickup?.geopoint
    ? calculateDistanceMiles(userLocation, {
        latitude: load.pickup.geopoint.latitude,
        longitude: load.pickup.geopoint.longitude
      })
    : null;

  const handleBidClick = (e) => {
    e.stopPropagation();
    onBidClick();
  };

  return (
    <div 
      onClick={onClick}
      className="bg-white rounded-xl shadow-md hover:shadow-xl transition-all duration-300 cursor-pointer border border-gray-100 overflow-hidden group"
    >
      {/* Header with Time & Status */}
      <div className={`px-4 py-2 flex items-center justify-between ${
        timeRemaining.isExpired ? 'bg-red-50' : 
        timeRemaining.isUrgent ? 'bg-orange-50' : 'bg-gray-50'
      }`}>
        <div className={`flex items-center gap-1.5 text-sm font-medium ${
          timeRemaining.isExpired ? 'text-red-700' :
          timeRemaining.isUrgent ? 'text-orange-700' : 'text-gray-700'
        }`}>
          <ClockIcon />
          <span>
            {timeRemaining.isExpired ? 'Expired' : `Expires in ${timeRemaining.text}`}
          </span>
        </div>
        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold border ${LIVELOAD_STATUS_COLORS[load.status]}`}>
          {getStatusDisplayText(load.status)}
        </span>
      </div>

      {/* Content */}
      <div className="p-4">
        {/* Vehicle Info */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="bg-orange-100 p-2 rounded-lg">
              <CarIcon />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 group-hover:text-orange-600 transition-colors">
                {load.vehicleDisplaySummary || formatVehicleDisplay(load.vehicles?.[0])}
              </h3>
              {load.vehicleCount > 1 && (
                <span className="text-xs text-gray-500">
                  +{load.vehicleCount - 1} more vehicle{load.vehicleCount > 2 ? 's' : ''}
                </span>
              )}
            </div>
          </div>
          <div className="text-right">
            <div className="text-xl font-bold text-green-600">
              {load.suggestedPrice ? formatCurrency(load.suggestedPrice) : 'Make Offer'}
            </div>
            {load.distanceMiles && (
              <div className="text-xs text-gray-500">
                {load.distanceMiles} mi route
              </div>
            )}
          </div>
        </div>

        {/* Route */}
        <div className="bg-gray-50 rounded-lg p-3 mb-3">
          <div className="flex items-center gap-2">
            <div className="flex-1">
              <div className="flex items-center gap-1 text-sm">
                <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                <span className="font-medium text-gray-800">
                  {formatLocationDisplay(load.pickup)}
                </span>
              </div>
            </div>
            <ArrowIcon />
            <div className="flex-1 text-right">
              <div className="flex items-center justify-end gap-1 text-sm">
                <span className="font-medium text-gray-800">
                  {formatLocationDisplay(load.delivery)}
                </span>
                <span className="w-2 h-2 bg-red-500 rounded-full"></span>
              </div>
            </div>
          </div>
          {distanceFromUser !== null && (
            <div className="mt-2 pt-2 border-t border-gray-200 text-xs text-gray-500 flex items-center gap-1">
              <LocationIcon />
              <span>{distanceFromUser} miles from your location</span>
            </div>
          )}
        </div>

        {/* Dealer Info */}
        <div className="flex items-center justify-between text-sm mb-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center text-gray-600 font-semibold text-xs">
              {load.dealerName?.charAt(0) || 'D'}
            </div>
            <div>
              <div className="font-medium text-gray-800 truncate max-w-[150px]">
                {load.dealerName || 'Dealer'}
              </div>
              <div className="flex items-center gap-1">
                <div className="flex">
                  {[1, 2, 3, 4, 5].map(star => (
                    <StarIcon key={star} filled={star <= Math.round(load.dealerRating || 0)} />
                  ))}
                </div>
                <span className="text-xs text-gray-500">
                  ({load.dealerReviewCount || 0})
                </span>
              </div>
            </div>
          </div>
          {load.bidCount > 0 && (
            <div className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">
              {load.bidCount} bid{load.bidCount !== 1 ? 's' : ''}
            </div>
          )}
        </div>

        {/* Action Button */}
        {existingBid ? (
          <div className="flex items-center justify-between bg-green-50 border border-green-200 rounded-lg px-4 py-2">
            <div className="flex items-center gap-2">
              <CheckCircleIcon />
              <span className="text-sm font-medium text-green-700">
                Your Bid: {formatCurrency(existingBid.bidAmount)}
              </span>
            </div>
            <span className="text-xs text-green-600 bg-green-100 px-2 py-1 rounded">
              {existingBid.status === 'pending' ? 'Pending' : existingBid.status}
            </span>
          </div>
        ) : timeRemaining.isExpired ? (
          <button 
            disabled
            className="w-full py-2.5 bg-gray-100 text-gray-400 rounded-lg font-medium cursor-not-allowed"
          >
            Expired
          </button>
        ) : (
          <button
            onClick={handleBidClick}
            className="w-full py-2.5 bg-orange-500 hover:bg-orange-600 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2 group"
          >
            <span>Place Bid</span>
            <svg className="w-4 h-4 transform group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          </button>
        )}
      </div>

      {/* Urgency Indicator */}
      {timeRemaining.isUrgent && !timeRemaining.isExpired && (
        <div className="bg-gradient-to-r from-orange-500 to-red-500 text-white text-center py-1.5 text-xs font-bold animate-pulse">
          ⚡ EXPIRING SOON - ACT NOW!
        </div>
      )}
    </div>
  );
}
