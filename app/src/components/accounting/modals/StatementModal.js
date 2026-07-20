// src/components/accounting/modals/StatementModal.js

import React, { useState, useEffect } from 'react';
import { fetchStatementLoads } from '../services/accountingService';
import { formatTimestampInAppZone, getDateRangeDisplay } from '../utils/dateFormatters';
import { DATE_FORMATS } from '../constants/accountingConstants';

export default function StatementModal({ 
  isOpen, 
  onClose, 
  drivers, 
  trucks, 
  loggedInUser,
  applicationTimeZone,
  isLoadingTimeZone
}) {
  const [statementParams, setStatementParams] = useState({
    driverId: 'all',
    truckId: 'all',
    statementStartDate: '',
    statementEndDate: '',
  });
  const [statementLoads, setStatementLoads] = useState([]);
  const [isGeneratingStatement, setIsGeneratingStatement] = useState(false);
  const [statementFilterRangeDisplay, setStatementFilterRangeDisplay] = useState({ 
    start: '', 
    end: '' 
  });

  // Update statement filter range display
  useEffect(() => {
    const display = getDateRangeDisplay(
      statementParams.statementStartDate,
      statementParams.statementEndDate,
      applicationTimeZone,
      isLoadingTimeZone
    );
    setStatementFilterRangeDisplay(display);
  }, [statementParams.statementStartDate, statementParams.statementEndDate, applicationTimeZone, isLoadingTimeZone]);

  const handleStatementModalInputChange = (e) => {
    const { name, value } = e.target;
    setStatementParams(prev => ({ ...prev, [name]: value }));
  };

  const handleGenerateStatement = async () => {
    if (!statementParams.statementStartDate || !statementParams.statementEndDate) {
      alert("Please select a start and end date for the statement.");
      return;
    }
    if (isLoadingTimeZone || !applicationTimeZone || !loggedInUser?.tenantId) {
      alert("Application timezone is not loaded yet. Please try again shortly.");
      return;
    }
    
    setIsGeneratingStatement(true);
    setStatementLoads([]);

    try {
      const loads = await fetchStatementLoads(
        statementParams, 
        loggedInUser.tenantId, 
        applicationTimeZone
      );
      setStatementLoads(loads);
      if (loads.length === 0) {
        alert("No loads found for the selected statement criteria.");
      }
    } catch (err) {
      console.error("Error fetching data for statement:", err);
      if (err.code === 'failed-precondition') {
        alert(`Query for statement requires an index. Firestore: ${err.message}`);
      } else {
        alert("Failed to fetch data for statement.");
      }
    }
    
    setIsGeneratingStatement(false);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60 p-4 overflow-y-auto">
      <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-xl">
        <h3 className="text-xl font-semibold mb-6 text-gray-800">Generate Driver/Truck Statement</h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div>
            <label htmlFor="stmtDriverFilter" className="block text-sm font-medium text-gray-700">
              Driver
            </label>
            <select 
              name="driverId" 
              id="stmtDriverFilter" 
              value={statementParams.driverId} 
              onChange={handleStatementModalInputChange} 
              className="mt-1 block w-full py-2 px-3 border border-gray-300 bg-white rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
            >
              <option value="all">All Drivers</option>
              {drivers.map(d => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>
          
          <div>
            <label htmlFor="stmtTruckFilter" className="block text-sm font-medium text-gray-700">
              Truck #
            </label>
            <select 
              name="truckId" 
              id="stmtTruckFilter" 
              value={statementParams.truckId} 
              onChange={handleStatementModalInputChange} 
              className="mt-1 block w-full py-2 px-3 border border-gray-300 bg-white rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
            >
              <option value="all">All Trucks</option>
              {trucks.map(t => (
                <option key={t.id} value={t.id}>{t.unitNumber}</option>
              ))}
            </select>
          </div>
          
          <div>
            <label htmlFor="stmtStartDate" className="block text-sm font-medium text-gray-700">
              Start Date
            </label>
            <input 
              type="date" 
              name="statementStartDate" 
              id="stmtStartDate" 
              value={statementParams.statementStartDate} 
              onChange={handleStatementModalInputChange} 
              className="mt-1 block w-full py-2 px-3 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm" 
              required 
            />
          </div>
          
          <div>
            <label htmlFor="stmtEndDate" className="block text-sm font-medium text-gray-700">
              End Date
            </label>
            <input 
              type="date" 
              name="statementEndDate" 
              id="stmtEndDate" 
              value={statementParams.statementEndDate} 
              onChange={handleStatementModalInputChange} 
              className="mt-1 block w-full py-2 px-3 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm" 
              required 
            />
          </div>
        </div>
        
        {/* Display for statement filter range */}
        {(statementFilterRangeDisplay.start || statementFilterRangeDisplay.end) && (
          <div className="mb-2 text-xs text-gray-500">
            Statement period from: {statementFilterRangeDisplay.start || "Beginning of time"} <br />
            To: {statementFilterRangeDisplay.end || "End of time"}
          </div>
        )}
        
        <div className="flex justify-end space-x-3 mb-4">
          <button 
            type="button" 
            onClick={onClose} 
            className="bg-gray-200 hover:bg-gray-300 text-gray-700 px-4 py-2 rounded-md text-sm font-medium"
          >
            Cancel
          </button>
          <button 
            onClick={handleGenerateStatement} 
            disabled={isGeneratingStatement || isLoadingTimeZone} 
            className="bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded-md text-sm font-medium disabled:bg-green-300"
          >
            {isGeneratingStatement ? "Generating..." : "Generate"}
          </button>
        </div>
        
        {statementLoads.length > 0 && (
          <div className="mt-4 border-t pt-4">
            <h4 className="text-lg font-semibold mb-2">Statement Loads ({statementLoads.length})</h4>
            <div className="max-h-60 overflow-y-auto text-xs">
              <ul>
                {statementLoads.map(load => (
                  <li key={load.docId} className="py-1 border-b">
                    {load.load_id} - Driver: {drivers.find(d => d.id === load.driverId)?.name || 'N/A'} - 
                    Amount: ${load.amount} - 
                    Delivered: {formatTimestampInAppZone(load.actualDEL, applicationTimeZone, DATE_FORMATS.DATE_ONLY)}
                  </li>
                ))}
              </ul>
              <p className="mt-2 font-bold">
                Total Amount: ${statementLoads.reduce((sum, load) => sum + (Number(load.amount) || 0), 0).toFixed(2)}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}