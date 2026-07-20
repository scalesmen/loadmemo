// src/components/loads/hooks/useLoadActions.js
// PHASE 2: Auto-tags loads with parentCompanyId when driver is assigned or load is created
import { useCallback, useState } from 'react';
import { db, storage } from '../../../firebase';
import { doc, updateDoc, addDoc, deleteDoc, collection, serverTimestamp } from "firebase/firestore";
import { ref, getDownloadURL } from 'firebase/storage';
import { 
  logAudit, 
  prepareLoadData, 
  getStatusUpdateData, 
  canUserManageLoads,
  determineTenantId,
  userHasAnyRole
} from '../utils/loadHelpers';
import { archiveLoad } from '../../archive/services/archiveService';

// ============================================================================
// HELPER: Check if user is Super Admin
// ============================================================================
const isSuperAdmin = (user) => {
  if (!user) return false;
  const roles = Array.isArray(user.role) ? user.role : [user.role].filter(Boolean);
  return roles.includes('Super Admin');
};

/**
 * Custom hook to handle all load CRUD operations
 * @param {Object} loggedInUser - Current logged in user
 * @param {Array} currentLoads - Current loads array
 * @param {Array} drivers - Available drivers
 * @param {Array} brokers - Available brokers
 * @returns {Object} All load action handlers
 */
export const useLoadActions = (loggedInUser, currentLoads, drivers, brokers) => {
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [loadToDelete, setLoadToDelete] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const canManageLoads = canUserManageLoads(loggedInUser);
  const currentTenantId = determineTenantId(loggedInUser);

  // Handle status change
  const handleStatusChange = useCallback(async (docId, newStatus) => {
    if (!canManageLoads) {
      alert("You do not have permission to change status.");
      return;
    }
    
    setIsProcessing(true);
    try {
      const oldDoc = currentLoads.find(l => l.docId === docId);
      const updateData = getStatusUpdateData(newStatus, oldDoc);
  
      await updateDoc(doc(db, "loads", docId), updateData);
  
      await logAudit({
        userId: loggedInUser?.uid, 
        userEmail: loggedInUser?.email, 
        action: "status_change",
        targetType: "load", 
        targetId: docId, 
        tenantId: currentTenantId,
        details: { 
          loadIdDisplay: oldDoc?.load_id,
          field: "status", 
          oldValue: oldDoc?.status, 
          newValue: newStatus, 
          message: `Status changed to ${newStatus}` 
        }
      });
    } catch (err) { 
      alert("Failed to update status: " + err.message); 
      console.error("Failed to update status for docId " + docId + ":", err);
    } finally {
      setIsProcessing(false);
    }
  }, [canManageLoads, loggedInUser, currentLoads, currentTenantId]);

  // Handle driver change
  // PHASE 2: Also stamps parentCompanyId on the load from the driver's record
  const handleDriverChange = useCallback(async (docId, newDriverId) => {
    if (!canManageLoads) return;
    
    setIsProcessing(true);
    try {
      const oldDoc = currentLoads.find(l => l.docId === docId);
      const selectedDriver = drivers.find(d => d.id === newDriverId);
      const assignedTruckId = selectedDriver?.assignedTruckId || "";

      // PHASE 2: Get parentCompanyId from the driver being assigned
      const driverParentCompanyId = selectedDriver?.parentCompanyId || null;
      const driverParentCompanyName = selectedDriver?.parentCompanyName || null;
      
      const updateData = { 
        driverId: newDriverId, 
        truckId: assignedTruckId, 
        updatedAt: serverTimestamp() 
      };

      // PHASE 2: Tag load with driver's parent company
      // Only set if driver has a parentCompanyId (won't clear existing if driver is untagged)
      if (driverParentCompanyId) {
        updateData.parentCompanyId = driverParentCompanyId;
        updateData.parentCompanyName = driverParentCompanyName;
        console.log(`🏢 Auto-tagging load with parentCompanyId: ${driverParentCompanyName} (${driverParentCompanyId})`);
      }

      await updateDoc(doc(db, "loads", docId), updateData);
      
      await logAudit({
        userId: loggedInUser?.uid, 
        userEmail: loggedInUser?.email, 
        action: "driver_change",
        targetType: "load", 
        targetId: docId, 
        tenantId: currentTenantId,
        details: { 
          loadIdDisplay: oldDoc?.load_id,
          field: "driverId", 
          oldValue: oldDoc?.driverId, 
          newValue: newDriverId, 
          parentCompanyId: driverParentCompanyId,
          parentCompanyName: driverParentCompanyName,
          message: `Changed driver. Updated truck to "${assignedTruckId}".${driverParentCompanyId ? ` Tagged with company: ${driverParentCompanyName}` : ''}` 
        }
      });
    } catch (err) { 
      alert("Failed to update driver: " + err.message); 
    } finally {
      setIsProcessing(false);
    }
  }, [canManageLoads, loggedInUser, drivers, currentLoads, currentTenantId]);

  // Handle truck change
  const handleTruckChange = useCallback(async (docId, newTruckId) => {
    if (!canManageLoads) return;
    
    setIsProcessing(true);
    try {
      const oldDoc = currentLoads.find(l => l.docId === docId);
      
      await updateDoc(doc(db, "loads", docId), { 
        truckId: newTruckId, 
        updatedAt: serverTimestamp() 
      });
      
      await logAudit({
        userId: loggedInUser?.uid, 
        userEmail: loggedInUser?.email, 
        action: "truck_change",
        targetType: "load", 
        targetId: docId, 
        tenantId: currentTenantId,
        details: { 
          loadIdDisplay: oldDoc?.load_id,
          field: "truckId", 
          oldValue: oldDoc?.truckId, 
          newValue: newTruckId, 
          message: `Changed truck.` 
        }
      });
    } catch (err) { 
      alert("Failed to update truck: " + err.message); 
    } finally {
      setIsProcessing(false);
    }
  }, [canManageLoads, loggedInUser, currentLoads, currentTenantId]);

  // Handle broker change
  const handleBrokerChange = useCallback(async (docId, newBrokerId) => {
    if (!canManageLoads) return;
    
    setIsProcessing(true);
    try {
      const oldDoc = currentLoads.find(l => l.docId === docId);
      
      await updateDoc(doc(db, "loads", docId), { 
        brokerId: newBrokerId, 
        updatedAt: serverTimestamp() 
      });
      
      await logAudit({
        userId: loggedInUser?.uid, 
        userEmail: loggedInUser?.email, 
        action: "broker_change",
        targetType: "load", 
        targetId: docId, 
        tenantId: currentTenantId,
        details: { 
          loadIdDisplay: oldDoc?.load_id,
          field: "brokerId", 
          oldValue: oldDoc?.brokerId, 
          newValue: newBrokerId, 
          message: `Changed broker assignment.` 
        }
      });
    } catch (err) { 
      alert("Failed to update broker: " + err.message); 
    } finally {
      setIsProcessing(false);
    }
  }, [canManageLoads, loggedInUser, currentLoads, currentTenantId]);

  // Handle dispatcher change - Admin only
  const handleDispatcherChange = useCallback(async (docId, newDispatcherId) => {
    // ✅ FIXED: Use userHasAnyRole helper to check for Admin or Super Admin
   if (!canManageLoads || !userHasAnyRole(loggedInUser, ['Admin', 'Main Admin', 'Super Admin'])) {
  alert("Only administrators can change dispatcher assignments.");
  return;
}
    
    setIsProcessing(true);
    try {
      const oldDoc = currentLoads.find(l => l.docId === docId);
      
      await updateDoc(doc(db, "loads", docId), { 
        dispatcherId: newDispatcherId, 
        updatedAt: serverTimestamp() 
      });
      
      await logAudit({
        userId: loggedInUser?.uid, 
        userEmail: loggedInUser?.email, 
        action: "dispatcher_change",
        targetType: "load", 
        targetId: docId, 
        tenantId: currentTenantId,
        details: { 
          loadIdDisplay: oldDoc?.load_id,
          field: "dispatcherId", 
          oldValue: oldDoc?.dispatcherId, 
          newValue: newDispatcherId, 
          message: `Changed dispatcher assignment.` 
        }
      });
    } catch (err) { 
      alert("Failed to update dispatcher: " + err.message); 
    } finally {
      setIsProcessing(false);
    }
  }, [canManageLoads, loggedInUser, currentLoads, currentTenantId]);

  // Handle delete click (show confirmation)
  const handleDeleteClick = useCallback((load) => {
    if (!canManageLoads) { 
      alert("You don't have permission."); 
      return; 
    }
    
    // Add safety check
    if (!load || !load.docId) {
      console.error('Invalid load object passed to handleDeleteClick:', load);
      alert("Error: Invalid load data");
      return;
    }
    
    setLoadToDelete(load.docId);
    setShowDeleteModal(true);
  }, [canManageLoads]);

  // Handle archive load (replaces delete)
  const handleDeleteLoad = useCallback(async () => {
    if (!canManageLoads || !loadToDelete) return;
    
    setIsProcessing(true);
    try {
      const oldDoc = currentLoads.find(l => l.docId === loadToDelete);
      const loadRef = doc(db, "loads", loadToDelete);
      
      // STEP 1: Unassign driver and truck BEFORE archiving
      if (oldDoc?.driverId || oldDoc?.truckId) {
        await updateDoc(loadRef, {
          driverId: null,
          truckId: null,
          updatedAt: serverTimestamp()
        });
        
        // Log the unassignment
        await logAudit({
          userId: loggedInUser?.uid, 
          userEmail: loggedInUser?.email, 
          action: "driver_unassigned_before_archive",
          targetType: "load", 
          targetId: loadToDelete, 
          tenantId: currentTenantId,
          details: { 
            loadIdDisplay: oldDoc?.load_id,
            message: `Driver and truck unassigned before archiving load ${oldDoc?.load_id || loadToDelete}`,
            previousDriverId: oldDoc?.driverId,
            previousTruckId: oldDoc?.truckId
          }
        });
      }
      
      // STEP 2: Archive the load
      await archiveLoad(loadToDelete, loggedInUser.uid, loggedInUser.email, currentTenantId);
      
      await logAudit({
        userId: loggedInUser?.uid, 
        userEmail: loggedInUser?.email, 
        action: "archive_load",
        targetType: "load", 
        targetId: loadToDelete, 
        tenantId: currentTenantId,
        details: { 
          loadIdDisplay: oldDoc?.load_id,
          message: `Archived load ${oldDoc?.load_id || loadToDelete}. Will be permanently deleted in 30 days.`, 
          ...oldDoc 
        }
      });
      
      setShowDeleteModal(false);
      setLoadToDelete(null);
      
      alert(`Load archived successfully.\n\nDriver and truck have been unassigned.\n\nThe load will be permanently deleted in 30 days.\n\nYou can restore it from the Archive page before then.`);
    } catch (err) { 
      alert("Failed to archive: " + err.message); 
    } finally {
      setIsProcessing(false);
    }
  }, [canManageLoads, loadToDelete, loggedInUser, currentLoads, currentTenantId]);

  // ============================================================
  // 🆕 Helper function to prepare dispatch document from PDF metadata
  // ============================================================
  const prepareDispatchDocumentFromPdf = useCallback(async (pdfMetadata, loadId) => {
    if (!pdfMetadata) return null;

    try {
      console.log("📎 Preparing dispatch document from PDF metadata:", pdfMetadata.originalFileName);

      let downloadUrl = pdfMetadata.downloadUrl;

      if (!downloadUrl && pdfMetadata.originalStoragePath) {
        try {
          const storageRef = ref(storage, pdfMetadata.originalStoragePath);
          downloadUrl = await getDownloadURL(storageRef);
          console.log("📎 Generated fresh download URL for PDF");
        } catch (urlError) {
          console.warn("⚠️ Could not get download URL for PDF:", urlError.message);
        }
      }

      const dispatchDocument = {
        url: downloadUrl || '',
        fileName: pdfMetadata.originalFileName || 'Imported Dispatch Sheet.pdf',
        fileType: pdfMetadata.fileType || 'application/pdf',
        uploadedAt: pdfMetadata.uploadedAt || new Date().toISOString(),
        uploadedBy: pdfMetadata.uploadedBy || loggedInUser?.email || 'system',
        uploadedById: pdfMetadata.uploadedById || loggedInUser?.uid || 'system',
        storagePath: pdfMetadata.originalStoragePath || '',
        documentType: 'dispatch',
        autoAttached: true,
        source: 'pdf_import'
      };

      console.log("📎 Dispatch document prepared:", {
        fileName: dispatchDocument.fileName,
        hasUrl: !!dispatchDocument.url,
        storagePath: dispatchDocument.storagePath
      });

      return dispatchDocument;
    } catch (error) {
      console.error("❌ Error preparing dispatch document from PDF:", error);
      return null;
    }
  }, [loggedInUser]);

  // Handle load form submit (create/update)
  // PHASE 2: Auto-tags new loads with parentCompanyId
  const handleLoadFormSubmit = useCallback(async (loadForm, isEditing, editDocId) => {
    if (!canManageLoads) return { success: false, error: "You do not have permission!" };

    if (!currentTenantId) {
      return { success: false, error: "Tenant information missing. Cannot create/update load." };
    }

    console.log("🔍 DEBUG: Creating/updating load with tenant ID:", currentTenantId);
    setIsProcessing(true);

    try {
      const data = prepareLoadData(loadForm, brokers, currentTenantId);

      // 🆕 Extract PDF metadata before removing it from load data
      const pdfMetadata = loadForm.attachedPdfMetadata;
      
      // Remove attachedPdfMetadata from the data being saved to Firestore
      delete data.attachedPdfMetadata;

      console.log("🔍 DEBUG: Load data being saved:", {
        load_id: data.load_id,
        tenantId: data.tenantId,
        isEditing: isEditing,
        driverCollectionAmount: data.driverCollectionAmount,
        brokerFeeCollection: data.brokerFeeCollection,
        storageFee: data.storageFee,
        factoringApplied: data.factoringApplied,
        factoringAmount: data.factoringAmount,
        factoringPercentage: data.factoringPercentage,
        hasPdfToAttach: !!pdfMetadata
      });
      
      if (isEditing && editDocId) {
        const { createdAt, ...updateData } = data; 
        const oldDoc = currentLoads.find(l => l.docId === editDocId) || {};

        // PHASE 2: If driver changed during edit, update parentCompanyId
        if (updateData.driverId && updateData.driverId !== oldDoc.driverId) {
          const selectedDriver = drivers.find(d => d.id === updateData.driverId);
          if (selectedDriver?.parentCompanyId) {
            updateData.parentCompanyId = selectedDriver.parentCompanyId;
            updateData.parentCompanyName = selectedDriver.parentCompanyName;
            console.log(`🏢 Auto-tagging edited load with parentCompanyId: ${selectedDriver.parentCompanyName}`);
          }
        }
        
        await updateDoc(doc(db, "loads", editDocId), updateData);
        
        await logAudit({
          userId: loggedInUser?.uid, 
          userEmail: loggedInUser?.email, 
          action: "edit_load",
          targetType: "load", 
          targetId: editDocId, 
          tenantId: currentTenantId,
          details: { 
            loadIdDisplay: updateData.load_id,
            message: `Edited load ${updateData.load_id}`, 
            changes: updateData, 
            tenantId: currentTenantId 
          }
        });
        
        console.log("✅ Load updated successfully");
      } else {
        // ============================================================
        // NEW LOAD CREATION WITH AUTO PDF ATTACHMENT + PHASE 2 COMPANY TAGGING
        // ============================================================

        // PHASE 2: Determine parentCompanyId for the new load
        // Priority: 1) From assigned driver, 2) From creating user's first assigned company
        let loadParentCompanyId = null;
        let loadParentCompanyName = null;

        // Try to get from the assigned driver first
        if (data.driverId) {
          const selectedDriver = drivers.find(d => d.id === data.driverId);
          if (selectedDriver?.parentCompanyId) {
            loadParentCompanyId = selectedDriver.parentCompanyId;
            loadParentCompanyName = selectedDriver.parentCompanyName;
            console.log(`🏢 New load tagged from driver: ${loadParentCompanyName}`);
          }
        }

        // If no driver assigned, use the creating user's first parent company
        if (!loadParentCompanyId && !isSuperAdmin(loggedInUser)) {
          const userCompanyIds = loggedInUser?.assignedParentCompanyIds || [];
          const userCompanyNames = loggedInUser?.assignedParentCompanyNames || [];
          if (userCompanyIds.length > 0) {
            loadParentCompanyId = userCompanyIds[0];
            loadParentCompanyName = userCompanyNames[0] || null;
            console.log(`🏢 New load tagged from creating user's company: ${loadParentCompanyName}`);
          }
        }
        
        const dataForAdd = {
          ...data,
          dispatcherId: data.dispatcherId || (userHasAnyRole(loggedInUser, ["Dispatcher"]) ? loggedInUser.uid : ""),
          createdAt: serverTimestamp(),
          isArchived: false,
          // Initialize document arrays
          dispatchDocuments: [],
          gatePassDocuments: [],
          // PHASE 2: Parent company tagging
          parentCompanyId: loadParentCompanyId,
          parentCompanyName: loadParentCompanyName,
        };

        // 🆕 If we have PDF metadata, prepare and attach the dispatch document
        if (pdfMetadata) {
          console.log("📎 Auto-attaching PDF as dispatch document...");
          
          const dispatchDocument = await prepareDispatchDocumentFromPdf(pdfMetadata, null);
          
          if (dispatchDocument) {
            dataForAdd.dispatchDocuments = [dispatchDocument];
            console.log("📎 PDF will be auto-attached as dispatch document");
          } else {
            console.warn("⚠️ Could not prepare dispatch document from PDF - continuing without attachment");
          }
        }
        
        const newLoadRef = await addDoc(collection(db, "loads"), dataForAdd);
        
        await logAudit({
          userId: loggedInUser?.uid, 
          userEmail: loggedInUser?.email, 
          action: "add_load",
          targetType: "load", 
          targetId: newLoadRef.id, 
          tenantId: currentTenantId,
          details: { 
            loadIdDisplay: dataForAdd.load_id,
            message: `Created new load with ID: ${dataForAdd.load_id}${pdfMetadata ? ' (PDF auto-attached)' : ''}${loadParentCompanyId ? ` [Company: ${loadParentCompanyName}]` : ''}`, 
            tenantId: currentTenantId,
            pdfAutoAttached: !!pdfMetadata,
            parentCompanyId: loadParentCompanyId,
            parentCompanyName: loadParentCompanyName,
            ...dataForAdd 
          }
        });
        
        console.log("✅ Load created successfully with ID:", newLoadRef.id, 
          pdfMetadata ? "(with PDF attached)" : "",
          loadParentCompanyId ? `(company: ${loadParentCompanyName})` : "(no company tag)"
        );
      }
      
      return { success: true };
    } catch (err) {
      console.error("❌ Error saving load:", err);
      return { success: false, error: err.message };
    } finally {
      setIsProcessing(false);
    }
  }, [canManageLoads, brokers, loggedInUser, drivers, currentLoads, currentTenantId, prepareDispatchDocumentFromPdf]);

  return {
    handleStatusChange,
    handleDriverChange,
    handleTruckChange,
    handleBrokerChange,
    handleDispatcherChange,
    handleDeleteClick,
    handleDeleteLoad,
    handleLoadFormSubmit,
    showDeleteModal,
    setShowDeleteModal,
    loadToDelete,
    isProcessing,
    canManageLoads
  };
};