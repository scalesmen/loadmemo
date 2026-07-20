import React, { useEffect, useState } from 'react';
import { db, auth } from '../firebase';
import {
  collection, query, onSnapshot, orderBy, doc, addDoc, updateDoc,
  serverTimestamp, where, getDoc, getDocs
} from "firebase/firestore";
import { onAuthStateChanged } from 'firebase/auth';

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

const initialTruckState = {
  unitNumber: "",
  yearMake: "",
  color: "",
  vin: "",
  type: "Company Truck",
  subType: "",
  isOwnerDriver: false,
  paymentPerWeek: "",
  hasTrailer: false,
  trailerUnitNumber: "",
  trailerPaymentPerWeek: "",
  ownedBy: "",
  attachedTrailer: "",
  assignedCompanyId: "",
  assignedCompanyName: "",
  fuelCard: "",
  tollDevice: "",
  status: "Inactive",
};

const truckStatuses = ["Active", "Inactive", "In Maintenance", "Sold"];
const truckTypes = ["Company Truck", "Owner Operator", "Leased"];
const companyTruckSubTypes = ["Leased", "Rented", "Financed/Owned"];
const editRoles = ["Super Admin", "Main Admin", "Admin", "Fleet"];

export default function TrucksPage() {
  const [trucks, setTrucks] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loggedInUser, setLoggedInUser] = useState(null);
  const [error, setError] = useState(null);
  const [expandedTruckId, setExpandedTruckId] = useState(null);
  const [statusFilter, setStatusFilter] = useState('All');

  const [showTruckModal, setShowTruckModal] = useState(false);
  const [newTruckData, setNewTruckData] = useState(initialTruckState);
  const [isEditingTruck, setIsEditingTruck] = useState(false);
  const [currentTruckId, setCurrentTruckId] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const [companies, setCompanies] = useState([]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        const userDocRef = doc(db, "users", user.uid);
        const unsubProfile = onSnapshot(userDocRef, (docSnap) => {
          if (docSnap.exists()) {
            setLoggedInUser({ uid: user.uid, ...docSnap.data() });
          } else {
            setLoggedInUser({ uid: user.uid, role: null, roles: [] });
            console.warn("TrucksPage: Logged in user profile not found in Firestore.");
          }
        });
        return () => unsubProfile();
      } else {
        setLoggedInUser(null);
        setIsLoading(false);
        setTrucks([]);
      }
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!loggedInUser) {
      setTrucks([]); setCompanies([]);
      setIsLoading(false); return;
    }

    setIsLoading(true); setError(null);

    const qTrucks = query(
      collection(db, "trucks"), 
      where("tenantId", "==", loggedInUser.tenantId),
      orderBy("unitNumber", "asc")
    );
    const unsubscribeTrucks = onSnapshot(qTrucks, (snapshot) => {
      const trucksData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
        .filter(truck => !truck.isDeleted && truck.status !== "Deleted");
      setTrucks(trucksData);
      setIsLoading(false);
    }, (err) => { 
      console.error("Error fetching trucks: ", err); 
      setError("Failed to fetch trucks."); 
      setIsLoading(false); 
    });

    const qCompanies = query(
      collection(db, "companies"), 
      where("tenantId", "==", loggedInUser.tenantId),
      orderBy("name", "asc")
    );
    const unsubscribeCompanies = onSnapshot(qCompanies, (snapshot) => {
      const companyList = snapshot.docs.map(compDoc => ({ id: compDoc.id, name: compDoc.data().name }));
      setCompanies(companyList);
    });

    return () => { unsubscribeTrucks(); unsubscribeCompanies(); };
  }, [loggedInUser]);

  const handleTruckInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    
    if (name === "assignedCompanyId") {
      const selectedCompany = companies.find(c => c.id === value);
      setNewTruckData(prev => ({ 
        ...prev, 
        assignedCompanyId: value, 
        assignedCompanyName: selectedCompany?.name || "" 
      }));
    } else if (name === "type") {
      setNewTruckData(prev => ({ 
        ...prev, 
        [name]: value,
        subType: "",
        isOwnerDriver: false
      }));
    } else if (name === "hasTrailer") {
      setNewTruckData(prev => ({ 
        ...prev, 
        [name]: checked,
        trailerUnitNumber: checked ? prev.trailerUnitNumber : "",
        trailerPaymentPerWeek: checked ? prev.trailerPaymentPerWeek : ""
      }));
    } else {
      setNewTruckData(prev => ({ 
        ...prev, 
        [name]: type === "checkbox" ? checked : value 
      }));
    }
  };

  const resetTruckForm = () => {
    setNewTruckData(initialTruckState);
    setIsEditingTruck(false);
    setCurrentTruckId(null);
  };

  // UPDATED: Use multi-role checking
  const canManageTrucks = userHasAnyRole(loggedInUser, editRoles);
  const canDeleteTrucks = userHasAnyRole(loggedInUser, ["Super Admin", "Main Admin", "Admin", "Fleet"]);
  const filteredTrucks = statusFilter === 'All' 
    ? trucks 
    : trucks.filter(t => t.status === statusFilter);

  const handleAddTruckClick = () => {
    if (!canManageTrucks) {
      alert("You do not have permission to add trucks.");
      return;
    }
    resetTruckForm();
    setIsEditingTruck(false);
    setShowTruckModal(true);
  };

  const handleTruckFormSubmit = async (e) => {
    e.preventDefault();
    if (!canManageTrucks) {
      alert("You do not have permission to save truck data.");
      return;
    }
    if (!newTruckData.unitNumber?.trim() || !newTruckData.yearMake?.trim()) {
      alert("Unit Number and Year & Make are required.");
      return;
    }
    
    if (newTruckData.type === "Company Truck" && !newTruckData.subType) {
      alert("Please select a sub-type for Company Truck.");
      return;
    }
    
    if (newTruckData.hasTrailer && !newTruckData.trailerUnitNumber?.trim()) {
      alert("Please enter the trailer unit number.");
      return;
    }
    
    setIsProcessing(true);

    const dataToSave = { ...newTruckData };
    dataToSave.attachedTrailer = dataToSave.trailerUnitNumber || "";

    try {
      let actionType = "TRUCK_CREATED";
      let targetId = "";

      if (isEditingTruck && currentTruckId) {
        actionType = "TRUCK_UPDATED";
        targetId = currentTruckId;
        dataToSave.updatedAt = serverTimestamp();
        const { id, createdAt, ...updateData } = dataToSave;
        const truckRef = doc(db, "trucks", currentTruckId);
        await updateDoc(truckRef, updateData);
        alert("Truck updated successfully!");
      } else {
        dataToSave.status = "Inactive";
        dataToSave.tenantId = loggedInUser.tenantId;
        dataToSave.createdAt = serverTimestamp();
        dataToSave.updatedAt = serverTimestamp();
        const newTruckRef = await addDoc(collection(db, "trucks"), dataToSave);
        targetId = newTruckRef.id;
        alert("✅ Truck added successfully!\n\nThe truck has been added as 'Inactive'. When you're ready to use this truck, change its status to 'Active' and your subscription will be updated accordingly.");
      }

      if (loggedInUser && loggedInUser.uid) {
        try {
          await addDoc(collection(db, "auditLogs"), {
            timestamp: serverTimestamp(), 
            userId: loggedInUser.uid, 
            userEmail: loggedInUser.email,
            action: actionType, 
            targetType: "truck", 
            targetId: targetId, 
            tenantId: loggedInUser.tenantId,
            details: { 
              unitNumber: dataToSave.unitNumber, 
              yearMake: dataToSave.yearMake, 
              status: dataToSave.status,
              type: dataToSave.type,
              subType: dataToSave.subType,
              paymentPerWeek: dataToSave.paymentPerWeek
            }
          });
        } catch (logError) { 
          console.error(`Error writing ${actionType} to audit log:`, logError); 
        }
      }
      setShowTruckModal(false);
      resetTruckForm();
    } catch (error) {
      console.error("Error saving truck: ", error);
      alert("Failed to save truck: " + error.message);
    }
    setIsProcessing(false);
  };

  const toggleTruckDetails = (truckId) => setExpandedTruckId(prevId => (prevId === truckId ? null : truckId));

  const handleEditTruck = (truck) => {
    if (!canManageTrucks) { 
      alert("You do not have permission to edit trucks."); 
      return; 
    }
    setIsEditingTruck(true);
    setCurrentTruckId(truck.id);
    setNewTruckData({
      ...initialTruckState,
      ...truck,
      hasTrailer: truck.hasTrailer || (truck.trailerUnitNumber ? true : false),
      trailerUnitNumber: truck.trailerUnitNumber || truck.attachedTrailer || "",
      isOwnerDriver: truck.isOwnerDriver || false,
      subType: truck.subType || "",
      paymentPerWeek: truck.paymentPerWeek || "",
      trailerPaymentPerWeek: truck.trailerPaymentPerWeek || ""
    });
    setShowTruckModal(true);
  };

  const handleToggleStatus = async (truck) => {
    if (!canManageTrucks) { 
      alert("You do not have permission to change truck status."); 
      return; 
    }
    
    const newStatus = truck.status === "Active" ? "Inactive" : "Active";
    const oldStatus = truck.status;
    
    if (newStatus === "Active" && oldStatus === "Inactive") {
      try {
        const tenantRef = doc(db, "tenants", loggedInUser.tenantId);
        const tenantSnap = await getDoc(tenantRef);
        const billing = tenantSnap.data()?.billing || {};
        
        const activeTrucksQuery = query(
          collection(db, "trucks"),
          where("tenantId", "==", loggedInUser.tenantId),
          where("status", "==", "Active")
        );
        const activeTrucksSnap = await getDocs(activeTrucksQuery);
        const currentActiveTrucks = activeTrucksSnap.size;
        
        if (billing.stripeSubscriptionId && billing.status === 'active') {
          const billedTrucks = billing.truckCount || 0;
          const pricePerTruck = billing.pricePerTruck || 39;
          
          if (currentActiveTrucks >= billedTrucks) {
            const confirmed = window.confirm(
              `⚠️ Subscription Update Required\n\n` +
              `You currently pay for ${billedTrucks} truck${billedTrucks !== 1 ? 's' : ''}.\n` +
              `Activating this truck will require upgrading to ${currentActiveTrucks + 1} trucks.\n\n` +
              `New monthly rate: $${(currentActiveTrucks + 1) * pricePerTruck}\n` +
              `Additional cost: $${pricePerTruck}/month\n\n` +
              `Would you like to go to the subscription page to update your plan?`
            );
            
            if (confirmed) {
              window.location.href = '/settings?tab=subscription';
              return;
            } else {
              return;
            }
          }
        } else if (!billing.stripeSubscriptionId && billing.status === 'trial') {
          const daysLeft = billing.trialEndsAt ? 
            Math.ceil((new Date(billing.trialEndsAt.toDate ? billing.trialEndsAt.toDate() : billing.trialEndsAt) - new Date()) / (1000 * 60 * 60 * 24)) : 0;
          
          if (daysLeft > 0) {
            alert(
              `✅ Truck activated!\n\n` +
              `You have ${daysLeft} days left in your trial.\n` +
              `Remember to subscribe before your trial ends to keep using all your trucks.`
            );
          }
        }
      } catch (error) {
        console.error("Error checking subscription:", error);
      }
    }
    
    setIsProcessing(true);
    try {
      const truckRef = doc(db, "trucks", truck.id);
      await updateDoc(truckRef, { status: newStatus, updatedAt: serverTimestamp() });
      
      if (newStatus === "Active") {
        alert(`✅ Truck ${truck.unitNumber} is now Active!`);
      } else {
        alert(`Truck ${truck.unitNumber} is now Inactive.`);
      }
      
      if (loggedInUser) {
        await addDoc(collection(db, "auditLogs"), {
          timestamp: serverTimestamp(), 
          userId: loggedInUser.uid, 
          userEmail: loggedInUser.email,
          action: "TRUCK_STATUS_UPDATED", 
          targetType: "truck", 
          targetId: truck.id, 
          tenantId: loggedInUser.tenantId,
          details: { 
            unitNumber: truck.unitNumber, 
            oldStatus: oldStatus, 
            newStatus: newStatus 
          }
        });
      }
    } catch (err) {
      alert("Failed to update truck status: " + err.message);
      console.error("Error updating truck status:", err);
    }
    setIsProcessing(false);
  };

  const handleDeleteTruck = async (truck) => {
    // UPDATED: Use multi-role checking
    if (!userHasAnyRole(loggedInUser, ["Super Admin", "Main Admin", "Admin", "Fleet"])) {
      alert("You do not have permission to delete trucks.");
      return;
    }
    
    if (truck.status === "Active") {
      alert("Cannot delete an active truck. Please deactivate the truck first.");
      return;
    }
    if (!window.confirm(`Are you sure you want to archive truck "${truck.unitNumber}"? It will no longer appear in the active trucks list but will remain in historical records.`)) {
      return;
    }
    setIsProcessing(true);
    try {
      await updateDoc(doc(db, "trucks", truck.id), {
        isDeleted: true,
        deletedAt: serverTimestamp(),
        deletedBy: loggedInUser.uid,
        deletedByEmail: loggedInUser.email,
        status: "Deleted",
        updatedAt: serverTimestamp()
      });
      
      await addDoc(collection(db, "auditLogs"), {
        timestamp: serverTimestamp(),
        userId: loggedInUser.uid,
        userEmail: loggedInUser.email,
        action: "TRUCK_ARCHIVED",
        targetType: "truck",
        targetId: truck.id,
        tenantId: loggedInUser.tenantId,
        details: {
          unitNumber: truck.unitNumber,
          yearMake: truck.yearMake,
          previousStatus: truck.status,
          archivedAt: new Date().toISOString()
        }
      });
      
      alert(`Truck "${truck.unitNumber}" has been archived successfully.`);
      setExpandedTruckId(null);
    } catch (error) {
      console.error("Error archiving truck:", error);
      alert("Failed to archive truck: " + error.message);
    }
    setIsProcessing(false);
  };

  if (!loggedInUser && isLoading) return <div className="p-6 text-center text-gray-500">Authenticating...</div>;
  if (!loggedInUser && !isLoading) return <div className="p-6 text-center text-gray-500">Please log in to view trucks.</div>;

  return (
    <div className="max-w-full mx-auto py-4 px-1 sm:px-6 lg:px-8">
      <div className="flex flex-col sm:flex-row justify-between items-center mb-6 gap-2">
        <h2 className="text-2xl sm:text-3xl font-bold text-gray-800">Truck Management</h2>
        
        {/* Status Filter */}
        <div className="flex items-center gap-2">
          {['All', 'Active', 'Inactive', 'In Maintenance', 'Sold'].map(status => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={`text-xs px-3 py-1.5 rounded-full border font-medium transition-colors ${
                statusFilter === status
                  ? status === 'Active' ? 'bg-green-100 text-green-800 border-green-300'
                    : status === 'Inactive' ? 'bg-red-100 text-red-800 border-red-300'
                    : status === 'In Maintenance' ? 'bg-yellow-100 text-yellow-800 border-yellow-300'
                    : status === 'Sold' ? 'bg-gray-300 text-gray-800 border-gray-400'
                    : 'bg-gray-200 text-gray-800 border-gray-400'
                  : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
              }`}
            >
              {status}
            </button>
          ))}
        </div>
        
        { canManageTrucks &&
          <button
            onClick={handleAddTruckClick}
            className="bg-blue-500 hover:bg-blue-600 text-white font-medium py-2 px-4 rounded-md text-sm flex items-center shadow-sm"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-5 h-5 mr-2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Add New Truck
          </button>
        }
      </div>

      {isLoading && <div className="p-6 text-center text-gray-500">Loading trucks...</div>}
      {!isLoading && error && <div className="p-6 text-center text-red-500">{error}</div>}

      {!isLoading && !error && filteredTrucks.length === 0 && (
        <div className="p-6 bg-white rounded-lg shadow text-center text-gray-500">
          No trucks found.
          {canManageTrucks && ' Click "Add New Truck" to get started.'}
        </div>
      )}

      {!isLoading && !error && filteredTrucks.length > 0 && (
        <div className="overflow-x-auto bg-white shadow-lg rounded-lg">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-100 border-b border-gray-200">
              <tr>
                <th className="px-2 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider w-12"></th>
                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Unit #</th>
                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider hidden md:table-cell">Year & Make</th>
                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider hidden lg:table-cell">Type</th>
                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider hidden lg:table-cell">Payment/Week</th>
                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider hidden lg:table-cell">Trailer #</th>
                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider hidden md:table-cell">Company</th>
                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                {canManageTrucks && <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredTrucks.map(truck => (
                <React.Fragment key={truck.id}>
                  <tr className="hover:bg-gray-50 transition">
                    <td className="px-2 py-3 whitespace-nowrap">
                      <button onClick={() => toggleTruckDetails(truck.id)} className="text-gray-400 hover:text-blue-600 p-1">
                        <svg className={`w-5 h-5 transform transition-transform duration-200 ${expandedTruckId === truck.id ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7"></path>
                        </svg>
                      </button>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap font-medium text-gray-900">{truck.unitNumber}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-gray-500 hidden md:table-cell">{truck.yearMake}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-gray-500 hidden lg:table-cell">
                      {truck.type}
                      {truck.type === "Company Truck" && truck.subType && ` (${truck.subType})`}
                      {truck.type === "Owner Operator" && truck.isOwnerDriver && " (Driver)"}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-gray-500 hidden lg:table-cell">
                      {truck.paymentPerWeek ? `$${truck.paymentPerWeek}` : "-"}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-gray-500 hidden lg:table-cell">
                      {truck.trailerUnitNumber || truck.attachedTrailer || "-"}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-gray-500 hidden md:table-cell">{truck.assignedCompanyName || truck.assignedCompanyId}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full 
                        ${truck.status === 'Active' ? 'bg-green-100 text-green-800' : 
                          truck.status === 'In Maintenance' ? 'bg-yellow-100 text-yellow-800' :
                          truck.status === 'Inactive' ? 'bg-red-100 text-red-800' :
                          truck.status === 'Sold' ? 'bg-gray-500 text-white' :
                          'bg-gray-100 text-gray-800'}`}>
                        {truck.status}
                      </span>
                    </td>
                    {canManageTrucks && (
                      <td className="px-4 py-3 whitespace-nowrap text-sm font-medium space-x-1">
                        <button onClick={() => handleEditTruck(truck)} className="text-indigo-600 hover:text-indigo-900 text-xs p-1">Edit</button>
                        <button onClick={() => handleToggleStatus(truck)} className={`text-xs p-1 ${truck.status === "Active" ? "text-yellow-600 hover:text-yellow-900" : "text-green-600 hover:text-green-900"}`}>
                          {truck.status === "Active" ? "Set Inactive" : "Set Active"}
                        </button>
                      </td>
                    )}
                  </tr>
                  {expandedTruckId === truck.id && (
                    <tr className="bg-gray-50 border-t border-gray-200">
                      <td colSpan={canManageTrucks ? 10 : 9} className="px-4 sm:px-6 py-4">
                        <div className="text-sm text-gray-700 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                          <div><strong>VIN:</strong> <span className="text-gray-600">{truck.vin || "N/A"}</span></div>
                          <div><strong>Color:</strong> <span className="text-gray-600">{truck.color || "N/A"}</span></div>
                          <div><strong>Owned By:</strong> <span className="text-gray-600">{truck.ownedBy || "N/A"}</span></div>
                          <div><strong>Fuel Card:</strong> <span className="text-gray-600">{truck.fuelCard || "N/A"}</span></div>
                          <div><strong>Toll Device:</strong> <span className="text-gray-600">{truck.tollDevice || "N/A"}</span></div>
                          {truck.trailerPaymentPerWeek && (
                            <div><strong>Trailer Payment/Week:</strong> <span className="text-gray-600">${truck.trailerPaymentPerWeek}</span></div>
                          )}
                        </div>
                        {canDeleteTrucks && (truck.status === "Inactive" || truck.status === "In Maintenance" || truck.status === "Sold") && (
                          <div className="mt-4 pt-4 border-t border-gray-200">
                            <button
                              onClick={() => handleDeleteTruck(truck)}
                              disabled={isProcessing}
                              className="bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white font-medium py-2 px-4 rounded-md text-sm flex items-center"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-4 h-4 mr-2">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
                              </svg>
                              Delete Truck
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add/Edit Truck Modal */}
      {showTruckModal && canManageTrucks && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60 p-4 overflow-y-auto">
          <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-3xl my-8 max-h-[90vh] overflow-y-auto">
            <h3 className="text-xl font-semibold mb-6 text-gray-800">{isEditingTruck ? "Edit Truck Details" : "Add New Truck"}</h3>
            <form onSubmit={handleTruckFormSubmit}>
              <div className="space-y-6">
                {/* Basic Information */}
                <div>
                  <h4 className="text-lg font-medium text-gray-800 mb-3">Basic Information</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <div>
                      <label htmlFor="unitNumber" className="block text-sm font-medium text-gray-700 mb-1">
                        Unit # <span className="text-red-500">*</span>
                      </label>
                      <input 
                        type="text" 
                        name="unitNumber" 
                        id="unitNumber" 
                        required 
                        value={newTruckData.unitNumber} 
                        onChange={handleTruckInputChange} 
                        className="input-class"
                      />
                    </div>
                    <div>
                      <label htmlFor="yearMake" className="block text-sm font-medium text-gray-700 mb-1">
                        Year & Make <span className="text-red-500">*</span>
                      </label>
                      <input 
                        type="text" 
                        name="yearMake" 
                        id="yearMake" 
                        required 
                        value={newTruckData.yearMake} 
                        onChange={handleTruckInputChange} 
                        className="input-class"
                      />
                    </div>
                    <div>
                      <label htmlFor="color" className="block text-sm font-medium text-gray-700 mb-1">Color</label>
                      <input 
                        type="text" 
                        name="color" 
                        id="color" 
                        value={newTruckData.color} 
                        onChange={handleTruckInputChange} 
                        className="input-class"
                      />
                    </div>
                    <div>
                      <label htmlFor="vin" className="block text-sm font-medium text-gray-700 mb-1">VIN</label>
                      <input 
                        type="text" 
                        name="vin" 
                        id="vin" 
                        value={newTruckData.vin} 
                        onChange={handleTruckInputChange} 
                        className="input-class"
                      />
                    </div>
                    <div>
                      <label htmlFor="status" className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                      <select 
                        name="status" 
                        id="status" 
                        value={newTruckData.status} 
                        onChange={handleTruckInputChange} 
                        className="input-class"
                        disabled={!isEditingTruck}
                      >
                        {truckStatuses.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                      {!isEditingTruck && (
                        <p className="text-xs text-gray-500 mt-1">New trucks are added as Inactive by default</p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Truck Type and Related Fields */}
                <div>
                  <h4 className="text-lg font-medium text-gray-800 mb-3">Truck Type & Ownership</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <div>
                      <label htmlFor="type" className="block text-sm font-medium text-gray-700 mb-1">
                        Type <span className="text-red-500">*</span>
                      </label>
                      <select 
                        name="type" 
                        id="type" 
                        value={newTruckData.type} 
                        onChange={handleTruckInputChange} 
                        className="input-class"
                      >
                        {truckTypes.map(type => <option key={type} value={type}>{type}</option>)}
                      </select>
                    </div>

                    {/* Company Truck Sub-type */}
                    {newTruckData.type === "Company Truck" && (
                      <div>
                        <label htmlFor="subType" className="block text-sm font-medium text-gray-700 mb-1">
                          Sub-type <span className="text-red-500">*</span>
                        </label>
                        <select 
                          name="subType" 
                          id="subType" 
                          value={newTruckData.subType} 
                          onChange={handleTruckInputChange} 
                          className="input-class"
                          required
                        >
                          <option value="">Select Sub-type</option>
                          {companyTruckSubTypes.map(subType => (
                            <option key={subType} value={subType}>{subType}</option>
                          ))}
                        </select>
                      </div>
                    )}

                    {/* Owner Operator - Is Owner Driver Too */}
                    {newTruckData.type === "Owner Operator" && (
                      <div className="flex items-center">
                        <input
                          type="checkbox"
                          name="isOwnerDriver"
                          id="isOwnerDriver"
                          checked={newTruckData.isOwnerDriver}
                          onChange={handleTruckInputChange}
                          className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                        />
                        <label htmlFor="isOwnerDriver" className="ml-2 block text-sm text-gray-700">
                          Is owner driver too?
                        </label>
                      </div>
                    )}

                    {/* Payment Per Week */}
                    <div>
                      <label htmlFor="paymentPerWeek" className="block text-sm font-medium text-gray-700 mb-1">
                        Payment/Week ($)
                      </label>
                      <input 
                        type="number" 
                        name="paymentPerWeek" 
                        id="paymentPerWeek" 
                        value={newTruckData.paymentPerWeek} 
                        onChange={handleTruckInputChange} 
                        placeholder="0.00"
                        step="0.01"
                        className="input-class"
                      />
                    </div>

                    <div>
                      <label htmlFor="ownedBy" className="block text-sm font-medium text-gray-700 mb-1">Owned By</label>
                      <input 
                        type="text" 
                        name="ownedBy" 
                        id="ownedBy" 
                        value={newTruckData.ownedBy} 
                        onChange={handleTruckInputChange} 
                        className="input-class"
                      />
                    </div>
                  </div>
                </div>

                {/* Trailer Information */}
                <div>
                  <h4 className="text-lg font-medium text-gray-800 mb-3">Trailer Information</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <div className="flex items-center">
                      <input
                        type="checkbox"
                        name="hasTrailer"
                        id="hasTrailer"
                        checked={newTruckData.hasTrailer}
                        onChange={handleTruckInputChange}
                        className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                      />
                      <label htmlFor="hasTrailer" className="ml-2 block text-sm text-gray-700">
                        Does it have a trailer?
                      </label>
                    </div>

                    {newTruckData.hasTrailer && (
                      <>
                        <div>
                          <label htmlFor="trailerUnitNumber" className="block text-sm font-medium text-gray-700 mb-1">
                            Trailer Unit # <span className="text-red-500">*</span>
                          </label>
                          <input 
                            type="text" 
                            name="trailerUnitNumber" 
                            id="trailerUnitNumber" 
                            value={newTruckData.trailerUnitNumber} 
                            onChange={handleTruckInputChange} 
                            required
                            className="input-class"
                          />
                        </div>
                        <div>
                          <label htmlFor="trailerPaymentPerWeek" className="block text-sm font-medium text-gray-700 mb-1">
                            Trailer Payment/Week ($)
                          </label>
                          <input 
                            type="number" 
                            name="trailerPaymentPerWeek" 
                            id="trailerPaymentPerWeek" 
                            value={newTruckData.trailerPaymentPerWeek} 
                            onChange={handleTruckInputChange} 
                            placeholder="0.00"
                            step="0.01"
                            className="input-class"
                          />
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {/* Assignment Information */}
                <div>
                  <h4 className="text-lg font-medium text-gray-800 mb-3">Assignment & Other Details</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <div>
                      <label htmlFor="assignedCompanyId" className="block text-sm font-medium text-gray-700 mb-1">
                        Assigned Company
                      </label>
                      <select 
                        name="assignedCompanyId" 
                        id="assignedCompanyId" 
                        value={newTruckData.assignedCompanyId} 
                        onChange={handleTruckInputChange} 
                        className="input-class"
                      >
                        <option value="">Select Company</option>
                        {companies.map(comp => <option key={comp.id} value={comp.id}>{comp.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label htmlFor="fuelCard" className="block text-sm font-medium text-gray-700 mb-1">
                        Fuel Card #
                      </label>
                      <input 
                        type="text" 
                        name="fuelCard" 
                        id="fuelCard" 
                        value={newTruckData.fuelCard} 
                        onChange={handleTruckInputChange} 
                        className="input-class"
                      />
                    </div>
                    <div>
                      <label htmlFor="tollDevice" className="block text-sm font-medium text-gray-700 mb-1">
                        Toll Device ID
                      </label>
                      <input 
                        type="text" 
                        name="tollDevice" 
                        id="tollDevice" 
                        value={newTruckData.tollDevice} 
                        onChange={handleTruckInputChange} 
                        className="input-class"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex justify-end space-x-3 pt-6 mt-6 border-t border-gray-200">
                <button 
                  type="button" 
                  onClick={() => {setShowTruckModal(false); resetTruckForm();}} 
                  disabled={isProcessing} 
                  className="bg-gray-200 hover:bg-gray-300 text-gray-700 px-4 py-2 rounded-md text-sm font-medium"
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  disabled={isProcessing} 
                  className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md text-sm font-medium"
                >
                  {isProcessing ? (isEditingTruck ? "Updating..." : "Adding...") : (isEditingTruck ? "Save Changes" : "Add Truck")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// Input field styles
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
if (typeof window !== 'undefined') {
    styleSheet.type = "text/css";
    styleSheet.innerText = styles;
    document.head.appendChild(styleSheet);
}