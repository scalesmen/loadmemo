// src/components/settings/BrokerFactoringSettings.js
// Broker-Specific Factoring Rules Configuration

import React, { useState, useEffect } from 'react';
import { db } from '../../firebase';
import { logAudit } from '../../utils/auditLog';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  serverTimestamp 
} from 'firebase/firestore';

export default function BrokerFactoringSettings({ loggedInUser, tenantId }) {
  const [factoringRules, setFactoringRules] = useState([]);
  const [brokers, setBrokers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState({ type: '', text: '' });
  
  // Form state
  const [showModal, setShowModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingRuleId, setEditingRuleId] = useState(null);
  const [formData, setFormData] = useState({
    brokerId: '',
    brokerName: '',
    factoringPercentage: '',
    isActive: true,
    notes: ''
  });

  // Check if user can manage factoring rules
  const canManage = loggedInUser?.role === 'Super Admin' || loggedInUser?.role === 'Admin';

  // Fetch brokers and factoring rules
  useEffect(() => {
    if (!tenantId) {
      setIsLoading(false);
      return;
    }

    // Fetch brokers
    const brokersQuery = query(
      collection(db, 'brokers'),
      where('tenantId', '==', tenantId)
    );

    const unsubscribeBrokers = onSnapshot(brokersQuery, (snapshot) => {
      const brokerList = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setBrokers(brokerList);
    });

    // Fetch factoring rules
    const rulesQuery = query(
      collection(db, 'brokerFactoringRules'),
      where('tenantId', '==', tenantId)
    );

    const unsubscribeRules = onSnapshot(rulesQuery, (snapshot) => {
      const rulesList = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      // Sort by broker name
      rulesList.sort((a, b) => (a.brokerName || '').localeCompare(b.brokerName || ''));
      setFactoringRules(rulesList);
      setIsLoading(false);
    });

    return () => {
      unsubscribeBrokers();
      unsubscribeRules();
    };
  }, [tenantId]);

  // Handle broker selection
  const handleBrokerChange = (e) => {
    const brokerId = e.target.value;
    const selectedBroker = brokers.find(b => b.id === brokerId);
    
    setFormData(prev => ({
      ...prev,
      brokerId: brokerId,
      brokerName: selectedBroker?.companyName || selectedBroker?.name || ''
    }));
  };

  // Handle form input changes
  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  // Open modal for adding new rule
  const handleAddRule = () => {
    setFormData({
      brokerId: '',
      brokerName: '',
      factoringPercentage: '',
      isActive: true,
      notes: ''
    });
    setIsEditing(false);
    setEditingRuleId(null);
    setShowModal(true);
    setSaveMessage({ type: '', text: '' });
  };

  // Open modal for editing existing rule
  const handleEditRule = (rule) => {
    setFormData({
      brokerId: rule.brokerId || '',
      brokerName: rule.brokerName || '',
      factoringPercentage: rule.factoringPercentage?.toString() || '',
      isActive: rule.isActive !== false,
      notes: rule.notes || ''
    });
    setIsEditing(true);
    setEditingRuleId(rule.id);
    setShowModal(true);
    setSaveMessage({ type: '', text: '' });
  };

  // Save factoring rule
  const handleSaveRule = async (e) => {
    e.preventDefault();
    
    if (!canManage) {
      setSaveMessage({ type: 'error', text: 'You do not have permission to manage factoring rules.' });
      return;
    }

    // Validation
    if (!formData.brokerId) {
      setSaveMessage({ type: 'error', text: 'Please select a broker.' });
      return;
    }

    const percentage = parseFloat(formData.factoringPercentage);
    if (isNaN(percentage) || percentage < 0 || percentage > 100) {
      setSaveMessage({ type: 'error', text: 'Please enter a valid percentage between 0 and 100.' });
      return;
    }

    // Check for duplicate broker rule (when adding new)
    if (!isEditing) {
      const existingRule = factoringRules.find(r => r.brokerId === formData.brokerId);
      if (existingRule) {
        setSaveMessage({ type: 'error', text: `A factoring rule already exists for ${formData.brokerName}. Please edit the existing rule instead.` });
        return;
      }
    }

    setIsSaving(true);
    setSaveMessage({ type: '', text: '' });

    try {
      const ruleData = {
        brokerId: formData.brokerId,
        brokerName: formData.brokerName,
        factoringPercentage: percentage,
        isActive: formData.isActive,
        notes: formData.notes || '',
        tenantId: tenantId,
        updatedAt: serverTimestamp(),
        updatedBy: loggedInUser.uid,
        updatedByEmail: loggedInUser.email
      };

      if (isEditing && editingRuleId) {
        // Update existing rule
        await updateDoc(doc(db, 'brokerFactoringRules', editingRuleId), ruleData);
        const oldRule = factoringRules.find(r => r.id === editingRuleId);
        const changes = {};
        for (const field of ['factoringPercentage', 'isActive', 'notes']) {
          const oldValue = oldRule?.[field] ?? '';
          const newValue = ruleData[field];
          if (oldValue !== newValue) changes[field] = { oldValue, newValue };
        }
        if (Object.keys(changes).length > 0) {
          logAudit({
            userId: loggedInUser.uid, userEmail: loggedInUser.email, action: 'FACTORING_RULE_UPDATED',
            targetType: 'brokerFactoringRule', targetId: editingRuleId,
            details: { brokerName: ruleData.brokerName, changes }, tenantId
          });
        }
        setSaveMessage({ type: 'success', text: 'Factoring rule updated successfully!' });
      } else {
        // Create new rule
        ruleData.createdAt = serverTimestamp();
        ruleData.createdBy = loggedInUser.uid;
        ruleData.createdByEmail = loggedInUser.email;
        const newRuleRef = await addDoc(collection(db, 'brokerFactoringRules'), ruleData);
        logAudit({
          userId: loggedInUser.uid, userEmail: loggedInUser.email, action: 'FACTORING_RULE_CREATED',
          targetType: 'brokerFactoringRule', targetId: newRuleRef.id,
          details: { brokerName: ruleData.brokerName, factoringPercentage: ruleData.factoringPercentage },
          tenantId
        });
        setSaveMessage({ type: 'success', text: 'Factoring rule created successfully!' });
      }

      // Close modal after short delay
      setTimeout(() => {
        setShowModal(false);
        setSaveMessage({ type: '', text: '' });
      }, 1500);

    } catch (error) {
      console.error('Error saving factoring rule:', error);
      setSaveMessage({ type: 'error', text: 'Failed to save factoring rule: ' + error.message });
    }

    setIsSaving(false);
  };

  // Delete factoring rule
  const handleDeleteRule = async (rule) => {
    if (!canManage) {
      alert('You do not have permission to delete factoring rules.');
      return;
    }

    if (!window.confirm(`Are you sure you want to delete the factoring rule for "${rule.brokerName}"?`)) {
      return;
    }

    try {
      await deleteDoc(doc(db, 'brokerFactoringRules', rule.id));
      logAudit({
        userId: loggedInUser.uid, userEmail: loggedInUser.email, action: 'FACTORING_RULE_DELETED',
        targetType: 'brokerFactoringRule', targetId: rule.id,
        details: { brokerName: rule.brokerName, factoringPercentage: rule.factoringPercentage },
        tenantId
      });
      alert('Factoring rule deleted successfully.');
    } catch (error) {
      console.error('Error deleting factoring rule:', error);
      alert('Failed to delete factoring rule: ' + error.message);
    }
  };

  // Toggle rule active status
  const handleToggleActive = async (rule) => {
    if (!canManage) return;

    try {
      await updateDoc(doc(db, 'brokerFactoringRules', rule.id), {
        isActive: !rule.isActive,
        updatedAt: serverTimestamp(),
        updatedBy: loggedInUser.uid
      });
      logAudit({
        userId: loggedInUser.uid, userEmail: loggedInUser.email, action: 'FACTORING_RULE_UPDATED',
        targetType: 'brokerFactoringRule', targetId: rule.id,
        details: { brokerName: rule.brokerName, changes: { isActive: { oldValue: rule.isActive, newValue: !rule.isActive } } },
        tenantId
      });
    } catch (error) {
      console.error('Error toggling rule status:', error);
      alert('Failed to update rule status: ' + error.message);
    }
  };

  // Get brokers that don't have a rule yet (for dropdown)
  const availableBrokers = brokers.filter(broker => {
    // When editing, include the current broker
    if (isEditing && formData.brokerId === broker.id) return true;
    // Otherwise, exclude brokers that already have rules
    return !factoringRules.some(rule => rule.brokerId === broker.id);
  });

  if (isLoading) {
    return (
      <div className="p-6 bg-white rounded-lg shadow">
        <div className="animate-pulse">
          <div className="h-6 bg-gray-200 rounded w-1/3 mb-4"></div>
          <div className="h-4 bg-gray-200 rounded w-2/3 mb-6"></div>
          <div className="h-32 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <section className="p-6 bg-white rounded-lg shadow">
      <div className="flex justify-between items-center mb-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-800">Broker Factoring Rules</h3>
          <p className="text-sm text-gray-600 mt-1">
            Configure automatic factoring deductions per broker. When a load is created from a PDF, 
            the factoring percentage will be automatically applied to calculate driver pay.
          </p>
        </div>
        {canManage && (
          <button
            onClick={handleAddRule}
            className="bg-green-500 hover:bg-green-600 text-white font-medium py-2 px-4 rounded-md text-sm shadow-sm flex items-center transition duration-150 ease-in-out"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-4 h-4 mr-2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Add Factoring Rule
          </button>
        )}
      </div>

      {/* Info Box */}
      <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <h4 className="text-sm font-semibold text-blue-800 mb-2">💡 How it works</h4>
        <ul className="text-sm text-blue-700 space-y-1">
          <li>• When you upload a dispatch PDF, the system detects the broker automatically</li>
          <li>• If a factoring rule exists for that broker, it calculates: <code className="bg-blue-100 px-1 rounded">Driver Pay = Load Price - (Load Price × Factoring %)</code></li>
          <li>• The factoring deduction is shown in the load modal before you save</li>
        </ul>
      </div>

      {/* Rules Table */}
      {factoringRules.length === 0 ? (
        <div className="text-center py-8 bg-gray-50 rounded-lg border border-dashed border-gray-300">
          <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
          </svg>
          <p className="mt-2 text-sm text-gray-500">No factoring rules configured yet</p>
          {canManage && (
            <button
              onClick={handleAddRule}
              className="mt-3 text-blue-600 hover:text-blue-800 text-sm font-medium"
            >
              + Add your first factoring rule
            </button>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Broker</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Factoring %</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Example Calculation</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Status</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Notes</th>
                {canManage && (
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Actions</th>
                )}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {factoringRules.map(rule => {
                // Calculate example: $1000 load
                const exampleLoadPrice = 1000;
                const factoringAmount = (exampleLoadPrice * rule.factoringPercentage / 100).toFixed(2);
                const driverPay = (exampleLoadPrice - parseFloat(factoringAmount)).toFixed(2);
                
                return (
                  <tr key={rule.id} className={!rule.isActive ? 'bg-gray-50 opacity-60' : ''}>
                    <td className="px-4 py-3 whitespace-nowrap font-medium text-gray-900">
                      {rule.brokerName || 'Unknown Broker'}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="text-lg font-semibold text-blue-600">
                        {rule.factoringPercentage}%
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-gray-500">
                      <span className="text-xs">
                        $1,000 load → ${factoringAmount} fee → <span className="font-medium text-green-600">${driverPay} driver pay</span>
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <button
                        onClick={() => canManage && handleToggleActive(rule)}
                        disabled={!canManage}
                        className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full cursor-pointer transition-colors ${
                          rule.isActive 
                            ? 'bg-green-100 text-green-800 hover:bg-green-200' 
                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        } ${!canManage ? 'cursor-default' : ''}`}
                      >
                        {rule.isActive ? 'Active' : 'Inactive'}
                      </button>
                    </td>
                    <td className="px-4 py-3 max-w-xs truncate text-gray-500" title={rule.notes}>
                      {rule.notes || '-'}
                    </td>
                    {canManage && (
                      <td className="px-4 py-3 whitespace-nowrap space-x-2">
                        <button
                          onClick={() => handleEditRule(rule)}
                          className="text-indigo-600 hover:text-indigo-900 text-xs font-medium"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDeleteRule(rule)}
                          className="text-red-600 hover:text-red-900 text-xs font-medium"
                        >
                          Delete
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60 p-4">
          <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4 text-gray-800">
              {isEditing ? 'Edit Factoring Rule' : 'Add Factoring Rule'}
            </h3>
            
            <form onSubmit={handleSaveRule} className="space-y-4">
              {/* Broker Selection */}
              <div>
                <label htmlFor="brokerId" className="block text-sm font-medium text-gray-700 mb-1">
                  Broker <span className="text-red-500">*</span>
                </label>
                <select
                  id="brokerId"
                  name="brokerId"
                  value={formData.brokerId}
                  onChange={handleBrokerChange}
                  required
                  disabled={isEditing}
                  className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm disabled:bg-gray-100"
                >
                  <option value="">Select a broker</option>
                  {availableBrokers.map(broker => (
                    <option key={broker.id} value={broker.id}>
                      {broker.companyName || broker.name}
                    </option>
                  ))}
                </select>
                {isEditing && (
                  <p className="text-xs text-gray-500 mt-1">Broker cannot be changed when editing</p>
                )}
              </div>

              {/* Factoring Percentage */}
              <div>
                <label htmlFor="factoringPercentage" className="block text-sm font-medium text-gray-700 mb-1">
                  Factoring Percentage <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type="number"
                    id="factoringPercentage"
                    name="factoringPercentage"
                    value={formData.factoringPercentage}
                    onChange={handleInputChange}
                    required
                    min="0"
                    max="100"
                    step="0.01"
                    placeholder="e.g., 3.5"
                    className="block w-full px-3 py-2 pr-8 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500">%</span>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Enter the percentage to deduct from load price for driver pay calculation
                </p>
              </div>

              {/* Preview Calculation */}
              {formData.factoringPercentage && !isNaN(parseFloat(formData.factoringPercentage)) && (
                <div className="p-3 bg-gray-50 rounded-md border border-gray-200">
                  <p className="text-xs font-medium text-gray-600 mb-1">Preview (on $1,000 load):</p>
                  <p className="text-sm text-gray-800">
                    Factoring Fee: <span className="font-semibold text-red-600">
                      ${(1000 * parseFloat(formData.factoringPercentage) / 100).toFixed(2)}
                    </span>
                  </p>
                  <p className="text-sm text-gray-800">
                    Driver Pay: <span className="font-semibold text-green-600">
                      ${(1000 - (1000 * parseFloat(formData.factoringPercentage) / 100)).toFixed(2)}
                    </span>
                  </p>
                </div>
              )}

              {/* Active Status */}
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="isActive"
                  name="isActive"
                  checked={formData.isActive}
                  onChange={handleInputChange}
                  className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                <label htmlFor="isActive" className="ml-2 block text-sm text-gray-700">
                  Rule is active
                </label>
              </div>

              {/* Notes */}
              <div>
                <label htmlFor="notes" className="block text-sm font-medium text-gray-700 mb-1">
                  Notes (Optional)
                </label>
                <textarea
                  id="notes"
                  name="notes"
                  value={formData.notes}
                  onChange={handleInputChange}
                  rows="2"
                  placeholder="Any additional notes about this factoring arrangement..."
                  className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                />
              </div>

              {/* Save Message */}
              {saveMessage.text && (
                <p className={`text-sm ${saveMessage.type === 'success' ? 'text-green-600' : 'text-red-600'}`}>
                  {saveMessage.text}
                </p>
              )}

              {/* Form Actions */}
              <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  disabled={isSaving}
                  className="bg-gray-200 hover:bg-gray-300 text-gray-700 px-4 py-2 rounded-md text-sm font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md text-sm font-medium disabled:opacity-50"
                >
                  {isSaving ? 'Saving...' : (isEditing ? 'Update Rule' : 'Create Rule')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}