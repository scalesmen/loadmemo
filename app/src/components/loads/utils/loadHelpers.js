// src/components/loads/utils/loadHelpers.js
import { addDoc, collection, serverTimestamp, Timestamp } from 'firebase/firestore';
import { db } from '../../../firebase';

/**
 * Helper function to normalize user roles (handles backward compatibility)
 * @param {Object} user - User object
 * @returns {Array} Array of role strings
 */
export const normalizeUserRoles = (user) => {
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

/**
 * Helper function to check if user has a specific role
 * @param {Object} user - User object
 * @param {string} role - Role to check for
 * @returns {boolean} Whether user has the role
 */
export const userHasRole = (user, role) => {
  const roles = normalizeUserRoles(user);
  return roles.includes(role);
};

/**
 * Helper function to check if user has any of the specified roles
 * @param {Object} user - User object
 * @param {Array} rolesToCheck - Array of roles to check
 * @returns {boolean} Whether user has any of the roles
 */
export const userHasAnyRole = (user, rolesToCheck) => {
  const roles = normalizeUserRoles(user);
  return rolesToCheck.some(role => roles.includes(role));
};

/**
 * Determine tenant ID from user data
 * @param {Object} loggedInUser - Current user object
 * @returns {string|null} Tenant ID
 */
export const determineTenantId = (loggedInUser) => {
  if (!loggedInUser) return null;
  
  if (loggedInUser.tenantId) {
    return loggedInUser.tenantId;
  } else if (loggedInUser.assignedCompanyId) {
    return loggedInUser.assignedCompanyId;
  } else if (loggedInUser.assignedCompanyName) {
    return `tenant_${loggedInUser.assignedCompanyName.toLowerCase().replace(/\s+/g, '_')}`;
  }
  return null;
};

/**
 * Log audit trail for actions
 * @param {Object} auditData - Audit log data
 */
export async function logAudit({ userId, userEmail, action, targetType, targetId, tenantId, details }) {
  try {
    await addDoc(collection(db, "auditLogs"), {
      userId,
      userEmail,
      action,
      targetType,
      targetId,
      tenantId,
      details,
      timestamp: serverTimestamp()
    });
  } catch (e) {
    console.error("Audit log error:", e);
  }
}

/**
 * Prepare load data for saving
 * @param {Object} loadForm - Form data
 * @param {Array} brokers - Available brokers
 * @param {string} tenantId - Current tenant ID
 * @returns {Object} Prepared load data
 */
export const prepareLoadData = (loadForm, brokers, tenantId) => {
  const selectedBroker = brokers.find(b => b.id === loadForm.brokerId) || {};
  
  const pickupDT = loadForm.pickupDateTime ? 
    Timestamp.fromDate(new Date(loadForm.pickupDateTime)) : null;
  const deliveryDT = loadForm.deliveryDateTime ? 
    Timestamp.fromDate(new Date(loadForm.deliveryDateTime)) : null;

  return {
    ...loadForm,
    pickupDateTime: pickupDT,
    deliveryDateTime: deliveryDT,
    brokerId: loadForm.brokerId || "",
    brokerName: selectedBroker.name || loadForm.brokerName || "",
    amount: Number(String(loadForm.amount || "0").replace(/[^0-9.-]+/g,"")),
    mileage: Number(String(loadForm.mileage || "0").replace(/[^0-9.-]+/g,"")),
    driverCollectionAmount: loadForm.driverCollectionAmount ? 
      Number(String(loadForm.driverCollectionAmount).replace(/[^0-9.-]+/g,"")) : 0,
    brokerFeeCollection: loadForm.brokerFeeCollection ? 
      Number(String(loadForm.brokerFeeCollection).replace(/[^0-9.-]+/g,"")) : 0,
    storageFee: loadForm.storageFee ? 
      Number(String(loadForm.storageFee).replace(/[^0-9.-]+/g,"")) : 0,
    // Factoring fields
    factoringApplied: loadForm.factoringApplied || false,
    factoringRuleId: loadForm.factoringRuleId || null,
    factoringPercentage: loadForm.factoringPercentage ? Number(loadForm.factoringPercentage) : null,
    factoringAmount: loadForm.factoringAmount ? Number(loadForm.factoringAmount) : null,
    factoringBrokerName: loadForm.factoringBrokerName || null,
    // Phone numbers
    pickupContactPhone: loadForm.pickupContactPhone || "",
    deliveryContactPhone: loadForm.deliveryContactPhone || "",
    // Load notes
    loadNotes: loadForm.loadNotes || "",
    tenantId: tenantId,
    updatedAt: serverTimestamp()
  };
};

/**
 * Check if user has permission to manage loads
 * UPDATED: Added "Main Admin" role
 * @param {Object} user - Current user
 * @returns {boolean} Whether user can manage loads
 */
export const canUserManageLoads = (user) => {
  if (!user) return false;
  return userHasAnyRole(user, ["Super Admin", "Main Admin", "Admin", "Dispatcher"]);
};

/**
 * Check if user can see dispatcher filter
 * UPDATED: Added "Main Admin" role
 * @param {Object} user - Current user
 * @returns {boolean} Whether user can see dispatcher filter
 */
export const canUserSeeDispatcherFilter = (user) => {
  if (!user) return false;
  return userHasAnyRole(user, ["Super Admin", "Main Admin", "Admin"]);
};

/**
 * Check if status transition is valid
 * Prevents skipping required status steps (e.g., can't go directly to Delivered)
 * @param {string} currentStatus - Current load status
 * @param {string} newStatus - Requested new status
 * @returns {Object} { isValid: boolean, error: string|null }
 */
export const isValidStatusTransition = (currentStatus, newStatus) => {
  // Can't go directly to Delivered without being In Transit first
  if (newStatus === 'Delivered' && currentStatus !== 'In Transit') {
    return {
      isValid: false,
      error: 'Load must be "In Transit" before marking as "Delivered". Please mark as "In Transit" first.'
    };
  }
  
  return { isValid: true, error: null };
};

/**
 * Get status update data based on new status
 * Sets actualPU when moving to In Transit, actualDEL when moving to Delivered
 * 
 * @param {string} newStatus - New status value
 * @param {Object} currentLoad - Current load data (unused but kept for API compatibility)
 * @returns {Object} Update data for status change
 */
export const getStatusUpdateData = (newStatus, currentLoad) => {
  const updateData = { 
    status: newStatus, 
    updatedAt: serverTimestamp() 
  };

  // Set actualPU when moving to In Transit
  if (newStatus === "In Transit") {
    updateData.actualPU = serverTimestamp();
    console.log("📍 Setting actualPU timestamp for In Transit status");
  }
  
  // Set actualDEL when moving to Delivered
  if (newStatus === "Delivered") {
    updateData.actualDEL = serverTimestamp();
    console.log("📍 Setting actualDEL timestamp for Delivered status");
  }

  return updateData;
};

/**
 * Validate load form data
 * @param {Object} loadForm - Form data to validate
 * @returns {Object} Validation result { isValid: boolean, errors: string[] }
 */
export const validateLoadForm = (loadForm) => {
  const errors = [];

  if (!loadForm.load_id?.trim()) {
    errors.push("Load ID is required");
  }

  if (!loadForm.pickupDateTime) {
    errors.push("Pickup date/time is required");
  }

  if (!loadForm.deliveryDateTime) {
    errors.push("Delivery date/time is required");
  }

  if (!loadForm.pickupLocation?.trim()) {
    errors.push("Pickup location is required");
  }

  if (!loadForm.deliveryLocation?.trim()) {
    errors.push("Delivery location is required");
  }

  if (loadForm.amount === undefined || loadForm.amount === null || loadForm.amount === '') {
    errors.push("Amount is required");
  }

  // Validate vehicle information for auto hauling
  if (loadForm.vehicles && loadForm.vehicles.length > 0) {
    loadForm.vehicles.forEach((vehicle, index) => {
      if (!vehicle.vin?.trim()) {
        errors.push(`Vehicle ${index + 1}: VIN is required`);
      }
    });
  }

  return {
    isValid: errors.length === 0,
    errors
  };
};

/**
 * Validate status change is allowed
 * @param {Object} loadForm - Current form data
 * @param {string} originalStatus - Original status before editing
 * @returns {Object} { isValid: boolean, error: string|null }
 */
export const validateStatusChange = (loadForm, originalStatus) => {
  if (loadForm.status === 'Delivered') {
    if (originalStatus !== 'In Transit' && !loadForm.actualPU) {
      return {
        isValid: false,
        error: 'Load must be marked as "In Transit" before it can be "Delivered". Please change status to "In Transit" first, save, then mark as "Delivered".'
      };
    }
  }
  
  return { isValid: true, error: null };
};

/**
 * Filter loads based on search criteria
 * Searches across: Load ID, VIN, vehicle make/model, pickup/delivery locations and names
 * @param {Array} loads - All loads
 * @param {string} searchTerm - Search term
 * @returns {Array} Filtered loads
 */
export const filterLoadsBySearch = (loads, searchTerm) => {
  if (!searchTerm?.trim()) {
    return loads;
  }
  
  const term = searchTerm.toLowerCase().trim();
  
  return loads.filter(load => {
    // Search Load ID
    if (load.load_id?.toLowerCase().includes(term)) {
      return true;
    }
    
    // Search vehicles array (VIN, make, model, year)
    if (load.vehicles && Array.isArray(load.vehicles)) {
      const vehicleMatch = load.vehicles.some(vehicle => 
        vehicle.vin?.toLowerCase().includes(term) ||
        vehicle.make?.toLowerCase().includes(term) ||
        vehicle.model?.toLowerCase().includes(term) ||
        vehicle.year?.toString().includes(term)
      );
      if (vehicleMatch) return true;
    }
    
    // Search pickup info
    if (load.pickupLocationName?.toLowerCase().includes(term)) return true;
    if (load.pickupLocation?.toLowerCase().includes(term)) return true;
    if (load.pickupContactName?.toLowerCase().includes(term)) return true;
    if (load.pickupCity?.toLowerCase().includes(term)) return true;
    if (load.pickupState?.toLowerCase().includes(term)) return true;
    
    // Search delivery info
    if (load.deliveryLocationName?.toLowerCase().includes(term)) return true;
    if (load.deliveryLocation?.toLowerCase().includes(term)) return true;
    if (load.deliveryContactName?.toLowerCase().includes(term)) return true;
    if (load.deliveryCity?.toLowerCase().includes(term)) return true;
    if (load.deliveryState?.toLowerCase().includes(term)) return true;
    
    // Search broker name
    if (load.brokerName?.toLowerCase().includes(term)) return true;
    
    return false;
  });
};