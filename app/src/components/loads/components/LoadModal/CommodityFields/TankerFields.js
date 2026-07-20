// src/components/loads/components/LoadModal/CommodityFields/TankerFields.js
import React from 'react';
import { PRODUCT_TYPES, HAZMAT_OPTIONS, TANK_WASH_OPTIONS } from '../../../utils/constants';

const TankerFields = ({ loadForm, onInputChange }) => {
  return (
    <div className="md:col-span-2 border-t pt-4 mt-4">
      <h4 className="font-medium text-gray-700 mb-3">🛢️ Tanker Requirements</h4>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Product Type */}
        <div>
          <label className="block text-sm font-medium mb-1">Product Type</label>
          <select 
            name="productType" 
            value={loadForm.productType || ''} 
            onChange={onInputChange} 
            className="block w-full px-3 py-2 text-sm border border-gray-300 rounded-md shadow-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          >
            {PRODUCT_TYPES.map(type => (
              <option key={type.value} value={type.value}>
                {type.label}
              </option>
            ))}
          </select>
        </div>

        {/* Hazmat Required */}
        <div>
          <label className="block text-sm font-medium mb-1">Hazmat Required</label>
          <select 
            name="hazmatRequired" 
            value={loadForm.hazmatRequired || ''} 
            onChange={onInputChange} 
            className="input-class"
          >
            {HAZMAT_OPTIONS.map(option => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        {/* Tank Wash Required */}
        <div>
          <label className="block text-sm font-medium mb-1">Tank Wash Required</label>
          <select 
            name="tankWashRequired" 
            value={loadForm.tankWashRequired || ''} 
            onChange={onInputChange} 
            className="input-class"
          >
            {TANK_WASH_OPTIONS.map(option => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
};

export default TankerFields;