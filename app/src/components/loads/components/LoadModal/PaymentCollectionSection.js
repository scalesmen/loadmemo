// src/components/loads/components/LoadModal/PaymentCollectionSection.js
import React from 'react';

const PaymentCollectionSection = ({ loadForm, onInputChange }) => {
  const totalCollection = 
    (Number(loadForm.driverCollectionAmount) || 0) + 
    (Number(loadForm.brokerFeeCollection) || 0);

  return (
    <div className="md:col-span-2 border-t pt-4 mt-4">
      <div className="flex items-center mb-3">
        <h4 className="font-medium text-gray-700">💰 Payment Collection (COD)</h4>
        <span className="ml-2 text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">
          Auto Hauling - Only if driver needs to collect payment
        </span>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Driver Collection Amount */}
        <div>
          <label className="block text-sm font-medium mb-1">
            Driver Collection Amount ($)
          </label>
          <input 
            type="number" 
            step="0.01" 
            name="driverCollectionAmount" 
            value={loadForm.driverCollectionAmount} 
            onChange={onInputChange} 
            min="0" 
            className="block w-full px-3 py-2 text-sm border border-gray-300 rounded-md shadow-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500" 
            placeholder="0.00"
          />
          <p className="text-xs text-gray-500 mt-1">
            Amount driver should collect on delivery
          </p>
        </div>

        {/* Broker Fee Collection */}
        <div>
          <label className="block text-sm font-medium mb-1">
            Broker Fee Collection ($)
          </label>
          <input 
            type="number" 
            step="0.01" 
            name="brokerFeeCollection" 
            value={loadForm.brokerFeeCollection} 
            onChange={onInputChange} 
            min="0" 
            className="block w-full px-3 py-2 text-sm border border-gray-300 rounded-md shadow-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500" 
            placeholder="0.00"
          />
          <p className="text-xs text-gray-500 mt-1">
            Broker fee driver needs to collect
          </p>
        </div>

        {/* Collection Instructions */}
        <div>
          <label className="block text-sm font-medium mb-1">
            Collection Instructions
          </label>
          <textarea 
            name="collectionInstructions" 
            value={loadForm.collectionInstructions || ''} 
            onChange={onInputChange} 
            rows="2" 
            className="block w-full px-3 py-2 text-sm border border-gray-300 rounded-md shadow-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500" 
            placeholder="Special instructions for payment collection..."
          />
        </div>
      </div>

      {/* Warning message when collection amounts are entered */}
      {totalCollection > 0 && (
        <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded">
          <p className="text-sm text-yellow-800">
            ⚠️ <strong>Important:</strong> Driver must collect payment before completing delivery. 
            Total collection amount: {totalCollection.toLocaleString(undefined, { 
              style: 'currency', 
              currency: 'USD' 
            })}
          </p>
        </div>
      )}
    </div>
  );
};

export default PaymentCollectionSection;