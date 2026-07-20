// src/components/loads/hooks/useLoadForm.js
import { useState, useCallback } from 'react';
import { getInitialLoadFormState } from '../utils/constants';
import { formatForInput } from '../utils/formatters';

/**
 * Custom hook to manage load form state and operations
 * @param {boolean} isAutomobileHauling - Whether automobile hauling is enabled
 * @returns {Object} Form state and handlers
 */
export const useLoadForm = (isAutomobileHauling) => {
  const [loadForm, setLoadForm] = useState(getInitialLoadFormState());
  const [showLoadModal, setShowLoadModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editDocId, setEditDocId] = useState(null);

  // Handle input changes
  const handleInputChange = useCallback((e) => {
    const { name, value } = e.target;
    setLoadForm(prev => ({ ...prev, [name]: value }));
  }, []);

  // Handle vehicle changes for auto hauling
  const handleVehicleChange = useCallback((index, field, value) => {
    const newVehicles = [...loadForm.vehicles];
    newVehicles[index] = { ...newVehicles[index], [field]: value };
    setLoadForm(prev => ({ ...prev, vehicles: newVehicles }));
  }, [loadForm.vehicles]);

  // Handle vehicle count change
  const handleVehicleCountChange = useCallback((count) => {
    const newCount = parseInt(count);
    const newVehicles = Array(newCount).fill().map((_, i) => 
      loadForm.vehicles[i] || { make: "", model: "", year: "", vin: "", inop: false }
    );
    setLoadForm(prev => ({ ...prev, vehicleCount: newCount, vehicles: newVehicles }));
  }, [loadForm.vehicles]);

  // Reset form to initial state
  const resetForm = useCallback(() => {
    setLoadForm(getInitialLoadFormState());
    setIsEditing(false);
    setEditDocId(null);
  }, []);

  // Populate form for editing
  const populateFormForEdit = useCallback((load) => {
    setLoadForm({
      load_id: load.load_id || "",
      companyName: load.companyName || "",
      companyId: load.companyId || null,
      pickupDateTime: formatForInput(load.pickupDateTime, isAutomobileHauling),
      pickupLocation: load.pickupLocation || "",
      pickupLocationName: load.pickupLocationName || "",
      pickupContactPhone: load.pickupContactPhone || "",
      deliveryDateTime: formatForInput(load.deliveryDateTime, isAutomobileHauling),
      deliveryLocation: load.deliveryLocation || "",
      deliveryLocationName: load.deliveryLocationName || "",
      deliveryContactPhone: load.deliveryContactPhone || "",
      amount: load.amount || "",
      mileage: load.mileage || "",
      brokerId: load.brokerId || "",
      brokerName: load.brokerName || "",
      driverId: load.driverId || "",
      truckId: load.truckId || "",
      dispatcherId: load.dispatcherId || "",
      status: load.status || "Booked",
      pickupInstructions: load.pickupInstructions || "",
      deliveryInstructions: load.deliveryInstructions || "",
      adminNotes: load.adminNotes || "",
      loadNotes: load.loadNotes || "",
      // Payment collection fields
      driverCollectionAmount: load.driverCollectionAmount || "",
      brokerFeeCollection: load.brokerFeeCollection || "",
      collectionInstructions: load.collectionInstructions || "",
      paymentMethod: load.paymentMethod || "",
      paymentTerms: load.paymentTerms || "",
      // Vehicle fields
      vehicles: load.vehicles || [{ make: "", model: "", year: "", vin: "", inop: false }],
      vehicleCount: load.vehicleCount || 1,
      // Reefer fields
      reeferTemp: load.reeferTemp || "",
      reeferTempRange: load.reeferTempRange || "",
      reeferInstructions: load.reeferInstructions || "",
      // Flatbed fields
      weight: load.weight || "",
      dimensions: load.dimensions || "",
      tarpingRequired: load.tarpingRequired || "",
      securementType: load.securementType || "",
      // Tanker fields
      productType: load.productType || "",
      hazmatRequired: load.hazmatRequired || "",
      tankWashRequired: load.tankWashRequired || "",
      // Dry van fields
      cargoWeight: load.cargoWeight || "",
      palletCount: load.palletCount || "",
      trailerType: load.trailerType || "",
      loadingEquipment: load.loadingEquipment || "",
      cargoType: load.cargoType || "",
       // Required app for driver inspections
      requiredApp: load.requiredApp || "",
      // Actual timestamps - preserve these when editing
      actualPU: load.actualPU || null,
      actualDEL: load.actualDEL || null,
      // Factoring fields
      factoringApplied: load.factoringApplied === true,
      factoringRuleId: load.factoringRuleId || null,
      factoringPercentage: load.factoringPercentage || null,
      factoringAmount: load.factoringAmount || null,
      factoringBrokerName: load.factoringBrokerName || null,
      // Storage fee
      storageFee: load.storageFee || "",
      // Don't include attachedPdfMetadata when editing - PDF is already attached
      attachedPdfMetadata: null
    });
    setIsEditing(true);
    setEditDocId(load.docId);
    setShowLoadModal(true);
  }, [isAutomobileHauling]);

  // Populate form from PDF data
  const populateFormFromPDF = useCallback((pdfData, brokers, loggedInUser) => {
    // ============================================================
    // 🛡️ SECURITY: Remove fields that should NEVER come from PDF
    // actualPU and actualDEL must only be set by driver actions
    // ============================================================
    const {
      actualPU,           // Remove - should only be set when driver picks up
      actualDEL,          // Remove - should only be set when driver delivers
      actualPickupTimestamp,  // Remove - legacy field
      actualDeliveryTimestamp, // Remove - legacy field
      createdAt,          // Remove - set by system
      updatedAt,          // Remove - set by system
      createdBy,          // Remove - set by system
      createdByEmail,     // Remove - set by system
      status,             // Remove - always start as "Booked"
      ...safePdfData      // Keep everything else
    } = pdfData;

    if (actualPU || actualDEL) {
      console.warn("⚠️ PDF contained actualPU/actualDEL - these were stripped for safety:", { 
        actualPU, 
        actualDEL 
      });
    }
    // ============================================================

    let brokerMatch = null;
    if (safePdfData.brokerName) {
      brokerMatch = brokers.find(b =>
        b.name && String(b.name).toLowerCase().includes(String(safePdfData.brokerName).toLowerCase())
      );
    }
    
    const amount = safePdfData.amount !== undefined && safePdfData.amount !== null ? 
      Number(String(safePdfData.amount).replace(/[^0-9.-]+/g,"")) : "";
    const mileage = safePdfData.mileage !== undefined && safePdfData.mileage !== null ? 
      Number(String(safePdfData.mileage).replace(/[^0-9.-]+/g,"")) : "";

    // Process payment collection amounts from PDF
    const driverCollectionAmount = isAutomobileHauling && safePdfData.driverCollectionAmount !== undefined && safePdfData.driverCollectionAmount !== null ? 
      Number(String(safePdfData.driverCollectionAmount).replace(/[^0-9.-]+/g,"")) : "";
    const brokerFeeCollection = isAutomobileHauling && safePdfData.brokerFeeCollection !== undefined && safePdfData.brokerFeeCollection !== null ? 
      Number(String(safePdfData.brokerFeeCollection).replace(/[^0-9.-]+/g,"")) : "";

    // Detect if this is automobile hauling from PDF
    const isAutoHaulingFromPDF = safePdfData.vehicles && safePdfData.vehicles.length > 0;

    // Process PDF dates more carefully
    let formattedPickupDateTime = "";
    let formattedDeliveryDateTime = "";

    if (safePdfData.pickupDateTime) {
      if (typeof safePdfData.pickupDateTime?.toDate === 'function') {
        formattedPickupDateTime = formatForInput(safePdfData.pickupDateTime, isAutoHaulingFromPDF);
      } else if (typeof safePdfData.pickupDateTime === 'string') {
        const testDate = new Date(safePdfData.pickupDateTime);
        if (!isNaN(testDate.getTime())) {
          formattedPickupDateTime = formatForInput(testDate, isAutoHaulingFromPDF);
        } else {
          formattedPickupDateTime = safePdfData.pickupDateTime;
        }
      } else {
        formattedPickupDateTime = safePdfData.pickupDateTime;
      }
    }

    if (safePdfData.deliveryDateTime) {
      if (typeof safePdfData.deliveryDateTime?.toDate === 'function') {
        formattedDeliveryDateTime = formatForInput(safePdfData.deliveryDateTime, isAutoHaulingFromPDF);
      } else if (typeof safePdfData.deliveryDateTime === 'string') {
        const testDate = new Date(safePdfData.deliveryDateTime);
        if (!isNaN(testDate.getTime())) {
          formattedDeliveryDateTime = formatForInput(testDate, isAutoHaulingFromPDF);
        } else {
          formattedDeliveryDateTime = safePdfData.deliveryDateTime;
        }
      } else {
        formattedDeliveryDateTime = safePdfData.deliveryDateTime;
      }
    }

    // ============================================================
    // 🆕 Extract PDF metadata for auto-attachment
    // ============================================================
    const attachedPdfMetadata = safePdfData.attachedPdfMetadata || null;
    
    if (attachedPdfMetadata) {
      console.log("📎 PDF metadata captured for auto-attachment:", {
        fileName: attachedPdfMetadata.originalFileName,
        hasUrl: !!attachedPdfMetadata.downloadUrl
      });
    }
    // ============================================================

    setLoadForm({
      ...getInitialLoadFormState(),
      ...safePdfData,  // Use sanitized data (without actualPU/actualDEL)
      status: "Booked", // Always start as Booked - never trust PDF status
      amount: isNaN(amount) ? "" : amount,
      mileage: isNaN(mileage) ? "" : mileage,
      driverCollectionAmount: isAutomobileHauling ? (isNaN(driverCollectionAmount) ? "" : driverCollectionAmount) : "",
      brokerFeeCollection: isAutomobileHauling ? (isNaN(brokerFeeCollection) ? "" : brokerFeeCollection) : "",
      collectionInstructions: isAutomobileHauling ? (safePdfData.collectionInstructions || "") : "",
      paymentMethod: isAutomobileHauling ? (safePdfData.paymentMethod || "") : "",
      paymentTerms: isAutomobileHauling ? (safePdfData.paymentTerms || "") : "",
      pickupContactPhone: safePdfData.pickupContactPhone || "",
      deliveryContactPhone: safePdfData.deliveryContactPhone || "",
      brokerId: brokerMatch ? brokerMatch.id : (safePdfData.brokerId || ""),
      brokerName: safePdfData.brokerName || (brokerMatch ? brokerMatch.name : ""), 
      dispatcherId: safePdfData.dispatcherId || (loggedInUser?.role === "Dispatcher" ? loggedInUser.uid : ""),
      pickupDateTime: formattedPickupDateTime,
      deliveryDateTime: formattedDeliveryDateTime,
       // 🛡️ Explicitly ensure these are null for new loads from PDF
      actualPU: null,
      actualDEL: null,
      // Required app for driver inspections (from Gemini detection)
      requiredApp: safePdfData.requiredApp || "",
      // 🆕 Include PDF metadata for auto-attachment when load is saved
      attachedPdfMetadata: attachedPdfMetadata
        });

    setIsEditing(false);
    setEditDocId(null);
    setShowLoadModal(true);
  }, [isAutomobileHauling]);

  return {
    loadForm,
    setLoadForm,
    showLoadModal,
    setShowLoadModal,
    isEditing,
    setIsEditing,
    editDocId,
    setEditDocId,
    handleInputChange,
    handleVehicleChange,
    handleVehicleCountChange,
    resetForm,
    populateFormForEdit,
    populateFormFromPDF
  };
};