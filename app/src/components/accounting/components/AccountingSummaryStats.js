// src/components/accounting/components/AccountingSummaryStats.js

import React, { useMemo, useState } from 'react';

// Inline formatCurrency to avoid import path issues
const formatCurrency = (amount) => {
  const num = parseFloat(amount) || 0;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(num);
};

export default function AccountingSummaryStats({
  accountingLoads,
  drivers,
  dispatchers,
  brokers,
  filters,
  onHideStats  
}) {
  const [expandedSection, setExpandedSection] = useState(null);
  const [showSettings, setShowSettings] = useState(false);

  // Card visibility state - load from localStorage or use defaults
  const [visibleCards, setVisibleCards] = useState(() => {
    const saved = localStorage.getItem('accountingStatsVisibility');
    if (saved) {
      return JSON.parse(saved);
    }
    return {
      loads: true,
      gross: true,
      avgPerMile: true,
      collected: true,
      outstanding: true,
      onTime: true,
      performance: true,
      dispatchers: true,
      brokers: true
    };
  });

  // Save to localStorage when visibility changes
  const toggleCardVisibility = (cardKey) => {
    setVisibleCards(prev => {
      const updated = { ...prev, [cardKey]: !prev[cardKey] };
      localStorage.setItem('accountingStatsVisibility', JSON.stringify(updated));
      return updated;
    });
  };

  const resetVisibility = () => {
    const defaults = {
      loads: true,
      gross: true,
      avgPerMile: true,
      collected: true,
      outstanding: true,
      onTime: true,
      performance: true,
      dispatchers: true,
      brokers: true
    };
    setVisibleCards(defaults);
    localStorage.setItem('accountingStatsVisibility', JSON.stringify(defaults));
  };

  const stats = useMemo(() => {
    if (!accountingLoads || accountingLoads.length === 0) {
      return null;
    }

    // Basic totals
    const totalAmount = accountingLoads.reduce((sum, load) => sum + (parseFloat(load.amount) || 0), 0);
    const totalBrokerFees = accountingLoads.reduce((sum, load) => sum + (parseFloat(load.brokerFeeCollection) || 0), 0);
    const totalNetAmount = totalAmount - totalBrokerFees;
    const totalMileage = accountingLoads.reduce((sum, load) => sum + (parseFloat(load.mileage) || 0), 0);
    const avgPerMile = totalMileage > 0 ? (totalNetAmount / totalMileage) : 0;

    // Payment stats
    const paidLoads = accountingLoads.filter(l => l.paymentStatus === 'paid');
    const unpaidLoads = accountingLoads.filter(l => l.paymentStatus !== 'paid');
    const invoicedLoads = accountingLoads.filter(l => l.invoiceStatus === 'invoiced');
    const paidAmount = paidLoads.reduce((sum, load) => sum + (parseFloat(load.amount) || 0), 0);
    const unpaidAmount = unpaidLoads.reduce((sum, load) => sum + (parseFloat(load.amount) || 0), 0);

    // Delay statistics
    let delayedPickups = 0;
    let onTimePickups = 0;
    let delayedDeliveries = 0;
    let onTimeDeliveries = 0;

    accountingLoads.forEach(load => {
      // Pickup delay check
      const actualPU = load.actualPU || load.actualPickupTimestamp;
      const scheduledPU = load.pickupDateTime;
      
      if (actualPU && scheduledPU) {
        const actualDate = new Date(actualPU.seconds ? actualPU.seconds * 1000 : actualPU);
        const scheduledDate = new Date(scheduledPU.seconds ? scheduledPU.seconds * 1000 : scheduledPU);
        if (actualDate > scheduledDate) {
          delayedPickups++;
        } else {
          onTimePickups++;
        }
      }

      // Delivery delay check (only for delivered loads)
      if (load.status === 'Delivered') {
        const actualDEL = load.actualDEL;
        const scheduledDEL = load.deliveryDateTime;
        
        if (actualDEL && scheduledDEL) {
          const actualDate = new Date(actualDEL.seconds ? actualDEL.seconds * 1000 : actualDEL);
          const scheduledDate = new Date(scheduledDEL.seconds ? scheduledDEL.seconds * 1000 : scheduledDEL);
          if (actualDate > scheduledDate) {
            delayedDeliveries++;
          } else {
            onTimeDeliveries++;
          }
        }
      }
    });

    const totalPickupsTracked = delayedPickups + onTimePickups;
    const totalDeliveriesTracked = delayedDeliveries + onTimeDeliveries;
    const pickupOnTimeRate = totalPickupsTracked > 0 ? ((onTimePickups / totalPickupsTracked) * 100) : 0;
    const deliveryOnTimeRate = totalDeliveriesTracked > 0 ? ((onTimeDeliveries / totalDeliveriesTracked) * 100) : 0;

    // Dispatcher statistics
    const dispatcherStats = {};
    accountingLoads.forEach(load => {
      if (load.dispatcherId) {
        if (!dispatcherStats[load.dispatcherId]) {
          const dispatcher = dispatchers.find(d => d.id === load.dispatcherId);
          dispatcherStats[load.dispatcherId] = {
            id: load.dispatcherId,
            name: dispatcher ? (dispatcher.name || dispatcher.email) : 'Unknown',
            loadCount: 0,
            totalAmount: 0,
            totalMileage: 0
          };
        }
        dispatcherStats[load.dispatcherId].loadCount++;
        dispatcherStats[load.dispatcherId].totalAmount += parseFloat(load.amount) || 0;
        dispatcherStats[load.dispatcherId].totalMileage += parseFloat(load.mileage) || 0;
      }
    });

    const dispatcherRankings = Object.values(dispatcherStats)
      .sort((a, b) => b.loadCount - a.loadCount)
      .slice(0, 5);

    // Broker statistics
    const brokerStats = {};
    accountingLoads.forEach(load => {
      const brokerId = load.brokerId;
      const brokerName = brokers.find(b => b.id === brokerId)?.name || load.brokerName || 'Unknown';
      const key = brokerId || brokerName;
      
      if (key) {
        if (!brokerStats[key]) {
          brokerStats[key] = {
            id: brokerId,
            name: brokerName,
            loadCount: 0,
            totalAmount: 0,
            totalMileage: 0
          };
        }
        brokerStats[key].loadCount++;
        brokerStats[key].totalAmount += parseFloat(load.amount) || 0;
        brokerStats[key].totalMileage += parseFloat(load.mileage) || 0;
      }
    });

    const brokerRankings = Object.values(brokerStats)
      .sort((a, b) => b.totalAmount - a.totalAmount)
      .slice(0, 5);

    return {
      // Totals
      loadCount: accountingLoads.length,
      totalAmount,
      totalBrokerFees,
      totalNetAmount,
      totalMileage,
      avgPerMile,
      // Payment
      paidCount: paidLoads.length,
      unpaidCount: unpaidLoads.length,
      invoicedCount: invoicedLoads.length,
      paidAmount,
      unpaidAmount,
      // Delays
      delayedPickups,
      onTimePickups,
      delayedDeliveries,
      onTimeDeliveries,
      pickupOnTimeRate,
      deliveryOnTimeRate,
      totalPickupsTracked,
      totalDeliveriesTracked,
      // Rankings
      dispatcherRankings,
      brokerRankings
    };
  }, [accountingLoads, dispatchers, brokers]);

  if (!stats) {
    return null;
  }

  const hasDateFilter = true; // Always show expandable sections

  const toggleSection = (section) => {
    setExpandedSection(prev => prev === section ? null : section);
  };

  // Check if any main stats cards are visible
  const hasVisibleMainCards = visibleCards.loads || visibleCards.gross || visibleCards.avgPerMile || 
                              visibleCards.collected || visibleCards.outstanding || visibleCards.onTime;

  // Check if any detail cards are visible
  const hasVisibleDetailCards = visibleCards.performance || visibleCards.dispatchers || visibleCards.brokers;

  return (
    <div className="mb-6 space-y-4">
      {/* Settings Dropdown */}
     {/* Settings Dropdown */}
<div className="flex justify-end items-center gap-3 relative">
  <button
    onClick={onHideStats}
    className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1"
  >
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
    Hide Stats
  </button>
  <button
    onClick={() => setShowSettings(!showSettings)}
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 px-2 py-1 rounded hover:bg-gray-100"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          Customize
        </button>
        
        {showSettings && (
          <div className="absolute right-0 top-8 z-10 bg-white rounded-lg shadow-lg border border-gray-200 p-4 w-64">
            <div className="flex justify-between items-center mb-3 pb-2 border-b">
              <span className="font-medium text-gray-700">Show/Hide Cards</span>
              <button
                onClick={resetVisibility}
                className="text-xs text-blue-600 hover:text-blue-800"
              >
                Reset All
              </button>
            </div>
            
            <div className="space-y-2">
              <p className="text-xs font-medium text-gray-500 uppercase">Main Stats</p>
              {[
                { key: 'loads', label: 'Loads' },
                { key: 'gross', label: 'Gross / Fees / Net' },
                { key: 'avgPerMile', label: 'Avg $/Mile' },
                { key: 'collected', label: 'Collected' },
                { key: 'outstanding', label: 'Outstanding' },
                { key: 'onTime', label: 'On-Time %' },
              ].map(item => (
                <label key={item.key} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={visibleCards[item.key]}
                    onChange={() => toggleCardVisibility(item.key)}
                    className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-700">{item.label}</span>
                </label>
              ))}
              
              <p className="text-xs font-medium text-gray-500 uppercase mt-3 pt-2 border-t">Details</p>
              {[
                { key: 'performance', label: 'Performance Details' },
                { key: 'dispatchers', label: 'Top Dispatchers' },
                { key: 'brokers', label: 'Top Brokers' },
              ].map(item => (
                <label key={item.key} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={visibleCards[item.key]}
                    onChange={() => toggleCardVisibility(item.key)}
                    className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-700">{item.label}</span>
                </label>
              ))}
            </div>
            
            <button
              onClick={() => setShowSettings(false)}
              className="mt-3 w-full text-center text-sm text-gray-500 hover:text-gray-700 py-1"
            >
              Close
            </button>
          </div>
        )}
      </div>

      {/* Main Stats Row */}
      {hasVisibleMainCards && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {/* Total Loads */}
          {visibleCards.loads && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Loads</p>
                  <p className="text-2xl font-bold text-gray-900 mt-1">{stats.loadCount}</p>
                </div>
                <div className="p-2 bg-blue-50 rounded-lg">
                  <svg className="w-6 h-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
              </div>
            </div>
          )}

          {/* Gross Revenue */}
          {visibleCards.gross && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Gross</p>
                  <p className="text-2xl font-bold text-gray-900 mt-1">{formatCurrency(stats.totalAmount)}</p>
                </div>
                <div className="p-2 bg-gray-100 rounded-lg">
                  <svg className="w-6 h-6 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
              </div>
              {stats.totalBrokerFees > 0 && (
                <>
                  <p className="text-sm font-bold text-red-600 mt-2">
                    Fees: {formatCurrency(stats.totalBrokerFees)}
                  </p>
                  <p className="text-lg font-bold text-green-700 mt-1">
                    Net: {formatCurrency(stats.totalNetAmount)}
                  </p>
                </>
              )}
            </div>
          )}

          {/* Avg Per Mile */}
          {visibleCards.avgPerMile && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Avg $/Mile</p>
                  <p className="text-2xl font-bold text-blue-600 mt-1">${stats.avgPerMile.toFixed(2)}</p>
                </div>
                <div className="p-2 bg-blue-50 rounded-lg">
                  <svg className="w-6 h-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                  </svg>
                </div>
              </div>
              <p className="text-xs text-gray-700 mt-2">
                {stats.totalMileage.toLocaleString()} total miles
              </p>
            </div>
          )}

          {/* Paid vs Unpaid */}
          {visibleCards.collected && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Collected</p>
                  <p className="text-2xl font-bold text-emerald-600 mt-1">{formatCurrency(stats.paidAmount)}</p>
                </div>
                <div className="p-2 bg-emerald-50 rounded-lg">
                  <svg className="w-6 h-6 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
              </div>
              <p className="text-xs text-gray-500 mt-2">
                {stats.paidCount} paid • {stats.invoicedCount} invoiced
              </p>
            </div>
          )}

          {/* Outstanding */}
          {visibleCards.outstanding && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Outstanding</p>
                  <p className="text-2xl font-bold text-amber-600 mt-1">{formatCurrency(stats.unpaidAmount)}</p>
                </div>
                <div className="p-2 bg-amber-50 rounded-lg">
                  <svg className="w-6 h-6 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
              </div>
              <p className="text-xs text-gray-500 mt-2">
                {stats.unpaidCount} unpaid loads
              </p>
            </div>
          )}

          {/* On-Time Performance */}
          {visibleCards.onTime && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">On-Time</p>
                  <p className="text-2xl font-bold text-purple-600 mt-1">
                    {stats.deliveryOnTimeRate.toFixed(0)}%
                  </p>
                </div>
                <div className="p-2 bg-purple-50 rounded-lg">
                  <svg className="w-6 h-6 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
                  </svg>
                </div>
              </div>
              <p className="text-xs text-gray-500 mt-2">
                Delivery rate
              </p>
            </div>
          )}
        </div>
      )}

      {/* Expandable Details Section */}
      {hasDateFilter && hasVisibleDetailCards && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {/* Performance Card */}
          {visibleCards.performance && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              <button
                onClick={() => toggleSection('performance')}
                className="w-full px-4 py-3 flex items-center justify-between bg-gray-50 hover:bg-gray-100 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <svg className="w-5 h-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                  <span className="font-medium text-gray-700">Performance Details</span>
                </div>
                <svg 
                  className={`w-5 h-5 text-gray-400 transition-transform ${expandedSection === 'performance' ? 'rotate-180' : ''}`} 
                  fill="none" 
                  viewBox="0 0 24 24" 
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              
              {expandedSection === 'performance' && (
                <div className="p-4 space-y-4">
                  {/* Pickup Performance */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-gray-700">Pickup Performance</span>
                      <span className="text-sm text-gray-500">{stats.totalPickupsTracked} tracked</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex-1 bg-gray-200 rounded-full h-2">
                        <div 
                          className="bg-green-500 h-2 rounded-full transition-all" 
                          style={{ width: `${stats.pickupOnTimeRate}%` }}
                        />
                      </div>
                      <span className="text-sm font-semibold text-gray-700 w-12 text-right">
                        {stats.pickupOnTimeRate.toFixed(0)}%
                      </span>
                    </div>
                    <div className="flex justify-between mt-1 text-xs">
                      <span className="text-green-600">{stats.onTimePickups} on-time</span>
                      <span className="text-red-600">{stats.delayedPickups} delayed</span>
                    </div>
                  </div>

                  {/* Delivery Performance */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-gray-700">Delivery Performance</span>
                      <span className="text-sm text-gray-500">{stats.totalDeliveriesTracked} tracked</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex-1 bg-gray-200 rounded-full h-2">
                        <div 
                          className="bg-green-500 h-2 rounded-full transition-all" 
                          style={{ width: `${stats.deliveryOnTimeRate}%` }}
                        />
                      </div>
                      <span className="text-sm font-semibold text-gray-700 w-12 text-right">
                        {stats.deliveryOnTimeRate.toFixed(0)}%
                      </span>
                    </div>
                    <div className="flex justify-between mt-1 text-xs">
                      <span className="text-green-600">{stats.onTimeDeliveries} on-time</span>
                      <span className="text-red-600">{stats.delayedDeliveries} delayed</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Top Dispatchers Card */}
          {visibleCards.dispatchers && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              <button
                onClick={() => toggleSection('dispatchers')}
                className="w-full px-4 py-3 flex items-center justify-between bg-gray-50 hover:bg-gray-100 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <svg className="w-5 h-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                  <span className="font-medium text-gray-700">Top Dispatchers</span>
                </div>
                <svg 
                  className={`w-5 h-5 text-gray-400 transition-transform ${expandedSection === 'dispatchers' ? 'rotate-180' : ''}`} 
                  fill="none" 
                  viewBox="0 0 24 24" 
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              
              {expandedSection === 'dispatchers' && (
                <div className="p-4">
                  {stats.dispatcherRankings.length === 0 ? (
                    <p className="text-sm text-gray-500 text-center py-2">No dispatcher data</p>
                  ) : (
                    <div className="space-y-3">
                      {stats.dispatcherRankings.map((dispatcher, index) => (
                        <div key={dispatcher.id} className="flex items-center gap-3">
                          <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                            index === 0 ? 'bg-yellow-100 text-yellow-700' :
                            index === 1 ? 'bg-gray-100 text-gray-600' :
                            index === 2 ? 'bg-orange-100 text-orange-700' :
                            'bg-gray-50 text-gray-500'
                          }`}>
                            {index + 1}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">{dispatcher.name}</p>
                            <p className="text-xs text-gray-500">
                              {dispatcher.loadCount} loads • {formatCurrency(dispatcher.totalAmount)}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Top Brokers Card */}
          {visibleCards.brokers && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              <button
                onClick={() => toggleSection('brokers')}
                className="w-full px-4 py-3 flex items-center justify-between bg-gray-50 hover:bg-gray-100 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <svg className="w-5 h-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                  </svg>
                  <span className="font-medium text-gray-700">Top Brokers</span>
                </div>
                <svg 
                  className={`w-5 h-5 text-gray-400 transition-transform ${expandedSection === 'brokers' ? 'rotate-180' : ''}`} 
                  fill="none" 
                  viewBox="0 0 24 24" 
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              
              {expandedSection === 'brokers' && (
                <div className="p-4">
                  {stats.brokerRankings.length === 0 ? (
                    <p className="text-sm text-gray-500 text-center py-2">No broker data</p>
                  ) : (
                    <div className="space-y-3">
                      {stats.brokerRankings.map((broker, index) => (
                        <div key={broker.id || broker.name} className="flex items-center gap-3">
                          <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                            index === 0 ? 'bg-yellow-100 text-yellow-700' :
                            index === 1 ? 'bg-gray-100 text-gray-600' :
                            index === 2 ? 'bg-orange-100 text-orange-700' :
                            'bg-gray-50 text-gray-500'
                          }`}>
                            {index + 1}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">{broker.name}</p>
                            <p className="text-xs text-gray-500">
                              {broker.loadCount} loads • {formatCurrency(broker.totalAmount)}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}