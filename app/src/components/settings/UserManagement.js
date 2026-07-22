import React, { useEffect, useState } from 'react';
import { auth, db } from '../../firebase';
import { applyOwnerImpersonation } from '../../utils/impersonation';
import { collection, onSnapshot, addDoc, doc, updateDoc, serverTimestamp, query, where } from "firebase/firestore";
import { getFunctions, httpsCallable } from 'firebase/functions';
import { v4 as uuidv4 } from 'uuid';

const allRoles = ["Super Admin", "Main Admin", "Admin", "Dispatcher", "Accountant", "HR", "Fleet"];
const ALL_COMPANIES_OPTION = "All Companies";
const MAX_ROLES = 4; // Maximum number of roles a user can have

const TENANT_PERMISSIONS = [
  {
    key: 'canEmailInvoice',
    label: '📧 Email Invoice & BOL',
    description: 'Send invoices and BOL documents to brokers via email',
    defaultRoles: ['Super Admin']
  },
  {
    key: 'canEditPaymentTerms',
    label: '💰 Edit Payment Amount & Terms',
    description: 'Change payment amount, payment terms, and payment method on loads',
    defaultRoles: ['Super Admin']
  }
];

// Helper function to normalize user roles (handles backward compatibility)
const normalizeUserRoles = (user) => {
  if (!user) return [];
  
  // If user.role is already an array, use it
  if (Array.isArray(user.role)) {
    return user.role;
  }
  
  // If user.role is a string (old format), convert to array
  if (user.role && typeof user.role === 'string') {
    return [user.role];
  }
  
  return [];
};

// Helper function to check if user has a specific role
const userHasRole = (user, role) => {
  const roles = normalizeUserRoles(user);
  return roles.includes(role);
};

// Helper function to check if user has any of the specified roles
const userHasAnyRole = (user, rolesToCheck) => {
  const roles = normalizeUserRoles(user);
  return rolesToCheck.some(role => roles.includes(role));
};

export default function UserManagement({ tenantId: propTenantId }) {
  const [users, setUsers] = useState([]);
  const [fetchedCompanies, setFetchedCompanies] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [newUser, setNewUser] = useState({
    name: "",
    email: "",
    role: ["Dispatcher"], // role as array
    company: ALL_COMPANIES_OPTION,
    active: true,
  });
  const [isEditing, setIsEditing] = useState(false);
  const [currentUserToEdit, setCurrentUserToEdit] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [loggedInUser, setLoggedInUser] = useState(null);
  const [currentTenantId, setCurrentTenantId] = useState(propTenantId);

  // Permissions state
  const [isSavingPermissions, setIsSavingPermissions] = useState(false);
  // Password reset state
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [passwordTarget, setPasswordTarget] = useState(null);
  const [newPasswordValue, setNewPasswordValue] = useState('');
  const [passwordAction, setPasswordAction] = useState('sendLink'); // 'sendLink' or 'setPassword'
  const [passwordProcessing, setPasswordProcessing] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState({ text: '', type: '' });
    const [statusFilter, setStatusFilter] = useState('All');

  useEffect(() => {
    const unsubscribeAuth = auth.onAuthStateChanged((user) => {
      if (user) {
        const uid = user.uid;
        const unsubProfile = onSnapshot(doc(db, "users", uid), (docSnap) => {
          if (docSnap.exists()) {
            const userData = applyOwnerImpersonation({
              uid,
              email: user.email,
              ...docSnap.data(),
            });
            setLoggedInUser(userData);
            
            if (!propTenantId && userData.tenantId) {
              setCurrentTenantId(userData.tenantId);
            } else if (!propTenantId && userData.assignedCompanyId) {
              setCurrentTenantId(userData.assignedCompanyId);
            } else if (!propTenantId && userData.assignedCompanyName) {
              setCurrentTenantId(`tenant_${userData.assignedCompanyName.toLowerCase().replace(/\s+/g, '_')}`);
            }
          } else {
            console.warn("UserManagement: Logged in user profile not found in Firestore:", uid);
            setLoggedInUser({ uid, email: user.email, role: [] });
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

  useEffect(() => {
    if (!currentTenantId) {
      console.warn("UserManagement: No tenant ID available, skipping data fetch");
      return;
    }

    const loggedInUserRoles = normalizeUserRoles(loggedInUser);
    const usersQuery = userHasRole(loggedInUser, "Super Admin") && currentTenantId === "admin_tenant"
      ? collection(db, "users")
      : query(collection(db, "users"), where("tenantId", "==", currentTenantId));

    const unsubscribeUsers = onSnapshot(
      usersQuery,
      (snapshot) => {
        const userList = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setUsers(userList);
      },
      (error) => {
        console.error("Error fetching users:", error);
        setUsers([]);
      }
    );

    const companiesQuery = userHasRole(loggedInUser, "Super Admin") && currentTenantId === "admin_tenant"
      ? collection(db, "companies")
      : query(collection(db, "companies"), where("tenantId", "==", currentTenantId));

    const unsubscribeCompanies = onSnapshot(
      companiesQuery,
      (snapshot) => {
        const companyList = snapshot.docs.map(doc => ({
          id: doc.id,
          name: doc.data().name,
          tenantId: doc.data().tenantId,
          permissions: doc.data().permissions || {}
        }));
        setFetchedCompanies(companyList);
      },
      (error) => {
        console.error("Error fetching companies:", error);
        setFetchedCompanies([]);
      }
    );

    return () => {
      unsubscribeUsers();
      unsubscribeCompanies();
    };
  }, [currentTenantId, loggedInUser]);

  // Handle role checkbox changes
  const handleRoleChange = (roleToToggle) => {
    const stateToUpdate = isEditing ? setCurrentUserToEdit : setNewUser;
    
    stateToUpdate((prev) => {
      const currentRoles = normalizeUserRoles(prev);
      let newRoles;
      
      // ✅ PROTECTION: If editing yourself and you're a Super Admin, prevent role changes
      if (isEditing && prev.id === loggedInUser?.uid && userHasRole(loggedInUser, "Super Admin")) {
        alert("Super Admins cannot change their own role.");
        return prev;
      }
      
      if (currentRoles.includes(roleToToggle)) {
        // Remove role
        newRoles = currentRoles.filter(r => r !== roleToToggle);
        // Ensure at least one role remains
        if (newRoles.length === 0) {
          alert("User must have at least one role.");
          return prev;
        }
      } else {
        // Add role
        if (currentRoles.length >= MAX_ROLES) {
          alert(`Users can have a maximum of ${MAX_ROLES} roles.`);
          return prev;
        }
        newRoles = [...currentRoles, roleToToggle];
      }
      
      return { ...prev, role: newRoles };
    });
  };

  const handleModalInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    const stateToUpdate = isEditing ? setCurrentUserToEdit : setNewUser;
    stateToUpdate((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  const resetForm = () => {
    setNewUser({
      name: "", 
      email: "", 
      role: ["Dispatcher"], // Default role as array
      company: fetchedCompanies.length > 0 ? fetchedCompanies[0].name : ALL_COMPANIES_OPTION,
      active: true
    });
    setIsEditing(false);
    setCurrentUserToEdit(null);
  };
  
  const resetFormAndCloseModal = () => {
    resetForm();
    setShowModal(false);
    setIsProcessing(false);
  };

  const openAddModal = () => {
    setIsEditing(false);
    resetForm();
    setShowModal(true);
  };

  const openEditModal = (user) => {
    if (!loggedInUser || !userHasAnyRole(loggedInUser, ["Super Admin", "Main Admin", "Admin"])) {
      alert("You do not have permission to edit users.");
      return;
    }
    
    setIsEditing(true);
    const isActive = typeof user.active === 'undefined' ? true : user.active;
    const userRoles = normalizeUserRoles(user);
    
    setCurrentUserToEdit({ 
      ...user, 
      company: user.company || ALL_COMPANIES_OPTION, 
      active: isActive,
      role: userRoles.length > 0 ? userRoles : ["Dispatcher"]
    });
    setShowModal(true);
  };

  const handleFormSubmit = async (e) => {
    e.preventDefault();
    setIsProcessing(true);
    const dataToProcess = isEditing ? currentUserToEdit : newUser;

    if (!currentTenantId) {
      alert("Tenant information is missing. Cannot proceed.");
      setIsProcessing(false);
      return;
    }

    // Validate roles
    const rolesToValidate = normalizeUserRoles(dataToProcess);
    if (!rolesToValidate || rolesToValidate.length === 0) {
      alert("User must have at least one role.");
      setIsProcessing(false);
      return;
    }

    if (rolesToValidate.length > MAX_ROLES) {
      alert(`Users can have a maximum of ${MAX_ROLES} roles.`);
      setIsProcessing(false);
      return;
    }

    // ✅ CRITICAL PROTECTION: Prevent Super Admins from changing their own role
    if (isEditing && currentUserToEdit) {
      const oldUserData = users.find(u => u.id === currentUserToEdit.id) || {};
      const oldRoles = normalizeUserRoles(oldUserData);
      
      // Check if editing self and was Super Admin
      if (currentUserToEdit.id === loggedInUser?.uid && oldRoles.includes("Super Admin")) {
        // Force Super Admin role to remain
        if (!rolesToValidate.includes("Super Admin")) {
          alert("Super Admins cannot remove their own Super Admin role.");
          setIsProcessing(false);
          return;
        }
      }
    }

    if (isEditing && currentUserToEdit) {
      try {
        const userRef = doc(db, "users", currentUserToEdit.id);
        const { id, email, ...dataToUpdate } = dataToProcess;
        
        dataToUpdate.tenantId = currentTenantId;
        
        // Ensure role is an array and properly formatted
        let roleArray = normalizeUserRoles(dataToUpdate);
        
        // Clean up role array - remove any empty or invalid values
        roleArray = roleArray.filter(roleItem => 
          roleItem && typeof roleItem === 'string' && allRoles.includes(roleItem)
        );
        
        // Double check we still have at least one valid role
        if (roleArray.length === 0) {
          alert("User must have at least one valid role.");
          setIsProcessing(false);
          return;
        }
        
        // Set role as array (NOT deleting it!)
        dataToUpdate.role = roleArray;
        
        const oldUserData = users.find(u => u.id === id) || {};
        const changes = {};
        if (dataToUpdate.name !== oldUserData.name) changes.name = {oldValue: oldUserData.name, newValue: dataToUpdate.name};
        
        // Compare role arrays
        const oldRoles = normalizeUserRoles(oldUserData);
        const newRoles = roleArray;
        if (JSON.stringify(oldRoles.sort()) !== JSON.stringify(newRoles.sort())) {
          changes.role = {oldValue: oldRoles, newValue: newRoles};
        }
        
        if (dataToUpdate.company !== oldUserData.company) changes.company = {oldValue: oldUserData.company, newValue: dataToUpdate.company};
        const oldActive = typeof oldUserData.active === 'undefined' ? true : oldUserData.active;
        if (dataToUpdate.active !== oldActive) changes.active = {oldValue: oldActive, newValue: dataToUpdate.active};

        console.log("Updating user with data:", dataToUpdate); // Debug log
        await updateDoc(userRef, dataToUpdate);
        alert("User updated successfully!");

        if (loggedInUser && Object.keys(changes).length > 0) {
          try {
            await addDoc(collection(db, "auditLogs"), {
              timestamp: serverTimestamp(), 
              userId: loggedInUser.uid, 
              userEmail: loggedInUser.email,
              action: "USER_UPDATED", 
              targetType: "user", 
              targetId: id,
              tenantId: currentTenantId,
              details: { 
                updatedUserEmail: currentUserToEdit.email, 
                changes: changes,
                tenantId: currentTenantId
              }
            });
          } catch (logError) { 
            console.error("Audit Log Error (USER_UPDATED):", logError); 
          }
        }
        resetFormAndCloseModal();
      } catch (error) {
        console.error("Error updating user:", error);
        alert("Failed to update user: " + error.message);
        setIsProcessing(false);
      }
    } else { 
      if (!dataToProcess.name.trim() || !dataToProcess.email.trim()) {
        alert("Name and Email are required for inviting a new user.");
        setIsProcessing(false);
        return;
      }
      try {
        const inviteToken = uuidv4();
        const userEmailToInvite = dataToProcess.email.toLowerCase();

        // Ensure role is an array for new invites too
        const rolesToSave = normalizeUserRoles(dataToProcess);

        await addDoc(collection(db, "pendingInvites"), {
          name: dataToProcess.name,
          email: userEmailToInvite,
          role: rolesToSave, // Store role as array
          company: dataToProcess.company,
          active: dataToProcess.active,
          tenantId: currentTenantId,
          token: inviteToken,
          invitedBy: loggedInUser?.email || "System",
          invitedAt: serverTimestamp(),
          status: "pending"
        });

        const signUpLink = `https://loadmemo.com/finishSignUp?token=${inviteToken}&tenant=${currentTenantId}`;
        
        prompt(
            `User invite prepared for ${dataToProcess.email}! Please COPY this link and send it to the user to complete registration (Ctrl+C or Cmd+C):`,
            signUpLink
        );
        
        if (loggedInUser) {
          try {
            await addDoc(collection(db, "auditLogs"), {
              timestamp: serverTimestamp(), 
              userId: loggedInUser.uid, 
              userEmail: loggedInUser.email,
              action: "USER_INVITE_INITIATED", 
              targetType: "user_invite",
              tenantId: currentTenantId,
              details: {
                invitedUserEmail: userEmailToInvite,
                invitedUserName: dataToProcess.name,
                roleAssigned: rolesToSave, // role as array
                companyAssigned: dataToProcess.company,
                initialStatus: dataToProcess.active ? "active" : "inactive",
                tenantId: currentTenantId
              }
            });
          } catch (logError) { 
            console.error("Audit Log Error (USER_INVITE_INITIATED):", logError); 
          }
        }
        
        resetFormAndCloseModal();
      } catch (error) {
        console.error("Error creating user invite:", error);
        alert("Failed to create user invite: " + error.message);
        setIsProcessing(false);
      }
    }
  };

  const handleDelete = async (userIdToDisable, userEmailToDisable) => {
    if (!window.confirm("Are you sure you want to disable this user? This will prevent them from logging in.")) return;
    try {
      await updateDoc(doc(db, "users", userIdToDisable), { active: false });
      alert("User disabled!");
      
      if (loggedInUser) {
        try {
          await addDoc(collection(db, "auditLogs"), {
            timestamp: serverTimestamp(),
            userId: loggedInUser.uid,
            userEmail: loggedInUser.email,
            action: "USER_DISABLED",
            targetType: "user",
            targetId: userIdToDisable,
            tenantId: currentTenantId,
            details: {
              disabledUserEmail: userEmailToDisable,
              tenantId: currentTenantId
            }
          });
        } catch (logError) {
          console.error("Audit Log Error (USER_DISABLED):", logError);
        }
      }
    } catch (err) {
      console.error("Error disabling user:", err);
      alert("Failed to disable user: " + err.message);
    }
  };

  const handleToggle = async (userIdToToggle, currentActiveStatus, userEmailToToggle) => {
    const userToUpdate = users.find(u => u.id === userIdToToggle);
    if (!userToUpdate) return;
    const newActiveStatus = !currentActiveStatus;
    try {
      await updateDoc(doc(db, "users", userIdToToggle), { active: newActiveStatus });
      alert(`User ${newActiveStatus ? 'activated' : 'deactivated'}!`);
      
      if (loggedInUser) {
        try {
          await addDoc(collection(db, "auditLogs"), {
            timestamp: serverTimestamp(),
            userId: loggedInUser.uid,
            userEmail: loggedInUser.email,
            action: newActiveStatus ? "USER_ACTIVATED" : "USER_DEACTIVATED",
            targetType: "user",
            targetId: userIdToToggle,
            tenantId: currentTenantId,
            details: {
              toggledUserEmail: userEmailToToggle,
              newStatus: newActiveStatus ? "active" : "inactive",
              tenantId: currentTenantId
            }
          });
        } catch (logError) {
          console.error("Audit Log Error (USER_TOGGLE):", logError);
        }
      }
    } catch (err) {
      console.error("Error toggling user status:", err);
      alert("Failed to update user status: " + err.message);
    }
  };

  // ============================================
  // PASSWORD RESET HANDLER
  // ============================================
  const handlePasswordReset = async () => {
    if (!passwordTarget) return;
    setPasswordProcessing(true);
    setPasswordMessage({ text: '', type: '' });

    try {
      const functions = getFunctions();
      const adminPasswordReset = httpsCallable(functions, 'adminPasswordReset');

      if (passwordAction === 'sendLink') {
        const result = await adminPasswordReset({
          action: 'sendResetLink',
          targetUid: passwordTarget.id,
          targetEmail: passwordTarget.email
        });
        setPasswordMessage({ text: result.data.message, type: 'success' });

        if (loggedInUser) {
          await addDoc(collection(db, "auditLogs"), {
            timestamp: serverTimestamp(),
            userId: loggedInUser.uid,
            userEmail: loggedInUser.email,
            action: "PASSWORD_RESET_LINK_SENT",
            targetType: "user",
            targetId: passwordTarget.id,
            tenantId: currentTenantId,
            details: { targetEmail: passwordTarget.email }
          });
        }
      } else {
        if (!newPasswordValue || newPasswordValue.length < 6) {
          setPasswordMessage({ text: 'Password must be at least 6 characters', type: 'error' });
          setPasswordProcessing(false);
          return;
        }

        const result = await adminPasswordReset({
          action: 'setPassword',
          targetUid: passwordTarget.id,
          newPassword: newPasswordValue
        });
        setPasswordMessage({ text: result.data.message, type: 'success' });

        if (loggedInUser) {
          await addDoc(collection(db, "auditLogs"), {
            timestamp: serverTimestamp(),
            userId: loggedInUser.uid,
            userEmail: loggedInUser.email,
            action: "PASSWORD_SET_BY_ADMIN",
            targetType: "user",
            targetId: passwordTarget.id,
            tenantId: currentTenantId,
            details: { targetEmail: passwordTarget.email }
          });
        }
      }

      setTimeout(() => {
        setShowPasswordModal(false);
        setPasswordTarget(null);
        setNewPasswordValue('');
        setPasswordMessage({ text: '', type: '' });
      }, 2000);
    } catch (error) {
      console.error('Password reset error:', error);
      setPasswordMessage({ text: error.message || 'Failed to reset password', type: 'error' });
    }
    setPasswordProcessing(false);
  };
  

  // ============================================
  // TENANT PERMISSIONS HANDLER
  // ============================================
  const handlePermissionToggle = async (permissionKey, roleToToggle) => {
    const companyDoc = fetchedCompanies.find(c => c.tenantId === currentTenantId);
    if (!companyDoc) {
      alert('Company not found for this tenant.');
      return;
    }

    // Super Admin always keeps permission
    if (roleToToggle === 'Super Admin') {
      alert('Super Admin permission cannot be removed.');
      return;
    }

    setIsSavingPermissions(true);
    try {
      const permissionDef = TENANT_PERMISSIONS.find(p => p.key === permissionKey);
      const currentPermissions = companyDoc.permissions || {};
      const currentRoles = currentPermissions[permissionKey] || permissionDef?.defaultRoles || ['Super Admin'];
      
      let newRoles;
      if (currentRoles.includes(roleToToggle)) {
        newRoles = currentRoles.filter(r => r !== roleToToggle);
      } else {
        newRoles = [...currentRoles, roleToToggle];
      }

      // Ensure Super Admin is always included
      if (!newRoles.includes('Super Admin')) {
        newRoles.unshift('Super Admin');
      }

      const companyRef = doc(db, 'companies', companyDoc.id);
      await updateDoc(companyRef, {
        [`permissions.${permissionKey}`]: newRoles,
        updatedAt: serverTimestamp()
      });

      // Audit log
      if (loggedInUser) {
        try {
          await addDoc(collection(db, 'auditLogs'), {
            timestamp: serverTimestamp(),
            userId: loggedInUser.uid,
            userEmail: loggedInUser.email,
            action: 'PERMISSION_UPDATED',
            targetType: 'tenant_permissions',
            targetId: companyDoc.id,
            tenantId: currentTenantId,
            details: {
              permissionKey,
              permissionLabel: permissionDef?.label || permissionKey,
              roleToggled: roleToToggle,
              action: newRoles.includes(roleToToggle) ? 'granted' : 'revoked',
              newAllowedRoles: newRoles,
              message: `"${permissionDef?.label || permissionKey}" permission ${newRoles.includes(roleToToggle) ? 'granted to' : 'revoked from'} ${roleToToggle}`
            }
          });
        } catch (logError) {
          console.error('Audit Log Error (PERMISSION_UPDATED):', logError);
        }
      }
    } catch (error) {
      console.error('Error updating permissions:', error);
      alert('Failed to update permission: ' + error.message);
    } finally {
      setIsSavingPermissions(false);
    }
  };

  const canPerformAction = (targetUser, actionType) => {
    if (!loggedInUser || !targetUser) return false;
    
    // Check tenant isolation
    if (targetUser.tenantId && currentTenantId && targetUser.tenantId !== currentTenantId) {
      if (!(userHasRole(loggedInUser, "Super Admin") && currentTenantId === "admin_tenant")) {
        return false;
      }
    }
    
    const loggedInUserRoles = normalizeUserRoles(loggedInUser);
    const targetUserRoles = normalizeUserRoles(targetUser);
    
    if (userHasRole(loggedInUser, "Super Admin")) {
      if ((actionType === "delete" || actionType === "toggle") && targetUser.id === loggedInUser.uid) {
        return false;
      }
      return true;
    }
    
  if (userHasAnyRole(loggedInUser, ["Main Admin", "Admin"])) {
  // Main Admin/Admin cannot manage Super Admins, Main Admins, or other Admins
  if (targetUserRoles.includes("Super Admin") || targetUserRoles.includes("Main Admin") || targetUserRoles.includes("Admin")) return false;
  return true;
}

return false;
  };

const availableRolesForNewUser = allRoles.filter(role => {
  if (role === "Super Admin") return false;
  if (role === "Main Admin" && !userHasRole(loggedInUser, "Super Admin")) return false;
  return true;
});  const filteredUsers = statusFilter === 'All'
    ? users
    : statusFilter === 'Active'
      ? users.filter(u => u.active !== false)
      : users.filter(u => u.active === false);

  const formData = isEditing ? currentUserToEdit : newUser;
  const formTitle = isEditing ? "Edit Site User" : "Add New Site User";
  const submitButtonText = isEditing ? (isProcessing ? "Updating..." : "Update User") : (isProcessing ? "Preparing Invite..." : "Prepare Invite");

  // Check if we're editing ourselves as a Super Admin
  const isEditingSelfAsSuperAdmin = isEditing && 
    currentUserToEdit?.id === loggedInUser?.uid && 
    userHasRole(loggedInUser, "Super Admin");

  if (!loggedInUser) {
    return <div className="p-4 text-center">Loading user profile or not authorized...</div>;
  }

  if (!currentTenantId) {
    return (
      <div className="p-4 text-center">
        <div className="text-red-600 mb-2">Tenant information is missing</div>
        <div className="text-sm text-gray-500">Cannot load user management without tenant context</div>
      </div>
    );
  }

  // Get company doc for current tenant (used for permissions display)
  const currentCompanyDoc = fetchedCompanies.find(c => c.tenantId === currentTenantId);

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <div>
          <h2 className="text-xl font-semibold text-gray-700">Site User Management</h2>
          <p className="text-sm text-gray-500 mt-1">Tenant: {currentTenantId}</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            {['All', 'Active', 'Inactive'].map(status => (
              <button
                key={status}
                onClick={() => setStatusFilter(status)}
                className={`text-xs px-3 py-1.5 rounded-full border font-medium transition-colors ${
                  statusFilter === status
                    ? status === 'Active' ? 'bg-green-100 text-green-800 border-green-300'
                      : status === 'Inactive' ? 'bg-red-100 text-red-800 border-red-300'
                      : 'bg-gray-200 text-gray-800 border-gray-400'
                    : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                }`}
              >
                {status}
              </button>
            ))}
          </div>
        {userHasAnyRole(loggedInUser, ["Super Admin", "Main Admin", "Admin"]) && (
  <button
    className="bg-blue-500 hover:bg-blue-600 text-white font-medium py-2 px-4 rounded-md text-sm flex items-center"
    onClick={openAddModal}
  >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-5 h-5 mr-2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
              Add New Site User
            </button>
          )}
        </div>
      </div>
      <p className="text-sm text-gray-600 mb-4">
        Manage internal application users for this tenant. Invited users will receive a link (shown to you after preparing invite) to set their password and complete registration.
      </p>
      <div className="overflow-x-auto bg-white shadow-md rounded-lg">
        <table className="min-w-full">
           <thead className="bg-gray-100">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Name</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Email</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Roles</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Company</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Status</th>
              {userHasRole(loggedInUser, "Super Admin") && currentTenantId === "admin_tenant" && (
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Tenant</th>
              )}
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {filteredUsers.length === 0 ? (
              <tr>
                <td colSpan={userHasRole(loggedInUser, "Super Admin") && currentTenantId === "admin_tenant" ? 7 : 6} className="text-center text-gray-500 py-8">
                  No registered users found for this tenant.
                </td>
              </tr>
            ) : (
              filteredUsers.map((user) => {
                const userRoles = normalizeUserRoles(user);
                return (
                  <tr key={user.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{user.name}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{user.email}</td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      <div className="flex flex-wrap gap-1">
                        {userRoles.map((roleItem) => (
                          <span 
                            key={roleItem}
                            className="px-2 py-1 text-xs font-medium rounded-full bg-blue-100 text-blue-800"
                          >
                            {roleItem}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{user.company}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <span className={`px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${user.active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                        {user.active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    {userHasRole(loggedInUser, "Super Admin") && currentTenantId === "admin_tenant" && (
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        <span className="px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded">
                          {user.tenantId || 'No Tenant'}
                        </span>
                      </td>
                    )}
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                    {canPerformAction(user, "edit") && (
  <button
    onClick={() => {
      setPasswordTarget(user);
      setPasswordAction('sendLink');
      setNewPasswordValue('');
      setPasswordMessage({ text: '', type: '' });
      setShowPasswordModal(true);
    }}
    className="text-amber-600 hover:text-amber-800 text-xs"
    title="Reset password"
  >
    🔑 Reset PW
  </button>
)}
                      {canPerformAction(user, "edit") && (
                        <button
                          onClick={() => openEditModal(user)}
                          className="text-indigo-600 hover:text-indigo-800 text-xs"
                        >
                          Edit
                        </button>
                      )}
                      {canPerformAction(user, "delete") && (
                        <button
                          onClick={() => handleDelete(user.id, user.email)}
                          className="text-red-600 hover:text-red-800 text-xs"
                        >
                          Disable
                        </button>
                      )}
                      {canPerformAction(user, "toggle") && (
                        <button
                          type="button"
                          onClick={() => handleToggle(user.id, user.active, user.email)}
                          className={`ml-2 relative inline-flex items-center h-6 rounded-full w-11 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500
                            ${user.active ? "bg-blue-600" : "bg-gray-300"}
                            ${(userRoles.includes("Super Admin") && !userHasRole(loggedInUser, "Super Admin")) || 
                              (userRoles.includes("Admin") && !userHasAnyRole(loggedInUser, ["Super Admin", "Admin"])) ? 
                              'opacity-50 cursor-not-allowed' : ''}
                          `}
                          disabled={
                             (userRoles.includes("Super Admin") && loggedInUser?.id !== user.id) ||
                             (userRoles.includes("Admin") && userHasRole(loggedInUser, "Admin") && loggedInUser?.id !== user.id) ||
                             (userHasRole(loggedInUser, "Admin") && userRoles.includes("Super Admin"))
                          }
                        >
                          <span className="sr-only">Toggle status</span>
                          <span
                            className={`inline-block w-4 h-4 transform bg-white rounded-full transition-transform duration-200
                              ${user.active ? "translate-x-6" : "translate-x-1"}
                            `}
                          />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* ============================================ */}
      {/* TENANT PERMISSIONS SECTION (Super Admin Only) */}
      {/* ============================================ */}
      {userHasRole(loggedInUser, "Super Admin") && currentCompanyDoc && (
        <div className="mt-8">
          <div className="flex items-center gap-3 mb-4">
            <h2 className="text-xl font-semibold text-gray-700">Tenant Permissions</h2>
            {isSavingPermissions && (
              <div className="flex items-center gap-2 text-sm text-blue-600">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                Saving...
              </div>
            )}
          </div>
          <p className="text-sm text-gray-600 mb-4">
            Control which roles have access to specific features across the platform. Super Admin always retains full access. Changes take effect immediately.
          </p>
          <div className="bg-white shadow-md rounded-lg overflow-hidden">
            <table className="min-w-full">
              <thead className="bg-gray-100">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider min-w-[250px]">Feature</th>
                  {allRoles.map(role => (
                    <th key={role} className="px-3 py-3 text-center text-xs font-medium text-gray-600 uppercase tracking-wider">{role}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {TENANT_PERMISSIONS.map(permission => {
                  const allowedRoles = currentCompanyDoc?.permissions?.[permission.key] || permission.defaultRoles;
                  
                  return (
                    <tr key={permission.key} className="hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <div className="text-sm font-medium text-gray-900">{permission.label}</div>
                        <div className="text-xs text-gray-500 mt-0.5">{permission.description}</div>
                        <div className="mt-1.5">
                          <span className="text-xs text-gray-400">
                            Allowed: {allowedRoles.join(', ')}
                          </span>
                        </div>
                      </td>
                      {allRoles.map(role => {
                        const isAllowed = allowedRoles.includes(role);
                        const isSuperAdmin = role === 'Super Admin';
                        
                        return (
                          <td key={role} className="px-3 py-4 text-center">
                            <button
                              onClick={() => handlePermissionToggle(permission.key, role)}
                              disabled={isSuperAdmin || isSavingPermissions}
                              className={`relative inline-flex items-center h-6 rounded-full w-11 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 ${
                                isAllowed ? 'bg-green-500' : 'bg-gray-300'
                              } ${isSuperAdmin || isSavingPermissions ? 'opacity-70 cursor-not-allowed' : 'cursor-pointer hover:opacity-90'}`}
                              title={isSuperAdmin ? 'Super Admin always has access' : `${isAllowed ? 'Revoke' : 'Grant'} "${permission.label}" for ${role}`}
                            >
                              <span className={`inline-block w-4 h-4 transform bg-white rounded-full transition-transform duration-200 shadow ${
                                isAllowed ? 'translate-x-6' : 'translate-x-1'
                              }`} />
                            </button>
                            {isSuperAdmin && (
                              <div className="text-xs text-gray-400 mt-1">Always on</div>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          
          {/* Info note */}
          <div className="mt-3 flex items-start gap-2 text-xs text-gray-500 bg-gray-50 p-3 rounded-lg border border-gray-200">
            <svg className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <p className="font-medium text-gray-600">How permissions work:</p>
              <p className="mt-1">When a toggle is <span className="text-green-600 font-semibold">green</span>, users with that role can use the feature. When <span className="text-gray-500 font-semibold">gray</span>, they cannot. Super Admin access cannot be revoked. All changes are recorded in the audit log.</p>
            </div>
          </div>
        </div>
      )}

      {/* ============================================ */}
      {/* USER MODAL */}
      {/* ============================================ */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
          <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-semibold mb-6 text-gray-800">{formTitle}</h3>
            {isEditingSelfAsSuperAdmin && (
              <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-md">
                <p className="text-sm text-yellow-800">
                  🔒 You are editing your own Super Admin account. Your Super Admin role cannot be changed.
                </p>
              </div>
            )}
            <form onSubmit={handleFormSubmit}>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                <input type="text" name="name" required className="border border-gray-300 rounded-md w-full px-3 py-2 text-sm shadow-sm focus:ring-blue-500 focus:border-blue-500" value={formData?.name || ""} onChange={handleModalInputChange} />
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input type="email" name="email" required disabled={isEditing} className={`border border-gray-300 rounded-md w-full px-3 py-2 text-sm shadow-sm focus:ring-blue-500 focus:border-blue-500 ${isEditing ? 'bg-gray-100 cursor-not-allowed' : ''}`} value={formData?.email || ""} onChange={handleModalInputChange} />
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Roles <span className="text-red-500">*</span>
                  <span className="text-xs text-gray-500 ml-2">(Select 1-{MAX_ROLES} roles)</span>
                </label>
                <div className="border border-gray-300 rounded-md p-3 max-h-48 overflow-y-auto">
                  {(isEditing && userHasRole(loggedInUser, "Super Admin") ? allRoles : availableRolesForNewUser).map((roleOption) => {
                    const currentUserRoles = normalizeUserRoles(currentUserToEdit);
                    const isDisabled = isEditing && 
                      ((currentUserRoles.includes("Super Admin") && !userHasRole(loggedInUser, "Super Admin") && roleOption !== "Super Admin") ||
                       (currentUserRoles.includes("Admin") && userHasRole(loggedInUser, "Admin") && (roleOption === "Super Admin" || (roleOption === "Admin" && currentUserToEdit.id !== loggedInUser.id))));
                    
                    // ✅ DISABLE Super Admin checkbox if editing yourself
                    const isSuperAdminSelfEdit = isEditingSelfAsSuperAdmin && roleOption === "Super Admin";
                    
                    if (isDisabled) return null;
                    
                    const formRoles = normalizeUserRoles(formData);
                    
                    return (
                      <label key={roleOption} className={`flex items-center mb-2 p-1 rounded ${isSuperAdminSelfEdit ? 'bg-gray-50 cursor-not-allowed' : 'cursor-pointer hover:bg-gray-50'}`}>
                        <input
                          type="checkbox"
                          checked={formRoles.includes(roleOption)}
                          onChange={() => handleRoleChange(roleOption)}
                          disabled={isEditing && roleOption === "Super Admin" && (isSuperAdminSelfEdit || !userHasRole(loggedInUser, "Super Admin"))}
                          className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 mr-2"
                        />
                        <span className={`text-sm ${isSuperAdminSelfEdit ? 'text-gray-500' : 'text-gray-700'}`}>
                          {roleOption}
                          {isSuperAdminSelfEdit && <span className="ml-2 text-xs">(Protected)</span>}
                        </span>
                      </label>
                    );
                  })}
                </div>
                {formData?.role && normalizeUserRoles(formData).length > 0 && (
                  <p className="text-xs text-gray-500 mt-1">
                    Selected: {normalizeUserRoles(formData).length} / {MAX_ROLES}
                  </p>
                )}
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">Company</label>
                <select name="company" className="border border-gray-300 rounded-md w-full px-3 py-2 text-sm shadow-sm focus:ring-blue-500 focus:border-blue-500" value={formData?.company || ALL_COMPANIES_OPTION} onChange={handleModalInputChange} >
                  <option value={ALL_COMPANIES_OPTION}>{ALL_COMPANIES_OPTION}</option>
                  {fetchedCompanies.map((company) => ( <option key={company.id} value={company.name}> {company.name} </option> ))}
                </select>
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">Tenant</label>
                <input type="text" disabled className="border border-gray-300 rounded-md w-full px-3 py-2 text-sm shadow-sm bg-gray-100 cursor-not-allowed" value={currentTenantId} />
                <p className="text-xs text-gray-500 mt-1">User will be assigned to this tenant</p>
              </div>
              <div className="mb-6 flex items-center">
                <input type="checkbox" name="active" id="activeToggleModal" className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 mr-2"
                    checked={isEditing ? (formData?.active ?? true) : newUser.active} 
                    onChange={handleModalInputChange} />
                <label htmlFor="activeToggleModal" className="text-sm text-gray-700">Active User</label>
              </div>
              
              <div className="flex justify-end space-x-3">
                <button type="button" className="bg-gray-200 hover:bg-gray-300 text-gray-700 px-4 py-2 rounded-md text-sm font-medium"
                  onClick={resetFormAndCloseModal} 
                  disabled={isProcessing} > Cancel </button>
                <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md text-sm font-medium" disabled={isProcessing} >
                  {submitButtonText}
                </button>
              </div>
            </form>
          </div>
        </div>
     )}

      {/* PASSWORD RESET MODAL */}
      {showPasswordModal && passwordTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
          <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-md">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-gray-800">🔑 Reset Password</h3>
              <button onClick={() => { setShowPasswordModal(false); setPasswordTarget(null); setPasswordMessage({ text: '', type: '' }); }} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            <div className="bg-gray-50 rounded-lg p-3 mb-4">
              <p className="text-sm text-gray-700 font-medium">{passwordTarget.name}</p>
              <p className="text-sm text-gray-500">{passwordTarget.email}</p>
            </div>
            <div className="flex gap-2 mb-4">
              <button onClick={() => setPasswordAction('sendLink')} className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${passwordAction === 'sendLink' ? 'bg-blue-100 text-blue-800 border-2 border-blue-300' : 'bg-gray-100 text-gray-600 border-2 border-transparent hover:bg-gray-200'}`}>📧 Send Reset Email</button>
              <button onClick={() => setPasswordAction('setPassword')} className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${passwordAction === 'setPassword' ? 'bg-amber-100 text-amber-800 border-2 border-amber-300' : 'bg-gray-100 text-gray-600 border-2 border-transparent hover:bg-gray-200'}`}>🔐 Set Password</button>
            </div>
            {passwordAction === 'sendLink' ? (
              <div className="mb-4">
                <p className="text-sm text-gray-600">A password reset link will be sent to <strong>{passwordTarget.email}</strong> via email.</p>
              </div>
            ) : (
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">New Password</label>
                <input type="text" value={newPasswordValue} onChange={(e) => setNewPasswordValue(e.target.value)} className="border border-gray-300 rounded-md w-full px-3 py-2 text-sm shadow-sm focus:ring-blue-500 focus:border-blue-500" placeholder="Min 6 characters" minLength={6} />
                <p className="text-xs text-gray-500 mt-1">You'll need to share this password with the user directly.</p>
              </div>
            )}
            {passwordMessage.text && (
              <div className={`mb-4 px-4 py-3 rounded-lg text-sm ${passwordMessage.type === 'success' ? 'bg-green-50 border border-green-200 text-green-700' : 'bg-red-50 border border-red-200 text-red-700'}`}>
                {passwordMessage.type === 'success' ? '✅ ' : '❌ '}{passwordMessage.text}
              </div>
            )}
            <div className="flex justify-end gap-3">
              <button onClick={() => { setShowPasswordModal(false); setPasswordTarget(null); setPasswordMessage({ text: '', type: '' }); }} className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-md text-sm font-medium" disabled={passwordProcessing}>Cancel</button>
              <button onClick={handlePasswordReset} disabled={passwordProcessing || (passwordAction === 'setPassword' && newPasswordValue.length < 6)} className={`px-4 py-2 rounded-md text-sm font-medium text-white ${passwordAction === 'sendLink' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-amber-600 hover:bg-amber-700'} disabled:opacity-50 disabled:cursor-not-allowed`}>
                {passwordProcessing ? 'Processing...' : passwordAction === 'sendLink' ? '📧 Send Reset Email' : '🔐 Set Password'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}