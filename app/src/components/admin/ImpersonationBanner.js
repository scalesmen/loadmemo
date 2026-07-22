// src/components/admin/ImpersonationBanner.js
//
// Bright, always-visible bar shown while the owner-admin is viewing a tenant's
// account. Makes it impossible to forget you are operating inside someone else's
// data. Renders nothing when not impersonating.

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAdminView } from '../../contexts/AdminViewContext';

export default function ImpersonationBanner() {
  const { impersonatedTenant, clearImpersonation } = useAdminView();
  const navigate = useNavigate();

  if (!impersonatedTenant || !impersonatedTenant.id) return null;

  const handleExit = () => {
    clearImpersonation();
    navigate('/admin/tenants');
  };

  return (
    <div className="w-full bg-amber-500 text-amber-950 px-4 py-2 flex items-center justify-between gap-3 shadow-md z-40">
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-lg leading-none">👁️</span>
        <span className="text-sm font-semibold whitespace-nowrap">OWNER VIEW</span>
        <span className="text-sm truncate">
          You are viewing <span className="font-bold">{impersonatedTenant.companyName || impersonatedTenant.id}</span>
          <span className="hidden sm:inline"> — changes you make affect this tenant's live account.</span>
        </span>
      </div>
      <button
        onClick={handleExit}
        className="shrink-0 bg-amber-950 hover:bg-black text-white text-xs font-semibold px-3 py-1.5 rounded-md transition-colors"
      >
        Exit owner view
      </button>
    </div>
  );
}
