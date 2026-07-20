// src/components/GatePassDocuments.js
import React, { useState } from 'react';

const GatePassDocuments = ({ documents, loadId }) => {
  const [expandedDoc, setExpandedDoc] = useState(null);
  
  if (!documents || documents.length === 0) return null;
  
  // Group documents by type for better organization
  const gatePassDocs = documents.filter(doc => doc.documentType === 'gate_pass');
  const releaseDocs = documents.filter(doc => doc.documentType === 'release');
  const otherDocs = documents.filter(doc => !['gate_pass', 'release'].includes(doc.documentType));
  
  const DocumentItem = ({ doc, index }) => {
    const isExpanded = expandedDoc === index;
    
    return (
      <div className="bg-white rounded border border-blue-100 overflow-hidden transition-all duration-200">
        <div className="p-2 flex items-center justify-between">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            {doc.fileType?.includes('pdf') ? (
              <svg className="w-5 h-5 text-red-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path d="M4 18h12a2 2 0 002-2V6.414A2 2 0 0017.414 5L14 1.586A2 2 0 0012.586 1H4a2 2 0 00-2 2v13a2 2 0 002 2z"/>
              </svg>
            ) : (
              <svg className="w-5 h-5 text-blue-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z"/>
              </svg>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">{doc.fileName}</p>
              <p className="text-xs text-gray-500">
                {new Date(doc.uploadedAt).toLocaleDateString()} • {doc.uploadedBy}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {doc.fileType?.includes('image') && (
              <button
                onClick={() => setExpandedDoc(isExpanded ? null : index)}
                className="text-gray-400 hover:text-gray-600 p-1"
                title={isExpanded ? "Hide preview" : "Show preview"}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" 
                    d={isExpanded ? "M19 9l-7 7-7-7" : "M9 5l7 7-7 7"}/>
                </svg>
              </button>
            )}
            <a
              href={doc.url}
              target="_blank"
              rel="noopener noreferrer"
              className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 text-xs font-medium rounded-md flex items-center gap-1 whitespace-nowrap transition-colors"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/>
              </svg>
              Open
            </a>
          </div>
        </div>
        {isExpanded && doc.fileType?.includes('image') && (
          <div className="border-t border-blue-100 p-2 bg-gray-50">
            <img 
              src={doc.url} 
              alt={doc.fileName}
              className="max-w-full h-auto rounded"
              style={{ maxHeight: '300px' }}
            />
          </div>
        )}
      </div>
    );
  };
  
  const DocumentSection = ({ title, docs, icon }) => {
    if (!docs || docs.length === 0) return null;
    
    return (
      <div className="mb-3">
        <h5 className="text-xs font-semibold text-gray-600 mb-1 flex items-center gap-1">
          {icon}
          {title} ({docs.length})
        </h5>
        <div className="space-y-2">
          {docs.map((doc, index) => (
            <DocumentItem key={index} doc={doc} index={`${title}-${index}`} />
          ))}
        </div>
      </div>
    );
  };
  
  return (
    <div className="mt-3 p-3 bg-blue-50 rounded-md border border-blue-200">
      <h4 className="font-semibold text-blue-800 mb-3 flex items-center gap-2">
        📄 Gate Pass / Release Documents
        <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full font-normal">
          {documents.length} file{documents.length > 1 ? 's' : ''}
        </span>
      </h4>
      
      {/* Categorized display */}
      <DocumentSection 
        title="Gate Passes" 
        docs={gatePassDocs}
        icon="🚪"
      />
      <DocumentSection 
        title="Release Forms" 
        docs={releaseDocs}
        icon="📋"
      />
      <DocumentSection 
        title="Other Documents" 
        docs={otherDocs}
        icon="📎"
      />
      
      {/* If no categorization, show all */}
      {gatePassDocs.length === 0 && releaseDocs.length === 0 && otherDocs.length === 0 && (
        <div className="space-y-2">
          {documents.map((doc, index) => (
            <DocumentItem key={index} doc={doc} index={index} />
          ))}
        </div>
      )}
      
      <div className="mt-3 pt-2 border-t border-blue-200">
        <p className="text-xs text-blue-700 font-medium flex items-center gap-1">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
          </svg>
          Important: Review all documents before pickup/delivery
        </p>
      </div>
    </div>
  );
};

export default GatePassDocuments;