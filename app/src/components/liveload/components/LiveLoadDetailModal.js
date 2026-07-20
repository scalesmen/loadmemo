// src/components/liveload/components/LiveLoadDetailModal.js
// Detailed view modal for a LiveLoad

import React from 'react';
import {
  formatCurrency,
  formatTimeRemaining,
  formatLocationDisplay,
  formatVehicleDisplay,
  formatPhoneNumber,
  calculateDistanceMiles,
  getStatusDisplayText,
  maskSensitiveInfo
} from '../utils/liveLoadHelpers';
import { LIVELOAD_STATUS_COLORS } from '../utils/liveLoadConstants';

const XIcon = () => (
  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
  </svg>
);

export default function LiveLoadDetailModal({
  load,
  onClose,
  onBidClick,
  userLocation,
  existingBid,
  loggedInUser
}) {
  const timeRemaining = formatTimeRemaining(load.expiresAt);
  const distanceFromUser = userLocation && load.pickup?.geopoint
    ? calculateDistanceMiles(userLocation, {
        latitude: load.pickup.geopoint.latitude,
        longitude: load.pickup.geopoint.longitude
      })
    : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-orange-500 to-orange-600 px-6 py-4 text-white">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold">
                {load.vehicleDisplaySummary || formatVehicleDisplay(load.vehicles?.[0])}
              </h2>
              <p className="text-orange-100 text-sm">
                {load.vehicleCount > 1 && `+${load.vehicleCount - 1} more • `}
                {load.referenceId || load.id?.slice(0, 8)}
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-white/20 rounded-full transition-colors"
            >
              <XIcon />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-200px)]">
          {/* Status & Time */}
          <div className="flex items-center justify-between mb-6 p-4 bg-gray-50 rounded-xl">
            <div>
              <span className={`px-3 py-1 rounded-full text-sm font-semibold border ${LIVELOAD_STATUS_COLORS[load.status]}`}>
                {getStatusDisplayText(load.status)}
              </span>
            </div>
            <div className={`text-right ${timeRemaining.isUrgent ? 'text-red-600' : 'text-gray-600'}`}>
              <div className="text-sm">Expires in</div>
              <div className="text-lg font-bold">{timeRemaining.text}</div>
            </div>
          </div>

          {/* Route */}
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-gray-500 uppercase mb-3">Route</h3>
            <div className="bg-gradient-to-r from-green-50 to-red-50 rounded-xl p-4">
              <div className="flex items-start gap-4">
                {/* Pickup */}
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="w-3 h-3 bg-green-500 rounded-full"></span>
                    <span className="text-xs font-semibold text-green-700 uppercase">Pickup</span>
                  </div>
                  <p className="font-medium text-gray-900">
                    {load.pickup?.facilityName || 'Pickup Location'}
                  </p>
                  <p className="text-sm text-gray-600">
                    {formatLocationDisplay(load.pickup)}
                  </p>
                  {/* Note: Full address hidden until bid accepted */}
                  <p className="text-xs text-gray-400 mt-1 italic">
                    Full address revealed when bid accepted
                  </p>
                </div>

                {/* Arrow */}
                <div className="flex flex-col items-center justify-center text-gray-400 pt-6">
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                  </svg>
                  {load.distanceMiles && (
                    <span className="text-xs mt-1">{load.distanceMiles} mi</span>
                  )}
                </div>

                {/* Delivery */}
                <div className="flex-1 text-right">
                  <div className="flex items-center justify-end gap-2 mb-2">
                    <span className="text-xs font-semibold text-red-700 uppercase">Delivery</span>
                    <span className="w-3 h-3 bg-red-500 rounded-full"></span>
                  </div>
                  <p className="font-medium text-gray-900">
                    {load.delivery?.facilityName || 'Delivery Location'}
                  </p>
                  <p className="text-sm text-gray-600">
                    {formatLocationDisplay(load.delivery)}
                  </p>
                </div>
              </div>

              {distanceFromUser && (
                <div className="mt-4 pt-4 border-t border-gray-200 text-center">
                  <span className="text-sm text-gray-500">
                    📍 {distanceFromUser} miles from your current location
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Vehicles */}
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-gray-500 uppercase mb-3">
              Vehicle{load.vehicleCount > 1 ? 's' : ''} ({load.vehicleCount})
            </h3>
            <div className="space-y-2">
              {load.vehicles?.map((vehicle, index) => (
                <div key={index} className="bg-gray-50 rounded-lg p-3 flex items-center justify-between">
                  <div>
                    <p className="font-medium text-gray-900">
                      {formatVehicleDisplay(vehicle)}
                    </p>
                    <p className="text-sm text-gray-500">
                      VIN: {maskSensitiveInfo(vehicle.vin, 4)} 
                      <span className="text-xs italic"> (full VIN revealed when accepted)</span>
                    </p>
                  </div>
                  {vehicle.condition === 'inoperable' && (
                    <span className="bg-red-100 text-red-700 text-xs px-2 py-1 rounded">
                      ⚠️ INOP
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Pricing */}
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-gray-500 uppercase mb-3">Pricing</h3>
            <div className="bg-green-50 rounded-xl p-4 flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Suggested Price</p>
                <p className="text-2xl font-bold text-green-600">
                  {load.suggestedPrice ? formatCurrency(load.suggestedPrice) : 'Open for Bids'}
                </p>
              </div>
              {load.bidCount > 0 && (
                <div className="text-right">
                  <p className="text-sm text-gray-600">Current Bids</p>
                  <p className="text-lg font-semibold text-gray-900">{load.bidCount}</p>
                </div>
              )}
            </div>
          </div>

          {/* Dealer Info */}
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-gray-500 uppercase mb-3">Posted By</h3>
            <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-xl">
              <div className="w-12 h-12 bg-orange-200 rounded-full flex items-center justify-center text-orange-700 font-bold text-lg">
                {load.dealerName?.charAt(0) || 'D'}
              </div>
              <div className="flex-1">
                <p className="font-medium text-gray-900">{load.dealerName || 'Dealer'}</p>
                <div className="flex items-center gap-2 text-sm">
                  <div className="flex text-yellow-400">
                    {'★'.repeat(Math.round(load.dealerRating || 0))}
                    {'☆'.repeat(5 - Math.round(load.dealerRating || 0))}
                  </div>
                  <span className="text-gray-500">
                    ({load.dealerReviewCount || 0} reviews)
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-gray-50 border-t border-gray-200">
          {existingBid ? (
            <div className="flex items-center justify-between bg-green-100 p-4 rounded-lg">
              <div>
                <p className="font-medium text-green-800">Your Bid Submitted</p>
                <p className="text-green-600">{formatCurrency(existingBid.bidAmount)}</p>
              </div>
              <span className="bg-green-200 text-green-800 px-3 py-1 rounded-full text-sm">
                {existingBid.status}
              </span>
            </div>
          ) : timeRemaining.isExpired ? (
            <button
              disabled
              className="w-full py-3 bg-gray-200 text-gray-500 rounded-lg font-medium cursor-not-allowed"
            >
              This LiveLoad Has Expired
            </button>
          ) : (
            <button
              onClick={onBidClick}
              className="w-full py-3 bg-orange-500 text-white rounded-lg font-medium hover:bg-orange-600 transition-colors flex items-center justify-center gap-2"
            >
              Place Your Bid
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
