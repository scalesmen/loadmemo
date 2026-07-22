// src/contexts/AdminViewContext.js
//
// Owner-admin "View as Tenant" state.
//
// This powers the ability for the business owner (admin@loadmemo.com) to view /
// operate inside any tenant's account for support. It ONLY has any effect for the
// owner-admin account — for every regular user this context is inert and the app
// behaves exactly as before.
//
// The selected tenant is persisted in sessionStorage so it survives page
// navigation/refresh but is cleared when the browser tab closes.

import React, { createContext, useContext, useState, useCallback } from 'react';
import { OWNER_ADMIN_EMAIL, IMPERSONATION_STORAGE_KEY } from '../utils/impersonation';

// Re-exported so existing importers (e.g. App.js) keep working.
export { OWNER_ADMIN_EMAIL };

const STORAGE_KEY = IMPERSONATION_STORAGE_KEY;

const AdminViewContext = createContext({
  impersonatedTenant: null,
  setImpersonatedTenant: () => {},
  clearImpersonation: () => {},
});

const readStored = () => {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
};

export const AdminViewProvider = ({ children }) => {
  // Shape: { id: string, companyName: string } | null
  const [impersonatedTenant, setImpersonatedTenantState] = useState(readStored);

  const setImpersonatedTenant = useCallback((tenant) => {
    setImpersonatedTenantState(tenant);
    try {
      if (tenant && tenant.id) {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(tenant));
      } else {
        sessionStorage.removeItem(STORAGE_KEY);
      }
    } catch (e) {
      // sessionStorage may be unavailable (private mode) — state still works in-memory.
    }
  }, []);

  const clearImpersonation = useCallback(() => {
    setImpersonatedTenant(null);
  }, [setImpersonatedTenant]);

  return (
    <AdminViewContext.Provider
      value={{ impersonatedTenant, setImpersonatedTenant, clearImpersonation }}
    >
      {children}
    </AdminViewContext.Provider>
  );
};

export const useAdminView = () => useContext(AdminViewContext);

export default AdminViewContext;
