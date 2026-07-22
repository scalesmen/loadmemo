// src/components/settings/PayRulesPage.js

import React, { useState, useEffect } from 'react';
import { db, auth } from '../../firebase';
import { applyOwnerImpersonation } from '../../utils/impersonation';
import { 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc, 
  serverTimestamp,
  collection,
  addDoc,
  deleteDoc,
  onSnapshot,
  query,
  where,
  orderBy
} from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';

export default function PayRulesPage() {
  const [user, setUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [canEdit, setCanEdit] = useState(false);
  
  // Standard fee settings
  const [feeSettings, setFeeSettings] = useState({
    dispatchFeePercent: 12,
    weeklyInsurance: 450,
    weeklyPhysicalDamage: 100,
    eldServiceFee: 60,
    statePermitsFee: 60,
    administrativeFee: 50
  });

  // Custom fee rules
  const [customFees, setCustomFees] = useState([]);
  const [showAddCustom, setShowAddCustom] = useState(false);
  const [editingCustom, setEditingCustom] = useState(null);
  const [customFeeForm, setCustomFeeForm] = useState({
    name: '',
    description: '',
    amount: 0,
    feeType: 'fixed', // 'fixed' or 'percentage'
    frequency: 'weekly' // 'weekly', 'monthly', 'per_load', 'one_time'
  });

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
        if (userDoc.exists()) {
          const profile = applyOwnerImpersonation(userDoc.data(), currentUser.email);
          setUserProfile(profile);
          
          // Check if user can edit (only Super Admin and Admin)
          setCanEdit(['Super Admin', 'Admin'].includes(profile.role));
          
          if (profile.tenantId) {
            await loadFeeSettings(profile.tenantId);
            loadCustomFees(profile.tenantId);
          }
        }
      } else {
        setUser(null);
        setUserProfile(null);
        setCanEdit(false);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const loadFeeSettings = async (tenantId) => {
    try {
      const settingsDoc = await getDoc(doc(db, 'ownerOperatorFees', tenantId));
      if (settingsDoc.exists()) {
        setFeeSettings(settingsDoc.data().standardFees || feeSettings);
      }
    } catch (error) {
      console.error('Error loading fee settings:', error);
    }
  };

  const loadCustomFees = (tenantId) => {
    const q = query(
      collection(db, 'customOwnerOperatorFees'),
      where('tenantId', '==', tenantId),
      where('active', '==', true),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fees = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setCustomFees(fees);
    });

    return unsubscribe;
  };

  const handleSaveSettings = async () => {
    if (!userProfile?.tenantId || !canEdit) return;

    setSaving(true);
    try {
      const settingsRef = doc(db, 'ownerOperatorFees', userProfile.tenantId);
      await setDoc(settingsRef, {
        standardFees: feeSettings,
        updatedAt: serverTimestamp(),
        updatedBy: user.uid,
        tenantId: userProfile.tenantId
      }, { merge: true });

      // Log audit
      await addDoc(collection(db, 'auditLogs'), {
        userId: user.uid,
        userEmail: user.email,
        action: 'update_owner_operator_fees',
        targetType: 'fee_settings',
        targetId: userProfile.tenantId,
        tenantId: userProfile.tenantId,
        details: {
          message: 'Owner Operator fee settings updated',
          settings: feeSettings
        },
        timestamp: serverTimestamp()
      });

      alert('Fee settings saved successfully!');
    } catch (error) {
      console.error('Error saving fee settings:', error);
      alert('Failed to save fee settings');
    } finally {
      setSaving(false);
    }
  };

  const handleAddCustomFee = async () => {
    if (!customFeeForm.name || !userProfile?.tenantId || !canEdit) return;

    try {
      const feeData = {
        ...customFeeForm,
        tenantId: userProfile.tenantId,
        active: true,
        createdAt: serverTimestamp(),
        createdBy: user.uid
      };

      if (editingCustom) {
        // Update existing
        await updateDoc(doc(db, 'customOwnerOperatorFees', editingCustom), {
          ...customFeeForm,
          updatedAt: serverTimestamp(),
          updatedBy: user.uid
        });
      } else {
        // Add new
        await addDoc(collection(db, 'customOwnerOperatorFees'), feeData);
      }

      // Reset form
      setCustomFeeForm({
        name: '',
        description: '',
        amount: 0,
        feeType: 'fixed',
        frequency: 'weekly'
      });
      setShowAddCustom(false);
      setEditingCustom(null);
      
      alert(editingCustom ? 'Custom fee updated!' : 'Custom fee added!');
    } catch (error) {
      console.error('Error saving custom fee:', error);
      alert('Failed to save custom fee');
    }
  };

  const handleDeleteCustomFee = async (feeId) => {
    if (!canEdit || !window.confirm('Are you sure you want to delete this custom fee?')) return;

    try {
      // Soft delete by marking as inactive
      await updateDoc(doc(db, 'customOwnerOperatorFees', feeId), {
        active: false,
        deletedAt: serverTimestamp(),
        deletedBy: user.uid
      });
      
      alert('Custom fee deleted successfully!');
    } catch (error) {
      console.error('Error deleting custom fee:', error);
      alert('Failed to delete custom fee');
    }
  };

  const handleEditCustomFee = (fee) => {
    setCustomFeeForm({
      name: fee.name,
      description: fee.description || '',
      amount: fee.amount,
      feeType: fee.feeType,
      frequency: fee.frequency
    });
    setEditingCustom(fee.id);
    setShowAddCustom(true);
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!user || !userProfile) {
    return <div className="text-center text-gray-500">Please log in to view payment rules.</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex justify-between items-center mb-4">
          <div>
            <h2 className="text-xl font-semibold text-gray-800">Owner Operator Fee Settings</h2>
            <p className="text-sm text-gray-600 mt-1">
              Configure standard fees and charges for owner operators
            </p>
          </div>
          {!canEdit && (
            <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-yellow-100 text-yellow-800">
              View Only
            </span>
          )}
        </div>

        {/* Standard Fees Section */}
        <div className="space-y-4 mt-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Standard Fees</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Dispatch Fee */}
            <div className="bg-gray-50 p-4 rounded-lg">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Dispatch Fee (%)
              </label>
              <div className="flex items-center space-x-2">
                <input
                  type="number"
                  value={feeSettings.dispatchFeePercent}
                  onChange={(e) => setFeeSettings(prev => ({ 
                    ...prev, 
                    dispatchFeePercent: parseFloat(e.target.value) || 0 
                  }))}
                  disabled={!canEdit}
                  className="block w-24 px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm disabled:bg-gray-100"
                  step="0.1"
                  min="0"
                  max="100"
                />
                <span className="text-sm text-gray-500">% of load amount</span>
              </div>
              <p className="text-xs text-gray-500 mt-1">Percentage charged on each load</p>
            </div>

            {/* Weekly Insurance */}
            <div className="bg-gray-50 p-4 rounded-lg">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Weekly Insurance
              </label>
              <div className="flex items-center space-x-2">
                <span className="text-sm text-gray-500">$</span>
                <input
                  type="number"
                  value={feeSettings.weeklyInsurance}
                  onChange={(e) => setFeeSettings(prev => ({ 
                    ...prev, 
                    weeklyInsurance: parseFloat(e.target.value) || 0 
                  }))}
                  disabled={!canEdit}
                  className="block w-32 px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm disabled:bg-gray-100"
                  step="0.01"
                  min="0"
                />
                <span className="text-sm text-gray-500">per week</span>
              </div>
              <p className="text-xs text-gray-500 mt-1">Liability insurance deduction</p>
            </div>

            {/* Weekly Physical Damage */}
            <div className="bg-gray-50 p-4 rounded-lg">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Weekly Physical Damage Insurance
              </label>
              <div className="flex items-center space-x-2">
                <span className="text-sm text-gray-500">$</span>
                <input
                  type="number"
                  value={feeSettings.weeklyPhysicalDamage}
                  onChange={(e) => setFeeSettings(prev => ({ 
                    ...prev, 
                    weeklyPhysicalDamage: parseFloat(e.target.value) || 0 
                  }))}
                  disabled={!canEdit}
                  className="block w-32 px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm disabled:bg-gray-100"
                  step="0.01"
                  min="0"
                />
                <span className="text-sm text-gray-500">per week</span>
              </div>
              <p className="text-xs text-gray-500 mt-1">Physical damage coverage</p>
            </div>

            {/* ELD Service Fee */}
            <div className="bg-gray-50 p-4 rounded-lg">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                ELD Service Fee
              </label>
              <div className="flex items-center space-x-2">
                <span className="text-sm text-gray-500">$</span>
                <input
                  type="number"
                  value={feeSettings.eldServiceFee}
                  onChange={(e) => setFeeSettings(prev => ({ 
                    ...prev, 
                    eldServiceFee: parseFloat(e.target.value) || 0 
                  }))}
                  disabled={!canEdit}
                  className="block w-32 px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm disabled:bg-gray-100"
                  step="0.01"
                  min="0"
                />
                <span className="text-sm text-gray-500">per week</span>
              </div>
              <p className="text-xs text-gray-500 mt-1">Electronic logging device service</p>
            </div>

            {/* State Permits Fee */}
            <div className="bg-gray-50 p-4 rounded-lg">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                State Permits Fee
              </label>
              <div className="flex items-center space-x-2">
                <span className="text-sm text-gray-500">$</span>
                <input
                  type="number"
                  value={feeSettings.statePermitsFee}
                  onChange={(e) => setFeeSettings(prev => ({ 
                    ...prev, 
                    statePermitsFee: parseFloat(e.target.value) || 0 
                  }))}
                  disabled={!canEdit}
                  className="block w-32 px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm disabled:bg-gray-100"
                  step="0.01"
                  min="0"
                />
                <span className="text-sm text-gray-500">per week</span>
              </div>
              <p className="text-xs text-gray-500 mt-1">State permits and registrations</p>
            </div>

            {/* Administrative Fee */}
            <div className="bg-gray-50 p-4 rounded-lg">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Administrative Fee
              </label>
              <div className="flex items-center space-x-2">
                <span className="text-sm text-gray-500">$</span>
                <input
                  type="number"
                  value={feeSettings.administrativeFee}
                  onChange={(e) => setFeeSettings(prev => ({ 
                    ...prev, 
                    administrativeFee: parseFloat(e.target.value) || 0 
                  }))}
                  disabled={!canEdit}
                  className="block w-32 px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm disabled:bg-gray-100"
                  step="0.01"
                  min="0"
                />
                <span className="text-sm text-gray-500">per week</span>
              </div>
              <p className="text-xs text-gray-500 mt-1">General administrative costs</p>
            </div>
          </div>

          {/* Save Button for Standard Fees */}
          {canEdit && (
            <div className="mt-6 flex justify-end">
              <button
                onClick={handleSaveSettings}
                disabled={saving}
                className={`inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white ${
                  saving ? 'bg-gray-400' : 'bg-blue-600 hover:bg-blue-700'
                } focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500`}
              >
                {saving ? 'Saving...' : 'Save Standard Fees'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Custom Fees Section */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-medium text-gray-900">Custom Fee Rules</h3>
          {canEdit && (
            <button
              onClick={() => {
                setShowAddCustom(true);
                setEditingCustom(null);
                setCustomFeeForm({
                  name: '',
                  description: '',
                  amount: 0,
                  feeType: 'fixed',
                  frequency: 'weekly'
                });
              }}
              className="inline-flex items-center px-3 py-1.5 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
            >
              <svg className="mr-2 -ml-1 w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add Custom Fee
            </button>
          )}
        </div>

        {/* Custom Fee Form */}
        {showAddCustom && canEdit && (
          <div className="mb-6 p-4 bg-gray-50 rounded-lg">
            <h4 className="text-md font-medium text-gray-900 mb-4">
              {editingCustom ? 'Edit Custom Fee' : 'Add New Custom Fee'}
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Fee Name
                </label>
                <input
                  type="text"
                  value={customFeeForm.name}
                  onChange={(e) => setCustomFeeForm(prev => ({ ...prev, name: e.target.value }))}
                  className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  placeholder="e.g., Truck Lease Payment"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Frequency
                </label>
                <select
                  value={customFeeForm.frequency}
                  onChange={(e) => setCustomFeeForm(prev => ({ ...prev, frequency: e.target.value }))}
                  className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                >
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                  <option value="per_load">Per Load</option>
                  <option value="one_time">One Time</option>
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description
                </label>
                <input
                  type="text"
                  value={customFeeForm.description}
                  onChange={(e) => setCustomFeeForm(prev => ({ ...prev, description: e.target.value }))}
                  className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  placeholder="Optional description"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Amount
                </label>
                <div className="flex items-center space-x-2">
                  <input
                    type="number"
                    value={customFeeForm.amount}
                    onChange={(e) => setCustomFeeForm(prev => ({ ...prev, amount: parseFloat(e.target.value) || 0 }))}
                    className="block w-24 px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                    step="0.01"
                    min="0"
                  />
                  <select
                    value={customFeeForm.feeType}
                    onChange={(e) => setCustomFeeForm(prev => ({ ...prev, feeType: e.target.value }))}
                    className="block px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  >
                    <option value="fixed">$ Fixed</option>
                    <option value="percentage">% Percentage</option>
                  </select>
                </div>
              </div>
            </div>
            <div className="mt-4 flex justify-end space-x-3">
              <button
                onClick={() => {
                  setShowAddCustom(false);
                  setEditingCustom(null);
                }}
                className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleAddCustomFee}
                className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
              >
                {editingCustom ? 'Update Fee' : 'Add Fee'}
              </button>
            </div>
          </div>
        )}

        {/* Custom Fees List */}
        <div className="space-y-2">
          {customFees.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-4">No custom fees configured</p>
          ) : (
            customFees.map((fee) => (
              <div key={fee.id} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <h4 className="text-sm font-medium text-gray-900">{fee.name}</h4>
                    {fee.description && (
                      <p className="text-xs text-gray-500 mt-1">{fee.description}</p>
                    )}
                    <div className="flex items-center space-x-4 mt-2">
                      <span className="text-sm text-gray-600">
                        Amount: {fee.feeType === 'percentage' ? `${fee.amount}%` : `$${fee.amount}`}
                      </span>
                      <span className="text-sm text-gray-600">
                        Frequency: {fee.frequency.replace('_', ' ')}
                      </span>
                    </div>
                  </div>
                  {canEdit && (
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => handleEditCustomFee(fee)}
                        className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDeleteCustomFee(fee.id)}
                        className="text-red-600 hover:text-red-800 text-sm font-medium"
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}