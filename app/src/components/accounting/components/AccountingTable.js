// src/components/accounting/components/AccountingTable.js

import React, { useState } from 'react';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../../firebase';
import LoadDetailsRow from './LoadDetailsRow';
import { formatCurrency, calculatePerMileRate, isPaymentOverdue } from '../utils/loadHelpers';

// Loadboard source options for dropdown
const LOADBOARD_OPTIONS = [
  { value: '', label: '—' },
  { value: 'super_dispatch_pdf', label: 'Super Dispatch', logo: '/images/loadboards/super_dispatch.png' },
  { value: 'central_dispatch_pdf', label: 'Central Dispatch', logo: '/images/loadboards/central_dispatch.png' },
  { value: 'carsarrive_pdf', label: 'CarsArrive', logo: '/images/loadboards/carsarrive.png' },
  { value: 'ship_cars_pdf', label: 'Ship.Cars', logo: '/images/loadboards/ship_cars.png' },
  { value: 'acv_transport_pdf', label: 'ACV Transport', logo: '/images/loadboards/acv.png' },
  { value: 'runbuggy_pdf', label: 'Runbuggy', logo: '/images/loadboards/runbuggy.png' },
  { value: 'direct_freight_pdf', label: 'Direct Freight', logo: '/images/loadboards/direct_freight.png' },
  { value: 'montway_pdf', label: 'Montway', logo: '/images/loadboards/montway.png' },
  { value: 'carpool_pdf', label: 'Carpool', logo: '/images/loadboards/carpool.png' },
  { value: 'copart_pdf', label: 'Copart', logo: '/images/loadboards/copart.png' },
  { value: 'carvana_pdf', label: 'Carvana', logo: '/images/loadboards/carvana.png' },
  { value: 'haulex_pdf', label: 'Haulex', logo: '/images/loadboards/haulex.png' },
  { value: 'rpm_pdf', label: 'RPM', logo: '/images/loadboards/rpm.png' },
  { value: 'autosled_pdf', label: 'Autosled', logo: '/images/loadboards/autosled.png' },
  { value: 'acertus_pdf', label: 'Acertus', logo: '/images/loadboards/acertus.png' },
  { value: 'chrome_extension', label: 'Chrome Extension', logo: null },
  { value: 'manual', label: 'Manual Entry', logo: null },
  { value: 'pdf_upload', label: 'PDF Upload', logo: null }
];

// Required App options for dropdown
const REQUIRED_APP_OPTIONS = [
  { value: '', label: 'None' },
  { value: 'super_dispatch', label: 'Super Dispatch' },
  { value: 'central_dispatch', label: 'Central Dispatch' },
  { value: 'runbuggy', label: 'Runbuggy' },
  { value: 'carpool', label: 'Carpool' },
  { value: 'ship_cars', label: 'Ship.cars' },
  { value: 'acertus', label: 'Acertus' },
  { value: 'carvana', label: 'Carvana' },
  { value: 'haulex', label: 'Haulex' },
  { value: 'carsarrive', label: 'CarsArrive' },
  { value: 'rpm', label: 'RPM' },
  { value: 'autosled', label: 'Autosled' },
  { value: 'copart', label: 'Copart' },
  { value: 'acv', label: 'ACV' },
  { value: 'other', label: 'Other' }
];

// Get loadboard info by sourceType
const getLoadboardInfo = (sourceType) => {
  return LOADBOARD_OPTIONS.find(o => o.value === sourceType) || { value: '', label: 'Unknown', logo: null };
};

export default function AccountingTable({
  accountingLoads,
  loggedInUser,
  drivers,
  trucks,
  brokers,
  dispatchers,
  companies = [],
  applicationTimeZone,
  canAmendAccounting,
  canHardDelete,
  onOpenEditModal,
  onDeleteLoad,
  onPayTermsChange,
  onPaymentMethodChange,
  onGenerateBOL,
  onGenerateInvoice,
  onPaymentStatusChange,
  onSaveAdminNote,
  onEmailInvoice,
  updateLoadInList,
  selectedLoads = new Set(),
  onSelectLoad = () => {},
  isAllSelected = false,
  onSelectAll = () => {}
}) {
  const [showTruckColumn, setShowTruckColumn] = useState(() => {
    const saved = localStorage.getItem('accounting_showTruckColumn');
    return saved !== null ? JSON.parse(saved) : true;
  });

  const toggleTruckColumn = () => {
    setShowTruckColumn(prev => {
      const newValue = !prev;
      localStorage.setItem('accounting_showTruckColumn', JSON.stringify(newValue));
      return newValue;
    });
  };

  const [showDispatcherColumn, setShowDispatcherColumn] = useState(() => {
    const saved = localStorage.getItem('accounting_showDispatcherColumn');
    return saved !== null ? JSON.parse(saved) : true;
  });

  const toggleDispatcherColumn = () => {
    setShowDispatcherColumn(prev => {
      const newValue = !prev;
      localStorage.setItem('accounting_showDispatcherColumn', JSON.stringify(newValue));
      return newValue;
    });
  };

  const [showLoadboardColumn, setShowLoadboardColumn] = useState(() => {
    const saved = localStorage.getItem('accounting_showLoadboardColumn');
    return saved !== null ? JSON.parse(saved) : true;
  });

  const toggleLoadboardColumn = () => {
    setShowLoadboardColumn(prev => {
      const newValue = !prev;
      localStorage.setItem('accounting_showLoadboardColumn', JSON.stringify(newValue));
      return newValue;
    });
  };

  const [showAppColumn, setShowAppColumn] = useState(() => {
    const saved = localStorage.getItem('accounting_showAppColumn');
    return saved !== null ? JSON.parse(saved) : true;
  });

  const toggleAppColumn = () => {
    setShowAppColumn(prev => {
      const newValue = !prev;
      localStorage.setItem('accounting_showAppColumn', JSON.stringify(newValue));
      return newValue;
    });
  };
const [showPerMile, setShowPerMile] = useState(() => {
    const saved = localStorage.getItem('accounting_showPerMile');
    return saved !== null ? JSON.parse(saved) : true;
  });

  const togglePerMile = () => {
    setShowPerMile(prev => {
      const newValue = !prev;
      localStorage.setItem('accounting_showPerMile', JSON.stringify(newValue));
      return newValue;
    });
  };

  const [showFees, setShowFees] = useState(() => {
    const saved = localStorage.getItem('accounting_showFees');
    return saved !== null ? JSON.parse(saved) : true;
  });

  const toggleFees = () => {
    setShowFees(prev => {
      const newValue = !prev;
      localStorage.setItem('accounting_showFees', JSON.stringify(newValue));
      return newValue;
    });
  };
  const [expandedLoadId, setExpandedLoadId] = useState(null);

  const toggleLoadDetails = (loadId) => {
    setExpandedLoadId(prevId => (prevId === loadId ? null : loadId));
  };

  // Inline edit handlers for Loadboard and App
  const handleLoadboardChange = async (loadDocId, newValue) => {
    try {
      const loadRef = doc(db, 'loads', loadDocId);
      await updateDoc(loadRef, {
        sourceType: newValue,
        updatedAt: serverTimestamp()
      });
      updateLoadInList(loadDocId, { sourceType: newValue });
    } catch (error) {
      console.error('Error updating loadboard:', error);
      alert('Failed to update loadboard: ' + error.message);
    }
  };

  const handleRequiredAppChange = async (loadDocId, newValue) => {
    try {
      const loadRef = doc(db, 'loads', loadDocId);
      await updateDoc(loadRef, {
        requiredApp: newValue,
        updatedAt: serverTimestamp()
      });
      updateLoadInList(loadDocId, { requiredApp: newValue });
    } catch (error) {
      console.error('Error updating required app:', error);
      alert('Failed to update required app: ' + error.message);
    }
  };

  const getDriverName = (driverId) => {
    return drivers.find(d => d.id === driverId)?.name || 'N/A';
  };

  const getTruckNumber = (truckId) => {
    return trucks.find(t => t.id === truckId)?.unitNumber || 'N/A';
  };

  const getBrokerName = (load) => {
    return brokers.find(b => b.id === load.brokerId)?.name || load.brokerName || 'N/A';
  };

  const getDispatcherName = (dispatcherId) => {
    const dispatcher = dispatchers.find(d => d.id === dispatcherId);
    return dispatcher ? (dispatcher.name || dispatcher.email) : 'N/A';
  };

  const getCompanyName = (load) => {
    if (!companies || companies.length === 0) {
      return 'N/A';
    }
    
    if (load.companyName && typeof load.companyName === 'string') {
      const company = companies.find(c => c.name === load.companyName);
      return company?.name || load.companyName;
    }
    
    const driver = drivers.find(d => d.id === load.driverId);
    
    if (driver?.assignedCompanyName) {
      const company = companies.find(c => c.name === driver.assignedCompanyName);
      return company?.name || driver.assignedCompanyName;
    }
    
    const companyId = load.companyId || load.assignedCompanyId;
    if (companyId) {
      const company = companies.find(c => c.id === companyId);
      if (company) {
        return company.name;
      }
    }
    
    if (load.tenantId) {
      const companyByTenant = companies.find(c => c.tenantId === load.tenantId);
      if (companyByTenant) {
        return companyByTenant.name;
      }
    }
    
    if (companies.length === 1) {
      return companies[0].name;
    }
    
    return 'N/A';
  };

  const getPickupDateWithStatus = (load) => {
    const actualDate = load.actualPU || load.actualPickupTimestamp;
    const scheduledDate = load.pickupDateTime;
    
    if (!actualDate) return { date: "N/A", status: "none" };
    
    const dateObj = new Date(actualDate.seconds ? actualDate.seconds * 1000 : actualDate);
    const formattedDate = dateObj.toLocaleDateString('en-US', { 
      timeZone: applicationTimeZone || 'America/New_York',
      month: 'short', 
      day: 'numeric', 
      year: 'numeric' 
    });
    
    if (scheduledDate) {
      const scheduled = new Date(scheduledDate.seconds ? scheduledDate.seconds * 1000 : scheduledDate);
      const isOnTime = dateObj <= scheduled;
      return { date: formattedDate, status: isOnTime ? "green" : "red" };
    }
    
    return { date: formattedDate, status: "none" };
  };

  const getDeliveryDateWithStatus = (load) => {
    if (load.status === "Delivered") {
      const actualDate = load.actualDEL;
      const scheduledDate = load.deliveryDateTime;
      
      if (!actualDate) return { date: "N/A", status: "none" };
      
      const dateObj = new Date(actualDate.seconds ? actualDate.seconds * 1000 : actualDate);
      const formattedDate = dateObj.toLocaleDateString('en-US', { 
        timeZone: applicationTimeZone || 'America/New_York',
        month: 'short', 
        day: 'numeric', 
        year: 'numeric' 
      });
      
      if (scheduledDate) {
        const scheduled = new Date(scheduledDate.seconds ? scheduledDate.seconds * 1000 : scheduledDate);
        const isOnTime = dateObj <= scheduled;
        return { date: formattedDate, status: isOnTime ? "green" : "red" };
      }
      
      return { date: formattedDate, status: "none" };
    }
    
    if (load.status === "Cancelled") {
      const cancelDate = new Date(load.updatedAt.seconds ? load.updatedAt.seconds * 1000 : load.updatedAt);
      return { 
        date: `${cancelDate.toLocaleDateString('en-US', { timeZone: applicationTimeZone || 'America/New_York', month: 'short', day: 'numeric', year: 'numeric' })} (Cancelled)`,
        status: "none"
      };
    }
    
    if (load.status === "In Transit") {
      return { date: "In Transit", status: "none" };
    }
    
    return { date: "N/A", status: "none" };
  };

  // Loadboard Logo Component
  const LoadboardLogo = ({ sourceType, size = 24 }) => {
    const info = getLoadboardInfo(sourceType);
    
    if (!info.logo) {
      // Fallback for entries without logos
      if (sourceType === 'chrome_extension') {
        return (
          <span 
            className="inline-flex items-center justify-center bg-cyan-100 text-cyan-800 rounded text-xs font-bold border border-cyan-300"
            style={{ width: size, height: size, fontSize: '8px' }}
            title="Chrome Extension"
          >
            EXT
          </span>
        );
      }
      if (sourceType === 'manual') {
        return (
          <span 
            className="inline-flex items-center justify-center bg-gray-100 text-gray-600 rounded text-xs font-bold border border-gray-300"
            style={{ width: size, height: size, fontSize: '8px' }}
            title="Manual Entry"
          >
            MAN
          </span>
        );
      }
      if (sourceType === 'pdf_upload') {
        return (
          <span 
            className="inline-flex items-center justify-center bg-gray-100 text-gray-600 rounded text-xs font-bold border border-gray-300"
            style={{ width: size, height: size, fontSize: '8px' }}
            title="PDF Upload"
          >
            PDF
          </span>
        );
      }
      return <span className="text-gray-400 text-xs">—</span>;
    }
    
    return (
      <img 
        src={info.logo} 
        alt={info.label}
        title={info.label}
        className="rounded cursor-help"
        style={{ width: size, height: size, objectFit: 'contain' }}
        onError={(e) => {
          // Fallback if image fails to load
          e.target.style.display = 'none';
          e.target.nextSibling && (e.target.nextSibling.style.display = 'inline-flex');
        }}
      />
    );
  };

  return (
    <div className="overflow-x-auto bg-white shadow-lg rounded-lg">
      {/* Column Toggle */}
      <div className="flex items-center gap-3 px-4 py-2 bg-gray-50 border-b border-gray-200 flex-wrap">
        <span className="text-xs font-medium text-gray-500">Columns:</span>
        <button
          onClick={toggleTruckColumn}
          className={`text-xs px-2 py-1 rounded border transition-colors ${
            showTruckColumn 
              ? 'bg-blue-100 text-blue-700 border-blue-300' 
              : 'bg-gray-100 text-gray-500 border-gray-300'
          }`}
        >
          {showTruckColumn ? '✓ Truck' : '○ Truck'}
        </button>
        <button
          onClick={toggleDispatcherColumn}
          className={`text-xs px-2 py-1 rounded border transition-colors ${
            showDispatcherColumn 
              ? 'bg-blue-100 text-blue-700 border-blue-300' 
              : 'bg-gray-100 text-gray-500 border-gray-300'
          }`}
        >
          {showDispatcherColumn ? '✓ Dispatcher' : '○ Dispatcher'}
        </button>
        <button
          onClick={toggleLoadboardColumn}
          className={`text-xs px-2 py-1 rounded border transition-colors ${
            showLoadboardColumn 
              ? 'bg-blue-100 text-blue-700 border-blue-300' 
              : 'bg-gray-100 text-gray-500 border-gray-300'
          }`}
        >
          {showLoadboardColumn ? '✓ Loadboard' : '○ Loadboard'}
        </button>
        <button
          onClick={toggleAppColumn}
          className={`text-xs px-2 py-1 rounded border transition-colors ${
            showAppColumn 
              ? 'bg-blue-100 text-blue-700 border-blue-300' 
              : 'bg-gray-100 text-gray-500 border-gray-300'
          }`}
        >
          {showAppColumn ? '✓ App' : '○ App'}
        </button>
        <button
          onClick={toggleFees}
          className={`text-xs px-2 py-1 rounded border transition-colors ${
            showFees 
              ? 'bg-blue-100 text-blue-700 border-blue-300' 
              : 'bg-gray-100 text-gray-500 border-gray-300'
          }`}
        >
          {showFees ? '✓ Fees/Net' : '○ Fees/Net'}
        </button>
        <button
          onClick={togglePerMile}
          className={`text-xs px-2 py-1 rounded border transition-colors ${
            showPerMile 
              ? 'bg-blue-100 text-blue-700 border-blue-300' 
              : 'bg-gray-100 text-gray-500 border-gray-300'
          }`}
        >
          {showPerMile ? '✓ P/Mile' : '○ P/Mile'}
        </button>
      </div>
      
      <table className="min-w-full text-sm">
        <thead className="bg-gray-100 border-b border-gray-200">
          <tr>
            {canHardDelete && (
              <th className="px-4 py-3 text-center">
                <input
                  type="checkbox"
                  checked={isAllSelected}
                  onChange={onSelectAll}
                  className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500 cursor-pointer"
                  title="Select All"
                />
              </th>
            )}
            <th className="px-2 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider w-12"></th>
            <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Load ID</th>
            {showLoadboardColumn && (
              <th className="px-2 py-2 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">LB</th>
            )}
            {showAppColumn && (
              <th className="px-2 py-2 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">App</th>
            )}
            <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
            <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider hidden md:table-cell">Driver</th>
            {showTruckColumn && (
              <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider hidden md:table-cell">Truck #</th>
            )}
            <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider hidden lg:table-cell">Vehicle</th>
            {showDispatcherColumn && (
              <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider hidden lg:table-cell">Dispatcher</th>
            )}
            <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Amount / P/Mile</th>
            <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider hidden lg:table-cell">Broker</th>
            <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider hidden lg:table-cell">Company</th>
            <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider hidden sm:table-cell">Actual Pick Up</th>
            <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider hidden sm:table-cell">Actual Delivery</th>
            <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {accountingLoads.length === 0 ? (
            <tr>
              <td colSpan={20} className="px-4 py-16 text-center">
                <svg className="w-12 h-12 text-gray-300 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <p className="text-gray-400 text-sm">No loads found matching your criteria.</p>
              </td>
            </tr>
          ) : accountingLoads.map(load => {
            const overdue = isPaymentOverdue(load);
            const isUnpaid = load.paymentStatus === 'unpaid';
            const isPaid = load.paymentStatus === 'paid';
            const isSelected = selectedLoads.has(load.docId);
            
            return (
              <React.Fragment key={load.docId}>
<tr className={`transition ${isSelected ? 'bg-blue-50' : load.status === 'In Transit' ? 'bg-red-50' : (load.paymentTerms === 'on_delivery' || load.paymentTerms === 'on_pickup') ? 'bg-green-50' : 'hover:bg-gray-50'}`}>{canHardDelete && (
                    <td className="px-4 py-3 text-center">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => onSelectLoad(load.docId)}
                        className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500 cursor-pointer"
                        title="Select this load"
                      />
                    </td>
                  )}
                  <td className="px-2 py-3 whitespace-nowrap">
                    <button 
                      onClick={() => toggleLoadDetails(load.docId)} 
                      className="text-gray-400 hover:text-blue-600 p-1"
                    >
                      <svg 
                        className={`w-5 h-5 transform transition-transform duration-200 ${
                          expandedLoadId === load.docId ? 'rotate-90' : ''
                        }`} 
                        fill="none" 
                        stroke="currentColor" 
                        viewBox="0 0 24 24" 
                        xmlns="http://www.w3.org/2000/svg"
                      >
                        <path 
                          strokeLinecap="round" 
                          strokeLinejoin="round" 
                          strokeWidth="2" 
                          d="M9 5l7 7-7 7"
                        />
                      </svg>
                    </button>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap font-medium text-blue-700">
                    {load.load_id}
                  </td>

                  {/* Loadboard Column - Logo with Dropdown */}
                  {showLoadboardColumn && (
                    <td className="px-2 py-3 text-center">
                      {canAmendAccounting ? (
                        <div className="relative inline-block group">
                          <LoadboardLogo sourceType={load.sourceType} size={28} />
                          <select
                            value={load.sourceType || ''}
                            onChange={(e) => handleLoadboardChange(load.docId, e.target.value)}
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                            title={getLoadboardInfo(load.sourceType).label}
                          >
                            {LOADBOARD_OPTIONS.map(opt => (
                              <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                          </select>
                        </div>
                      ) : (
                        <LoadboardLogo sourceType={load.sourceType} size={28} />
                      )}
                    </td>
                  )}

                  {/* Required App Column - Editable */}
                  {showAppColumn && (
                    <td className="px-2 py-3 text-center">
                      {canAmendAccounting ? (
                        <select
                          value={load.requiredApp || ''}
                          onChange={(e) => handleRequiredAppChange(load.docId, e.target.value)}
                          className={`text-xs px-1 py-0.5 rounded border cursor-pointer ${
                            load.requiredApp 
                              ? 'bg-blue-50 text-blue-700 border-blue-300' 
                              : 'bg-gray-50 text-gray-500 border-gray-300'
                          }`}
                          title="Change required app"
                        >
                          {REQUIRED_APP_OPTIONS.map(opt => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                          ))}
                        </select>
                      ) : (
                        load.requiredApp ? (
                          <span 
                            className="text-lg cursor-help" 
                            title={`Driver must use ${load.requiredApp.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())} app`}
                          >
                            📱
                          </span>
                        ) : (
                          <span className="text-gray-400 text-xs">—</span>
                        )
                      )}
                    </td>
                  )}

                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className="text-gray-500">{load.status}</span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-gray-500 hidden md:table-cell">
                    {getDriverName(load.driverId)}
                  </td>
                  {showTruckColumn && (
                    <td className="px-4 py-3 whitespace-nowrap text-gray-500 hidden md:table-cell">
                      {getTruckNumber(load.truckId)}
                    </td>
                  )}
                  <td className="px-4 py-3 whitespace-nowrap text-gray-500 hidden lg:table-cell">
                    {load.vehicles && load.vehicles.length > 0 ? (
                      <div className="text-xs">
                        <p className="font-medium text-gray-700">
                          {load.vehicles[0].year} {load.vehicles[0].make} {load.vehicles[0].model}
                        </p>
                        {load.vehicles[0].vin && (
                          <p className="text-gray-400 font-mono">{load.vehicles[0].vin}</p>
                        )}
                        {load.vehicles.length > 1 && (
                          <p className="text-blue-600 font-medium">+{load.vehicles.length - 1} more</p>
                        )}
                      </div>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  {showDispatcherColumn && (
                    <td className="px-4 py-3 whitespace-nowrap text-gray-500 hidden lg:table-cell">
                      {getDispatcherName(load.dispatcherId)}
                    </td>
                  )}
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="flex items-center gap-0">
                      <div className={`font-bold min-w-[90px] ${overdue ? 'text-red-600' : 'text-green-700'}`}>
                        {formatCurrency(load.amount)}
                        {showFees && load.brokerFeeCollection > 0 && (
                          <span className={`block text-xs font-semibold ${load.factoringApplied === true ? 'text-purple-600' : 'text-orange-600'}`}>
                            -{formatCurrency(load.brokerFeeCollection)} {load.factoringApplied === true ? 'Fact' : 'Br'}
                            {load.factoringApplied === true && load.factoringPercentage ? ` (${load.factoringPercentage}%)` : ''}
                          </span>
                        )}
                                               {showFees && load.brokerFeeCollection > 0 && (
                          <span className="block text-xs font-bold text-gray-800">
                            Net: {formatCurrency((parseFloat(load.amount) || 0) - (parseFloat(load.brokerFeeCollection) || 0))}
                          </span>
                        )}
                        {showPerMile && calculatePerMileRate(load.amount, load.mileage) && (
                          <span className="block text-xs text-blue-900 font-semibold">
                            P/m ${calculatePerMileRate(load.amount, load.mileage)}
                          </span>
                        )}
                      </div>
                      <div className="flex flex-col gap-1">
                        {isPaid && (
                          <span className="inline-flex items-center gap-1 bg-green-100 text-green-800 px-2 py-0.5 rounded-full text-xs font-medium">
                            Paid
                          </span>
                        )}
                        {load.invoiceStatus === 'invoiced' && !isPaid && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                            Invoiced
                          </span>
                        )}
                        {overdue && !isPaid && (
                          <span className="inline-flex items-center gap-1 bg-red-100 text-red-800 px-2 py-0.5 rounded-full text-xs font-medium">
                            Overdue
                          </span>
                        )}
                        {isUnpaid && !overdue && !isPaid && (
                          <span className="inline-flex items-center gap-1 bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded-full text-xs font-medium">
                            Unpaid
                          </span>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-gray-500 hidden lg:table-cell">
                    <div>
                      <div>{getBrokerName(load)}</div>
                      {(() => {
                        const broker = brokers.find(b => b.id === load.brokerId) || 
                                       brokers.find(b => b.name === load.brokerName);
                        return broker?.phone ? (
                          <div className="text-xs text-gray-400">{broker.phone}</div>
                        ) : null;
                      })()}
                    </div>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-gray-500 hidden lg:table-cell">
                    {getCompanyName(load)}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-gray-500 hidden sm:table-cell">
                    {(() => {
                      const pickupInfo = getPickupDateWithStatus(load);
                      return (
                        <div className="flex items-center gap-1">
                          {pickupInfo.status !== "none" && (
                            <span className={`inline-block w-2 h-2 rounded-full ${
                              pickupInfo.status === "green" ? "bg-green-500" : "bg-red-500"
                            }`}></span>
                          )}
                          <span>{pickupInfo.date}</span>
                        </div>
                      );
                    })()}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-gray-500 hidden sm:table-cell">
                    {(() => {
                      const deliveryInfo = getDeliveryDateWithStatus(load);
                      return (
                        <div className="flex items-center gap-1">
                          {deliveryInfo.status !== "none" && (
                            <span className={`inline-block w-2 h-2 rounded-full ${
                              deliveryInfo.status === "green" ? "bg-green-500" : "bg-red-500"
                            }`}></span>
                          )}
                          <span>{deliveryInfo.date}</span>
                        </div>
                      );
                    })()}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm font-medium space-x-1">
                    {canAmendAccounting && (
                      <button 
                        onClick={() => onOpenEditModal(load)} 
                        className="text-blue-600 hover:text-blue-800 text-xs p-1"
                      >
                        Edit
                      </button>
                    )}
                    {canHardDelete && (
                      <button 
                        onClick={() => onDeleteLoad(load.docId, load.load_id)} 
                        className="text-red-600 hover:text-red-800 text-xs p-1"
                      >
                        Delete
                      </button>
                    )}
                  </td>
                </tr>
                
                {expandedLoadId === load.docId && (
                  <LoadDetailsRow
                    load={load}
                    drivers={drivers}
                    brokers={brokers}
                    loggedInUser={loggedInUser}
                    applicationTimeZone={applicationTimeZone}
                    canAmendAccounting={canAmendAccounting}
                    onPayTermsChange={onPayTermsChange}
                    onPaymentMethodChange={onPaymentMethodChange}
                    onGenerateBOL={onGenerateBOL}
                    onGenerateInvoice={onGenerateInvoice}
                    onPaymentStatusChange={onPaymentStatusChange}
                    onSaveAdminNote={onSaveAdminNote}
                    onEmailInvoice={onEmailInvoice}
                    updateLoadInList={updateLoadInList}
                  />
                )}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}