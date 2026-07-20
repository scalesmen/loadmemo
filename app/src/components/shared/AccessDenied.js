// src/components/shared/AccessDenied.js

import React from 'react';

export default function AccessDenied({ role }) {
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
            d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"
          />
        </svg>
        Access Denied. (Role: {role || "None"})
      </div>
    </div>
  );
}