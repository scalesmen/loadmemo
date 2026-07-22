// src/components/loads/components/LoadModal/index.js
import React, { useEffect, useState, useMemo } from 'react';
import VehicleInformationSection from './VehicleInformationSection';
import ReeferFields from './CommodityFields/ReeferFields';
import FlatbedFields from './CommodityFields/FlatbedFields';
import DryVanFields from './CommodityFields/DryVanFields';
import TankerFields from './CommodityFields/TankerFields';
import { LOAD_STATUSES, PAYMENT_TERMS, PAYMENT_METHODS, DRIVER_APPS } from '../../utils/constants';
import { db } from '../../../../firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';

const LoadModal = ({
  isEditing,
  loadForm,
  onInputChange,
  onSubmit,
  onClose,
  brokers = [],
  drivers = [],
  trucks = [],
  dispatchers = [],
  tenantCompanies: tenantCompaniesRaw = [],
  isLoadingCompanies = false,
  loggedInUser,
  isAutomobileHauling = false,
  isDryVan = false,
  isReefer = false,
  isFlatbed = false,
  isTanker = false,
  onVehicleChange,
  onVehicleCountChange,
  setLoadForm,
  isProcessing = false,
  sourceType = 'manual' // Track where this load came from
}) => {
  // Auto-assign truck when driver is selected in the modal
  useEffect(() => {
    if (loadForm.driverId && drivers && drivers.length > 0) {
      const selectedDriver = drivers.find(d => d.id === loadForm.driverId);
      if (selectedDriver?.assignedTruckId && selectedDriver.assignedTruckId !== loadForm.truckId) {
        console.log("🚛 Auto-updating truck in modal based on driver selection:", {
          driver: selectedDriver.name,
          truck: selectedDriver.assignedTruckId
        });
        setLoadForm(prev => ({
          ...prev,
          truckId: selectedDriver.assignedTruckId
        }));
      }
    }
  }, [loadForm.driverId, drivers, loadForm.truckId, setLoadForm]);
// ============================================================
  // 🆕 AUTO-CALCULATE FACTORING based on broker rules
  // Triggered when amount or brokerId changes
  // ============================================================
  useEffect(() => {
    const calculateFactoring = async () => {
      // Skip if editing (don't override existing factoring)
      if (isEditing) return;
      
    
      const amount = parseFloat(loadForm.amount) || 0;
      const brokerId = loadForm.brokerId;
      
      // Need both amount and broker to calculate
      if (amount <= 0 || !brokerId) return;
      
      // Get tenantId from loggedInUser
      const tenantId = loggedInUser?.tenantId || loggedInUser?.assignedCompanyId;
      if (!tenantId) {
        console.log("⚠️ No tenantId available for factoring lookup");
        return;
      }
      
      console.log(`💰 Checking factoring rules for broker: ${brokerId}, amount: $${amount}, tenant: ${tenantId}`);
      
      try {
        // Query for active factoring rule for this broker
        const factoringQuery = query(
          collection(db, "brokerFactoringRules"),
          where("tenantId", "==", tenantId),
          where("brokerId", "==", brokerId),
          where("isActive", "==", true)
        );
        
        const snapshot = await getDocs(factoringQuery);
        
        if (snapshot.empty) {
          console.log(`📊 No active factoring rule found for broker: ${brokerId}`);
          return;
        }
        
       const rule = snapshot.docs[0].data();
        console.log("📋 RAW RULE DATA:", rule);
        console.log("📋 RAW factoringPercentage:", rule.factoringPercentage, "type:", typeof rule.factoringPercentage);
        
        const factoringPercentage = Number(rule.factoringPercentage) || 0;
        
        console.log("📋 PARSED factoringPercentage:", factoringPercentage);
        
        if (factoringPercentage <= 0) return;
        
        // Debug all values
        console.log("🔍 BEFORE CALC:", { 
          amount, 
          typeOfAmount: typeof amount,
          factoringPercentage, 
          typeOfPercentage: typeof factoringPercentage 
        });
        
        const factoringAmount = amount * factoringPercentage / 100;
        const driverPay = amount - factoringAmount;
        
        console.log("💵 FINAL:", { factoringAmount, driverPay });
        
        console.log(`✅ Factoring calculated: ${factoringPercentage}% of $${amount} = $${factoringAmount}, Driver Pay: $${driverPay}`);
        
        // Update form with factoring data
        setLoadForm(prev => ({
          ...prev,
          factoringApplied: true,
          factoringRuleId: snapshot.docs[0].id,
          factoringPercentage: factoringPercentage,
          factoringAmount: factoringAmount,
          factoringBrokerName: rule.brokerName || '',
          driverPay: driverPay,
          driverCollectionAmount: driverPay,
          brokerFeeCollection: factoringAmount
        }));
        
      } catch (error) {
        console.error("❌ Error fetching factoring rule:", error);
      }
    };
    
    calculateFactoring();
  }, [loadForm.amount, loadForm.brokerId, isEditing, loggedInUser, setLoadForm, loadForm.factoringApplied, loadForm.factoringAmount]);
  // Auto-fill Driver Pay = Load Price - Broker Fee (when payment terms requires driver collection)
  useEffect(() => {
    if (isEditing) return;
    
    setLoadForm(prev => {
      const loadPrice = parseFloat(prev.amount) || 0;
      const brokerFee = parseFloat(prev.brokerFeeCollection) || 0;
      const currentDriverPay = parseFloat(prev.driverCollectionAmount) || 0;
      
      const isCollectionOnPickupOrDelivery = 
        prev.paymentTerms === 'On Delivery' || 
        prev.paymentTerms === 'On Pick up';
      
      // Auto-fill driver pay = load price - broker fee if:
      // 1. Payment terms is On Delivery or On Pickup
      // 2. Driver pay is currently 0 (Gemini didn't set it)
      // 3. Load price exists
      let newDriverPay = currentDriverPay;
      if (isCollectionOnPickupOrDelivery && currentDriverPay === 0 && loadPrice > 0) {
        newDriverPay = loadPrice - brokerFee;
        console.log("💰 Auto-filling Driver Pay = Load Price - Broker Fee:", newDriverPay);
      }
      
      return {
        ...prev,
        driverCollectionAmount: newDriverPay,
        brokerFeeCollection: prev.brokerFeeCollection || 0
      };
    });
  }, [isEditing, loadForm.paymentTerms, loadForm.amount, loadForm.brokerFeeCollection, setLoadForm]);

  // Set sourceType in form when modal opens (if not editing)
  useEffect(() => {
    if (!isEditing && sourceType && !loadForm.sourceType) {
      setLoadForm(prev => ({
        ...prev,
        sourceType: sourceType
      }));
    }
  }, [sourceType, isEditing, loadForm.sourceType, setLoadForm]);

  // Super Admin check (supports both legacy string and array roles)
  const userRolesList = Array.isArray(loggedInUser?.role) ? loggedInUser.role : [loggedInUser?.role].filter(Boolean);
  const isSuperAdmin = userRolesList.includes('Super Admin');

  // Company list is prefetched once at the page level (useDropdownData) via a
  // real-time listener — no per-open fetch here, so opening the modal is instant
  // even on tenants with many companies.
  const tenantCompanies = useMemo(() => {
    return [...tenantCompaniesRaw]
      .map(c => ({
        id: c.id,
        name: c.name || '',
        parentCompanyId: c.parentCompanyId || null,
        parentCompanyName: c.parentCompanyName || null
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [tenantCompaniesRaw]);

  const canEditPaymentTerms = useMemo(() => {
    const firstCompany = tenantCompaniesRaw[0];
    const allowedRoles = firstCompany?.permissions?.canEditPaymentTerms || ['Super Admin'];
    return userRolesList.some(role => allowedRoles.includes(role));
  }, [tenantCompaniesRaw, userRolesList]);


  // Check if Driver Pay is required based on payment terms
  const isDriverPayRequired = 
    loadForm.paymentTerms === 'On Delivery' || 
    loadForm.paymentTerms === 'On Pick up';

  // Enhanced form validation
  const handleFormSubmit = (e) => {
    e.preventDefault();

    // Validate Payment Method
    if (!loadForm.paymentMethod || loadForm.paymentMethod === '') {
      alert('Please select a Payment Method');
      return;
    }

    // Validate Payment Terms
    if (!loadForm.paymentTerms || loadForm.paymentTerms === '') {
      alert('Please select Payment Terms');
      return;
    }

    // Validate Driver Pay when required
    if (isDriverPayRequired) {
      const driverPay = parseFloat(loadForm.driverCollectionAmount);
      if (!loadForm.driverCollectionAmount || loadForm.driverCollectionAmount === '' || isNaN(driverPay) || driverPay <= 0) {
        alert(`Driver Pay is required and must be greater than $0 when Payment Terms is "${loadForm.paymentTerms}"`);
        return;
      }
    }

    // If all validations pass, call the original onSubmit
    onSubmit(e);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60 p-4 overflow-y-auto">
      <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-5xl my-8 max-h-[90vh] overflow-y-auto">
        <h3 className="text-xl font-semibold mb-6 text-gray-800 flex items-center gap-3">
          {isEditing ? "Edit Load" : "Add New Load"}
          {/* Show source indicator in modal title */}
          {!isEditing && sourceType === 'super_dispatch_pdf' && (
            <span className="inline-block bg-purple-100 text-purple-800 px-3 py-1 rounded text-sm font-bold border border-purple-300">
              📄 Super Dispatch Import
            </span>
          )}
          {!isEditing && sourceType === 'chrome_extension' && (
            <span className="inline-block bg-blue-100 text-blue-800 px-3 py-1 rounded text-sm font-bold border border-blue-300">
              🔌 Chrome Extension
            </span>
          )}
        </h3>
        
        <form onSubmit={handleFormSubmit} className="space-y-6">
          {/* ============================================
              SECTION 1: BASIC INFORMATION
          ============================================ */}
          <div className="border-b border-gray-200 pb-6">
            <h4 className="text-lg font-semibold text-gray-700 mb-4">Basic Information</h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
  {/* Load ID */}
  <div>
                <label className="block text-sm font-medium mb-1">Load ID <span className="text-red-500">*</span></label>
                <input 
                  type="text" 
                  name="load_id" 
                  value={loadForm.load_id} 
                  onChange={onInputChange} 
                  required 
                  className="block w-full px-3 py-2 text-sm border border-gray-300 rounded-md shadow-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500" 
                />
              </div>
              {/* Carrier / Company Name — Super Admin picks from Company Management; others read-only */}
<div>
  <label className="block text-sm font-medium mb-1">Carrier</label>
  {isSuperAdmin ? (
    <>
      <select
        name="companyName"
        value={
          loadForm.companyId ||
          tenantCompanies.find(
            c => c.name.toLowerCase().trim() === (loadForm.companyName || '').toLowerCase().trim()
          )?.id ||
          ''
        }
        onChange={(e) => {
          const selected = tenantCompanies.find(c => c.id === e.target.value);
          setLoadForm(prev => ({
            ...prev,
            companyName: selected ? selected.name : '',
            companyId: selected ? selected.id : null
          }));
        }}
        disabled={isLoadingCompanies}
        className="block w-full px-3 py-2 text-sm border border-gray-300 rounded-md shadow-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-400"
      >
        <option value="">
          {isLoadingCompanies ? 'Loading companies…' : '— Driver\'s default company —'}
        </option>
        {tenantCompanies.map(c => (
          <option key={c.id} value={c.id}>
            {c.parentCompanyId
              ? `↳ ${c.name} (subdivision${c.parentCompanyName ? ` of ${c.parentCompanyName}` : ''})`
              : c.name}
          </option>
        ))}
      </select>
      {isLoadingCompanies && (
        <p className="text-xs text-gray-400 mt-1">Loading company list…</p>
      )}
    </>
  ) : (
    <div className="block w-full px-3 py-2 text-sm border border-gray-200 rounded-md bg-gray-50 text-gray-600">
      {loadForm.companyName || "Driver's default company"}
    </div>
  )}
</div>

              {/* Status - Only Booked/Dispatched allowed in modal */}
{/* Other status changes (In Transit, Delivered) must be done via table dropdown */}
<div>
  <label className="block text-sm font-medium mb-1">Status <span className="text-red-500">*</span></label>
  <select 
    name="status" 
    value={loadForm.status} 
    onChange={onInputChange} 
    required 
    className="block w-full px-3 py-2 text-sm border border-gray-300 rounded-md shadow-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
    disabled={loadForm.status === 'In Transit' || loadForm.status === 'Delivered' || loadForm.status === 'Cancelled'}
  >
    {loadForm.status === 'In Transit' || loadForm.status === 'Delivered' || loadForm.status === 'Cancelled' ? (
      // If already In Transit/Delivered/Cancelled, show current status (disabled)
      <option value={loadForm.status}>{loadForm.status}</option>
    ) : (
      // For new loads or Booked/Dispatched, only show these two options
      <>
        <option value="Booked">Booked</option>
        <option value="Dispatched">Dispatched</option>
      </>
    )}
  </select>
  {(loadForm.status === 'In Transit' || loadForm.status === 'Delivered' || loadForm.status === 'Cancelled') && (
    <p className="text-xs text-gray-500 mt-1">
      Status changes must be done from the loads table
    </p>
  )}
</div>
            </div>
          </div>

          {/* ============================================
    SECTION 2: BROKER & ASSIGNMENTS
============================================ */}
<div className="border-b border-gray-200 pb-6">
  <h4 className="text-lg font-semibold text-gray-700 mb-4">Broker & Assignments</h4>
  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
    {/* Broker */}
    <div>
      <label className="block text-sm font-medium mb-1">Broker</label>
      <select 
        name="brokerId" 
        value={loadForm.brokerId || ''} 
        onChange={onInputChange} 
        className="block w-full px-3 py-2 text-sm border border-gray-300 rounded-md shadow-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
      >
        <option value="">-- Select Broker --</option>
        {brokers.map(broker => (
          <option key={broker.id} value={broker.id}>
            {broker.companyName || broker.name}
          </option>
        ))}
      </select>
    </div>

    {/* Required App */}
    <div>
      <label className="block text-sm font-medium mb-1">Required App</label>
      <select 
        name="requiredApp" 
        value={loadForm.requiredApp || ''} 
        onChange={onInputChange} 
        className="block w-full px-3 py-2 text-sm border border-gray-300 rounded-md shadow-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
      >
        {DRIVER_APPS.map(app => (
          <option key={app.value} value={app.value}>
            {app.label}
          </option>
        ))}
      </select>
      {loadForm.requiredApp && (
        <p className="text-xs text-blue-600 mt-1">
          📱 Driver must use this app for inspection
        </p>
      )}
    </div>

    {/* Driver Assignment */}
    <div>
      <label className="block text-sm font-medium mb-1">Driver Assigned</label>
      <select 
        name="driverId" 
        value={loadForm.driverId} 
        onChange={onInputChange} 
        className="block w-full px-3 py-2 text-sm border border-gray-300 rounded-md shadow-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
      >
        <option value="">Unassigned</option>
        {drivers.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
      </select>
    </div>
  </div>
</div>

          {/* ============================================
              SECTION 3: PAYMENT
          ============================================ */}
          <div className="border-b border-gray-200 pb-6">
            <h4 className="text-lg font-semibold text-gray-700 mb-4">Payment</h4>
            
            {/* Load Price, Driver Pay, Broker Fee, Storage Fee - Single Row */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
              {/* Load Price */}
              <div>
                <label className="block text-sm font-medium mb-1">Load Price ($) <span className="text-red-500">*</span></label>
                <input 
                  type="number" 
                  step="0.01" 
                  name="amount" 
                  value={loadForm.amount} 
                  onChange={onInputChange} 
                  required 
                  min="0" 
                  disabled={isEditing && !canEditPaymentTerms}
                  className={`block w-full px-3 py-2 text-sm border border-gray-300 rounded-md shadow-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 ${isEditing && !canEditPaymentTerms ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                />
              </div>

              {/* Driver Pay */}
              <div>
                <label className="block text-sm font-medium mb-1">
                  Driver Pay ($) {isDriverPayRequired && <span className="text-red-500">*</span>}
                </label>
                <input 
                  type="number" 
                  step="0.01" 
                  name="driverCollectionAmount" 
                  value={loadForm.driverCollectionAmount ?? ''} 
                  onChange={onInputChange}
                  min="0"
                  disabled={isEditing && !canEditPaymentTerms}
                  className={`block w-full px-3 py-2 text-sm border rounded-md shadow-sm focus:outline-none focus:ring-1 ${
                    isEditing && !canEditPaymentTerms
                      ? 'border-gray-300 bg-gray-100 cursor-not-allowed'
                      : isDriverPayRequired 
                        ? 'border-yellow-300 focus:border-yellow-500 focus:ring-yellow-500 bg-yellow-50' 
                        : 'border-gray-300 focus:border-blue-500 focus:ring-blue-500'
                  }`}
                  placeholder={isDriverPayRequired ? "Auto-filled: Price - Broker Fee" : "Optional"}
                />
                {isDriverPayRequired && (!loadForm.driverCollectionAmount || parseFloat(loadForm.driverCollectionAmount) <= 0) && (
                  <p className="text-xs text-red-600 mt-1 font-semibold">⚠️ Required when payment is collected {loadForm.paymentTerms === 'On Pick up' ? 'on pickup' : 'on delivery'}</p>
                )}
              </div>

              {/* Broker Fee / Factoring Fee */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-sm font-medium">
                    {loadForm.factoringApplied === true ? 'Factoring Fee ($)' : 'Broker Fee ($)'}
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={loadForm.factoringApplied === true}
                      onChange={(e) => {
                        const isFactoring = e.target.checked;
                        setLoadForm(prev => ({
                          ...prev,
                          factoringApplied: isFactoring,
                          factoringPercentage: isFactoring && prev.amount && prev.brokerFeeCollection
                            ? Math.round((parseFloat(prev.brokerFeeCollection) / parseFloat(prev.amount)) * 10000) / 100
                            : isFactoring ? prev.factoringPercentage : null,
                          factoringAmount: isFactoring ? (parseFloat(prev.brokerFeeCollection) || 0) : null
                        }));
                      }}
                      disabled={isEditing && !canEditPaymentTerms}
                      className="w-3.5 h-3.5 text-purple-600 rounded focus:ring-purple-500"
                    />
                    <span className="text-xs text-purple-700 font-medium">Factoring</span>
                  </label>
                </div>
                <div className="flex gap-2">
                  <input 
                    type="number" 
                    step="0.01" 
                    name="brokerFeeCollection" 
                    value={loadForm.brokerFeeCollection ?? ''} 
                    onChange={onInputChange}
                    min="0"
                    disabled={isEditing && !canEditPaymentTerms}
                    className={`block w-full px-3 py-2 text-sm border rounded-md shadow-sm focus:outline-none focus:ring-1 ${
                      loadForm.factoringApplied === true 
                        ? 'border-purple-300 focus:border-purple-500 focus:ring-purple-500 bg-purple-50' 
                        : 'border-gray-300 focus:border-blue-500 focus:ring-blue-500'
                    } ${isEditing && !canEditPaymentTerms ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                    placeholder="0.00"
                  />
                  {loadForm.factoringApplied === true && (
                    <input
                      type="number"
                      step="0.01"
                      name="factoringPercentage"
                      value={loadForm.factoringPercentage ?? ''}
                      onChange={onInputChange}
                      min="0"
                      max="100"
                      disabled={isEditing && !canEditPaymentTerms}
                      className={`w-20 px-2 py-2 text-sm border border-purple-300 rounded-md shadow-sm focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 bg-purple-50 ${isEditing && !canEditPaymentTerms ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                      placeholder="%"
                    />
                  )}
                </div>
              </div>

              {/* Storage Fee */}
              <div>
                <label className="block text-sm font-medium mb-1">Storage Fee ($)</label>
                <input 
                  type="number" 
                  step="0.01" 
                  name="storageFee" 
                  value={loadForm.storageFee ?? ''} 
                  onChange={onInputChange}
                  min="0"
                  className="block w-full px-3 py-2 text-sm border border-gray-300 rounded-md shadow-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  placeholder="0.00"
                />
              </div>
            </div>

            {/* Payment Method, Payment Terms, and Mileage */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Payment Method */}
              <div>
                <label className="block text-sm font-medium mb-1">
                  Payment Method <span className="text-red-500">*</span>
                </label>
                <select 
                  name="paymentMethod" 
                  value={loadForm.paymentMethod || ''} 
                  onChange={onInputChange}
                  required
                  disabled={isEditing && !canEditPaymentTerms}
                  className={`block w-full px-3 py-2 text-sm border-2 border-gray-300 rounded-md shadow-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 ${isEditing && !canEditPaymentTerms ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                >
                  <option value="">-- Payment Method --</option>
                  {PAYMENT_METHODS.map(method => (
                    <option key={method.value} value={method.value}>
                      {method.label}
                    </option>
                  ))}
                </select>
                {!loadForm.paymentMethod && (
                  <p className="text-xs text-red-600 mt-1">⚠️ Payment Method is required</p>
                )}
              </div>

              {/* Payment Terms */}
              <div>
                <label className="block text-sm font-medium mb-1">
                  Payment Terms <span className="text-red-500">*</span>
                </label>
                <select 
                  name="paymentTerms" 
                  value={loadForm.paymentTerms || ''} 
                  onChange={onInputChange}
                  required
                  disabled={isEditing && !canEditPaymentTerms}
                  className={`block w-full px-3 py-2 text-sm border-2 border-gray-300 rounded-md shadow-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 ${isEditing && !canEditPaymentTerms ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                >
                  <option value="">-- Payment Terms --</option>
                  {PAYMENT_TERMS.map(term => (
                    <option key={term.value} value={term.value}>
                      {term.label}
                    </option>
                  ))}
                </select>
                {!loadForm.paymentTerms && (
                  <p className="text-xs text-red-600 mt-1">⚠️ Payment Terms is required</p>
                )}
              </div>

              {/* Mileage */}
              <div>
                <label className="block text-sm font-medium mb-1">Mileage</label>
                <input 
                  type="number" 
                  name="mileage" 
                  value={loadForm.mileage} 
                  onChange={onInputChange} 
                  min="0" 
                  className="block w-full px-3 py-2 text-sm border border-gray-300 rounded-md shadow-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500" 
                />
              </div>
            </div>

            {/* Payment Instructions - Full Width */}
            <div className="mt-4">
              <label className="block text-sm font-medium mb-1">Payment Instructions</label>
              <textarea 
                name="collectionInstructions" 
                value={loadForm.collectionInstructions || ''} 
                onChange={onInputChange} 
                rows="2" 
                className="block w-full px-3 py-2 text-sm border border-gray-300 rounded-md shadow-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                placeholder="Special payment collection or handling instructions..."
              ></textarea>
            </div>

            {/* Driver Pay Alert Box */}
            {isDriverPayRequired && (
              <div className="mt-4 p-3 bg-yellow-50 border border-yellow-300 rounded-md">
                <p className="text-sm text-yellow-800 font-medium flex items-center gap-2">
                  <svg className="w-5 h-5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                  Driver must collect payment {loadForm.paymentTerms === 'On Pick up' ? 'at pickup' : 'at delivery'}
                </p>
              </div>
            )}
            {/* Factoring Applied Info Box */}
            {loadForm.factoringApplied && (
              <div className="mt-4 p-4 bg-purple-50 border border-purple-300 rounded-md">
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0">
                    <svg className="w-6 h-6 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <h4 className="text-sm font-semibold text-purple-800 mb-1">
                      📊 Factoring Auto-Applied
                    </h4>
                    <p className="text-sm text-purple-700">
                      <span className="font-medium">{loadForm.factoringBrokerName || 'Broker'}</span> has a 
                      <span className="font-bold mx-1">{loadForm.factoringPercentage}%</span> factoring fee configured.
                    </p>
                    <div className="mt-2 grid grid-cols-3 gap-2 text-sm">
                      <div className="bg-white rounded p-2 text-center">
                        <p className="text-xs text-gray-500">Load Price</p>
                        <p className="font-semibold text-gray-800">${parseFloat(loadForm.amount || 0).toFixed(2)}</p>
                      </div>
                      <div className="bg-white rounded p-2 text-center">
                        <p className="text-xs text-gray-500">Factoring Fee</p>
                        <p className="font-semibold text-red-600">-${parseFloat(loadForm.factoringAmount || 0).toFixed(2)}</p>
                      </div>
                      <div className="bg-white rounded p-2 text-center">
                        <p className="text-xs text-gray-500">Driver Pay</p>
                        <p className="font-semibold text-green-600">${parseFloat(loadForm.driverCollectionAmount || 0).toFixed(2)}</p>
                      </div>
                      {parseFloat(loadForm.storageFee) > 0 && (
                        <div className="bg-white rounded p-2 text-center">
                          <p className="text-xs text-gray-500">Storage Fee</p>
                          <p className="font-semibold text-orange-600">-${parseFloat(loadForm.storageFee).toFixed(2)}</p>
                        </div>
                      )}
                    </div>
                    <p className="text-xs text-purple-600 mt-2">
                      💡 You can adjust the Driver Pay above if needed
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ============================================
              SECTION 4: PICKUP INFORMATION
          ============================================ */}
          <div className="border-b border-gray-200 pb-6">
            <h4 className="text-lg font-semibold text-gray-700 mb-4">Pickup Information</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Pickup Date/Time */}
              <div>
                <label className="block text-sm font-medium mb-1">
                  Pickup {isAutomobileHauling ? 'Date' : 'Date/Time'} <span className="text-red-500">*</span>
                  {isAutomobileHauling && <span className="ml-2 text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded">🚗 Date Only</span>}
                </label>
                <input 
                  type={isAutomobileHauling ? "date" : "datetime-local"} 
                  name="pickupDateTime" 
                  value={loadForm.pickupDateTime} 
                  onChange={onInputChange} 
                  required 
                  className="block w-full px-3 py-2 text-sm border border-gray-300 rounded-md shadow-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500" 
                />
                {isAutomobileHauling && (
                  <p className="text-xs text-gray-500 mt-1">📅 Specific time not required for vehicle transport</p>
                )}
              </div>

              {/* Pickup Facility */}
              <div>
                <label className="block text-sm font-medium mb-1">Pickup Facility/Name</label>
                <input 
                  type="text" 
                  name="pickupLocationName" 
                  value={loadForm.pickupLocationName} 
                  onChange={onInputChange} 
                  className="block w-full px-3 py-2 text-sm border border-gray-300 rounded-md shadow-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500" 
                  placeholder="e.g., Amazon Warehouse" 
                />
              </div>

              {/* Pickup Address */}
              <div>
                <label className="block text-sm font-medium mb-1">Pickup Address <span className="text-red-500">*</span></label>
                <input 
                  type="text" 
                  name="pickupLocation" 
                  value={loadForm.pickupLocation} 
                  onChange={onInputChange} 
                  required 
                  className="block w-full px-3 py-2 text-sm border border-gray-300 rounded-md shadow-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500" 
                />
              </div>

              {/* Pickup Contact Phone */}
              <div>
                <label className="block text-sm font-medium mb-1">Pickup Contact Phone</label>
                <input 
                  type="tel" 
                  name="pickupContactPhone" 
                  value={loadForm.pickupContactPhone || ''} 
                  onChange={onInputChange} 
                  className="block w-full px-3 py-2 text-sm border border-gray-300 rounded-md shadow-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500" 
                  placeholder="(555) 123-4567"
                />
              </div>

             {/* Pickup Instructions */}
              <div className="md:col-span-2">
                <label className="block text-sm font-medium mb-1">Pickup Instructions</label>
                <textarea 
                  name="pickupInstructions" 
                  value={loadForm.pickupInstructions || ''}
                  onChange={onInputChange} 
                  rows="2" 
                  className="block w-full px-3 py-2 text-sm border border-gray-300 rounded-md shadow-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                ></textarea>
              </div>
            </div>
          </div>

          {/* ============================================
              SECTION 5: DELIVERY INFORMATION
          ============================================ */}
          <div className="border-b border-gray-200 pb-6">
            <h4 className="text-lg font-semibold text-gray-700 mb-4">Delivery Information</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Delivery Date/Time */}
              <div>
                <label className="block text-sm font-medium mb-1">
                  Delivery {isAutomobileHauling ? 'Date' : 'Date/Time'} <span className="text-red-500">*</span>
                  {isAutomobileHauling && <span className="ml-2 text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded">🚗 Date Only</span>}
                </label>
                <input 
                  type={isAutomobileHauling ? "date" : "datetime-local"} 
                  name="deliveryDateTime" 
                  value={loadForm.deliveryDateTime} 
                  onChange={onInputChange} 
                  required 
                  className="block w-full px-3 py-2 text-sm border border-gray-300 rounded-md shadow-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500" 
                />
                {isAutomobileHauling && (
                  <p className="text-xs text-gray-500 mt-1">📅 Specific time not required for vehicle transport</p>
                )}
              </div>

              {/* Delivery Facility */}
              <div>
                <label className="block text-sm font-medium mb-1">Delivery Facility/Name</label>
                <input 
                  type="text" 
                  name="deliveryLocationName" 
                  value={loadForm.deliveryLocationName} 
                  onChange={onInputChange} 
                  className="block w-full px-3 py-2 text-sm border border-gray-300 rounded-md shadow-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500" 
                  placeholder="e.g., JB Hunt Facility" 
                />
              </div>

              {/* Delivery Address */}
              <div>
                <label className="block text-sm font-medium mb-1">Delivery Address <span className="text-red-500">*</span></label>
                <input 
                  type="text" 
                  name="deliveryLocation" 
                  value={loadForm.deliveryLocation} 
                  onChange={onInputChange} 
                  required 
                  className="block w-full px-3 py-2 text-sm border border-gray-300 rounded-md shadow-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500" 
                />
              </div>

              {/* Delivery Contact Phone */}
              <div>
                <label className="block text-sm font-medium mb-1">Delivery Contact Phone</label>
                <input 
                  type="tel" 
                  name="deliveryContactPhone" 
                  value={loadForm.deliveryContactPhone || ''} 
                  onChange={onInputChange} 
                  className="block w-full px-3 py-2 text-sm border border-gray-300 rounded-md shadow-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500" 
                  placeholder="(555) 123-4567"
                />
              </div>

              {/* Delivery Instructions */}
              <div className="md:col-span-2">
                <label className="block text-sm font-medium mb-1">Delivery Instructions</label>
                <textarea 
                  name="deliveryInstructions" 
                  value={loadForm.deliveryInstructions} 
                  onChange={onInputChange} 
                  rows="2" 
                  className="block w-full px-3 py-2 text-sm border border-gray-300 rounded-md shadow-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                ></textarea>
              </div>
            </div>
          </div>

          {/* ============================================
              SECTION 6: VEHICLE INFORMATION (Auto Hauling)
          ============================================ */}
          {isAutomobileHauling && (
            <div className="border-b border-gray-200 pb-6">
              <VehicleInformationSection
                loadForm={loadForm}
                onVehicleChange={onVehicleChange}
                onVehicleCountChange={onVehicleCountChange}
              />
            </div>
          )}

          {/* ============================================
              SECTION 7: COMMODITY-SPECIFIC FIELDS
          ============================================ */}
          {(isReefer || isFlatbed || isDryVan || isTanker) && (
            <div className="border-b border-gray-200 pb-6">
              <h4 className="text-lg font-semibold text-gray-700 mb-4">Commodity Details</h4>
              {isReefer && <ReeferFields loadForm={loadForm} onInputChange={onInputChange} />}
              {isFlatbed && <FlatbedFields loadForm={loadForm} onInputChange={onInputChange} />}
              {isDryVan && <DryVanFields loadForm={loadForm} onInputChange={onInputChange} />}
              {isTanker && <TankerFields loadForm={loadForm} onInputChange={onInputChange} />}
            </div>
          )}

          {/* ============================================
              SECTION 8: INTERNAL NOTES
          ============================================ */}
          <div className="border-b border-gray-200 pb-6">
            <h4 className="text-lg font-semibold text-gray-700 mb-4">Internal Notes</h4>
            <textarea 
              name="loadNotes" 
              value={loadForm.loadNotes || ''} 
              onChange={onInputChange} 
              rows="3" 
              className="block w-full px-3 py-2 text-sm border border-gray-300 rounded-md shadow-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              placeholder="Add any internal notes or special handling instructions..."
            ></textarea>
          </div>

          {/* Form Actions */}
          <div className="flex justify-end space-x-3 pt-2">
            <button 
              type="button" 
              onClick={onClose} 
              className="bg-gray-200 hover:bg-gray-300 text-gray-700 px-6 py-2.5 rounded-md text-sm font-medium transition-colors"
              disabled={isProcessing}
            >
              Cancel
            </button>
            <button 
              type="submit" 
              className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-md text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={isProcessing}
            >
              {isProcessing ? (
                <span className="flex items-center">
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  {isEditing ? "Saving..." : "Adding..."}
                </span>
              ) : (
                isEditing ? "Save Changes" : "Add Load"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default LoadModal;