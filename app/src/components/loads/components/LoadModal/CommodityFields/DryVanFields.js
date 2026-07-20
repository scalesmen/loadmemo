// src/components/loads/components/LoadModal/CommodityFields/DryVanFields.js
import React from 'react';
import { TRAILER_TYPES, LOADING_EQUIPMENT, CARGO_TYPES } from '../../../utils/constants';

const DryVanFields = ({ loadForm, onInputChange }) => {
  return (
    <div className="md:col-span-2 border-t pt-4 mt-4">
      <h4 className="font-medium text-gray-700 mb-3">📦 Dry Van Cargo Details</h4>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Cargo Weight */}
        <div>
          <label className="block text-sm font-medium mb-1">Weight (lbs)</label>
          <input 
            type="number" 
            name="cargoWeight" 
            value={loadForm.cargoWeight || ''} 
            onChange={onInputChange} 
            className="block w-full px-3 py-2 text-sm border border-gray-300 rounded-md shadow-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500" 
            placeholder="45000"
          />
        </div>

        {/* Pallet Count */}
        <div>
          <label className="block text-sm font-medium mb-1">Pallet Count</label>
          <input 
            type="number" 
            name="palletCount" 
            value={loadForm.palletCount || ''} 
            onChange={onInputChange} 
            className="input-class" 
            placeholder="26"
          />
        </div>

        {/* Trailer Type */}
        <div>
          <label className="block text-sm font-medium mb-1">Trailer Type</label>
          <select 
            name="trailerType" 
            value={loadForm.trailerType || ''} 
            onChange={onInputChange} 
            className="input-class"
          >
            {TRAILER_TYPES.map(type => (
              <option key={type.value} value={type.value}>
                {type.label}
              </option>
            ))}
          </select>
        </div>

        {/* Loading Equipment */}
        <div>
          <label className="block text-sm font-medium mb-1">Loading Equipment</label>
          <select 
            name="loadingEquipment" 
            value={loadForm.loadingEquipment || ''} 
            onChange={onInputChange} 
            className="input-class"
          >
            {LOADING_EQUIPMENT.map(equipment => (
              <option key={equipment.value} value={equipment.value}>
                {equipment.label}
              </option>
            ))}
          </select>
        </div>

        {/* Cargo Type */}
        <div>
          <label className="block text-sm font-medium mb-1">Cargo Type</label>
          <select 
            name="cargoType" 
            value={loadForm.cargoType || ''} 
            onChange={onInputChange} 
            className="input-class"
          >
            {CARGO_TYPES.map(type => (
              <option key={type.value} value={type.value}>
                {type.label}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
};

export default DryVanFields;