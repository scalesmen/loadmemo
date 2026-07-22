// src/components/admin/TenantSwitcher.js
//
// Lists every tenant and lets the owner-admin jump into any of them ("view as").
// Rendered inside AdminApprovalDashboard. Reads the authoritative `tenants`
// collection; if security rules block that read, it surfaces a clear message.

import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, getDocs, orderBy, query } from 'firebase/firestore';
import { db } from '../../firebase';
import { useAdminView } from '../../contexts/AdminViewContext';

export default function TenantSwitcher() {
  const [tenants, setTenants] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');

  const { impersonatedTenant, setImpersonatedTenant } = useAdminView();
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;

    const loadTenants = async () => {
      setIsLoading(true);
      setError(null);
      try {
        // Ordered by companyName for a stable, scannable list.
        const q = query(collection(db, 'tenants'), orderBy('companyName'));
        const snap = await getDocs(q);
        if (cancelled) return;
        setTenants(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      } catch (e) {
        if (cancelled) return;
        console.error('Failed to load tenants:', e);
        setError(
          e?.code === 'permission-denied'
            ? 'permission-denied'
            : (e?.message || 'Unknown error loading tenants.')
        );
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    loadTenants();
    return () => { cancelled = true; };
  }, []);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return tenants;
    return tenants.filter((t) => {
      const name = (t.companyName || '').toLowerCase();
      const ownerEmail = (t.owner?.email || '').toLowerCase();
      const id = (t.id || '').toLowerCase();
      return name.includes(term) || ownerEmail.includes(term) || id.includes(term);
    });
  }, [tenants, search]);

  const handleView = (tenant) => {
    setImpersonatedTenant({ id: tenant.id, companyName: tenant.companyName || tenant.id });
    navigate('/dashboard');
  };

  const billingLabel = (tenant) => {
    const status = tenant.billing?.status || tenant.subscription?.status;
    if (!status) return null;
    const colors = {
      active: 'bg-green-100 text-green-700',
      trial: 'bg-blue-100 text-blue-700',
    };
    return (
      <span className={`px-2 py-0.5 text-xs rounded-full ${colors[status] || 'bg-gray-100 text-gray-600'}`}>
        {status}
      </span>
    );
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">🔁 View a Tenant's Account</h3>
          <p className="text-sm text-gray-600 mt-1">
            Open any tenant to see their loads, drivers, accounting and everything else — for support.
            A banner stays on screen the whole time so you always know you're in owner view.
          </p>
        </div>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search company, email, or ID…"
          className="w-full sm:w-64 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />
      </div>

      {impersonatedTenant?.id && (
        <div className="mb-4 text-sm bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-3 py-2">
          Currently viewing <strong>{impersonatedTenant.companyName}</strong>. Selecting another tenant switches your view.
        </div>
      )}

      {isLoading && (
        <div className="text-center py-10 text-gray-500">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-3"></div>
          Loading tenants…
        </div>
      )}

      {!isLoading && error === 'permission-denied' && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          <p className="font-semibold mb-1">Cannot read the tenants list.</p>
          <p>Your Firestore security rules don't allow this account to read the <code>tenants</code> collection.
          Add an owner-admin read rule in the Firebase Console, then reload.</p>
        </div>
      )}

      {!isLoading && error && error !== 'permission-denied' && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          Failed to load tenants: {error}
        </div>
      )}

      {!isLoading && !error && filtered.length === 0 && (
        <div className="text-center py-10 text-gray-500">
          {tenants.length === 0 ? 'No tenants found.' : 'No tenants match your search.'}
        </div>
      )}

      {!isLoading && !error && filtered.length > 0 && (
        <div className="divide-y divide-gray-100 border border-gray-100 rounded-lg overflow-hidden">
          {filtered.map((tenant) => (
            <div
              key={tenant.id}
              className="flex items-center justify-between gap-4 p-4 hover:bg-gray-50 transition-colors"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-gray-900 truncate">
                    {tenant.companyName || tenant.id}
                  </p>
                  {billingLabel(tenant)}
                </div>
                <p className="text-xs text-gray-500 truncate">
                  {tenant.owner?.email || 'No owner email'} · <span className="font-mono">{tenant.id}</span>
                </p>
              </div>
              <button
                onClick={() => handleView(tenant)}
                className="shrink-0 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
              >
                View as this company →
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
