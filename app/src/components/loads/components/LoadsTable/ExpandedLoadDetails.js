// src/components/loads/components/LoadsTable/ExpandedLoadDetails.js
import React, { useState, useEffect, useRef } from 'react';
import { db } from '../../../../firebase';
import { doc, getDoc, updateDoc, serverTimestamp, collection, query, where, getDocs } from 'firebase/firestore';
// Import email/invoice services (same as accounting page uses)
import { 
  emailInvoiceToBoker, 
  markLoadAsInvoiced 
} from '../../../accounting/services/accountingService';
import { logAudit } from '../../../accounting/services/auditService';

// Lazy loaded PDF Generators (same pattern as AccountingPage)
const LazyPDFGenerators = {
  generateBOLPdf: () => import('../../../accounting/utils/generateBOLPdf').then(module => module.generateBOLPdf),
  generateInvoicePdf: () => import('../../../accounting/utils/generateInvoicePdf').then(module => module.generateInvoicePdf)
};

// Helper to generate Google Maps URL
const getGoogleMapsUrl = (address) => {
  if (!address) return null;
  const encodedAddress = encodeURIComponent(address);
  return `https://www.google.com/maps/search/?api=1&query=${encodedAddress}`;
};

// Editable Instructions Component
const EditableInstructions = ({ 
  value, 
  fieldName, 
  loadId, 
  canEdit, 
  placeholder = "No instructions provided",
  onSave 
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(value || '');
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    if (editValue === value) {
      setIsEditing(false);
      return;
    }
    setIsSaving(true);
    try {
      const loadRef = doc(db, 'loads', loadId);
      await updateDoc(loadRef, {
        [fieldName]: editValue,
        updatedAt: serverTimestamp()
      });
      if (onSave) onSave(`${fieldName} updated successfully`);
      setIsEditing(false);
    } catch (error) {
      console.error('Error updating instructions:', error);
      alert('Failed to save. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setEditValue(value || '');
    setIsEditing(false);
  };

  if (isEditing) {
    return (
      <div className="mt-0.5">
        <textarea
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onKeyDown={(e) => e.key === 'Escape' && handleCancel()}
          className="w-full border border-blue-300 rounded p-1.5 text-xs focus:ring-1 focus:ring-blue-500 focus:border-blue-500 resize-none"
          rows={2}
          placeholder="Enter instructions..."
          autoFocus
          disabled={isSaving}
        />
        <div className="flex gap-1 mt-1">
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="px-2 py-0.5 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {isSaving ? 'Saving...' : 'Save'}
          </button>
          <button
            onClick={handleCancel}
            disabled={isSaving}
            className="px-2 py-0.5 bg-gray-200 text-gray-700 text-xs rounded hover:bg-gray-300"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div 
      className={`whitespace-pre-wrap bg-gray-100 p-1.5 rounded text-xs ${canEdit ? 'cursor-pointer hover:bg-gray-200' : ''}`}
      onClick={() => canEdit && setIsEditing(true)}
    >
      {value || <span className="text-gray-400 italic">{placeholder}</span>}
    </div>
  );
};

// Clickable Address Component
const ClickableAddress = ({ name, address }) => {
  const fullAddress = [name, address].filter(Boolean).join(', ');
  const mapsUrl = getGoogleMapsUrl(fullAddress);

  if (!fullAddress) return <span className="text-gray-400 italic text-xs">No address</span>;

  return (
    <a
      href={mapsUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex items-start gap-1 hover:text-blue-600 text-xs"
    >
      <svg className="w-3 h-3 text-gray-400 group-hover:text-blue-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
      <div className="leading-tight">
        {name && <div className="font-medium text-gray-800 group-hover:text-blue-600">{name}</div>}
        {address && <div className="text-gray-600 group-hover:text-blue-600">{address}</div>}
      </div>
    </a>
  );
};

// Vehicle Card Component
const VehicleCard = ({ vehicle, index }) => (
  <div className={`border rounded p-2 ${vehicle.inop ? 'border-red-300 bg-red-50' : 'border-gray-200 bg-white'}`}>
    <div className="flex items-center justify-between gap-2">
      <div className="font-semibold text-blue-700 text-sm">
        {[vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ') || 'Unknown'}
      </div>
      {vehicle.inop && (
        <span className="bg-red-100 text-red-800 px-1.5 py-0.5 rounded text-xs font-semibold">INOP</span>
      )}
    </div>
    <div className="text-gray-600 font-mono text-xs">VIN: {vehicle.vin || 'N/A'}</div>
  </div>
);
// Format timestamp for driver activity display
const formatActivityTime = (timestamp, timeZone) => {
  if (!timestamp) return 'N/A';
  const date = timestamp?.toDate ? timestamp.toDate() : new Date(timestamp);
  return date.toLocaleString('en-US', {
    timeZone: timeZone || 'America/New_York',
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true
  });
};
const DriverActionsToggle = ({ children }) => {
  const [isOpen, setIsOpen] = useState(false);
  
  return (
    <div className="mt-2 border-t border-gray-100 pt-1.5">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1"
      >
        <span className={`transform transition-transform duration-200 ${isOpen ? 'rotate-90' : ''}`}>▶</span>
        {isOpen ? 'Hide' : 'Show'} driver actions
      </button>
      {isOpen && (
        <div className="mt-1.5 space-y-1.5 pl-2 border-l-2 border-blue-100">
          {children}
        </div>
      )}
    </div>
  );
};
const ExpandedLoadDetails = ({ 
  load, 
  isAutomobileHauling, 
  canManageLoads, 
  canSeeDispatcherFilter,
  loggedInUser,
  LoadDocuments,
  brokers = [],
  drivers = [],
  companies = [],
  applicationTimeZone,
  colSpan
}) => {
  // Payment status state
 
  // Email Invoice state
  const [brokerEmail, setBrokerEmail] = useState('');
  const [isLoadingEmail, setIsLoadingEmail] = useState(false);
const [includeBOL, setIncludeBOL] = useState(true);
  const [includeInvoice, setIncludeInvoice] = useState(true);
    const [isEmailingInvoice, setIsEmailingInvoice] = useState(false);

  // Company change state (admin only)
  const [isSavingCompany, setIsSavingCompany] = useState(false);

  const canEditInstructions = (() => {
    if (!loggedInUser) return false;
    const userRoles = Array.isArray(loggedInUser.role) ? loggedInUser.role : [loggedInUser.role].filter(Boolean);
    return userRoles.some(role => ['Admin', 'Super Admin', 'Main Admin', 'Dispatcher', 'Accountant'].includes(role));
  })();

  // Check if user is Admin/Super Admin (for company change + email invoice)
  const isAdmin = (() => {
    if (!loggedInUser) return false;
    const userRoles = Array.isArray(loggedInUser.role) ? loggedInUser.role : [loggedInUser.role].filter(Boolean);
    return userRoles.includes('Admin') || userRoles.includes('Super Admin');
  })();

  // Get broker details
  const brokerObj = brokers.find(b => b.id === load.brokerId);

  const hasPaymentDetails = isAutomobileHauling && (
    parseFloat(load.driverCollectionAmount) > 0 || 
    parseFloat(load.brokerFeeCollection) > 0 ||
    load.collectionInstructions || 
    load.paymentMethod ||
    load.paymentTerms
  );

  // Auto-fetch broker email on mount
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

  // ============================================
  // EMAIL INVOICE HANDLER
  // ============================================
  const handleEmailInvoice = async () => {
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
    // Derive company name for confirmation
    let companyNameForConfirm = load.companyName || '';
    if (!companyNameForConfirm) {
      const driver = drivers.find(d => d.id === load.driverId);
      if (driver?.assignedCompanyName) {
        companyNameForConfirm = driver.assignedCompanyName;
      }
    }

const docsToSend = [includeInvoice && 'Invoice', includeBOL && 'BOL'].filter(Boolean).join(' + ');
    const companyLine = companyNameForConfirm 
      ? `\n\n🏢 Company on BOL: "${companyNameForConfirm}"` 
      : '\n\n⚠️ Warning: No company name found for BOL';

    if (!window.confirm(
      `You are about to send ${docsToSend} for:\n\n` +
      `📦 Load: ${load.load_id}\n` +
      `📧 To: ${trimmedEmail}` +
      companyLine +
      `\n\nThis will also mark the load as "Invoiced".\n\nProceed?`
    )) {
      return;
    }

    setIsEmailingInvoice(true);
    try {
      // Derive companyName if missing
      let companyNameToSave = load.companyName || '';
      let derivedCompanyId = null;
      if (!companyNameToSave) {
        const driver = drivers.find(d => d.id === load.driverId);
        if (driver?.assignedCompanyName) {
          companyNameToSave = driver.assignedCompanyName;
          derivedCompanyId = driver.assignedCompanyId || null;
        }
      }

      // Pre-save companyName so email function can find CC/reply-to
      const loadRef = doc(db, 'loads', load.docId);
      await updateDoc(loadRef, {
        companyName: companyNameToSave,
        updatedAt: serverTimestamp()
      });

      // Build load object with current company name + resolved companyId
      const loadWithCompany = { ...load, companyName: companyNameToSave };
      const matchedCompany = (companies || []).find(
        c => (c.name || '').toLowerCase().trim() === (companyNameToSave || '').toLowerCase().trim()
      );
      if (matchedCompany) {
        loadWithCompany.companyId = matchedCompany.id;
      } else if (derivedCompanyId) {
        loadWithCompany.companyId = derivedCompanyId;
      } else {
        loadWithCompany.companyId = null; // Never trust stale companyId from the load doc
      }

      // Generate Invoice PDF if requested
      let invoicePdfBlob = null;
      if (includeInvoice) {
        const generateInvoicePdf = await LazyPDFGenerators.generateInvoicePdf();
        invoicePdfBlob = await generateInvoicePdf(loadWithCompany, drivers, brokers, loggedInUser, true);
      }
      
      // Generate BOL PDF if requested
      let bolPdfBlob = null;
      if (includeBOL) {
        const generateBOLPdf = await LazyPDFGenerators.generateBOLPdf();
        bolPdfBlob = await generateBOLPdf(loadWithCompany, drivers, loggedInUser, true);
      }
      
      // Send email
      await emailInvoiceToBoker(loadWithCompany, trimmedEmail, invoicePdfBlob, bolPdfBlob);
      
      // Mark as invoiced
      await markLoadAsInvoiced(load.docId);
      
      // Update local load object
      load.invoiceStatus = 'invoiced';
      load.invoicedAt = new Date();
      load.brokerEmail = trimmedEmail;

      // Audit log
      await logAudit({
        userId: loggedInUser.uid,
        userEmail: loggedInUser.email,
        action: "email_invoice",
        targetType: "load",
        targetId: load.docId,
        tenantId: loggedInUser.tenantId,
        details: {
          loadId: load.load_id,
          brokerName: brokerObj?.name || load.brokerName,
          brokerEmail: trimmedEmail,
          includedBOL: includeBOL,
          includedInvoice: includeInvoice,
          source: 'loads_page',
          message: `${[includeInvoice && 'Invoice', includeBOL && 'BOL'].filter(Boolean).join(' and ')} emailed to ${trimmedEmail} from Loads page`
        }
      });

      // Update broker email if different
      if (load.brokerId && trimmedEmail) {
        try {
          const brokerDocSnap = await getDoc(doc(db, 'brokers', load.brokerId));
          if (brokerDocSnap.exists()) {
            const currentBrokerEmail = brokerDocSnap.data().email;
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
      
const sentDocs = [includeInvoice && 'Invoice', includeBOL && 'BOL'].filter(Boolean).join(' and ');
      alert(`${sentDocs} sent successfully to ${trimmedEmail}!`);    } catch (error) {
      console.error('Error emailing invoice:', error);
      alert('Failed to email invoice: ' + error.message);
    } finally {
      setIsEmailingInvoice(false);
    }
  };

  // ============================================
  // COMPANY CHANGE HANDLER (Admin only)
  // ============================================
  const handleCompanyChange = async (e) => {
    const selectedId = e.target.value;
    if (selectedId === (load.companyId || '')) return;

    const selectedCompany = selectedId
      ? (companies || []).find(c => c.id === selectedId)
      : null;
    const newCompanyName = selectedCompany ? selectedCompany.name : '';

    setIsSavingCompany(true);
    try {
      const loadRef = doc(db, 'loads', load.docId);
      await updateDoc(loadRef, {
        companyName: newCompanyName,
        companyId: selectedCompany ? selectedCompany.id : null,
        updatedAt: serverTimestamp()
      });

      // Update local load object
      load.companyName = newCompanyName;
      load.companyId = selectedCompany ? selectedCompany.id : null;

      await logAudit({
        userId: loggedInUser.uid,
        userEmail: loggedInUser.email,
        action: "update_company",
        targetType: "load",
        targetId: load.docId,
        tenantId: loggedInUser.tenantId,
        details: {
          loadId: load.load_id,
          newCompanyName: newCompanyName,
          source: 'loads_page',
          message: `Company changed to "${newCompanyName}" from Loads page`
        }
      });
    } catch (error) {
      console.error('Error updating company:', error);
      alert('Failed to update company: ' + error.message);
    } finally {
      setIsSavingCompany(false);
    }
  };

  // Derive current company name for display/select
  const getCurrentCompanyName = () => {
    if (load.companyName && typeof load.companyName === 'string') return load.companyName;
    const driver = drivers.find(d => d.id === load.driverId);
    if (driver?.assignedCompanyName) return driver.assignedCompanyName;
    if (companies.length === 1) return companies[0].name;
    return '';
  };

    return (
    <tr>
      <td colSpan={colSpan} className="bg-gray-50 px-4 py-3">
        <div className="space-y-3">
          
          {/* ============================================ */}
          {/* PICKUP, DELIVERY, BROKER & PAYMENT ROW */}
          {/* ============================================ */}
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-3">
            
            {/* Pickup Details */}
            <div className="bg-white rounded border border-green-200 overflow-hidden">
              <div className="bg-green-50 px-3 py-1.5 border-b border-green-200">
                <h4 className="font-semibold text-green-800 text-xs flex items-center gap-1">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 10l7-7m0 0l7 7m-7-7v18" />
                  </svg>
                  Pickup
                </h4>
              </div>
              <div className="p-2 space-y-1.5">
                <div>
                  <div className="text-xs text-gray-500 font-medium">Address</div>
                  <ClickableAddress name={load.pickupLocationName} address={load.pickupLocation} />
                </div>
                {load.pickupContactPhone && (
                  <div>
                    <div className="text-xs text-gray-500 font-medium">Phone</div>
                    <a href={`tel:${load.pickupContactPhone}`} className="text-xs text-green-700 font-semibold hover:underline flex items-center gap-1">
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                      </svg>
                      {load.pickupContactPhone}
                    </a>
                  </div>
                )}
                <div className="flex gap-3">
                  <div>
                    <div className="text-xs text-gray-500 font-medium">Scheduled</div>
                    <div className="text-xs">{load.pickupDateTime?.toDate ? load.pickupDateTime.toDate().toLocaleDateString('en-US', { timeZone: applicationTimeZone || 'America/New_York' }) : load.pickupDateTime || '—'}</div>
                  </div>
                  {load.actualPU && (
                    <div>
                      <div className="text-xs text-green-600 font-medium">Actual</div>
                      <div className="text-xs font-semibold text-green-700">{load.actualPU.toDate ? load.actualPU.toDate().toLocaleDateString('en-US', { timeZone: applicationTimeZone || 'America/New_York' }) : load.actualPU}</div>
                    </div>
                  )}
                </div>
                <div>
                  <div className="text-xs text-gray-500 font-medium">Instructions {canEditInstructions && <span className="text-blue-500">(click to edit)</span>}</div>
                  <EditableInstructions value={load.pickupInstructions} fieldName="pickupInstructions" loadId={load.docId} canEdit={canEditInstructions} placeholder="None" />
                </div>

                {/* Driver Actions - Pickup */}
                {(load.pickupSignatureMetadata || load.actualPU) && (
                  <DriverActionsToggle>
                    {load.pickupSignatureMetadata && (
                      <div className="flex items-start gap-1.5">
                        <span className="text-xs">📝</span>
                        <div className="text-xs text-gray-600">
                          <span className="font-medium">Signature obtained</span> from {load.pickupSignatureMetadata.signerName || 'N/A'}
                          <div className="text-gray-400">{formatActivityTime(load.pickupSignatureMetadata.capturedAt, applicationTimeZone)}</div>
                        </div>
                      </div>
                    )}
                    {load.actualPU && (
                      <div className="flex items-start gap-1.5">
                        <span className="text-xs">🚛</span>
                        <div className="text-xs text-gray-600">
                          <span className="font-medium">Marked as picked up</span>
                          <div className="text-gray-400">{formatActivityTime(load.actualPU, applicationTimeZone)}</div>
                        </div>
                      </div>
                    )}
                  </DriverActionsToggle>
                )}

              </div>
            </div>

            {/* Delivery Details */}
            <div className="bg-white rounded border border-blue-200 overflow-hidden">
              <div className="bg-blue-50 px-3 py-1.5 border-b border-blue-200">
                <h4 className="font-semibold text-blue-800 text-xs flex items-center gap-1">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                  </svg>
                  Delivery
                </h4>
              </div>
              <div className="p-2 space-y-1.5">
                <div>
                  <div className="text-xs text-gray-500 font-medium">Address</div>
                  <ClickableAddress name={load.deliveryLocationName} address={load.deliveryLocation} />
                </div>
                {load.deliveryContactPhone && (
                  <div>
                    <div className="text-xs text-gray-500 font-medium">Phone</div>
                    <a href={`tel:${load.deliveryContactPhone}`} className="text-xs text-blue-700 font-semibold hover:underline flex items-center gap-1">
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                      </svg>
                      {load.deliveryContactPhone}
                    </a>
                  </div>
                )}
                <div className="flex gap-3">
                  <div>
                    <div className="text-xs text-gray-500 font-medium">Scheduled</div>
                    <div className="text-xs">{load.deliveryDateTime?.toDate ? load.deliveryDateTime.toDate().toLocaleDateString('en-US', { timeZone: applicationTimeZone || 'America/New_York' }) : load.deliveryDateTime || '—'}</div>
                  </div>
                  {load.actualDEL && (
                    <div>
                      <div className="text-xs text-blue-600 font-medium">Actual</div>
                      <div className="text-xs font-semibold text-blue-700">{load.actualDEL.toDate ? load.actualDEL.toDate().toLocaleDateString('en-US', { timeZone: applicationTimeZone || 'America/New_York' }) : load.actualDEL}</div>
                    </div>
                  )}
                </div>
                <div>
                  <div className="text-xs text-gray-500 font-medium">Instructions {canEditInstructions && <span className="text-blue-500">(click to edit)</span>}</div>
                  <EditableInstructions value={load.deliveryInstructions} fieldName="deliveryInstructions" loadId={load.docId} canEdit={canEditInstructions} placeholder="None" />
                </div>

                {/* Driver Actions - Delivery */}
                {(load.deliverySignatureMetadata || load.actualDEL) && (
                  <DriverActionsToggle>
                    {load.deliverySignatureMetadata && (
                      <div className="flex items-start gap-1.5">
                        <span className="text-xs">📝</span>
                        <div className="text-xs text-gray-600">
                          <span className="font-medium">Signature obtained</span> from {load.deliverySignatureMetadata.signerName || 'N/A'}
                          <div className="text-gray-400">{formatActivityTime(load.deliverySignatureMetadata.capturedAt, applicationTimeZone)}</div>
                        </div>
                      </div>
                    )}
                    {load.actualDEL && (
                      <div className="flex items-start gap-1.5">
                        <span className="text-xs">🎉</span>
                        <div className="text-xs text-gray-600">
                          <span className="font-medium">Marked as delivered</span>
                          <div className="text-gray-400">{formatActivityTime(load.actualDEL, applicationTimeZone)}</div>
                        </div>
                      </div>
                    )}
                  </DriverActionsToggle>
                )}

              </div>
            </div>

            {/* Broker Details */}
            <div className="bg-white rounded border border-purple-200 overflow-hidden">
              <div className="bg-purple-50 px-3 py-1.5 border-b border-purple-200">
                <h4 className="font-semibold text-purple-800 text-xs flex items-center gap-1">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                  </svg>
                  Broker
                </h4>
              </div>
              <div className="p-2 space-y-1.5">
                {brokerObj ? (
                  <>
                    <div>
                      <div className="text-xs text-gray-500 font-medium">Company</div>
                      <div className="text-sm font-semibold text-purple-700">{brokerObj.name}</div>
                    </div>
                    {brokerObj.phone && (
                      <div>
                        <div className="text-xs text-gray-500 font-medium">Phone</div>
                        <a href={`tel:${brokerObj.phone}`} className="text-xs text-purple-700 font-semibold hover:underline flex items-center gap-1">
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                          </svg>
                          {brokerObj.phone}
                        </a>
                      </div>
                    )}
                    {brokerObj.email && (
                      <div>
                        <div className="text-xs text-gray-500 font-medium">Email</div>
                        <a href={`mailto:${brokerObj.email}`} className="text-xs text-purple-700 font-semibold hover:underline flex items-center gap-1">
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                          </svg>
                          {brokerObj.email}
                        </a>
                      </div>
                    )}
                    {brokerObj.address && (
                      <div>
                        <div className="text-xs text-gray-500 font-medium">Address</div>
                        <div className="text-xs text-gray-600">{brokerObj.address}</div>
                      </div>
                    )}
                    {brokerObj.mcNumber && (
                      <div>
                        <div className="text-xs text-gray-500 font-medium">MC #</div>
                        <div className="text-xs text-gray-600 font-mono">{brokerObj.mcNumber}</div>
                      </div>
                    )}
                    {!brokerObj.phone && !brokerObj.email && (
                      <div className="text-xs text-gray-400 italic">No contact info available</div>
                    )}
                  </>
                ) : (
                  <div className="text-xs text-gray-400 italic">No broker assigned</div>
                )}
              </div>
            </div>

            {/* Payment Details (4th column) */}
            <div className="bg-white rounded border border-orange-200 overflow-hidden">
              <div className="bg-orange-50 px-3 py-1.5 border-b border-orange-200">
                <h4 className="font-semibold text-orange-800 text-xs flex items-center gap-1">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Payment
                  
                </h4>
              </div>
              <div className="p-2 space-y-1.5">
                {parseFloat(load.driverCollectionAmount) > 0 && (
                  <div className="flex justify-between items-center bg-orange-50 rounded p-1.5">
                    <span className="text-xs text-orange-700">Driver Pay</span>
                    <span className="font-bold text-orange-800">{parseFloat(load.driverCollectionAmount).toLocaleString(undefined, { style: 'currency', currency: 'USD' })}</span>
                  </div>
                )}
                {parseFloat(load.brokerFeeCollection) > 0 && (
                  <div className="flex justify-between items-center bg-orange-50 rounded p-1.5">
<span className="text-xs text-orange-700">{load.factoringApplied === true ? 'Factoring Fee' : 'Broker Fee'}</span>                    <span className="font-bold text-orange-800">{parseFloat(load.brokerFeeCollection).toLocaleString(undefined, { style: 'currency', currency: 'USD' })}</span>
                  </div>
                )}
                {parseFloat(load.storageFee) > 0 && (
                  <div className="flex justify-between items-center bg-orange-50 rounded p-1.5">
                    <span className="text-xs text-orange-700">Storage Fee</span>
                    <span className="font-bold text-orange-800">{parseFloat(load.storageFee).toLocaleString(undefined, { style: 'currency', currency: 'USD' })}</span>
                  </div>
                )}
                {load.paymentMethod && (
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-gray-500">Method</span>
                    <span className="text-xs font-medium bg-gray-100 px-2 py-0.5 rounded">{load.paymentMethod}</span>
                  </div>
                )}
                {load.paymentTerms && (
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-gray-500">Terms</span>
                    <span className="text-xs font-medium bg-gray-100 px-2 py-0.5 rounded">{load.paymentTerms}</span>
                  </div>
                )}
                {load.collectionInstructions && (
                  <div>
                    <div className="text-xs text-gray-500 font-medium">Instructions</div>
                    <div className="text-xs bg-orange-50 p-1.5 rounded">{load.collectionInstructions}</div>
                  </div>
                )}

                
              </div>
            </div>
          </div>

          {/* ============================================ */}
          {/* VEHICLES (Auto Hauling Only) */}
          {/* ============================================ */}
          {isAutomobileHauling && load.vehicles && load.vehicles.length > 0 && (
            <div className="bg-white rounded border border-gray-200 overflow-hidden">
              <div className="bg-gray-50 px-3 py-1.5 border-b border-gray-200">
                <h4 className="font-semibold text-gray-800 text-xs">Vehicles ({load.vehicles.length})</h4>
              </div>
              <div className="p-2">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
                  {load.vehicles.map((vehicle, idx) => (
                    <VehicleCard key={idx} vehicle={vehicle} index={idx} />
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ============================================ */}
          {/* COMMODITY DETAILS */}
          {/* ============================================ */}
          {(load.reeferTemp || load.weight || load.productType || load.cargoWeight) && (
            <div className="bg-white rounded border border-gray-200 overflow-hidden">
              <div className="bg-gray-50 px-3 py-1.5 border-b border-gray-200">
                <h4 className="font-semibold text-gray-800 text-xs">Commodity Details</h4>
              </div>
              <div className="p-2">
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
                  {load.reeferTemp && <div><span className="text-gray-500">Temp:</span> <span className="font-medium">{load.reeferTemp}°F</span></div>}
                  {load.weight && <div><span className="text-gray-500">Weight:</span> <span className="font-medium">{load.weight} lbs</span></div>}
                  {load.dimensions && <div><span className="text-gray-500">Dimensions:</span> <span className="font-medium">{load.dimensions}</span></div>}
                  {load.productType && <div><span className="text-gray-500">Product:</span> <span className="font-medium">{load.productType}</span></div>}
                  {load.hazmatRequired === 'yes' && <div className="text-red-600 font-medium">⚠️ HAZMAT</div>}
                  {load.cargoWeight && <div><span className="text-gray-500">Cargo:</span> <span className="font-medium">{load.cargoWeight} lbs</span></div>}
                  {load.palletCount && <div><span className="text-gray-500">Pallets:</span> <span className="font-medium">{load.palletCount}</span></div>}
                  {load.trailerType && <div><span className="text-gray-500">Trailer:</span> <span className="font-medium">{load.trailerType}</span></div>}
                </div>
              </div>
            </div>
          )}

          {/* ============================================ */}
          {/* ADMIN NOTES */}
          {/* ============================================ */}
          {load.adminNotes && (
            <div className="bg-white rounded border border-yellow-200 overflow-hidden">
              <div className="bg-yellow-50 px-3 py-1.5 border-b border-yellow-200">
                <h4 className="font-semibold text-yellow-800 text-xs">Admin Notes</h4>
              </div>
              <div className="p-2">
                <p className="whitespace-pre-wrap text-xs text-gray-700">{load.adminNotes}</p>
              </div>
            </div>
          )}

          {/* ============================================ */}
          {/* DOCUMENTS + EMAIL INVOICE + COMPANY SELECTOR */}
          {/* ============================================ */}
          <div className="bg-white rounded border border-gray-200 overflow-hidden">
            <div className="bg-gray-50 px-3 py-1.5 border-b border-gray-200">
              <h4 className="font-semibold text-gray-800 text-xs">Documents</h4>
            </div>
            <div className="p-2">
              <LoadDocuments
                loadId={load.docId}
                currentDocuments={load.gatePassDocuments || []}
                dispatchDocuments={load.dispatchDocuments || []}
                loadNotes={load.loadNotes || ''}
                canManage={canManageLoads}
                loggedInUser={loggedInUser}
                showDispatchDocs={true}
                onUploadComplete={(message) => console.log(message)}
                onError={(error) => alert(error)}
              />

              {/* Links row: Online BOL, BOL, POD, etc. */}
              <div className="flex flex-wrap items-center gap-3 mt-2 text-xs">
                {load.requiredApp && (
                  <span className={`font-semibold px-2 py-0.5 rounded ${
                    load.requiredApp === 'super_dispatch' ? 'bg-purple-100 text-purple-800' :
                    load.requiredApp === 'runbuggy' ? 'bg-yellow-100 text-yellow-800' :
                    load.requiredApp === 'carpool' ? 'bg-green-100 text-green-800' :
                    load.requiredApp === 'ship_cars' ? 'bg-orange-100 text-orange-800' :
                    load.requiredApp === 'acertus' ? 'bg-blue-100 text-blue-800' :
                    load.requiredApp === 'central_dispatch' ? 'bg-cyan-100 text-cyan-800' :
                    'bg-gray-100 text-gray-800'
                  }`}>
                    📱 Required: {load.requiredApp.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                  </span>
                )}
                <a href={`${window.location.origin}/online-bol/${load.docId}`} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline font-medium">
                  📱 Online BOL
                </a>
                {load.bolUrl && <a href={load.bolUrl} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">BOL</a>}
                {load.podUrl && <a href={load.podUrl} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">POD</a>}
                {load.gatePassDocuments?.length > 0 && <span className="text-orange-600">{load.gatePassDocuments.length} Gate Pass</span>}
                {canSeeDispatcherFilter && load.dispatchDocuments?.length > 0 && <span className="text-purple-600">{load.dispatchDocuments.length} Dispatch</span>}
                
                {/* Invoice status badge */}
                {load.invoiceStatus === 'invoiced' && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                    ✓ Invoiced
                  </span>
                )}
              </div>

              {/* ============================================ */}
              {/* EMAIL INVOICE SECTION (Admin only, Delivered loads) */}
              {/* ============================================ */}
{canEmailInvoice && !isLoadingPermission && (load.status === 'Delivered' || load.status === 'In Transit') && (
                <div className="mt-3 pt-3 border-t border-gray-200">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-semibold text-indigo-700">📧 Email Invoice:</span>
                    
                    <label className="flex items-center gap-1.5 text-xs text-gray-700 cursor-pointer bg-gray-50 px-2 py-1.5 rounded border border-gray-200 hover:bg-gray-100">
                      <input
                        type="checkbox"
                        checked={includeInvoice}
                        onChange={(e) => setIncludeInvoice(e.target.checked)}
                        className="w-3.5 h-3.5 text-indigo-600 rounded focus:ring-indigo-500"
                      />
                      <span>Include Invoice</span>
                    </label>
                    
                    <label className="flex items-center gap-1.5 text-xs text-gray-700 cursor-pointer bg-gray-50 px-2 py-1.5 rounded border border-gray-200 hover:bg-gray-100">
                      <input
                        type="checkbox"
                        checked={includeBOL}
                        onChange={(e) => setIncludeBOL(e.target.checked)}
                        className="w-3.5 h-3.5 text-indigo-600 rounded focus:ring-indigo-500"
                      />
                      <span>Include BOL</span>
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
<>📧 {[includeInvoice && 'Invoice', includeBOL && 'BOL'].filter(Boolean).join(' + ') || 'Select docs'}</>                      )}
                    </button>
                  </div>
                </div>
              )}

              {/* ============================================ */}
              {/* COMPANY SELECTOR (Admin only) */}
              {/* ============================================ */}
              {isAdmin && companies && companies.length > 0 && (
                <div className="mt-3 pt-3 border-t border-gray-200">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-gray-700">🏢 Company:</span>
                    <select
                      value={
                        load.companyId ||
                        companies.find(
                          c => (c.name || '').toLowerCase().trim() === (getCurrentCompanyName() || '').toLowerCase().trim()
                        )?.id ||
                        ''
                      }
                      onChange={handleCompanyChange}
                      disabled={isSavingCompany}
                      className={`text-xs border rounded px-2 py-1.5 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 ${
                        isSavingCompany ? 'bg-gray-100 cursor-wait' : 'bg-white cursor-pointer'
                      }`}
                    >
                      <option value="">— Select Company —</option>
                      {[...companies]
                        .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
                        .map(c => (
                          <option key={c.id} value={c.id}>
                            {c.parentCompanyId
                              ? `↳ ${c.name} (subdivision${c.parentCompanyName ? ` of ${c.parentCompanyName}` : ''})`
                              : c.name}
                          </option>
                        ))}
                    </select>
                    {isSavingCompany && (
                      <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-blue-600"></div>
                    )}
                    {getCurrentCompanyName() && !isSavingCompany && (
                      <span className="text-xs text-green-600 font-medium">✓ {getCurrentCompanyName()}</span>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

        </div>
      </td>
    </tr>
  );
};

export default ExpandedLoadDetails;