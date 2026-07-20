// src/components/loads/components/LoadsMapView/index.js
import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { GoogleMap, LoadScript, Marker, DirectionsRenderer, OverlayView } from '@react-google-maps/api';

// Move libraries outside component to prevent reloading
const LIBRARIES = ['places', 'geometry'];

const mapContainerStyle = {
  width: '100%',
  height: '600px'
};

const defaultCenter = {
  lat: 39.8283,
  lng: -98.5795 // Center of USA
};

// Status colors mapping - matching your existing table colors
const STATUS_COLORS = {
  'Booked': '#3B82F6', // blue
  'Dispatched': '#3B82F6', // blue (same as Booked)
  'At Shipper': '#3B82F6', // blue (same as Booked)
  'In Transit': '#F59E0B', // orange
  'At Receiver': '#10B981', // green
  'Issue': '#EF4444' // red
};

// Statuses to show on map (excluding Delivered)
const VISIBLE_STATUSES = ['Booked', 'Dispatched', 'At Shipper', 'In Transit', 'At Receiver', 'Issue'];

const LoadsMapView = ({
  loads = [],
  drivers = [],
  trucks = [],
  brokers = [],
  isAutomobileHauling = false,
  googleMapsApiKey,
  formatDateOnly,
  extractCityStateZip,
  applicationTimeZone,
  suggestedLoads = [], // Add this prop
  showSuggestedLoads = false, // Add this prop
  onToggleSuggestedLoads // Add this prop
}) => {
  const [selectedLoad, setSelectedLoad] = useState(null);
  const [directions, setDirections] = useState(null);
  const [directionsRenderer, setDirectionsRenderer] = useState(null);
  const [map, setMap] = useState(null);
  const [geocodedLoads, setGeocodedLoads] = useState([]);
  const [isGeocoding, setIsGeocoding] = useState(true);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [planningMode, setPlanningMode] = useState(false);
  const [plannedRoutes, setPlannedRoutes] = useState([]);
  const [planningTotals, setPlanningTotals] = useState({ miles: 0, amount: 0 });
  const [routeDistance, setRouteDistance] = useState(null);
  const [tollData, setTollData] = useState(null);
  const [manualRouteMode, setManualRouteMode] = useState(false);
  const [manualRoutePoints, setManualRoutePoints] = useState([]);
  const [searchBox, setSearchBox] = useState(null);
  const searchInputRef = useRef(null);

  // Filter loads to only show non-delivered statuses
  const visibleLoads = useMemo(() => {
    return loads.filter(load => VISIBLE_STATUSES.includes(load.status));
  }, [loads]);

  console.log('LoadsMapView - Visible loads:', {
    totalLoads: loads.length,
    visibleLoads: visibleLoads.length,
    statuses: visibleLoads.map(l => l.status)
  });

  // Custom Draggable Info Box Component
  const DraggableInfoBox = ({ position, onClose, children }) => {
    const [isDragging, setIsDragging] = useState(false);
    const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
    const [boxPosition, setBoxPosition] = useState({ x: 20, y: -200 }); // Initial offset from marker

    const handleMouseDown = (e) => {
      setIsDragging(true);
      const rect = e.currentTarget.getBoundingClientRect();
      setDragOffset({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      });
    };

    useEffect(() => {
      const handleMouseMove = (e) => {
        if (isDragging) {
          const mapDiv = document.querySelector('#google-map');
          const mapRect = mapDiv.getBoundingClientRect();
          const newX = e.clientX - mapRect.left - dragOffset.x;
          const newY = e.clientY - mapRect.top - dragOffset.y;
          
          setBoxPosition({ x: newX, y: newY });
        }
      };

      const handleMouseUp = () => {
        setIsDragging(false);
      };

      if (isDragging) {
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
        return () => {
          document.removeEventListener('mousemove', handleMouseMove);
          document.removeEventListener('mouseup', handleMouseUp);
        };
      }
    }, [isDragging, dragOffset]);

    return (
      <OverlayView
        position={position}
        mapPaneName={OverlayView.OVERLAY_MOUSE_TARGET}
        getPixelPositionOffset={() => ({ x: boxPosition.x, y: boxPosition.y })}
      >
        <div
          style={{
            position: 'absolute',
            background: 'white',
            border: '1px solid #ccc',
            borderRadius: '8px',
            boxShadow: '0 2px 7px 1px rgba(0,0,0,0.3)',
            cursor: isDragging ? 'grabbing' : 'grab',
            userSelect: 'none'
          }}
          onMouseDown={handleMouseDown}
        >
          <div style={{
            borderBottom: '1px solid #eee',
            padding: '4px 8px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            backgroundColor: '#f5f5f5',
            borderTopLeftRadius: '8px',
            borderTopRightRadius: '8px',
            fontSize: '11px',
            color: '#666'
          }}>
            <span>↔ Drag to move</span>
            <button
              onClick={onClose}
              style={{
                border: 'none',
                background: 'none',
                fontSize: '16px',
                cursor: 'pointer',
                padding: '0 4px',
                color: '#666'
              }}
            >
              ×
            </button>
          </div>
          <div style={{ padding: '8px' }}>
            {children}
          </div>
        </div>
      </OverlayView>
    );
  };
  const getMarkerIcon = useCallback((status, type = 'pickup') => {
    const color = STATUS_COLORS[status];
    const isPickup = type === 'pickup';
    
    // Different icons for pickup vs delivery
    const iconUrl = isPickup 
      ? 'https://maps.google.com/mapfiles/ms/icons/warehouse.png' // Warehouse icon for pickup
      : 'https://maps.google.com/mapfiles/ms/icons/truck.png'; // Truck icon for delivery
    
    return {
      url: iconUrl,
      scaledSize: new window.google.maps.Size(isPickup ? 40 : 35, isPickup ? 40 : 35),
      anchor: new window.google.maps.Point(20, 20)
    };
  }, []);

  // Custom colored marker for status
  const getStatusMarker = useCallback((status) => {
    const color = STATUS_COLORS[status] || '#6B7280';
    
    // Create SVG data URL for custom colored marker
    const svg = `
      <svg width="40" height="40" viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">
        <path d="M20 2C12.5 2 6.5 8 6.5 15.5C6.5 24.5 20 38 20 38S33.5 24.5 33.5 15.5C33.5 8 27.5 2 20 2Z" 
              fill="${color}" stroke="#FFFFFF" stroke-width="2"/>
        <circle cx="20" cy="15" r="6" fill="#FFFFFF"/>
      </svg>
    `;
    
    return {
      url: 'data:image/svg+xml;base64,' + btoa(svg),
      scaledSize: new window.google.maps.Size(40, 40),
      anchor: new window.google.maps.Point(20, 40),
      labelOrigin: new window.google.maps.Point(20, 15)
    };
  }, []);

  // Geocode visible loads
  useEffect(() => {
    if (!mapLoaded || !visibleLoads.length) {
      console.log('Geocoding skipped:', { mapLoaded, visibleLoadsCount: visibleLoads.length });
      setIsGeocoding(false);
      return;
    }
    
    // Add a small delay to ensure Google Maps API is fully initialized
    const timeoutId = setTimeout(() => {
      if (!window.google || !window.google.maps || !window.google.maps.Geocoder) {
        console.error('Google Maps API not fully loaded');
        setIsGeocoding(false);
        return;
      }
      
      console.log('Starting geocoding for visible loads:', visibleLoads.length);
      setIsGeocoding(true);
      const geocoder = new window.google.maps.Geocoder();
      const geocodePromises = [];
    
    visibleLoads.forEach(load => {
      if (!load.pickupLocation || !load.deliveryLocation) {
        console.log('Skipping load - missing locations:', load.load_id);
        return;
      }
      
      const loadWithCoords = { ...load };
      
      // Geocode pickup
      const pickupPromise = new Promise((resolve) => {
        geocoder.geocode({ address: load.pickupLocation }, (results, status) => {
          if (status === 'OK' && results[0]) {
            loadWithCoords.pickupCoords = {
              lat: results[0].geometry.location.lat(),
              lng: results[0].geometry.location.lng()
            };
          }
          resolve();
        });
      });
      
      // Geocode delivery
      const deliveryPromise = new Promise((resolve) => {
        geocoder.geocode({ address: load.deliveryLocation }, (results, status) => {
          if (status === 'OK' && results[0]) {
            loadWithCoords.deliveryCoords = {
              lat: results[0].geometry.location.lat(),
              lng: results[0].geometry.location.lng()
            };
          }
          resolve();
        });
      });
      
      geocodePromises.push(
        Promise.all([pickupPromise, deliveryPromise]).then(() => loadWithCoords)
      );
    });
    
    Promise.all(geocodePromises).then(geocodedResults => {
      const validLoads = geocodedResults.filter(load => 
        load.pickupCoords || load.deliveryCoords
      );
      console.log('Geocoding complete:', { 
        totalLoads: geocodedResults.length, 
        validLoads: validLoads.length
      });
      setGeocodedLoads(validLoads);
      setIsGeocoding(false);
      
      // Fit bounds to show all markers
      if (map && validLoads.length > 0) {
        const bounds = new window.google.maps.LatLngBounds();
        validLoads.forEach(load => {
          if (load.pickupCoords) bounds.extend(load.pickupCoords);
          if (load.deliveryCoords) bounds.extend(load.deliveryCoords);
        });
        map.fitBounds(bounds);
        }
      });
    }, 100);
    
    return () => clearTimeout(timeoutId);
  }, [visibleLoads, mapLoaded, map]);

  // Handle pickup marker click
  const handlePickupMarkerClick = useCallback((load) => {
    if (planningMode) {
      // In planning mode, add routes to collection
      if (load.pickupCoords && load.deliveryCoords && window.google) {
        const directionsService = new window.google.maps.DirectionsService();
        
        directionsService.route(
          {
            origin: load.pickupCoords,
            destination: load.deliveryCoords,
            travelMode: window.google.maps.TravelMode.DRIVING,
            provideRouteAlternatives: false,
            avoidTolls: false
          },
          (result, status) => {
            if (status === 'OK' && result.routes && result.routes[0]) {
              const route = result.routes[0];
              let totalDistance = 0;
              route.legs.forEach(leg => {
                totalDistance += leg.distance.value;
              });
              const miles = Math.round(totalDistance * 0.000621371);
              
              // Add to planned routes
              setPlannedRoutes(prev => [...prev, {
                loadId: load.docId,
                load: load,
                directions: result,
                miles: miles,
                amount: Number(load.amount) || 0,
                color: STATUS_COLORS[load.status] || '#6B7280'
              }]);
              
              // Update totals
              setPlanningTotals(prev => ({
                miles: prev.miles + miles,
                amount: prev.amount + (Number(load.amount) || 0)
              }));
            }
          }
        );
      }
    } else {
      // Normal mode - single route display
      setSelectedLoad(load);
      setRouteDistance(null);
      setTollData(null);
      
      if (load.pickupCoords && load.deliveryCoords && window.google) {
        const directionsService = new window.google.maps.DirectionsService();
        
        directionsService.route(
          {
            origin: load.pickupCoords,
            destination: load.deliveryCoords,
            travelMode: window.google.maps.TravelMode.DRIVING,
            provideRouteAlternatives: true,
            avoidTolls: false
          },
          (result, status) => {
            if (status === 'OK') {
              setDirections(result);
              
              if (result.routes && result.routes[0]) {
                const route = result.routes[0];
                let totalDistance = 0;
                route.legs.forEach(leg => {
                  totalDistance += leg.distance.value;
                });
                const miles = Math.round(totalDistance * 0.000621371);
                setRouteDistance(miles);
                
                const hasTolls = route.legs.some(leg => 
                  leg.steps.some(step => step.instructions && step.instructions.includes('toll'))
                );
                if (hasTolls) {
                  setTollData({ hasTolls: true, message: 'This route includes toll roads' });
                }
              }
            } else if (status === 'ZERO_RESULTS') {
              console.warn(`No route found for load ${load.load_id} - check addresses`);
              setTollData({ 
                hasTolls: false, 
                message: '⚠️ No driving route found between locations' 
              });
            } else {
              console.error(`Directions request failed: ${status}`);
            }
          }
        );
      }
    }
  }, [planningMode]);

  // Simplified info window content
  const getInfoWindowContent = useCallback((load) => {
    const driver = drivers.find(d => d.id === load.driverId);
    
    return (
      <div style={{ minWidth: '220px', padding: '8px' }}>
        <h3 style={{ margin: '0 0 6px 0', color: '#1a73e8', fontSize: '15px' }}>
          Load #{load.load_id}
        </h3>
        
        <div style={{ fontSize: '13px', lineHeight: '1.4' }}>
          <div style={{ marginBottom: '4px' }}>
            <strong>Pickup:</strong> <span style={{ color: '#555', fontSize: '12px' }}>{load.pickupLocation}</span>
          </div>
          
          <div style={{ marginBottom: '4px' }}>
            <strong>Delivery:</strong> <span style={{ color: '#555', fontSize: '12px' }}>{load.deliveryLocation}</span>
          </div>
          
          {driver && (
            <div style={{ marginBottom: '4px' }}>
              <strong>Driver:</strong> {driver.name}
            </div>
          )}
          
          <div style={{ marginBottom: '3px' }}>
            <strong>Amount:</strong> ${Number(load.amount).toLocaleString()}
          </div>
          
          <div style={{ marginBottom: '3px' }}>
            <strong>Miles:</strong> {load.mileage || 'N/A'}
            {routeDistance && routeDistance !== Number(load.mileage) && (
              <span style={{ color: '#ea4335', fontSize: '11px', marginLeft: '6px' }}>
                (Route: {routeDistance} mi)
              </span>
            )}
          </div>
          
          {tollData && tollData.hasTolls && (
            <div style={{ 
              marginTop: '6px', 
              padding: '4px 6px', 
              backgroundColor: '#fef3c7', 
              borderRadius: '3px',
              fontSize: '11px',
              color: '#92400e'
            }}>
              ⚠️ {tollData.message}
            </div>
          )}
        </div>
      </div>
    );
  }, [drivers, routeDistance, tollData]);

  // Handle map click for manual route mode
  const handleMapClick = useCallback((event) => {
    if (manualRouteMode && planningMode) {
      const clickedLocation = {
        lat: event.latLng.lat(),
        lng: event.latLng.lng()
      };
      
      if (manualRoutePoints.length < 2) {
        setManualRoutePoints(prev => [...prev, clickedLocation]);
        
        // If we have 2 points, calculate route
        if (manualRoutePoints.length === 1) {
          const directionsService = new window.google.maps.DirectionsService();
          
          directionsService.route(
            {
              origin: manualRoutePoints[0],
              destination: clickedLocation,
              travelMode: window.google.maps.TravelMode.DRIVING,
              provideRouteAlternatives: false,
              avoidTolls: false
            },
            (result, status) => {
              if (status === 'OK' && result.routes && result.routes[0]) {
                const route = result.routes[0];
                let totalDistance = 0;
                route.legs.forEach(leg => {
                  totalDistance += leg.distance.value;
                });
                const miles = Math.round(totalDistance * 0.000621371);
                
                // Add manual route to planned routes
                setPlannedRoutes(prev => [...prev, {
                  loadId: `manual-${Date.now()}`,
                  load: { 
                    load_id: 'Manual Route',
                    pickupLocation: 'Point A',
                    deliveryLocation: 'Point B',
                    amount: 0,
                    status: 'Manual'
                  },
                  directions: result,
                  miles: miles,
                  amount: 0,
                  color: '#9333ea' // Purple for manual routes
                }]);
                
                // Update totals
                setPlanningTotals(prev => ({
                  miles: prev.miles + miles,
                  amount: prev.amount
                }));
                
                // Reset manual route mode
                setManualRouteMode(false);
                setManualRoutePoints([]);
              }
            }
          );
        }
      }
    }
  }, [manualRouteMode, planningMode, manualRoutePoints]);

  // Initialize search functionality with Places Autocomplete
  useEffect(() => {
    if (mapLoaded && map && searchInputRef.current && window.google) {
      try {
        // Create the search box and link it to the UI element
        const input = searchInputRef.current;
        const searchBox = new window.google.maps.places.SearchBox(input);
        
        // Bias the SearchBox results towards current map's viewport
        map.addListener('bounds_changed', () => {
          searchBox.setBounds(map.getBounds());
        });

        // Listen for the event fired when the user selects a prediction
        searchBox.addListener('places_changed', () => {
          const places = searchBox.getPlaces();

          if (places.length === 0) {
            return;
          }

          // For each place, get the location
          const bounds = new window.google.maps.LatLngBounds();
          places.forEach((place) => {
            if (!place.geometry || !place.geometry.location) {
              console.log("Returned place contains no geometry");
              return;
            }

            if (place.geometry.viewport) {
              // Only geocodes have viewport
              bounds.union(place.geometry.viewport);
            } else {
              bounds.extend(place.geometry.location);
            }
          });
          map.fitBounds(bounds);
        });

        setSearchBox(searchBox);
        console.log('Search box initialized successfully');
      } catch (error) {
        console.error('Error initializing search:', error);
      }
    }
  }, [mapLoaded, map]);

  const onMapLoad = useCallback((map) => {
    setMap(map);
    setMapLoaded(true);
    console.log('Map loaded successfully');
  }, []);

  // Handle directions renderer load
  const onDirectionsRendererLoad = useCallback((directionsRenderer) => {
    setDirectionsRenderer(directionsRenderer);
  }, []);

  // Status legend component
  const StatusLegend = () => (
    <div style={{
      position: 'absolute',
      top: '70px',
      right: '10px',
      backgroundColor: 'white',
      padding: '10px',
      borderRadius: '8px',
      boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
      fontSize: '13px',
      zIndex: 1000
    }}>
      <div style={{ fontWeight: 'bold', marginBottom: '8px' }}>Load Status</div>
      {Object.entries(STATUS_COLORS).map(([status, color]) => (
        <div key={status} style={{ display: 'flex', alignItems: 'center', marginBottom: '4px' }}>
          <div style={{
            width: '12px',
            height: '12px',
            backgroundColor: color,
            borderRadius: '50%',
            marginRight: '8px'
          }} />
          <span>{status}</span>
        </div>
      ))}
    </div>
  );

  return (
    <LoadScript googleMapsApiKey={googleMapsApiKey} libraries={LIBRARIES}>
      <div style={{ position: 'relative' }}>
        {isGeocoding && (
          <div style={{
            position: 'absolute',
            top: '10px',
            left: '50%',
            transform: 'translateX(-50%)',
            backgroundColor: 'white',
            padding: '10px 20px',
            borderRadius: '4px',
            boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
            zIndex: 1000
          }}>
            <span>📍 Loading active loads...</span>
          </div>
        )}
        
        {/* Search Box Input - Outside GoogleMap to avoid covering controls */}
        <div style={{
          position: 'absolute',
          top: '10px',
          left: '10px',
          zIndex: 1000
        }}>
          <input
            ref={searchInputRef}
            type="text"
            placeholder="Search for a location"
            style={{
              boxSizing: 'border-box',
              border: '1px solid transparent',
              width: '300px',
              height: '40px',
              padding: '0 12px',
              borderRadius: '3px',
              boxShadow: '0 2px 6px rgba(0, 0, 0, 0.3)',
              fontSize: '14px',
              outline: 'none',
              textOverflow: 'ellipses',
              backgroundColor: 'white'
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && e.target.value.trim()) {
                // Geocode the address when Enter is pressed
                if (window.google && window.google.maps) {
                  const geocoder = new window.google.maps.Geocoder();
                  geocoder.geocode({ address: e.target.value }, (results, status) => {
                    if (status === 'OK' && results[0] && map) {
                      const location = results[0].geometry.location;
                      map.setCenter(location);
                      map.setZoom(15);
                    }
                  });
                }
              }
            }}
          />
        </div>
        
        <GoogleMap
          id="google-map"
          mapContainerStyle={mapContainerStyle}
          center={defaultCenter}
          zoom={5}
          onLoad={onMapLoad}
          onClick={handleMapClick}
          options={{
            zoomControl: true,
            streetViewControl: false,
            mapTypeControl: true,
            mapTypeControlOptions: {
              position: window.google?.maps?.ControlPosition?.TOP_RIGHT
            },
            fullscreenControl: true
          }}
        >
          {/* Manual route markers */}
          {manualRouteMode && manualRoutePoints.map((point, index) => (
            <Marker
              key={`manual-point-${index}`}
              position={point}
              icon={{
                url: 'https://maps.google.com/mapfiles/ms/icons/green-dot.png',
                scaledSize: new window.google.maps.Size(40, 40)
              }}
              label={{
                text: index === 0 ? 'A' : 'B',
                color: 'white',
                fontWeight: 'bold',
                fontSize: '14px'
              }}
              title={index === 0 ? 'Manual Route Start' : 'Manual Route End'}
            />
          ))}
          {/* Render pickup markers ONLY */}
          {geocodedLoads.map(load => (
            load.pickupCoords && (
              <Marker
                key={`pickup-${load.docId}`}
                position={load.pickupCoords}
                icon={getStatusMarker(load.status)}
                label={{
                  text: 'P',
                  color: 'white',
                  fontWeight: 'bold',
                  fontSize: '12px'
                }}
                title={`Pickup: ${load.load_id} - ${load.status}`}
                onClick={() => handlePickupMarkerClick(load)}
              />
            )
          ))}
          
          {/* Render delivery markers with simple icon (no click handler) */}
          {geocodedLoads.map(load => (
            load.deliveryCoords && (
              <Marker
                key={`delivery-${load.docId}`}
                position={load.deliveryCoords}
                icon={{
                  url: 'https://maps.google.com/mapfiles/ms/icons/purple-dot.png',
                  scaledSize: new window.google.maps.Size(30, 30)
                }}
                label={{
                  text: 'D',
                  color: 'white',
                  fontWeight: 'bold',
                  fontSize: '11px'
                }}
                title={`Delivery for Load #${load.load_id}`}
              />
            )
          ))}
          
          {/* Draggable Info Window */}
          {selectedLoad && selectedLoad.pickupCoords && (
            <DraggableInfoBox
              position={selectedLoad.pickupCoords}
              onClose={() => {
                setSelectedLoad(null);
                setDirections(null);
                setRouteDistance(null);
                setTollData(null);
              }}
            >
              {getInfoWindowContent(selectedLoad)}
            </DraggableInfoBox>
          )}
          
          {/* Directions renderer for single route (non-planning mode) */}
          {directions && !planningMode && (
            <DirectionsRenderer
              directions={directions}
              options={{
                suppressMarkers: true,
                draggable: true,
                polylineOptions: {
                  strokeColor: selectedLoad ? (STATUS_COLORS[selectedLoad.status] || '#4285F4') : '#4285F4',
                  strokeOpacity: 0.8,
                  strokeWeight: 5
                }
              }}
              onLoad={onDirectionsRendererLoad}
              onDirectionsChanged={() => {
                if (directionsRenderer) {
                  const newDirections = directionsRenderer.getDirections();
                  if (newDirections && newDirections.routes && newDirections.routes[0]) {
                    let totalDistance = 0;
                    newDirections.routes[0].legs.forEach(leg => {
                      totalDistance += leg.distance.value;
                    });
                    const miles = Math.round(totalDistance * 0.000621371);
                    setRouteDistance(miles);
                  }
                }
              }}
            />
          )}
          
          {/* Directions renderers for planning mode */}
          {planningMode && plannedRoutes.map((route, index) => {
            // Create a local renderer variable for each route
            let localRenderer = null;
            
            return (
              <DirectionsRenderer
                key={`route-${route.loadId}-${index}`}
                directions={route.directions}
                options={{
                  suppressMarkers: true,
                  draggable: true,  // Enable dragging in planning mode
                  polylineOptions: {
                    strokeColor: route.color,
                    strokeOpacity: 0.7,
                    strokeWeight: 4
                  }
                }}
                onLoad={(renderer) => {
                  localRenderer = renderer;
                }}
                onDirectionsChanged={() => {
                  // Delay execution to avoid render cycle issues
                  setTimeout(() => {
                    if (localRenderer) {
                      const newDirections = localRenderer.getDirections();
                      if (newDirections && newDirections.routes && newDirections.routes[0]) {
                        let totalDistance = 0;
                        newDirections.routes[0].legs.forEach(leg => {
                          totalDistance += leg.distance.value;
                        });
                        const miles = Math.round(totalDistance * 0.000621371);
                        
                        // Update only if miles changed
                        if (miles !== route.miles) {
                          setPlannedRoutes(prev => {
                            const updatedRoutes = prev.map(r => 
                              r.loadId === route.loadId 
                                ? { ...r, miles: miles, directions: newDirections }
                                : r
                            );
                            
                            // Recalculate totals
                            const newTotalMiles = updatedRoutes.reduce((sum, r) => sum + r.miles, 0);
                            const newTotalAmount = updatedRoutes.reduce((sum, r) => sum + r.amount, 0);
                            
                            setPlanningTotals({
                              miles: newTotalMiles,
                              amount: newTotalAmount
                            });
                            
                            return updatedRoutes;
                          });
                        }
                      }
                    }
                  }, 0);
                }}
              />
            );
          })}
        </GoogleMap>
        
        {/* Status Legend */}
        <StatusLegend />
        
        {/* Planning Mode Controls - Moved under Status Legend */}
        <div style={{
          position: 'absolute',
          top: '240px',  // Changed from '10px' to position below Status Legend
          right: '10px', // Changed from 'left' to 'right' to align with Status Legend
          backgroundColor: 'white',
          padding: '15px',
          borderRadius: '8px',
          boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
          zIndex: 1000
        }}>
          <label style={{
            display: 'flex',
            alignItems: 'center',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: 'bold'
          }}>
            <input
              type="checkbox"
              checked={planningMode}
              onChange={(e) => {
                setPlanningMode(e.target.checked);
                if (!e.target.checked) {
                  // Clear planning data when disabled
                  setPlannedRoutes([]);
                  setPlanningTotals({ miles: 0, amount: 0 });
                  setDirections(null);
                  setSelectedLoad(null);
                  setManualRouteMode(false);
                  setManualRoutePoints([]);
                }
              }}
              style={{
                marginRight: '8px',
                width: '16px',
                height: '16px',
                cursor: 'pointer'
              }}
            />
            <span>Enable Planning</span>
          </label>
          
          {planningMode && (
            <div style={{
              marginTop: '10px',
              paddingTop: '10px',
              borderTop: '1px solid #e0e0e0',
              fontSize: '13px'
            }}>
              <div style={{ marginBottom: '5px' }}>
                <strong>Total Miles:</strong> {planningTotals.miles.toLocaleString()} mi
              </div>
              <div style={{ marginBottom: '5px' }}>
                <strong>Total Amount:</strong> ${planningTotals.amount.toLocaleString()}
              </div>
              <div style={{ fontSize: '11px', color: '#666', marginTop: '8px' }}>
                Click pickup markers to add routes
              </div>
              
              {/* Manual Route Button */}
              <button
                onClick={() => {
                  setManualRouteMode(true);
                  setManualRoutePoints([]);
                }}
                disabled={manualRouteMode}
                style={{
                  marginTop: '8px',
                  padding: '6px 12px',
                  fontSize: '12px',
                  backgroundColor: manualRouteMode ? '#ccc' : '#9333ea',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: manualRouteMode ? 'not-allowed' : 'pointer',
                  width: '100%'
                }}
              >
                {manualRouteMode ? 'Click 2 points on map...' : '+ Add Manual Route'}
              </button>
              
              {manualRouteMode && (
                <div style={{ 
                  fontSize: '11px', 
                  color: '#9333ea', 
                  marginTop: '5px',
                  textAlign: 'center'
                }}>
                  {manualRoutePoints.length === 0 ? 'Click start point' : 'Click end point'}
                </div>
              )}
              
              {plannedRoutes.length > 0 && (
                <button
                  onClick={() => {
                    setPlannedRoutes([]);
                    setPlanningTotals({ miles: 0, amount: 0 });
                    setManualRouteMode(false);
                    setManualRoutePoints([]);
                  }}
                  style={{
                    marginTop: '8px',
                    padding: '4px 8px',
                    fontSize: '12px',
                    backgroundColor: '#f44336',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer'
                  }}
                >
                  Clear Routes
                </button>
              )}
            </div>
          )}
        </div>
        
        {geocodedLoads.length === 0 && !isGeocoding && (
          <div style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            backgroundColor: 'white',
            padding: '20px',
            borderRadius: '8px',
            boxShadow: '0 2px 10px rgba(0,0,0,0.2)',
            textAlign: 'center'
          }}>
            <p style={{ margin: 0 }}>No active loads to display on the map.</p>
            <p style={{ margin: '10px 0 0 0', fontSize: '14px', color: '#666' }}>
              Only showing: Booked, Dispatched, At Shipper, In Transit, At Receiver, and Issue loads
            </p>
          </div>
        )}
      </div>
    </LoadScript>
  );
};

export default LoadsMapView;