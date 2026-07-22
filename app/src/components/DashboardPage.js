import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { db, auth } from '../firebase';
import { applyOwnerImpersonation } from '../utils/impersonation';
import { collection, query, where, onSnapshot, doc, getDocs, getDoc, orderBy, limit } from "firebase/firestore";import { onAuthStateChanged } from 'firebase/auth';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const useCountUp = (target, duration = 1500) => {
  const [value, setValue] = useState(0);
  
  useEffect(() => {
    if (target === 0) { setValue(0); return; }
    
    const startTime = performance.now();
    const startValue = 0;
    
    const animate = (currentTime) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      // Ease-out curve for natural deceleration
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = Math.round(startValue + (target - startValue) * eased);
      
      setValue(current);
      
      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };
    
    requestAnimationFrame(animate);
  }, [target, duration]);
  
  return value;
};
// ============================================================================
// CUSTOM TOOLTIP FOR RPM CHART
// ============================================================================
const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    const isAutoHauling = data.isAutoHauling;
    const metricLabel = data.metricType || (isAutoHauling ? 'PV/M' : 'RPM');
    return (
      <div className="bg-white p-3 border border-gray-300 rounded-lg shadow-lg text-sm">
        <p className="font-medium text-gray-800">{label}</p>
        <p className="text-blue-600 font-medium">{metricLabel}: ${data.rpm.toFixed(2)}{isAutoHauling ? '/vehicle/mile' : '/mile'}</p>
        <p className="text-gray-600">Loads: {data.loads}</p>
        <p className="text-gray-600">Revenue: ${data.totalAmount.toLocaleString()}</p>
        <p className="text-gray-600">Miles: {data.totalMiles.toLocaleString()}</p>
        {isAutoHauling && data.totalVehicles !== null && (
          <p className="text-gray-600">Vehicles: {data.totalVehicles}</p>
        )}
      </div>
    );
  }
  return null;
};

// ============================================================================
// DRIVER DETAIL TOOLTIP
// ============================================================================
const DriverDetailTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white p-3 border border-gray-300 rounded-lg shadow-lg text-sm">
        <p className="font-medium text-gray-800 mb-1">{label}</p>
        {payload.map((entry, i) => (
          <p key={i} style={{ color: entry.color }}>
            {entry.name}: {entry.name.includes('Miles') ? entry.value.toLocaleString() : `$${entry.value.toLocaleString()}`}
          </p>
        ))}
      </div>
    );
  }
  return null;
};

// ============================================================================
// RPM TREND CALCULATION
// ============================================================================
const calculateRPMTrendData = (loads, selectedTimeRange, isAutoHauling = false) => {
  const rpmTrendData = [];
  let days = 30;

  switch (selectedTimeRange) {
    case '7_days': days = 7; break;
    case '30_days': days = 30; break;
    case '6_months': days = 180; break;
    case 'ytd': {
      const startOfYear = new Date(new Date().getFullYear(), 0, 1);
      days = Math.ceil((new Date() - startOfYear) / (1000 * 60 * 60 * 24));
      break;
    }
    default: break;
  }

  const shouldBatchByWeek = days > 30;
  const increment = shouldBatchByWeek ? 7 : 1;
  const iterations = Math.ceil(days / increment);

  for (let i = iterations - 1; i >= 0; i--) {
    const endDate = new Date();
    endDate.setDate(endDate.getDate() - (i * increment));
    endDate.setHours(23, 59, 59, 999);
    const startDate = new Date(endDate);
    startDate.setDate(endDate.getDate() - (increment - 1));
    startDate.setHours(0, 0, 0, 0);

    const periodLoads = loads.filter(load => {
      const delDate = load.actualDEL?.toDate();
      return delDate >= startDate && delDate <= endDate;
    });

    let totalAmount = 0, totalMiles = 0, totalVehicles = 0;
    periodLoads.forEach(load => {
      totalAmount += Number(load.amount) || 0;
      totalMiles += Number(load.mileage) || 0;
      if (isAutoHauling) {
        totalVehicles += load.vehicleCount ? Number(load.vehicleCount) :
          (load.vehicles && Array.isArray(load.vehicles)) ? load.vehicles.length : 1;
      }
    });

    let metric = 0, metricLabel = '';
    if (isAutoHauling) {
      metric = (totalMiles > 0 && totalVehicles > 0) ? totalAmount / totalVehicles / totalMiles : 0;
      metricLabel = 'PV/M';
    } else {
      metric = totalMiles > 0 ? totalAmount / totalMiles : 0;
      metricLabel = 'RPM';
    }

    rpmTrendData.push({
      date: shouldBatchByWeek
        ? startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
        : endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      rpm: Math.round(metric * 100) / 100,
      loads: periodLoads.length,
      totalAmount: Math.round(totalAmount),
      totalMiles: Math.round(totalMiles),
      totalVehicles: isAutoHauling ? totalVehicles : null,
      metricType: metricLabel,
      isAutoHauling
    });
  }
  return rpmTrendData;
};

// ============================================================================
// DRIVER DETAIL PANEL (Sub-widget when clicking a driver)
// ============================================================================
const DriverDetailPanel = ({ driver, allLoads, onClose }) => {
  const [detailTab, setDetailTab] = useState('weekly');

  const driverLoads = useMemo(() => {
    return allLoads.filter(l => l.driverId === driver.id);
  }, [allLoads, driver.id]);

  // Calculate stats for each period
  const stats = useMemo(() => {
    const now = new Date();

    // This week (Mon-Sun)
    const dayOfWeek = now.getDay();
    const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - daysToMonday);
    weekStart.setHours(0, 0, 0, 0);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    weekEnd.setHours(23, 59, 59, 999);

    // This month
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

    // This year
    const yearStart = new Date(now.getFullYear(), 0, 1);
    const yearEnd = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);

    const calcPeriod = (loads, start, end) => {
      const filtered = loads.filter(l => {
        const d = l.actualDEL?.toDate();
        return d && d >= start && d <= end;
      });
      const gross = filtered.reduce((s, l) => s + (Number(l.amount) || 0), 0);
      const miles = filtered.reduce((s, l) => s + (Number(l.mileage) || 0), 0);
      return { loads: filtered.length, gross, miles, rpm: miles > 0 ? gross / miles : 0 };
    };

    return {
      weekly: calcPeriod(driverLoads, weekStart, weekEnd),
      monthly: calcPeriod(driverLoads, monthStart, monthEnd),
      annual: calcPeriod(driverLoads, yearStart, yearEnd)
    };
  }, [driverLoads]);

  // Chart data - last 12 weeks for weekly, last 12 months for monthly/annual
  const chartData = useMemo(() => {
    const now = new Date();

    if (detailTab === 'weekly') {
      // Last 12 weeks
      const data = [];
      for (let i = 11; i >= 0; i--) {
        const wEnd = new Date(now);
        wEnd.setDate(now.getDate() - (i * 7));
        wEnd.setHours(23, 59, 59, 999);
        const wStart = new Date(wEnd);
        wStart.setDate(wEnd.getDate() - 6);
        wStart.setHours(0, 0, 0, 0);

        const filtered = driverLoads.filter(l => {
          const d = l.actualDEL?.toDate();
          return d && d >= wStart && d <= wEnd;
        });
        const gross = filtered.reduce((s, l) => s + (Number(l.amount) || 0), 0);
        const miles = filtered.reduce((s, l) => s + (Number(l.mileage) || 0), 0);

        data.push({
          label: wStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          Gross: Math.round(gross),
          Miles: Math.round(miles)
        });
      }
      return data;
    }

    if (detailTab === 'monthly') {
      // Last 6 months
      const data = [];
      for (let i = 5; i >= 0; i--) {
        const mStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const mEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59, 999);

        const filtered = driverLoads.filter(l => {
          const d = l.actualDEL?.toDate();
          return d && d >= mStart && d <= mEnd;
        });
        const gross = filtered.reduce((s, l) => s + (Number(l.amount) || 0), 0);
        const miles = filtered.reduce((s, l) => s + (Number(l.mileage) || 0), 0);

        data.push({
          label: mStart.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
          Gross: Math.round(gross),
          Miles: Math.round(miles)
        });
      }
      return data;
    }

    // Annual - last 3 years by quarter
    const data = [];
    const currentYear = now.getFullYear();
    for (let y = currentYear - 1; y <= currentYear; y++) {
      for (let q = 0; q < 4; q++) {
        const qStart = new Date(y, q * 3, 1);
        const qEnd = new Date(y, q * 3 + 3, 0, 23, 59, 59, 999);
        if (qStart > now) break;

        const filtered = driverLoads.filter(l => {
          const d = l.actualDEL?.toDate();
          return d && d >= qStart && d <= qEnd;
        });
        const gross = filtered.reduce((s, l) => s + (Number(l.amount) || 0), 0);
        const miles = filtered.reduce((s, l) => s + (Number(l.mileage) || 0), 0);

        data.push({
          label: `Q${q + 1} ${y}`,
          Gross: Math.round(gross),
          Miles: Math.round(miles)
        });
      }
    }
    return data;
  }, [driverLoads, detailTab]);

  const currentStats = stats[detailTab === 'annual' ? 'annual' : detailTab];

  return (
    <div className="mt-2 bg-gray-50 border border-gray-200 rounded-lg p-4 animate-fadeIn">
      {/* Header */}
      <div className="flex justify-between items-center mb-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-800">{driver.name}</h3>
          <p className="text-xs text-gray-500">{driver.companyAtTimeOfLoad || ''}</p>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); onClose(); }}
          className="text-gray-400 hover:text-gray-600 p-1"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Period tabs */}
      <div className="flex gap-1 mb-4">
        {['weekly', 'monthly', 'annual'].map(tab => (
          <button
            key={tab}
            onClick={(e) => { e.stopPropagation(); setDetailTab(tab); }}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              detailTab === tab
                ? 'bg-blue-600 text-white'
                : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
            }`}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {/* Quick stat cards */}
      <div className="grid grid-cols-4 gap-3 mb-4">
        <div className="bg-white rounded-lg p-3 border border-gray-200 text-center">
          <p className="text-xs text-gray-500">Loads</p>
          <p className="text-lg font-bold text-gray-800">{currentStats.loads}</p>
        </div>
        <div className="bg-white rounded-lg p-3 border border-gray-200 text-center">
          <p className="text-xs text-gray-500">Gross</p>
          <p className="text-lg font-bold text-green-600">${currentStats.gross.toLocaleString()}</p>
        </div>
        <div className="bg-white rounded-lg p-3 border border-gray-200 text-center">
          <p className="text-xs text-gray-500">Miles</p>
          <p className="text-lg font-bold text-blue-600">{currentStats.miles.toLocaleString()}</p>
        </div>
        <div className="bg-white rounded-lg p-3 border border-gray-200 text-center">
          <p className="text-xs text-gray-500">RPM</p>
          <p className="text-lg font-bold text-purple-600">${currentStats.rpm.toFixed(2)}</p>
        </div>
      </div>

      {/* Chart */}
      <div className="bg-white rounded-lg border border-gray-200 p-3">
        <p className="text-xs font-medium text-gray-500 mb-2">
          {detailTab === 'weekly' ? 'Last 12 Weeks' : detailTab === 'monthly' ? 'Last 6 Months' : 'Quarterly'}
        </p>
        <div className="w-full h-48">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="label" fontSize={10} stroke="#999" angle={-30} textAnchor="end" height={40} />
              <YAxis yAxisId="left" fontSize={10} stroke="#16a34a" tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
              <YAxis yAxisId="right" orientation="right" fontSize={10} stroke="#3b82f6" tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
              <Tooltip content={<DriverDetailTooltip />} />
              <Legend wrapperStyle={{ fontSize: '11px' }} />
              <Bar yAxisId="left" dataKey="Gross" fill="#16a34a" radius={[2, 2, 0, 0]} name="Gross ($)" />
              <Bar yAxisId="right" dataKey="Miles" fill="#3b82f6" radius={[2, 2, 0, 0]} name="Miles" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// DRIVER PERFORMANCE WIDGET
// ============================================================================
const DriverPerformanceWidget = ({ title, icon, iconColor, drivers, allDrivers, allLoads, isTop, driverPeriod }) => {
  const [expanded, setExpanded] = useState(false);
  const [selectedDriverId, setSelectedDriverId] = useState(null);

  const displayDrivers = expanded ? allDrivers : drivers;

  const handleDriverClick = (driver) => {
    setSelectedDriverId(prev => prev === driver.id ? null : driver.id);
  };

  return (
    <div className="bg-white rounded-lg shadow overflow-hidden">
      {/* Header */}
      <div className="p-4 pb-2">
        <h2 className="text-base font-semibold text-gray-700 flex items-center gap-2">
          <span className={iconColor}>{icon}</span>
          {title}
          <span className="text-xs font-normal text-gray-400 ml-1">
            ({driverPeriod === 'week' ? 'This Week' : 'This Month'})
          </span>
        </h2>
      </div>

      {/* Driver list */}
      <div className={`px-4 ${expanded ? 'max-h-[600px] overflow-y-auto custom-scrollbar' : ''}`}>
        <ul className="divide-y divide-gray-100">
          {displayDrivers.length === 0 && (
            <li className="py-4 text-center text-sm text-gray-400">No driver data available</li>
          )}
          {displayDrivers.map((driver, index) => {
            const isSelected = selectedDriverId === driver.id;
            const rank = expanded
              ? (isTop
                ? index + 1
                : allDrivers.length - displayDrivers.length + index + 1)
              : index + 1;

            return (
              <li key={driver.id || index}>
                <button
                  className={`w-full text-left py-2.5 flex items-center justify-between hover:bg-gray-50 transition-colors rounded-md px-2 -mx-2 ${
                    isSelected ? 'bg-blue-50' : ''
                  }`}
                  onClick={() => handleDriverClick(driver)}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                      isTop
                        ? rank <= 3 ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                        : rank <= 3 ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'
                    }`}>
                      {rank}
                    </span>
                    <span className="text-sm text-gray-800 truncate">{driver.name}</span>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <div className="text-right">
                      <span className={`text-sm font-semibold ${isTop ? 'text-green-600' : 'text-red-600'}`}>
                        ${driver.gross.toLocaleString()}
                      </span>
                      {driver.rpm > 0 && (
                        <div className="text-[11px] text-purple-600">${driver.rpm.toFixed(2)}/mi</div>
                      )}
                    </div>
                    <svg
                      className={`w-4 h-4 text-gray-400 transition-transform ${isSelected ? 'rotate-180' : ''}`}
                      fill="none" stroke="currentColor" viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </button>

                {/* Expanded driver detail */}
                {isSelected && (
                  <DriverDetailPanel
                    driver={driver}
                    allLoads={allLoads}
                    onClose={() => setSelectedDriverId(null)}
                  />
                )}
              </li>
            );
          })}
        </ul>
      </div>

      {/* Expand / Collapse */}
      {allDrivers.length > 10 && (
        <div className="px-4 py-3 border-t border-gray-100">
          <button
            onClick={() => { setExpanded(!expanded); setSelectedDriverId(null); }}
            className="w-full text-center text-sm font-medium text-blue-600 hover:text-blue-800 transition-colors flex items-center justify-center gap-1"
          >
            {expanded ? (
              <>
                Show Top/Bottom 10
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                </svg>
              </>
            ) : (
              <>
                Show All {allDrivers.length} Drivers
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
};

// ============================================================================
// FETCH DASHBOARD DATA
// ============================================================================
// FIND THE ENTIRE fetchDashboardData function and REPLACE WITH:

const fetchDashboardData = async (companyFilter, tenantId, timeRange, tenantSettings, onPartialData) => {
  if (!tenantId) return null;

  try {
    const now = new Date();

    // Week boundaries (Mon-Sun)
    const dayOfWeek = now.getDay();
    const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - daysToMonday);
    weekStart.setHours(0, 0, 0, 0);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    weekEnd.setHours(23, 59, 59, 999);

    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

    const prevWeekStart = new Date(weekStart); prevWeekStart.setDate(weekStart.getDate() - 7);
    const prevWeekEnd = new Date(weekEnd); prevWeekEnd.setDate(weekEnd.getDate() - 7);
    const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);

    const filterByPeriod = (loads, start, end) => loads.filter(l => {
      const d = l.actualDEL?.toDate();
      return d && d >= start && d <= end;
    });

    const calcStats = (loads) => {
      const gross = loads.reduce((s, l) => s + (Number(l.amount) || 0), 0);
      const miles = loads.reduce((s, l) => s + (Number(l.mileage) || 0), 0);
      return { gross: Math.round(gross), miles, rpm: miles > 0 ? Math.round((gross / miles) * 100) / 100 : 0, count: loads.length };
    };

    // ================================================================
    // PHASE 1: Fast queries — drivers, trucks, active loads, recent delivered
    // Recent = last 60 days (covers weekly + monthly + prev periods)
    // ================================================================
    const sixtyDaysAgo = new Date(now);
    sixtyDaysAgo.setDate(now.getDate() - 35);

    const [recentLoadsSnapshot, driversSnapshot, trucksSnapshot, activeLoadsSnapshot] = await Promise.all([
      getDocs(query(
        collection(db, "loads"),
        where("tenantId", "==", tenantId),
        where("status", "==", "Delivered"),
        where("actualDEL", ">=", sixtyDaysAgo),
        orderBy("actualDEL", "desc"),
        limit(500)
      )),
      getDocs(query(collection(db, "drivers"), where("tenantId", "==", tenantId))),
      getDocs(query(collection(db, "trucks"), where("tenantId", "==", tenantId))),
      getDocs(query(collection(db, "loads"), where("tenantId", "==", tenantId),
        where("status", "in", ["Available", "Booked", "Dispatched", "Picked Up", "In Transit", "At Delivery", "At Shipper"])))
    ]);

    let recentLoads = recentLoadsSnapshot.docs.map(d => ({ id: d.id, ...d.data() }));

    // Company filter for recent loads
    if (companyFilter !== "all") {
      const selectedCompanyDoc = await getDoc(doc(db, "companies", companyFilter));
      if (selectedCompanyDoc.exists()) {
        const companyData = selectedCompanyDoc.data();
        if (companyData.tenantId !== tenantId) return null;
        const companyName = companyData.name;
        recentLoads = recentLoads.filter(load =>
          load.assignedCompanyName === companyName ||
          load.companyName === companyName ||
          load.company === companyName ||
          load.assignedCompanyId === companyFilter ||
          load.companyId === companyFilter
        );
      }
    }

    // Drivers/Trucks processing
    const allDriversRaw = driversSnapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    const driversById = {};
    allDriversRaw.forEach(d => { driversById[d.id] = d.name || 'Unknown Driver'; });
    const nonDeletedDrivers = allDriversRaw.filter(d => !d.isDeleted && d.status !== "Deleted");
    const activeDrivers = nonDeletedDrivers.filter(d => d.status === "Active");
    const activeLoads = activeLoadsSnapshot.docs.map(d => d.data());
    const assignedDriverIds = new Set(activeLoads.map(l => l.driverId).filter(Boolean));
    const driversEmpty = Math.max(0, activeDrivers.length - assignedDriverIds.size);
    const trucks = trucksSnapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    const trucksInMaintenance = trucks.filter(t => t.status === "In Maintenance" || t.status === "Inactive").length;

    // Calculate stats from recent loads
    const weeklyLoads = filterByPeriod(recentLoads, weekStart, weekEnd);
    const monthlyLoads = filterByPeriod(recentLoads, monthStart, monthEnd);
    const prevWeeklyLoads = filterByPeriod(recentLoads, prevWeekStart, prevWeekEnd);
    const prevMonthlyLoads = filterByPeriod(recentLoads, prevMonthStart, prevMonthEnd);

    const weekly = calcStats(weeklyLoads);
    const monthly = calcStats(monthlyLoads);
    const prevWeekly = calcStats(prevWeeklyLoads);
    const prevMonthly = calcStats(prevMonthlyLoads);

    const weeklyChange = prevWeekly.gross > 0 ? Math.round(((weekly.gross - prevWeekly.gross) / prevWeekly.gross) * 100) : 0;
    const monthlyChange = prevMonthly.gross > 0 ? Math.round(((monthly.gross - prevMonthly.gross) / prevMonthly.gross) * 100) : 0;

    const isAutoHauling = tenantSettings?.commodityTypes?.includes('automobile_hauling') || false;

    // Driver perf from recent data
    const buildDriverPerformance = (loads) => {
      const stats = {};
      loads.forEach(load => {
        if (!load.driverId) return;
        if (!stats[load.driverId]) {
          stats[load.driverId] = {
            id: load.driverId,
            name: load.assignedDriverName || driversById[load.driverId] || 'Unknown Driver',
            gross: 0, miles: 0, loads: 0, rpm: 0,
            companyAtTimeOfLoad: load.assignedCompanyName || ''
          };
        }
        stats[load.driverId].gross += Number(load.amount) || 0;
        stats[load.driverId].miles += Number(load.mileage) || 0;
        stats[load.driverId].loads++;
      });
      Object.values(stats).forEach(d => { d.rpm = d.miles > 0 ? d.gross / d.miles : 0; });
      return Object.values(stats).sort((a, b) => b.gross - a.gross);
    };

    const weeklyDriverPerf = buildDriverPerformance(weeklyLoads);
    const monthlyDriverPerf = buildDriverPerformance(monthlyLoads);
    const driverGrossAmounts = weeklyDriverPerf.map(d => d.gross);
    const avgDriverWeeklyGross = driverGrossAmounts.length > 0
      ? Math.round(driverGrossAmounts.reduce((s, a) => s + a, 0) / driverGrossAmounts.length) : 0;

    // Truck data
    const topFuel = trucks.filter(t => t.mpg).sort((a, b) => (b.mpg || 0) - (a.mpg || 0)).slice(0, 5).map(t => ({ unit: t.unitNumber || t.unit, mpg: t.mpg }));
    const bottomFuel = trucks.filter(t => t.mpg).sort((a, b) => (a.mpg || 0) - (b.mpg || 0)).slice(0, 5).map(t => ({ unit: t.unitNumber || t.unit, mpg: t.mpg }));
    const defaultTopFuel = [{ unit: "#105", mpg: 7.8 }, { unit: "#210", mpg: 7.6 }, { unit: "#115", mpg: 7.5 }, { unit: "#301", mpg: 7.4 }, { unit: "#205", mpg: 7.3 }];
    const defaultBottomFuel = [{ unit: "#180", mpg: 5.1 }, { unit: "#315", mpg: 5.3 }, { unit: "#122", mpg: 5.4 }, { unit: "#240", mpg: 5.5 }, { unit: "#155", mpg: 5.6 }];
    const topTollTrucks = [
      { unit: "#101", tolls: 150.25 }, { unit: "#208", tolls: 175.50 }, { unit: "#311", tolls: 180.00 },
      { unit: "#119", tolls: 195.75 }, { unit: "#225", tolls: 210.00 }
    ];
    const bottomTollTrucks = [
      { unit: "#145", tolls: 750.80 }, { unit: "#305", tolls: 720.15 }, { unit: "#218", tolls: 690.00 },
      { unit: "#177", tolls: 655.50 }, { unit: "#290", tolls: 640.20 }
    ];

    // ================================================================
    // PHASE 1 COMPLETE — send partial data immediately
    // ================================================================
    const partialResult = {
      weeklyGross: weekly.gross, weeklyLoads: weekly.count, weeklyChange, weeklyRPM: weekly.rpm,
      monthlyGross: monthly.gross, monthlyLoads: monthly.count, monthlyChange, monthlyRPM: monthly.rpm,
      avgDriverWeeklyGross, totalDrivers: activeDrivers.length, driversEmpty, trucksInMaintenance,
      rpmTrendData: calculateRPMTrendData(recentLoads, timeRange, isAutoHauling),
      weeklyDriverPerf, monthlyDriverPerf,
      allDeliveredLoads: recentLoads,
      topFuelEfficientTrucks: topFuel.length > 0 ? topFuel : defaultTopFuel,
      bottomFuelEfficientTrucks: bottomFuel.length > 0 ? bottomFuel : defaultBottomFuel,
      topTollTrucks, bottomTollTrucks,
      isAutomobileHauling: isAutoHauling,
    };

    if (onPartialData) {
      onPartialData(partialResult);
    }

    // ================================================================
    // PHASE 2: Extended history for longer time ranges (bounded)
    // ================================================================
    if (timeRange === '6_months' || timeRange === 'ytd') {
      const extendedStart = timeRange === 'ytd' 
        ? new Date(now.getFullYear(), 0, 1) 
        : new Date(now);
      if (timeRange === '6_months') {
        extendedStart.setDate(now.getDate() - 180);
      }

      const extendedLoadsSnapshot = await getDocs(query(
        collection(db, "loads"),
        where("tenantId", "==", tenantId),
        where("status", "==", "Delivered"),
        where("actualDEL", ">=", extendedStart),
        orderBy("actualDEL", "desc"),
        limit(1000)
      ));
      let extendedLoads = extendedLoadsSnapshot.docs.map(d => ({ id: d.id, ...d.data() }));

      if (companyFilter !== "all") {
        const selectedCompanyDoc = await getDoc(doc(db, "companies", companyFilter));
        if (selectedCompanyDoc.exists()) {
          const companyName = selectedCompanyDoc.data().name;
          extendedLoads = extendedLoads.filter(load =>
            load.assignedCompanyName === companyName ||
            load.companyName === companyName ||
            load.company === companyName ||
            load.assignedCompanyId === companyFilter ||
            load.companyId === companyFilter
          );
        }
      }

      return {
        ...partialResult,
        rpmTrendData: calculateRPMTrendData(extendedLoads, timeRange, isAutoHauling),
        allDeliveredLoads: extendedLoads
      };
    }
     
    return partialResult;
  } catch (error) {
    console.error("Dashboard fetch error:", error);
    throw error;
  }
};

// ============================================================================
// MAIN DASHBOARD COMPONENT
// ============================================================================
export default function DashboardPage() {
  const [dashboardData, setDashboardData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loggedInUser, setLoggedInUser] = useState(null);
  const [error, setError] = useState(null);
  const [selectedCompanyFilter, setSelectedCompanyFilter] = useState("all");
  const [companies, setCompanies] = useState([]);
  const [selectedTimeRange, setSelectedTimeRange] = useState('30_days');
  const [tenantSettings, setTenantSettings] = useState({ commodityTypes: [] });
  const [driverPeriod, setDriverPeriod] = useState('week'); // 'week' or 'month'
 // Counter animations (must run on every render - React hooks rule)
  const animWeeklyGross = useCountUp(dashboardData?.weeklyGross || 0, 1500);
  const animMonthlyGross = useCountUp(dashboardData?.monthlyGross || 0, 1500);
  const animWeeklyLoads = useCountUp(dashboardData?.weeklyLoads || 0, 1200);
  const animMonthlyLoads = useCountUp(dashboardData?.monthlyLoads || 0, 1200);
  const animAvgDriverGross = useCountUp(dashboardData?.avgDriverWeeklyGross || 0, 1500);
  const animTotalDrivers = useCountUp(dashboardData?.totalDrivers || 0, 1000);
  const animDriversEmpty = useCountUp(dashboardData?.driversEmpty || 0, 1000);
  const animTrucksInMaint = useCountUp(dashboardData?.trucksInMaintenance || 0, 1000);
  // Auth
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        const userDocRef = doc(db, "users", user.uid);
        const unsubProfile = onSnapshot(userDocRef, (docSnap) => {
          if (docSnap.exists()) {
            setLoggedInUser(applyOwnerImpersonation({ uid: user.uid, email: user.email, ...docSnap.data() }));
          } else {
            setLoggedInUser({ uid: user.uid, email: user.email, role: null });
          }
        });
        return () => unsubProfile();
      } else {
        setLoggedInUser(null);
      }
    });
    return unsubscribe;
  }, []);

  // Tenant settings
  useEffect(() => {
    if (!loggedInUser?.tenantId) { setTenantSettings({ commodityTypes: [] }); return; }
    const unsub = onSnapshot(doc(db, "tenantSettings", loggedInUser.tenantId), (snap) => {
      setTenantSettings(snap.exists() ? snap.data() : { commodityTypes: [] });
    });
    return () => unsub();
  }, [loggedInUser]);

  // Companies
  useEffect(() => {
    if (!loggedInUser?.tenantId) { setCompanies([]); return; }
    const unsub = onSnapshot(
      query(collection(db, "companies"), where("tenantId", "==", loggedInUser.tenantId)),
      (snap) => setCompanies(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    );
    return () => unsub();
  }, [loggedInUser]);

  // Main data
  useEffect(() => {
    if (!loggedInUser?.tenantId) { setIsLoading(false); setDashboardData(null); return; }
    setIsLoading(true);
    setError(null);
    fetchDashboardData(
      selectedCompanyFilter, 
      loggedInUser.tenantId, 
      selectedTimeRange, 
      tenantSettings,
      (partialData) => {
        // Phase 1 done — show stats immediately
        setDashboardData(partialData);
        setIsLoading(false);
      }
    )
      .then(data => { if (data) setDashboardData(data); })
      .catch(err => { setError("Failed to load dashboard data."); setIsLoading(false); });
  }, [loggedInUser, selectedCompanyFilter, selectedTimeRange, tenantSettings]);
  const selectedCompanyName = useMemo(() => {
    return selectedCompanyFilter === 'all'
      ? 'All Companies'
      : companies.find(c => c.id === selectedCompanyFilter)?.name || selectedCompanyFilter;
  }, [selectedCompanyFilter, companies]);

  // Driver performance data based on selected period tab
  const { topDrivers, bottomDrivers, allDriversSorted } = useMemo(() => {
    if (!dashboardData) return { topDrivers: [], bottomDrivers: [], allDriversSorted: [] };
    const perf = driverPeriod === 'week' ? dashboardData.weeklyDriverPerf : dashboardData.monthlyDriverPerf;
    return {
      topDrivers: perf.slice(0, 10),
      bottomDrivers: [...perf].reverse().slice(0, 10),
      allDriversSorted: perf
    };
  }, [dashboardData, driverPeriod]);

  // Loading states
   if (isLoading) return (
    <div className="max-w-full mx-auto">
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

      {/* Header */}
      <div className="flex justify-between items-center mb-6 skeleton-row" style={{animationDelay: '0ms'}}>
        <div className="h-8 w-48 bg-gray-200 rounded animate-pulse"></div>
        <div className="h-9 w-40 bg-gray-200 rounded animate-pulse"></div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[1,2,3,4].map(i => (
          <div key={i} className="bg-white p-4 rounded-lg shadow skeleton-row" style={{animationDelay: `${i * 100}ms`}}>
            <div className="h-9 w-32 bg-green-100 rounded animate-pulse mb-2"></div>
            <div className="h-4 w-40 bg-gray-200 rounded animate-pulse mb-4"></div>
            <div className="border-t pt-3 mt-2">
              <div className="h-6 w-16 bg-blue-100 rounded animate-pulse mb-1"></div>
              <div className="h-3 w-28 bg-gray-200 rounded animate-pulse"></div>
            </div>
          </div>
        ))}
      </div>

      {/* RPM Chart */}
      <div className="bg-white p-6 rounded-lg shadow mb-6 skeleton-row" style={{animationDelay: '500ms'}}>
        <div className="flex justify-between items-center mb-4">
          <div className="h-5 w-64 bg-gray-200 rounded animate-pulse"></div>
          <div className="flex gap-1">
            {[1,2,3,4].map(i => (
              <div key={i} className="h-7 w-16 bg-gray-100 rounded animate-pulse"></div>
            ))}
          </div>
        </div>
        <div className="h-64 bg-gray-50 rounded-lg animate-pulse flex items-end justify-around px-8 pb-4">
          {[40,65,45,70,55,80,60,75,50,68,72,58].map((h, i) => (
            <div key={i} className="w-4 bg-blue-100 rounded-t animate-pulse" style={{height: `${h}%`, animationDelay: `${600 + i * 50}ms`}}></div>
          ))}
        </div>
      </div>

      {/* Driver Performance */}
      <div className="mb-6 skeleton-row" style={{animationDelay: '800ms'}}>
        <div className="flex justify-between items-center mb-4">
          <div className="h-5 w-40 bg-gray-200 rounded animate-pulse"></div>
          <div className="h-8 w-48 bg-gray-100 rounded-lg animate-pulse"></div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {[1,2].map(col => (
            <div key={col} className="bg-white rounded-lg shadow overflow-hidden">
              <div className="p-4 pb-2">
                <div className="h-4 w-32 bg-gray-200 rounded animate-pulse"></div>
              </div>
              <div className="px-4 pb-4">
                {[1,2,3,4,5].map(row => (
                  <div key={row} className="flex items-center justify-between py-2.5 border-b border-gray-100 skeleton-row" style={{animationDelay: `${800 + col * 200 + row * 80}ms`}}>
                    <div className="flex items-center gap-2">
                      <div className="h-6 w-6 bg-gray-200 rounded-full animate-pulse"></div>
                      <div className="h-4 w-28 bg-gray-200 rounded animate-pulse"></div>
                    </div>
                    <div className="h-4 w-20 bg-green-100 rounded animate-pulse"></div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Truck Performance */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 skeleton-row" style={{animationDelay: '1200ms'}}>
        {[1,2].map(col => (
          <div key={col} className="bg-white p-4 rounded-lg shadow">
            <div className="h-5 w-40 bg-gray-200 rounded animate-pulse mb-3"></div>
            <div className="space-y-2">
              {[1,2,3,4,5].map(row => (
                <div key={row} className="flex justify-between items-center">
                  <div className="h-3 w-20 bg-gray-200 rounded animate-pulse"></div>
                  <div className="h-3 w-16 bg-gray-200 rounded animate-pulse"></div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Loading indicator */}
      <div className="mt-6 flex items-center justify-center gap-2 text-sm text-gray-500 skeleton-row" style={{animationDelay: '1400ms'}}>
        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
        <span>Loading dashboard...</span>
      </div>
    </div>
  );
  if (!loggedInUser) return <div className="p-6 text-center text-gray-500">Please log in to view the dashboard.</div>;
  if (!loggedInUser.tenantId) return <div className="p-6 text-center text-red-500">User account not properly configured.</div>;
  if (error) return <div className="p-6 text-center text-red-500">{error}</div>;
  if (!dashboardData) return <div className="p-6 text-center text-gray-500">No dashboard data available.</div>;

  const {
    weeklyGross, weeklyLoads, weeklyChange, weeklyRPM,
    monthlyGross, monthlyLoads, monthlyChange, monthlyRPM,
    avgDriverWeeklyGross, totalDrivers, driversEmpty, trucksInMaintenance,
    rpmTrendData, allDeliveredLoads,
    topFuelEfficientTrucks, bottomFuelEfficientTrucks,
    topTollTrucks, bottomTollTrucks
  } = dashboardData;
  
  return (
    <div className="max-w-full mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-center mb-6 gap-2">
        <h1 className="text-2xl sm:text-3xl font-semibold text-gray-800">
          Dashboard <span className="text-base font-normal text-gray-500">({selectedCompanyName})</span>
        </h1>
        <div className="flex items-center space-x-2">
          <label htmlFor="dashboardCompanyFilter" className="text-sm font-medium text-gray-600 hidden lg:inline">Company:</label>
          <select
            id="dashboardCompanyFilter"
            value={selectedCompanyFilter}
            onChange={(e) => setSelectedCompanyFilter(e.target.value)}
            className="border rounded-md py-1.5 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          >
            <option value="all">All Companies</option>
            {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {/* Weekly Gross */}
        <div className="bg-white p-4 rounded-lg shadow">
          <div className="flex justify-between items-start mb-1">
            <div className="text-3xl font-bold text-green-600">${animWeeklyGross.toLocaleString()}</div>
            {weeklyChange !== 0 && (
              <span className={`text-sm ${weeklyChange > 0 ? 'text-green-500' : 'text-red-500'}`}>
                {weeklyChange > 0 ? '▲' : '▼'} {Math.abs(weeklyChange)}%
              </span>
            )}
          </div>
          <div className="text-sm text-gray-500 mb-2">Total Weekly Gross</div>
          <div className="border-t pt-2 mt-2">
            <div className="text-xl font-semibold text-blue-600">{animWeeklyLoads}</div>
            <div className="text-xs text-gray-500">Loads This Week</div>
            <div className="text-sm font-medium text-purple-600 mt-1">${weeklyRPM.toFixed(2)}/mi</div>
          </div>
        </div>

        {/* Monthly Gross */}
        <div className="bg-white p-4 rounded-lg shadow">
          <div className="flex justify-between items-start mb-1">
            <div className="text-3xl font-bold text-green-600">${animMonthlyGross.toLocaleString()}</div>
            {monthlyChange !== 0 && (
              <span className={`text-sm ${monthlyChange > 0 ? 'text-green-500' : 'text-red-500'}`}>
                {monthlyChange > 0 ? '▲' : '▼'} {Math.abs(monthlyChange)}%
              </span>
            )}
          </div>
          <div className="text-sm text-gray-500 mb-2">Total Monthly Gross</div>
          <div className="border-t pt-2 mt-2">
            <div className="text-xl font-semibold text-blue-600">{animMonthlyLoads}</div>
            <div className="text-xs text-gray-500">Loads This Month</div>
            <div className="text-sm font-medium text-purple-600 mt-1">${monthlyRPM.toFixed(2)}/mi</div>
          </div>
        </div>

        {/* Avg Driver Gross */}
        <div className="bg-white p-4 rounded-lg shadow">
          <div className="text-3xl font-bold text-green-600">${animAvgDriverGross.toLocaleString()}</div>
          <div className="text-sm text-gray-500 mb-2">Avg. Weekly Driver Gross</div>
          <div className="border-t pt-2 mt-2">
            <div className="text-xl font-semibold text-gray-700">{animTotalDrivers}</div>
            <div className="text-xs text-gray-500">Drivers in System</div>
          </div>
        </div>

        {/* Fleet Status */}
        <div className="bg-white p-4 rounded-lg shadow">
          <div className="text-3xl font-bold text-orange-600">{animDriversEmpty}</div>
          <div className="text-sm text-gray-500 mb-2">Drivers Currently Empty</div>
          <div className="border-t pt-2 mt-2">
            <div className="text-xl font-semibold text-red-600">{animTrucksInMaint}</div>
            <div className="text-xs text-gray-500">Trucks in Maintenance</div>
          </div>
        </div>
      </div>

      {/* RPM Trend Chart */}
      <div className="bg-white p-6 rounded-lg shadow mb-6">
        <div className="flex flex-col sm:flex-row justify-between items-center mb-4">
          <h2 className="text-lg font-semibold text-gray-700">
            {dashboardData?.isAutomobileHauling ? 'Price per Vehicle per Mile (PV/M) Trend' : 'Average Rate Per Mile (RPM) Trend'}
          </h2>
          <div className="flex space-x-1 mt-2 sm:mt-0">
            {[
              { key: '7_days', label: '7 Days' },
              { key: '30_days', label: '30 Days' },
              { key: '6_months', label: '6 Months' },
              { key: 'ytd', label: 'YTD' }
            ].map(r => (
              <button
                key={r.key}
                onClick={() => setSelectedTimeRange(r.key)}
                className={`text-xs px-2.5 py-1 rounded ${
                  selectedTimeRange === r.key ? 'bg-blue-100 text-blue-700 font-medium' : 'bg-gray-200 hover:bg-gray-300 text-gray-700'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
        {rpmTrendData && rpmTrendData.length > 0 ? (
          <div className="w-full h-64 sm:h-80">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={rpmTrendData} margin={{ top: 5, right: 30, left: 20, bottom: 60 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="date" stroke="#666" fontSize={12} angle={-45} textAnchor="end" height={60} />
                <YAxis stroke="#666" fontSize={12} tickFormatter={v => `${v.toFixed(2)}`} />
                <Tooltip content={<CustomTooltip />} />
                <Legend />
                <Line
                  type="monotone" dataKey="rpm" stroke="#3B82F6" strokeWidth={3}
                  dot={{ fill: '#3B82F6', strokeWidth: 2, r: 4 }}
                  activeDot={{ r: 6, stroke: '#3B82F6', strokeWidth: 2 }}
                  name={dashboardData?.isAutomobileHauling ? "PV/M ($)" : "Rate Per Mile ($)"}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="flex items-center justify-center h-64 sm:h-80 bg-gray-50 rounded-md">
            <div className="text-center">
              <div className="text-lg font-semibold text-gray-700 mb-2">
                Current {dashboardData?.isAutomobileHauling ? 'PV/M' : 'RPM'}: ${monthlyRPM.toFixed(2)}/mile
              </div>
              <div className="text-sm text-gray-500">No data available for selected time range</div>
            </div>
          </div>
        )}
      </div>

      {/* ============================================================
          DRIVER PERFORMANCE - Week/Month Tabs + Top/Bottom 10
      ============================================================ */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-700">Driver Performance</h2>
          <div className="flex bg-gray-100 rounded-lg p-0.5">
            <button
              onClick={() => setDriverPeriod('week')}
              className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
                driverPeriod === 'week' ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              This Week
            </button>
            <button
              onClick={() => setDriverPeriod('month')}
              className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
                driverPeriod === 'month' ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              This Month
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <DriverPerformanceWidget
            title="Top Drivers"
            icon={<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" /></svg>}
            iconColor="text-green-500"
            drivers={topDrivers}
            allDrivers={allDriversSorted}
            allLoads={allDeliveredLoads}
            isTop={true}
            driverPeriod={driverPeriod}
          />
          <DriverPerformanceWidget
            title="Bottom Drivers"
            icon={<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6L9 12.75l4.286-4.286a11.948 11.948 0 014.306 6.43l.776 2.898m0 0l3.182-5.511m-3.182 5.51l-5.511-3.181" /></svg>}
            iconColor="text-red-500"
            drivers={bottomDrivers}
            allDrivers={[...allDriversSorted].reverse()}
            allLoads={allDeliveredLoads}
            isTop={false}
            driverPeriod={driverPeriod}
          />
        </div>
      </div>

      {/* Truck Performance */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white p-4 rounded-lg shadow">
          <h2 className="text-lg font-semibold text-gray-700 mb-3 flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-5 h-5 text-teal-600"><path strokeLinecap="round" strokeLinejoin="round" d="M15.362 5.214A8.252 8.252 0 0 1 12 21 8.25 8.25 0 0 1 6.038 7.047 8.287 8.287 0 0 0 9 9.601a8.983 8.983 0 0 1 3.361-6.867 8.21 8.21 0 0 0 3 2.48Z" /><path strokeLinecap="round" strokeLinejoin="round" d="M12 18a3.75 3.75 0 0 0 .495-7.468 3.75 3.75 0 0 0-.495-7.468V18Z" /></svg>
            Truck Fuel Efficiency
          </h2>
          <div className="space-y-2 overflow-y-auto h-48 custom-scrollbar pr-2">
            <h3 className="text-sm font-medium text-green-600">Top 5 (Most Efficient)</h3>
            <ul className="space-y-1 pl-2 border-l border-green-200 text-xs">
              {topFuelEfficientTrucks.map((t, i) => (
                <li key={i} className="flex justify-between items-center"><span>Unit {t.unit}</span><span className="font-medium">{t.mpg} MPG</span></li>
              ))}
            </ul>
            <h3 className="text-sm font-medium text-red-600 mt-3">Bottom 5 (Least Efficient)</h3>
            <ul className="space-y-1 pl-2 border-l border-red-200 text-xs">
              {bottomFuelEfficientTrucks.map((t, i) => (
                <li key={i} className="flex justify-between items-center"><span>Unit {t.unit}</span><span className="font-medium">{t.mpg} MPG</span></li>
              ))}
            </ul>
          </div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow">
          <h2 className="text-lg font-semibold text-gray-700 mb-3 flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-5 h-5 text-indigo-600"><path strokeLinecap="round" strokeLinejoin="round" d="M15 8.25H9m6 3H9m3 6l-3-3h1.5a3 3 0 1 0 0-6M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg>
            Truck Toll Usage
          </h2>
          <div className="space-y-2 overflow-y-auto h-48 custom-scrollbar pr-2">
            <h3 className="text-sm font-medium text-green-600">Top 5 (Lowest Tolls)</h3>
            <ul className="space-y-1 pl-2 border-l border-green-200 text-xs">
              {topTollTrucks.map((t, i) => (
                <li key={i} className="flex justify-between items-center"><span>Unit {t.unit}</span><span className="font-medium">${t.tolls.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></li>
              ))}
            </ul>
            <h3 className="text-sm font-medium text-red-600 mt-3">Bottom 5 (Highest Tolls)</h3>
            <ul className="space-y-1 pl-2 border-l border-red-200 text-xs">
              {bottomTollTrucks.map((t, i) => (
                <li key={i} className="flex justify-between items-center"><span>Unit {t.unit}</span><span className="font-medium">${t.tolls.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* Styles */}
      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: #f1f1f1; border-radius: 2px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #c1c1c1; border-radius: 2px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #a1a1a1; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: translateY(0); } }
        .animate-fadeIn { animation: fadeIn 0.2s ease-out; }
      `}</style>
    </div>
  );
}