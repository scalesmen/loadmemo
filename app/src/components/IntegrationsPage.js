// src/components/IntegrationsPage.js

import React, { useState, useEffect } from 'react';
import { db, auth } from '../firebase';
import { 
  collection, 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc,
  serverTimestamp 
} from 'firebase/firestore';
import rtsService from '../services/rtsService'; // Import the RTS service

export default function IntegrationsPage({ companyFilter, loggedInUser, companies = [] }) {
  // Change to support multiple accounts per integration
  const [integrationAccounts, setIntegrationAccounts] = useState({});
  const [showConfigModal, setShowConfigModal] = useState(null);
  const [showAccountModal, setShowAccountModal] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [testingConnection, setTestingConnection] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState(null);

  // Load integration accounts from Firebase
  useEffect(() => {
    const loadIntegrationAccounts = async () => {
      if (!loggedInUser?.tenantId) return;

      try {
        const docRef = doc(db, 'integrationAccounts', loggedInUser.tenantId);
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists()) {
          const data = docSnap.data();
          setIntegrationAccounts(data.accounts || {});
        }
      } catch (error) {
        console.error('Error loading integration accounts:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadIntegrationAccounts();
  }, [loggedInUser]);

  const integrations = [
    {
      id: 'rts_factoring',
      name: 'RTS Financial Services',
      description: 'Connect with RTS for instant invoice factoring and payment processing. Get paid within 24 hours.',
      icon: '💰',
      category: 'Factoring',
      color: 'green',
      features: [
        'Same-day funding available',
        'FTP integration for automated invoice submission',
        'Special integration credentials required',
        'Credit protection',
        'Fuel advance programs',
        'No hidden fees',
        'Up to 97% invoice advance'
      ],
      website: 'https://www.rtsfinancial.com',
      setupInstructions: 'To integrate with RTS, please ensure that you have FTP credentials from the representative of your account.',
      setupFields: [
        { 
          name: 'accountName', 
          label: 'Account Name', 
          type: 'text', 
          required: true, 
          placeholder: 'e.g., Main RTS Account',
          helper: 'A friendly name to identify this account'
        },
        { 
          name: 'integrationUsername', 
          label: 'Username', 
          type: 'text', 
          required: true,
          placeholder: '15394REC',
          helper: 'Special integration username provided by RTS (not your portal login)'
        },
        { 
          name: 'integrationPassword', 
          label: 'Password', 
          type: 'password', 
          required: true,
          placeholder: 'Enter Password',
          helper: 'Special integration password provided by RTS'
        },
        { 
          name: 'clientId', 
          label: 'RTS Client ID', 
          type: 'text', 
          required: false,
          helper: 'Your RTS client/account number if different from username'
        },
        { 
          name: 'ftpHost', 
          label: 'FTP Host', 
          type: 'text', 
          required: false,
          placeholder: 'ftp.rtsfinancial.com',
          helper: 'FTP server address (if provided separately)'
        },
        { 
          name: 'ftpPort', 
          label: 'FTP Port', 
          type: 'number', 
          required: false,
          placeholder: '21',
          default: 21,
          helper: 'FTP port number (default: 21)'
        },
        { 
          name: 'ftpDirectory', 
          label: 'FTP Upload Directory', 
          type: 'text', 
          required: false,
          placeholder: '/invoices',
          helper: 'Directory path for invoice uploads'
        },
        { 
          name: 'factorRate', 
          label: 'Factor Rate (%)', 
          type: 'number', 
          required: false,
          helper: 'Your negotiated factor rate (e.g., 2.5 for 2.5%)'
        },
        { 
          name: 'autoSubmit', 
          label: 'Auto-submit invoices', 
          type: 'checkbox', 
          required: false,
          helper: 'Automatically upload invoices when available'
        },
        { 
          name: 'testMode', 
          label: 'Test Mode', 
          type: 'checkbox', 
          required: false,
          helper: 'Enable test mode to verify connection without submitting real invoices'
        }
      ]
    },
    {
  
  id: 'amazon_relay',
  name: 'Amazon Relay',
  description: 'Access Amazon freight loads directly through their platform. Book loads and manage deliveries.',
  icon: '📦',
  category: 'Load Board',
  color: 'orange',
  features: [
    'Direct access to Amazon freight',
    'Competitive rates',
    'Reliable payment terms',
    'Drop trailer programs',
    'Real-time load tracking',
    'Automated load import'
  ],
  website: 'https://relay.amazon.com',
  setupFields: [
    { name: 'accountName', label: 'Account Name', type: 'text', required: true, placeholder: 'e.g., Main Amazon Relay' },
    { name: 'username', label: 'Amazon Relay Username', type: 'text', required: true },
    { name: 'password', label: 'Amazon Relay Password', type: 'password', required: true },
    { name: 'carrierId', label: 'Amazon Carrier ID', type: 'text', required: false },
    { name: 'mcNumber', label: 'MC Number', type: 'text', required: false },
    { name: 'dotNumber', label: 'DOT Number', type: 'text', required: false }
  ]
},
    {
      id: 'efs_fuel',
      name: 'EFS Fuel Cards',
      description: 'Integrate with EFS fuel management system for automated expense tracking and fuel purchases.',
      icon: '⛽',
      category: 'Fuel Management',
      color: 'blue',
      features: [
        'Real-time fuel purchase tracking',
        'Driver spending controls',
        'Nationwide acceptance',
        'Detailed reporting',
        'Fraud protection'
      ],
      website: 'https://www.efsllc.com',
      setupFields: [
        { name: 'accountName', label: 'Account Name', type: 'text', required: true, placeholder: 'e.g., Main Fleet EFS Account' },
        { name: 'accountNumber', label: 'EFS Account Number', type: 'text', required: true },
        { name: 'apiUsername', label: 'API Username', type: 'text', required: true },
        { name: 'apiPassword', label: 'API Password', type: 'password', required: true },
        { name: 'syncFrequency', label: 'Sync Frequency', type: 'select', 
          options: ['Real-time', 'Hourly', 'Daily'], required: true }
      ]
    },
    {
      id: 'wex_fuel',
      name: 'WEX Fleet Cards',
      description: 'Connect with WEX (formerly Wright Express) for comprehensive fleet fuel management.',
      icon: '🚛',
      category: 'Fuel Management',
      color: 'purple',
      features: [
        'Fleet-wide fuel management',
        'Driver ID requirements',
        'Odometer tracking',
        'Merchant category controls',
        'Exception reporting'
      ],
      website: 'https://www.wexinc.com',
      setupFields: [
        { name: 'accountName', label: 'Account Name', type: 'text', required: true, placeholder: 'e.g., Company A WEX Account' },
        { name: 'customerId', label: 'WEX Customer ID', type: 'text', required: true },
        { name: 'username', label: 'WEX Username', type: 'text', required: true },
        { name: 'password', label: 'WEX Password', type: 'password', required: true },
        { name: 'enableOdometer', label: 'Track Odometer Readings', type: 'checkbox', required: false }
      ]
    },
    {
      id: 'fleetone',
      name: 'FleetOne Fuel Cards',
      description: 'Integrate with FleetOne for fuel management, maintenance tracking, and expense control.',
      icon: '⛽',
      category: 'Fuel Management', 
      color: 'red',
      features: [
        'Fuel and maintenance tracking',
        'Driver controls and limits',
        'Real-time alerts',
        'Detailed analytics',
        'Mobile app integration'
      ],
      website: 'https://www.fleetone.com',
      setupFields: [
        { name: 'accountName', label: 'Account Name', type: 'text', required: true, placeholder: 'e.g., Fleet Division 1' },
        { name: 'accountId', label: 'FleetOne Account ID', type: 'text', required: true },
        { name: 'accessToken', label: 'Access Token', type: 'password', required: true },
        { name: 'webhookUrl', label: 'Webhook URL', type: 'text', required: false },
        { name: 'trackMaintenance', label: 'Track Maintenance', type: 'checkbox', required: false }
      ]
    },
    {
      id: 'bestpass',
      name: 'Bestpass',
      description: 'Comprehensive toll management service for commercial vehicles with nationwide coverage.',
      icon: '🛣️',
      category: 'Toll Management',
      color: 'blue',
      features: [
        'Nationwide toll coverage',
        'Single transponder solution',
        'Detailed toll reporting',
        'Fleet management tools',
        'Customer service support'
      ],
      website: 'https://www.bestpass.com',
      setupFields: [
        { name: 'accountName', label: 'Account Name', type: 'text', required: true, placeholder: 'e.g., Main Bestpass Account' },
        { name: 'accountNumber', label: 'Bestpass Account Number', type: 'text', required: true },
        { name: 'username', label: 'Username', type: 'text', required: true },
        { name: 'password', label: 'Password', type: 'password', required: true },
        { name: 'autoSync', label: 'Auto-sync toll transactions', type: 'checkbox', required: false },
        { name: 'alertThreshold', label: 'Low Balance Alert ($)', type: 'number', required: false }
      ]
    },
    {
      id: 'prepass',
      name: 'PrePass',
      description: 'Weigh station bypass and toll payment system for commercial motor vehicles.',
      icon: '🚧',
      category: 'Toll Management',
      color: 'green',
      features: [
        'Weigh station bypass',
        'Electronic toll payments',
        'Safety score tracking',
        'Inspection bypass',
        'Fleet productivity tools'
      ],
      website: 'https://www.prepass.com',
      setupFields: [
        { name: 'accountName', label: 'Account Name', type: 'text', required: true, placeholder: 'e.g., Main PrePass Account' },
        { name: 'carrierID', label: 'PrePass Carrier ID', type: 'text', required: true },
        { name: 'apiKey', label: 'API Key', type: 'password', required: true },
        { name: 'dotNumber', label: 'DOT Number', type: 'text', required: true },
        { name: 'enableBypass', label: 'Enable Weigh Station Bypass', type: 'checkbox', required: false },
        { name: 'safetyScoreSync', label: 'Sync Safety Scores', type: 'checkbox', required: false }
      ]
    },
    {
      id: 'eld',
      name: 'ELD Integration',
      description: 'Connect with major ELD providers for Hours of Service compliance and vehicle tracking.',
      icon: '📊',
      category: 'Compliance',
      color: 'indigo',
      features: [
        'Automatic HOS tracking',
        'FMCSA compliance',
        'Driver vehicle inspection',
        'Real-time location data',
        'Violation alerts'
      ],
      website: '#',
      setupFields: [
        { name: 'accountName', label: 'Account Name', type: 'text', required: true, placeholder: 'e.g., Main ELD System' },
        { name: 'provider', label: 'ELD Provider', type: 'select', 
          options: ['KeepTruckin', 'Samsara', 'Omnitracs', 'Geotab', 'Other'], required: true },
        { name: 'apiKey', label: 'Provider API Key', type: 'password', required: true },
        { name: 'fleetId', label: 'Fleet ID', type: 'text', required: false }
      ]
    }
  ];

  // Get accounts for a specific integration
  const getIntegrationAccounts = (integrationId) => {
    return integrationAccounts[integrationId] || [];
  };

  // Add new account for an integration
  const handleAddAccount = (integrationId) => {
    setShowAccountModal(integrationId);
  };

  // Test RTS connection
  const testRTSConnection = async (config) => {
    setTestingConnection(true);
    setConnectionStatus(null);
    
    try {
      const result = await rtsService.testConnection({
        integrationUsername: config.integrationUsername,
        integrationPassword: config.integrationPassword,
        ftpHost: config.ftpHost,
        ftpPort: config.ftpPort
      });
      
      setConnectionStatus({
        success: true,
        message: 'Connection test successful!'
      });
    } catch (error) {
      setConnectionStatus({
        success: false,
        message: error.message || 'Connection test failed'
      });
    } finally {
      setTestingConnection(false);
    }
  };

  // Save new account configuration
  const handleSaveAccount = async (integrationId, config, assignedCompanies) => {
    const accountId = Date.now().toString(); // Simple ID generation
    const newAccount = {
      id: accountId,
      ...config,
      assignedCompanies: assignedCompanies,
      createdAt: new Date().toISOString(),
      createdBy: auth.currentUser?.uid
    };

    const updatedAccounts = {
      ...integrationAccounts,
      [integrationId]: [...getIntegrationAccounts(integrationId), newAccount]
    };

    setIntegrationAccounts(updatedAccounts);

    // Save to Firebase
    if (loggedInUser?.tenantId) {
      try {
        const docRef = doc(db, 'integrationAccounts', loggedInUser.tenantId);
        await setDoc(docRef, {
          tenantId: loggedInUser.tenantId,
          accounts: updatedAccounts,
          updatedAt: serverTimestamp(),
          updatedBy: auth.currentUser?.uid
        }, { merge: true });
        
        alert('Account added successfully!');
        setShowAccountModal(null);
        setConnectionStatus(null); // Reset connection status
      } catch (error) {
        console.error('Error saving account:', error);
        alert('Failed to save account. Please try again.');
      }
    }
  };

  // Update existing account
  const handleUpdateAccount = async (integrationId, accountId, config, assignedCompanies) => {
    const updatedAccounts = {
      ...integrationAccounts,
      [integrationId]: getIntegrationAccounts(integrationId).map(account => 
        account.id === accountId 
          ? { ...account, ...config, assignedCompanies, updatedAt: new Date().toISOString() }
          : account
      )
    };

    setIntegrationAccounts(updatedAccounts);

    // Save to Firebase
    if (loggedInUser?.tenantId) {
      try {
        const docRef = doc(db, 'integrationAccounts', loggedInUser.tenantId);
        await updateDoc(docRef, {
          accounts: updatedAccounts,
          updatedAt: serverTimestamp(),
          updatedBy: auth.currentUser?.uid
        });
        
        alert('Account updated successfully!');
        setShowConfigModal(null);
        setConnectionStatus(null); // Reset connection status
      } catch (error) {
        console.error('Error updating account:', error);
        alert('Failed to update account. Please try again.');
      }
    }
  };

  // Delete account
  const handleDeleteAccount = async (integrationId, accountId) => {
    if (!window.confirm('Are you sure you want to delete this account?')) return;

    const updatedAccounts = {
      ...integrationAccounts,
      [integrationId]: getIntegrationAccounts(integrationId).filter(account => account.id !== accountId)
    };

    setIntegrationAccounts(updatedAccounts);

    // Save to Firebase
    if (loggedInUser?.tenantId) {
      try {
        const docRef = doc(db, 'integrationAccounts', loggedInUser.tenantId);
        await updateDoc(docRef, {
          accounts: updatedAccounts,
          updatedAt: serverTimestamp(),
          updatedBy: auth.currentUser?.uid
        });
        
        alert('Account deleted successfully!');
      } catch (error) {
        console.error('Error deleting account:', error);
        alert('Failed to delete account. Please try again.');
      }
    }
  };

  // Enhanced Account Configuration Modal
  const AccountModal = ({ integration, account = null, onSave, onClose }) => {
    const [config, setConfig] = useState(account || {});
    const [assignedCompanies, setAssignedCompanies] = useState(account?.assignedCompanies || []);

    const renderField = (field) => {
      return (
        <div key={field.name}>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {field.label} {field.required && <span className="text-red-500">*</span>}
          </label>
          
          {field.type === 'select' ? (
            <select
              value={config[field.name] || ''}
              onChange={(e) => setConfig(prev => ({ ...prev, [field.name]: e.target.value }))}
              required={field.required}
              className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
            >
              <option value="">Select {field.label}</option>
              {field.options.map(option => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          ) : field.type === 'multiselect' ? (
            <div className="space-y-2">
              {field.options.map(option => (
                <label key={option} className="flex items-center">
                  <input
                    type="checkbox"
                    checked={(config[field.name] || []).includes(option)}
                    onChange={(e) => {
                      const current = config[field.name] || [];
                      const updated = e.target.checked 
                        ? [...current, option]
                        : current.filter(item => item !== option);
                      setConfig(prev => ({ ...prev, [field.name]: updated }));
                    }}
                    className="mr-2 focus:ring-blue-500 h-4 w-4 text-blue-600 border-gray-300 rounded"
                  />
                  {option}
                </label>
              ))}
            </div>
          ) : field.type === 'checkbox' ? (
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={config[field.name] || false}
                onChange={(e) => setConfig(prev => ({ ...prev, [field.name]: e.target.checked }))}
                className="mr-2 focus:ring-blue-500 h-4 w-4 text-blue-600 border-gray-300 rounded"
              />
              {field.helper || 'Enable'}
            </label>
          ) : (
            <input
              type={field.type}
              value={config[field.name] || field.default || ''}
              onChange={(e) => setConfig(prev => ({ ...prev, [field.name]: e.target.value }))}
              required={field.required}
              placeholder={field.placeholder}
              className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
            />
          )}
          
          {field.helper && (
            <p className="mt-1 text-xs text-gray-500">{field.helper}</p>
          )}
        </div>
      );
    };

    const handleSubmit = (e) => {
      e.preventDefault();
      if (account) {
        handleUpdateAccount(integration.id, account.id, config, assignedCompanies);
      } else {
        handleSaveAccount(integration.id, config, assignedCompanies);
      }
    };

    // Custom modal for RTS
    if (integration.id === 'rts_factoring') {
      return (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
            <div className="fixed inset-0 transition-opacity" aria-hidden="true">
              <div className="absolute inset-0 bg-gray-500 opacity-75"></div>
            </div>

            <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-2xl sm:w-full">
              <form onSubmit={handleSubmit}>
                <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                  {/* Header with RTS Logo */}
                  <div className="flex items-center mb-4">
                    <div className="flex items-center justify-center w-12 h-12 bg-blue-500 rounded-lg mr-3">
                      <span className="text-white font-bold">RTS</span>
                    </div>
                    <div>
                      <h3 className="text-lg leading-6 font-medium text-gray-900">
                        Integrate With RTS
                      </h3>
                      <p className="text-sm text-red-600 mt-1">
                        Note: To integrate with RTS, please ensure that you have FTP credentials from the representative of your account.
                      </p>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Account Configuration */}
                    <div className="space-y-4">
                      <h4 className="font-medium text-gray-900">Integration Credentials</h4>
                      <p className="text-xs text-gray-600 -mt-2">
                        The following Username and Password are special integration credentials
                      </p>
                      
                      {integration.setupFields.map(renderField)}
                      
                      {/* Test Connection Button */}
                      {config.integrationUsername && config.integrationPassword && (
                        <div className="mt-4">
                          <button
                            type="button"
                            onClick={() => testRTSConnection(config)}
                            disabled={testingConnection}
                            className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
                          >
                            {testingConnection ? (
                              <>
                                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-gray-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                                Testing...
                              </>
                            ) : (
                              <>
                                <svg className="mr-2 -ml-0.5 h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                                </svg>
                                Test Connection
                              </>
                            )}
                          </button>
                          
                          {connectionStatus && (
                            <div className={`mt-2 text-sm ${connectionStatus.success ? 'text-green-600' : 'text-red-600'}`}>
                              {connectionStatus.message}
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Company Assignment */}
                    <div className="space-y-4">
                      <h4 className="font-medium text-gray-900">Assign to Companies</h4>
                      <div className="max-h-60 overflow-y-auto border border-gray-200 rounded-md p-3">
                        {companies.length > 0 ? (
                          companies.map(company => (
                            <label key={company.id} className="flex items-center py-2">
                              <input
                                type="checkbox"
                                checked={assignedCompanies.includes(company.id)}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setAssignedCompanies(prev => [...prev, company.id]);
                                  } else {
                                    setAssignedCompanies(prev => prev.filter(id => id !== company.id));
                                  }
                                }}
                                className="mr-3 focus:ring-blue-500 h-4 w-4 text-blue-600 border-gray-300 rounded"
                              />
                              <div>
                                <div className="text-sm font-medium text-gray-900">{company.name}</div>
                                <div className="text-xs text-gray-500">{company.mcNumber}</div>
                              </div>
                            </label>
                          ))
                        ) : (
                          <p className="text-sm text-gray-500">No companies available</p>
                        )}
                      </div>
                      <p className="text-xs text-gray-500">
                        Select which companies can use this account. Leave empty to make it available to all companies.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
                  <button
                    type="submit"
                    className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-6 py-2 bg-green-500 text-base font-medium text-white hover:bg-green-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 sm:ml-3 sm:w-auto sm:text-sm"
                  >
                    {account ? 'Update' : 'Edit'}
                  </button>
                  <button
                    type="button"
                    onClick={onClose}
                    className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-6 py-2 bg-gray-600 text-base font-medium text-white hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      );
    }

    // Default modal for other integrations
    return (
      <div className="fixed inset-0 z-50 overflow-y-auto">
        <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
          <div className="fixed inset-0 transition-opacity" aria-hidden="true">
            <div className="absolute inset-0 bg-gray-500 opacity-75"></div>
          </div>

          <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-2xl sm:w-full">
            <form onSubmit={handleSubmit}>
              <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                <div className="flex items-center mb-4">
                  <span className="text-2xl mr-3">{integration.icon}</span>
                  <h3 className="text-lg leading-6 font-medium text-gray-900">
                    {account ? 'Edit' : 'Add'} {integration.name} Account
                  </h3>
                </div>
                
                {/* Setup Instructions Alert */}
                {integration.setupInstructions && !account && (
                  <div className="mb-4 bg-blue-50 border-l-4 border-blue-400 p-4">
                    <div className="flex">
                      <div className="flex-shrink-0">
                        <svg className="h-5 w-5 text-blue-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                        </svg>
                      </div>
                      <div className="ml-3">
                        <p className="text-sm text-blue-700">{integration.setupInstructions}</p>
                      </div>
                    </div>
                  </div>
                )}
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Account Configuration */}
                  <div className="space-y-4">
                    <h4 className="font-medium text-gray-900">Account Details</h4>
                    {integration.setupFields.map((field) => (
                      <div key={field.name}>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          {field.label} {field.required && <span className="text-red-500">*</span>}
                        </label>
                        
                        {field.type === 'select' ? (
                          <select
                            value={config[field.name] || ''}
                            onChange={(e) => setConfig(prev => ({ ...prev, [field.name]: e.target.value }))}
                            required={field.required}
                            className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                          >
                            <option value="">Select {field.label}</option>
                            {field.options.map(option => (
                              <option key={option} value={option}>{option}</option>
                            ))}
                          </select>
                        ) : field.type === 'multiselect' ? (
                          <div className="space-y-2">
                            {field.options.map(option => (
                              <label key={option} className="flex items-center">
                                <input
                                  type="checkbox"
                                  checked={(config[field.name] || []).includes(option)}
                                  onChange={(e) => {
                                    const current = config[field.name] || [];
                                    const updated = e.target.checked 
                                      ? [...current, option]
                                      : current.filter(item => item !== option);
                                    setConfig(prev => ({ ...prev, [field.name]: updated }));
                                  }}
                                  className="mr-2 focus:ring-blue-500 h-4 w-4 text-blue-600 border-gray-300 rounded"
                                />
                                {option}
                              </label>
                            ))}
                          </div>
                        ) : field.type === 'checkbox' ? (
                          <label className="flex items-center">
                            <input
                              type="checkbox"
                              checked={config[field.name] || false}
                              onChange={(e) => setConfig(prev => ({ ...prev, [field.name]: e.target.checked }))}
                              className="mr-2 focus:ring-blue-500 h-4 w-4 text-blue-600 border-gray-300 rounded"
                            />
                            Enable {field.label}
                          </label>
                        ) : (
                          <input
                            type={field.type}
                            value={config[field.name] || ''}
                            onChange={(e) => setConfig(prev => ({ ...prev, [field.name]: e.target.value }))}
                            required={field.required}
                            placeholder={field.placeholder}
                            className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                          />
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Company Assignment */}
                  <div className="space-y-4">
                    <h4 className="font-medium text-gray-900">Assign to Companies</h4>
                    <div className="max-h-60 overflow-y-auto border border-gray-200 rounded-md p-3">
                      {companies.length > 0 ? (
                        companies.map(company => (
                          <label key={company.id} className="flex items-center py-2">
                            <input
                              type="checkbox"
                              checked={assignedCompanies.includes(company.id)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setAssignedCompanies(prev => [...prev, company.id]);
                                } else {
                                  setAssignedCompanies(prev => prev.filter(id => id !== company.id));
                                }
                              }}
                              className="mr-3 focus:ring-blue-500 h-4 w-4 text-blue-600 border-gray-300 rounded"
                            />
                            <div>
                              <div className="text-sm font-medium text-gray-900">{company.name}</div>
                              <div className="text-xs text-gray-500">{company.mcNumber}</div>
                            </div>
                          </label>
                        ))
                      ) : (
                        <p className="text-sm text-gray-500">No companies available</p>
                      )}
                    </div>
                    <p className="text-xs text-gray-500">
                      Select which companies can use this account. Leave empty to make it available to all companies.
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
                <button
                  type="submit"
                  className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-blue-600 text-base font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 sm:ml-3 sm:w-auto sm:text-sm"
                >
                  {account ? 'Update' : 'Add'} Account
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  // Group integrations by category
  const groupedIntegrations = integrations.reduce((acc, integration) => {
    const category = integration.category;
    if (!acc[category]) acc[category] = [];
    acc[category].push(integration);
    return acc;
  }, {});

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="sm:flex sm:items-center sm:justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Integrations</h1>
          <p className="mt-2 text-sm text-gray-700">
            Connect multiple accounts and assign them to different companies
          </p>
        </div>
      </div>

      {/* Integration Categories */}
      {Object.entries(groupedIntegrations).map(([category, categoryIntegrations]) => (
        <div key={category} className="mb-12">
          <h2 className="text-xl font-semibold text-gray-900 mb-6 border-b border-gray-200 pb-2">
            {category}
          </h2>
          
          <div className="space-y-6">
            {categoryIntegrations.map((integration) => {
              const accounts = getIntegrationAccounts(integration.id);
              
              return (
                <div key={integration.id} className="bg-white shadow rounded-lg">
                  {/* Integration Header */}
                  <div className="p-6 border-b border-gray-200">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center">
                        <span className="text-3xl mr-4">{integration.icon}</span>
                        <div>
                          <h3 className="text-lg font-medium text-gray-900">{integration.name}</h3>
                          <p className="text-sm text-gray-500">{integration.description}</p>
                        </div>
                      </div>
                      <button
                        onClick={() => handleAddAccount(integration.id)}
                        className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
                      >
                        Add Account
                      </button>
                    </div>
                  </div>

                  {/* Accounts List */}
                  <div className="p-6">
                    {accounts.length > 0 ? (
                      <div className="space-y-4">
                        {accounts.map((account) => (
                          <div key={account.id} className="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
                            <div className="flex-1">
                              <h4 className="font-medium text-gray-900">{account.accountName}</h4>
                              <div className="mt-1 text-sm text-gray-500">
                                <span>
                                  {integration.id === 'rts_factoring' 
                                    ? `Username: ${account.integrationUsername || 'Not set'}`
                                    : `Account: ${account.accountNumber || account.customerId || account.accountId || account.clientId || 'Not set'}`
                                  }
                                </span>
                                {account.assignedCompanies?.length > 0 && (
                                  <span className="ml-4">
                                    Companies: {account.assignedCompanies.length} assigned
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="flex space-x-2">
                              <button
                                onClick={() => setShowConfigModal({ integration, account })}
                                className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => handleDeleteAccount(integration.id, account.id)}
                                className="text-red-600 hover:text-red-800 text-sm font-medium"
                              >
                                Delete
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-8">
                        <svg className="mx-auto h-12 w-12 text-gray-400" stroke="currentColor" fill="none" viewBox="0 0 48 48">
                          <path d="M34 40h10v-4a6 6 0 00-10.712-3.714M34 40H14m20 0v-4a9.971 9.971 0 00-.712-3.714M14 40H4v-4a6 6 0 0110.713-3.714M14 40v-4c0-1.313.253-2.566.713-3.714m0 0A10.003 10.003 0 0124 26c4.21 0 7.813 2.602 9.288 6.286" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                        <h3 className="mt-2 text-sm font-medium text-gray-900">No accounts configured</h3>
                        <p className="mt-1 text-sm text-gray-500">Get started by adding your first account.</p>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {/* Modals */}
      {showAccountModal && (
        <AccountModal
          integration={integrations.find(i => i.id === showAccountModal)}
          onSave={handleSaveAccount}
          onClose={() => {
            setShowAccountModal(null);
            setConnectionStatus(null);
          }}
        />
      )}

      {showConfigModal && (
        <AccountModal
          integration={showConfigModal.integration}
          account={showConfigModal.account}
          onSave={handleUpdateAccount}
          onClose={() => {
            setShowConfigModal(null);
            setConnectionStatus(null);
          }}
        />
      )}
    </div>
  );
} 