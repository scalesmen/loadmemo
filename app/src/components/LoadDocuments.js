// src/components/LoadDocuments.js
import React, { useState, useEffect } from 'react';
import { storage, db } from '../firebase';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { doc, updateDoc, arrayUnion, arrayRemove } from 'firebase/firestore';

const LoadDocuments = ({ 
  loadId, 
  currentDocuments = [], 
  dispatchDocuments = [],
  loadNotes = '',
  canManage, 
  loggedInUser,
  onUploadComplete,
  onError,
  showDispatchDocs = true
}) => {
  const [uploading, setUploading] = useState(false);
  const [uploadingDispatch, setUploadingDispatch] = useState(false);
  const [gatePassDocs, setGatePassDocs] = useState(currentDocuments);
  const [dispatchDocs, setDispatchDocs] = useState(dispatchDocuments);
  const [notes, setNotes] = useState(loadNotes);
  const [isSavingNotes, setIsSavingNotes] = useState(false);
  const [notesChanged, setNotesChanged] = useState(false);

  useEffect(() => {
    setGatePassDocs(currentDocuments);
  }, [currentDocuments]);

  useEffect(() => {
    setDispatchDocs(dispatchDocuments);
  }, [dispatchDocuments]);

  useEffect(() => {
    setNotes(loadNotes || '');
  }, [loadNotes]);

  const handleNotesChange = (e) => {
    setNotes(e.target.value);
    setNotesChanged(true);
  };

  const handleSaveNotes = async () => {
    if (!notesChanged) return;

    setIsSavingNotes(true);
    try {
      const loadRef = doc(db, 'loads', loadId);
      await updateDoc(loadRef, {
        loadNotes: notes,
        updatedAt: new Date()
      });
      
      setNotesChanged(false);
      onUploadComplete?.('Notes saved successfully');
    } catch (error) {
      console.error('Error saving notes:', error);
      onError?.('Failed to save notes: ' + error.message);
    } finally {
      setIsSavingNotes(false);
    }
  };

  const handleFileUpload = async (e, documentType = 'gate_pass') => {
    const file = e.target.files[0];
    if (!file) return;

    const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg'];
    if (!allowedTypes.includes(file.type)) {
      onError?.('Please upload PDF, JPG, or PNG files only');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      onError?.('File size must be less than 5MB');
      return;
    }

    if (documentType === 'dispatch') {
      setUploadingDispatch(true);
    } else {
      setUploading(true);
    }

    try {
      const timestamp = Date.now();
      const sanitizedFileName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
      const fileName = `loads/${loadId}/documents/${documentType}/${timestamp}_${sanitizedFileName}`;
      
      const storageRef = ref(storage, fileName);
      const snapshot = await uploadBytes(storageRef, file);
      const downloadURL = await getDownloadURL(snapshot.ref);

      const docData = {
        url: downloadURL,
        fileName: file.name,
        fileType: file.type,
        uploadedAt: new Date().toISOString(),
        uploadedBy: loggedInUser.email,
        uploadedById: loggedInUser.uid,
        storagePath: fileName,
        documentType: documentType
      };

      const loadRef = doc(db, 'loads', loadId);
      const fieldName = documentType === 'dispatch' ? 'dispatchDocuments' : 'gatePassDocuments';
      
      await updateDoc(loadRef, {
        [fieldName]: arrayUnion(docData),
        updatedAt: new Date()
      });

      if (documentType === 'dispatch') {
        setDispatchDocs([...dispatchDocs, docData]);
      } else {
        setGatePassDocs([...gatePassDocs, docData]);
      }
      
      e.target.value = '';
      
      onUploadComplete?.(`${documentType === 'dispatch' ? 'Dispatch' : 'Gate Pass'} document uploaded successfully`);
    } catch (error) {
      console.error('Error uploading document:', error);
      onError?.('Failed to upload document: ' + error.message);
    } finally {
      if (documentType === 'dispatch') {
        setUploadingDispatch(false);
      } else {
        setUploading(false);
      }
    }
  };

  const handleDeleteDocument = async (docToDelete, documentType = 'gate_pass') => {
    if (!window.confirm('Are you sure you want to delete this document?')) return;

    try {
      const storageRef = ref(storage, docToDelete.storagePath);
      await deleteObject(storageRef);

      const loadRef = doc(db, 'loads', loadId);
      const fieldName = documentType === 'dispatch' ? 'dispatchDocuments' : 'gatePassDocuments';
      
      await updateDoc(loadRef, {
        [fieldName]: arrayRemove(docToDelete),
        updatedAt: new Date()
      });

      if (documentType === 'dispatch') {
        setDispatchDocs(dispatchDocs.filter(d => d.storagePath !== docToDelete.storagePath));
      } else {
        setGatePassDocs(gatePassDocs.filter(d => d.storagePath !== docToDelete.storagePath));
      }
      
      onUploadComplete?.('Document deleted successfully');
    } catch (error) {
      console.error('Error deleting document:', error);
      onError?.('Failed to delete document: ' + error.message);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
      {/* Load Notes Section */}
      <div className="border border-yellow-200 rounded-lg p-3 bg-yellow-50">
        <div className="flex items-center justify-between mb-2">
          <h5 className="text-xs font-semibold text-yellow-800 flex items-center gap-1">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
            Internal Notes
          </h5>
          {notesChanged && (
            <button
              onClick={handleSaveNotes}
              disabled={isSavingNotes}
              className="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded bg-yellow-600 text-white hover:bg-yellow-700 disabled:opacity-50"
            >
              {isSavingNotes ? 'Saving...' : 'Save'}
            </button>
          )}
        </div>
        
        <textarea
          value={notes}
          onChange={handleNotesChange}
          onBlur={handleSaveNotes}
          placeholder="Add notes about this load..."
          rows="3"
          className="w-full px-2 py-1.5 text-xs border border-yellow-300 rounded focus:outline-none focus:border-yellow-500 focus:ring-1 focus:ring-yellow-500 bg-white"
        />
        
        
      </div>

      {/* Gate Pass Documents */}
      <div className="border border-gray-200 rounded-lg p-3 bg-white">
        <div className="flex items-center justify-between mb-2">
          <h5 className="text-xs font-semibold text-gray-700 flex items-center gap-1">
            <svg className="w-3 h-3 text-orange-500" fill="currentColor" viewBox="0 0 20 20">
              <path d="M4 18h12a2 2 0 002-2V6.414A2 2 0 0017.414 5L14 1.586A2 2 0 0012.586 1H4a2 2 0 00-2 2v13a2 2 0 002 2z"/>
            </svg>
            Gate Pass
          </h5>
          {canManage && (
            <label className="cursor-pointer">
              <input
                type="file"
                onChange={(e) => handleFileUpload(e, 'gate_pass')}
                accept=".pdf,.jpg,.jpeg,.png"
                className="hidden"
                disabled={uploading}
              />
              <span className={`inline-flex items-center px-2 py-0.5 text-xs rounded ${
                uploading ? 'bg-gray-100 text-gray-400' : 'bg-blue-100 text-blue-700 hover:bg-blue-200'
              }`}>
                {uploading ? 'Uploading...' : '+ Upload'}
              </span>
            </label>
          )}
        </div>

        <div className="space-y-1 max-h-32 overflow-y-auto">
          {gatePassDocs.length === 0 ? (
            <p className="text-xs text-gray-400 italic">No documents</p>
          ) : (
            gatePassDocs.map((docItem, index) => (
              <div key={index} className="flex items-center justify-between p-1.5 rounded bg-gray-50 text-xs">
                <a href={docItem.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline truncate flex-1">
                  {docItem.fileName}
                </a>
                {canManage && (
                  <button onClick={() => handleDeleteDocument(docItem, 'gate_pass')} className="text-red-500 hover:text-red-700 ml-1">
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"/>
                    </svg>
                  </button>
                )}
              </div>
            ))
          )}
        </div>
        <p className="text-xs text-gray-400 mt-1">PDF, JPG, PNG (Max 5MB)</p>
      </div>

      {/* Dispatch Documents - Admin/Dispatcher only */}
      {showDispatchDocs && (
        <div className="border border-purple-200 rounded-lg p-3 bg-purple-50">
          <div className="flex items-center justify-between mb-2">
            <h5 className="text-xs font-semibold text-purple-700 flex items-center gap-1">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/>
              </svg>
              Dispatch Docs
            </h5>
            {canManage && (
              <label className="cursor-pointer">
                <input
                  type="file"
                  onChange={(e) => handleFileUpload(e, 'dispatch')}
                  accept=".pdf,.jpg,.jpeg,.png"
                  className="hidden"
                  disabled={uploadingDispatch}
                />
                <span className={`inline-flex items-center px-2 py-0.5 text-xs rounded ${
                  uploadingDispatch ? 'bg-gray-100 text-gray-400' : 'bg-purple-100 text-purple-700 hover:bg-purple-200'
                }`}>
                  {uploadingDispatch ? 'Uploading...' : '+ Upload'}
                </span>
              </label>
            )}
          </div>

          <div className="space-y-1 max-h-32 overflow-y-auto">
            {dispatchDocs.length === 0 ? (
              <p className="text-xs text-purple-400 italic">No documents</p>
            ) : (
              dispatchDocs.map((docItem, index) => (
                <div key={index} className="flex items-center justify-between p-1.5 rounded bg-white text-xs">
                  <a href={docItem.url} target="_blank" rel="noopener noreferrer" className="text-purple-600 hover:underline truncate flex-1">
                    {docItem.fileName}
                  </a>
                  {canManage && (
                    <button onClick={() => handleDeleteDocument(docItem, 'dispatch')} className="text-red-500 hover:text-red-700 ml-1">
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"/>
                      </svg>
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
          <p className="text-xs text-purple-400 mt-1">🔒 Admin only</p>
        </div>
      )}
    </div>
  );
};

export default LoadDocuments;