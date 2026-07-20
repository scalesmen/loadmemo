// src/components/accounting/components/AccountingHeader.js

import React from 'react';

export default function AccountingHeader({ 
  applicationTimeZone
}) {
  return (
    <div className="flex flex-col sm:flex-row justify-between items-center mb-6 gap-2">
      <h1 className="text-2xl sm:text-3xl font-bold text-gray-800">Accounting</h1>
      
      <div className="text-xs text-gray-500">
        Times displayed in: {applicationTimeZone || "Loading..."}
      </div>
    </div>
  );
}