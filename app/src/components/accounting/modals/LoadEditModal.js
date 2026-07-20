// src/components/accounting/modals/LoadEditModal.js
// ENHANCED: Inline editing for locations, vehicles, and dispatch document upload

import React, { useState, useEffect, useRef } from 'react';
import { Timestamp, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../../../firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { updateLoad } from '../services/accountingService';
import { logFieldChangeAudit } from '../services/auditService';

export default function LoadEditModal({
  isOpen,
  onClose,
  editingLoad,
  loadForm,
  setLoadForm,
  canAmendAccounting,
  loggedInUser,
  applicationTimeZone,
  isLoadingTimeZone,
  updateLoadInList
}) {
  const [companies, setCompanies] = useState([]);
  const [isLoadingCompanies, setIsLoadingCompanies] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('general'); // 'general', 'locations', 'vehicles', 'documents'
  
  // File upload state
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const fileInputRef = useRef(null);
const [canEditPaymentTermsLocal, setCanEditPaymentTermsLocal] = useState(false);

  useEffect(() => {
    const fetchPaymentPermission = async () => {
      if (!loggedInUser?.tenantId) {
        const userRoles = Array.isArray(loggedInUser?.role) ? loggedInUser.role : [loggedInUser?.role].filter(Boolean);
        setCanEditPaymentTermsLocal(userRoles.includes('Super Admin') || userRoles.includes('Main Admin'));
        return;
      }

      try {
        const companiesQuery = query(
          collection(db, 'companies'),
          where('tenantId', '==', loggedInUser.tenantId)
        );
        const snapshot = await getDocs(companiesQuery);
        
        if (!snapshot.empty) {
          const companyData = snapshot.docs[0].data();
          const allowedRoles = companyData?.permissions?.canEditPaymentTerms || ['Super Admin'];
          const userRoles = Array.isArray(loggedInUser.role) ? loggedInUser.role : [loggedInUser.role].filter(Boolean);
          setCanEditPaymentTermsLocal(userRoles.some(role => allowedRoles.includes(role)));
        }
      } catch (error) {
        console.error('Error fetching payment terms permission:', error);
      }
    };

    if (isOpen) {
      fetchPaymentPermission();
    }
  }, [isOpen, loggedInUser]);

  // Initialize form with all editable fields
  useEffect(() => {
    if (isOpen && editingLoad) {
      setLoadForm(prev => ({
        ...prev,
        // General
        amount: editingLoad.amount || '',
                amount: editingLoad.amount || '',
        adminNotes: editingLoad.adminNotes || '',
        companyName: editingLoad.companyName || '',
        companyId: editingLoad.companyId || null,
        // Pickup
        pickupLocationName: editingLoad.pickupLocationName || '',
        pickupLocation: editingLoad.pickupLocation || '',
        pickupInstructions: editingLoad.pickupInstructions || '',
        pickupContactPhone: editingLoad.pickupContactPhone || '',
        // Delivery
        deliveryLocationName: editingLoad.deliveryLocationName || '',
        deliveryLocation: editingLoad.deliveryLocation || '',
        deliveryInstructions: editingLoad.deliveryInstructions || '',
        deliveryContactPhone: editingLoad.deliveryContactPhone || '',
        // Vehicles
        vehicles: editingLoad.vehicles || [],
        // Documents
        dispatchDocuments: editingLoad.dispatchDocuments || []
      }));
    }
  }, [isOpen, editingLoad, setLoadForm]);

  // Fetch companies on mount
  useEffect(() => {
    const fetchCompanies = async () => {
      if (!loggedInUser || !loggedInUser.tenantId) {
        setIsLoadingCompanies(false);
        return;
      }

      try {
        setIsLoadingCompanies(true);
        const companiesQuery = query(
  collection(db, "companies"),
  where("tenantId", "==", loggedInUser.tenantId),
  where("active", "==", true)
);

const snapshot = await getDocs(companiesQuery);
let companyList = snapshot.docs.map(doc => ({
  id: doc.id,
  ...doc.data()
}));

// Filter companies for non-Super Admin users
const userRoles = Array.isArray(loggedInUser.role) ? loggedInUser.role : [loggedInUser.role].filter(Boolean);
const isSuper = userRoles.includes('Super Admin');
const userParentCompanyIds = loggedInUser.assignedParentCompanyIds || [];

if (!isSuper && userParentCompanyIds.length > 0) {
  companyList = companyList.filter(company => {
    if (userParentCompanyIds.includes(company.id)) return true;
    if (company.parentCompanyId && userParentCompanyIds.includes(company.parentCompanyId)) return true;
    return false;
  });
}

setCompanies(companyList);
      } catch (error) {
        console.error("Error fetching companies:", error);
        setCompanies([]);
      } finally {
        setIsLoadingCompanies(false);
      }
    };

    if (isOpen) {
      fetchCompanies();
    }
  }, [isOpen, loggedInUser]);

  // ============================================================================
  // VEHICLE HANDLERS
  // ============================================================================

  const handleVehicleChange = (index, field, value) => {
    setLoadForm(prev => {
      const updatedVehicles = [...(prev.vehicles || [])];
      updatedVehicles[index] = {
        ...updatedVehicles[index],
        [field]: value
      };
      return { ...prev, vehicles: updatedVehicles };
    });
  };

  const handleAddVehicle = () => {
    setLoadForm(prev => ({
      ...prev,
      vehicles: [
        ...(prev.vehicles || []),
        {
          year: '',
          make: '',
          model: '',
          vin: '',
          color: '',
          type: '',
          condition: 'Running'
        }
      ]
    }));
  };

  const handleRemoveVehicle = (index) => {
    if (!window.confirm('Are you sure you want to remove this vehicle?')) return;
    
    setLoadForm(prev => ({
      ...prev,
      vehicles: prev.vehicles.filter((_, i) => i !== index)
    }));
  };

  // ============================================================================
  // DOCUMENT UPLOAD HANDLERS
  // ============================================================================

  const handleFileSelect = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Validate file type
    const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/gif'];
    if (!allowedTypes.includes(file.type)) {
      setUploadError('Please upload a PDF or image file (JPEG, PNG, GIF)');
      return;
    }

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      setUploadError('File size must be less than 10MB');
      return;
    }

    setIsUploading(true);
    setUploadError(null);

    try {
      const timestamp = Date.now();
      const sanitizedFileName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
const storagePath = `loads/${editingLoad.docId}/documents/dispatch/${timestamp}-${sanitizedFileName}`;
      
      const storageRef = ref(storage, storagePath);
      await uploadBytes(storageRef, file);
      const downloadUrl = await getDownloadURL(storageRef);

      const newDocument = {
        fileName: file.name,
        fileType: file.type,
        storagePath: storagePath,
        url: downloadUrl,
        uploadedAt: new Date().toISOString(),
        uploadedBy: loggedInUser.email,
        uploadedById: loggedInUser.uid,
        documentType: 'dispatch',
        source: 'manual_upload'
      };

      setLoadForm(prev => ({
        ...prev,
        dispatchDocuments: [...(prev.dispatchDocuments || []), newDocument]
      }));

      // Clear file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }

      console.log('✅ Document uploaded successfully:', newDocument);
    } catch (error) {
      console.error('❌ Error uploading document:', error);
      setUploadError('Failed to upload document: ' + error.message);
    } finally {
      setIsUploading(false);
    }
  };

  const handleRemoveDocument = (index) => {
    if (!window.confirm('Are you sure you want to remove this document?')) return;
    
    setLoadForm(prev => ({
      ...prev,
      dispatchDocuments: prev.dispatchDocuments.filter((_, i) => i !== index)
    }));
  };

  // ============================================================================
  // SAVE HANDLER
  // ============================================================================

  const handleSaveLoadEdit = async (e) => {
    e.preventDefault();
    
    if (!canAmendAccounting || !editingLoad) {
      alert("You do not have permission or no load is selected for editing.");
      return;
    }
    
    if (isLoadingTimeZone || !applicationTimeZone) {
      alert("Timezone information is still loading. Please try again.");
      return;
    }

    setIsSaving(true);

    try {
      const dataToUpdate = {
        // General
                load_id: loadForm.load_id || '',
        amount: Number(loadForm.amount || 0),
        adminNotes: loadForm.adminNotes || '',
        companyName: loadForm.companyName || '',
        companyId: loadForm.companyId || null,
        // Pickup
        pickupLocationName: loadForm.pickupLocationName || '',
        pickupLocation: loadForm.pickupLocation || '',
        pickupInstructions: loadForm.pickupInstructions || '',
        pickupContactPhone: loadForm.pickupContactPhone || '',
        // Delivery
        deliveryLocationName: loadForm.deliveryLocationName || '',
        deliveryLocation: loadForm.deliveryLocation || '',
        deliveryInstructions: loadForm.deliveryInstructions || '',
        deliveryContactPhone: loadForm.deliveryContactPhone || '',
        // Vehicles
        vehicles: loadForm.vehicles || [],
        // Documents
        dispatchDocuments: loadForm.dispatchDocuments || []
      };

      // Update in Firestore
      await updateLoad(editingLoad.docId, dataToUpdate);

      // Update local state
      if (updateLoadInList) {
        updateLoadInList(editingLoad.docId, dataToUpdate);
      }

      // Log audit for key fields
const fieldsToAudit = ['load_id', 'amount', 'companyName', 'pickupLocation', 'deliveryLocation'];
      for (const field of fieldsToAudit) {
        const oldValue = editingLoad[field];
        const newValue = dataToUpdate[field];
        
        if (String(oldValue || '') !== String(newValue || '')) {
          await logFieldChangeAudit({
            user: loggedInUser,
            loadDocId: editingLoad.docId,
            loadId: editingLoad.load_id,
            field,
            oldValue,
            newValue
          });
        }
      }
      
      alert("Load updated successfully!");
      onClose();
    } catch (err) {
      console.error("❌ Error updating load:", err);
      alert("Failed to update load: " + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen || !editingLoad) return null;

  // ============================================================================
  // TAB CONTENT RENDERERS
  // ============================================================================

  const renderGeneralTab = () => (
    <div className="space-y-4">
      {/* Load ID */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Load ID</label>
        <input
          type="text"
          value={loadForm.load_id || ''}
          onChange={(e) => setLoadForm(prev => ({ ...prev, load_id: e.target.value }))}
          className="w-full py-2 px-3 border border-gray-300 rounded-md text-sm focus:ring-blue-500 focus:border-blue-500"
          placeholder="Enter Load ID"
        />
      </div>

      {/* Company Name */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Company Name
          {!canEditPaymentTermsLocal && <span className="text-xs text-red-500 ml-2">🔒 Read-only</span>}
        </label>
        {isLoadingCompanies ? (
          <div className="py-2 px-3 border rounded-md bg-gray-50 text-sm text-gray-500">Loading...</div>
        ) : (
          <select
            value={
              loadForm.companyId ||
              companies.find(
                c => (c.name || '').toLowerCase().trim() === (loadForm.companyName || '').toLowerCase().trim()
              )?.id ||
              ''
            }
            onChange={(e) => {
              const selected = companies.find(c => c.id === e.target.value);
              setLoadForm(prev => ({
                ...prev,
                companyName: selected ? selected.name : '',
                companyId: selected ? selected.id : null
              }));
            }}
            disabled={!canEditPaymentTermsLocal}
            className={`w-full py-2 px-3 border border-gray-300 rounded-md text-sm focus:ring-blue-500 focus:border-blue-500 ${!canEditPaymentTermsLocal ? 'bg-gray-100 cursor-not-allowed' : ''}`}
          >
            <option value="">Select Company</option>
            {[...companies]
              .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
              .map(company => (
                <option key={company.id} value={company.id}>
                  {company.parentCompanyId
                    ? `↳ ${company.name} (subdivision${company.parentCompanyName ? ` of ${company.parentCompanyName}` : ''})`
                    : company.name}
                </option>
              ))}
          </select>
        )}
      </div>

    {/* Load Amount */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Load Amount ($)
          {!canEditPaymentTermsLocal && <span className="text-xs text-red-500 ml-2">🔒 Read-only</span>}
        </label>
        <input
          type="number"
          step="0.01"
          value={loadForm.amount || ''}
          onChange={(e) => setLoadForm(prev => ({ ...prev, amount: e.target.value }))}
          disabled={!canEditPaymentTermsLocal}
          className={`w-full py-2 px-3 border border-gray-300 rounded-md text-sm focus:ring-blue-500 focus:border-blue-500 ${!canEditPaymentTermsLocal ? 'bg-gray-100 cursor-not-allowed' : ''}`}
        />
      </div>
      {/* Admin Notes */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Admin/Accounting Notes</label>
        <textarea
          value={loadForm.adminNotes || ''}
          onChange={(e) => setLoadForm(prev => ({ ...prev, adminNotes: e.target.value }))}
          rows="3"
          className="w-full py-2 px-3 border border-gray-300 rounded-md text-sm focus:ring-blue-500 focus:border-blue-500"
        />
      </div>
    </div>
  );

  const renderLocationsTab = () => (
    <div className="space-y-6">
      {/* PICKUP SECTION */}
      <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
        <h4 className="text-sm font-semibold text-blue-800 mb-3 flex items-center gap-2">
          📍 Pickup Location
        </h4>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Location Name</label>
            <input
              type="text"
              value={loadForm.pickupLocationName || ''}
              onChange={(e) => setLoadForm(prev => ({ ...prev, pickupLocationName: e.target.value }))}
              placeholder="e.g., ABC Auto Auction"
              className="w-full py-2 px-3 border border-gray-300 rounded-md text-sm focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Contact Phone</label>
            <input
              type="tel"
              value={loadForm.pickupContactPhone || ''}
              onChange={(e) => setLoadForm(prev => ({ ...prev, pickupContactPhone: e.target.value }))}
              placeholder="(555) 123-4567"
              className="w-full py-2 px-3 border border-gray-300 rounded-md text-sm focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>
        
        <div className="mt-3">
          <label className="block text-xs font-medium text-gray-700 mb-1">Full Address</label>
          <input
            type="text"
            value={loadForm.pickupLocation || ''}
            onChange={(e) => setLoadForm(prev => ({ ...prev, pickupLocation: e.target.value }))}
            placeholder="123 Main St, City, State ZIP"
            className="w-full py-2 px-3 border border-gray-300 rounded-md text-sm focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
        
        <div className="mt-3">
          <label className="block text-xs font-medium text-gray-700 mb-1">Pickup Instructions</label>
          <textarea
            value={loadForm.pickupInstructions || ''}
            onChange={(e) => setLoadForm(prev => ({ ...prev, pickupInstructions: e.target.value }))}
            rows="2"
            placeholder="Special instructions for pickup..."
            className="w-full py-2 px-3 border border-gray-300 rounded-md text-sm focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
      </div>

      {/* DELIVERY SECTION */}
      <div className="bg-green-50 p-4 rounded-lg border border-green-200">
        <h4 className="text-sm font-semibold text-green-800 mb-3 flex items-center gap-2">
          🎯 Delivery Location
        </h4>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Location Name</label>
            <input
              type="text"
              value={loadForm.deliveryLocationName || ''}
              onChange={(e) => setLoadForm(prev => ({ ...prev, deliveryLocationName: e.target.value }))}
              placeholder="e.g., Customer Residence"
              className="w-full py-2 px-3 border border-gray-300 rounded-md text-sm focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Contact Phone</label>
            <input
              type="tel"
              value={loadForm.deliveryContactPhone || ''}
              onChange={(e) => setLoadForm(prev => ({ ...prev, deliveryContactPhone: e.target.value }))}
              placeholder="(555) 123-4567"
              className="w-full py-2 px-3 border border-gray-300 rounded-md text-sm focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>
        
        <div className="mt-3">
          <label className="block text-xs font-medium text-gray-700 mb-1">Full Address</label>
          <input
            type="text"
            value={loadForm.deliveryLocation || ''}
            onChange={(e) => setLoadForm(prev => ({ ...prev, deliveryLocation: e.target.value }))}
            placeholder="456 Oak Ave, City, State ZIP"
            className="w-full py-2 px-3 border border-gray-300 rounded-md text-sm focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
        
        <div className="mt-3">
          <label className="block text-xs font-medium text-gray-700 mb-1">Delivery Instructions</label>
          <textarea
            value={loadForm.deliveryInstructions || ''}
            onChange={(e) => setLoadForm(prev => ({ ...prev, deliveryInstructions: e.target.value }))}
            rows="2"
            placeholder="Special instructions for delivery..."
            className="w-full py-2 px-3 border border-gray-300 rounded-md text-sm focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
      </div>
    </div>
  );

  const renderVehiclesTab = () => (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h4 className="text-sm font-semibold text-gray-700">
          🚗 Vehicles ({loadForm.vehicles?.length || 0})
        </h4>
        <button
          type="button"
          onClick={handleAddVehicle}
          className="inline-flex items-center gap-1 px-3 py-1.5 bg-green-600 text-white text-xs font-medium rounded-md hover:bg-green-700"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Vehicle
        </button>
      </div>

      {(!loadForm.vehicles || loadForm.vehicles.length === 0) ? (
        <div className="text-center py-8 bg-gray-50 rounded-lg border border-dashed border-gray-300">
          <p className="text-gray-500 text-sm">No vehicles added yet</p>
          <button
            type="button"
            onClick={handleAddVehicle}
            className="mt-2 text-blue-600 hover:text-blue-800 text-sm font-medium"
          >
            + Add first vehicle
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {loadForm.vehicles.map((vehicle, index) => (
            <div key={index} className="bg-gray-50 p-4 rounded-lg border border-gray-200 relative">
              <div className="absolute top-2 right-2">
                <button
                  type="button"
                  onClick={() => handleRemoveVehicle(index)}
                  className="text-red-500 hover:text-red-700 p-1"
                  title="Remove vehicle"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
              
              <div className="text-xs font-semibold text-gray-500 mb-3">Vehicle #{index + 1}</div>
              
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Year</label>
                  <input
                    type="text"
                    value={vehicle.year || ''}
                    onChange={(e) => handleVehicleChange(index, 'year', e.target.value)}
                    placeholder="2024"
                    className="w-full py-1.5 px-2 border border-gray-300 rounded text-sm"
                  />
                </div>
                
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Make</label>
                  <input
                    type="text"
                    value={vehicle.make || ''}
                    onChange={(e) => handleVehicleChange(index, 'make', e.target.value)}
                    placeholder="Toyota"
                    className="w-full py-1.5 px-2 border border-gray-300 rounded text-sm"
                  />
                </div>
                
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Model</label>
                  <input
                    type="text"
                    value={vehicle.model || ''}
                    onChange={(e) => handleVehicleChange(index, 'model', e.target.value)}
                    placeholder="Camry"
                    className="w-full py-1.5 px-2 border border-gray-300 rounded text-sm"
                  />
                </div>
                
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Color</label>
                  <input
                    type="text"
                    value={vehicle.color || ''}
                    onChange={(e) => handleVehicleChange(index, 'color', e.target.value)}
                    placeholder="Black"
                    className="w-full py-1.5 px-2 border border-gray-300 rounded text-sm"
                  />
                </div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
                <div className="md:col-span-1">
                  <label className="block text-xs font-medium text-gray-600 mb-1">VIN</label>
                  <input
                    type="text"
                    value={vehicle.vin || ''}
                    onChange={(e) => handleVehicleChange(index, 'vin', e.target.value.toUpperCase())}
                    placeholder="1HGBH41JXMN109186"
                    maxLength={17}
                    className="w-full py-1.5 px-2 border border-gray-300 rounded text-sm font-mono"
                  />
                </div>
                
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Type</label>
                  <select
                    value={vehicle.type || ''}
                    onChange={(e) => handleVehicleChange(index, 'type', e.target.value)}
                    className="w-full py-1.5 px-2 border border-gray-300 rounded text-sm"
                  >
                    <option value="">Select Type</option>
                    <option value="Sedan">Sedan</option>
                    <option value="SUV">SUV</option>
                    <option value="Truck">Truck</option>
                    <option value="Van">Van</option>
                    <option value="Coupe">Coupe</option>
                    <option value="Motorcycle">Motorcycle</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Condition</label>
                  <select
                    value={vehicle.condition || 'Running'}
                    onChange={(e) => handleVehicleChange(index, 'condition', e.target.value)}
                    className="w-full py-1.5 px-2 border border-gray-300 rounded text-sm"
                  >
                    <option value="Running">Running</option>
                    <option value="Non-Running">Non-Running</option>
                    <option value="Enclosed">Enclosed Only</option>
                  </select>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const renderDocumentsTab = () => (
    <div className="space-y-4">
      <h4 className="text-sm font-semibold text-gray-700">📄 Dispatch Documents</h4>
      
      {/* Upload Section */}
      <div className="bg-gray-50 p-4 rounded-lg border-2 border-dashed border-gray-300">
        <div className="text-center">
          <svg className="mx-auto h-10 w-10 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
          </svg>
          <p className="mt-2 text-sm text-gray-600">Upload dispatch sheet or related documents</p>
          <p className="text-xs text-gray-500">PDF, JPEG, PNG, GIF (max 10MB)</p>
          
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,.gif"
            onChange={handleFileSelect}
            className="hidden"
            id="dispatch-file-upload"
          />
          
          <label
            htmlFor="dispatch-file-upload"
            className={`mt-3 inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium cursor-pointer transition-colors ${
              isUploading 
                ? 'bg-gray-300 text-gray-500 cursor-not-allowed' 
                : 'bg-blue-600 text-white hover:bg-blue-700'
            }`}
          >
            {isUploading ? (
              <>
                <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Uploading...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Select File
              </>
            )}
          </label>
        </div>
        
        {uploadError && (
          <p className="mt-2 text-sm text-red-600 text-center">{uploadError}</p>
        )}
      </div>

      {/* Existing Documents List */}
      {loadForm.dispatchDocuments && loadForm.dispatchDocuments.length > 0 ? (
        <div className="space-y-2">
          <p className="text-xs font-medium text-gray-600">
            Attached Documents ({loadForm.dispatchDocuments.length})
          </p>
          
          {loadForm.dispatchDocuments.map((doc, index) => (
            <div 
              key={index} 
              className="flex items-center justify-between bg-white p-3 rounded-lg border border-gray-200"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex-shrink-0">
                  {doc.fileType?.includes('pdf') ? (
                    <svg className="w-8 h-8 text-red-500" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
                    </svg>
                  ) : (
                    <svg className="w-8 h-8 text-blue-500" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clipRule="evenodd" />
                    </svg>
                  )}
                </div>
                
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{doc.fileName}</p>
                  <p className="text-xs text-gray-500">
                    {doc.source === 'manual_upload' ? 'Manually uploaded' : 'Auto-attached'} 
                    {doc.uploadedBy && ` by ${doc.uploadedBy}`}
                  </p>
                </div>
              </div>
              
              <div className="flex items-center gap-2 flex-shrink-0">
                <a
                  href={doc.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:text-blue-800 text-xs font-medium"
                >
                  View
                </a>
                <button
                  type="button"
                  onClick={() => handleRemoveDocument(index)}
                  className="text-red-500 hover:text-red-700 p-1"
                  title="Remove document"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-gray-500 text-center py-4">No documents attached</p>
      )}
    </div>
  );

  // ============================================================================
  // MAIN RENDER
  // ============================================================================

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60 p-4 overflow-y-auto">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl my-8 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex-shrink-0">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-semibold text-gray-800">
              Edit Load: {editingLoad.load_id}
            </h3>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          
          {/* Tabs */}
          <div className="flex gap-1 mt-4">
            {[
              { id: 'general', label: 'General', icon: '⚙️' },
              { id: 'locations', label: 'Locations', icon: '📍' },
              { id: 'vehicles', label: 'Vehicles', icon: '🚗' },
              { id: 'documents', label: 'Documents', icon: '📄' }
            ].map(tab => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
                  activeTab === tab.id
                    ? 'bg-blue-100 text-blue-700 border-b-2 border-blue-600'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                {tab.icon} {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <form onSubmit={handleSaveLoadEdit} className="flex flex-col flex-1 overflow-hidden">
          <div className="px-6 py-4 overflow-y-auto flex-1">
            {activeTab === 'general' && renderGeneralTab()}
            {activeTab === 'locations' && renderLocationsTab()}
            {activeTab === 'vehicles' && renderVehiclesTab()}
            {activeTab === 'documents' && renderDocumentsTab()}
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3 flex-shrink-0 bg-gray-50">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-md text-sm font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving || isLoadingTimeZone || isUploading}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-sm font-medium disabled:bg-blue-400 flex items-center gap-2"
            >
              {isSaving ? (
                <>
                  <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Saving...
                </>
              ) : (
                'Save Changes'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}