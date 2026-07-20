// src/components/loads/components/LoadModal/VehicleInformationSection.js
import React from 'react';

const VehicleInformationSection = ({ loadForm, onVehicleChange, onVehicleCountChange }) => {
  return (
    <div className="md:col-span-2 border-t pt-4 mt-4">
      <div className="flex justify-between items-center mb-3">
        <h4 className="font-medium text-gray-700">🚗 Vehicle Information</h4>
        <div className="flex items-center gap-2">
          <label className="text-sm">Vehicle Count:</label>
          <select 
            value={loadForm.vehicleCount} 
            onChange={(e) => onVehicleCountChange(e.target.value)}
            className="border rounded px-2 py-1 text-sm"
          >
            {[1,2,3,4,5,6,7,8,9].map(num => (
              <option key={num} value={num}>
                {num} vehicle{num > 1 ? 's' : ''}
              </option>
            ))}
          </select>
        </div>
      </div>
      
      {loadForm.vehicles.map((vehicle, index) => (
        <div key={index} className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-4 p-3 bg-gray-50 rounded">
          <div className="md:col-span-5">
            <h5 className="text-sm font-medium text-gray-600 mb-2">
              Vehicle #{index + 1}
            </h5>
          </div>

          {/* Year - FIRST */}
          <div>
            <label className="block text-xs font-medium mb-1">Year</label>
            <input 
              type="number" 
              value={vehicle.year || ''} 
              onChange={(e) => onVehicleChange(index, 'year', e.target.value)}
              className="input-class text-sm" 
              min="1900" 
              max="2030" 
              placeholder="2020"
            />
          </div>

          {/* Make - SECOND */}
          <div>
            <label className="block text-xs font-medium mb-1">Make</label>
            <input 
              type="text" 
              value={vehicle.make || ''} 
              onChange={(e) => onVehicleChange(index, 'make', e.target.value)}
              className="block w-full px-3 py-2 text-sm border border-gray-300 rounded-md shadow-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500" 
              placeholder="Honda" 
            />
          </div>

          {/* Model - THIRD */}
          <div>
            <label className="block text-xs font-medium mb-1">Model</label>
            <input 
              type="text" 
              value={vehicle.model || ''} 
              onChange={(e) => onVehicleChange(index, 'model', e.target.value)}
              className="input-class text-sm" 
              placeholder="Accord" 
            />
          </div>

          {/* VIN - FOURTH */}
          <div>
            <label className="block text-xs font-medium mb-1">VIN</label>
            <input 
              type="text" 
              value={vehicle.vin || ''} 
              onChange={(e) => onVehicleChange(index, 'vin', e.target.value)}
              className="input-class text-sm" 
              placeholder="17-character VIN" 
              maxLength="17"
            />
          </div>

          {/* INOP Status - FIFTH */}
          <div>
            <label className="block text-xs font-medium mb-1">Status</label>
            <div className="flex items-center gap-2 mt-2">
              <input 
                type="checkbox" 
                id={`inop_${index}`}
                checked={vehicle.inop || false}
                onChange={(e) => onVehicleChange(index, 'inop', e.target.checked)}
                className="rounded border-gray-300"
              />
              <label htmlFor={`inop_${index}`} className="text-xs text-red-600 font-medium">
                ⚠️ INOP (Inoperable)
              </label>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

export default VehicleInformationSection;