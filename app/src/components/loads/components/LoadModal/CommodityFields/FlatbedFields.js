// src/components/loads/components/LoadModal/CommodityFields/FlatbedFields.js
import React from 'react';
import { TARPING_OPTIONS, SECUREMENT_TYPES } from '../../../utils/constants';

const FlatbedFields = ({ loadForm, onInputChange }) => {
  return (
    <div className="md:col-span-2 border-t pt-4 mt-4">
      <h4 className="font-medium text-gray-700 mb-3">🏗️ Flatbed Requirements</h4>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Weight */}
        <div>
          <label className="block text-sm font-medium mb-1">Weight (lbs)</label>
          <input 
            type="number" 
            name="weight" 
            value={loadForm.weight || ''} 
            onChange={onInputChange} 
            className="block w-full px-3 py-2 text-sm border border-gray-300 rounded-md shadow-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500" 
          />
        </div>

        {/* Dimensions */}
        <div>
          <label className="block text-sm font-medium mb-1">Dimensions</label>
          <input 
            type="text" 
            name="dimensions" 
            value={loadForm.dimensions || ''} 
            onChange={onInputChange} 
            className="input-class" 
            placeholder="L x W x H" 
          />
        </div>

        {/* Tarping Required */}
        <div>
          <label className="block text-sm font-medium mb-1">Tarping Required</label>
          <select 
            name="tarpingRequired" 
            value={loadForm.tarpingRequired || ''} 
            onChange={onInputChange} 
            className="input-class"
          >
            {TARPING_OPTIONS.map(option => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        {/* Securement Type */}
        <div>
          <label className="block text-sm font-medium mb-1">Securement Type</label>
          <select 
            name="securementType" 
            value={loadForm.securementType || ''} 
            onChange={onInputChange} 
            className="input-class"
          >
            {SECUREMENT_TYPES.map(type => (
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

export default FlatbedFields;