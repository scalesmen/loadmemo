// src/components/shared/ErrorMessage.js

import React from 'react';

export default function ErrorMessage({ message }) {
  return (
    <div className="p-6 text-center text-red-500">
      <div className="inline-flex items-center">
        <svg 
          className="w-5 h-5 mr-2" 
          fill="none" 
          stroke="currentColor" 
          viewBox="0 0 24 24" 
          xmlns="http://www.w3.org/2000/svg"
        >
          <path 
            strokeLinecap="round" 
            strokeLinejoin="round" 
            strokeWidth="2" 
            d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        {message}
      </div>
    </div>
  );
}