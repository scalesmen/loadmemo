// src/components/ApplicationSettings.js
// Updated with Commodity Settings functionality and tenant awareness

import React, { useEffect, useState, useCallback } from 'react';
import { auth, db } from '../../firebase'; // Adjust path if needed
import { applyOwnerImpersonation } from '../../utils/impersonation';
import { doc, getDoc, setDoc, updateDoc, collection, addDoc, onSnapshot, deleteDoc, serverTimestamp, query, where } from "firebase/firestore";
import { updatePassword, EmailAuthProvider, reauthenticateWithCredential } from "firebase/auth";
import { v4 as uuidv4 } from 'uuid'; // For generating unique API keys
import BrokerFactoringSettings from './BrokerFactoringSettings';


// Example timezones (ensure this list is comprehensive for your needs)
const timezones = [
  { value: "America/New_York", label: "(GMT-5:00) Eastern Time (US & Canada)" },
  { value: "America/Chicago", label: "(GMT-6:00) Central Time (US & Canada)" },
  { value: "America/Denver", label: "(GMT-7:00) Mountain Time (US & Canada)" },
  { value: "America/Los_Angeles", label: "(GMT-8:00) Pacific Time (US & Canada)" },
  { value: "Europe/London", label: "(GMT+0:00) London" },
  { value: "Europe/Paris", label: "(GMT+1:00) Paris" },
  { value: "Asia/Tokyo", label: "(GMT+9:00) Tokyo" },
  { value: "Australia/Sydney", label: "(GMT+10:00) Sydney" },
  // Add more timezones as needed
];

const factoringCompanies = [
  { value: "", label: "No Factoring Company Selected" },
  { value: "triumph_business_capital", label: "Triumph Business Capital" },
  { value: "porter_capital", label: "Porter Capital" },
  { value: "rts_financial", label: "RTS Financial" },
  { value: "bay_view_funding", label: "Bay View Funding" },
  { value: "apex_capital", label: "Apex Capital" },
  { value: "oak_ridge_financial", label: "Oak Ridge Financial" },
  { value: "advance_funds_network", label: "Advance Funds Network" },
  { value: "factor_finders", label: "Factor Finders" },
  { value: "interstate_capital", label: "Interstate Capital" },
  { value: "accutrac_capital", label: "AccuTrac Capital" }
];

// Define available commodity types
const commodityTypes = [
  { 
    id: "automobile_hauling", 
    label: "Automobiles", 
    description: "Car hauling, auto transport",
    icon: "🚗"
  },
  { 
    id: "dry_van", 
    label: "Dry Van", 
    description: "General freight, packaged goods",
    icon: "📦"
  },
  { 
    id: "reefer", 
    label: "Reefer", 
    description: "Refrigerated goods, temperature controlled",
    icon: "❄️"
  },
  { 
    id: "flatbed", 
    label: "Flatbed", 
    description: "Construction materials, machinery, oversized freight",
    icon: "🏗️"
  },
  { 
    id: "tanker", 
    label: "Tanker", 
    description: "Liquids, chemicals, bulk materials",
    icon: "🛢️"
  }
];

// Define available notification preference types
const notificationPreferenceTypes = [
    { id: "emailOnNewInvite", label: "Email me when a new user is invited (Admins)" },
    { id: "emailDailyReport", label: "Email me the daily summary report (Admins)" },
    { id: "inAppCriticalAlerts", label: "Show in-app notifications for critical system alerts" },
];

export default function ApplicationSettings({ tenantId: propTenantId }) {
  const [loggedInUser, setLoggedInUser] = useState(null);
  const [currentTenantId, setCurrentTenantId] = useState(propTenantId);
  
  // UPDATED: Tenant-aware app settings - these are now per-tenant
  const [appSettings, setAppSettings] = useState({ 
    defaultTimeZone: "America/New_York",
    commodityTypes: [],
    factoringCompany: ""
  });

  // Password change states
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [passwordChangeMessage, setPasswordChangeMessage] = useState({ type: "", text: "" });
  const [isPasswordUpdating, setIsPasswordUpdating] = useState(false);
  const [selectedGrossMethod, setSelectedGrossMethod] = useState("pickup");
const [isSavingGrossMethod, setIsSavingGrossMethod] = useState(false);
const [grossMethodSaveMessage, setGrossMethodSaveMessage] = useState({ type: "", text: "" });

  const [isSavingTimezone, setIsSavingTimezone] = useState(false);
  const [timezoneSaveMessage, setTimezoneSaveMessage] = useState({ type: "", text: "" });
  const [selectedFactoringCompany, setSelectedFactoringCompany] = useState("");
  const [isSavingFactoring, setIsSavingFactoring] = useState(false);
  const [factoringSaveMessage, setFactoringSaveMessage] = useState({ type: "", text: "" });
  
  // Commodity Settings States
  const [selectedCommodities, setSelectedCommodities] = useState([]);
  const [isSavingCommodities, setIsSavingCommodities] = useState(false);
  const [commoditySaveMessage, setCommoditySaveMessage] = useState({ type: "", text: "" });

  // API Key Management States
  const [apiKeys, setApiKeys] = useState([]);
  const [showApiKeyModal, setShowApiKeyModal] = useState(false);
  const [newApiKeyData, setNewApiKeyData] = useState({ companyId: "", companyName: "", description: "" });
  const [generatedKey, setGeneratedKey] = useState("");
  const [isGeneratingKey, setIsGeneratingKey] = useState(false);
  const [companies, setCompanies] = useState([]);

  // Notification Preferences State
  const [notificationPrefs, setNotificationPrefs] = useState({});
  const [isSavingNotifPrefs, setIsSavingNotifPrefs] = useState(false);
  const [notifPrefsSaveMessage, setNotifPrefsSaveMessage] = useState({ type: "", text: "" });

  // UPDATED: Fetch logged-in user and their profile with tenant extraction
  useEffect(() => {
    const unsubscribeAuth = auth.onAuthStateChanged((user) => {
      if (user) {
        const userRef = doc(db, "users", user.uid);
        const unsubProfile = onSnapshot(userRef, (docSnap) => {
          if (docSnap.exists()) {
            const userData = applyOwnerImpersonation({ uid: user.uid, email: user.email, ...docSnap.data() });
            setLoggedInUser(userData);
            
            // UPDATED: Set tenant ID from user data if not provided as prop
            if (!propTenantId && userData.tenantId) {
              setCurrentTenantId(userData.tenantId);
            } else if (!propTenantId && userData.assignedCompanyId) {
              setCurrentTenantId(userData.assignedCompanyId);
            } else if (!propTenantId && userData.assignedCompanyName) {
              setCurrentTenantId(`tenant_${userData.assignedCompanyName.toLowerCase().replace(/\s+/g, '_')}`);
            }
            
            const initialPrefs = {};
            notificationPreferenceTypes.forEach(pref => {
                initialPrefs[pref.id] = userData.notificationPrefs?.[pref.id] || false;
            });
            setNotificationPrefs(initialPrefs);
          } else {
            console.warn("App Settings: Logged in user profile not found.");
            setLoggedInUser({ uid: user.uid, email: user.email, role: null });
            const defaultPrefs = {};
            notificationPreferenceTypes.forEach(pref => { defaultPrefs[pref.id] = false; });
            setNotificationPrefs(defaultPrefs);
          }
        });
        return () => unsubProfile();
      } else {
        setLoggedInUser(null);
        setCurrentTenantId(null);
        setNotificationPrefs({});
      }
    });
    return unsubscribeAuth;
  }, [propTenantId]);

  // UPDATED: Fetch tenant-specific application settings & companies
  useEffect(() => {
    if (!currentTenantId) {
      console.warn("ApplicationSettings: No tenant ID available, skipping settings fetch");
      return;
    }

    // UPDATED: Fetch tenant-specific app settings instead of global settings
    const appSettingsRef = doc(db, "tenantSettings", currentTenantId);
    const unsubscribeAppSettings = onSnapshot(appSettingsRef, (docSnap) => {
  console.log("🔍 DEBUG: Settings snapshot received. Exists:", docSnap.exists());
  
  if (docSnap.exists()) {
    const data = docSnap.data();
    console.log("🔍 DEBUG: Settings data:", data);
    
    setAppSettings(data);
    setSelectedCommodities(data.commodityTypes || []);
    setSelectedFactoringCompany(data.factoringCompany || "");
    setSelectedGrossMethod(data.grossCalculationMethod || "pickup");

    
    // Log the specific settings that are causing issues
    console.log("🔍 DEBUG: Commodity types from settings:", data.commodityTypes);
    console.log("🔍 DEBUG: Factoring company from settings:", data.factoringCompany);
    
  } else {
    console.warn("⚠️ ApplicationSettings: No tenant settings document found");
    
    // For non-Super Admin users, don't create the document, just set defaults
    const defaultSettings = { 
      defaultTimeZone: "America/New_York", 
      commodityTypes: [],
      factoringCompany: "",
      grossCalculationMethod: "pickup", 
      tenantId: currentTenantId
    };
    
    console.log("🔍 DEBUG: Using default settings:", defaultSettings);
    setAppSettings(defaultSettings);
    setSelectedCommodities([]);
    setSelectedFactoringCompany("");
    
    // Only Super Admin should create the document
    if (loggedInUser?.role === "Super Admin") {
      console.log("🔍 DEBUG: Super Admin detected, creating default tenant settings document");
      setDoc(appSettingsRef, {
        ...defaultSettings,
        createdAt: serverTimestamp(),
        createdBy: loggedInUser.uid
      }).then(() => {
        console.log("✅ Default tenant settings document created");
      }).catch((error) => {
        console.error("❌ Error creating tenant settings document:", error);
      });
    }
  }
}, (error) => {
  console.error("❌ Error fetching tenant settings:", error);
  console.error("❌ Error details:", {
    code: error.code,
    message: error.message,
    tenantId: currentTenantId,
    userRole: loggedInUser?.role
  });
  
  // Fallback to empty settings if there's an error
  setAppSettings({ 
    defaultTimeZone: "America/New_York", 
    commodityTypes: [],
    factoringCompany: "",
    tenantId: currentTenantId
  });
  setSelectedCommodities([]);
  setSelectedFactoringCompany("");
});

    // UPDATED: Fetch tenant-specific companies
    let unsubscribeCompanies = () => {};
    if (loggedInUser?.role === "Super Admin") {
      const companiesQuery = loggedInUser.role === "Super Admin" && currentTenantId === "admin_tenant"
        ? collection(db, "companies") // Super admin can see all companies
        : query(collection(db, "companies"), where("tenantId", "==", currentTenantId));

      unsubscribeCompanies = onSnapshot(companiesQuery, (snapshot) => {
        const companyList = snapshot.docs.map(compDoc => ({
          id: compDoc.id,
          name: compDoc.data().name,
          tenantId: compDoc.data().tenantId
        }));
        setCompanies(companyList);
        if (companyList.length > 0 && !newApiKeyData.companyId) {
          setNewApiKeyData(prev => ({ ...prev, companyId: companyList[0].id, companyName: companyList[0].name }));
        }
      });
    } else {
        setCompanies([]);
    }

    return () => {
      unsubscribeAppSettings();
      unsubscribeCompanies();
    };
  }, [loggedInUser, currentTenantId, newApiKeyData.companyId]); 

  // UPDATED: Fetch tenant-specific API Keys
useEffect(() => {
  if (!currentTenantId) {
    console.warn("❌ No tenant ID for API keys, clearing list");
    setApiKeys([]);
    return;
  }

  console.log("🔧 Setting up API keys listener for tenant:", currentTenantId);

  if (loggedInUser?.role === "Super Admin") {
    // UPDATED: Filter API keys by tenant
    const apiKeysQuery = loggedInUser.role === "Super Admin" && currentTenantId === "admin_tenant"
      ? collection(db, "apiKeys") // Super admin can see all API keys
      : query(collection(db, "apiKeys"), where("tenantId", "==", currentTenantId));

    const unsubscribeApiKeys = onSnapshot(
      apiKeysQuery, 
      (snapshot) => {
        console.log("📥 API keys snapshot received:", {
          size: snapshot.size,
          tenantId: currentTenantId,
          timestamp: new Date().toLocaleTimeString()
        });
        
        const keysList = snapshot.docs.map(keyDoc => ({
          id: keyDoc.id,
          ...keyDoc.data(),
        }));
        
        console.log("📊 API keys data:", keysList);
        setApiKeys(keysList);
      },
      (error) => {
        console.error("❌ API keys listener ERROR:", error);
        setApiKeys([]);
      }
    );
    
    return () => {
      console.log("🔧 Cleaning up API keys listener");
      unsubscribeApiKeys();
    };
  } else {
    console.log("🔧 User is not Super Admin, clearing API keys");
    setApiKeys([]);
  }
}, [loggedInUser, currentTenantId]);

const handleTimezoneChange = (e) => {
  console.log("🔧 Timezone changed to:", e.target.value);
  setAppSettings(prev => ({ ...prev, defaultTimeZone: e.target.value }));
};


  // UPDATED: Save tenant-specific timezone
  const handleSaveTimezone = async () => {
    if (loggedInUser?.role !== "Super Admin") {
      setTimezoneSaveMessage({ type: "error", text: "Only Super Admins can change the default time zone." });
      return;
    }

    if (!currentTenantId) {
      setTimezoneSaveMessage({ type: "error", text: "Tenant information is missing." });
      return;
    }

    setIsSavingTimezone(true);
    setTimezoneSaveMessage({ type: "", text: "" });
    try {
      // UPDATED: Save to tenant-specific settings
      const tenantSettingsRef = doc(db, "tenantSettings", currentTenantId);
      await setDoc(tenantSettingsRef, { 
        defaultTimeZone: appSettings.defaultTimeZone,
        tenantId: currentTenantId,
        updatedAt: serverTimestamp(),
        updatedBy: loggedInUser.uid
      }, { merge: true });
      
      setTimezoneSaveMessage({ type: "success", text: "Default time zone saved successfully!" });
      
      // UPDATED: Tenant-aware audit log
      await addDoc(collection(db, "auditLogs"), {
        timestamp: serverTimestamp(),
        userId: loggedInUser.uid,
        userEmail: loggedInUser.email,
        action: "APP_TIMEZONE_SAVED",
        targetType: "tenantSettings",
        targetId: currentTenantId,
        tenantId: currentTenantId,
        details: {
          defaultTimeZone: appSettings.defaultTimeZone,
          tenantId: currentTenantId
        }
      });
    } catch (error) {
      console.error("Error saving time zone:", error);
      setTimezoneSaveMessage({ type: "error", text: "Failed to save time zone: " + error.message });
    }
    setIsSavingTimezone(false);
  };
const handleGrossMethodChange = (e) => {
  setSelectedGrossMethod(e.target.value);
};

const handleSaveGrossMethod = async () => {
  if (loggedInUser?.role !== "Super Admin") {
    setGrossMethodSaveMessage({ type: "error", text: "Only Super Admins can configure gross calculation method." });
    return;
  }

  if (!currentTenantId) {
    setGrossMethodSaveMessage({ type: "error", text: "Tenant information is missing." });
    return;
  }

  setIsSavingGrossMethod(true);
  setGrossMethodSaveMessage({ type: "", text: "" });
  
  try {
    const tenantSettingsRef = doc(db, "tenantSettings", currentTenantId);
    await setDoc(tenantSettingsRef, { 
      grossCalculationMethod: selectedGrossMethod,
      grossCalculationMethodUpdatedAt: serverTimestamp(),
      grossCalculationMethodUpdatedBy: loggedInUser.uid,
      tenantId: currentTenantId
    }, { merge: true });
    
    setGrossMethodSaveMessage({ type: "success", text: "Gross calculation method saved successfully!" });
    
    // Audit log
    await addDoc(collection(db, "auditLogs"), {
      timestamp: serverTimestamp(),
      userId: loggedInUser.uid,
      userEmail: loggedInUser.email,
      action: "GROSS_CALCULATION_METHOD_UPDATED",
      targetType: "tenantSettings",
      targetId: currentTenantId,
      tenantId: currentTenantId,
      details: {
        newGrossCalculationMethod: selectedGrossMethod,
        methodLabel: selectedGrossMethod === "pickup" ? "Pickup Date" : "Delivery Date",
        tenantId: currentTenantId
      }
    });
    
  } catch (error) {
    console.error("Error saving gross calculation method:", error);
    setGrossMethodSaveMessage({ type: "error", text: "Failed to save: " + error.message });
  }
  setIsSavingGrossMethod(false);
};
  // Commodity Settings Handlers
  const handleCommodityChange = (commodityId) => {
    setSelectedCommodities(prev => {
      if (prev.includes(commodityId)) {
        return prev.filter(id => id !== commodityId);
      } else {
        return [...prev, commodityId];
      }
    });
  };

  // UPDATED: Save tenant-specific commodities
  const handleSaveCommodities = async () => {
    if (loggedInUser?.role !== "Super Admin") {
      setCommoditySaveMessage({ type: "error", text: "Only Super Admins can configure commodity types." });
      return;
    }
    
    if (selectedCommodities.length === 0) {
      setCommoditySaveMessage({ type: "error", text: "Please select at least one commodity type." });
      return;
    }

    if (!currentTenantId) {
      setCommoditySaveMessage({ type: "error", text: "Tenant information is missing." });
      return;
    }

    setIsSavingCommodities(true);
    setCommoditySaveMessage({ type: "", text: "" });
    
    try {
      // UPDATED: Save to tenant-specific settings
      const tenantSettingsRef = doc(db, "tenantSettings", currentTenantId);
      await setDoc(tenantSettingsRef, { 
        commodityTypes: selectedCommodities,
        commodityTypesUpdatedAt: serverTimestamp(),
        commodityTypesUpdatedBy: loggedInUser.uid,
        tenantId: currentTenantId
      }, { merge: true });
      
      setCommoditySaveMessage({ type: "success", text: "Commodity types saved successfully!" });
      
      // UPDATED: Tenant-aware audit log
      await addDoc(collection(db, "auditLogs"), {
        timestamp: serverTimestamp(),
        userId: loggedInUser.uid,
        userEmail: loggedInUser.email,
        action: "COMMODITY_TYPES_UPDATED",
        targetType: "tenantSettings",
        targetId: currentTenantId,
        tenantId: currentTenantId,
        details: {
          newCommodityTypes: selectedCommodities,
          commodityCount: selectedCommodities.length,
          tenantId: currentTenantId
        }
      });
      
    } catch (error) {
      console.error("Error saving commodity types:", error);
      setCommoditySaveMessage({ type: "error", text: "Failed to save commodity types: " + error.message });
    }
    setIsSavingCommodities(false);
  };

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    if (newPassword !== confirmNewPassword) {
      setPasswordChangeMessage({ type: "error", text: "New passwords do not match." }); return;
    }
    if (newPassword.length < 6) {
      setPasswordChangeMessage({ type: "error", text: "New password must be at least 6 characters." }); return;
    }
    setIsPasswordUpdating(true); setPasswordChangeMessage({ type: "", text: "" });
    const user = auth.currentUser;
    if (user) {
      const credential = EmailAuthProvider.credential(user.email, currentPassword);
      try {
        await reauthenticateWithCredential(user, credential);
        await updatePassword(user, newPassword);
        setPasswordChangeMessage({ type: "success", text: "Password updated successfully!" });
        setCurrentPassword(""); setNewPassword(""); setConfirmNewPassword("");
      } catch (error) {
        let msg = "Failed to update password. ";
        if (error.code === 'auth/wrong-password') msg += "Incorrect current password.";
        else if (error.code === 'auth/weak-password') msg += "New password is too weak.";
        else msg += error.message;
        setPasswordChangeMessage({ type: "error", text: msg });
      }
    } else { setPasswordChangeMessage({ type: "error", text: "No user logged in." }); }
    setIsPasswordUpdating(false);
  };

  const handleApiKeyModalChange = (e) => {
    const { name, value } = e.target;
    if (name === "companyId") {
        const selectedCompany = companies.find(c => c.id === value);
        setNewApiKeyData(prev => ({ ...prev, companyId: value, companyName: selectedCompany?.name || "" }));
    } else {
        setNewApiKeyData(prev => ({ ...prev, [name]: value }));
    }
  };

  const openGenerateKeyModal = () => {
    setNewApiKeyData({ companyId: companies.length > 0 ? companies[0].id : "", companyName: companies.length > 0 ? companies[0].name : "", description: "" });
    setGeneratedKey("");
    setShowApiKeyModal(true);
  };

  // UPDATED: Generate tenant-aware API key
  const handleGenerateApiKey = async (e) => {
    e.preventDefault();
    if (!newApiKeyData.companyId) {
      alert("Please select a company."); return;
    }

    if (!currentTenantId) {
      alert("Tenant information is missing."); return;
    }

    setIsGeneratingKey(true);
    const newKey = `sk_${uuidv4().replace(/-/g, '')}`;
    try {
      // UPDATED: Include tenant ID in API key
      await addDoc(collection(db, "apiKeys"), {
        keyPrefix: newKey.substring(0, 7), 
        apiKey: newKey,
        companyId: newApiKeyData.companyId, 
        companyName: newApiKeyData.companyName,
        description: newApiKeyData.description, 
        status: "active",
        tenantId: currentTenantId, // UPDATED: Add tenant tracking
        createdAt: serverTimestamp(), 
        lastUsed: null,
      });
      
      setGeneratedKey(newKey);
      
      // UPDATED: Tenant-aware audit log
      await addDoc(collection(db, "auditLogs"), {
        timestamp: serverTimestamp(),
        userId: loggedInUser.uid,
        userEmail: loggedInUser.email,
        action: "API_KEY_GENERATED",
        targetType: "apiKey",
        tenantId: currentTenantId,
        details: {
          companyName: newApiKeyData.companyName,
          description: newApiKeyData.description,
          keyPrefix: newKey.substring(0, 7),
          tenantId: currentTenantId
        }
      });
    } catch (error) {
      console.error("Error generating API key:", error);
      alert("Failed to generate API key: " + error.message);
      setGeneratedKey("");
    }
    setIsGeneratingKey(false);
  };

  // UPDATED: Tenant-aware API key revocation
  const handleRevokeApiKey = async (keyId) => {
    if (!window.confirm("Are you sure you want to revoke this API key?")) return;
    try { 
      await updateDoc(doc(db, "apiKeys", keyId), { 
        status: "revoked",
        revokedAt: serverTimestamp(),
        revokedBy: loggedInUser.uid
      }); 
      alert("API Key revoked.");
      
      // UPDATED: Tenant-aware audit log
      const revokedKey = apiKeys.find(k => k.id === keyId);
      await addDoc(collection(db, "auditLogs"), {
        timestamp: serverTimestamp(),
        userId: loggedInUser.uid,
        userEmail: loggedInUser.email,
        action: "API_KEY_REVOKED",
        targetType: "apiKey",
        targetId: keyId,
        tenantId: currentTenantId,
        details: {
          keyPrefix: revokedKey?.keyPrefix,
          companyName: revokedKey?.companyName,
          tenantId: currentTenantId
        }
      });
    } catch (error) { 
      console.error("Error revoking API key:", error); 
      alert("Failed to revoke API key: " + error.message); 
    }
  };

  // UPDATED: Tenant-aware API key deletion
  const handleDeleteApiKey = async (keyId) => {
    if (!window.confirm("Are you sure you want to permanently delete this API key?")) return;
    try { 
      const deletedKey = apiKeys.find(k => k.id === keyId);
      await deleteDoc(doc(db, "apiKeys", keyId)); 
      alert("API Key deleted.");
      
      // UPDATED: Tenant-aware audit log
      await addDoc(collection(db, "auditLogs"), {
        timestamp: serverTimestamp(),
        userId: loggedInUser.uid,
        userEmail: loggedInUser.email,
        action: "API_KEY_DELETED",
        targetType: "apiKey",
        targetId: keyId,
        tenantId: currentTenantId,
        details: {
          keyPrefix: deletedKey?.keyPrefix,
          companyName: deletedKey?.companyName,
          tenantId: currentTenantId
        }
      });
    } catch (error) { 
      console.error("Error deleting API key:", error); 
      alert("Failed to delete API key: " + error.message); 
    }
  };

  const handleNotificationPrefChange = (e) => {
    const { name, checked } = e.target;
    setNotificationPrefs(prev => ({ ...prev, [name]: checked }));
  };

  const handleSaveNotificationPrefs = async () => {
    if (!loggedInUser) {
      setNotifPrefsSaveMessage({ type: "error", text: "You must be logged in to save preferences." });
      return;
    }
    setIsSavingNotifPrefs(true);
    setNotifPrefsSaveMessage({ type: "", text: "" });
    try {
      const userRef = doc(db, "users", loggedInUser.uid);
      await updateDoc(userRef, {
        notificationPrefs: notificationPrefs
      });
      setNotifPrefsSaveMessage({ type: "success", text: "Notification preferences saved!" });
    } catch (error) {
      console.error("Error saving notification preferences:", error);
      setNotifPrefsSaveMessage({ type: "error", text: "Failed to save preferences: " + error.message });
    }
    setIsSavingNotifPrefs(false);
  };

  const handleFactoringCompanyChange = (e) => {
    setSelectedFactoringCompany(e.target.value);
  };

  // UPDATED: Save tenant-specific factoring company
  const handleSaveFactoringCompany = async () => {
    if (loggedInUser?.role !== "Super Admin") {
      setFactoringSaveMessage({ type: "error", text: "Only Super Admins can configure factoring company." });
      return;
    }

    if (!currentTenantId) {
      setFactoringSaveMessage({ type: "error", text: "Tenant information is missing." });
      return;
    }

    setIsSavingFactoring(true);
    setFactoringSaveMessage({ type: "", text: "" });
    
    try {
      // UPDATED: Save to tenant-specific settings
      const tenantSettingsRef = doc(db, "tenantSettings", currentTenantId);
      await setDoc(tenantSettingsRef, { 
        factoringCompany: selectedFactoringCompany,
        factoringCompanyUpdatedAt: serverTimestamp(),
        factoringCompanyUpdatedBy: loggedInUser.uid,
        tenantId: currentTenantId
      }, { merge: true });
      
      setFactoringSaveMessage({ type: "success", text: "Factoring company saved successfully!" });
      
      // UPDATED: Tenant-aware audit log
      await addDoc(collection(db, "auditLogs"), {
        timestamp: serverTimestamp(),
        userId: loggedInUser.uid,
        userEmail: loggedInUser.email,
        action: "FACTORING_COMPANY_UPDATED",
        targetType: "tenantSettings",
        targetId: currentTenantId,
        tenantId: currentTenantId,
        details: {
          newFactoringCompany: selectedFactoringCompany,
          factoringCompanyName: factoringCompanies.find(f => f.value === selectedFactoringCompany)?.label || "None",
          tenantId: currentTenantId
        }
      });
      
    } catch (error) {
      console.error("Error saving factoring company:", error);
      setFactoringSaveMessage({ type: "error", text: "Failed to save factoring company: " + error.message });
    }
    setIsSavingFactoring(false);
  };

  if (!loggedInUser) {
    return <div className="p-6 text-center">Loading user information or not authorized...</div>;
  }

  // UPDATED: Handle missing tenant
  if (!currentTenantId) {
    return (
      <div className="p-6 bg-white rounded-lg shadow">
        <div className="text-red-600 mb-2">Tenant information is missing</div>
        <div className="text-sm text-gray-500">Cannot load application settings without tenant context</div>
      </div>
    );
  }

  return (
    <div className="space-y-8 p-4 md:p-6 lg:p-8">
      {/* UPDATED: Show tenant info */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h2 className="text-lg font-semibold text-blue-800 mb-2">Super Admin Settings</h2>
      </div>

      {/* Time Zone Configuration */}
      <section className="p-6 bg-white rounded-lg shadow">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">Time Zone Configuration</h3>
        <div className="mb-4">
          <label htmlFor="defaultTimeZone" className="block text-sm font-medium text-gray-700 mb-1">Default Time Zone for This Tenant</label>
          <select 
            id="defaultTimeZone" 
            name="defaultTimeZone" 
            value={appSettings.defaultTimeZone || "America/New_York"}
            onChange={handleTimezoneChange}
            className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md shadow-sm"
            disabled={loggedInUser.role !== "Super Admin"}
          >
            {timezones.map(tz => (<option key={tz.value} value={tz.value}>{tz.label}</option>))}
          </select>
          <p className="mt-1 text-xs text-gray-500">Default for displaying dates and times for this tenant.</p>
        </div>
        {loggedInUser.role === "Super Admin" && (
          <button 
            onClick={handleSaveTimezone} 
            disabled={isSavingTimezone}
            className="bg-blue-500 hover:bg-blue-600 text-white font-medium py-2 px-4 rounded-md text-sm shadow-sm disabled:opacity-50 transition duration-150 ease-in-out"
          >
            {isSavingTimezone ? "Saving..." : "Save Time Zone Setting"}
          </button>
        )}
        {timezoneSaveMessage.text && (<p className={`mt-2 text-sm ${timezoneSaveMessage.type === 'success' ? 'text-green-600' : 'text-red-600'}`}>{timezoneSaveMessage.text}</p>)}
      </section>
{/* Driver Gross Calculation Settings */}
<section className="p-6 bg-white rounded-lg shadow">
  <h3 className="text-lg font-semibold text-gray-800 mb-4">Driver Gross Calculation Settings</h3>
  <p className="text-sm text-gray-600 mb-6">
    Configure how weekly gross amounts are calculated for drivers in the mobile app. 
    This ensures consistency between dispatcher calculations and what drivers see.
  </p>
  
  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
    {/* Calculation Method */}
    <div>
      <label htmlFor="grossCalculationMethod" className="block text-sm font-medium text-gray-700 mb-2">
        Calculate Weekly Gross By
      </label>
      <select 
        id="grossCalculationMethod"
        value={selectedGrossMethod}
        onChange={handleGrossMethodChange}
        disabled={loggedInUser.role !== "Super Admin"}
        className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md shadow-sm disabled:opacity-60"
      >
        <option value="pickup">Pickup Date (when load was picked up)</option>
        <option value="delivery">Delivery Date (when load was delivered)</option>
      </select>
      <p className="mt-1 text-xs text-gray-500">
        Drivers will see their weekly gross calculated based on this date type.
      </p>
    </div>

    {/* Current Timezone Display */}
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-2">
        Timezone Used for Calculations
      </label>
      <div className="mt-1 p-3 bg-gray-50 border border-gray-200 rounded-md">
        <p className="text-sm text-gray-700 font-medium">
          {timezones.find(tz => tz.value === appSettings.defaultTimeZone)?.label || appSettings.defaultTimeZone}
        </p>
        <p className="text-xs text-gray-500 mt-1">
          Change this in Time Zone Configuration above.
        </p>
      </div>
    </div>
  </div>

  {/* Preview Box */}
  <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
    <h4 className="text-sm font-semibold text-blue-800 mb-2">📱 Driver App Preview</h4>
    <p className="text-sm text-blue-700">
      Drivers will see: "Weekly gross calculated by <strong>{selectedGrossMethod === "pickup" ? "Pickup Date" : "Delivery Date"}</strong> using <strong>{timezones.find(tz => tz.value === appSettings.defaultTimeZone)?.label.split(')')[0]})</strong>"
    </p>
  </div>

  {loggedInUser.role === "Super Admin" && (
    <button 
      onClick={handleSaveGrossMethod} 
      disabled={isSavingGrossMethod}
      className="mt-6 bg-blue-500 hover:bg-blue-600 text-white font-medium py-2 px-4 rounded-md text-sm shadow-sm disabled:opacity-50 transition duration-150 ease-in-out"
    >
      {isSavingGrossMethod ? "Saving..." : "Save Calculation Settings"}
    </button>
  )}
  
  {loggedInUser.role !== "Super Admin" && (
    <div className="mt-4 bg-gray-50 border border-gray-200 rounded-md p-3">
      <p className="text-sm text-gray-600">
        Only Super Admins can configure gross calculation settings.
      </p>
    </div>
  )}
  
  {grossMethodSaveMessage.text && (
    <p className={`mt-2 text-sm ${grossMethodSaveMessage.type === 'success' ? 'text-green-600' : 'text-red-600'}`}>
      {grossMethodSaveMessage.text}
    </p>
  )}
</section>
      {/* Factoring Company Configuration */}
      <section className="p-6 bg-white rounded-lg shadow">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">Factoring Company Configuration</h3>
        <p className="text-sm text-gray-600 mb-6">Select your primary factoring company for invoice processing and payment terms for this tenant.</p>
        
        <div className="mb-6">
          <label htmlFor="factoringCompany" className="block text-sm font-medium text-gray-700 mb-2">
            Factoring Company
          </label>
          <select 
            id="factoringCompany"
            value={selectedFactoringCompany}
            onChange={handleFactoringCompanyChange}
            disabled={loggedInUser.role !== "Super Admin"}
            className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md shadow-sm disabled:opacity-60"
          >
            {factoringCompanies.map(company => (
              <option key={company.value} value={company.value}>
                {company.label}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-gray-500">
            This factoring company will be used for invoice processing when "Factoring" payment terms are selected.
          </p>
        </div>

        {loggedInUser.role === "Super Admin" && (
          <>
            {selectedFactoringCompany && (
              <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-md">
                <p className="text-sm font-medium text-blue-800">
                  Selected: {factoringCompanies.find(f => f.value === selectedFactoringCompany)?.label}
                </p>
              </div>
            )}
            
            <button 
              onClick={handleSaveFactoringCompany} 
              disabled={isSavingFactoring}
              className="bg-blue-500 hover:bg-blue-600 text-white font-medium py-2 px-4 rounded-md text-sm shadow-sm disabled:opacity-50 transition duration-150 ease-in-out"
            >
              {isSavingFactoring ? "Saving..." : "Save Factoring Company"}
            </button>
          </>
        )}
        
        {loggedInUser.role !== "Super Admin" && (
          <div className="bg-gray-50 border border-gray-200 rounded-md p-3">
            <p className="text-sm text-gray-600">
              Only Super Admins can configure factoring company. Current selection: {
                selectedFactoringCompany ? 
                factoringCompanies.find(f => f.value === selectedFactoringCompany)?.label : 
                "None selected"
              }
            </p>
          </div>
        )}
        
      {factoringSaveMessage.text && (
          <p className={`mt-2 text-sm ${factoringSaveMessage.type === 'success' ? 'text-green-600' : 'text-red-600'}`}>
            {factoringSaveMessage.text}
          </p>
        )}
      </section>

      {/* Broker-Specific Factoring Rules */}
      {(loggedInUser?.role === "Super Admin" || loggedInUser?.role === "Admin") && (
        <BrokerFactoringSettings 
          loggedInUser={loggedInUser}
          tenantId={currentTenantId}
        />
      )}

      {/* Commodity Types Configuration */}
      <section className="p-6 bg-white rounded-lg shadow">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">Commodity Types Configuration</h3>
        <p className="text-sm text-gray-600 mb-6">Select the types of commodities your company hauls. This setting affects load matching, driver assignments, and equipment requirements for this tenant.</p>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
          {commodityTypes.map(commodity => (
            <div 
              key={commodity.id} 
              className={`relative border-2 rounded-lg p-4 cursor-pointer transition-all duration-200 ${
                selectedCommodities.includes(commodity.id) 
                  ? 'border-blue-500 bg-blue-50' 
                  : 'border-gray-200 bg-white hover:border-gray-300'
              } ${loggedInUser.role !== "Super Admin" ? 'opacity-60 cursor-not-allowed' : ''}`}
              onClick={() => loggedInUser.role === "Super Admin" && handleCommodityChange(commodity.id)}
            >
              <div className="flex items-start space-x-3">
                <span className="text-2xl">{commodity.icon}</span>
                <div className="flex-1">
                  <h4 className="font-medium text-gray-900">{commodity.label}</h4>
                  <p className="text-sm text-gray-500 mt-1">{commodity.description}</p>
                </div>
                <div className="flex-shrink-0">
                  <input
                    type="checkbox"
                    checked={selectedCommodities.includes(commodity.id)}
                    onChange={() => {}} // Handled by div onClick
                    disabled={loggedInUser.role !== "Super Admin"}
                    className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>
          ))}
        </div>

        {loggedInUser.role === "Super Admin" && (
          <>
            <div className="mb-4">
              <p className="text-sm text-gray-600">
                Selected: {selectedCommodities.length} of {commodityTypes.length} commodity types
              </p>
              {selectedCommodities.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {selectedCommodities.map(commodityId => {
                    const commodity = commodityTypes.find(c => c.id === commodityId);
                    return (
                      <span 
                        key={commodityId}
                        className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800"
                      >
                        {commodity?.icon} {commodity?.label}
                      </span>
                    );
                  })}
                </div>
              )}
            </div>
            
            <button 
              onClick={handleSaveCommodities} 
              disabled={isSavingCommodities || selectedCommodities.length === 0}
              className="bg-blue-500 hover:bg-blue-600 text-white font-medium py-2 px-4 rounded-md text-sm shadow-sm disabled:opacity-50 transition duration-150 ease-in-out"
            >
              {isSavingCommodities ? "Saving..." : "Save Commodity Types"}
            </button>
          </>
        )}
        
        {loggedInUser.role !== "Super Admin" && (
          <div className="bg-gray-50 border border-gray-200 rounded-md p-3">
            <p className="text-sm text-gray-600">
              Only Super Admins can configure commodity types. Current configuration: {selectedCommodities.length} types selected.
            </p>
          </div>
        )}
        
        {commoditySaveMessage.text && (
          <p className={`mt-2 text-sm ${commoditySaveMessage.type === 'success' ? 'text-green-600' : 'text-red-600'}`}>
            {commoditySaveMessage.text}
          </p>
        )}
      </section>

      {/* My Account Security */}
      {loggedInUser.role !== "Super Admin" ? (
        <section className="p-6 bg-white rounded-lg shadow">
          <h3 className="text-lg font-semibold text-gray-800 mb-1">My Account Security</h3>
          <p className="text-xs text-gray-500 mb-4">Update your password.</p>
          <form onSubmit={handlePasswordChange} className="space-y-4">
            <div><label htmlFor="currentPassword"  className="block text-sm font-medium text-gray-700">Current Password</label><input type="password" id="currentPassword" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm" /></div>
            <div><label htmlFor="newPassword"  className="block text-sm font-medium text-gray-700">New Password</label><input type="password" id="newPassword" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required minLength={6} className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm" /></div>
            <div><label htmlFor="confirmNewPassword"  className="block text-sm font-medium text-gray-700">Confirm New Password</label><input type="password" id="confirmNewPassword" value={confirmNewPassword} onChange={(e) => setConfirmNewPassword(e.target.value)} required minLength={6} className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm" /></div>
            {passwordChangeMessage.text && (<p className={`text-sm ${passwordChangeMessage.type === 'success' ? 'text-green-600' : 'text-red-600'}`}>{passwordChangeMessage.text}</p>)}
            <button
              type="submit"
              disabled={isPasswordUpdating}
              className="w-full bg-blue-500 hover:bg-blue-600 text-white font-medium py-2 px-4 rounded-md text-sm shadow-sm disabled:opacity-50 transition duration-150 ease-in-out"
            >
              {isPasswordUpdating ? "Updating..." : "Update Password"}
            </button>
          </form>
        </section>
      ) : (
         <section className="p-6 bg-white rounded-lg shadow"><h3 className="text-lg font-semibold text-gray-800 mb-1">My Account Security</h3><p className="text-sm text-gray-500">Super Admin password managed via Firebase Authentication console.</p></section>
      )}

      {/* Notification Preferences */}
      <section className="p-6 bg-white rounded-lg shadow">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">Notification Preferences</h3>
        <div className="space-y-3">
            {notificationPreferenceTypes.map(pref => {
                if ((pref.id === "emailOnNewInvite" || pref.id === "emailDailyReport") && !["Super Admin", "Admin"].includes(loggedInUser.role)) {
                    return null; 
                }
                return (
                    <div key={pref.id} className="flex items-center">
                        <input
                        type="checkbox"
                        id={pref.id}
                        name={pref.id}
                        checked={notificationPrefs[pref.id] || false}
                        onChange={handleNotificationPrefChange}
                        className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                        />
                        <label htmlFor={pref.id} className="ml-2 block text-sm text-gray-700">
                        {pref.label}
                        </label>
                    </div>
                );
            })}
        </div>
        <button
            onClick={handleSaveNotificationPrefs}
            disabled={isSavingNotifPrefs}
            className="mt-6 bg-blue-500 hover:bg-blue-600 text-white font-medium py-2 px-4 rounded-md text-sm shadow-sm disabled:opacity-50 transition duration-150 ease-in-out"
        >
            {isSavingNotifPrefs ? "Saving..." : "Save Notification Preferences"}
        </button>
        {notifPrefsSaveMessage.text && (
          <p className={`mt-2 text-sm ${notifPrefsSaveMessage.type === 'success' ? 'text-green-600' : 'text-red-600'}`}>
            {notifPrefsSaveMessage.text}
          </p>
        )}
      </section>

      {/* API Key Management (Super Admin Only) */}
      {loggedInUser.role === "Super Admin" && (
        <section className="p-6 bg-white rounded-lg shadow">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold text-gray-800">API Key Management</h3>
            <button onClick={openGenerateKeyModal} className="bg-green-500 hover:bg-green-600 text-white font-medium py-2 px-3 rounded-md text-sm shadow-sm flex items-center transition duration-150 ease-in-out">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-4 h-4 mr-2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
              Generate New API Key
            </button>
          </div>
          <p className="text-xs text-gray-500 mb-4">Generate API keys for external companies to access load status information for this tenant.</p>
          {apiKeys.length === 0 ? (
            <p className="text-sm text-gray-500">No API keys generated yet for this tenant.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50"><tr>
                  <th className="px-4 py-2 text-left font-medium text-gray-500">Company</th>
                  <th className="px-4 py-2 text-left font-medium text-gray-500">Key Prefix</th>
                  <th className="px-4 py-2 text-left font-medium text-gray-500">Description</th>
                  <th className="px-4 py-2 text-left font-medium text-gray-500">Created</th>
                  <th className="px-4 py-2 text-left font-medium text-gray-500">Status</th>
                  {/* UPDATED: Show Tenant column for Super Admin viewing all tenants */}
                  {loggedInUser.role === "Super Admin" && currentTenantId === "admin_tenant" && (
                    <th className="px-4 py-2 text-left font-medium text-gray-500">Tenant</th>
                  )}
                  <th className="px-4 py-2 text-left font-medium text-gray-500">Actions</th>
                </tr></thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {apiKeys.map(key => (
                    <tr key={key.id}>
                      <td className="px-4 py-2 whitespace-nowrap">{key.companyName || key.companyId}</td>
                      <td className="px-4 py-2 whitespace-nowrap font-mono">{key.keyPrefix}...</td>
                      <td className="px-4 py-2 whitespace-nowrap max-w-xs truncate" title={key.description}>{key.description}</td>
                      <td className="px-4 py-2 whitespace-nowrap">{key.createdAt?.toDate().toLocaleDateString()}</td>
                      <td className="px-4 py-2 whitespace-nowrap">
                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${key.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                          {key.status}
                        </span>
                      </td>
                      {/* UPDATED: Show tenant info for Super Admin viewing all tenants */}
                      {loggedInUser.role === "Super Admin" && currentTenantId === "admin_tenant" && (
                        <td className="px-4 py-2 whitespace-nowrap">
                          <span className="px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded">
                            {key.tenantId || 'No Tenant'}
                          </span>
                        </td>
                      )}
                      <td className="px-4 py-2 whitespace-nowrap space-x-2">
                        {key.status === 'active' && (<button onClick={() => handleRevokeApiKey(key.id)} className="text-yellow-600 hover:text-yellow-800">Revoke</button>)}
                        <button onClick={() => handleDeleteApiKey(key.id)} className="text-red-600 hover:text-red-800">Delete</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* Generate API Key Modal */}
      {showApiKeyModal && loggedInUser?.role === "Super Admin" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60 p-4">
          <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4">Generate New API Key</h3>
            {/* UPDATED: Show tenant info in modal */}
            <div className="mb-4 p-3 bg-gray-50 rounded-md">
              <p className="text-sm text-gray-600">
                <span className="font-medium">Tenant:</span> {currentTenantId}
              </p>
            </div>
            <form onSubmit={handleGenerateApiKey}>
              <div className="mb-4">
                <label htmlFor="companyIdApiKeyModal" className="block text-sm font-medium text-gray-700 mb-1">Assign to Company</label>
                <select id="companyIdApiKeyModal" name="companyId" value={newApiKeyData.companyId} onChange={handleApiKeyModalChange} required
                  className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md shadow-sm">
                  <option value="">Select a Company</option>
                  {companies.map(comp => (<option key={comp.id} value={comp.id}>{comp.name}</option>))}
                </select>
              </div>
              <div className="mb-4">
                <label htmlFor="descriptionApiKeyModal" className="block text-sm font-medium text-gray-700 mb-1">Description (Optional)</label>
                <input type="text" id="descriptionApiKeyModal" name="description" value={newApiKeyData.description} onChange={handleApiKeyModalChange}
                  className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm" />
              </div>
              {generatedKey && (
                <div className="mb-4 p-3 bg-yellow-50 border border-yellow-300 rounded-md">
                  <p className="text-sm font-medium text-yellow-800">New API Key Generated:</p>
                  <p className="text-xs text-yellow-700 mt-1 break-all font-mono">{generatedKey}</p>
                  <p className="text-xs text-red-600 mt-2 font-semibold">Please copy this key now. You will not be able to see it again.</p>
                </div>
              )}
              <div className="flex justify-end space-x-2 mt-6">
                <button type="button" onClick={() => { setShowApiKeyModal(false); setGeneratedKey(""); }} disabled={isGeneratingKey}
                  className="bg-gray-200 hover:bg-gray-300 text-gray-700 px-4 py-2 rounded-md text-sm">Cancel</button>
                <button type="submit" disabled={isGeneratingKey || !!generatedKey} 
                  className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md text-sm disabled:opacity-50">
                  {isGeneratingKey ? "Generating..." : "Generate Key"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}