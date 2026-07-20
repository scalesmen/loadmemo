// src/components/shared/EmptyState.js

import React from 'react';

export default function EmptyState({ message = "No data found" }) {
  return (
    <div className="p-6 bg-white rounded-lg shadow text-center text-gray-500">
      <svg 
        className="mx-auto h-12 w-12 text-gray-400 mb-3" 
        fill="none" 
        stroke="currentColor" 
        viewBox="0 0 24 24" 
        xmlns="http://www.w3.org/2000/svg"
      >
        <path 
          strokeLinecap="round" 
          strokeLinejoin="round" 
          strokeWidth="2" 
          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
        />
      </svg>
      {message}
    </div>
  );
}