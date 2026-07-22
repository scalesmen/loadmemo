// src/utils/impersonation.js
//
// Shared owner-admin "view as tenant" helpers.
//
// Many pages don't take a loggedInUser prop — they fetch the signed-in user's
// own /users/{uid} document directly and read tenantId from it. For those pages,
// overriding a prop is not enough. Instead, right after they build their user
// object from Firestore, they pass it through applyOwnerImpersonation(), which —
// ONLY for admin@loadmemo.com and ONLY when a tenant has been selected in the
// "View Tenant" screen — swaps in that tenant's id and grants full in-tenant
// visibility. For every other user it returns the object untouched.
//
// The selected tenant lives in sessionStorage under the same key used by
// AdminViewContext, so both mechanisms stay in sync.

export const OWNER_ADMIN_EMAIL = 'admin@loadmemo.com';
export const IMPERSONATION_STORAGE_KEY = 'lm_impersonatedTenant';

// Returns { id, companyName } | null
export const getImpersonatedTenant = () => {
  try {
    const raw = sessionStorage.getItem(IMPERSONATION_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
};

/**
 * If the owner-admin is currently viewing a tenant, return a copy of userObj
 * scoped to that tenant (with full Super Admin visibility). Otherwise return
 * userObj unchanged.
 *
 * @param {Object} userObj  The user object a page just built from Firestore.
 * @param {string} [email]  Explicit auth email, used when userObj may not carry
 *                          an `email` field (some pages omit it).
 */
export const applyOwnerImpersonation = (userObj, email) => {
  if (!userObj) return userObj;
  const effectiveEmail = email || userObj.email;
  if (effectiveEmail !== OWNER_ADMIN_EMAIL) return userObj;

  const imp = getImpersonatedTenant();
  if (!imp || !imp.id) return userObj;

  return {
    ...userObj,
    email: effectiveEmail,
    tenantId: imp.id,
    role: 'Super Admin',
    roles: ['Super Admin'],
    assignedParentCompanyIds: undefined,
    assignedCompanyId: undefined,
    _impersonating: true,
    _ownerEmail: effectiveEmail,
    _impersonatedCompanyName: imp.companyName,
  };
};
