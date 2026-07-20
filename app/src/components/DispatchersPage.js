import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, query, where, onSnapshot, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { GoogleMap, LoadScript, Polyline, Marker, InfoWindow } from '@react-google-maps/api';


const DispatchersPage = ({ companyFilter, loggedInUser }) => {
  const [dispatchers, setDispatchers] = useState([]);
  const [loads, setLoads] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedDispatcher, setSelectedDispatcher] = useState(null);
  const [mapsApiKey, setMapsApiKey] = useState(null);
  const [showPerformanceModal, setShowPerformanceModal] = useState(false);
  const [showCompensationModal, setShowCompensationModal] = useState(false);
  const [performanceData, setPerformanceData] = useState(null);
  const [timeFrame, setTimeFrame] = useState('month');
  const [mapCenter, setMapCenter] = useState({ lat: 39.8283, lng: -98.5795 });
  const [selectedMarker, setSelectedMarker] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
const [aiAnalysis, setAiAnalysis] = useState(null);
const [showAnalysisModal, setShowAnalysisModal] = useState(false);

  
  const [compensationForm, setCompensationForm] = useState({
    rating: '',
    salaryType: 'Fixed Amount',
    salaryValue: '',
    bonus: '',
    notes: ''
  });

  const salaryTypes = ["Fixed Amount", "Percentage of Load", "Per Mile", "Hourly"];

   const hasAccess = loggedInUser && ['Super Admin', 'Main Admin', 'Admin'].some(role => 
    Array.isArray(loggedInUser.role) ? loggedInUser.role.includes(role) : loggedInUser.role === role
  );

  // Fetch dispatchers
  useEffect(() => {
    if (!loggedInUser?.tenantId || !hasAccess) {
      setIsLoading(false);
      return;
    }

    const dispatchersQuery = query(
      collection(db, 'users'),
      where('tenantId', '==', loggedInUser.tenantId)
    );

    const unsubscribe = onSnapshot(dispatchersQuery, (snapshot) => {
      const dispatchersList = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .filter(user => {
          const roles = Array.isArray(user.role) ? user.role : [user.role];
          return roles.includes('Dispatcher');
        });
      setDispatchers(dispatchersList);
      setIsLoading(false);
    });

    return unsubscribe;
  }, [loggedInUser, hasAccess]);

  // Fetch loads
  useEffect(() => {
    if (!loggedInUser?.tenantId || !hasAccess) return;

    const loadsQuery = query(
      collection(db, 'loads'),
      where('tenantId', '==', loggedInUser.tenantId)
    );

    const unsubscribe = onSnapshot(loadsQuery, (snapshot) => {
      const loadsList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setLoads(loadsList);
    });

    return unsubscribe;
  }, [loggedInUser, hasAccess]);

  const [drivers, setDrivers] = useState([]);
// Fetch drivers
useEffect(() => {
  if (!loggedInUser?.tenantId || !hasAccess) return;

  const driversQuery = query(
    collection(db, 'drivers'),
    where('tenantId', '==', loggedInUser.tenantId)
  );

  const unsubscribe = onSnapshot(driversQuery, (snapshot) => {
    const driversList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    setDrivers(driversList);
  });

  return unsubscribe;
}, [loggedInUser, hasAccess]);
 // Fetch Google Maps API key from Cloud Function
  useEffect(() => {
    const fetchMapsKey = async () => {
      try {
        const functions = getFunctions();
        const getMapsApiKey = httpsCallable(functions, 'getMapsApiKey');
        const result = await getMapsApiKey();
        setMapsApiKey(result.data.apiKey);
      } catch (error) {
        console.error('Error fetching Maps API key:', error);
      }
    };
    if (loggedInUser) {
      fetchMapsKey();
    }
  }, [loggedInUser]);
  // Helper to get driver name from driverId
const getDriverName = (driverId) => {
  if (!driverId) return 'Unassigned';
  const driver = drivers.find(d => d.id === driverId);
  return driver?.name || 'Unknown Driver';
};

// Helper to extract city/state from address
const extractCityState = (address) => {
  if (!address) return { city: '', state: '' };
  
  // Try comma-separated format first: "Street City, State Zip"
  if (address.includes(',')) {
    const parts = address.split(',').map(p => p.trim());
    if (parts.length >= 2) {
      const city = parts[parts.length - 2].split(' ').pop(); // Get last word before comma
      const lastPart = parts[parts.length - 1];
      const stateMatch = lastPart.match(/^([A-Z]{2})/);
      const state = stateMatch ? stateMatch[1] : '';
      return { city, state };
    }
  }
  
  // Fallback: No comma format "Street City State Zip" or "Street City StateZip"
  // Extract state as last 2 capital letters before digits
  const stateMatch = address.match(/\b([A-Z]{2})(\d{5})?$/);
  if (stateMatch) {
    const state = stateMatch[1];
    // City is the word before the state
    const beforeState = address.substring(0, address.lastIndexOf(state)).trim();
    const city = beforeState.split(' ').pop();
    return { city, state };
  }
  
  return { city: '', state: '' };
};
  // Calculate compensation owed
  const calculateCompensationOwed = (dispatcher, dispatcherLoads) => {
    const comp = dispatcher.compensation || {};
    const salaryType = comp.salaryType || 'Fixed Amount';
    const salaryValue = parseFloat(comp.salaryValue) || 0;
    const bonus = parseFloat(comp.bonus) || 0;

    let calculatedAmount = 0;
    let calculation = '';

    switch (salaryType) {
      case 'Fixed Amount':
        calculatedAmount = salaryValue;
        calculation = `Fixed: ${formatCurrency(salaryValue)}`;
        break;

      case 'Percentage of Load':
        const totalRevenue = dispatcherLoads.reduce((sum, load) => 
          sum + (parseFloat(load.amount) || 0), 0
        );
        calculatedAmount = (totalRevenue * salaryValue) / 100;
        calculation = `${salaryValue}% of ${formatCurrency(totalRevenue)} revenue`;
        break;

      case 'Per Mile':
        const totalMiles = dispatcherLoads.reduce((sum, load) => 
          sum + (parseFloat(load.mileage) || 0), 0
        );
        calculatedAmount = totalMiles * salaryValue;
        calculation = `${totalMiles.toLocaleString()} miles × ${formatCurrency(salaryValue)}/mile`;
        break;

      case 'Hourly':
        const timeFrameDays = timeFrame === 'week' ? 7 : timeFrame === 'month' ? 30 : 365;
        const estimatedHours = (timeFrameDays / 7) * 40;
        calculatedAmount = estimatedHours * salaryValue;
        calculation = `${estimatedHours} hours × ${formatCurrency(salaryValue)}/hr`;
        break;

      default:
        calculatedAmount = 0;
        calculation = 'Not configured';
    }

    return {
      basePay: calculatedAmount,
      bonus: bonus,
      total: calculatedAmount + bonus,
      calculation,
      breakdown: {
        salaryType,
        salaryValue,
        loadsCount: dispatcherLoads.length,
        totalRevenue: dispatcherLoads.reduce((sum, load) => sum + (parseFloat(load.amount) || 0), 0),
totalMiles: dispatcherLoads.reduce((sum, load) => sum + (parseFloat(load.mileage) || 0), 0)
      }
    };
  };

  // Prepare route data for map
  const prepareRouteData = (dispatcherLoads) => {
    const routes = [];
    const deadheadRoutes = [];
    let bounds = null;

    const sortedLoads = [...dispatcherLoads]
      .filter(load => load.actualPU || load.pickupDate)
      .sort((a, b) => {
        const dateA = a.actualPU?.toDate?.() || new Date(a.pickupDate);
        const dateB = b.actualPU?.toDate?.() || new Date(b.pickupDate);
        return dateA - dateB;
      });

    sortedLoads.forEach((load, index) => {
      const pickupLat = load.pickupLat || load.puLat;
      const pickupLng = load.pickupLng || load.puLng;
      const deliveryLat = load.deliveryLat || load.delLat;
      const deliveryLng = load.deliveryLng || load.delLng;

      if (pickupLat && pickupLng && deliveryLat && deliveryLng) {
        const { city: pickupCity, state: pickupState } = extractCityState(load.pickupLocation);
const { city: deliveryCity, state: deliveryState } = extractCityState(load.deliveryLocation);

const route = {
  id: load.id,
  loadId: load.load_id || load.id,
  pickup: { lat: pickupLat, lng: pickupLng },
  delivery: { lat: deliveryLat, lng: deliveryLng },
  pickupCity,
  pickupState,
  deliveryCity,
  deliveryState,
  status: load.status,
  amount: load.amount,
  mileage: load.mileage,
  driverName: getDriverName(load.driverId)
};
routes.push(route); 
        if (index < sortedLoads.length - 1) {
          const nextLoad = sortedLoads[index + 1];
          const nextPickupLat = nextLoad.pickupLat || nextLoad.puLat;
          const nextPickupLng = nextLoad.pickupLng || nextLoad.puLng;

          if (nextPickupLat && nextPickupLng) {
            const deadheadMiles = calculateDistance(deliveryLat, deliveryLng, nextPickupLat, nextPickupLng);
            deadheadRoutes.push({
              id: `deadhead-${load.id}-${nextLoad.id}`,
              from: { lat: deliveryLat, lng: deliveryLng },
              to: { lat: nextPickupLat, lng: nextPickupLng },
              miles: Math.round(deadheadMiles),
              fromLoad: route.loadId,
              toLoad: nextLoad.load_id || nextLoad.id
            });
          }
        }

        [pickupLat, deliveryLat].forEach(lat => {
          [pickupLng, deliveryLng].forEach(lng => {
            if (!bounds) {
              bounds = { north: lat, south: lat, east: lng, west: lng };
            } else {
              bounds.north = Math.max(bounds.north, lat);
              bounds.south = Math.min(bounds.south, lat);
              bounds.east = Math.max(bounds.east, lng);
              bounds.west = Math.min(bounds.west, lng);
            }
          });
        });
      }
    });

    let center = { lat: 39.8283, lng: -98.5795 };
    if (bounds) {
      center = {
        lat: (bounds.north + bounds.south) / 2,
        lng: (bounds.east + bounds.west) / 2
      };
    }

    return { routes, deadheadRoutes, center, bounds };
  };

  const calculatePerformance = (dispatcher, timeFrame) => {
    const now = new Date();
    let startDate;

    switch (timeFrame) {
      case 'week':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'month':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case 'year':
        startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    }

    const dispatcherLoads = loads.filter(load => {
      const loadDate = load.createdAt?.toDate?.() || new Date(load.createdAt);
      const isDispatcherLoad = load.dispatcher === dispatcher.name || 
                                load.dispatcherId === dispatcher.id ||
                                load.dispatcherEmail === dispatcher.email;
      return isDispatcherLoad && loadDate >= startDate;
    });

    const totalLoads = dispatcherLoads.length;
    const totalGross = dispatcherLoads.reduce((sum, load) => sum + (parseFloat(load.amount) || 0), 0);
const totalMiles = dispatcherLoads.reduce((sum, load) => sum + (parseFloat(load.mileage) || 0), 0);
    const ratePerMile = totalMiles > 0 ? totalGross / totalMiles : 0;

    const cancelledLoads = dispatcherLoads.filter(load => 
      load.status === 'cancelled' || load.status === 'Cancelled'
    ).length;

    const uniqueDrivers = new Set(
      dispatcherLoads
        .filter(load => load.driverId || load.driverName)
        .map(load => load.driverId || load.driverName)
    );
    const driversCount = uniqueDrivers.size;

    const deadheadAnalysis = calculateDeadheadEfficiency(dispatcherLoads);
    const compensationOwed = calculateCompensationOwed(dispatcher, dispatcherLoads);
    const routeData = prepareRouteData(dispatcherLoads);

    return {
      totalLoads,
      totalGross,
      totalMiles,
      ratePerMile,
      cancelledLoads,
      cancellationRate: totalLoads > 0 ? (cancelledLoads / totalLoads * 100) : 0,
      driversCount,
      deadheadAnalysis,
      compensationOwed,
      routeData,
      loads: dispatcherLoads
    };
  };

  const calculateDeadheadEfficiency = (dispatcherLoads) => {
    const sortedLoads = [...dispatcherLoads]
      .filter(load => load.actualPU || load.pickupDate)
      .sort((a, b) => {
        const dateA = a.actualPU?.toDate?.() || new Date(a.pickupDate);
        const dateB = b.actualPU?.toDate?.() || new Date(b.pickupDate);
        return dateA - dateB;
      });

    if (sortedLoads.length < 2) {
      return {
        totalDeadheadMiles: 0,
        averageDeadhead: 0,
        efficiency: 100,
        analysis: 'Not enough data'
      };
    }

    let totalDeadheadMiles = 0;
    let deadheadSegments = 0;

    for (let i = 0; i < sortedLoads.length - 1; i++) {
      const currentLoad = sortedLoads[i];
      const nextLoad = sortedLoads[i + 1];

      const deliveryLat = currentLoad.deliveryLat || currentLoad.delLat;
      const deliveryLng = currentLoad.deliveryLng || currentLoad.delLng;
      const pickupLat = nextLoad.pickupLat || nextLoad.puLat;
      const pickupLng = nextLoad.pickupLng || nextLoad.puLng;

      if (deliveryLat && deliveryLng && pickupLat && pickupLng) {
        const deadhead = calculateDistance(deliveryLat, deliveryLng, pickupLat, pickupLng);
        totalDeadheadMiles += deadhead;
        deadheadSegments++;
      }
    }

    const averageDeadhead = deadheadSegments > 0 ? totalDeadheadMiles / deadheadSegments : 0;
const totalLoadedMiles = sortedLoads.reduce((sum, load) => sum + (parseFloat(load.mileage) || 0), 0);
    const efficiency = totalLoadedMiles > 0 
      ? ((totalLoadedMiles / (totalLoadedMiles + totalDeadheadMiles)) * 100) 
      : 0;

    let analysis = '';
    if (efficiency >= 85) analysis = 'Excellent route planning';
    else if (efficiency >= 75) analysis = 'Good route efficiency';
    else if (efficiency >= 65) analysis = 'Average routing - room for improvement';
    else analysis = 'Poor efficiency - needs optimization';

    return {
      totalDeadheadMiles: Math.round(totalDeadheadMiles),
      averageDeadhead: Math.round(averageDeadhead),
      efficiency: Math.round(efficiency),
      analysis
    };
  };

  const calculateDistance = (lat1, lon1, lat2, lon2) => {
    const R = 3959;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  };

  const handleViewPerformance = (dispatcher) => {
    setSelectedDispatcher(dispatcher);
    const performance = calculatePerformance(dispatcher, timeFrame);
    setPerformanceData(performance);
    
    if (performance.routeData.center) {
      setMapCenter(performance.routeData.center);
    }
    
    setShowPerformanceModal(true);
  };
const handleAnalyzePerformance = async () => {
  if (!performanceData?.loads?.length) {
    alert('No loads to analyze for this period.');
    return;
  }
  setIsAnalyzing(true);
  try {
    const functions = getFunctions();
    const analyze = httpsCallable(functions, 'analyzeDispatcherPerformance');
    const result = await analyze({
      loads: performanceData.loads.map(l => ({
        ...l,
        actualPU:  l.actualPU?.toDate  ? l.actualPU.toDate().toISOString()  : l.actualPU,
        actualDEL: l.actualDEL?.toDate ? l.actualDEL.toDate().toISOString() : l.actualDEL,
        createdAt: l.createdAt?.toDate  ? l.createdAt.toDate().toISOString() : l.createdAt,
      })),
      dispatcherName: selectedDispatcher.name,
      timeFrame,
    });
    setAiAnalysis(result.data);
    setShowAnalysisModal(true);
  } catch (error) {
    console.error('Analysis error:', error);
    alert('Analysis failed: ' + error.message);
  } finally {
    setIsAnalyzing(false);
  }
};
  const handleOpenCompensation = (dispatcher) => {
    setSelectedDispatcher(dispatcher);
    const comp = dispatcher.compensation || {};
    setCompensationForm({
      rating: comp.rating !== undefined && comp.rating !== null ? String(comp.rating) : '',
      salaryType: comp.salaryType || 'Fixed Amount',
      salaryValue: comp.salaryValue !== undefined && comp.salaryValue !== null ? String(comp.salaryValue) : '',
      bonus: comp.bonus !== undefined && comp.bonus !== null ? String(comp.bonus) : '',
      notes: comp.notes || ''
    });
    setShowCompensationModal(true);
  };

  const handleSaveCompensation = async () => {
    try {
      const ratingToSave = compensationForm.rating === '' ? 0 : parseInt(compensationForm.rating, 10);
      const salaryValueToSave = compensationForm.salaryValue === '' ? 0 : parseFloat(compensationForm.salaryValue);
      const bonusToSave = compensationForm.bonus === '' ? 0 : parseFloat(compensationForm.bonus);

      if (isNaN(ratingToSave) || isNaN(salaryValueToSave) || isNaN(bonusToSave)) {
        alert('Invalid number format. Please enter valid numbers.');
        return;
      }

      const compensationData = {
        rating: ratingToSave,
        lastRated: serverTimestamp(),
        salaryType: compensationForm.salaryType,
        salaryValue: salaryValueToSave,
        bonus: bonusToSave,
        notes: compensationForm.notes,
        tenantId: loggedInUser.tenantId
      };

      const userRef = doc(db, 'users', selectedDispatcher.id);
      await updateDoc(userRef, {
        compensation: compensationData
      });

      alert(`Compensation for ${selectedDispatcher.name} updated successfully!`);
      setShowCompensationModal(false);
    } catch (error) {
      console.error('Error updating compensation:', error);
      alert('Failed to update compensation: ' + error.message);
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount || 0);
  };

  const StarRatingDisplay = ({ rating }) => {
    const displayRating = Number(rating) || 0;
    return (
      <div className="flex">
        {[1, 2, 3, 4, 5].map(i => (
          <span key={i} className={`text-xl ${i <= displayRating ? 'text-yellow-400' : 'text-gray-300'}`}>
            ★
          </span>
        ))}
      </div>
    );
  };

  const getRouteColor = (status) => {
    switch (status?.toLowerCase()) {
      case 'delivered':
        return '#10b981';
      case 'in transit':
      case 'picked up':
        return '#3b82f6';
      case 'cancelled':
        return '#ef4444';
      default:
        return '#f59e0b';
    }
  };

  if (!hasAccess) {
    return (
      <div className="p-6 bg-white rounded-lg shadow">
        <div className="text-red-600 font-semibold text-lg mb-2">Access Denied</div>
        <p className="text-gray-600">Only Super Admin and Admin roles can view dispatcher performance.</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading dispatchers...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Dispatcher Performance & Compensation</h1>
        <p className="text-gray-600 mt-2">Monitor dispatcher efficiency, route planning, and manage compensation</p>
      </div>

      {/* Stats - keeping your existing stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500 uppercase">Total Dispatchers</p>
              <p className="text-3xl font-bold text-gray-900">{dispatchers.length}</p>
            </div>
            <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
              <i className="fas fa-headset text-blue-600 text-xl"></i>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500 uppercase">Active Loads</p>
              <p className="text-3xl font-bold text-gray-900">
                {loads.filter(l => l.status !== 'delivered' && l.status !== 'cancelled').length}
              </p>
            </div>
            <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
              <i className="fas fa-truck-loading text-green-600 text-xl"></i>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500 uppercase">Total Loads (30d)</p>
              <p className="text-3xl font-bold text-gray-900">
                {loads.filter(l => {
                  const loadDate = l.createdAt?.toDate?.() || new Date(l.createdAt);
                  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
                  return loadDate >= thirtyDaysAgo;
                }).length}
              </p>
            </div>
            <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center">
              <i className="fas fa-box text-purple-600 text-xl"></i>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500 uppercase">Revenue (30d)</p>
              <p className="text-3xl font-bold text-gray-900">
                {formatCurrency(
                  loads
                    .filter(l => {
                      const loadDate = l.createdAt?.toDate?.() || new Date(l.createdAt);
                      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
                      return loadDate >= thirtyDaysAgo;
                    })
                    .reduce((sum, load) => sum + (parseFloat(load.amount) || 0), 0)
                )}
              </p>
            </div>
            <div className="w-12 h-12 bg-yellow-100 rounded-full flex items-center justify-center">
              <i className="fas fa-dollar-sign text-yellow-600 text-xl"></i>
            </div>
          </div>
        </div>
      </div>

      {/* Table - keeping your existing table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900">All Dispatchers</h2>
        </div>

        {dispatchers.length === 0 ? (
          <div className="text-center py-12">
            <i className="fas fa-users text-gray-400 text-5xl mb-4"></i>
            <p className="text-gray-500">No dispatchers found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Dispatcher</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Rating</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Salary</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Loads (30d)</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Revenue (30d)</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {dispatchers.map(dispatcher => {
                  const thirtyDayLoads = loads.filter(load => {
                    const loadDate = load.createdAt?.toDate?.() || new Date(load.createdAt);
                    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
                    const isDispatcherLoad = load.dispatcher === dispatcher.name || 
                                              load.dispatcherId === dispatcher.id ||
                                              load.dispatcherEmail === dispatcher.email;
                    return isDispatcherLoad && loadDate >= thirtyDaysAgo;
                  });

                  const thirtyDayRevenue = thirtyDayLoads.reduce((sum, load) => 
                    sum + (parseFloat(load.amount) || 0), 0
                  );

                  const comp = dispatcher.compensation || {};

                  return (
                    <tr key={dispatcher.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className="h-10 w-10 flex-shrink-0">
                            <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center">
                              <span className="text-blue-600 font-semibold">
                                {dispatcher.name?.charAt(0)?.toUpperCase() || 'D'}
                              </span>
                            </div>
                          </div>
                          <div className="ml-4">
                            <div className="text-sm font-medium text-gray-900">
                              {dispatcher.name || 'Unnamed Dispatcher'}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{dispatcher.email}</td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <StarRatingDisplay rating={comp.rating} />
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        <div>{comp.salaryType || 'Not Set'}</div>
                        <div className="text-xs text-gray-500">
                          {comp.salaryType === 'Percentage of Load' 
                            ? `${comp.salaryValue || 0}%` 
                            : formatCurrency(comp.salaryValue || 0)}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {thirtyDayLoads.length}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {formatCurrency(thirtyDayRevenue)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                        <button
                          onClick={() => handleViewPerformance(dispatcher)}
                          className="text-blue-600 hover:text-blue-900"
                        >
                          Performance
                        </button>
                        <button
                          onClick={() => handleOpenCompensation(dispatcher)}
                          className="text-green-600 hover:text-green-900"
                        >
                          Compensation
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Performance Modal with Map */}
      {showPerformanceModal && performanceData && selectedDispatcher && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20">
            <div className="fixed inset-0 bg-black opacity-50" onClick={() => setShowPerformanceModal(false)}></div>
            
            <div className="relative bg-white rounded-lg shadow-xl max-w-[95vw] w-full max-h-[95vh] overflow-hidden flex flex-col">
              {/* Header */}
              <div className="bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center shrink-0">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">
                    {selectedDispatcher.name} - Performance Report
                  </h2>
                  <p className="text-sm text-gray-500">{selectedDispatcher.email}</p>
                </div>
                <div className="flex items-center gap-4">
                  <select
                    value={timeFrame}
                    onChange={(e) => {
                      setTimeFrame(e.target.value);
                      const newPerformance = calculatePerformance(selectedDispatcher, e.target.value);
                      setPerformanceData(newPerformance);
                      if (newPerformance.routeData.center) {
                        setMapCenter(newPerformance.routeData.center);
                      }
                    }}
                    className="border border-gray-300 rounded-md px-3 py-2 text-sm"
                  >
                    <option value="week">Last 7 Days</option>
                    <option value="month">Last 30 Days</option>
                    <option value="year">Last Year</option>
                  </select>
                  <button
                    onClick={() => setShowPerformanceModal(false)}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <i className="fas fa-times text-xl"></i>
                  </button>
                </div>
              </div>

              {/* Content - scrollable */}
              <div className="flex-1 overflow-y-auto p-6">
                {/* Compensation Owed Section - NEW */}
                <div className="bg-gradient-to-br from-green-50 to-green-100 border border-green-200 rounded-lg p-6 mb-8">
                  <h3 className="text-lg font-semibold text-green-900 mb-4 flex items-center">
                    <i className="fas fa-dollar-sign text-green-600 mr-2"></i>
                    Compensation Owed for {timeFrame === 'week' ? 'This Week' : timeFrame === 'month' ? 'This Month' : 'This Year'}
                  </h3>
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-4">
                    <div>
                      <p className="text-sm text-green-700 mb-1">Base Pay</p>
                      <p className="text-3xl font-bold text-green-900">
                        {formatCurrency(performanceData.compensationOwed.basePay)}
                      </p>
                      <p className="text-xs text-green-700 mt-1">
                        {performanceData.compensationOwed.calculation}
                      </p>
                    </div>
                    
                    <div>
                      <p className="text-sm text-green-700 mb-1">Bonus</p>
                      <p className="text-3xl font-bold text-green-900">
                        {formatCurrency(performanceData.compensationOwed.bonus)}
                      </p>
                      <p className="text-xs text-green-700 mt-1">Additional compensation</p>
                    </div>
                    
                    <div>
                      <p className="text-sm text-green-700 mb-1">Total Amount Owed</p>
                      <p className="text-3xl font-bold text-green-900">
                        {formatCurrency(performanceData.compensationOwed.total)}
                      </p>
                      <p className="text-xs text-green-700 mt-1">Base pay + bonus</p>
                    </div>
                  </div>

                  <div className="p-4 bg-white rounded-lg">
                    <p className="text-sm font-medium text-gray-700 mb-2">Calculation Details:</p>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs text-gray-600">
                      <div>
                        <span className="font-medium">Loads:</span> {performanceData.compensationOwed.breakdown.loadsCount}
                      </div>
                      <div>
                        <span className="font-medium">Revenue:</span> {formatCurrency(performanceData.compensationOwed.breakdown.totalRevenue)}
                      </div>
                      <div>
                        <span className="font-medium">Miles:</span> {performanceData.compensationOwed.breakdown.totalMiles.toLocaleString()}
                      </div>
                      <div>
                        <span className="font-medium">Type:</span> {performanceData.compensationOwed.breakdown.salaryType}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Route Map - NEW */}
                {performanceData.routeData.routes.length > 0 && (
                  <div className="bg-white border border-gray-200 rounded-lg overflow-hidden mb-8">
                    <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
                      <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                        <i className="fas fa-map-marked-alt text-gray-600 mr-2"></i>
                        Route Map - {performanceData.routeData.routes.length} Loads
                      </h3>
                      <p className="text-sm text-gray-600 mt-1">
                        Blue lines = Load routes • Red dashed lines = Deadhead miles
                      </p>
                    </div>
                    
                    <div className="h-[500px] relative">
  {mapsApiKey ? (
    <LoadScript googleMapsApiKey={mapsApiKey}>
                        <GoogleMap
                          mapContainerStyle={{ width: '100%', height: '100%' }}
                          center={mapCenter}
                          zoom={5}
                          options={{
                            streetViewControl: false,
                            mapTypeControl: true,
                          }}
                        >
                          {/* Draw load routes */}
                          {performanceData.routeData.routes.map((route) => (
                            <React.Fragment key={route.id}>
                              {/* Pickup Marker */}
                              <Marker
                                position={route.pickup}
                                label={{
                                  text: 'P',
                                  color: 'white',
                                  fontSize: '12px',
                                  fontWeight: 'bold'
                                }}
                                icon={{
                                  path: window.google?.maps?.SymbolPath?.CIRCLE || 0,
                                  scale: 8,
                                  fillColor: '#3b82f6',
                                  fillOpacity: 1,
                                  strokeColor: '#1e40af',
                                  strokeWeight: 2,
                                }}
                                title={`Pickup: ${route.pickupCity}, ${route.pickupState}`}
                              />
                              
                              {/* Delivery Marker */}
                              <Marker
                                position={route.delivery}
                                label={{
                                  text: 'D',
                                  color: 'white',
                                  fontSize: '12px',
                                  fontWeight: 'bold'
                                }}
                                icon={{
                                  path: window.google?.maps?.SymbolPath?.CIRCLE || 0,
                                  scale: 8,
                                  fillColor: '#10b981',
                                  fillOpacity: 1,
                                  strokeColor: '#047857',
                                  strokeWeight: 2,
                                }}
                                title={`Delivery: ${route.deliveryCity}, ${route.deliveryState}`}
                              />
                              
                              {/* Load Route Line */}
                              <Polyline
                                path={[route.pickup, route.delivery]}
                                options={{
                                  strokeColor: getRouteColor(route.status),
                                  strokeOpacity: 0.8,
                                  strokeWeight: 4,
                                }}
                              />
                            </React.Fragment>
                          ))}

                          {/* Draw deadhead routes */}
                          {performanceData.routeData.deadheadRoutes.map((deadhead) => (
                            <Polyline
                              key={deadhead.id}
                              path={[deadhead.from, deadhead.to]}
                              options={{
                                strokeColor: '#ef4444',
                                strokeOpacity: 0.6,
                                strokeWeight: 2,
                                strokePattern: 'dashed',
                                icons: [{
                                  icon: { path: 'M 0,-1 0,1', strokeOpacity: 1, scale: 2 },
                                  offset: '0',
                                  repeat: '10px'
                                }]
                              }}
                            />
                          ))}
                        </GoogleMap>
                      </LoadScript>
                    ) : (
                      <div className="h-full flex items-center justify-center bg-gray-100">
                        <p className="text-gray-500">Loading map...</p>
                      </div>
                    )}
                    </div>
                    {/* Map Legend */}
                    <div className="px-6 py-4 bg-gray-50 border-t border-gray-200">
                      <div className="flex flex-wrap gap-4 text-sm">
                        <div className="flex items-center gap-2">
                          <div className="w-4 h-4 rounded-full bg-blue-500"></div>
                          <span>Pickup</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-4 h-4 rounded-full bg-green-500"></div>
                          <span>Delivery</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-1 bg-green-500"></div>
                          <span>Delivered</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-1 bg-blue-500"></div>
                          <span>In Transit</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-1 bg-red-500" style={{backgroundImage: 'repeating-linear-gradient(90deg, #ef4444 0, #ef4444 5px, transparent 5px, transparent 10px)'}}></div>
                          <span>Deadhead ({performanceData.deadheadAnalysis.totalDeadheadMiles} mi)</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Rest of metrics - keeping your existing sections */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                  <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-6 border border-blue-200">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-sm font-medium text-blue-900">Total Loads</p>
                      <i className="fas fa-box text-blue-600"></i>
                    </div>
                    <p className="text-3xl font-bold text-blue-900">{performanceData.totalLoads}</p>
                  </div>

                  <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-lg p-6 border border-green-200">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-sm font-medium text-green-900">Total Revenue</p>
                      <i className="fas fa-dollar-sign text-green-600"></i>
                    </div>
                    <p className="text-3xl font-bold text-green-900">{formatCurrency(performanceData.totalGross)}</p>
                  </div>

                  <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-lg p-6 border border-purple-200">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-sm font-medium text-purple-900">Rate Per Mile</p>
                      <i className="fas fa-route text-purple-600"></i>
                    </div>
                    <p className="text-3xl font-bold text-purple-900">{formatCurrency(performanceData.ratePerMile)}</p>
                    <p className="text-xs text-purple-700 mt-1">{performanceData.totalMiles.toLocaleString()} total miles</p>
                  </div>
                </div>

                {/* Additional metrics, deadhead, loads table - keep all existing */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                  <div className="bg-white border border-gray-200 rounded-lg p-6">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                      <i className="fas fa-users text-gray-600 mr-2"></i>
                      Driver Management
                    </h3>
                    <div className="space-y-3">
                      <div className="flex justify-between items-center">
                        <span className="text-gray-600">Drivers Worked With:</span>
                        <span className="font-semibold text-gray-900">{performanceData.driversCount}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-gray-600">Loads Per Driver:</span>
                        <span className="font-semibold text-gray-900">
                          {performanceData.driversCount > 0 
                            ? (performanceData.totalLoads / performanceData.driversCount).toFixed(1)
                            : '0'}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="bg-white border border-gray-200 rounded-lg p-6">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                      <i className="fas fa-times-circle text-gray-600 mr-2"></i>
                      Cancellation Stats
                    </h3>
                    <div className="space-y-3">
                      <div className="flex justify-between items-center">
                        <span className="text-gray-600">Cancelled Loads:</span>
                        <span className="font-semibold text-red-600">{performanceData.cancelledLoads}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-gray-600">Cancellation Rate:</span>
                        <span className={`font-semibold ${performanceData.cancellationRate > 10 ? 'text-red-600' : 'text-green-600'}`}>
                          {performanceData.cancellationRate.toFixed(1)}%
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Deadhead section - keep existing */}
                <div className="bg-gradient-to-br from-orange-50 to-orange-100 border border-orange-200 rounded-lg p-6 mb-8">
                  <h3 className="text-lg font-semibold text-orange-900 mb-4 flex items-center">
                    <i className="fas fa-route text-orange-600 mr-2"></i>
                    Route Efficiency Analysis
                  </h3>
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                    <div>
                      <p className="text-sm text-orange-700 mb-1">Total Deadhead Miles</p>
                      <p className="text-2xl font-bold text-orange-900">
                        {performanceData.deadheadAnalysis.totalDeadheadMiles}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-orange-700 mb-1">Average Deadhead</p>
                      <p className="text-2xl font-bold text-orange-900">
                        {performanceData.deadheadAnalysis.averageDeadhead} mi
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-orange-700 mb-1">Route Efficiency</p>
                      <p className="text-2xl font-bold text-orange-900">
                        {performanceData.deadheadAnalysis.efficiency}%
                      </p>
                    </div>
                  </div>

                  <div className="mb-3">
                    <div className="w-full bg-orange-200 rounded-full h-4">
                      <div 
                        className={`h-4 rounded-full ${
                          performanceData.deadheadAnalysis.efficiency >= 85 ? 'bg-green-500' :
                          performanceData.deadheadAnalysis.efficiency >= 75 ? 'bg-yellow-500' :
                          performanceData.deadheadAnalysis.efficiency >= 65 ? 'bg-orange-500' :
                          'bg-red-500'
                        }`}
                        style={{ width: `${performanceData.deadheadAnalysis.efficiency}%` }}
                      ></div>
                    </div>
                  </div>

                  <div className={`p-3 rounded-lg ${
                    performanceData.deadheadAnalysis.efficiency >= 85 ? 'bg-green-100 text-green-800' :
                    performanceData.deadheadAnalysis.efficiency >= 75 ? 'bg-yellow-100 text-yellow-800' :
                    performanceData.deadheadAnalysis.efficiency >= 65 ? 'bg-orange-200 text-orange-900' :
                    'bg-red-100 text-red-800'
                  }`}>
                    <p className="font-semibold">
                      <i className="fas fa-chart-line mr-2"></i>
                      {performanceData.deadheadAnalysis.analysis}
                    </p>
                  </div>
                </div>

                {/* Loads table - keep existing */}
                <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                  <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
                    <h3 className="text-lg font-semibold text-gray-900">
                      Recent Loads ({performanceData.loads.length})
                    </h3>
                  </div>
                  <div className="overflow-x-auto max-h-96">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50 sticky top-0">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Load ID</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Driver</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Route</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Miles</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Amount</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {performanceData.loads.slice(0, 20).map(load => (
                          <tr key={load.id} className="hover:bg-gray-50">
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                              {load.load_id || load.id?.substring(0, 8)}
                            </td>
                           <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
  {getDriverName(load.driverId)}
</td>
                           <td className="px-6 py-4 text-sm text-gray-900">
  <div className="max-w-xs truncate">
    {(() => {
      const { city: pCity, state: pState } = extractCityState(load.pickupLocation);
      const { city: dCity, state: dState } = extractCityState(load.deliveryLocation);
      return `${pCity}, ${pState} → ${dCity}, ${dState}`;
    })()}
  </div>
</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
  {load.mileage || 0}
</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                              {formatCurrency(load.amount)}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                                load.status === 'delivered' ? 'bg-green-100 text-green-800' :
                                load.status === 'cancelled' ? 'bg-red-100 text-red-800' :
                                'bg-yellow-100 text-yellow-800'
                              }`}>
                                {load.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="bg-gray-50 px-6 py-4 border-t border-gray-200 flex justify-end shrink-0">
                <button
                  onClick={() => setShowPerformanceModal(false)}
                  className="bg-gray-600 hover:bg-gray-700 text-white px-6 py-2 rounded-md font-medium"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Compensation Modal - keeping your existing modal */}
      {showCompensationModal && selectedDispatcher && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen px-4">
            <div className="fixed inset-0 bg-black opacity-50" onClick={() => setShowCompensationModal(false)}></div>
            
            <div className="relative bg-white rounded-lg shadow-xl max-w-lg w-full">
              <div className="px-6 py-4 border-b border-gray-200">
                <h2 className="text-xl font-bold text-gray-900">Edit Compensation</h2>
                <p className="text-sm text-gray-500">{selectedDispatcher.name}</p>
              </div>

              <div className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Rating (0-5)
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="5"
                      step="1"
                      value={compensationForm.rating}
                      onChange={(e) => setCompensationForm({ ...compensationForm, rating: e.target.value })}
                      className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Salary Type
                    </label>
                    <select
                      value={compensationForm.salaryType}
                      onChange={(e) => setCompensationForm({ ...compensationForm, salaryType: e.target.value })}
                      className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                    >
                      {salaryTypes.map(type => (
                        <option key={type} value={type}>{type}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {compensationForm.salaryType === 'Percentage of Load' ? 'Percentage (%)' : 'Salary Value ($)'}
                    </label>
                    <input
                      type="number"
                      step="any"
                      value={compensationForm.salaryValue}
                      onChange={(e) => setCompensationForm({ ...compensationForm, salaryValue: e.target.value })}
                      className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                      placeholder={compensationForm.salaryType === 'Percentage of Load' ? 'e.g., 10' : 'e.g., 50000'}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Bonus ($)
                    </label>
                    <input
                      type="number"
                      step="any"
                      value={compensationForm.bonus}
                      onChange={(e) => setCompensationForm({ ...compensationForm, bonus: e.target.value })}
                      className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                      placeholder="e.g., 500"
                    />
                  </div>
                </div>

                <div className="mt-6">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Notes (Optional)
                  </label>
                  <textarea
                    rows={3}
                    value={compensationForm.notes}
                    onChange={(e) => setCompensationForm({ ...compensationForm, notes: e.target.value })}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                    placeholder="Additional compensation details..."
                  />
                </div>
              </div>

              <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
                <button
                  onClick={() => setShowCompensationModal(false)}
                  className="bg-gray-200 hover:bg-gray-300 text-gray-700 px-4 py-2 rounded-md font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveCompensation}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md font-medium"
                >
                  Save Compensation
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DispatchersPage;