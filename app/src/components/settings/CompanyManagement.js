// src/components/settings/CompanyManagement.js
// Phase 1: Company Hierarchy Management with Parent/Subdivision structure
// and assignment of drivers, trucks, and users to parent companies.
// Only Super Admin can manage companies and assignments.

import React, { useEffect, useState } from 'react';
import { db, auth } from '../../firebase';
import { applyOwnerImpersonation } from '../../utils/impersonation';
import { logAudit } from '../../utils/auditLog';
import {
  collection, query, where, onSnapshot, doc, addDoc, updateDoc,
  serverTimestamp, getDocs, writeBatch
} from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';

const MAX_SUBDIVISIONS = 5;

const initialCompanyState = {
  name: '',
  address: '',
  phone: '',
  email: '',
  mcNumber: '',
  usdot: '',
  taxId: '',
  logoPath: '',
  logoUrl: '',
};

// ============================================================================
// HELPER: Check if user is Super Admin
// ============================================================================
const isSuperAdmin = (user) => {
  if (!user) return false;
  const roles = Array.isArray(user.role) ? user.role : [user.role].filter(Boolean);
  return roles.includes('Super Admin');
};

// ============================================================================
// ASSIGNMENT MODAL COMPONENT
// ============================================================================
const AssignmentModal = ({
  isOpen,
  onClose,
  parentCompany,
  allItems,
  assignedItemIds,
  onSave,
  isSaving,
  title,
  itemLabelKey,
  itemSubLabelKey,
  itemType,
  companyOptions, // Array of {id, name} — parent + its subdivisions (for drivers/trucks only)
}) => {
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  // Map of itemId -> chosen assignedCompanyId for BOL/invoice branding
  const [bolCompanyMap, setBolCompanyMap] = useState({});

  const showBolDropdown = itemType === 'drivers' || itemType === 'trucks';

  useEffect(() => {
    if (isOpen) {
      setSelectedIds(new Set(assignedItemIds));
      setSearchQuery('');
      // Initialize BOL company map from existing assignedCompanyId on each item
      const initialMap = {};
      allItems.forEach(item => {
        if (assignedItemIds.includes(item.id)) {
          // If item already has an assignedCompanyId that's in our options, use it
          const currentAssigned = item.assignedCompanyId || '';
          const isValidOption = companyOptions?.some(opt => opt.id === currentAssigned);
          initialMap[item.id] = isValidOption ? currentAssigned : (parentCompany?.id || '');
        }
      });
      setBolCompanyMap(initialMap);
    }
  }, [isOpen, assignedItemIds, allItems, companyOptions, parentCompany]);

  if (!isOpen) return null;

  const filteredItems = allItems.filter(item => {
    const label = item[itemLabelKey] || '';
    const subLabel = item[itemSubLabelKey] || '';
    const q = searchQuery.toLowerCase();
    return label.toLowerCase().includes(q) || subLabel.toLowerCase().includes(q);
  });

  const handleToggle = (itemId) => {
    const next = new Set(selectedIds);
    if (next.has(itemId)) {
      next.delete(itemId);
      // Remove from BOL map too
      setBolCompanyMap(prev => {
        const updated = { ...prev };
        delete updated[itemId];
        return updated;
      });
    } else {
      next.add(itemId);
      // Default BOL company to parent
      setBolCompanyMap(prev => ({
        ...prev,
        [itemId]: parentCompany?.id || '',
      }));
    }
    setSelectedIds(next);
  };

  const handleSelectAll = () => {
    const allFilteredIds = filteredItems.map(i => i.id);
    const allSelected = allFilteredIds.every(id => selectedIds.has(id));
    const next = new Set(selectedIds);
    const newBolMap = { ...bolCompanyMap };

    if (allSelected) {
      allFilteredIds.forEach(id => {
        next.delete(id);
        delete newBolMap[id];
      });
    } else {
      allFilteredIds.forEach(id => {
        next.add(id);
        if (!newBolMap[id]) {
          newBolMap[id] = parentCompany?.id || '';
        }
      });
    }
    setSelectedIds(next);
    setBolCompanyMap(newBolMap);
  };

  const handleBolCompanyChange = (itemId, companyId) => {
    setBolCompanyMap(prev => ({ ...prev, [itemId]: companyId }));
  };

  const handleSave = () => {
    onSave(Array.from(selectedIds), bolCompanyMap);
  };

  const addedCount = [...selectedIds].filter(id => !assignedItemIds.includes(id)).length;
  const removedCount = assignedItemIds.filter(id => !selectedIds.has(id)).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60 p-4">
      <div className={`bg-white rounded-lg shadow-xl w-full ${showBolDropdown ? 'max-w-2xl' : 'max-w-lg'} max-h-[85vh] flex flex-col`}>
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-800">{title}</h3>
          <p className="text-sm text-gray-500 mt-1">
            Assign {itemType} to <span className="font-medium text-blue-700">{parentCompany?.name}</span>
          </p>
          {showBolDropdown && (
            <p className="text-xs text-gray-400 mt-1">
              Use the dropdown to choose which company appears on BOL/invoices (parent or subdivision).
            </p>
          )}
        </div>

        {/* Search */}
        <div className="px-6 py-3 border-b border-gray-100">
          <input
            type="text"
            placeholder={`Search ${itemType}...`}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-blue-500 focus:border-blue-500"
          />
        </div>

        {/* Column Headers for drivers/trucks */}
        {showBolDropdown && filteredItems.length > 0 && (
          <div className="px-6 py-2 border-b border-gray-100 bg-gray-50 flex items-center gap-3">
            <div className="w-4 flex-shrink-0"></div>
            <div className="flex-1 text-xs font-semibold text-gray-500 uppercase">
              {itemType === 'drivers' ? 'Driver' : 'Truck'}
            </div>
            <div className="w-48 flex-shrink-0 text-xs font-semibold text-gray-500 uppercase">
              BOL / Invoice Company
            </div>
            <div className="w-16 flex-shrink-0"></div>
          </div>
        )}

        {/* Items list */}
        <div className="flex-1 overflow-y-auto px-6 py-3">
          {filteredItems.length === 0 ? (
            <p className="text-gray-400 text-sm text-center py-8">
              No {itemType} found{searchQuery ? ' matching search' : ''}
            </p>
          ) : (
            <>
              {/* Select all toggle */}
              <label className="flex items-center gap-2 mb-3 pb-3 border-b border-gray-100 cursor-pointer">
                <input
                  type="checkbox"
                  checked={filteredItems.length > 0 && filteredItems.every(i => selectedIds.has(i.id))}
                  onChange={handleSelectAll}
                  className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                />
                <span className="text-sm font-medium text-gray-700">
                  Select all ({filteredItems.length})
                </span>
              </label>

              {filteredItems.map(item => {
                const isSelected = selectedIds.has(item.id);
                const currentParent = item.parentCompanyName || '';
                const isAssignedElsewhere = item.parentCompanyId && item.parentCompanyId !== parentCompany?.id;
                
                return (
                  <div
                    key={item.id}
                    className={`flex items-center gap-3 py-2.5 px-2 rounded-md transition-colors ${
                      isSelected ? 'bg-blue-50' : 'hover:bg-gray-50'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => handleToggle(item.id)}
                      className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500 flex-shrink-0 cursor-pointer"
                    />
                    <div className="flex-1 min-w-0 cursor-pointer" onClick={() => handleToggle(item.id)}>
                      <div className="text-sm font-medium text-gray-800 truncate">
                        {item[itemLabelKey]}
                      </div>
                      {item[itemSubLabelKey] && (
                        <div className="text-xs text-gray-500 truncate">{item[itemSubLabelKey]}</div>
                      )}
                    </div>

                    {/* BOL Company Dropdown — only for drivers/trucks, only when selected */}
                    {showBolDropdown && isSelected && companyOptions && (
                      <select
                        value={bolCompanyMap[item.id] || parentCompany?.id || ''}
                        onChange={(e) => handleBolCompanyChange(item.id, e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        className="w-48 flex-shrink-0 border border-gray-300 rounded-md px-2 py-1 text-xs focus:ring-blue-500 focus:border-blue-500 bg-white"
                      >
                        {companyOptions.map(opt => (
                          <option key={opt.id} value={opt.id}>
                            {opt.isParent ? `★ ${opt.name}` : `  └ ${opt.name}`}
                          </option>
                        ))}
                      </select>
                    )}

                    {/* Show current parent if assigned elsewhere */}
                    {isAssignedElsewhere && !isSelected && (
                      <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded-full flex-shrink-0">
                        {currentParent}
                      </span>
                    )}

                    {item.status && (
                      <span className={`text-xs px-2 py-0.5 rounded-full flex-shrink-0 ${
                        item.status === 'Active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'
                      }`}>
                        {item.status}
                      </span>
                    )}
                  </div>
                );
              })}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 rounded-b-lg">
          <div className="flex items-center justify-between">
            <div className="text-xs text-gray-500">
              {selectedIds.size} selected
              {addedCount > 0 && <span className="text-green-600 ml-2">+{addedCount} new</span>}
              {removedCount > 0 && <span className="text-red-600 ml-2">-{removedCount} removed</span>}
            </div>
            <div className="flex gap-2">
              <button
                onClick={onClose}
                disabled={isSaving}
                className="bg-gray-200 hover:bg-gray-300 text-gray-700 px-4 py-2 rounded-md text-sm font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md text-sm font-medium disabled:opacity-50"
              >
                {isSaving ? 'Saving...' : 'Save Assignments'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// SUBDIVISION ROW COMPONENT
// ============================================================================
const SubdivisionRow = ({ sub, onEdit, onToggleActive, canManage }) => (
  <div className={`flex items-center justify-between py-2 px-3 rounded-md ${
    sub.active ? 'bg-white' : 'bg-gray-100 opacity-70'
  }`}>
    <div className="flex items-center gap-2">
      <span className="text-gray-400 text-xs">└</span>
      <span className="text-sm font-medium text-gray-700">{sub.name}</span>
      {!sub.active && (
        <span className="text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded">Inactive</span>
      )}
    </div>
    {canManage && (
      <div className="flex items-center gap-2">
        <button
          onClick={() => onEdit(sub)}
          className="text-indigo-600 hover:text-indigo-800 text-xs font-medium"
        >
          Edit
        </button>
        <button
          onClick={() => onToggleActive(sub)}
          className={`text-xs font-medium ${sub.active ? 'text-yellow-600 hover:text-yellow-800' : 'text-green-600 hover:text-green-800'}`}
        >
          {sub.active ? 'Deactivate' : 'Activate'}
        </button>
      </div>
    )}
  </div>
);

// ============================================================================
// MAIN COMPONENT
// ============================================================================
export default function CompanyManagement() {
  // Auth state (self-managed, same pattern as UserManagement)
  const [loggedInUser, setLoggedInUser] = useState(null);

  // Data state
  const [companies, setCompanies] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [trucks, setTrucks] = useState([]);
  const [users, setUsers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  // Company modal state
  const [showCompanyModal, setShowCompanyModal] = useState(false);
  const [companyForm, setCompanyForm] = useState(initialCompanyState);
  const [isEditingCompany, setIsEditingCompany] = useState(false);
  const [editingCompanyId, setEditingCompanyId] = useState(null);
  const [companyModalType, setCompanyModalType] = useState('parent'); // 'parent' or 'subdivision'
  const [subdivisionParentId, setSubdivisionParentId] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);

  // Assignment modal state
  const [showAssignmentModal, setShowAssignmentModal] = useState(false);
  const [assignmentType, setAssignmentType] = useState(null); // 'drivers', 'trucks', 'users'
  const [assignmentParentCompany, setAssignmentParentCompany] = useState(null);
  const [isSavingAssignment, setIsSavingAssignment] = useState(false);

  // Expanded parent companies
  const [expandedParents, setExpandedParents] = useState(new Set());

  // ============================================================================
  // AUTH LISTENER (same pattern as UserManagement)
  // ============================================================================
  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      if (user) {
        const unsubProfile = onSnapshot(doc(db, 'users', user.uid), (docSnap) => {
          if (docSnap.exists()) {
            setLoggedInUser(applyOwnerImpersonation({ uid: user.uid, email: user.email, ...docSnap.data() }));
          } else {
            setLoggedInUser({ uid: user.uid, email: user.email, role: [] });
          }
        });
        return () => unsubProfile();
      } else {
        setLoggedInUser(null);
      }
    });
    return unsubscribeAuth;
  }, []);

  const canManage = isSuperAdmin(loggedInUser);
  const tenantId = loggedInUser?.tenantId;

  // ============================================================================
  // DATA FETCHING
  // ============================================================================
  useEffect(() => {
    if (!tenantId) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);

    // Fetch companies
    const companiesQuery = query(
      collection(db, 'companies'),
      where('tenantId', '==', tenantId)
    );
    const unsubCompanies = onSnapshot(companiesQuery, (snapshot) => {
      const list = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      setCompanies(list);
      setIsLoading(false);
    });

    // Fetch drivers (all, not just active — so we can see full picture)
    const driversQuery = query(
      collection(db, 'drivers'),
      where('tenantId', '==', tenantId)
    );
    const unsubDrivers = onSnapshot(driversQuery, (snapshot) => {
      const list = snapshot.docs.map(d => ({ id: d.id, ...d.data() }))
        .filter(d => !d.isDeleted && d.status !== 'Deleted');
      setDrivers(list);
    });

    // Fetch trucks
    const trucksQuery = query(
      collection(db, 'trucks'),
      where('tenantId', '==', tenantId)
    );
    const unsubTrucks = onSnapshot(trucksQuery, (snapshot) => {
      const list = snapshot.docs.map(d => ({ id: d.id, ...d.data() }))
        .filter(t => !t.isDeleted && t.status !== 'Deleted');
      setTrucks(list);
    });

    // Fetch users (non-Super Admin users for assignment)
    const usersQuery = query(
      collection(db, 'users'),
      where('tenantId', '==', tenantId)
    );
    const unsubUsers = onSnapshot(usersQuery, (snapshot) => {
      const list = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      setUsers(list);
    });

    return () => {
      unsubCompanies();
      unsubDrivers();
      unsubTrucks();
      unsubUsers();
    };
  }, [tenantId]);

  // ============================================================================
  // DERIVED DATA
  // ============================================================================
  const allParentCompanies = companies
    .filter(c => !c.parentCompanyId && c.type !== 'subdivision')
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''));

// Main Admin only sees their assigned companies
const userParentCompanyIds = loggedInUser?.assignedParentCompanyIds || [];
const parentCompanies = canManage 
    ? allParentCompanies 
    : allParentCompanies.filter(c => userParentCompanyIds.includes(c.id));

  const getSubdivisions = (parentId) =>
    companies
      .filter(c => c.parentCompanyId === parentId)
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''));

  const getAssignedDrivers = (parentId) =>
    drivers.filter(d => d.parentCompanyId === parentId);

  const getAssignedTrucks = (parentId) =>
    trucks.filter(t => t.parentCompanyId === parentId);

  const getAssignedUsers = (parentId) =>
    users.filter(u => {
      const ids = u.assignedParentCompanyIds || [];
      return ids.includes(parentId);
    });

  // Count unassigned
  const unassignedDrivers = drivers.filter(d => !d.parentCompanyId);
  const unassignedTrucks = trucks.filter(t => !t.parentCompanyId);
  const unassignedUsers = users.filter(u => {
    if (isSuperAdmin(u)) return false; // Super Admins don't need assignment
    const ids = u.assignedParentCompanyIds || [];
    return ids.length === 0;
  });

  // ============================================================================
  // COMPANY CRUD HANDLERS
  // ============================================================================
  const handleOpenAddParent = () => {
    setCompanyForm(initialCompanyState);
    setIsEditingCompany(false);
    setEditingCompanyId(null);
    setCompanyModalType('parent');
    setSubdivisionParentId(null);
    setShowCompanyModal(true);
  };

  const handleOpenAddSubdivision = (parentId) => {
    const subs = getSubdivisions(parentId);
    if (subs.length >= MAX_SUBDIVISIONS) {
      alert(`Maximum ${MAX_SUBDIVISIONS} subdivisions per parent company.`);
      return;
    }
    setCompanyForm(initialCompanyState);
    setIsEditingCompany(false);
    setEditingCompanyId(null);
    setCompanyModalType('subdivision');
    setSubdivisionParentId(parentId);
    setShowCompanyModal(true);
  };

  const handleOpenEditCompany = (company) => {
    setCompanyForm({
      name: company.name || '',
      address: company.address || '',
      phone: company.phone || '',
      email: company.email || '',
      mcNumber: company.mcNumber || '',
      usdot: company.usdot || '',
      taxId: company.taxId || '',
      logoPath: company.logoPath || '',
      logoUrl: company.logoUrl || '',
    });
    setIsEditingCompany(true);
    setEditingCompanyId(company.id);
    setCompanyModalType(company.parentCompanyId ? 'subdivision' : 'parent');
    setSubdivisionParentId(company.parentCompanyId || null);
    setShowCompanyModal(true);
  };

  const handleCompanyFormChange = (e) => {
    const { name, value } = e.target;
    setCompanyForm(prev => ({ ...prev, [name]: value }));
  };

  const handleCompanyFormSubmit = async (e) => {
    e.preventDefault();
    if (!companyForm.name?.trim()) {
      alert('Company name is required.');
      return;
    }

    setIsProcessing(true);
    try {
      if (isEditingCompany && editingCompanyId) {
        // UPDATE existing company
        const companyRef = doc(db, 'companies', editingCompanyId);
        const updateData = {
          name: companyForm.name.trim(),
          address: companyForm.address.trim(),
          phone: companyForm.phone.trim(),
          email: companyForm.email.trim(),
          mcNumber: companyForm.mcNumber.trim(),
          usdot: companyForm.usdot.trim(),
          taxId: companyForm.taxId.trim(),
          updatedAt: serverTimestamp(),
        };
        await updateDoc(companyRef, updateData);

        const oldCompanyForLog = companies.find(c => c.id === editingCompanyId);
        const changes = {};
        for (const field of ['name', 'address', 'phone', 'email', 'mcNumber', 'usdot', 'taxId']) {
          const oldValue = oldCompanyForLog?.[field] || '';
          const newValue = updateData[field];
          if (oldValue !== newValue) changes[field] = { oldValue, newValue };
        }
        if (Object.keys(changes).length > 0) {
          logAudit({
            userId: loggedInUser.uid,
            userEmail: loggedInUser.email,
            action: 'COMPANY_UPDATED',
            targetType: 'company',
            targetId: editingCompanyId,
            details: { companyName: updateData.name, changes },
            tenantId
          });
        }

        // If editing a parent company, update denormalized parentCompanyName on subdivisions, drivers, trucks, loads
        if (companyModalType === 'parent') {
          const oldCompany = companies.find(c => c.id === editingCompanyId);
          if (oldCompany && oldCompany.name !== companyForm.name.trim()) {
            await updateDenormalizedParentName(editingCompanyId, companyForm.name.trim());
          }
        }

        // If editing a subdivision, update denormalized assignedCompanyName on drivers/trucks that use this subdivision
        if (companyModalType === 'subdivision') {
          const oldCompany = companies.find(c => c.id === editingCompanyId);
          if (oldCompany && oldCompany.name !== companyForm.name.trim()) {
            await updateDenormalizedSubdivisionName(editingCompanyId, companyForm.name.trim());
          }
        }

        alert('Company updated successfully!');
      } else {
        // CREATE new company
        const parentCompany = subdivisionParentId
          ? companies.find(c => c.id === subdivisionParentId)
          : null;

        const newCompanyData = {
          name: companyForm.name.trim(),
          address: companyForm.address.trim(),
          phone: companyForm.phone.trim(),
          email: companyForm.email.trim(),
          mcNumber: companyForm.mcNumber.trim(),
          usdot: companyForm.usdot.trim(),
          taxId: companyForm.taxId.trim(),
          logoPath: '',
          logoUrl: '',
          active: true,
          tenantId: tenantId,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          // Hierarchy fields
          type: companyModalType === 'subdivision' ? 'subdivision' : 'parent',
          parentCompanyId: subdivisionParentId || null,
          parentCompanyName: parentCompany?.name || null,
        };

        const newCompanyRef = await addDoc(collection(db, 'companies'), newCompanyData);
        logAudit({
          userId: loggedInUser.uid,
          userEmail: loggedInUser.email,
          action: 'COMPANY_CREATED',
          targetType: 'company',
          targetId: newCompanyRef.id,
          details: {
            companyName: newCompanyData.name,
            usdot: newCompanyData.usdot,
            mcNumber: newCompanyData.mcNumber,
            taxId: newCompanyData.taxId
          },
          tenantId
        });
        alert(`${companyModalType === 'subdivision' ? 'Subdivision' : 'Company'} created successfully!`);
      }

      setShowCompanyModal(false);
      setCompanyForm(initialCompanyState);
    } catch (error) {
      console.error('Error saving company:', error);
      alert('Failed to save company: ' + error.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleToggleCompanyActive = async (company) => {
    const newActive = !company.active;
    const label = company.parentCompanyId ? 'subdivision' : 'company';

    if (!window.confirm(
      `${newActive ? 'Activate' : 'Deactivate'} ${label} "${company.name}"?` +
      (!newActive && !company.parentCompanyId ? '\n\nThis will NOT deactivate subdivisions — do that separately if needed.' : '')
    )) return;

    try {
      await updateDoc(doc(db, 'companies', company.id), {
        active: newActive,
        updatedAt: serverTimestamp(),
      });
      logAudit({
        userId: loggedInUser.uid,
        userEmail: loggedInUser.email,
        action: 'COMPANY_STATUS_TOGGLED',
        targetType: 'company',
        targetId: company.id,
        details: { companyName: company.name, newStatus: newActive ? 'Active' : 'Inactive' },
        tenantId
      });
      alert(`${company.name} ${newActive ? 'activated' : 'deactivated'}.`);
    } catch (error) {
      console.error('Error toggling company:', error);
      alert('Failed to update company: ' + error.message);
    }
  };

  // ============================================================================
  // DENORMALIZATION HELPERS
  // ============================================================================
  const updateDenormalizedParentName = async (parentId, newName) => {
    const batch = writeBatch(db);

    // Update subdivisions
    const subs = companies.filter(c => c.parentCompanyId === parentId);
    subs.forEach(sub => {
      batch.update(doc(db, 'companies', sub.id), { parentCompanyName: newName });
    });

    // Update drivers with this parentCompanyId
    const assignedDrivers = drivers.filter(d => d.parentCompanyId === parentId);
    assignedDrivers.forEach(d => {
      batch.update(doc(db, 'drivers', d.id), { parentCompanyName: newName });
    });

    // Update trucks with this parentCompanyId
    const assignedTrucks = trucks.filter(t => t.parentCompanyId === parentId);
    assignedTrucks.forEach(t => {
      batch.update(doc(db, 'trucks', t.id), { parentCompanyName: newName });
    });

    // Update users — need to update the names array
    const assignedUsers = users.filter(u => (u.assignedParentCompanyIds || []).includes(parentId));
    assignedUsers.forEach(u => {
      const ids = u.assignedParentCompanyIds || [];
      const names = u.assignedParentCompanyNames || [];
      const idx = ids.indexOf(parentId);
      if (idx !== -1) {
        const newNames = [...names];
        newNames[idx] = newName;
        batch.update(doc(db, 'users', u.id), { assignedParentCompanyNames: newNames });
      }
    });

    await batch.commit();
  };

  const updateDenormalizedSubdivisionName = async (subdivisionId, newName) => {
    const batch = writeBatch(db);

    // Update drivers whose assignedCompanyId points to this subdivision
    const affectedDrivers = drivers.filter(d => d.assignedCompanyId === subdivisionId);
    affectedDrivers.forEach(d => {
      batch.update(doc(db, 'drivers', d.id), { assignedCompanyName: newName });
    });

    // Update trucks whose assignedCompanyId points to this subdivision
    const affectedTrucks = trucks.filter(t => t.assignedCompanyId === subdivisionId);
    affectedTrucks.forEach(t => {
      batch.update(doc(db, 'trucks', t.id), { assignedCompanyName: newName });
    });

    await batch.commit();
  };

  // ============================================================================
  // ASSIGNMENT HANDLERS
  // ============================================================================
  const handleOpenAssignment = (type, parentCompany) => {
    setAssignmentType(type);
    setAssignmentParentCompany(parentCompany);
    setShowAssignmentModal(true);
  };

  const handleSaveAssignment = async (selectedIds, bolCompanyMap = {}) => {
    if (!assignmentParentCompany || !assignmentType) return;

    setIsSavingAssignment(true);
    try {
      const parentId = assignmentParentCompany.id;
      const parentName = assignmentParentCompany.name;
      const batch = writeBatch(db);

      if (assignmentType === 'drivers') {
        // Get currently assigned driver IDs for this parent
        const currentlyAssigned = drivers.filter(d => d.parentCompanyId === parentId).map(d => d.id);
        const toAdd = selectedIds.filter(id => !currentlyAssigned.includes(id));
        const toRemove = currentlyAssigned.filter(id => !selectedIds.includes(id));
        const toUpdate = selectedIds.filter(id => currentlyAssigned.includes(id));

        // Add parent company to newly selected drivers + set BOL company
        toAdd.forEach(driverId => {
  const bolCompanyId = bolCompanyMap[driverId] || parentId;
  const bolCompany = companies.find(c => c.id === bolCompanyId);
  const driver = drivers.find(d => d.id === driverId);
  
  batch.update(doc(db, 'drivers', driverId), {
    parentCompanyId: parentId,
    parentCompanyName: parentName,
    assignedCompanyId: bolCompanyId,
    assignedCompanyName: bolCompany?.name || parentName,
    updatedAt: serverTimestamp(),
  });

  // Auto-assign driver's truck to same parent company
  if (driver?.assignedTruckId) {
    const truckAlreadyAssigned = trucks.find(t => t.id === driver.assignedTruckId);
    if (truckAlreadyAssigned && truckAlreadyAssigned.parentCompanyId !== parentId) {
      batch.update(doc(db, 'trucks', driver.assignedTruckId), {
        parentCompanyId: parentId,
        parentCompanyName: parentName,
        assignedCompanyId: bolCompanyId,
        assignedCompanyName: bolCompany?.name || parentName,
        updatedAt: serverTimestamp(),
      });
    }
  }
});

        // Update BOL company for already-assigned drivers (in case dropdown changed)
        toUpdate.forEach(driverId => {
          const bolCompanyId = bolCompanyMap[driverId];
          if (bolCompanyId) {
            const driver = drivers.find(d => d.id === driverId);
            // Only update if BOL company actually changed
            if (driver?.assignedCompanyId !== bolCompanyId) {
              const bolCompany = companies.find(c => c.id === bolCompanyId);
              batch.update(doc(db, 'drivers', driverId), {
                assignedCompanyId: bolCompanyId,
                assignedCompanyName: bolCompany?.name || parentName,
                updatedAt: serverTimestamp(),
              });
            }
          }
        });

        // Remove parent company from unselected drivers + clear BOL company
        toRemove.forEach(driverId => {
  const driver = drivers.find(d => d.id === driverId);
  
  batch.update(doc(db, 'drivers', driverId), {
    parentCompanyId: null,
    parentCompanyName: null,
    assignedCompanyId: '',
    assignedCompanyName: '',
    updatedAt: serverTimestamp(),
  });

  // Auto-unassign driver's truck too
  if (driver?.assignedTruckId) {
    batch.update(doc(db, 'trucks', driver.assignedTruckId), {
      parentCompanyId: null,
      parentCompanyName: null,
      assignedCompanyId: '',
      assignedCompanyName: '',
      updatedAt: serverTimestamp(),
    });
  }
});
      } else if (assignmentType === 'trucks') {
        const currentlyAssigned = trucks.filter(t => t.parentCompanyId === parentId).map(t => t.id);
        const toAdd = selectedIds.filter(id => !currentlyAssigned.includes(id));
        const toRemove = currentlyAssigned.filter(id => !selectedIds.includes(id));
        const toUpdate = selectedIds.filter(id => currentlyAssigned.includes(id));

        toAdd.forEach(truckId => {
          const bolCompanyId = bolCompanyMap[truckId] || parentId;
          const bolCompany = companies.find(c => c.id === bolCompanyId);
          batch.update(doc(db, 'trucks', truckId), {
            parentCompanyId: parentId,
            parentCompanyName: parentName,
            assignedCompanyId: bolCompanyId,
            assignedCompanyName: bolCompany?.name || parentName,
            updatedAt: serverTimestamp(),
          });
        });

        toUpdate.forEach(truckId => {
          const bolCompanyId = bolCompanyMap[truckId];
          if (bolCompanyId) {
            const truck = trucks.find(t => t.id === truckId);
            if (truck?.assignedCompanyId !== bolCompanyId) {
              const bolCompany = companies.find(c => c.id === bolCompanyId);
              batch.update(doc(db, 'trucks', truckId), {
                assignedCompanyId: bolCompanyId,
                assignedCompanyName: bolCompany?.name || parentName,
                updatedAt: serverTimestamp(),
              });
            }
          }
        });

        toRemove.forEach(truckId => {
          batch.update(doc(db, 'trucks', truckId), {
            parentCompanyId: null,
            parentCompanyName: null,
            assignedCompanyId: '',
            assignedCompanyName: '',
            updatedAt: serverTimestamp(),
          });
        });

      } else if (assignmentType === 'users') {
        // Users have arrays — add/remove this parentId from their arrays
        const currentlyAssigned = users
          .filter(u => (u.assignedParentCompanyIds || []).includes(parentId))
          .map(u => u.id);
        const toAdd = selectedIds.filter(id => !currentlyAssigned.includes(id));
        const toRemove = currentlyAssigned.filter(id => !selectedIds.includes(id));

        toAdd.forEach(userId => {
          const user = users.find(u => u.id === userId);
          const existingIds = user?.assignedParentCompanyIds || [];
          const existingNames = user?.assignedParentCompanyNames || [];
          batch.update(doc(db, 'users', userId), {
            assignedParentCompanyIds: [...existingIds, parentId],
            assignedParentCompanyNames: [...existingNames, parentName],
          });
        });

        toRemove.forEach(userId => {
          const user = users.find(u => u.id === userId);
          const existingIds = user?.assignedParentCompanyIds || [];
          const existingNames = user?.assignedParentCompanyNames || [];
          const idx = existingIds.indexOf(parentId);
          if (idx !== -1) {
            const newIds = existingIds.filter((_, i) => i !== idx);
            const newNames = existingNames.filter((_, i) => i !== idx);
            batch.update(doc(db, 'users', userId), {
              assignedParentCompanyIds: newIds,
              assignedParentCompanyNames: newNames,
            });
          }
        });
      }

      await batch.commit();
      setShowAssignmentModal(false);
      alert('Assignments updated successfully!');
    } catch (error) {
      console.error('Error saving assignments:', error);
      alert('Failed to save assignments: ' + error.message);
    } finally {
      setIsSavingAssignment(false);
    }
  };

  // ============================================================================
  // EXPAND/COLLAPSE
  // ============================================================================
  const toggleExpand = (parentId) => {
    setExpandedParents(prev => {
      const next = new Set(prev);
      if (next.has(parentId)) {
        next.delete(parentId);
      } else {
        next.add(parentId);
      }
      return next;
    });
  };

  // ============================================================================
  // ASSIGNMENT MODAL DATA
  // ============================================================================
  const getAssignmentModalProps = () => {
    if (!assignmentType || !assignmentParentCompany) return {};

    const parentId = assignmentParentCompany.id;

    // Build company options: parent company + its subdivisions
    const buildCompanyOptions = () => {
      const options = [
        { id: assignmentParentCompany.id, name: assignmentParentCompany.name, isParent: true }
      ];
      const subs = companies
        .filter(c => c.parentCompanyId === parentId && c.active !== false)
        .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      subs.forEach(sub => {
        options.push({ id: sub.id, name: sub.name, isParent: false });
      });
      return options;
    };

    switch (assignmentType) {
      case 'drivers':
        return {
          allItems: drivers,
          assignedItemIds: drivers.filter(d => d.parentCompanyId === parentId).map(d => d.id),
          title: 'Assign Drivers',
          itemLabelKey: 'name',
          itemSubLabelKey: 'email',
          itemType: 'drivers',
          companyOptions: buildCompanyOptions(),
        };
      case 'trucks':
        return {
          allItems: trucks,
          assignedItemIds: trucks.filter(t => t.parentCompanyId === parentId).map(t => t.id),
          title: 'Assign Trucks',
          itemLabelKey: 'unitNumber',
          itemSubLabelKey: 'yearMake',
          itemType: 'trucks',
          companyOptions: buildCompanyOptions(),
        };
      case 'users':
        // Exclude Super Admins from assignment (they see everything)
        const assignableUsers = users.filter(u => !isSuperAdmin(u));
        return {
          allItems: assignableUsers,
          assignedItemIds: assignableUsers
            .filter(u => (u.assignedParentCompanyIds || []).includes(parentId))
            .map(u => u.id),
          title: 'Assign Users',
          itemLabelKey: 'name',
          itemSubLabelKey: 'email',
          itemType: 'users',
          companyOptions: null, // Users don't need BOL dropdown
        };
      default:
        return {};
    }
  };

  // ============================================================================
  // RENDER
  // ============================================================================
  if (!loggedInUser) {
    return <div className="p-6 text-center text-gray-500">Please log in.</div>;
  }

  const isMainAdminUser = !canManage && (() => {
  const roles = Array.isArray(loggedInUser?.role) ? loggedInUser.role : [loggedInUser?.role].filter(Boolean);
  return roles.includes('Main Admin');
})();

if (!canManage && !isMainAdminUser) {
    return (
      <div className="p-6 bg-red-50 rounded-lg border border-red-200">
        <h3 className="text-lg font-semibold text-red-800">Access Denied</h3>
        <p className="text-red-700 text-sm mt-1">Only Super Admin can manage companies.</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <span className="ml-3 text-gray-600">Loading companies...</span>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-6">
        <div>
          <h2 className="text-xl font-semibold text-gray-800">Company Management</h2>
          <p className="text-sm text-gray-500 mt-1">
            Create parent companies with subdivisions. Assign drivers, trucks, and users to control data visibility.
          </p>
        </div>
        <button
          onClick={handleOpenAddParent}
          className="bg-blue-500 hover:bg-blue-600 text-white font-medium py-2 px-4 rounded-md text-sm flex items-center shadow-sm"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-5 h-5 mr-2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          Add Parent Company
        </button>
      </div>

      {/* Unassigned Warning */}
      {(unassignedDrivers.length > 0 || unassignedTrucks.length > 0 || unassignedUsers.length > 0) && (
        <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
          <div className="flex items-start gap-2">
            <svg className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div className="text-sm">
              <p className="font-medium text-yellow-800">Unassigned Resources</p>
              <p className="text-yellow-700 mt-1">
                {unassignedDrivers.length > 0 && <span>{unassignedDrivers.length} driver{unassignedDrivers.length !== 1 ? 's' : ''} • </span>}
                {unassignedTrucks.length > 0 && <span>{unassignedTrucks.length} truck{unassignedTrucks.length !== 1 ? 's' : ''} • </span>}
                {unassignedUsers.length > 0 && <span>{unassignedUsers.length} user{unassignedUsers.length !== 1 ? 's' : ''}</span>}
                {' '}not assigned to any parent company. Non-Super Admin users won't see unassigned resources.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Empty State */}
      {parentCompanies.length === 0 && (
        <div className="bg-white rounded-lg shadow p-8 text-center">
          <svg className="w-16 h-16 text-gray-300 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
          </svg>
          <p className="text-gray-500 text-lg">No companies yet</p>
          <p className="text-gray-400 text-sm mt-2">Create a parent company to get started with company-based data isolation.</p>
        </div>
      )}

      {/* Company Cards */}
      <div className="space-y-4">
        {parentCompanies.map(parent => {
          const isExpanded = expandedParents.has(parent.id);
          const subs = getSubdivisions(parent.id);
          const assignedDriversList = getAssignedDrivers(parent.id);
          const assignedTrucksList = getAssignedTrucks(parent.id);
          const assignedUsersList = getAssignedUsers(parent.id);

          return (
            <div key={parent.id} className={`bg-white rounded-lg shadow-sm border ${parent.active ? 'border-gray-200' : 'border-red-200 bg-red-50'}`}>
              {/* Parent Company Header */}
              <div className="px-5 py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => toggleExpand(parent.id)}
                      className="text-gray-400 hover:text-blue-600 p-1"
                    >
                      <svg className={`w-5 h-5 transform transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-lg font-semibold text-gray-900">{parent.name}</h3>
                        {!parent.active && (
                          <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">Inactive</span>
                        )}
                        {parent.type === 'parent' && (
                          <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">Parent</span>
                        )}
                      </div>
                      {parent.address && (
                        <p className="text-xs text-gray-500 mt-0.5">{parent.address}</p>
                      )}
                    </div>
                  </div>

                  {/* Quick Stats */}
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-3 text-xs text-gray-500">
                      <span title="Subdivisions" className="flex items-center gap-1">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5" /></svg>
                        {subs.length}
                      </span>
                      <span title="Drivers" className="flex items-center gap-1">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                        {assignedDriversList.length}
                      </span>
                      <span title="Trucks" className="flex items-center gap-1">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" /></svg>
                        {assignedTrucksList.length}
                      </span>
                      <span title="Users" className="flex items-center gap-1">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m9 5.197V21" /></svg>
                        {assignedUsersList.length}
                      </span>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleOpenEditCompany(parent)}
                        className="text-indigo-600 hover:text-indigo-800 text-xs font-medium px-2 py-1 rounded hover:bg-indigo-50"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleToggleCompanyActive(parent)}
                        className={`text-xs font-medium px-2 py-1 rounded ${
                          parent.active
                            ? 'text-yellow-600 hover:text-yellow-800 hover:bg-yellow-50'
                            : 'text-green-600 hover:text-green-800 hover:bg-green-50'
                        }`}
                      >
                        {parent.active ? 'Deactivate' : 'Activate'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Expanded Content */}
              {isExpanded && (
                <div className="border-t border-gray-200">
                  {/* Subdivisions Section */}
                  <div className="px-5 py-4">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-sm font-semibold text-gray-700">
                        Subdivisions ({subs.length}/{MAX_SUBDIVISIONS})
                      </h4>
                      {subs.length < MAX_SUBDIVISIONS && (
                        <button
                          onClick={() => handleOpenAddSubdivision(parent.id)}
                          className="text-xs text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                          </svg>
                          Add Subdivision
                        </button>
                      )}
                    </div>
                    {subs.length === 0 ? (
                      <p className="text-xs text-gray-400 italic">No subdivisions yet</p>
                    ) : (
                      <div className="space-y-1">
                        {subs.map(sub => (
                          <SubdivisionRow
                            key={sub.id}
                            sub={sub}
                            onEdit={handleOpenEditCompany}
                            onToggleActive={handleToggleCompanyActive}
                            canManage={canManage}
                          />
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Assignment Sections */}
                  <div className="border-t border-gray-100 px-5 py-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {/* Drivers Assignment */}
                      <div className="bg-gray-50 rounded-lg p-3">
                        <div className="flex items-center justify-between mb-2">
                          <h5 className="text-xs font-semibold text-gray-600 uppercase">Drivers ({assignedDriversList.length})</h5>
                          <button
                            onClick={() => handleOpenAssignment('drivers', parent)}
                            className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                          >
                            Manage
                          </button>
                        </div>
                        {assignedDriversList.length === 0 ? (
                          <p className="text-xs text-gray-400 italic">No drivers assigned</p>
                        ) : (
                          <div className="space-y-1.5 max-h-40 overflow-y-auto">
                            {assignedDriversList.slice(0, 10).map(d => (
                              <div key={d.id} className="flex items-center justify-between text-xs">
                                <div className="min-w-0">
                                  <span className="text-gray-700 truncate block">{d.name}</span>
                                  {d.assignedCompanyName && d.assignedCompanyName !== parent.name && (
                                    <span className="text-purple-600 text-[10px]">BOL: {d.assignedCompanyName}</span>
                                  )}
                                </div>
                                <span className={`px-1.5 py-0.5 rounded-full flex-shrink-0 ${
                                  d.status === 'Active' ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-600'
                                }`}>{d.status}</span>
                              </div>
                            ))}
                            {assignedDriversList.length > 10 && (
                              <p className="text-xs text-gray-400">+{assignedDriversList.length - 10} more</p>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Trucks Assignment */}
                      <div className="bg-gray-50 rounded-lg p-3">
                        <div className="flex items-center justify-between mb-2">
                          <h5 className="text-xs font-semibold text-gray-600 uppercase">Trucks ({assignedTrucksList.length})</h5>
                          <button
                            onClick={() => handleOpenAssignment('trucks', parent)}
                            className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                          >
                            Manage
                          </button>
                        </div>
                        {assignedTrucksList.length === 0 ? (
                          <p className="text-xs text-gray-400 italic">No trucks assigned</p>
                        ) : (
                          <div className="space-y-1.5 max-h-40 overflow-y-auto">
                            {assignedTrucksList.slice(0, 10).map(t => (
                              <div key={t.id} className="flex items-center justify-between text-xs">
                                <div className="min-w-0">
                                  <span className="text-gray-700 truncate block">#{t.unitNumber} — {t.yearMake}</span>
                                  {t.assignedCompanyName && t.assignedCompanyName !== parent.name && (
                                    <span className="text-purple-600 text-[10px]">BOL: {t.assignedCompanyName}</span>
                                  )}
                                </div>
                                <span className={`px-1.5 py-0.5 rounded-full flex-shrink-0 ${
                                  t.status === 'Active' ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-600'
                                }`}>{t.status}</span>
                              </div>
                            ))}
                            {assignedTrucksList.length > 10 && (
                              <p className="text-xs text-gray-400">+{assignedTrucksList.length - 10} more</p>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Users Assignment */}
                      <div className="bg-gray-50 rounded-lg p-3">
                        <div className="flex items-center justify-between mb-2">
                          <h5 className="text-xs font-semibold text-gray-600 uppercase">Users ({assignedUsersList.length})</h5>
                          <button
                            onClick={() => handleOpenAssignment('users', parent)}
                            className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                          >
                            Manage
                          </button>
                        </div>
                        {assignedUsersList.length === 0 ? (
                          <p className="text-xs text-gray-400 italic">No users assigned</p>
                        ) : (
                          <div className="space-y-1 max-h-32 overflow-y-auto">
                            {assignedUsersList.slice(0, 10).map(u => (
                              <div key={u.id} className="flex items-center justify-between text-xs">
                                <span className="text-gray-700 truncate">{u.name}</span>
                                <div className="flex gap-1">
                                  {(Array.isArray(u.role) ? u.role : [u.role]).filter(Boolean).map(r => (
                                    <span key={r} className="px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700">{r}</span>
                                  ))}
                                </div>
                              </div>
                            ))}
                            {assignedUsersList.length > 10 && (
                              <p className="text-xs text-gray-400">+{assignedUsersList.length - 10} more</p>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Company Details */}
                  <div className="border-t border-gray-100 px-5 py-3 bg-gray-50 rounded-b-lg">
                    <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-gray-500">
                      {parent.phone && <span>📞 {parent.phone}</span>}
                      {parent.email && <span>✉️ {parent.email}</span>}
                      {parent.mcNumber && <span>MC# {parent.mcNumber}</span>}
                      {parent.usdot && <span>USDOT {parent.usdot}</span>}
                      {parent.taxId && <span>Tax ID {parent.taxId}</span>}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ============================================ */}
      {/* COMPANY ADD/EDIT MODAL */}
      {/* ============================================ */}
      {showCompanyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60 p-4 overflow-y-auto">
          <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-2xl my-8">
            <h3 className="text-xl font-semibold mb-1 text-gray-800">
              {isEditingCompany ? 'Edit' : 'Add'} {companyModalType === 'subdivision' ? 'Subdivision' : 'Parent Company'}
            </h3>
            {companyModalType === 'subdivision' && subdivisionParentId && (
              <p className="text-sm text-gray-500 mb-4">
                Under: <span className="font-medium text-blue-700">
                  {companies.find(c => c.id === subdivisionParentId)?.name}
                </span>
              </p>
            )}
            {companyModalType === 'parent' && !isEditingCompany && (
              <p className="text-sm text-gray-500 mb-4">
                Parent companies control data visibility. Assign drivers, trucks, and users after creation.
              </p>
            )}

            <form onSubmit={handleCompanyFormSubmit}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Company Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    name="name"
                    required
                    value={companyForm.name}
                    onChange={handleCompanyFormChange}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-blue-500 focus:border-blue-500 shadow-sm"
                    placeholder="e.g., Gold Star Delivery"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
                  <input
                    type="text"
                    name="address"
                    value={companyForm.address}
                    onChange={handleCompanyFormChange}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-blue-500 focus:border-blue-500 shadow-sm"
                    placeholder="Full address"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                  <input
                    type="text"
                    name="phone"
                    value={companyForm.phone}
                    onChange={handleCompanyFormChange}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-blue-500 focus:border-blue-500 shadow-sm"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                  <input
                    type="email"
                    name="email"
                    value={companyForm.email}
                    onChange={handleCompanyFormChange}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-blue-500 focus:border-blue-500 shadow-sm"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">MC Number</label>
                  <input
                    type="text"
                    name="mcNumber"
                    value={companyForm.mcNumber}
                    onChange={handleCompanyFormChange}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-blue-500 focus:border-blue-500 shadow-sm"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">USDOT</label>
                  <input
                    type="text"
                    name="usdot"
                    value={companyForm.usdot}
                    onChange={handleCompanyFormChange}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-blue-500 focus:border-blue-500 shadow-sm"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Tax ID</label>
                  <input
                    type="text"
                    name="taxId"
                    value={companyForm.taxId}
                    onChange={handleCompanyFormChange}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-blue-500 focus:border-blue-500 shadow-sm"
                  />
                </div>
              </div>

              <div className="flex justify-end space-x-3 pt-6 mt-4 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => {
                    setShowCompanyModal(false);
                    setCompanyForm(initialCompanyState);
                  }}
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
                  {isProcessing
                    ? (isEditingCompany ? 'Updating...' : 'Creating...')
                    : (isEditingCompany ? 'Save Changes' : `Create ${companyModalType === 'subdivision' ? 'Subdivision' : 'Company'}`)}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================ */}
      {/* ASSIGNMENT MODAL */}
      {/* ============================================ */}
      <AssignmentModal
        isOpen={showAssignmentModal}
        onClose={() => setShowAssignmentModal(false)}
        parentCompany={assignmentParentCompany}
        onSave={handleSaveAssignment}
        isSaving={isSavingAssignment}
        {...getAssignmentModalProps()}
      />

      {/* ============================================ */}
      {/* INFO NOTE */}
      {/* ============================================ */}
      <div className="mt-6 flex items-start gap-2 text-xs text-gray-500 bg-gray-50 p-3 rounded-lg border border-gray-200">
        <svg className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <div>
          <p className="font-medium text-gray-600">How company isolation works:</p>
          <p className="mt-1">
            Non-Super Admin users only see loads, drivers, and trucks belonging to their assigned parent company.
            Super Admin always sees everything across all companies.
            Subdivisions are used for BOL/invoice branding — data filtering is based on the parent company level.
          </p>
          <p className="mt-1">
            <span className="font-medium">Existing companies</span> without a type are treated as parent companies.
            You can add the <span className="font-medium">type: "parent"</span> field to them for clarity, but it's not required.
          </p>
        </div>
      </div>
    </div>
  );
}