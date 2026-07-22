import React, { useEffect, useState } from 'react';
import { db, auth } from '../../firebase'; // Adjust path if needed
import { applyOwnerImpersonation } from '../../utils/impersonation';
// Ensure addDoc is imported for audit logging
import { collection, onSnapshot, doc, updateDoc, serverTimestamp, addDoc, query, where } from "firebase/firestore";

// Define compensation/salary types - these can be expanded
const salaryTypes = ["Fixed Amount", "Percentage of Load", "Per Mile", "Hourly"]; // Renamed for clarity

// Star Rating Component (Simple Display)
const StarRatingDisplay = ({ rating }) => {
  const totalStars = 5;
  let stars = [];
  const displayRating = Number(rating) || 0; // Ensure rating is a number for comparison
  for (let i = 1; i <= totalStars; i++) {
    stars.push(
      <span key={i} className={`text-2xl ${i <= displayRating ? 'text-yellow-400' : 'text-gray-300'}`}>
        &#9733; {/* Filled star */}
      </span>
    );
  }
  return <div className="flex">{stars}</div>;
};

export default function UserCompensation({ tenantId: propTenantId }) {
  const [users, setUsers] = useState([]);
  const [loggedInUser, setLoggedInUser] = useState(null);
  const [currentTenantId, setCurrentTenantId] = useState(propTenantId);
  const [showModal, setShowModal] = useState(false);
  const [editingUserComp, setEditingUserComp] = useState(null); // User whose compensation is being edited
  const [compensationDetails, setCompensationDetails] = useState({
    userId: '',
    userName: '',
    rating: '', 
    lastRated: null, 
    salaryType: "Fixed Amount",
    salaryValue: '', 
    bonus: '', 
    notes: "" 
  });
  const [isProcessing, setIsProcessing] = useState(false);

  // UPDATED: Get current logged-in user profile and extract tenant
  useEffect(() => {
    const unsubscribeAuth = auth.onAuthStateChanged((user) => {
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
            console.warn("UserCompensation: Logged in user profile not found in Firestore.");
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

  // UPDATED: Fetch users with tenant filtering
  useEffect(() => {
    if (!loggedInUser || !["Super Admin", "Admin"].includes(loggedInUser.role)) {
      setUsers([]);
      return;
    }

    if (!currentTenantId) {
      console.warn("UserCompensation: No tenant ID available, skipping data fetch");
      setUsers([]);
      return;
    }

    // UPDATED: Create tenant-aware query
    const usersQuery = loggedInUser.role === "Super Admin" && currentTenantId === "admin_tenant"
      ? collection(db, "users") // Super admin can see all users across tenants
      : query(collection(db, "users"), where("tenantId", "==", currentTenantId));

    const unsubscribe = onSnapshot(
      usersQuery,
      (snapshot) => {
        const userList = snapshot.docs.map(doc => {
          const data = doc.data();
          const currentRating = data.compensation?.rating;
          const currentSalaryValue = data.compensation?.salaryValue;
          const currentBonus = data.compensation?.bonus;

          return {
            id: doc.id,
            name: data.name,
            email: data.email,
            role: data.role,
            tenantId: data.tenantId, // UPDATED: Include tenant info
            compensation: {
              rating: (currentRating === null || typeof currentRating === 'undefined') ? '' : currentRating,
              lastRated: data.compensation?.lastRated || null,
              salaryType: data.compensation?.salaryType || "Fixed Amount",
              salaryValue: (currentSalaryValue === null || typeof currentSalaryValue === 'undefined') ? '' : currentSalaryValue,
              bonus: (currentBonus === null || typeof currentBonus === 'undefined') ? '' : currentBonus,
              notes: data.compensation?.notes || ""
            }
          };
        });
        
        // Filter out Super Admins and users from other tenants (double-check)
        const filteredUsers = userList.filter(user => {
          if (user.role === "Super Admin") return false;
          
          // UPDATED: Additional tenant filtering for safety
          if (loggedInUser.role !== "Super Admin" || currentTenantId !== "admin_tenant") {
            return user.tenantId === currentTenantId;
          }
          
          return true;
        });
        
        setUsers(filteredUsers);
      },
      (error) => {
        console.error("Error fetching users for compensation:", error);
        setUsers([]);
      }
    );
    return unsubscribe;
  }, [loggedInUser, currentTenantId]);

  const handleInputChange = (e) => {
    const { name, value } = e.target; 
    let processedValue = value;

    if (name === 'rating') {
      if (value === '') {
        processedValue = '';
      } else {
        let numValue = parseInt(value, 10);
        if (isNaN(numValue)) {
          processedValue = ''; 
        } else {
          processedValue = Math.max(0, Math.min(5, numValue));
        }
      }
    } else if (name === 'salaryValue' || name === 'bonus') {
      if (value !== '' && isNaN(parseFloat(value)) && value !== '-') {
        // No change if invalid number part
      }
    }

    setCompensationDetails(prev => ({
      ...prev,
      [name]: processedValue
    }));
  };

  const openCompensationModal = (user) => {
    if (!["Super Admin", "Admin"].includes(loggedInUser?.role)) {
        alert("You do not have permission to manage user compensation.");
        return;
    }

    // UPDATED: Check tenant permissions
    if (user.tenantId !== currentTenantId && !(loggedInUser.role === "Super Admin" && currentTenantId === "admin_tenant")) {
      alert("You can only manage compensation for users in your tenant.");
      return;
    }

    setEditingUserComp(user);
    const comp = user.compensation || {};
    setCompensationDetails({
      userId: user.id,
      userName: user.name,
      rating: (comp.rating === null || typeof comp.rating === 'undefined' || comp.rating === '') ? '' : String(comp.rating),
      salaryType: comp.salaryType || "Fixed Amount",
      salaryValue: (comp.salaryValue === null || typeof comp.salaryValue === 'undefined' || comp.salaryValue === '') ? '' : String(comp.salaryValue),
      bonus: (comp.bonus === null || typeof comp.bonus === 'undefined' || comp.bonus === '') ? '' : String(comp.bonus),
      notes: comp.notes || ""
    });
    setShowModal(true);
  };

  // UPDATED: Tenant-aware compensation submission
  const handleSubmitCompensation = async (e) => {
    e.preventDefault();
    if (!loggedInUser || !["Super Admin", "Admin"].includes(loggedInUser.role)) {
        alert("You do not have permission to save compensation data.");
        return;
    }
    if (!compensationDetails.userId) {
      alert("User ID is missing. Cannot save compensation.");
      return;
    }

    if (!currentTenantId) {
      alert("Tenant information is missing. Cannot save compensation.");
      return;
    }

    setIsProcessing(true);

    const ratingToSave = compensationDetails.rating === '' ? 0 : parseInt(compensationDetails.rating, 10);
    const salaryValueToSave = compensationDetails.salaryValue === '' ? 0 : parseFloat(compensationDetails.salaryValue);
    const bonusToSave = compensationDetails.bonus === '' ? 0 : parseFloat(compensationDetails.bonus);

    if (isNaN(ratingToSave) || isNaN(salaryValueToSave) || isNaN(bonusToSave)) {
        alert("Invalid number format for rating, salary, or bonus. Please enter valid numbers or leave fields empty for 0.");
        setIsProcessing(false);
        return;
    }

    const compensationDataToSave = {
        rating: ratingToSave,
        lastRated: serverTimestamp(),
        salaryType: compensationDetails.salaryType,
        salaryValue: salaryValueToSave,
        bonus: bonusToSave,
        notes: compensationDetails.notes,
        tenantId: currentTenantId, // UPDATED: Include tenant tracking
    };

    try {
      const userRef = doc(db, "users", compensationDetails.userId);
      await updateDoc(userRef, {
        compensation: compensationDataToSave
      });
      alert(`Compensation for ${compensationDetails.userName} updated successfully!`);

      // UPDATED: Tenant-aware audit log entry
      if (loggedInUser && loggedInUser.uid && loggedInUser.email) {
        try {
          await addDoc(collection(db, "auditLogs"), {
            timestamp: serverTimestamp(),
            userId: loggedInUser.uid,
            userEmail: loggedInUser.email,
            action: "USER_COMPENSATION_UPDATED",
            targetType: "user",
            targetId: compensationDetails.userId,
            tenantId: currentTenantId, // UPDATED: Add tenant tracking
            details: {
              updatedUserName: compensationDetails.userName,
              newCompensation: compensationDataToSave,
              tenantId: currentTenantId
            }
          });
          console.log(`Audit log: USER_COMPENSATION_UPDATED for ${compensationDetails.userName} by ${loggedInUser.email} in tenant ${currentTenantId}`);
        } catch (logError) {
          console.error("Error writing USER_COMPENSATION_UPDATED to audit log:", logError);
        }
      } else {
        console.warn("Audit log skipped: loggedInUser details not fully available for USER_COMPENSATION_UPDATED.");
      }

      setShowModal(false);
      setEditingUserComp(null);
    } catch (error) {
      console.error("Error saving user compensation:", error);
      alert("Failed to save compensation: " + error.message);
    }
    setIsProcessing(false);
  };

  if (!loggedInUser) {
    return <div className="p-6 text-center">Loading user information...</div>;
  }

  if (!["Super Admin", "Admin"].includes(loggedInUser.role)) {
    return (
      <div className="p-6 bg-white rounded-lg shadow">
        <p className="text-red-500 font-semibold">Access Denied: You do not have permission to manage user compensation.</p>
      </div>
    );
  }

  // UPDATED: Handle missing tenant
  if (!currentTenantId) {
    return (
      <div className="p-6 bg-white rounded-lg shadow">
        <div className="text-red-600 mb-2">Tenant information is missing</div>
        <div className="text-sm text-gray-500">Cannot load user compensation without tenant context</div>
      </div>
    );
  }

  return (
    <div className="p-1">
      <div className="flex justify-between items-center mb-2">
        <div>
          <h3 className="text-xl font-bold text-gray-800">Internal User Compensation & Performance</h3>
          {/* UPDATED: Show current tenant */}
          <p className="text-sm text-gray-500 mt-1">Tenant: {currentTenantId}</p>
        </div>
      </div>
      <p className="text-sm text-gray-600 mb-6">
        Manage weekly ratings, salary structures, and bonuses for internal site users in this tenant.
      </p>

      <div className="overflow-x-auto bg-white shadow-lg rounded-lg">
        <table className="min-w-full">
          <thead className="bg-gray-100 border-b border-gray-200">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Name</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Role</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Rating (1-5)</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Last Rated</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Salary Type</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Salary Value</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Bonus ($)</th>
              {/* UPDATED: Show Tenant column for Super Admin */}
              {loggedInUser.role === "Super Admin" && currentTenantId === "admin_tenant" && (
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Tenant</th>
              )}
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {users.length === 0 ? (
              <tr>
                <td colSpan={loggedInUser.role === "Super Admin" && currentTenantId === "admin_tenant" ? 9 : 8} className="text-center text-gray-500 py-10">
                  No users available to set compensation for in this tenant.
                </td>
              </tr>
            ) : (
              users.map(user => (
                <tr key={user.id} className="hover:bg-gray-50 transition duration-150 ease-in-out">
                  <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">{user.name}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">{user.role}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                    <StarRatingDisplay rating={user.compensation?.rating} />
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                    {user.compensation?.lastRated?.toDate().toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">{user.compensation?.salaryType}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                    {user.compensation?.salaryType === 'Percentage of Load' ? `${user.compensation?.salaryValue || ''}%` : `$${(user.compensation?.salaryValue === '' ? 0 : Number(user.compensation?.salaryValue || 0)).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">${(user.compensation?.bonus === '' ? 0 : Number(user.compensation?.bonus || 0)).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                  {/* UPDATED: Show tenant info for Super Admin */}
                  {loggedInUser.role === "Super Admin" && currentTenantId === "admin_tenant" && (
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                      <span className="px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded">
                        {user.tenantId || 'No Tenant'}
                      </span>
                    </td>
                  )}
                  <td className="px-4 py-3 whitespace-nowrap text-sm font-medium">
                    <button 
                      onClick={() => openCompensationModal(user)} 
                      className="bg-indigo-500 hover:bg-indigo-600 text-white text-xs font-semibold py-1 px-3 rounded-md shadow-sm"
                      disabled={user.tenantId !== currentTenantId && !(loggedInUser.role === "Super Admin" && currentTenantId === "admin_tenant")}
                    >
                      Edit Comp
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Set/Edit Compensation Modal */}
      {showModal && editingUserComp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60 p-4">
          <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-lg">
            <h3 className="text-xl font-semibold mb-6 text-gray-800">
              Edit Compensation for {compensationDetails.userName}
            </h3>
            {/* UPDATED: Show tenant info in modal */}
            <div className="mb-4 p-3 bg-gray-50 rounded-md">
              <p className="text-sm text-gray-600">
                <span className="font-medium">Tenant:</span> {editingUserComp.tenantId || currentTenantId}
              </p>
            </div>
            <form onSubmit={handleSubmitCompensation}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
                <div>
                  <label htmlFor="rating" className="block text-sm font-medium text-gray-700 mb-1">Rating (0-5)</label>
                  <input
                    type="number" id="rating" name="rating"
                    min="0" max="5" step="1"
                    value={compensationDetails.rating} 
                    onChange={handleInputChange}
                    className="border border-gray-300 rounded-md w-full px-3 py-2 text-sm shadow-sm focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label htmlFor="salaryType" className="block text-sm font-medium text-gray-700 mb-1">Salary Type</label>
                  <select
                    id="salaryType" name="salaryType"
                    value={compensationDetails.salaryType}
                    onChange={handleInputChange}
                    className="border border-gray-300 rounded-md w-full px-3 py-2 text-sm shadow-sm focus:ring-blue-500 focus:border-blue-500"
                  >
                    {salaryTypes.map(type => (
                      <option key={type} value={type}>{type}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="salaryValue" className="block text-sm font-medium text-gray-700 mb-1">
                    {compensationDetails.salaryType === 'Percentage of Load' ? 'Percentage (%)' : 'Salary Value ($)'}
                  </label>
                  <input
                    type="number" id="salaryValue" name="salaryValue"
                    value={compensationDetails.salaryValue} 
                    onChange={handleInputChange}
                    step="any"
                    className="border border-gray-300 rounded-md w-full px-3 py-2 text-sm shadow-sm focus:ring-blue-500 focus:border-blue-500"
                    placeholder={compensationDetails.salaryType === 'Percentage of Load' ? 'e.g., 10 for 10%' : 'e.g., 50000'}
                  />
                </div>
                <div>
                  <label htmlFor="bonus" className="block text-sm font-medium text-gray-700 mb-1">Bonus ($)</label>
                  <input
                    type="number" id="bonus" name="bonus"
                    value={compensationDetails.bonus} 
                    onChange={handleInputChange}
                    step="any"
                    className="border border-gray-300 rounded-md w-full px-3 py-2 text-sm shadow-sm focus:ring-blue-500 focus:border-blue-500"
                    placeholder="e.g., 500"
                  />
                </div>
              </div>

              <div className="mt-6 mb-6">
                <label htmlFor="compNotes" className="block text-sm font-medium text-gray-700 mb-1">Notes (Optional)</label>
                <textarea
                  id="compNotes" name="notes" rows="3"
                  value={compensationDetails.notes}
                  onChange={handleInputChange}
                  className="border border-gray-300 rounded-md w-full px-3 py-2 text-sm shadow-sm focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Any additional details about this compensation (e.g., weekly, bi-weekly)"
                />
              </div>

              <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200">
                <button type="button" onClick={() => {setShowModal(false); setEditingUserComp(null);}} disabled={isProcessing} className="bg-gray-200 hover:bg-gray-300 text-gray-700 px-4 py-2 rounded-md text-sm font-medium">Cancel</button>
                <button type="submit" disabled={isProcessing} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md text-sm font-medium">
                  {isProcessing ? "Saving..." : "Save Compensation"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}