// src/components/accounting/components/LoadDetailsRow.js
// COMPLETE VERSION WITH EMAIL INPUT + INCLUDE BOL CHECKBOX + INLINE EDITING + ACTUAL DATE EDITING

import React, { useState, useEffect, useRef } from 'react';
import { doc, getDoc, updateDoc, serverTimestamp, Timestamp, collection, query, where, getDocs } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../../../firebase';
import { formatTimestampInAppZone } from '../utils/dateFormatters';
import { formatCurrency } from '../utils/loadHelpers';
import { detectCommodityType, hasCOD } from '../utils/commodityDetection';
import { COMMODITY_TYPES, DATE_FORMATS } from '../constants/accountingConstants';
import { PAYMENT_TERMS, PAYMENT_METHODS } from '../../loads/utils/constants';
import { logAudit } from '../services/auditService';

// ============================================================================
// CONFIRMATION MODAL COMPONENT
// ============================================================================
const ConfirmActualDateModal = ({ 
  isOpen, 
  onClose, 
  onConfirm, 
  dateType,
  oldValue,
  newValue,
  isProcessing,
  applicationTimeZone 
}) => {
  const [isConfirmed, setIsConfirmed] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setIsConfirmed(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const formatDateDisplay = (date) => {
    if (!date) return 'N/A';
    const d = date instanceof Date ? date : new Date(date);
    return d.toLocaleString('en-US', {
      timeZone: applicationTimeZone || 'America/New_York',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 overflow-hidden">
        {/* Header */}
        <div className="bg-yellow-50 border-b border-yellow-200 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-yellow-100 rounded-full flex items-center justify-center">
              <svg className="w-6 h-6 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">
                Confirm Actual {dateType === 'pickup' ? 'Pickup' : 'Delivery'} Date Change
              </h3>
              <p className="text-sm text-gray-600">This action will be logged in the audit trail</p>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="px-6 py-4 space-y-4">
          <div className="bg-gray-50 rounded-lg p-4 space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-500">Previous Value:</span>
              <span className="text-sm font-medium text-gray-700">
                {formatDateDisplay(oldValue)}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-500">New Value:</span>
              <span className="text-sm font-medium text-blue-700">
                {formatDateDisplay(newValue)}
              </span>
            </div>
          </div>

          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={isConfirmed}
                onChange={(e) => setIsConfirmed(e.target.checked)}
                className="mt-1 w-4 h-4 text-red-600 rounded focus:ring-red-500"
              />
              <span className="text-sm text-red-800">
                <strong>I confirm</strong> that this actual {dateType} date/time is accurate and reflects the true {dateType} time for this load. I understand this change will be permanently recorded in the audit log.
              </span>
            </label>
          </div>
        </div>

        {/* Footer */}
        <div className="bg-gray-50 border-t border-gray-200 px-6 py-4 flex justify-end gap-3">
          <button
            onClick={onClose}
            disabled={isProcessing}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={!isConfirmed || isProcessing}
            className={`px-4 py-2 text-sm font-medium text-white rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 ${
              isConfirmed && !isProcessing
                ? 'bg-blue-600 hover:bg-blue-700'
                : 'bg-gray-400 cursor-not-allowed'
            }`}
          >
            {isProcessing ? (
              <span className="flex items-center gap-2">
                <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Saving...
              </span>
            ) : (
              'Confirm & Save'
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// INLINE EDITABLE DATETIME COMPONENT (with confirmation)
// ============================================================================
const InlineEditDateTime = ({ 
  value, 
  onSave, 
  placeholder = 'Click to set',
  displayClassName = '',
  disabled = false,
  applicationTimeZone,
  dateType, // 'pickup' or 'delivery'
  loadId,
  loggedInUser
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [pendingValue, setPendingValue] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const inputRef = useRef(null);

  // Convert Firestore timestamp to datetime-local format
  const toDateTimeLocal = (timestamp) => {
    if (!timestamp) return '';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    // Format for datetime-local input (YYYY-MM-DDTHH:mm)
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  };

  // Format for display
  const formatDisplay = (timestamp) => {
    if (!timestamp) return null;
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleString('en-US', {
      timeZone: applicationTimeZone || 'America/New_York',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  };

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isEditing]);

  const handleDoubleClick = () => {
    if (disabled) return;
    setEditValue(toDateTimeLocal(value));
    setIsEditing(true);
  };

  const handleSaveClick = () => {
    if (!editValue) {
      setIsEditing(false);
      return;
    }

    const newDate = new Date(editValue);
    const oldDate = value ? (value.toDate ? value.toDate() : new Date(value)) : null;

    // Check if actually changed
    if (oldDate && newDate.getTime() === oldDate.getTime()) {
      setIsEditing(false);
      return;
    }

    // Show confirmation modal
    setPendingValue(newDate);
    setShowConfirmModal(true);
  };

  const handleConfirm = async () => {
    setIsProcessing(true);
    try {
      await onSave(pendingValue, value);
      setIsEditing(false);
      setShowConfirmModal(false);
      setPendingValue(null);
    } catch (error) {
      console.error('Error saving:', error);
      alert('Failed to save: ' + error.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCancel = () => {
    setShowConfirmModal(false);
    setPendingValue(null);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSaveClick();
    }
    if (e.key === 'Escape') {
      setEditValue('');
      setIsEditing(false);
    }
  };

  if (isEditing) {
    return (
      <>
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="datetime-local"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={handleKeyDown}
            className="py-1 px-2 border-2 border-blue-500 rounded text-xs focus:outline-none focus:ring-2 focus:ring-blue-300"
          />
          <button
            onClick={handleSaveClick}
            className="px-2 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700"
          >
            Save
          </button>
          <button
            onClick={() => setIsEditing(false)}
            className="px-2 py-1 bg-gray-300 text-gray-700 rounded text-xs hover:bg-gray-400"
          >
            Cancel
          </button>
        </div>

        <ConfirmActualDateModal
          isOpen={showConfirmModal}
          onClose={handleCancel}
          onConfirm={handleConfirm}
          dateType={dateType}
          oldValue={value ? (value.toDate ? value.toDate() : new Date(value)) : null}
          newValue={pendingValue}
          isProcessing={isProcessing}
          applicationTimeZone={applicationTimeZone}
        />
      </>
    );
  }

  const displayValue = formatDisplay(value);

  return (
    <span
      onDoubleClick={handleDoubleClick}
      className={`cursor-pointer hover:bg-yellow-100 hover:border-yellow-300 border border-transparent rounded px-1 py-0.5 transition-colors ${displayClassName} ${disabled ? 'cursor-not-allowed opacity-60' : ''}`}
      title={disabled ? 'You do not have permission to edit' : 'Double-click to edit actual date/time'}
    >
      {displayValue || <span className="text-gray-400 italic">{placeholder}</span>}
    </span>
  );
};

// ============================================================================
// INLINE EDITABLE FIELD COMPONENT
// ============================================================================
const InlineEditField = ({ 
  value, 
  onSave, 
  type = 'text', 
  placeholder = 'Click to edit',
  className = '',
  displayClassName = '',
  multiline = false,
  disabled = false
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(value || '');
  const [isSaving, setIsSaving] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    setEditValue(value || '');
  }, [value]);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleDoubleClick = () => {
    if (disabled) return;
    setIsEditing(true);
    setEditValue(value || '');
  };

  const handleSave = async () => {
    if (editValue === value) {
      setIsEditing(false);
      return;
    }

    setIsSaving(true);
    try {
      await onSave(editValue);
      setIsEditing(false);
    } catch (error) {
      console.error('Error saving:', error);
      alert('Failed to save: ' + error.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !multiline) {
      e.preventDefault();
      handleSave();
    }
    if (e.key === 'Escape') {
      setEditValue(value || '');
      setIsEditing(false);
    }
  };

  const handleBlur = () => {
    handleSave();
  };

  if (isEditing) {
    if (multiline) {
      return (
        <div className="relative">
          <textarea
            ref={inputRef}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={handleBlur}
            disabled={isSaving}
            rows={3}
            className={`w-full py-1 px-2 border-2 border-blue-500 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 ${className}`}
            placeholder={placeholder}
          />
          {isSaving && (
            <div className="absolute right-2 top-2">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
            </div>
          )}
        </div>
      );
    }

    return (
      <div className="relative inline-block w-full">
        <input
          ref={inputRef}
          type={type}
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          disabled={isSaving}
          className={`w-full py-1 px-2 border-2 border-blue-500 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 ${className}`}
          placeholder={placeholder}
        />
        {isSaving && (
          <div className="absolute right-2 top-1/2 transform -translate-y-1/2">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
          </div>
        )}
      </div>
    );
  }

  return (
    <span
      onDoubleClick={handleDoubleClick}
      className={`cursor-pointer hover:bg-yellow-100 hover:border-yellow-300 border border-transparent rounded px-1 py-0.5 transition-colors ${displayClassName} ${disabled ? 'cursor-not-allowed opacity-60' : ''}`}
      title={disabled ? 'Editing disabled' : 'Double-click to edit'}
    >
      {value || <span className="text-gray-400 italic">{placeholder}</span>}
    </span>
  );
};

// ============================================================================
// INLINE EDITABLE SELECT COMPONENT
// ============================================================================
const InlineEditSelect = ({ 
  value, 
  options, 
  onSave, 
  displayClassName = '',
  disabled = false
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const selectRef = useRef(null);

  useEffect(() => {
    if (isEditing && selectRef.current) {
      selectRef.current.focus();
    }
  }, [isEditing]);

  const handleDoubleClick = () => {
    if (disabled) return;
    setIsEditing(true);
  };

  const handleChange = async (e) => {
    const newValue = e.target.value;
    if (newValue === value) {
      setIsEditing(false);
      return;
    }

    setIsSaving(true);
    try {
      await onSave(newValue);
      setIsEditing(false);
    } catch (error) {
      console.error('Error saving:', error);
      alert('Failed to save: ' + error.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleBlur = () => {
    setIsEditing(false);
  };

  if (isEditing) {
    return (
      <div className="relative inline-block">
        <select
          ref={selectRef}
          value={value || ''}
          onChange={handleChange}
          onBlur={handleBlur}
          disabled={isSaving}
          className="py-1 px-2 border-2 border-blue-500 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
        >
          {options.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        {isSaving && (
          <div className="absolute right-6 top-1/2 transform -translate-y-1/2">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
          </div>
        )}
      </div>
    );
  }

  const displayLabel = options.find(o => o.value === value)?.label || value || 'N/A';

  return (
    <span
      onDoubleClick={handleDoubleClick}
      className={`cursor-pointer hover:bg-yellow-100 hover:border-yellow-300 border border-transparent rounded px-1 py-0.5 transition-colors ${displayClassName} ${disabled ? 'cursor-not-allowed opacity-60' : ''}`}
      title={disabled ? 'Editing disabled' : 'Double-click to edit'}
    >
      {displayLabel}
    </span>
  );
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================
export default function LoadDetailsRow({
  load,
  drivers,
  brokers = [],
  loggedInUser,
  applicationTimeZone,
  canAmendAccounting,
  onPayTermsChange,
  onPaymentMethodChange,
  onGenerateBOL,
  onGenerateInvoice,
  onPaymentStatusChange,
  onEmailInvoice,
  updateLoadInList
}) {
  const [showPaymentMenu, setShowPaymentMenu] = useState(false);
  const [paymentNote, setPaymentNote] = useState(load.paymentNote || '');
  const [isSavingPayment, setIsSavingPayment] = useState(false);
  const [isEmailingInvoice, setIsEmailingInvoice] = useState(false);
  const [brokerEmail, setBrokerEmail] = useState('');
  const [isLoadingEmail, setIsLoadingEmail] = useState(false);
  const [includeBOL, setIncludeBOL] = useState(true);
  const [includeInvoice, setIncludeInvoice] = useState(true);

  // Document upload state
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef(null);

  // Local state for vehicles (for inline editing)
  const [localVehicles, setLocalVehicles] = useState(load.vehicles || []);

  useEffect(() => {
    setLocalVehicles(load.vehicles || []);
  }, [load.vehicles]);

  // Auto-fetch broker email on component mount
  useEffect(() => {
    const fetchBrokerEmail = async () => {
      if (load.brokerEmail) {
        setBrokerEmail(load.brokerEmail);
        return;
      }
      
      if (load.brokerId) {
        setIsLoadingEmail(true);
        try {
          const brokerDoc = await getDoc(doc(db, 'brokers', load.brokerId));
          if (brokerDoc.exists()) {
            const brokerData = brokerDoc.data();
            if (brokerData.email) {
              setBrokerEmail(brokerData.email);
            }
          }
        } catch (error) {
          console.error('Error fetching broker email:', error);
        } finally {
          setIsLoadingEmail(false);
        }
      }
    };
    
    fetchBrokerEmail();
  }, [load.brokerId, load.brokerEmail]);

 const isAdmin = (() => {
    if (!loggedInUser) return false;
    const userRoles = Array.isArray(loggedInUser.role) ? loggedInUser.role : [loggedInUser.role].filter(Boolean);
    return userRoles.includes('Admin') || userRoles.includes('Main Admin') || userRoles.includes('Super Admin');
  })();
  // Fetch tenant permission for email invoice
  const [canEmailInvoice, setCanEmailInvoice] = useState(false);
  const [isLoadingPermission, setIsLoadingPermission] = useState(true);

  useEffect(() => {
    const fetchPermission = async () => {
      if (!loggedInUser?.tenantId) {
        setCanEmailInvoice(isAdmin);
        setIsLoadingPermission(false);
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
          const allowedRoles = companyData?.permissions?.canEmailInvoice || ['Super Admin'];
          const userRoles = Array.isArray(loggedInUser.role) ? loggedInUser.role : [loggedInUser.role].filter(Boolean);
          const hasPermission = userRoles.some(role => allowedRoles.includes(role));
          setCanEmailInvoice(hasPermission);
        } else {
          setCanEmailInvoice(isAdmin);
        }
      } catch (error) {
        console.error('Error fetching email invoice permission:', error);
        setCanEmailInvoice(isAdmin);
      } finally {
        setIsLoadingPermission(false);
      }
    };

    fetchPermission();
  }, [loggedInUser, isAdmin]);

   // Fetch tenant permission for editing payment terms
  const [canEditPaymentTerms, setCanEditPaymentTerms] = useState(false);

  useEffect(() => {
    const fetchPaymentPermission = async () => {
      if (!loggedInUser?.tenantId) {
        setCanEditPaymentTerms(isAdmin);
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
          const hasPermission = userRoles.some(role => allowedRoles.includes(role));
          setCanEditPaymentTerms(hasPermission);
        } else {
          setCanEditPaymentTerms(isAdmin);
        }
      } catch (error) {
        console.error('Error fetching payment terms permission:', error);
        setCanEditPaymentTerms(isAdmin);
      }
    };

    fetchPaymentPermission();
  }, [loggedInUser, isAdmin]);
  
  const brokerObj = brokers.find(b => b.id === load.brokerId);

  // Check if user can edit actual dates (Admin or Super Admin only)
  const canEditActualDates = (() => {
    if (!loggedInUser) return false;
    const userRoles = Array.isArray(loggedInUser.role) ? loggedInUser.role : [loggedInUser.role].filter(Boolean);
    return userRoles.includes('Admin') || userRoles.includes('Main Admin') || userRoles.includes('Super Admin');
  })();

  // ============================================================================
  // INLINE SAVE HANDLERS
  // ============================================================================

  const saveField = async (field, value) => {
    console.log(`💾 Saving ${field}:`, value);
    const loadRef = doc(db, 'loads', load.docId);
    
    await updateDoc(loadRef, {
      [field]: value,
      updatedAt: serverTimestamp()
    });

    // Update local list
    updateLoadInList(load.docId, { [field]: value });
    console.log(`✅ ${field} saved successfully`);
  };

  // Save actual pickup date with audit logging
  const saveActualPickup = async (newValue, oldValue) => {
    console.log(`💾 Saving actualPU:`, newValue);
    const loadRef = doc(db, 'loads', load.docId);
    
    // Convert to Firestore Timestamp
    const timestamp = Timestamp.fromDate(newValue);
    
    await updateDoc(loadRef, {
      actualPU: timestamp,
      actualPickupTimestamp: timestamp, // Also update the alternate field name
      updatedAt: serverTimestamp()
    });

    // Log to audit
    await logAudit({
      userId: loggedInUser.uid,
      userEmail: loggedInUser.email,
      action: "ACTUAL_PICKUP_DATE_CHANGED",
      targetType: "load",
      targetId: load.docId,
      tenantId: loggedInUser.tenantId,
      details: {
        loadIdDisplay: load.load_id,
        oldValue: oldValue ? (oldValue.toDate ? oldValue.toDate().toISOString() : new Date(oldValue).toISOString()) : null,
        newValue: newValue.toISOString(),
        message: `Actual pickup date manually changed for load ${load.load_id}`,
        confirmedBy: loggedInUser.email,
        confirmedAt: new Date().toISOString()
      }
    });

    // Update local list
    updateLoadInList(load.docId, { 
      actualPU: timestamp,
      actualPickupTimestamp: timestamp 
    });
    console.log(`✅ actualPU saved successfully with audit log`);
  };

  // Save actual delivery date with audit logging
  const saveActualDelivery = async (newValue, oldValue) => {
    console.log(`💾 Saving actualDEL:`, newValue);
    const loadRef = doc(db, 'loads', load.docId);
    
    // Convert to Firestore Timestamp
    const timestamp = Timestamp.fromDate(newValue);
    
    await updateDoc(loadRef, {
      actualDEL: timestamp,
      updatedAt: serverTimestamp()
    });

    // Log to audit
    await logAudit({
      userId: loggedInUser.uid,
      userEmail: loggedInUser.email,
      action: "ACTUAL_DELIVERY_DATE_CHANGED",
      targetType: "load",
      targetId: load.docId,
      tenantId: loggedInUser.tenantId,
      details: {
        loadIdDisplay: load.load_id,
        oldValue: oldValue ? (oldValue.toDate ? oldValue.toDate().toISOString() : new Date(oldValue).toISOString()) : null,
        newValue: newValue.toISOString(),
        message: `Actual delivery date manually changed for load ${load.load_id}`,
        confirmedBy: loggedInUser.email,
        confirmedAt: new Date().toISOString()
      }
    });

    // Update local list
    updateLoadInList(load.docId, { actualDEL: timestamp });
    console.log(`✅ actualDEL saved successfully with audit log`);
  };

  const saveVehicleField = async (vehicleIndex, field, value) => {
    console.log(`💾 Saving vehicle[${vehicleIndex}].${field}:`, value);
    
    const updatedVehicles = [...localVehicles];
    updatedVehicles[vehicleIndex] = {
      ...updatedVehicles[vehicleIndex],
      [field]: value
    };
    
    setLocalVehicles(updatedVehicles);

    const loadRef = doc(db, 'loads', load.docId);
    await updateDoc(loadRef, {
      vehicles: updatedVehicles,
      updatedAt: serverTimestamp()
    });

    updateLoadInList(load.docId, { vehicles: updatedVehicles });
    console.log(`✅ Vehicle ${field} saved successfully`);
  };

  // ============================================================================
  // DOCUMENT HANDLERS
  // ============================================================================

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/gif'];
    if (!allowedTypes.includes(file.type)) {
      alert('Please upload a PDF or image file (JPEG, PNG, GIF)');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      alert('File size must be less than 10MB');
      return;
    }

    setIsUploading(true);
    try {
      const timestamp = Date.now();
      const sanitizedFileName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
      const storagePath = `loads/${load.docId}/documents/dispatch/${timestamp}-${sanitizedFileName}`;
      
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
        source: 'inline_upload'
      };

      const updatedDocuments = [...(load.dispatchDocuments || []), newDocument];
      
      const loadRef = doc(db, 'loads', load.docId);
      await updateDoc(loadRef, {
        dispatchDocuments: updatedDocuments,
        updatedAt: serverTimestamp()
      });

      updateLoadInList(load.docId, { dispatchDocuments: updatedDocuments });

      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }

      console.log('✅ Document uploaded successfully');
    } catch (error) {
      console.error('Error uploading document:', error);
      alert('Failed to upload document: ' + error.message);
    } finally {
      setIsUploading(false);
    }
  };

  const handleRemoveDocument = async (index) => {
    if (!window.confirm('Are you sure you want to remove this document?')) return;

    try {
      const updatedDocuments = load.dispatchDocuments.filter((_, i) => i !== index);
      
      const loadRef = doc(db, 'loads', load.docId);
      await updateDoc(loadRef, {
        dispatchDocuments: updatedDocuments,
        updatedAt: serverTimestamp()
      });

      updateLoadInList(load.docId, { dispatchDocuments: updatedDocuments });
      console.log('✅ Document removed successfully');
    } catch (error) {
      console.error('Error removing document:', error);
      alert('Failed to remove document: ' + error.message);
    }
  };

  // ============================================================================
  // PAYMENT HANDLERS
  // ============================================================================

  const handlePayTermsChange = (e) => {
    onPayTermsChange(load.docId, e.target.value);
  };

  const handlePaymentMethodChange = (e) => {
    onPaymentMethodChange(load.docId, e.target.value);
  };

  const handleMarkAsPaid = async () => {
    if (!paymentNote.trim() && load.paymentStatus !== 'paid') {
      return;
    }

    const currentStatus = load.paymentStatus || 'unpaid';
    const newStatus = currentStatus === 'paid' ? 'unpaid' : 'paid';

    setIsSavingPayment(true);
    try {
      const loadRef = doc(db, 'loads', load.docId);
      const updateData = {
        paymentStatus: newStatus,
        paymentNote: paymentNote.trim(),
        updatedAt: new Date()
      };
      
      if (newStatus === 'paid') {
        updateData.paidAt = new Date();
        updateData.paidBy = loggedInUser?.uid || null;
        updateData.paidByEmail = loggedInUser?.email || null;
      } else {
        updateData.paidAt = null;
        updateData.paidBy = null;
        updateData.paidByEmail = null;
      }
      
      await updateDoc(loadRef, updateData);
      
      updateLoadInList(load.docId, { 
        paymentStatus: newStatus, 
        paymentNote: paymentNote.trim(),
        paidAt: newStatus === 'paid' ? new Date() : null,
        paidBy: newStatus === 'paid' ? loggedInUser?.uid : null,
        paidByEmail: newStatus === 'paid' ? loggedInUser?.email : null
      });
    } catch (error) {
      console.error('Error updating payment status:', error);
    } finally {
      setIsSavingPayment(false);
    }
  };

  const handleEmailInvoice = async () => {
    if (!onEmailInvoice) {
      alert('Email invoice functionality is not available.');
      return;
    }

    const trimmedEmail = brokerEmail.trim();
    if (!trimmedEmail) {
      alert('Please enter an email address.');
      return;
    }

    if (!trimmedEmail.includes('@') || !trimmedEmail.includes('.')) {
      alert('Please enter a valid email address.');
      return;
    }

    if (!includeInvoice && !includeBOL) {
      alert('Please select at least one document to send (Invoice or BOL).');
      return;
    }
    const docsToSend = [includeInvoice && 'Invoice', includeBOL && 'BOL'].filter(Boolean).join(' + ');
    if (!window.confirm(`Send ${docsToSend} to ${trimmedEmail} and mark as "Invoiced"?`)) {
      return;
    }

    setIsEmailingInvoice(true);
    try {
await onEmailInvoice(load, trimmedEmail, includeBOL, includeInvoice);      
      updateLoadInList(load.docId, { 
        invoiceStatus: 'invoiced', 
        invoicedAt: new Date(),
        brokerEmail: trimmedEmail
      });
      
      if (load.brokerId && trimmedEmail) {
        try {
          const brokerDoc = await getDoc(doc(db, 'brokers', load.brokerId));
          if (brokerDoc.exists()) {
            const currentBrokerEmail = brokerDoc.data().email;
            if (!currentBrokerEmail || currentBrokerEmail !== trimmedEmail) {
              await updateDoc(doc(db, 'brokers', load.brokerId), {
                email: trimmedEmail,
                updatedAt: new Date()
              });
            }
          }
        } catch (error) {
          console.error('Could not update broker profile:', error);
        }
      }
      
    } catch (error) {
      console.error('Error emailing invoice:', error);
      alert('Failed to email invoice: ' + error.message);
    } finally {
      setIsEmailingInvoice(false);
    }
  };

  const getPaymentMethodLabel = (value) => {
    const method = PAYMENT_METHODS.find(m => m.value === value);
    return method ? method.label : value || 'N/A';
  };

  const getDateIndicator = (actualDate, scheduledDate) => {
    if (!actualDate || !scheduledDate) return null;
    
    const actual = actualDate.toDate ? actualDate.toDate() : new Date(actualDate);
    const scheduled = scheduledDate.toDate ? scheduledDate.toDate() : new Date(scheduledDate);
    
    if (actual <= scheduled) {
      return <span className="inline-block w-2 h-2 rounded-full bg-green-500 mr-1" title="On time or early"></span>;
    } else {
      return <span className="inline-block w-2 h-2 rounded-full bg-red-500 mr-1" title="Late"></span>;
    }
  };

  // Vehicle type and condition options
  const vehicleTypeOptions = [
    { value: '', label: 'Select Type' },
    { value: 'Sedan', label: 'Sedan' },
    { value: 'SUV', label: 'SUV' },
    { value: 'Truck', label: 'Truck' },
    { value: 'Van', label: 'Van' },
    { value: 'Coupe', label: 'Coupe' },
    { value: 'Motorcycle', label: 'Motorcycle' },
    { value: 'Other', label: 'Other' }
  ];

  const vehicleConditionOptions = [
    { value: 'Running', label: 'Running' },
    { value: 'Non-Running', label: 'Non-Running' },
    { value: 'Enclosed', label: 'Enclosed Only' }
  ];

  return (
    <tr className="bg-gray-50 border-t border-gray-200">
      <td colSpan={20} className="px-4 sm:px-6 py-4">
        <div className="space-y-3 max-w-fit">
      
          {/* All 4 Boxes in One Row */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            
            {/* PICKUP SECTION - INLINE EDITABLE */}
            <div className="bg-white p-3 rounded-lg border border-gray-200 shadow-sm">
              <strong className="text-sm text-blue-700 block mb-2">📍 PICKUP</strong>
              
              <div className="mb-3">
                <p className="text-xs text-gray-500 mb-0.5">Location Name:</p>
                <InlineEditField
                  value={load.pickupLocationName}
                  onSave={(val) => saveField('pickupLocationName', val)}
                  placeholder="Enter location name"
                  displayClassName="text-xs font-semibold text-gray-800 block"
                  disabled={!canAmendAccounting}
                />
                
                <p className="text-xs text-gray-500 mb-0.5 mt-2">Address:</p>
                <InlineEditField
                  value={load.pickupLocation}
                  onSave={(val) => saveField('pickupLocation', val)}
                  placeholder="Enter address"
                  displayClassName="text-xs text-gray-600 block"
                  disabled={!canAmendAccounting}
                />
              </div>
              
              <div className="mb-3 bg-gray-50 p-2 rounded border">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-xs text-gray-500">Scheduled:</span>
                  <span className="text-xs font-medium text-gray-700">
                    {formatTimestampInAppZone(load.pickupDateTime, applicationTimeZone, DATE_FORMATS.SHORT_DISPLAY) || "N/A"}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-gray-500">Actual:</span>
                  <span className="text-xs font-medium text-gray-700 flex items-center">
                    {getDateIndicator(load.actualPU || load.actualPickupTimestamp, load.pickupDateTime)}
                    {canEditActualDates ? (
                      <InlineEditDateTime
                        value={load.actualPU || load.actualPickupTimestamp}
                        onSave={saveActualPickup}
                        placeholder="Set actual pickup"
                        displayClassName="text-xs font-medium"
                        disabled={false}
                        applicationTimeZone={applicationTimeZone}
                        dateType="pickup"
                        loadId={load.load_id}
                        loggedInUser={loggedInUser}
                      />
                    ) : (
                      formatTimestampInAppZone(
                        load.actualPU || load.actualPickupTimestamp, 
                        applicationTimeZone, 
                        DATE_FORMATS.SHORT_DISPLAY
                      ) || "N/A"
                    )}
                  </span>
                </div>
              </div>
              
              <div>
                <p className="text-xs font-medium text-gray-600 mb-1">Instructions:</p>
                <div className="bg-gray-50 p-2 rounded border border-gray-200">
                  <InlineEditField
                    value={load.pickupInstructions}
                    onSave={(val) => saveField('pickupInstructions', val)}
                    placeholder="No instructions"
                    displayClassName="text-xs text-gray-600"
                    multiline={true}
                    disabled={!canAmendAccounting}
                  />
                </div>
              </div>
            </div>
            
            {/* DELIVERY SECTION - INLINE EDITABLE */}
            <div className="bg-white p-3 rounded-lg border border-gray-200 shadow-sm">
              <strong className="text-sm text-green-700 block mb-2">🎯 DELIVERY</strong>
              
              <div className="mb-3">
                <p className="text-xs text-gray-500 mb-0.5">Location Name:</p>
                <InlineEditField
                  value={load.deliveryLocationName}
                  onSave={(val) => saveField('deliveryLocationName', val)}
                  placeholder="Enter location name"
                  displayClassName="text-xs font-semibold text-gray-800 block"
                  disabled={!canAmendAccounting}
                />
                
                <p className="text-xs text-gray-500 mb-0.5 mt-2">Address:</p>
                <InlineEditField
                  value={load.deliveryLocation}
                  onSave={(val) => saveField('deliveryLocation', val)}
                  placeholder="Enter address"
                  displayClassName="text-xs text-gray-600 block"
                  disabled={!canAmendAccounting}
                />
              </div>
              
              <div className="mb-3 bg-gray-50 p-2 rounded border">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-xs text-gray-500">Scheduled:</span>
                  <span className="text-xs font-medium text-gray-700">
                    {formatTimestampInAppZone(load.deliveryDateTime, applicationTimeZone, DATE_FORMATS.SHORT_DISPLAY) || "N/A"}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-gray-500">Actual:</span>
                  <span className="text-xs font-medium text-gray-700 flex items-center">
                    {getDateIndicator(load.actualDEL, load.deliveryDateTime)}
                    {canEditActualDates ? (
                      <InlineEditDateTime
                        value={load.actualDEL}
                        onSave={saveActualDelivery}
                        placeholder="Set actual delivery"
                        displayClassName="text-xs font-medium"
                        disabled={false}
                        applicationTimeZone={applicationTimeZone}
                        dateType="delivery"
                        loadId={load.load_id}
                        loggedInUser={loggedInUser}
                      />
                    ) : (
                      formatTimestampInAppZone(
                        load.actualDEL, 
                        applicationTimeZone, 
                        DATE_FORMATS.SHORT_DISPLAY
                      ) || "N/A"
                    )}
                  </span>
                </div>
              </div>
              
              <div>
                <p className="text-xs font-medium text-gray-600 mb-1">Instructions:</p>
                <div className="bg-gray-50 p-2 rounded border border-gray-200">
                  <InlineEditField
                    value={load.deliveryInstructions}
                    onSave={(val) => saveField('deliveryInstructions', val)}
                    placeholder="No instructions"
                    displayClassName="text-xs text-gray-600"
                    multiline={true}
                    disabled={!canAmendAccounting}
                  />
                </div>
              </div>
            </div>

            {/* BROKER DETAILS */}
            <div className="bg-white p-3 rounded-lg border border-purple-200 shadow-sm">
              <strong className="text-sm text-purple-700 block mb-2">🏢 Broker</strong>
              {brokerObj ? (
                <div className="space-y-2">
                  <div>
                    <p className="text-xs text-gray-500">Company</p>
                    <p className="text-sm font-semibold text-purple-700">{brokerObj.name}</p>
                  </div>
                  {brokerObj.phone && (
                    <div>
                      <p className="text-xs text-gray-500">Phone</p>
                      <a href={`tel:${brokerObj.phone}`} className="text-xs text-purple-700 font-semibold hover:underline flex items-center gap-1">
                        📞 {brokerObj.phone}
                      </a>
                    </div>
                  )}
                  {brokerObj.email && (
                    <div>
                      <p className="text-xs text-gray-500">Email</p>
                      <a href={`mailto:${brokerObj.email}`} className="text-xs text-purple-700 font-semibold hover:underline flex items-center gap-1">
                        ✉️ {brokerObj.email}
                      </a>
                    </div>
                  )}
                  {brokerObj.address && (
                    <div>
                      <p className="text-xs text-gray-500">Address</p>
                      <p className="text-xs text-gray-600">{brokerObj.address}</p>
                    </div>
                  )}
                  {brokerObj.mcNumber && (
                    <div>
                      <p className="text-xs text-gray-500">MC #</p>
                      <p className="text-xs text-gray-600 font-mono">{brokerObj.mcNumber}</p>
                    </div>
                  )}
                  {!brokerObj.phone && !brokerObj.email && (
                    <p className="text-xs text-gray-400 italic">No contact info available</p>
                  )}
                </div>
              ) : (
                <p className="text-xs text-gray-400 italic">No broker assigned</p>
              )}
            </div>

            {/* PAYMENT INFORMATION */}
            <div className="bg-blue-50 p-3 rounded-lg border border-blue-200 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <strong className="text-sm text-blue-800">💳 Payment Info</strong>
                {load.paymentStatus === 'paid' && (
                  <span className="bg-green-100 text-green-800 px-2 py-0.5 rounded text-xs font-semibold border border-green-300">
                    ✓ PAID
                  </span>
                )}
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <label className="text-xs font-medium text-gray-600 w-16 flex-shrink-0">Method:</label>
                  {canAmendAccounting && canEditPaymentTerms ? (
                    <select
                      value={load.paymentMethod || ''}
                      onChange={handlePaymentMethodChange}
                      className="text-xs border rounded px-2 py-1 flex-1 bg-white min-w-0"
                    >
                      {PAYMENT_METHODS.map(option => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="text-xs text-gray-700 flex-1">
                      {getPaymentMethodLabel(load.paymentMethod)}
                    </span>
                  )}
                </div>
                
                <div className="flex items-center gap-2">
                  <label className="text-xs font-medium text-gray-600 w-16 flex-shrink-0">Terms:</label>
                 {canAmendAccounting && canEditPaymentTerms ? (
                    <select
                      value={load.paymentTerms || ''}
                      onChange={handlePayTermsChange}
                      className="text-xs border rounded px-2 py-1 flex-1 bg-white min-w-0"
                    >
                      {PAYMENT_TERMS.map(option => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="text-xs text-gray-700 flex-1">
                      {load.paymentTerms ? 
                        PAYMENT_TERMS.find(term => term.value === load.paymentTerms)?.label || load.paymentTerms 
                        : "N/A"}
                    </span>
                  )}
                </div>

                {load.brokerFeeCollection > 0 && (
                  <div className="flex items-center gap-2">
                    <label className="text-xs font-medium text-gray-600 w-16 flex-shrink-0">{load.factoringApplied === true ? 'Fact. Fee:' : 'Broker Fee:'}</label>
                    <span className="text-xs text-red-600 font-semibold flex-1">
                      {formatCurrency(load.brokerFeeCollection)}
                      {load.factoringApplied && load.factoringPercentage && (
                        <span className="text-gray-500 font-normal ml-1">({load.factoringPercentage}%)</span>
                      )}
                    </span>
                  </div>
                )}
                {parseFloat(load.storageFee) > 0 && (
                  <div className="flex items-center gap-2">
                    <label className="text-xs font-medium text-gray-600 w-16 flex-shrink-0">Storage:</label>
                    <span className="text-xs text-orange-600 font-semibold flex-1">
                      {formatCurrency(load.storageFee)}
                    </span>
                  </div>
                )}

                {load.paymentNote && (
                  <div className="flex items-start gap-2">
                    <label className="text-xs font-medium text-gray-600 w-16 flex-shrink-0">Note:</label>
                    <span className="text-xs text-gray-700 flex-1 bg-green-50 px-2 py-1 rounded border border-green-200">
                      {load.paymentNote}
                    </span>
                  </div>
                )}

                {load.paymentStatus === 'paid' && load.paidAt && (
                  <div className="flex items-center gap-2">
                    <label className="text-xs font-medium text-gray-600 w-16 flex-shrink-0">Paid:</label>
                    <span className="text-xs text-green-700 flex-1">
                      {load.paidAt 
                        ? (load.paidAt.toDate ? load.paidAt.toDate() : new Date(load.paidAt)).toLocaleDateString('en-US', { timeZone: applicationTimeZone || 'America/New_York' })
                        : 'Date N/A'}
                      {load.paidByEmail && <span className="text-gray-500 ml-1">by {load.paidByEmail}</span>}
                    </span>
                  </div>
                )}

{canAmendAccounting && load.status === 'Delivered' && (
                  <div className="border-t border-blue-200 pt-2 mt-2 space-y-1.5">
                    <div>
                      <label className="text-xs font-medium text-gray-600 mb-1 block">
                        Payment Note {load.paymentStatus !== 'paid' && <span className="text-red-500">*required</span>}
                      </label>
                      <input
                        type="text"
                        value={paymentNote}
                        onChange={(e) => setPaymentNote(e.target.value)}
                        placeholder="e.g., Check #1234, Zelle confirmed..."
                        maxLength={100}
                        className="w-full text-xs border border-gray-300 rounded px-2 py-1.5 focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                        disabled={isSavingPayment}
                      />
                    </div>
                    
                    <button
                      onClick={handleMarkAsPaid}
                      disabled={isSavingPayment || (!paymentNote.trim() && load.paymentStatus !== 'paid')}
                      className={`w-full py-1.5 px-3 rounded text-xs font-semibold transition-colors ${
                        load.paymentStatus === 'paid'
                          ? 'bg-green-100 text-green-800 border border-green-300 hover:bg-red-100 hover:text-red-800 hover:border-red-300'
                          : paymentNote.trim()
                            ? 'bg-green-600 text-white hover:bg-green-700'
                            : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                      }`}
                    >
                      {isSavingPayment ? (
                        <span className="flex items-center justify-center gap-1">
                          <svg className="animate-spin h-3 w-3" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          Saving...
                        </span>
                      ) : load.paymentStatus === 'paid' ? (
                        '✓ Paid - Click to Undo'
                      ) : (
                        'Mark as Paid'
                      )}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* VEHICLE DETAILS SECTION - INLINE EDITABLE */}
          {localVehicles && localVehicles.length > 0 && (
            <div className="bg-white p-3 rounded-lg border border-gray-200 shadow-sm">
              <strong className="text-sm text-gray-700 block mb-3">🚗 Vehicle Details ({localVehicles.length})</strong>
              <div className="overflow-x-auto">
                <table className="min-w-full text-xs">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-left font-semibold text-gray-600 border-b">#</th>
                      <th className="px-3 py-2 text-left font-semibold text-gray-600 border-b">Year</th>
                      <th className="px-3 py-2 text-left font-semibold text-gray-600 border-b">Make</th>
                      <th className="px-3 py-2 text-left font-semibold text-gray-600 border-b">Model</th>
                      <th className="px-3 py-2 text-left font-semibold text-gray-600 border-b">VIN</th>
                      <th className="px-3 py-2 text-left font-semibold text-gray-600 border-b">Color</th>
                      <th className="px-3 py-2 text-left font-semibold text-gray-600 border-b">Type</th>
                      <th className="px-3 py-2 text-left font-semibold text-gray-600 border-b">Condition</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {localVehicles.map((vehicle, index) => (
                      <tr key={index} className="hover:bg-gray-50">
                        <td className="px-3 py-2 text-gray-700 font-medium">{index + 1}</td>
                        <td className="px-3 py-2">
                          <InlineEditField
                            value={vehicle.year}
                            onSave={(val) => saveVehicleField(index, 'year', val)}
                            placeholder="Year"
                            displayClassName="text-gray-700"
                            disabled={!canAmendAccounting}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <InlineEditField
                            value={vehicle.make}
                            onSave={(val) => saveVehicleField(index, 'make', val)}
                            placeholder="Make"
                            displayClassName="text-gray-700 font-medium"
                            disabled={!canAmendAccounting}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <InlineEditField
                            value={vehicle.model}
                            onSave={(val) => saveVehicleField(index, 'model', val)}
                            placeholder="Model"
                            displayClassName="text-gray-700"
                            disabled={!canAmendAccounting}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <InlineEditField
                            value={vehicle.vin}
                            onSave={(val) => saveVehicleField(index, 'vin', val.toUpperCase())}
                            placeholder="VIN"
                            displayClassName="text-gray-600 font-mono text-xs"
                            disabled={!canAmendAccounting}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <InlineEditField
                            value={vehicle.color}
                            onSave={(val) => saveVehicleField(index, 'color', val)}
                            placeholder="Color"
                            displayClassName="text-gray-700"
                            disabled={!canAmendAccounting}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <InlineEditSelect
                            value={vehicle.type}
                            options={vehicleTypeOptions}
                            onSave={(val) => saveVehicleField(index, 'type', val)}
                            displayClassName="text-gray-700"
                            disabled={!canAmendAccounting}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <InlineEditSelect
                            value={vehicle.condition || 'Running'}
                            options={vehicleConditionOptions}
                            onSave={(val) => saveVehicleField(index, 'condition', val)}
                            displayClassName={`px-2 py-1 rounded-full text-xs font-medium ${
                              vehicle.condition === 'Running' 
                                ? 'bg-green-100 text-green-800' 
                                : 'bg-yellow-100 text-yellow-800'
                            }`}
                            disabled={!canAmendAccounting}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Documents & Actions */}
          <div className="bg-white p-3 rounded-lg border border-gray-200 shadow-sm">
            <strong className="text-sm text-gray-700 block mb-2">📄 Documents & Actions</strong>
            <div className="flex flex-wrap gap-2 items-start">
              {load.bolUrl && (
                <a 
                  href={load.bolUrl} 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className="text-xs inline-flex items-center px-2.5 py-1.5 border border-transparent rounded shadow-sm font-medium text-white bg-purple-600 hover:bg-purple-700"
                >
                  📋 BOL
                </a>
              )}
              
              <button 
                onClick={() => onGenerateBOL(load, drivers)} 
                className="text-xs inline-flex items-center px-2.5 py-1.5 border border-transparent rounded shadow-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
              >
                📄 BOL PDF
              </button>
              
              {load.podUrl && (
                <a 
                  href={load.podUrl} 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className="text-xs inline-flex items-center px-2.5 py-1.5 border border-transparent rounded shadow-sm font-medium text-white bg-cyan-600 hover:bg-cyan-700"
                >
                  📦 POD
                </a>
              )}
              
              <button 
                onClick={() => onGenerateInvoice(load)} 
                className="text-xs inline-flex items-center px-2.5 py-1.5 border border-transparent rounded shadow-sm font-medium text-white bg-teal-600 hover:bg-teal-700"
              >
                🧾 Invoice
              </button>

              {/* EMAIL INVOICE SECTION */}
{canEmailInvoice && !isLoadingPermission && (load.status === 'Delivered' || load.status === 'In Transit') && (
                <div className="flex items-center gap-2 flex-wrap">
                  <label className="flex items-center gap-1.5 text-xs text-gray-700 cursor-pointer bg-gray-50 px-2 py-1.5 rounded border border-gray-200 hover:bg-gray-100">
                    <input
                      type="checkbox"
                      checked={includeInvoice}
                      onChange={(e) => setIncludeInvoice(e.target.checked)}
                      className="w-3.5 h-3.5 text-indigo-600 rounded focus:ring-indigo-500"
                    />
                    <span>Invoice</span>
                  </label>
                  <label className="flex items-center gap-1.5 text-xs text-gray-700 cursor-pointer bg-gray-50 px-2 py-1.5 rounded border border-gray-200 hover:bg-gray-100">
                    <input
                      type="checkbox"
                      checked={includeBOL}
                      onChange={(e) => setIncludeBOL(e.target.checked)}
                      className="w-3.5 h-3.5 text-indigo-600 rounded focus:ring-indigo-500"
                    />
                    <span>BOL</span>
                  </label>
                  
                  <div className="relative">
                    <input
                      type="email"
                      value={brokerEmail}
                      onChange={(e) => setBrokerEmail(e.target.value)}
                      placeholder={isLoadingEmail ? "Loading..." : "Broker email..."}
                      disabled={isLoadingEmail}
                      className="text-xs border border-gray-300 rounded px-2 py-1.5 w-48 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-gray-100 disabled:cursor-wait"
                    />
                    {isLoadingEmail && (
                      <div className="absolute right-2 top-1/2 transform -translate-y-1/2">
                        <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-indigo-600"></div>
                      </div>
                    )}
                  </div>
                  
                  <button 
                    onClick={handleEmailInvoice}
                    disabled={isEmailingInvoice || !brokerEmail.trim() || isLoadingEmail}
                    className="text-xs inline-flex items-center px-2.5 py-1.5 border border-transparent rounded shadow-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
                  >
                    {isEmailingInvoice ? (
                      <>
                        <svg className="animate-spin -ml-1 mr-1 h-3 w-3 text-white" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Sending...
                      </>
                    ) : (
                      <>📧 {[includeInvoice && 'Invoice', includeBOL && 'BOL'].filter(Boolean).join(' + ') || 'Select docs'}</>
                    )}
                  </button>
                </div>
              )}

              {load.adminNotes && (
                <div className="flex items-center gap-1.5 text-xs bg-yellow-50 px-2 py-1.5 rounded border border-yellow-300">
                  <span className="text-yellow-700 font-medium">📌 Note:</span>
                  <span className="text-gray-700">{load.adminNotes}</span>
                </div>
              )}

              {load.loadNotes && (
                <div className="flex items-center gap-1.5 text-xs bg-blue-50 px-2 py-1.5 rounded border border-blue-300">
                  <span className="text-blue-700 font-medium">📝 Load Notes:</span>
                  <span className="text-gray-700">{load.loadNotes}</span>
                </div>
              )}

              {/* DISPATCH DOCUMENTS - WITH DELETE & UPLOAD */}
              {(load.dispatchDocuments && load.dispatchDocuments.length > 0) || canAmendAccounting ? (
                <div className="w-full mt-2 pt-2 border-t border-gray-200">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-gray-700">
                      📎 Dispatch Documents ({load.dispatchDocuments?.length || 0})
                    </span>
                    
                    {/* Upload Button */}
                    {canAmendAccounting && (
                      <label className="cursor-pointer">
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept=".pdf,.jpg,.jpeg,.png,.gif"
                          onChange={handleFileUpload}
                          className="hidden"
                          disabled={isUploading}
                        />
                        <span className={`text-xs inline-flex items-center gap-1 px-2.5 py-1.5 rounded font-medium transition-colors ${
                          isUploading
                            ? 'bg-gray-300 text-gray-500 cursor-wait'
                            : 'bg-green-600 text-white hover:bg-green-700 cursor-pointer'
                        }`}>
                          {isUploading ? (
                            <>
                              <svg className="animate-spin h-3 w-3" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                              </svg>
                              Uploading...
                            </>
                          ) : (
                            <>
                              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                              </svg>
                              Upload
                            </>
                          )}
                        </span>
                      </label>
                    )}
                  </div>
                  
                  {/* Document List */}
                  {load.dispatchDocuments && load.dispatchDocuments.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {load.dispatchDocuments.map((doc, idx) => (
                        <div 
                          key={idx} 
                          className="flex items-center gap-2 bg-purple-50 px-2 py-1.5 rounded border border-purple-200"
                        >
                          <a
                            href={doc.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-purple-700 hover:text-purple-900 hover:underline flex items-center gap-1"
                          >
                            {doc.fileType?.includes('pdf') ? '📄' : '🖼️'} {doc.fileName}
                          </a>
                          
                          {canAmendAccounting && (
                            <button
                              onClick={() => handleRemoveDocument(idx)}
                              className="text-red-500 hover:text-red-700 p-0.5 rounded hover:bg-red-100"
                              title="Remove document"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  
                  {(!load.dispatchDocuments || load.dispatchDocuments.length === 0) && (
                    <p className="text-xs text-gray-400 italic">No documents attached</p>
                  )}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </td>
    </tr>
  );
}