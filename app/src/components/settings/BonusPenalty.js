import React, { useEffect, useState } from 'react';
import { db, auth } from '../../firebase'; // Adjust path if needed
import { applyOwnerImpersonation } from '../../utils/impersonation';
// Ensure addDoc and serverTimestamp are imported for audit logging
import { collection, addDoc, onSnapshot, doc, updateDoc, deleteDoc, serverTimestamp, query, where } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";

export default function BonusPenalty({ tenantId: propTenantId }) {
  const [adjustmentTypes, setAdjustmentTypes] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [currentAdjustment, setCurrentAdjustment] = useState({
    name: "",
    type: "penalty", // 'penalty' or 'bonus'
    amount: "", 
    description: "",
    active: true,
  });
  const [isEditing, setIsEditing] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [loggedInUser, setLoggedInUser] = useState(null);
  const [currentTenantId, setCurrentTenantId] = useState(propTenantId);

  // UPDATED: Get current logged-in user profile and extract tenant
  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      if (user) {
        const unsubProfile = onSnapshot(doc(db, "users", user.uid), (docSnap) => {
          if (docSnap.exists()) {
            const userData = applyOwnerImpersonation({ uid: user.uid, email: user.email, ...docSnap.data() });
            setLoggedInUser(userData);
            
            // UPDATED: Set tenant ID from user data if not provided as prop
            if (!propTenantId && userData.tenantId) {
              setCurrentTenantId(userData.tenantId);
            } else if (!propTenantId && userData.assignedCompanyId) {
              setCurrentTenantId(userData.assignedCompanyId);
            } else if (!propTenantId && userData.assignedCompanyName) {
              setCurrentTenantId(`tenant_${userData.assignedCompanyName.toLowerCase().replace(/\s+/g, '_')}`);
            }
          } else {
            console.warn("BonusPenalty.js: Logged in user profile not found in Firestore.");
            setLoggedInUser({ uid: user.uid, email: user.email, role: null }); // Fallback
          }
        });
        return () => unsubProfile();
      } else {
        setLoggedInUser(null);
        setCurrentTenantId(null);
      }
    });
    return unsubscribeAuth;
  }, [propTenantId]);

  // UPDATED: Fetch adjustment types with tenant filtering
  useEffect(() => {
    if (!loggedInUser || !["Super Admin", "Admin"].includes(loggedInUser.role)) {
      setAdjustmentTypes([]);
      return;
    }

    if (!currentTenantId) {
      console.warn("BonusPenalty: No tenant ID available, skipping data fetch");
      setAdjustmentTypes([]);
      return;
    }

    // UPDATED: Create tenant-aware query
    const adjustmentTypesQuery = loggedInUser.role === "Super Admin" && currentTenantId === "admin_tenant"
      ? collection(db, "adjustmentTypes") // Super admin can see all adjustment types across tenants
      : query(collection(db, "adjustmentTypes"), where("tenantId", "==", currentTenantId));

    const unsubscribe = onSnapshot(
      adjustmentTypesQuery,
      (snapshot) => {
        const typesList = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setAdjustmentTypes(typesList);
      },
      (error) => {
        console.error("Error fetching adjustment types:", error);
        setAdjustmentTypes([]);
      }
    );
    return unsubscribe;
  }, [loggedInUser, currentTenantId]);

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setCurrentAdjustment(prev => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value
    }));
  };

  const resetForm = () => {
    setCurrentAdjustment({ name: "", type: "penalty", amount: "", description: "", active: true });
    setIsEditing(false);
  };

  const openAddModal = () => {
    resetForm();
    setShowModal(true);
  };

  const openEditModal = (adjType) => {
    // UPDATED: Check tenant permissions
    if (adjType.tenantId !== currentTenantId && !(loggedInUser.role === "Super Admin" && currentTenantId === "admin_tenant")) {
      alert("You can only edit adjustment types in your tenant.");
      return;
    }

    setIsEditing(true);
    setCurrentAdjustment({ ...adjType, amount: String(adjType.amount || '') });
    setShowModal(true);
  };

  // UPDATED: Tenant-aware deletion
  const handleDelete = async (typeId, typeName) => {
    const adjustmentToDelete = adjustmentTypes.find(adj => adj.id === typeId);
    
    // UPDATED: Check tenant permissions
    if (adjustmentToDelete && adjustmentToDelete.tenantId !== currentTenantId && !(loggedInUser.role === "Super Admin" && currentTenantId === "admin_tenant")) {
      alert("You can only delete adjustment types in your tenant.");
      return;
    }

    if (!window.confirm(`Are you sure you want to delete the adjustment type: "${typeName || 'this type'}"?`)) return;
    
    setIsProcessing(true);
    try {
      await deleteDoc(doc(db, "adjustmentTypes", typeId));
      alert("Adjustment type deleted successfully!");

      // UPDATED: Tenant-aware audit log entry
      if (loggedInUser && loggedInUser.uid) {
        try {
          await addDoc(collection(db, "auditLogs"), {
            timestamp: serverTimestamp(),
            userId: loggedInUser.uid,
            userEmail: loggedInUser.email,
            action: "ADJUSTMENT_TYPE_DELETED",
            targetType: "adjustmentType",
            targetId: typeId,
            tenantId: currentTenantId, // UPDATED: Add tenant tracking
            details: {
              deletedTypeName: typeName || "Unknown",
              tenantId: currentTenantId
            }
          });
        } catch (logError) {
          console.error("Error writing ADJUSTMENT_TYPE_DELETED to audit log:", logError);
        }
      }

    } catch (error) {
      console.error("Error deleting adjustment type: ", error);
      alert("Failed to delete type: " + error.message);
    }
    setIsProcessing(false);
  };

  // UPDATED: Tenant-aware submission
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!currentAdjustment.name.trim()) {
      alert("Adjustment type name is required.");
      return;
    }

    if (!currentTenantId) {
      alert("Tenant information is missing. Cannot save adjustment type.");
      return;
    }

    const amountToSave = parseFloat(currentAdjustment.amount);
    if (isNaN(amountToSave) || amountToSave < 0) {
        alert("Please enter a valid, non-negative amount.");
        return;
    }

    setIsProcessing(true);
    const originalData = isEditing ? adjustmentTypes.find(adj => adj.id === currentAdjustment.id) : {};
    const dataToSave = {
        name: currentAdjustment.name,
        type: currentAdjustment.type,
        amount: amountToSave,
        description: currentAdjustment.description,
        active: currentAdjustment.active,
        tenantId: currentTenantId, // UPDATED: Add tenant tracking
        updatedAt: serverTimestamp(),
    };

    let actionType = "";
    let targetId = "";
    let logDetails = { 
      typeName: dataToSave.name, 
      adjustmentNature: dataToSave.type, 
      amount: dataToSave.amount,
      tenantId: currentTenantId
    };

    try {
      if (isEditing) {
        actionType = "ADJUSTMENT_TYPE_UPDATED";
        targetId = currentAdjustment.id;
        const typeRef = doc(db, "adjustmentTypes", currentAdjustment.id);
        await updateDoc(typeRef, dataToSave);
        alert("Adjustment type updated successfully!");

        // For update details, compare fields
        const changes = {};
        for (const key in dataToSave) {
            if (dataToSave[key] !== originalData[key] && key !== 'updatedAt') {
                changes[key] = { oldValue: originalData[key], newValue: dataToSave[key] };
            }
        }
        if(Object.keys(changes).length > 0) logDetails.changes = changes;

      } else {
        actionType = "ADJUSTMENT_TYPE_CREATED";
        dataToSave.createdAt = serverTimestamp();
        const newTypeRef = await addDoc(collection(db, "adjustmentTypes"), dataToSave);
        targetId = newTypeRef.id; // Get ID of the newly created document
        alert("Adjustment type added successfully!");
      }

      // UPDATED: Tenant-aware audit log entry
      if (loggedInUser && loggedInUser.uid) {
        try {
          await addDoc(collection(db, "auditLogs"), {
            timestamp: serverTimestamp(),
            userId: loggedInUser.uid,
            userEmail: loggedInUser.email,
            action: actionType,
            targetType: "adjustmentType",
            targetId: targetId,
            tenantId: currentTenantId, // UPDATED: Add tenant tracking
            details: logDetails
          });
        } catch (logError) {
          console.error(`Error writing ${actionType} to audit log:`, logError);
        }
      }

      setShowModal(false);
      resetForm();
    } catch (error) {
      console.error("Error saving adjustment type: ", error);
      alert("Failed to save type: " + error.message);
    }
    setIsProcessing(false);
  };

  if (!loggedInUser) {
    return <div className="p-6 text-center">Loading user information...</div>;
  }

  if (!["Super Admin", "Admin"].includes(loggedInUser.role)) {
    return (
      <div className="p-6 bg-white rounded-lg shadow">
        <p className="text-red-500 font-semibold">Access Denied: You do not have permission to manage bonus/penalty types.</p>
      </div>
    );
  }

  // UPDATED: Handle missing tenant
  if (!currentTenantId) {
    return (
      <div className="p-6 bg-white rounded-lg shadow">
        <div className="text-red-600 mb-2">Tenant information is missing</div>
        <div className="text-sm text-gray-500">Cannot load bonus/penalty management without tenant context</div>
      </div>
    );
  }

  return (
    <div className="p-1">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h3 className="text-xl font-bold text-gray-800">Bonus & Penalty Types</h3>
          {/* UPDATED: Show current tenant */}
          <p className="text-sm text-gray-500 mt-1">Tenant: {currentTenantId}</p>
        </div>
        <button
          onClick={openAddModal}
          className="bg-blue-500 hover:bg-blue-600 text-white font-medium py-2 px-4 rounded-md text-sm flex items-center shadow-sm"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-5 h-5 mr-2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
          Add New Type
        </button>
      </div>
      <p className="text-sm text-gray-600 mb-4">
        Define standard bonus or penalty types for this tenant that can be applied later.
      </p>

      <div className="overflow-x-auto bg-white shadow-lg rounded-lg">
        <table className="min-w-full">
          <thead className="bg-gray-100 border-b border-gray-200">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Name</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Type</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Default Amount</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Description</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Status</th>
              {/* UPDATED: Show Tenant column for Super Admin */}
              {loggedInUser.role === "Super Admin" && currentTenantId === "admin_tenant" && (
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Tenant</th>
              )}
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {adjustmentTypes.length === 0 ? (
              <tr>
                <td colSpan={loggedInUser.role === "Super Admin" && currentTenantId === "admin_tenant" ? 7 : 6} className="text-center text-gray-500 py-10">
                  No bonus or penalty types defined yet for this tenant.
                </td>
              </tr>
            ) : (
              adjustmentTypes.map(adj => (
                <tr key={adj.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{adj.name}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <span className={`capitalize px-2 py-1 rounded-full text-xs font-semibold ${adj.type === 'bonus' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                      {adj.type}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${(adj.amount || 0).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 truncate max-w-xs" title={adj.description}>{adj.description}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                     <span className={`px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${adj.active ? 'bg-green-100 text-green-800' : 'bg-gray-200 text-gray-600'}`}>
                        {adj.active ? 'Active' : 'Inactive'}
                     </span>
                  </td>
                  {/* UPDATED: Show tenant info for Super Admin */}
                  {loggedInUser.role === "Super Admin" && currentTenantId === "admin_tenant" && (
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      <span className="px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded">
                        {adj.tenantId || 'No Tenant'}
                      </span>
                    </td>
                  )}
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                    <button 
                      onClick={() => openEditModal(adj)} 
                      className="text-indigo-600 hover:text-indigo-900 text-xs font-semibold"
                      disabled={adj.tenantId !== currentTenantId && !(loggedInUser.role === "Super Admin" && currentTenantId === "admin_tenant")}
                    >
                      Edit
                    </button>
                    <button 
                      onClick={() => handleDelete(adj.id, adj.name)} 
                      className="text-red-600 hover:text-red-900 text-xs font-semibold"
                      disabled={adj.tenantId !== currentTenantId && !(loggedInUser.role === "Super Admin" && currentTenantId === "admin_tenant")}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Add/Edit Adjustment Type Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60 p-4">
          <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-md">
            <h3 className="text-xl font-semibold mb-6 text-gray-800">{isEditing ? "Edit" : "Add New"} Bonus/Penalty Type</h3>
            {/* UPDATED: Show tenant info in modal */}
            <div className="mb-4 p-3 bg-gray-50 rounded-md">
              <p className="text-sm text-gray-600">
                <span className="font-medium">Tenant:</span> {currentTenantId}
              </p>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="mb-4">
                <label htmlFor="adjName" className="block text-sm font-medium text-gray-700 mb-1">Name <span className="text-red-500">*</span></label>
                <input type="text" name="name" id="adjName" required value={currentAdjustment.name} onChange={handleInputChange} className="border border-gray-300 rounded-md w-full px-3 py-2 text-sm shadow-sm focus:ring-blue-500 focus:border-blue-500" placeholder="e.g., Late Pickup Fee"/>
              </div>
              <div className="mb-4">
                <label htmlFor="adjType" className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                <select name="type" id="adjType" value={currentAdjustment.type} onChange={handleInputChange} className="border border-gray-300 rounded-md w-full px-3 py-2 text-sm shadow-sm focus:ring-blue-500 focus:border-blue-500">
                  <option value="penalty">Penalty</option>
                  <option value="bonus">Bonus</option>
                </select>
              </div>
              <div className="mb-4">
                <label htmlFor="adjAmount" className="block text-sm font-medium text-gray-700 mb-1">Default Amount ($) <span className="text-red-500">*</span></label>
                <input type="number" name="amount" id="adjAmount" required value={currentAdjustment.amount} onChange={handleInputChange} step="0.01" min="0" className="border border-gray-300 rounded-md w-full px-3 py-2 text-sm shadow-sm focus:ring-blue-500 focus:border-blue-500" placeholder="e.g., 100.00"/>
              </div>
              <div className="mb-4">
                <label htmlFor="adjDescription" className="block text-sm font-medium text-gray-700 mb-1">Description (Optional)</label>
                <textarea name="description" id="adjDescription" rows="3" value={currentAdjustment.description} onChange={handleInputChange} className="border border-gray-300 rounded-md w-full px-3 py-2 text-sm shadow-sm focus:ring-blue-500 focus:border-blue-500" placeholder="Details about this adjustment type"/>
              </div>
               <div className="mb-6 flex items-center">
                <input
                    type="checkbox" name="active" id="adjActiveToggleModal"
                    className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 mr-2"
                    checked={currentAdjustment.active}
                    onChange={handleInputChange}
                />
                <label htmlFor="adjActiveToggleModal" className="text-sm text-gray-700">Active</label>
              </div>
              <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200">
                <button type="button" onClick={() => {setShowModal(false); resetForm();}} disabled={isProcessing} className="bg-gray-200 hover:bg-gray-300 text-gray-700 px-4 py-2 rounded-md text-sm font-medium">Cancel</button>
                <button type="submit" disabled={isProcessing} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md text-sm font-medium">
                  {isProcessing ? "Saving..." : (isEditing ? "Save Changes" : "Add Type")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}