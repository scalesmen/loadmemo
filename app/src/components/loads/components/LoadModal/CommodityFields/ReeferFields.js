// src/components/loads/components/LoadModal/CommodityFields/ReeferFields.js
import React from 'react';
import { TEMP_RANGES } from '../../../utils/constants';

const ReeferFields = ({ loadForm, onInputChange }) => {
  return (
    <div className="md:col-span-2 border-t pt-4 mt-4">
      <h4 className="font-medium text-gray-700 mb-3">❄️ Reefer Requirements</h4>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Temperature */}
        <div>
          <label className="block text-sm font-medium mb-1">Temperature (°F)</label>
          <input 
            type="number" 
            name="reeferTemp" 
            value={loadForm.reeferTemp || ''} 
            onChange={onInputChange} 
            className="block w-full px-3 py-2 text-sm border border-gray-300 rounded-md shadow-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500" 
            placeholder="32" 
          />
        </div>

        {/* Temperature Range */}
        <div>
          <label className="block text-sm font-medium mb-1">Temp Range</label>
          <select 
            name="reeferTempRange" 
            value={loadForm.reeferTempRange || ''} 
            onChange={onInputChange} 
            className="input-class"
          >
            {TEMP_RANGES.map(range => (
              <option key={range.value} value={range.value}>
                {range.label}
              </option>
            ))}
          </select>
        </div>

        {/* Special Instructions */}
        <div>
          <label className="block text-sm font-medium mb-1">Special Instructions</label>
          <input 
            type="text" 
            name="reeferInstructions" 
            value={loadForm.reeferInstructions || ''} 
            onChange={onInputChange} 
            className="input-class" 
            placeholder="Keep frozen, no thaw" 
          />
        </div>
      </div>
    </div>
  );
};

export default ReeferFields;