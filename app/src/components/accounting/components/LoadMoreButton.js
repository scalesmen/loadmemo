// src/components/accounting/components/LoadMoreButton.js

import React from 'react';

export default function LoadMoreButton({ hasMore, isFetchingMore, onLoadMore }) {
  if (!hasMore) return null;

  return (
    <div className="mt-6 flex justify-center">
      <button
        onClick={onLoadMore}
        disabled={isFetchingMore}
        className="flex items-center justify-center px-6 py-3 border border-transparent rounded-full shadow-sm text-base font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 disabled:cursor-not-allowed transition-colors"
      >
        {isFetchingMore ? (
          <>
            <svg 
              className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" 
              xmlns="http://www.w3.org/2000/svg" 
              fill="none" 
              viewBox="0 0 24 24"
            >
              <circle 
                className="opacity-25" 
                cx="12" 
                cy="12" 
                r="10" 
                stroke="currentColor" 
                strokeWidth="4"
              />
              <path 
                className="opacity-75" 
                fill="currentColor" 
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            Loading...
          </>
        ) : (
          <>
            Load More
            <svg 
              xmlns="http://www.w3.org/2000/svg" 
              className="ml-3 h-5 w-5" 
              fill="none" 
              viewBox="0 0 24 24" 
              stroke="currentColor"
            >
              <path 
                strokeLinecap="round" 
                strokeLinejoin="round" 
                strokeWidth="2" 
                d="M19 14l-7 7m0 0l-7-7m7 7V3" 
              />
            </svg>
          </>
        )}
      </button>
    </div>
  );
}