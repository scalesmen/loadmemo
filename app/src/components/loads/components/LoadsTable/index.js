// src/components/loads/components/LoadsTable/index.js
import React, { useState, memo } from 'react';
import LoadTableRow from './LoadTableRow';
import { LOAD_STATUSES } from '../../utils/constants';

// Loading skeleton component
const TableRowSkeleton = () => (
  <tr className="animate-pulse">
    <td className="px-2 py-3"><div className="h-5 w-5 bg-gray-200 rounded"></div></td>
    <td className="px-3 py-3"><div className="h-4 bg-gray-200 rounded w-20"></div></td>
    <td className="px-1 py-3"><div className="h-4 bg-gray-200 rounded w-8"></div></td>
    <td className="px-1 py-3"><div className="h-4 bg-gray-200 rounded w-8"></div></td>

    <td className="px-2 py-3"><div className="h-8 bg-gray-200 rounded w-20"></div></td>
    <td className="px-3 py-3">
      <div className="h-4 bg-gray-200 rounded w-40 mb-1"></div>
      <div className="h-3 bg-gray-200 rounded w-32"></div>
    </td>
    <td className="px-3 py-3">
      <div className="h-4 bg-gray-200 rounded w-40 mb-1"></div>
      <div className="h-3 bg-gray-200 rounded w-32"></div>
    </td>
    <td className="px-2 py-3">
      <div className="h-8 bg-gray-200 rounded w-full mb-2"></div>
      <div className="h-8 bg-gray-200 rounded w-full"></div>
    </td>
    <td className="px-3 py-3"><div className="h-4 bg-gray-200 rounded w-16"></div></td>
    <td className="px-2 py-3"><div className="h-4 bg-gray-200 rounded w-10"></div></td>
    <td className="px-3 py-3"><div className="h-4 bg-gray-200 rounded w-24"></div></td>
    <td className="px-2 py-3"><div className="h-4 bg-gray-200 rounded w-16"></div></td>
  </tr>
);

const LoadsTable = memo(({ 
  loads = [], 
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
  isLoading = false,
  loggedInUser,
  LoadDocuments
}) => {
  const [expandedLoadId, setExpandedLoadId] = useState(null);

  const [showMileageColumn, setShowMileageColumn] = useState(() => {
    const saved = localStorage.getItem('loads_showMileageColumn');
    return saved !== null ? JSON.parse(saved) : true;
  });

  const toggleMileageColumn = () => {
    setShowMileageColumn(prev => {
      const newValue = !prev;
      localStorage.setItem('loads_showMileageColumn', JSON.stringify(newValue));
      return newValue;
    });
  };

  const [showDispatcherColumn, setShowDispatcherColumn] = useState(() => {
    const saved = localStorage.getItem('loads_showDispatcherColumn');
    return saved !== null ? JSON.parse(saved) : true;
  });

  const toggleDispatcherColumn = () => {
    setShowDispatcherColumn(prev => {
      const newValue = !prev;
      localStorage.setItem('loads_showDispatcherColumn', JSON.stringify(newValue));
      return newValue;
    });
  };

  const handleToggleExpand = (loadId) => {
    setExpandedLoadId(expandedLoadId === loadId ? null : loadId);
  };

  if (isLoading) {
    return (
    <div className="overflow-x-auto bg-white shadow-lg rounded-lg">
      {/* Column Toggle */}
      <div className="flex items-center gap-3 px-4 py-2 bg-gray-50 border-b border-gray-200">
        <span className="text-xs font-medium text-gray-500">Columns:</span>
        <button
          onClick={toggleMileageColumn}
          className={`text-xs px-2 py-1 rounded border transition-colors ${
            showMileageColumn 
              ? 'bg-blue-100 text-blue-700 border-blue-300' 
              : 'bg-gray-100 text-gray-500 border-gray-300'
          }`}
        >
          {showMileageColumn ? '✓' : '○'} {isAutomobileHauling ? 'Mi/Pv' : 'Miles'}
        </button>
        {canSeeDispatcherFilter && (
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
        )}
      </div>
      <table className="min-w-full text-sm">
        <thead className="bg-gray-100 border-b border-gray-200">
          <tr>
            <th className="px-2 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider w-10"></th>
            <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Load ID</th>
            <th className="px-1 py-2 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider w-12">LB</th>
            <th className="px-1 py-2 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider w-12">App</th>
            <th className="px-2 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider w-24">Status</th>
            <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider min-w-[180px]">
              {isAutomobileHauling ? 'Vehicle Info' : 'Pickup'}
            </th>
            <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider min-w-[180px]">
              {isAutomobileHauling ? 'Pickup' : 'Delivery'}
            </th>
            {isAutomobileHauling && (
              <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider min-w-[180px]">Delivery</th>
            )}
            <th className="px-2 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider w-36">Driver/Truck</th>
            <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
              {isAutomobileHauling ? 'Pay/Net' : 'Amount/Mi'}
            </th>
            <th className="px-2 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider w-20 whitespace-nowrap">Br/F Fee</th>

            {showMileageColumn && (
              <th className="px-2 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider w-16">{isAutomobileHauling ? 'Mi/Pv' : 'Miles'}</th>
            )}
            <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Broker</th>
            {canSeeDispatcherFilter && showDispatcherColumn && (
              <th className="px-2 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Dispatcher</th>
            )}
            <th className="px-2 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider w-20">Actions</th>
          </tr>
        </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {[...Array(5)].map((_, i) => <TableRowSkeleton key={i} />)}
          </tbody>
        </table>
      </div>
    );
  }

  if (loads.length === 0) {
    return (
      <div className="p-6 bg-white rounded-lg shadow text-center text-gray-500">
        No current loads found matching your criteria.
      </div>
    );
  }

 return (
    <div className="overflow-x-auto bg-white shadow-lg rounded-lg">
      {/* Column Toggle */}
      <div className="flex items-center gap-3 px-4 py-2 bg-gray-50 border-b border-gray-200">
        <span className="text-xs font-medium text-gray-500">Columns:</span>
        <button
          onClick={toggleMileageColumn}
          className={`text-xs px-2 py-1 rounded border transition-colors ${
            showMileageColumn 
              ? 'bg-blue-100 text-blue-700 border-blue-300' 
              : 'bg-gray-100 text-gray-500 border-gray-300'
          }`}
        >
          {showMileageColumn ? '✓' : '○'} {isAutomobileHauling ? 'Mi/Pv' : 'Miles'}
        </button>
        {canSeeDispatcherFilter && (
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
        )}
      </div>
      <table className="min-w-full text-sm">
        <thead className="bg-gray-100 border-b border-gray-200">
          <tr>
            <th className="px-2 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider w-10"></th>
            <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Load ID</th>
            <th className="px-1 py-2 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider w-12">LB</th>
            <th className="px-1 py-2 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider w-12">App</th>
            <th className="px-2 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider w-24">Status</th>
            <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider min-w-[180px]">
              {isAutomobileHauling ? 'Vehicle Info' : 'Pickup'}
            </th>
            <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider min-w-[180px]">
              {isAutomobileHauling ? 'Pickup' : 'Delivery'}
            </th>
            {isAutomobileHauling && (
              <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider min-w-[180px]">Delivery</th>
            )}
            <th className="px-2 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider w-36">Driver/Truck</th>
            <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
              {isAutomobileHauling ? 'Pay/Net' : 'Amount/Mi'}
            </th>
            <th className="px-2 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider w-20 whitespace-nowrap">Br/F Fee</th>
            {showMileageColumn && (
              <th className="px-2 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider w-16">{isAutomobileHauling ? 'Mi/Pv' : 'Miles'}</th>
            )}
            <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Broker</th>
            {canSeeDispatcherFilter && showDispatcherColumn && (
              <th className="px-2 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Dispatcher</th>
            )}
            <th className="px-2 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider w-20">Actions</th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {loads.map(load => (
            <LoadTableRow
              key={load.docId}
              load={load}
              drivers={drivers}
              trucks={trucks}
              brokers={brokers}
              dispatchers={dispatchers}
              isAutomobileHauling={isAutomobileHauling}
              canManageLoads={canManageLoads}
              canSeeDispatcherFilter={canSeeDispatcherFilter}
              onStatusChange={onStatusChange}
              onDriverChange={onDriverChange}
              onTruckChange={onTruckChange}
              onBrokerChange={onBrokerChange}
              onDispatcherChange={onDispatcherChange}
              onEdit={onEdit}
              onDelete={onDelete}
              formatDateOnly={formatDateOnly}
              formatTimestampForDisplay={formatTimestampForDisplay}
              extractCityStateZip={extractCityStateZip}
              applicationTimeZone={applicationTimeZone}
              isExpanded={expandedLoadId === load.docId}
              onToggleExpand={handleToggleExpand}
              loadStatuses={LOAD_STATUSES}
             loggedInUser={loggedInUser}
              LoadDocuments={LoadDocuments}
              showMileageColumn={showMileageColumn}
              showDispatcherColumn={showDispatcherColumn}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
});

LoadsTable.displayName = 'LoadsTable';

export default LoadsTable;