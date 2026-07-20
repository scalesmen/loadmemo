// src/components/liveload/components/LiveLoadMap.js
// Map view for LiveLoads using Google Maps

import React, { useState, useCallback, useEffect } from 'react';
import { formatCurrency, formatTimeRemaining, formatLocationDisplay } from '../utils/liveLoadHelpers';

// Note: This requires @react-google-maps/api to be installed
// npm install @react-google-maps/api

export default function LiveLoadMap({
  loads,
  userLocation,
  onLoadClick,
  onBidClick,
  myBids
}) {
  const [selectedLoad, setSelectedLoad] = useState(null);
  const [mapLoaded, setMapLoaded] = useState(false);

  // For now, render a placeholder since Google Maps requires API key setup
  // Replace this with actual Google Maps implementation

  return (
    <div className="bg-white rounded-xl shadow-lg overflow-hidden">
      {/* Map Placeholder */}
      <div className="relative h-[500px] bg-gradient-to-br from-blue-100 to-green-100">
        {/* Placeholder Map UI */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center">
            <svg className="w-16 h-16 text-gray-400 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
            </svg>
            <p className="text-gray-600 font-medium">Map View</p>
            <p className="text-sm text-gray-500 mt-1">
              {loads.length} LiveLoad{loads.length !== 1 ? 's' : ''} available
            </p>
          </div>
        </div>

        {/* Load Markers (simulated) */}
        <div className="absolute inset-0 p-4">
          <div className="grid grid-cols-3 gap-2 h-full overflow-y-auto">
            {loads.slice(0, 9).map((load, index) => (
              <div
                key={load.id}
                onClick={() => onLoadClick(load)}
                className="bg-white rounded-lg shadow-md p-3 cursor-pointer hover:shadow-lg transition-shadow"
              >
                <div className="flex items-start justify-between mb-2">
                  <span className="w-3 h-3 bg-orange-500 rounded-full animate-pulse"></span>
                  <span className="text-xs text-gray-500">
                    {formatTimeRemaining(load.expiresAt).text}
                  </span>
                </div>
                <p className="font-medium text-sm text-gray-900 truncate">
                  {load.vehicleDisplaySummary}
                </p>
                <p className="text-xs text-gray-500 truncate">
                  {formatLocationDisplay(load.pickup)}
                </p>
                <p className="text-sm font-bold text-green-600 mt-1">
                  {load.suggestedPrice ? formatCurrency(load.suggestedPrice) : 'Open'}
                </p>
                {myBids[load.id] && (
                  <span className="inline-block mt-1 bg-green-100 text-green-700 text-xs px-2 py-0.5 rounded">
                    ✓ Bid Placed
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* User Location Indicator */}
        {userLocation && (
          <div className="absolute bottom-4 left-4 bg-white rounded-lg shadow-lg px-3 py-2 flex items-center gap-2">
            <span className="w-3 h-3 bg-blue-500 rounded-full"></span>
            <span className="text-sm text-gray-700">Your Location</span>
          </div>
        )}
      </div>

      {/* Map Legend */}
      <div className="p-4 bg-gray-50 border-t border-gray-200">
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1">
              <span className="w-3 h-3 bg-orange-500 rounded-full"></span>
              <span className="text-gray-600">Available</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="w-3 h-3 bg-green-500 rounded-full"></span>
              <span className="text-gray-600">Your Bid</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="w-3 h-3 bg-blue-500 rounded-full"></span>
              <span className="text-gray-600">You</span>
            </div>
          </div>
          <span className="text-gray-500">
            Showing {Math.min(loads.length, 9)} of {loads.length} loads
          </span>
        </div>
      </div>
    </div>
  );
}

/*
 * FULL GOOGLE MAPS IMPLEMENTATION
 * 
 * To implement actual Google Maps, install @react-google-maps/api and use:
 * 
 * import { GoogleMap, LoadScript, Marker, InfoWindow } from '@react-google-maps/api';
 * 
 * const mapContainerStyle = { width: '100%', height: '500px' };
 * const defaultCenter = { lat: 39.8283, lng: -98.5795 }; // US center
 * 
 * <LoadScript googleMapsApiKey={process.env.REACT_APP_GOOGLE_MAPS_API_KEY}>
 *   <GoogleMap
 *     mapContainerStyle={mapContainerStyle}
 *     center={userLocation || defaultCenter}
 *     zoom={5}
 *   >
 *     {loads.map(load => (
 *       load.pickup?.geopoint && (
 *         <Marker
 *           key={load.id}
 *           position={{
 *             lat: load.pickup.geopoint.latitude,
 *             lng: load.pickup.geopoint.longitude
 *           }}
 *           onClick={() => setSelectedLoad(load)}
 *           icon={{
 *             path: google.maps.SymbolPath.CIRCLE,
 *             fillColor: myBids[load.id] ? '#22c55e' : '#f97316',
 *             fillOpacity: 1,
 *             strokeColor: '#fff',
 *             strokeWeight: 2,
 *             scale: 10
 *           }}
 *         />
 *       )
 *     ))}
 *     
 *     {userLocation && (
 *       <Marker
 *         position={userLocation}
 *         icon={{
 *           path: google.maps.SymbolPath.CIRCLE,
 *           fillColor: '#3b82f6',
 *           fillOpacity: 1,
 *           strokeColor: '#fff',
 *           strokeWeight: 2,
 *           scale: 12
 *         }}
 *       />
 *     )}
 *     
 *     {selectedLoad && (
 *       <InfoWindow
 *         position={{
 *           lat: selectedLoad.pickup.geopoint.latitude,
 *           lng: selectedLoad.pickup.geopoint.longitude
 *         }}
 *         onCloseClick={() => setSelectedLoad(null)}
 *       >
 *         <div>
 *           <h3>{selectedLoad.vehicleDisplaySummary}</h3>
 *           <p>{formatCurrency(selectedLoad.suggestedPrice)}</p>
 *           <button onClick={() => onBidClick(selectedLoad)}>Place Bid</button>
 *         </div>
 *       </InfoWindow>
 *     )}
 *   </GoogleMap>
 * </LoadScript>
 */
