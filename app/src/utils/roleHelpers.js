// src/utils/roleHelpers.js
// Utility functions for multi-role support with backward compatibility

/**
 * Normalizes user roles to always return an array
 * Handles backward compatibility with old single role field
 * @param {Object} user - User object from Firebase
 * @returns {Array<string>} - Array of role strings
 */
export const normalizeUserRoles = (user) => {
  if (!user) return [];
  
  // If user has new roles array, use it
  if (Array.isArray(user.roles) && user.roles.length > 0) {
    return user.roles;
  }
  
  // If user has old role string, convert to array
  if (user.role && typeof user.role === 'string') {
    return [user.role];
  }
  
  return [];
};

/**
 * Check if user has a specific role
 * @param {Object} user - User object
 * @param {string} role - Role to check for
 * @returns {boolean}
 */
export const userHasRole = (user, role) => {
  const roles = normalizeUserRoles(user);
  return roles.includes(role);
};

/**
 * Check if user has any of the specified roles
 * @param {Object} user - User object
 * @param {Array<string>} rolesToCheck - Array of roles to check
 * @returns {boolean}
 */
export const userHasAnyRole = (user, rolesToCheck) => {
  const roles = normalizeUserRoles(user);
  return rolesToCheck.some(role => roles.includes(role));
};

/**
 * Check if user has all of the specified roles
 * @param {Object} user - User object
 * @param {Array<string>} rolesToCheck - Array of roles that must all be present
 * @returns {boolean}
 */
export const userHasAllRoles = (user, rolesToCheck) => {
  const roles = normalizeUserRoles(user);
  return rolesToCheck.every(role => roles.includes(role));
};

/**
 * Get display string for user's roles
 * @param {Object} user - User object
 * @param {string} separator - Separator between roles (default: ', ')
 * @returns {string}
 */
export const getUserRolesDisplay = (user, separator = ', ') => {
  const roles = normalizeUserRoles(user);
  return roles.length > 0 ? roles.join(separator) : 'No Role';
};

/**
 * Check if user can manage other users based on their roles
 * @param {Object} user - User object
 * @returns {boolean}
 */
export const canManageUsers = (user) => {
  return userHasAnyRole(user, ['Super Admin', 'Admin']);
};

/**
 * Check if user can manage loads
 * @param {Object} user - User object
 * @returns {boolean}
 */
export const canManageLoads = (user) => {
  return userHasAnyRole(user, ['Super Admin', 'Admin', 'Dispatcher']);
};

/**
 * Check if user can manage drivers
 * @param {Object} user - User object
 * @returns {boolean}
 */
export const canManageDrivers = (user) => {
  return userHasAnyRole(user, ['Super Admin', 'Admin', 'HR', 'Fleet']);
};

/**
 * Check if user can manage trucks
 * @param {Object} user - User object
 * @returns {boolean}
 */
export const canManageTrucks = (user) => {
  return userHasAnyRole(user, ['Super Admin', 'Admin', 'Fleet']);
};

/**
 * Check if user can access accounting features
 * @param {Object} user - User object
 * @returns {boolean}
 */
export const canAccessAccounting = (user) => {
  return userHasAnyRole(user, ['Super Admin', 'Admin', 'Accountant']);
};

/**
 * Check if user can amend accounting data
 * @param {Object} user - User object
 * @returns {boolean}
 */
export const canAmendAccounting = (user) => {
  return userHasAnyRole(user, ['Super Admin', 'Admin', 'Accountant']);
};

/**
 * Check if user can hard delete records
 * @param {Object} user - User object
 * @returns {boolean}
 */
export const canHardDelete = (user) => {
  return userHasAnyRole(user, ['Super Admin', 'Admin']);
};

/**
 * Check if user can see dispatcher filter
 * @param {Object} user - User object
 * @returns {boolean}
 */
export const canSeeDispatcherFilter = (user) => {
  return userHasAnyRole(user, ['Super Admin', 'Admin']);
};

/**
 * Check if user can manage safety records
 * @param {Object} user - User object
 * @returns {boolean}
 */
export const canManageSafety = (user) => {
  return userHasAnyRole(user, ['Super Admin', 'Admin', 'HR', 'Fleet']);
};

/**
 * Get highest priority role for display purposes
 * Priority: Super Admin > Admin > Accountant > HR > Fleet > Dispatcher
 * @param {Object} user - User object
 * @returns {string}
 */
export const getPrimaryRole = (user) => {
  const roles = normalizeUserRoles(user);
  const rolePriority = ['Super Admin', 'Admin', 'Accountant', 'HR', 'Fleet', 'Dispatcher'];
  
  for (const priorityRole of rolePriority) {
    if (roles.includes(priorityRole)) {
      return priorityRole;
    }
  }
  
  return roles[0] || 'No Role';
};

/**
 * Validate roles array for user creation/update
 * @param {Array<string>} roles - Roles to validate
 * @param {number} maxRoles - Maximum number of roles allowed (default: 4)
 * @returns {Object} - { valid: boolean, error: string }
 */
export const validateRoles = (roles, maxRoles = 4) => {
  if (!Array.isArray(roles)) {
    return { valid: false, error: 'Roles must be an array' };
  }
  
  if (roles.length === 0) {
    return { valid: false, error: 'User must have at least one role' };
  }
  
  if (roles.length > maxRoles) {
    return { valid: false, error: `Users can have a maximum of ${maxRoles} roles` };
  }
  
  const validRoles = ['Super Admin', 'Admin', 'Dispatcher', 'Accountant', 'HR', 'Fleet'];
  const invalidRoles = roles.filter(role => !validRoles.includes(role));
  
  if (invalidRoles.length > 0) {
    return { valid: false, error: `Invalid roles: ${invalidRoles.join(', ')}` };
  }
  
  return { valid: true, error: null };
};

/**
 * Check if logged-in user can modify target user
 * @param {Object} loggedInUser - The user performing the action
 * @param {Object} targetUser - The user being modified
 * @returns {boolean}
 */
export const canModifyUser = (loggedInUser, targetUser) => {
  if (!loggedInUser || !targetUser) return false;
  
  const loggedInRoles = normalizeUserRoles(loggedInUser);
  const targetRoles = normalizeUserRoles(targetUser);
  
  // Super Admin can modify anyone except themselves in certain actions
  if (loggedInRoles.includes('Super Admin')) {
    return true;
  }
  
  // Admin can modify anyone except Super Admin and other Admins
  if (loggedInRoles.includes('Admin')) {
    if (targetRoles.includes('Super Admin') || targetRoles.includes('Admin')) {
      return false;
    }
    return true;
  }
  
  return false;
};

export default {
  normalizeUserRoles,
  userHasRole,
  userHasAnyRole,
  userHasAllRoles,
  getUserRolesDisplay,
  canManageUsers,
  canManageLoads,
  canManageDrivers,
  canManageTrucks,
  canAccessAccounting,
  canAmendAccounting,
  canHardDelete,
  canSeeDispatcherFilter,
  canManageSafety,
  getPrimaryRole,
  validateRoles,
  canModifyUser
};