import React, { useEffect, useState } from 'react';
import { db, auth } from '../firebase';
import { applyOwnerImpersonation } from '../utils/impersonation';
import {
  collection, query, onSnapshot, orderBy, doc,
  addDoc, updateDoc, serverTimestamp, where, getDocs, deleteDoc, getDoc, writeBatch
} from "firebase/firestore";
import { onAuthStateChanged } from 'firebase/auth';
import { Link as RouterLink } from 'react-router-dom';

// ✅ CORRECT - ONLY checks 'role' (singular)
const normalizeUserRoles = (user) => {
  if (!user) return [];
  
  // Only check the 'role' field (can be array or string)
  if (Array.isArray(user.role) && user.role.length > 0) {
    return user.role;
  }
  
  // If role is a string (legacy), convert to array
  if (user.role && typeof user.role === 'string') {
    return [user.role];
  }
  
  return [];
};

const userHasAnyRole = (user, rolesToCheck) => {
  const roles = normalizeUserRoles(user);
  return rolesToCheck.some(role => roles.includes(role));
};

const initialDriverState = {
  name: "",
  email: "",
  phone: "",
  assignedCompanyId: "",
  assignedCompanyName: "",
  status: "Active",
  assignedTruckId: "",
  assignedTruckUnit: "",
  licenseNumber: "",
  licenseState: "",
  licenseExp: "",
  medicalExp: "",
  notes: "",
  paymentType: "percentage",
  paymentRate: "",
  driverType: "Company Driver",
  depositAmount: 0,
  depositPaid: 0,
  depositWeeklyIncrement: 0,
  showOnBOL: false
};

const driverStatuses = ["Active", "Inactive", "Pending Confirmation", "On Vacation", "Terminated"];
const editRoles = ["Super Admin", "Main Admin", "Admin", "HR", "Fleet"];

// Helper function for audit logging
async function logAudit({ userId, userEmail, action, targetType, targetId, details, tenantId }) {
  try {
    await addDoc(collection(db, "auditLogs"), {
      userId, userEmail, action, targetType, targetId, details, tenantId,
      timestamp: serverTimestamp()
    });
  } catch (e) { console.error("Audit log error:", e); }
}

export default function DriversPage() {
  const [drivers, setDrivers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loggedInUser, setLoggedInUser] = useState(null);
  const [error, setError] = useState(null);
  const [expandedDriverId, setExpandedDriverId] = useState(null);
    const [statusFilter, setStatusFilter] = useState('All');

  // Bulk company assignment
  const [selectedDriverIds, setSelectedDriverIds] = useState(new Set());
  const [bulkCompanyId, setBulkCompanyId] = useState('');
  const [isBulkAssigning, setIsBulkAssigning] = useState(false);


  // Modal and Form States
  const [showDriverModal, setShowDriverModal] = useState(false);
  const [newDriverData, setNewDriverData] = useState(initialDriverState);
  const [isEditingDriver, setIsEditingDriver] = useState(false);
  const [currentDriverId, setCurrentDriverId] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);

  // For dropdowns
  const [companies, setCompanies] = useState([]);
  const [availableTrucks, setAvailableTrucks] = useState([]);
  const [selectedTruckType, setSelectedTruckType] = useState(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        const userDocRef = doc(db, "users", user.uid);
        const unsubProfile = onSnapshot(userDocRef, (docSnap) => {
          if (docSnap.exists()) {
            setLoggedInUser(applyOwnerImpersonation({ uid: user.uid, ...docSnap.data() }, user.email));
          } else {
            setLoggedInUser({ uid: user.uid, role: null, roles: [] });
            console.warn("DriversPage: Logged in user profile not found in Firestore.");
          }
        });
        return () => unsubProfile();
      } else {
        setLoggedInUser(null);
      }
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!loggedInUser) {
      setDrivers([]); setCompanies([]); setAvailableTrucks([]);
      setIsLoading(false); return;
    }
    setIsLoading(true); setError(null);

    const qDrivers = query(
      collection(db, "drivers"), 
      where("tenantId", "==", loggedInUser.tenantId),
      orderBy("name", "asc")
    );
    const unsubscribeDrivers = onSnapshot(qDrivers, (snapshot) => {
      const driversData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
        .filter(driver => !driver.isDeleted && driver.status !== "Deleted");
      setDrivers(driversData);
      setIsLoading(false);
    }, (err) => { 
      console.error("Error fetching drivers: ", err); 
      setError("Failed to fetch drivers."); 
      setIsLoading(false); 
    });

    const qCompanies = query(
      collection(db, "companies"),
      where("tenantId", "==", loggedInUser.tenantId),
      orderBy("name", "asc")
    );
    const unsubscribeCompanies = onSnapshot(qCompanies, (snapshot) => {
      const companyList = snapshot.docs.map(compDoc => ({ 
        id: compDoc.id, 
        name: compDoc.data().name, 
        active: compDoc.data().active 
      }));
      setCompanies(companyList);
    }, (err) => { 
      console.error("Error fetching companies: ", err); 
    });

    const qTrucks = query(
      collection(db, "trucks"), 
      where("tenantId", "==", loggedInUser.tenantId),
      where("status", "==", "Active"), 
      orderBy("unitNumber", "asc")
    );
    const unsubscribeTrucks = onSnapshot(qTrucks, (snapshot) => {
      const truckList = snapshot.docs.map(truckDoc => ({ 
        id: truckDoc.id, 
        unitNumber: truckDoc.data().unitNumber, 
        status: truckDoc.data().status,
        truckType: truckDoc.data().truckType
      }));
      setAvailableTrucks(truckList);
    }, (err) => { 
      console.error("Error fetching trucks: ", err); 
    });

    return () => { 
      unsubscribeDrivers(); 
      unsubscribeCompanies(); 
      unsubscribeTrucks(); 
    };
  }, [loggedInUser]);

  const handleDriverInputChange = async (e) => {
    const { name, value, type, checked } = e.target;
    
    if (name === "assignedCompanyId") {
      const selectedCompany = companies.find(c => c.id === value);
      setNewDriverData(prev => ({ 
        ...prev, 
        assignedCompanyId: value, 
        assignedCompanyName: selectedCompany?.name || "" 
      }));
    } else if (name === "assignedTruckId") {
      const selectedTruck = availableTrucks.find(t => t.id === value);
      setNewDriverData(prev => ({ 
        ...prev, 
        assignedTruckId: value, 
        assignedTruckUnit: selectedTruck?.unitNumber || ""
      }));
      
      if (value) {
        try {
          const truckDoc = await getDoc(doc(db, "trucks", value));
          if (truckDoc.exists()) {
            const truckData = truckDoc.data();
            setSelectedTruckType(truckData.type || null);
            
            if (truckData.type !== "Owner Operator") {
              setNewDriverData(prev => ({ ...prev, driverType: "Company Driver" }));
            }
          }
        } catch (error) {
          console.error("Error fetching truck details:", error);
        }
      } else {
        setSelectedTruckType(null);
      }
    } else if (name === "paymentRate") {
      const numValue = value.replace(/[^0-9.]/g, '');
      setNewDriverData(prev => ({ ...prev, [name]: numValue }));
    } else if (name === "depositAmount" || name === "depositPaid" || name === "depositWeeklyIncrement") {
      const numValue = parseFloat(value) || 0;
      setNewDriverData(prev => ({ ...prev, [name]: numValue }));
    } else {
      setNewDriverData(prev => ({ 
        ...prev, 
        [name]: type === "checkbox" ? checked : value 
      }));
    }
  };

  const resetDriverForm = () => {
    setNewDriverData(initialDriverState);
    setIsEditingDriver(false);
    setCurrentDriverId(null);
    setSelectedTruckType(null);
  };

  // UPDATED: Use multi-role checking
  const canManageDrivers = userHasAnyRole(loggedInUser, editRoles);
  const canEditDrivers = userHasAnyRole(loggedInUser, editRoles);
  const canDeleteDrivers = userHasAnyRole(loggedInUser, ["Super Admin", "Main Admin", "Admin", "HR"]);
  const filteredDrivers = statusFilter === 'All'
    ? drivers
    : drivers.filter(d => d.status === statusFilter);

  // ============================================================================
  // BULK COMPANY ASSIGNMENT
  // ============================================================================
  const toggleDriverSelection = (driverId) => {
    setSelectedDriverIds(prev => {
      const next = new Set(prev);
      if (next.has(driverId)) next.delete(driverId);
      else next.add(driverId);
      return next;
    });
  };

  const toggleSelectAllFiltered = () => {
    const allIds = filteredDrivers.map(d => d.id);
    const allSelected = allIds.length > 0 && allIds.every(id => selectedDriverIds.has(id));
    setSelectedDriverIds(allSelected ? new Set() : new Set(allIds));
  };

  const clearSelection = () => {
    setSelectedDriverIds(new Set());
    setBulkCompanyId('');
  };

  const handleBulkAssignCompany = async () => {
    if (!canManageDrivers || selectedDriverIds.size === 0 || !bulkCompanyId) return;

    const targetCompany = companies.find(c => c.id === bulkCompanyId);
    if (!targetCompany) return;

    const selectedDrivers = drivers.filter(d => selectedDriverIds.has(d.id));
    if (!window.confirm(
      `Assign ${selectedDrivers.length} driver(s) to "${targetCompany.name}"?\n\nThis changes their Company field only — nothing else on their profile.`
    )) return;

    setIsBulkAssigning(true);
    try {
      const batch = writeBatch(db);
      selectedDrivers.forEach(driver => {
        batch.update(doc(db, 'drivers', driver.id), {
          assignedCompanyId: targetCompany.id,
          assignedCompanyName: targetCompany.name,
          updatedAt: serverTimestamp(),
        });
      });
      await batch.commit();

      await Promise.all(selectedDrivers.map(driver => logAudit({
        userId: loggedInUser.uid,
        userEmail: loggedInUser.email,
        action: "DRIVER_UPDATED",
        targetType: "driver",
        targetId: driver.id,
        details: {
          driverName: driver.name,
          changes: {
            assignedCompanyId: { oldValue: driver.assignedCompanyId || '', newValue: targetCompany.id },
            assignedCompanyName: { oldValue: driver.assignedCompanyName || '', newValue: targetCompany.name }
          }
        },
        tenantId: loggedInUser.tenantId
      })));

      alert(`${selectedDrivers.length} driver(s) assigned to ${targetCompany.name}.`);
      clearSelection();
    } catch (error) {
      console.error('Error bulk-assigning company:', error);
      alert('Failed to assign company: ' + error.message);
    } finally {
      setIsBulkAssigning(false);
    }
  };

  const handleAddDriverClick = () => {
    if (!canManageDrivers) {
      alert("You do not have permission to add drivers.");
      return;
    }
    resetDriverForm();
    setIsEditingDriver(false);
    setShowDriverModal(true);
  };

  const handleEditDriver = async (driver) => {
  if (!canEditDrivers) {
    alert("You do not have permission to edit drivers.");
    return;
  }
  setIsEditingDriver(true);
  setCurrentDriverId(driver.id);
  
  if (driver.assignedTruckId) {
    try {
      const truckDoc = await getDoc(doc(db, "trucks", driver.assignedTruckId));
      if (truckDoc.exists()) {
        setSelectedTruckType(truckDoc.data().type || null);
      }
    } catch (error) {
      console.error("Error fetching truck details:", error);
    }
  }
  
  setNewDriverData({
    name: driver.name || '',
    email: driver.email || '',
    phone: driver.phone || '',
    assignedCompanyId: driver.assignedCompanyId || '',
    assignedCompanyName: driver.assignedCompanyName || '',
    status: driver.status || 'Active',
    assignedTruckId: driver.assignedTruckId || '',
    assignedTruckUnit: driver.assignedTruckUnit || '',
    licenseNumber: driver.licenseNumber || '',
    licenseState: driver.licenseState || '',
    licenseExp: driver.licenseExp || '',
    medicalExp: driver.medicalExp || '',
    notes: driver.notes || '',
    paymentType: driver.paymentType || 'percentage',
    paymentRate: driver.paymentRate || '',
    driverType: driver.driverType || 'Company Driver',
    depositAmount: driver.depositAmount || 0,
    depositPaid: driver.depositPaid || 0,
    depositWeeklyIncrement: driver.depositWeeklyIncrement || 0,
    showOnBOL: driver.showOnBOL !== undefined ? driver.showOnBOL : false  // Add this line
  });
  setShowDriverModal(true);
};

  const handleDriverFormSubmit = async (e) => {
    e.preventDefault();
    if (!canEditDrivers) {
      alert("You do not have permission to save driver data.");
      return;
    }
    if (!newDriverData.name?.trim() || !newDriverData.email?.trim() || !newDriverData.phone?.trim()) {
      alert("Name, Email, and Phone are required.");
      return;
    }
    
    if (!newDriverData.paymentRate || parseFloat(newDriverData.paymentRate) <= 0) {
      alert("Please enter a valid payment rate.");
      return;
    }
    
    setIsProcessing(true);

    // Check truck assignment conflict
    if (newDriverData.assignedTruckId) {
      const truckQueryConditions = [
        where("assignedTruckId", "==", newDriverData.assignedTruckId),
        where("status", "==", "Active")
      ];
      
      const truckQuery = query(collection(db, "drivers"), ...truckQueryConditions);
      const truckQuerySnapshot = await getDocs(truckQuery);
      
      let conflictingDriver = null;
      if (!truckQuerySnapshot.empty) {
        if (isEditingDriver && currentDriverId) {
          conflictingDriver = truckQuerySnapshot.docs.find(d => d.id !== currentDriverId);
        } else {
          conflictingDriver = truckQuerySnapshot.docs[0];
        }
      }

      if (conflictingDriver) {
        alert(`Truck ${newDriverData.assignedTruckUnit || newDriverData.assignedTruckId} is already assigned to active driver: ${conflictingDriver.data().name}. Please unassign it first or choose another truck.`);
        setIsProcessing(false);
        return;
      }
    }

    try {
      const dataToSave = {
        ...newDriverData,
        paymentRate: parseFloat(newDriverData.paymentRate),
        depositAmount: parseFloat(newDriverData.depositAmount) || 0,
        depositPaid: parseFloat(newDriverData.depositPaid) || 0,
        depositWeeklyIncrement: parseFloat(newDriverData.depositWeeklyIncrement) || 0
      };

      if (isEditingDriver && currentDriverId) {
        const dataToUpdate = { ...dataToSave, updatedAt: serverTimestamp() };
        delete dataToUpdate.id;
        await updateDoc(doc(db, "drivers", currentDriverId), dataToUpdate);
        await logAudit({ 
          userId: loggedInUser.uid, 
          userEmail: loggedInUser.email, 
          action: "DRIVER_UPDATED", 
          targetType: "driver", 
          targetId: currentDriverId, 
          details: { driverName: dataToUpdate.name, changes: dataToUpdate }, 
          tenantId: loggedInUser.tenantId 
        });
        alert("Driver updated successfully!");
      } else {
        const dataToCreate = { 
          ...dataToSave,
          tenantId: loggedInUser.tenantId,
          createdAt: serverTimestamp(), 
          updatedAt: serverTimestamp() 
        };
        const newDriverRef = await addDoc(collection(db, "drivers"), dataToCreate);
        await logAudit({ 
          userId: loggedInUser.uid, 
          userEmail: loggedInUser.email, 
          action: "DRIVER_CREATED", 
          targetType: "driver", 
          targetId: newDriverRef.id, 
          details: { driverName: dataToCreate.name, ...dataToCreate }, 
          tenantId: loggedInUser.tenantId 
        });
        alert("Driver added successfully!");
      }
      setShowDriverModal(false);
      resetDriverForm();
    } catch (error) {
      console.error("Error saving driver: ", error);
      alert("Failed to save driver: " + error.message);
    }
    setIsProcessing(false);
  };

  const handleToggleDriverStatus = async (driver) => {
    if (!canEditDrivers) {
      alert("You do not have permission to change driver status.");
      return;
    }
    const newStatus = driver.status === "Active" ? "Inactive" : "Active";
    if (!window.confirm(`Set driver "${driver.name}" status to ${newStatus}?`)) return;
    
    if (newStatus === "Inactive" && driver.assignedTruckId) {
      if(!window.confirm(`Driver ${driver.name} is assigned to truck ${driver.assignedTruckUnit || driver.assignedTruckId}. Setting driver to Inactive will also unassign them from this truck. Continue?`)){
        return;
      }
    }

    setIsProcessing(true);
    try {
      const updateData = {
        status: newStatus,
        updatedAt: serverTimestamp()
      };
      if (newStatus === "Inactive" && driver.assignedTruckId) {
        updateData.assignedTruckId = "";
        updateData.assignedTruckUnit = "";
      }

      await updateDoc(doc(db, "drivers", driver.id), updateData);
      await logAudit({
        userId: loggedInUser.uid,
        userEmail: loggedInUser.email,
        action: "DRIVER_STATUS_TOGGLED",
        targetType: "driver",
        targetId: driver.id, 
        tenantId: loggedInUser.tenantId,
        details: { 
          driverName: driver.name, 
          previousStatus: driver.status, 
          newStatus: newStatus, 
          unassignedTruck: (newStatus === "Inactive" && driver.assignedTruckId) ? driver.assignedTruckUnit || driver.assignedTruckId : null 
        }
      });
      alert(`Driver status changed to ${newStatus}.${(newStatus === "Inactive" && driver.assignedTruckId) ? " Truck unassigned." : ""}`);
    } catch (error) {
      alert("Failed to update status: " + error.message);
    }
    setIsProcessing(false);
  };

  const handleDeleteDriver = async (driver) => {
    // UPDATED: Use multi-role checking
    if (!userHasAnyRole(loggedInUser, ["Super Admin", "Main Admin", "Admin", "HR"])) {
      alert("You do not have permission to delete drivers.");
      return;
    }

    if (driver.status === "Active") {
      alert("Cannot delete an active driver. Please deactivate the driver first.");
      return;
    }

    if (!window.confirm(`Are you sure you want to archive driver "${driver.name}"? They will no longer appear in the active drivers list but will remain in historical records.`)) {
      return;
    }

    setIsProcessing(true);
    try {
      await updateDoc(doc(db, "drivers", driver.id), {
        isDeleted: true,
        deletedAt: serverTimestamp(),
        deletedBy: loggedInUser.uid,
        deletedByEmail: loggedInUser.email,
        status: "Deleted",
        updatedAt: serverTimestamp()
      });
      
      await logAudit({
        userId: loggedInUser.uid,
        userEmail: loggedInUser.email,
        action: "DRIVER_ARCHIVED",
        targetType: "driver",
        targetId: driver.id,
        tenantId: loggedInUser.tenantId,
        details: {
          driverName: driver.name,
          driverEmail: driver.email,
          previousStatus: driver.status,
          archivedAt: new Date().toISOString()
        }
      });
      
      alert(`Driver "${driver.name}" has been archived successfully.`);
      setExpandedDriverId(null);
    } catch (error) {
      console.error("Error archiving driver:", error);
      alert("Failed to archive driver: " + error.message);
    }
    setIsProcessing(false);
  };

  const toggleDriverDetails = (driverId) => setExpandedDriverId(prevId => (prevId === driverId ? null : driverId));

  const formatPaymentTerms = (driver) => {
    if (!driver.paymentRate) return "Not Set";
    if (driver.paymentType === 'percentage') {
      return `${driver.paymentRate}% of gross`;
    } else {
      return `$${driver.paymentRate}/mile`;
    }
  };

  const formatDepositInfo = (driver) => {
    if (!driver.depositAmount || driver.depositAmount === 0) return "No deposit";
    const remaining = (driver.depositAmount || 0) - (driver.depositPaid || 0);
    return `$${driver.depositPaid || 0} / $${driver.depositAmount} (Remaining: $${remaining})`;
  };

  if (!loggedInUser && isLoading) return <div className="p-6 text-center text-gray-500">Authenticating...</div>;
  if (!loggedInUser && !isLoading) return <div className="p-6 text-center text-gray-500">Please log in to view drivers.</div>;

  return (
    <div className="max-w-full mx-auto py-4 px-1 sm:px-6 lg:px-8">
      <div className="flex flex-col sm:flex-row justify-between items-center mb-6 gap-2">
        <h2 className="text-2xl sm:text-3xl font-bold text-gray-800">Driver Management</h2>
        
        {/* Status Filter */}
        <div className="flex items-center gap-2">
          {['All', 'Active', 'Inactive', 'Pending Confirmation', 'On Vacation', 'Terminated'].map(status => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={`text-xs px-3 py-1.5 rounded-full border font-medium transition-colors ${
                statusFilter === status
                  ? status === 'Active' ? 'bg-green-100 text-green-800 border-green-300'
                    : status === 'Inactive' || status === 'Terminated' ? 'bg-red-100 text-red-800 border-red-300'
                    : status === 'Pending Confirmation' ? 'bg-yellow-100 text-yellow-800 border-yellow-300'
                    : status === 'On Vacation' ? 'bg-blue-100 text-blue-800 border-blue-300'
                    : 'bg-gray-200 text-gray-800 border-gray-400'
                  : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
              }`}
            >
              {status}
            </button>
          ))}
        </div>
        {canManageDrivers && (
          <button
            onClick={handleAddDriverClick}
            className="bg-blue-500 hover:bg-blue-600 text-white font-medium py-2 px-4 rounded-md text-sm flex items-center shadow-sm"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-5 h-5 mr-2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Add New Driver
          </button>
        )}
      </div>

      {canManageDrivers && selectedDriverIds.size > 0 && (
        <div className="mb-4 bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 flex flex-wrap items-center gap-3">
          <span className="text-sm font-medium text-blue-900">{selectedDriverIds.size} driver(s) selected</span>
          <select
            value={bulkCompanyId}
            onChange={(e) => setBulkCompanyId(e.target.value)}
            disabled={isBulkAssigning}
            className="border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:ring-blue-500 focus:border-blue-500 bg-white"
          >
            <option value="">Assign to company...</option>
            {companies.map(c => (
              <option key={c.id} value={c.id}>
                {c.active === false ? `${c.name} (Inactive)` : c.name}
              </option>
            ))}
          </select>
          <button
            onClick={handleBulkAssignCompany}
            disabled={!bulkCompanyId || isBulkAssigning}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white text-sm font-medium px-4 py-1.5 rounded-md"
          >
            {isBulkAssigning ? 'Applying...' : 'Apply'}
          </button>
          <button
            onClick={clearSelection}
            disabled={isBulkAssigning}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            Clear selection
          </button>
        </div>
      )}

      {isLoading && <div className="p-6 text-center text-gray-500">Loading drivers...</div>}
      {!isLoading && error && <div className="p-6 text-center text-red-500">{error}</div>}

{!isLoading && !error && filteredDrivers.length === 0 && (
          <div className="p-6 bg-white rounded-lg shadow text-center text-gray-500">
          No drivers found. 
          {canManageDrivers && ' Click "Add New Driver" to get started.'}
        </div>
      )}

      {!isLoading && !error && filteredDrivers.length > 0 && (
        <div className="overflow-x-auto bg-white shadow-lg rounded-lg">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-100 border-b border-gray-200">
              <tr>
                {canManageDrivers && (
                  <th className="px-2 py-2 text-left w-8">
                    <input
                      type="checkbox"
                      checked={filteredDrivers.length > 0 && filteredDrivers.every(d => selectedDriverIds.has(d.id))}
                      onChange={toggleSelectAllFiltered}
                      className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500 cursor-pointer"
                    />
                  </th>
                )}
                <th className="px-2 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider w-12"></th>
                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Name</th>
                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider hidden md:table-cell">Email</th>
                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider hidden lg:table-cell">Phone</th>
                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider hidden md:table-cell">Company</th>
                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider hidden lg:table-cell">Type</th>
                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider hidden xl:table-cell">Payment</th>
                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Profile Link</th>
                {canEditDrivers && <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredDrivers.map(driver => (
                <React.Fragment key={driver.id}>
                  <tr className="hover:bg-gray-50 transition">
                    {canManageDrivers && (
                      <td className="px-2 py-3 whitespace-nowrap">
                        <input
                          type="checkbox"
                          checked={selectedDriverIds.has(driver.id)}
                          onChange={() => toggleDriverSelection(driver.id)}
                          onClick={(e) => e.stopPropagation()}
                          className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500 cursor-pointer"
                        />
                      </td>
                    )}
                    <td className="px-2 py-3 whitespace-nowrap">
                      <button onClick={() => toggleDriverDetails(driver.id)} className="text-gray-400 hover:text-blue-600 p-1">
                        <svg className={`w-5 h-5 transform transition-transform duration-200 ${expandedDriverId === driver.id ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7"></path>
                        </svg>
                      </button>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap font-medium text-gray-900">{driver.name}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-gray-500 hidden md:table-cell">{driver.email}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-gray-500 hidden lg:table-cell">{driver.phone}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-gray-500 hidden md:table-cell">{driver.assignedCompanyName || driver.assignedCompanyId || "N/A"}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full 
                        ${driver.status === 'Active' ? 'bg-green-100 text-green-800' : 
                          driver.status === 'Pending Confirmation' ? 'bg-yellow-100 text-yellow-800' :
                          driver.status === 'Inactive' || driver.status === 'Terminated' ? 'bg-red-100 text-red-800' :
                          'bg-gray-100 text-gray-800'}`}>
                        {driver.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500 hidden lg:table-cell">
                      {driver.driverType || 'Company Driver'}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500 hidden xl:table-cell">
                      {formatPaymentTerms(driver)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm">
                      <RouterLink to={`/driver-view/${driver.id}`} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800 hover:underline">
                        View Profile
                      </RouterLink>
                    </td>
                    {canEditDrivers && (
                      <td className="px-4 py-3 whitespace-nowrap text-sm font-medium space-x-1">
                        <button onClick={() => handleEditDriver(driver)} className="text-indigo-600 hover:text-indigo-900 text-xs p-1">Edit</button>
                        <button onClick={() => handleToggleDriverStatus(driver)} className={`text-xs p-1 ${driver.status === "Active" ? "text-yellow-600 hover:text-yellow-900" : "text-green-600 hover:text-green-900"}`}>
                          {driver.status === "Active" ? "Deactivate" : "Activate"}
                        </button>
                      </td>
                    )}
                  </tr>
                  {expandedDriverId === driver.id && (
                    <tr className="bg-gray-50 border-t border-gray-200">
                      <td colSpan={canEditDrivers ? 12 : 10} className="px-4 sm:px-6 py-4">
                        <div className="text-sm text-gray-700 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                          <div className="sm:col-span-2 md:col-span-3">
                            <strong>Driver ID:</strong> <span className="text-gray-900 font-bold">{driver.id}</span>
                          </div>
                          <div><strong>License #:</strong> <span className="text-gray-600">{driver.licenseNumber || "N/A"} {driver.licenseState && `(${driver.licenseState})`}</span></div>
                          <div><strong>License Exp:</strong> <span className="text-gray-600">{driver.licenseExp ? new Date(driver.licenseExp + 'T00:00:00').toLocaleDateString() : "N/A"}</span></div>
                          <div><strong>Medical Exp:</strong> <span className="text-gray-600">{driver.medicalExp ? new Date(driver.medicalExp + 'T00:00:00').toLocaleDateString() : "N/A"}</span></div>
                          <div><strong>Truck #:</strong> <span className="text-gray-600">{driver.assignedTruckUnit || driver.assignedTruckId || "N/A"}</span></div>
                          <div><strong>Payment Terms:</strong> <span className="text-gray-600">{formatPaymentTerms(driver)}</span></div>
                          <div><strong>Driver Type:</strong> <span className="text-gray-600">{driver.driverType || 'Company Driver'}</span></div>
                          <div><strong>Deposit Status:</strong> <span className="text-gray-600">{formatDepositInfo(driver)}</span></div>
                          {driver.depositWeeklyIncrement > 0 && (
                            <div><strong>Weekly Deduction:</strong> <span className="text-gray-600">${driver.depositWeeklyIncrement}</span></div>
                          )}
                          {/* ADD THIS HERE - Show on BOL status */}
  <div className="sm:col-span-2 md:col-span-3">
    <strong>Show on BOL:</strong> 
    <span className={`ml-2 px-2 py-1 rounded-full text-xs ${driver.showOnBOL ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
      {driver.showOnBOL ? '✓ Visible' : '✗ Hidden'}
    </span>
  </div>
                          <div className="sm:col-span-2 md:col-span-3"><strong>Notes:</strong> <span className="text-gray-600 whitespace-pre-wrap">{driver.notes || "N/A"}</span></div>
                          
                          {canDeleteDrivers && (driver.status === "Inactive" || driver.status === "Terminated") && (
                            <div className="sm:col-span-2 md:col-span-3 mt-4 pt-4 border-t border-gray-200">
                              <button
                                onClick={() => handleDeleteDriver(driver)}
                                disabled={isProcessing}
                                className="bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white font-medium py-2 px-4 rounded-md text-sm flex items-center"
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-4 h-4 mr-2">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                                </svg>
                                Delete Driver
                              </button>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showDriverModal && canEditDrivers && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60 p-4 overflow-y-auto">
          <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-3xl my-8">
            <h3 className="text-xl font-semibold mb-6 text-gray-800">{isEditingDriver ? "Edit Driver Profile" : "Add New Driver"}</h3>
            <form onSubmit={handleDriverFormSubmit}>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-4">
                {/* Basic Information */}
                <div className="col-span-full"><h4 className="text-lg font-medium text-gray-700 border-b pb-2">Basic Information</h4></div>
                
                <div><label htmlFor="driverName" className="block text-sm font-medium text-gray-700 mb-1">Full Name <span className="text-red-500">*</span></label><input type="text" name="name" id="driverName" required value={newDriverData.name} onChange={handleDriverInputChange} className="input-class"/></div>
                <div><label htmlFor="driverEmail" className="block text-sm font-medium text-gray-700 mb-1">Email <span className="text-red-500">*</span></label><input type="email" name="email" id="driverEmail" required value={newDriverData.email} onChange={handleDriverInputChange} className="input-class" disabled={isEditingDriver}/></div>
                <div><label htmlFor="driverPhone" className="block text-sm font-medium text-gray-700 mb-1">Phone <span className="text-red-500">*</span></label><input type="tel" name="phone" id="driverPhone" required value={newDriverData.phone} onChange={handleDriverInputChange} className="input-class"/></div>
                
                <div>
                  <label htmlFor="driverCompany" className="block text-sm font-medium text-gray-700 mb-1">Company</label>
                  <select name="assignedCompanyId" id="driverCompany" value={newDriverData.assignedCompanyId} onChange={handleDriverInputChange} className="input-class">
                    <option value="">Select Company</option>
                    {companies.map(comp => (
                      <option key={comp.id} value={comp.id}>
                        {comp.active === false ? `${comp.name} (Inactive)` : comp.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="driverTruck" className="block text-sm font-medium text-gray-700 mb-1">Assigned Truck #</label>
                  <select name="assignedTruckId" id="driverTruck" value={newDriverData.assignedTruckId} onChange={handleDriverInputChange} className="input-class">
                    <option value="">Select Truck</option>
                    {availableTrucks.map(truck => <option key={truck.id} value={truck.id}>{truck.unitNumber}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="driverStatus" className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                  <select name="status" id="driverStatus" value={newDriverData.status} onChange={handleDriverInputChange} className="input-class">
                    {driverStatuses.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>

                {/* Payment Information */}
                <div className="col-span-full mt-4"><h4 className="text-lg font-medium text-gray-700 border-b pb-2">Payment Information</h4></div>
                
                <div>
                  <label htmlFor="paymentType" className="block text-sm font-medium text-gray-700 mb-1">Payment Type <span className="text-red-500">*</span></label>
                  <select name="paymentType" id="paymentType" value={newDriverData.paymentType} onChange={handleDriverInputChange} className="input-class">
                    <option value="percentage">% of Gross</option>
                    <option value="per_mile">$ per Mile</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="paymentRate" className="block text-sm font-medium text-gray-700 mb-1">
                    Payment Rate <span className="text-red-500">*</span>
                    <span className="text-xs text-gray-500 ml-1">
                      ({newDriverData.paymentType === 'percentage' ? 'e.g., 27 for 27%' : 'e.g., 0.60 for $0.60/mile'})
                    </span>
                  </label>
                  <input type="text" name="paymentRate" id="paymentRate" required value={newDriverData.paymentRate} onChange={handleDriverInputChange} className="input-class" placeholder={newDriverData.paymentType === 'percentage' ? "27" : "0.60"}/>
                </div>
                
                {selectedTruckType === 'Owner Operator' && (
                  <div>
                    <label htmlFor="driverType" className="block text-sm font-medium text-gray-700 mb-1">Driver Type</label>
                    <select name="driverType" id="driverType" value={newDriverData.driverType} onChange={handleDriverInputChange} className="input-class">
                      <option value="Company Driver">Company Driver on O/O Truck</option>
                      <option value="Owner Operator">Owner Operator</option>
                    </select>
                  </div>
                )}

                {/* Deposit Information */}
                <div className="col-span-full mt-4"><h4 className="text-lg font-medium text-gray-700 border-b pb-2">Deposit Information</h4></div>
                
                <div>
                  <label htmlFor="depositAmount" className="block text-sm font-medium text-gray-700 mb-1">Total Deposit Amount ($)</label>
                  <input type="number" name="depositAmount" id="depositAmount" value={newDriverData.depositAmount} onChange={handleDriverInputChange} className="input-class" min="0" step="0.01"/>
                </div>
                <div>
                  <label htmlFor="depositPaid" className="block text-sm font-medium text-gray-700 mb-1">Amount Already Paid ($)</label>
                  <input type="number" name="depositPaid" id="depositPaid" value={newDriverData.depositPaid} onChange={handleDriverInputChange} className="input-class" min="0" step="0.01" max={newDriverData.depositAmount}/>
                </div>
                <div>
                  <label htmlFor="depositWeeklyIncrement" className="block text-sm font-medium text-gray-700 mb-1">Weekly Deduction ($)</label>
                  <input type="number" name="depositWeeklyIncrement" id="depositWeeklyIncrement" value={newDriverData.depositWeeklyIncrement} onChange={handleDriverInputChange} className="input-class" min="0" step="0.01"/>
                </div>

                {/* License Information */}
                <div className="col-span-full mt-4"><h4 className="text-lg font-medium text-gray-700 border-b pb-2">License Information</h4></div>
                
                <div><label htmlFor="licenseNumber" className="block text-sm font-medium text-gray-700 mb-1">License #</label><input type="text" name="licenseNumber" id="licenseNumber" value={newDriverData.licenseNumber} onChange={handleDriverInputChange} className="input-class"/></div>
                <div><label htmlFor="licenseState" className="block text-sm font-medium text-gray-700 mb-1">License State</label><input type="text" name="licenseState" id="licenseState" value={newDriverData.licenseState} onChange={handleDriverInputChange} className="input-class" maxLength="2" placeholder="e.g., CA"/></div>
                <div><label htmlFor="licenseExp" className="block text-sm font-medium text-gray-700 mb-1">License Expiry</label><input type="date" name="licenseExp" id="licenseExp" value={newDriverData.licenseExp} onChange={handleDriverInputChange} className="input-class"/></div>
                <div><label htmlFor="medicalExp" className="block text-sm font-medium text-gray-700 mb-1">Medical Card Expiry</label><input type="date" name="medicalExp" id="medicalExp" value={newDriverData.medicalExp} onChange={handleDriverInputChange} className="input-class"/></div>
                {/* BOL Display Settings */}
<div className="col-span-full mt-4"><h4 className="text-lg font-medium text-gray-700 border-b pb-2">BOL Display Settings</h4></div>

<div className="col-span-full">
  <label className="flex items-center space-x-3 cursor-pointer">
    <input
      type="checkbox"
      name="showOnBOL"
      id="showOnBOL"
      checked={newDriverData.showOnBOL}
      onChange={handleDriverInputChange}
      className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 focus:ring-2"
    />
    <span className="text-sm font-medium text-gray-700">
      Show driver information on Bill of Lading (BOL)
    </span>
  </label>
  <p className="text-xs text-gray-500 mt-1 ml-7">
    When unchecked, this driver's information will not appear on online BOLs or printed BOL PDFs
  </p>
</div>
                <div className="col-span-full"><label htmlFor="driverNotes" className="block text-sm font-medium text-gray-700 mb-1">Notes</label><textarea name="notes" id="driverNotes" value={newDriverData.notes || ''} onChange={handleDriverInputChange} rows="3" className="input-class"></textarea></div>
              </div>
              
              <div className="flex justify-end space-x-3 pt-6 mt-4 border-t border-gray-200">
                <button type="button" onClick={() => {setShowDriverModal(false); resetDriverForm();}} disabled={isProcessing} className="bg-gray-200 hover:bg-gray-300 text-gray-700 px-4 py-2 rounded-md text-sm font-medium">Cancel</button>
                <button type="submit" disabled={isProcessing} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md text-sm font-medium">
                  {isProcessing ? (isEditingDriver ? "Updating..." : "Adding...") : (isEditingDriver ? "Save Changes" : "Add Driver")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// Basic CSS for input fields
if (typeof window !== 'undefined' && !document.getElementById('shared-input-styles-drivers')) {
  const styles = `
    .input-class {
      display: block;
      width: 100%;
      padding-left: 0.75rem;
      padding-right: 0.75rem;
      padding-top: 0.5rem;
      padding-bottom: 0.5rem;
      font-size: 0.875rem;
      line-height: 1.25rem;
      border-width: 1px;
      border-color: #D1D5DB;
      border-radius: 0.375rem;
      box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
    }
    .input-class:focus {
      outline: 2px solid transparent;
      outline-offset: 2px;
      border-color: #3B82F6;
      box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.5);
    }
  `;
  const styleSheet = document.createElement("style");
  styleSheet.id = "shared-input-styles-drivers";
  styleSheet.type = "text/css";
  styleSheet.innerText = styles;
  document.head.appendChild(styleSheet);
}