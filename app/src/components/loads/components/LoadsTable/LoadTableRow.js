// src/components/loads/components/LoadsTable/LoadTableRow.js
import React, { memo, useState, useRef, useEffect } from 'react';
import ExpandedLoadDetails from './ExpandedLoadDetails';
import { STATUS_COLORS } from '../../utils/constants';
// Loadboard logo mapping
const LOADBOARD_INFO = {
  'super_dispatch_pdf': { label: 'Super Dispatch', logo: '/images/loadboards/super_dispatch.png' },
  'central_dispatch_pdf': { label: 'Central Dispatch', logo: '/images/loadboards/central_dispatch.png' },
  'carsarrive_pdf': { label: 'CarsArrive', logo: '/images/loadboards/carsarrive.png' },
  'ship_cars_pdf': { label: 'Ship.Cars', logo: '/images/loadboards/ship_cars.png' },
  'acv_transport_pdf': { label: 'ACV Transport', logo: '/images/loadboards/acv.png' },
  'runbuggy_pdf': { label: 'Runbuggy', logo: '/images/loadboards/runbuggy.png' },
  'direct_freight_pdf': { label: 'Direct Freight', logo: '/images/loadboards/direct_freight.png' },
  'montway_pdf': { label: 'Montway', logo: '/images/loadboards/montway.png' },
  'carpool_pdf': { label: 'Carpool', logo: '/images/loadboards/carpool.png' },
  'copart_pdf': { label: 'Copart', logo: '/images/loadboards/copart.png' },
  'carvana_pdf': { label: 'Carvana', logo: '/images/loadboards/carvana.png' },
  'haulex_pdf': { label: 'Haulex', logo: '/images/loadboards/haulex.png' },
  'rpm_pdf': { label: 'RPM', logo: '/images/loadboards/rpm.png' },
  'autosled_pdf': { label: 'Autosled', logo: '/images/loadboards/autosled.png' },
  'acertus_pdf': { label: 'Acertus', logo: '/images/loadboards/acertus.png' },
};
const LoadTableRow = memo(({ 
  load, 
  drivers = [], 
  trucks = [],
  brokers = [],
  dispatchers = [],
  isAutomobileHauling = false,
  canManageLoads = false,
  canSeeDispatcherFilter = false,
  onStatusChange,
  onDriverChange,
  onTruckChange,
  onBrokerChange,
  onDispatcherChange,
  onEdit,
  onDelete,
  formatDateOnly,
  formatTimestampForDisplay,
  extractCityStateZip,
  applicationTimeZone,
  isExpanded = false,
  onToggleExpand,
  loadStatuses = [],
  loggedInUser,
  LoadDocuments,
  showMileageColumn = true,
  showDispatcherColumn = true
}) => {
  const [brokerSearch, setBrokerSearch] = useState('');
  const [showBrokerDropdown, setShowBrokerDropdown] = useState(false);
  const brokerDropdownRef = useRef(null);

  const dispatcherUser = dispatchers.find(u => u.id === load.dispatcherId);
  const brokerObj = brokers.find(b => b.id === load.brokerId);
  const hasInopVehicles = isAutomobileHauling && load.vehicles && load.vehicles.some(v => v.inop === true);

  const filteredBrokers = brokers.filter(b => 
    b.name.toLowerCase().includes(brokerSearch.toLowerCase())
  );

  // Click outside handler for broker dropdown
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (brokerDropdownRef.current && !brokerDropdownRef.current.contains(event.target)) {
        setShowBrokerDropdown(false);
        setBrokerSearch('');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <>
      <tr className="hover:bg-gray-50 transition">
        {/* Expand button */}
        <td className="px-2 py-3">
          <button 
            onClick={() => onToggleExpand(load.docId)} 
            className="text-gray-400 hover:text-blue-600 p-1"
          >
            <svg 
              className={`w-5 h-5 transform transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`} 
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </td>

       {/* Load ID */}
        <td className="px-3 py-3">
  <span className="font-medium text-blue-700">{load.load_id}</span>
  {load.companyName && (
    <div className="text-xs text-gray-400 truncate max-w-[120px]" title={load.companyName}>
      {load.companyName}
    </div>
  )}
</td>

        {/* Loadboard - NEW COLUMN */}
        {/* Loadboard - Logo */}
        <td className="px-2 py-3 text-center">
          {LOADBOARD_INFO[load.sourceType] ? (
            <img 
              src={LOADBOARD_INFO[load.sourceType].logo}
              alt={LOADBOARD_INFO[load.sourceType].label}
              title={LOADBOARD_INFO[load.sourceType].label}
className="rounded object-contain inline-block"
style={{ width: 28, height: 28 }}            />
          ) : load.sourceType === 'chrome_extension' ? (
            <span className="inline-block bg-cyan-100 text-cyan-800 px-2 py-0.5 rounded text-xs font-bold border border-cyan-300" title="Chrome Extension">
              EXT
            </span>
          ) : (
            <span className="text-gray-400 text-xs">—</span>
          )}
        </td>
{/* Required App */}
        <td className="px-2 py-3 text-center">
          {load.requiredApp ? (
            <span 
              className="text-lg cursor-help" 
              title={`Driver must use ${load.requiredApp.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())} app`}
            >
              📱
            </span>
          ) : (
            <span className="text-gray-400 text-xs">—</span>
          )}
        </td>

        {/* Status */}
        <td className="px-1 py-2">
  <select 
    value={load.status} 
    onChange={e => {
      const newStatus = e.target.value;
      // Block direct Delivered - must be In Transit first
      if (newStatus === 'Delivered' && load.status !== 'In Transit') {
        alert('Load must be "In Transit" before marking as "Delivered".');
        return;
      }
      onStatusChange(load.docId, newStatus);
    }} 
    className={`border rounded-md py-1 px-2 text-xs w-full sm:w-auto ${STATUS_COLORS[load.status] || 'bg-gray-100 text-gray-800'}`} 
    disabled={!canManageLoads}
  >
    {loadStatuses.map(s => <option key={s} value={s}>{s}</option>)}
  </select>
</td>

        {/* Vehicle/Pickup Info */}
        <td className="px-3 py-3 text-gray-600">
          {isAutomobileHauling ? (
            <div>
              <div className="font-medium text-blue-700 flex items-center gap-1">
                {load.vehicles && load.vehicles[0] ? 
                  `${load.vehicles[0].year || ''} ${load.vehicles[0].make || 'N/A'} ${load.vehicles[0].model || ''}`.trim() : 
                  'No Vehicle Info'}
                {hasInopVehicles && (
                  <span className="inline-block bg-red-100 text-red-800 px-1 py-0.5 rounded text-xs font-medium">
                    INOP
                  </span>
                )}
              </div>
              <div className="text-xs text-gray-500">
                {load.vehicles && load.vehicles[0] && load.vehicles[0].vin ? 
                  `VIN: ${load.vehicles[0].vin}` : ''}
              </div>
            </div>
          ) : (
            <div>
              {formatTimestampForDisplay(load.pickupDateTime, applicationTimeZone)}
              <br />
              <span className="block text-xs text-gray-700 font-semibold">
                {load.pickupLocationName || ''}
              </span>
              <span className="block text-xs text-gray-400">
                {load.pickupLocation || ''}
              </span>
            </div>
          )}
        </td>

        {/* Pickup/Delivery Info */}
        <td className="px-3 py-3 text-gray-600">
          {isAutomobileHauling ? (
            <div>
              <div className="text-xs text-gray-700 font-semibold mb-1">
                {load.pickupLocationName || 'Pickup Location'}
              </div>
              <div className="text-xs text-gray-600 leading-relaxed">
                {load.pickupLocation || 'No address provided'}
              </div>
{(load.status === 'In Transit' || load.status === 'Delivered') && load.actualPU ? (
                <div className={`text-xs font-semibold mt-1 ${
                  (() => {
                    const actualDate = load.actualPU.toDate ? load.actualPU.toDate() : new Date(load.actualPU);
                    const scheduledDate = load.pickupDateTime?.toDate ? load.pickupDateTime.toDate() : new Date(load.pickupDateTime);
                    // Compare only the date parts (ignore time)
                    const actualDateOnly = new Date(actualDate.getFullYear(), actualDate.getMonth(), actualDate.getDate());
                    const scheduledDateOnly = new Date(scheduledDate.getFullYear(), scheduledDate.getMonth(), scheduledDate.getDate());
                    return actualDateOnly <= scheduledDateOnly ? 'text-green-600' : 'text-red-600';
                  })()
                }`}>
                  Actual: {formatDateOnly(load.actualPU, applicationTimeZone)}
                </div>
              ) : (
                <div className="text-xs text-gray-500 mt-1">
                  {formatDateOnly(load.pickupDateTime, applicationTimeZone)}
                </div>
              )}
            </div>
          ) : (
            <div>
              {formatTimestampForDisplay(load.deliveryDateTime, applicationTimeZone)}
              <br />
              <span className="block text-xs text-gray-700 font-semibold">
                {load.deliveryLocationName || ''}
              </span>
              <span className="block text-xs text-gray-500">
                {load.deliveryLocation || ''}
              </span>
            </div>
          )}
        </td>

       {/* Delivery column for auto hauling only */}
{isAutomobileHauling && (
  <td className="px-3 py-3 text-gray-600">
    <div>
      <div className="text-xs text-gray-700 font-semibold mb-1">
        {load.deliveryLocationName || 'Delivery Location'}
      </div>
      <div className="text-xs text-gray-600 leading-relaxed">
        {load.deliveryLocation || 'No address provided'}
      </div>
      {load.status === 'Delivered' && load.actualDEL ? (
        <div className={`text-xs font-semibold mt-1 ${
          (() => {
            const actualDate = load.actualDEL.toDate ? load.actualDEL.toDate() : new Date(load.actualDEL);
            const scheduledDate = load.deliveryDateTime?.toDate ? load.deliveryDateTime.toDate() : new Date(load.deliveryDateTime);
            const actualDateOnly = new Date(actualDate.getFullYear(), actualDate.getMonth(), actualDate.getDate());
            const scheduledDateOnly = new Date(scheduledDate.getFullYear(), scheduledDate.getMonth(), scheduledDate.getDate());
            return actualDateOnly <= scheduledDateOnly ? 'text-green-600' : 'text-red-600';
          })()
        }`}>
          Actual: {formatDateOnly(load.actualDEL, applicationTimeZone)}
        </div>
      ) : (
        <div className="text-xs text-gray-500 mt-1">
          {formatDateOnly(load.deliveryDateTime, applicationTimeZone)}
        </div>
      )}
    </div>
  </td>
)}

        {/* Driver/Truck */}
        <td className="px-4 py-3">
          <div className="space-y-2">
            <select 
              value={load.driverId || ""} 
              onChange={e => onDriverChange(load.docId, e.target.value)} 
              className={`rounded-md py-2 px-2 text-xs w-full ${
                !load.driverId 
                  ? 'border-2 border-red-400 bg-red-50' 
                  : 'border border-gray-300'
              }`}
              disabled={!canManageLoads}
            >
              <option value="">Driver: Unassigned</option>
              {drivers.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
            <select 
              value={load.truckId || ""} 
              onChange={e => onTruckChange(load.docId, e.target.value)} 
              className="border rounded-md py-1 px-2 text-xs w-full bg-gray-100" 
              disabled={true} // Always disabled - truck is set automatically with driver
            >
              <option value="">Truck: Unassigned</option>
              {trucks.map(t => <option key={t.id} value={t.id}>{t.unitNumber}</option>)}
            </select>
          </div>
        </td>

        {/* Amount */}
        <td className="px-3 py-3 font-bold text-green-700">
          {(Number(load.amount) || 0).toLocaleString(undefined, { style: 'currency', currency: 'USD' })}
          <br />
          {isAutomobileHauling ? (
            <div>
              <span className="block text-xs text-blue-900 font-semibold">
                {load.vehicleCount || 1} vehicle{(load.vehicleCount || 1) > 1 ? 's' : ''}
              </span>
              {(() => {
                const net = Number(load.amount || 0) - Number(load.brokerFeeCollection || 0);
                return net !== Number(load.amount || 0) ? (
                  <span className="block text-xs text-green-600 font-semibold">
                    Net ${net.toLocaleString()}
                  </span>
                ) : null;
              })()}
            </div>
          ) : (
            <span className="block text-xs text-blue-900 font-semibold">
              {load.mileage && load.amount && Number(load.mileage) > 0 ? 
                `P/m ${(Number(load.amount) / Number(load.mileage)).toFixed(2)}` : ""}
            </span>
          )}
          {/* Payment method display */}
          {load.paymentMethod && (
            <div className="mt-1">
              <span className="inline-block bg-gray-100 text-gray-700 px-2 py-0.5 rounded text-xs font-medium">
                {load.paymentMethod}
              </span>
            </div>
          )}
         
        </td>
        {/* Broker Fee */}
        <td className="px-2 py-3 text-center">
          {load.brokerFeeCollection ? (
            <span className="text-orange-600 font-semibold text-sm">
              ${Number(load.brokerFeeCollection).toLocaleString()}
            </span>
          ) : (
            <span className="text-gray-400 text-xs">—</span>
          )}
        </td>

      {/* Mileage */}
        {showMileageColumn && (
          <td className="px-3 py-3 text-gray-600">
            <span className="font-bold">{load.mileage || ""}</span>
            {isAutomobileHauling && load.mileage && load.amount && Number(load.mileage) > 0 && (load.vehicleCount || 1) > 0 ? (
              <span className="block text-xs text-purple-700 font-semibold">
                 ${(Number(load.amount) / (load.vehicleCount || 1) / Number(load.mileage)).toFixed(2)}
              </span>
            ) : null}
          </td>
        )}
        {/* Broker - Searchable Dropdown */}
        <td className="px-3 py-3 relative" ref={brokerDropdownRef}>
          {canManageLoads ? (
            <div>
              <input
                type="text"
                value={showBrokerDropdown ? brokerSearch : (brokerObj?.name || 'Broker: Unassigned')}
                onChange={(e) => setBrokerSearch(e.target.value)}
                onFocus={() => setShowBrokerDropdown(true)}
                placeholder="Search broker..."
                className="border rounded-md py-1 px-2 text-xs w-full cursor-pointer"
                readOnly={!showBrokerDropdown}
              />
              {showBrokerDropdown && (
                <div className="absolute z-50 mt-1 w-full max-w-xs bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-y-auto">
                  <div
                    onClick={() => {
                      onBrokerChange(load.docId, '');
                      setShowBrokerDropdown(false);
                      setBrokerSearch('');
                    }}
                    className="px-3 py-2 text-xs hover:bg-blue-50 cursor-pointer border-b"
                  >
                    Broker: Unassigned
                  </div>
                  {filteredBrokers.map(b => (
                    <div
                      key={b.id}
                      onClick={() => {
                        onBrokerChange(load.docId, b.id);
                        setShowBrokerDropdown(false);
                        setBrokerSearch('');
                      }}
                      className={`px-3 py-2 text-xs hover:bg-blue-50 cursor-pointer ${
                        load.brokerId === b.id ? 'bg-blue-100' : ''
                      }`}
                    >
                      {b.name}
                    </div>
                  ))}
                  {filteredBrokers.length === 0 && (
                    <div className="px-3 py-2 text-xs text-gray-500">No brokers found</div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="text-xs text-gray-600">{brokerObj?.name || 'Unassigned'}</div>
          )}
        </td>

       {/* Dispatcher (admin only) */}
        {canSeeDispatcherFilter && showDispatcherColumn && (
          <td className="px-3 py-3">
            {/* Only admins can change dispatcher assignment */}
{canManageLoads && (() => {
  const userRoles = Array.isArray(loggedInUser?.role) ? loggedInUser.role : [loggedInUser?.role].filter(Boolean);
  return userRoles.includes('Admin') || userRoles.includes('Main Admin') || userRoles.includes('Super Admin');
})() ? (
              <select 
                value={load.dispatcherId || ""} 
                onChange={e => onDispatcherChange(load.docId, e.target.value)} 
                className={`rounded-md py-1 px-2 text-xs w-full ${
                  !load.dispatcherId 
                    ? 'border-2 border-red-400 bg-red-50' 
                    : 'border border-gray-300'
                }`}
              >
                <option value="">Dispatcher: Unassigned</option>
                {dispatchers.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            ) : (
              <div className={`text-xs px-2 py-1 rounded ${
                !load.dispatcherId 
                  ? 'text-red-600 bg-red-50 border border-red-300' 
                  : 'text-gray-600'
              }`}>
                {dispatcherUser ? dispatcherUser.name : "Unassigned"}
              </div>
            )}
          </td>
        )}

       {/* Actions */}
        <td className="px-2 py-2">
          {canManageLoads && (
            <div className="flex flex-col space-y-1">
              <button 
                onClick={() => onEdit(load)} 
                className="text-xs text-blue-600 hover:underline"
              >
                Edit
              </button>
              <button 
                onClick={() => onDelete(load)} 
                className="text-xs text-red-600 hover:underline"
              >
                Delete
              </button>
            </div>
          )}
        </td>
      </tr>

      {/* Expanded details row */}
     {isExpanded && (
        <ExpandedLoadDetails
          load={load}
          isAutomobileHauling={isAutomobileHauling}
          canManageLoads={canManageLoads}
          canSeeDispatcherFilter={canSeeDispatcherFilter}
          loggedInUser={loggedInUser}
          LoadDocuments={LoadDocuments}
          brokers={brokers}
          drivers={drivers}
          applicationTimeZone={applicationTimeZone}
          colSpan={isAutomobileHauling ? (canSeeDispatcherFilter ? 15 : 14) : (canSeeDispatcherFilter ? 14 : 13)}
        />
      )}
    </>
  );
});

LoadTableRow.displayName = 'LoadTableRow';

export default LoadTableRow;