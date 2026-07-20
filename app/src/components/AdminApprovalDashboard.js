import React, { useState, useEffect } from 'react';
import { db, auth, storage } from '../firebase';
import { collection, query, onSnapshot, orderBy, updateDoc, doc, serverTimestamp, where, addDoc, getDocs, getDoc, setDoc, arrayRemove } from 'firebase/firestore';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { onAuthStateChanged } from 'firebase/auth';
import { ref, deleteObject, listAll, getMetadata } from 'firebase/storage';

const AdminApprovalDashboard = () => {
  const [pendingRegistrations, setPendingRegistrations] = useState([]);
  const [approvedTenants, setApprovedTenants] = useState([]);
  const [rejectedTenants, setRejectedTenants] = useState([]);
  
  // Insurance verification states
  const [pendingInsurance, setPendingInsurance] = useState([]);
  const [approvedInsurance, setApprovedInsurance] = useState([]);
  const [expiredInsurance, setExpiredInsurance] = useState([]);
  const [selectedInsurance, setSelectedInsurance] = useState(null);
  const [insuranceModalOpen, setInsuranceModalOpen] = useState(false);
  
  // Document cleanup states
  const [oldDocuments, setOldDocuments] = useState([]);
  const [isLoadingDocuments, setIsLoadingDocuments] = useState(false);
  const [selectedDocuments, setSelectedDocuments] = useState([]);
  const [isDeletingDocuments, setIsDeletingDocuments] = useState(false);
  const [documentStats, setDocumentStats] = useState({ total: 0, dispatch: 0, gatePass: 0, totalSize: 0 });
  const [minAgeDays, setMinAgeDays] = useState(45);
  
  const [activeTab, setActiveTab] = useState('pending');
  const [activeSection, setActiveSection] = useState('tenants'); // 'tenants', 'insurance', or 'documents'
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);

  // Auth check
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setIsCheckingAuth(false);
    });
    return unsubscribe;
  }, []);

  // Firebase data loading - Tenant Registrations
  useEffect(() => {
    if (!isCheckingAuth && user && user.email === 'admin@loadmemo.com') {
      setIsLoading(true);
      
      const qPending = query(
        collection(db, 'tenant_registrations'), 
        where('status', '==', 'pending_approval'),
        orderBy('submittedAt', 'desc')
      );

      const qApproved = query(
        collection(db, 'tenant_registrations'), 
        where('status', '==', 'approved'),
        orderBy('submittedAt', 'desc')
      );

      const qRejected = query(
        collection(db, 'tenant_registrations'), 
        where('status', '==', 'rejected'),
        orderBy('submittedAt', 'desc')
      );

      const unsubPending = onSnapshot(qPending, (snapshot) => {
        const pendingData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setPendingRegistrations(pendingData);
        setIsLoading(false);
      });

      const unsubApproved = onSnapshot(qApproved, (snapshot) => {
        const approvedData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setApprovedTenants(approvedData);
      });

      const unsubRejected = onSnapshot(qRejected, (snapshot) => {
        const rejectedData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setRejectedTenants(rejectedData);
      });

      return () => {
        unsubPending();
        unsubApproved();
        unsubRejected();
      };
    }
  }, [isCheckingAuth, user]);

  // Firebase data loading - Insurance Verifications
  useEffect(() => {
    if (!isCheckingAuth && user && user.email === 'admin@loadmemo.com') {
      const now = new Date();
      
      // Pending insurance
      const qPendingIns = query(
        collection(db, 'carrierInsuranceVerifications'),
        where('status', '==', 'pending'),
        orderBy('createdAt', 'desc')
      );

      // Approved insurance
      const qApprovedIns = query(
        collection(db, 'carrierInsuranceVerifications'),
        where('status', '==', 'approved'),
        orderBy('verifiedAt', 'desc')
      );

      // Rejected insurance
      const qRejectedIns = query(
        collection(db, 'carrierInsuranceVerifications'),
        where('status', '==', 'rejected'),
        orderBy('updatedAt', 'desc')
      );

      const unsubPendingIns = onSnapshot(qPendingIns, (snapshot) => {
        const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setPendingInsurance(data);
      });

      const unsubApprovedIns = onSnapshot(qApprovedIns, (snapshot) => {
        const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        // Separate expired from approved
        const approved = [];
        const expired = [];
        data.forEach(item => {
          if (item.expiresAt && item.expiresAt.toDate() < now) {
            expired.push({ ...item, status: 'expired' });
          } else {
            approved.push(item);
          }
        });
        setApprovedInsurance(approved);
        setExpiredInsurance(prev => [...expired, ...prev.filter(e => !data.find(d => d.id === e.id))]);
      });

      const unsubRejectedIns = onSnapshot(qRejectedIns, (snapshot) => {
        const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        // Add rejected to expired for display purposes
        setExpiredInsurance(prev => {
          const existingIds = prev.map(e => e.id);
          const newRejected = data.filter(d => !existingIds.includes(d.id));
          return [...prev.filter(e => e.status === 'expired'), ...data];
        });
      });

      return () => {
        unsubPendingIns();
        unsubApprovedIns();
        unsubRejectedIns();
      };
    }
  }, [isCheckingAuth, user]);

  // ============================================
  // DOCUMENT CLEANUP FUNCTIONS
  // ============================================
  
  const scanForOldDocuments = async () => {
  if (!user || user.email !== 'admin@loadmemo.com') return;
  
  setIsLoadingDocuments(true);
  setOldDocuments([]);
  setSelectedDocuments([]);
  
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - minAgeDays);
    
    console.log(`🔍 Scanning for documents older than ${minAgeDays} days (before ${cutoffDate.toLocaleDateString()})`);
    
    const foundDocuments = [];
    let dispatchCount = 0;
    let gatePassCount = 0;
    let totalSize = 0;
    
    // Query all loads from Firestore
    const loadsSnapshot = await getDocs(collection(db, 'loads'));
    
    for (const loadDoc of loadsSnapshot.docs) {
      const loadData = loadDoc.data();
      const loadId = loadData.load_id || loadDoc.id;
      
      // Check dispatchDocuments array
      if (loadData.dispatchDocuments && Array.isArray(loadData.dispatchDocuments)) {
        for (const docItem of loadData.dispatchDocuments) {
          if (!docItem.uploadedAt || !docItem.storagePath) continue;
          
          const uploadedAt = new Date(docItem.uploadedAt);
          if (uploadedAt < cutoffDate) {
            const ageInDays = Math.floor((new Date() - uploadedAt) / (1000 * 60 * 60 * 24));
            foundDocuments.push({
              id: `${loadDoc.id}_dispatch_${docItem.storagePath}`,
              loadDocId: loadDoc.id,
              loadId: loadId,
              name: docItem.fileName || 'Unknown',
              path: docItem.storagePath,
              type: 'dispatch',
              size: docItem.size || 0,
              createdAt: uploadedAt,
              ageInDays: ageInDays,
              url: docItem.url,
              docData: docItem,
              fieldName: 'dispatchDocuments'
            });
            dispatchCount++;
            totalSize += docItem.size || 0;
          }
        }
      }
      
      // Check gatePassDocuments array
      if (loadData.gatePassDocuments && Array.isArray(loadData.gatePassDocuments)) {
        for (const docItem of loadData.gatePassDocuments) {
          if (!docItem.uploadedAt || !docItem.storagePath) continue;
          
          const uploadedAt = new Date(docItem.uploadedAt);
          if (uploadedAt < cutoffDate) {
            const ageInDays = Math.floor((new Date() - uploadedAt) / (1000 * 60 * 60 * 24));
            foundDocuments.push({
              id: `${loadDoc.id}_gatepass_${docItem.storagePath}`,
              loadDocId: loadDoc.id,
              loadId: loadId,
              name: docItem.fileName || 'Unknown',
              path: docItem.storagePath,
              type: 'gatePass',
              size: docItem.size || 0,
              createdAt: uploadedAt,
              ageInDays: ageInDays,
              url: docItem.url,
              docData: docItem,
              fieldName: 'gatePassDocuments'
            });
            gatePassCount++;
            totalSize += docItem.size || 0;
          }
        }
      }
    }
    
    // Sort by age (oldest first)
    foundDocuments.sort((a, b) => b.ageInDays - a.ageInDays);
    
    setOldDocuments(foundDocuments);
    setDocumentStats({
      total: foundDocuments.length,
      dispatch: dispatchCount,
      gatePass: gatePassCount,
      totalSize: totalSize
    });
    
    console.log(`✅ Found ${foundDocuments.length} documents older than ${minAgeDays} days`);
    
  } catch (error) {
    console.error('❌ Error scanning for old documents:', error);
    alert('Error scanning documents: ' + error.message);
  } finally {
    setIsLoadingDocuments(false);
  }
};  
  const handleSelectDocument = (docId) => {
    setSelectedDocuments(prev => {
      if (prev.includes(docId)) {
        return prev.filter(id => id !== docId);
      } else {
        return [...prev, docId];
      }
    });
  };
  
  const handleSelectAll = () => {
    if (selectedDocuments.length === oldDocuments.length) {
      setSelectedDocuments([]);
    } else {
      setSelectedDocuments(oldDocuments.map(d => d.id));
    }
  };
  
  const handleDeleteSelectedDocuments = async () => {
  if (selectedDocuments.length === 0) {
    alert('No documents selected');
    return;
  }
  
  const confirmMsg = `Are you sure you want to permanently delete ${selectedDocuments.length} document(s)?\n\nThis will:\n1. Delete files from Firebase Storage\n2. Remove references from Firestore load documents\n\nThis action cannot be undone!`;
  if (!window.confirm(confirmMsg)) return;
  
  setIsDeletingDocuments(true);
  
  let successCount = 0;
  let errorCount = 0;
  const errors = [];
  
  for (const docId of selectedDocuments) {
    const docToDelete = oldDocuments.find(d => d.id === docId);
    if (!docToDelete) continue;
    
    try {
      // Step 1: Delete from Firebase Storage
      const storageRef = ref(storage, docToDelete.path);
      await deleteObject(storageRef);
      console.log(`✅ Deleted from storage: ${docToDelete.path}`);
      
      // Step 2: Remove reference from Firestore load document
      const loadRef = doc(db, 'loads', docToDelete.loadDocId);
      await updateDoc(loadRef, {
        [docToDelete.fieldName]: arrayRemove(docToDelete.docData),
        updatedAt: serverTimestamp()
      });
      console.log(`✅ Removed from Firestore: ${docToDelete.loadId}`);
      
      successCount++;
    } catch (error) {
      errorCount++;
      errors.push({ path: docToDelete.path, loadId: docToDelete.loadId, error: error.message });
      console.error(`❌ Failed to delete: ${docToDelete.path}`, error);
    }
  }
  
  // Log the cleanup action
  try {
    await addDoc(collection(db, 'auditLogs'), {
      userId: user.uid,
      userEmail: user.email,
      action: 'DOCUMENTS_CLEANUP',
      targetType: 'storage',
      targetId: 'bulk_delete',
      details: {
        successCount,
        errorCount,
        totalAttempted: selectedDocuments.length,
        minAgeDays,
        errors: errors.length > 0 ? errors.slice(0, 10) : undefined
      },
      timestamp: serverTimestamp()
    });
  } catch (auditError) {
    console.warn('Audit log failed:', auditError);
  }
  
  setIsDeletingDocuments(false);
  
  if (errorCount > 0) {
    alert(`Deleted ${successCount} documents.\n${errorCount} documents failed to delete.`);
  } else {
    alert(`Successfully deleted ${successCount} documents.`);
  }
  
  // Refresh the document list
  await scanForOldDocuments();
};  
  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Permission check
  if (isCheckingAuth) {

    
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Checking permissions...</p>
        </div>
      </div>
    );
  }

  if (!user || user.email !== 'admin@loadmemo.com') {
   
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="max-w-md w-full text-center">
          <div className="text-red-500 text-6xl mb-4">🚫</div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Access Denied</h2>
          <p className="text-gray-600 mb-4">
            This page is restricted to admin@loadmemo.com only.
          </p>
          <div className="bg-gray-100 rounded-lg p-4">
            <p className="text-sm text-gray-500">
              Current user: <span className="font-mono">{user?.email || 'Not logged in'}</span>
            </p>
          </div>
          
          <button 
            onClick={() => window.history.back()} 
            className="mt-4 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  // ============================================
  // TENANT HANDLERS
  // ============================================
  const handleApprove = async (registration) => {
    try {
      console.log('🟢 Starting complete approval for:', registration.adminEmail);
      
// Generate unique tenantId: company prefix + random string
const companyPrefix = registration.companyName
  .toLowerCase()
  .replace(/[^a-z0-9]/g, '')
  .substring(0, 10); // First 10 chars of company name
const uniqueSuffix = Math.random().toString(36).substring(2, 8); // 6 random chars
const tenantId = `${companyPrefix}_${uniqueSuffix}`;
// Check if tenantId already exists (extra safety)
const existingTenant = await getDoc(doc(db, 'tenants', tenantId));
if (existingTenant.exists()) {
  alert('Tenant ID collision detected. Please try again.');
  return;
}
      let userUid = null;
      
      const currentAdminUser = auth.currentUser;
      
     // User was already created during registration - just find their UID
const existingUserQuery = query(
  collection(db, 'users'), 
  where('email', '==', registration.adminEmail.toLowerCase().trim())
);
const userSnapshot = await getDocs(existingUserQuery);

if (!userSnapshot.empty) {
  userUid = userSnapshot.docs[0].id;
  console.log('✅ Found existing user:', userUid);
  
  // Update the existing user document
  await updateDoc(doc(db, 'users', userUid), {
    role: 'Super Admin',
    active: true,
    status: 'approved',
    tenantId: tenantId,
    companyName: registration.companyName,
    updatedAt: serverTimestamp()
  });
  console.log('✅ User profile updated');
  
} else {
  throw new Error('User not found. Registration may have failed.');
}
      
      const trialEndDate = new Date();
      trialEndDate.setDate(trialEndDate.getDate() + 30);
      
      await setDoc(doc(db, 'tenants', tenantId), {
        id: tenantId,
        companyName: registration.companyName,
        domain: registration.domain || `${tenantId}.loadmemo.com`,
        owner: {
          name: registration.contactName,
          email: registration.adminEmail,
          role: 'Super Admin'
        },
        billing: {
          plan: null,
          status: 'trial',
          nextBillingDate: null,
          trialEndsAt: trialEndDate,
          createdAt: serverTimestamp()
        },
        settings: {
          timezone: registration.timezone || 'America/New_York',
          dateFormat: 'MM/dd/yyyy',
          currency: 'USD'
        },
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy: userUid || 'system',
        registrationId: registration.id
      });
      console.log('✅ Tenant document created');
      
      await updateDoc(doc(db, 'tenant_registrations', registration.id), {
        status: 'approved',
        approvedAt: serverTimestamp(),
        tenantId: tenantId,
        userUid: userUid
      });
      console.log('✅ Registration status updated');
      
      try {
        await addDoc(collection(db, 'auditLogs'), {
          userId: userUid,
          userEmail: registration.adminEmail,
          action: 'TENANT_APPROVED',
          targetType: 'tenant',
          targetId: tenantId,
          details: {
            companyName: registration.companyName,
            adminEmail: registration.adminEmail,
            registrationId: registration.id
          },
          tenantId: tenantId,
          timestamp: serverTimestamp()
        });
      } catch (auditError) {
        console.warn('⚠️ Audit log creation failed (non-critical):', auditError);
      }
      
      alert(`✅ SUCCESS!\n\nTenant approved: ${registration.companyName}\nAdmin: ${registration.contactName}\nEmail: ${registration.adminEmail}\nTenant ID: ${tenantId}`);
      
    } catch (error) {
      console.error('❌ Approval failed:', error);
      alert(`Failed to approve tenant: ${error.message}`);
    }
  };

  const handleReject = async (registration, reason = 'Not specified') => {
    try {
      await updateDoc(doc(db, 'tenant_registrations', registration.id), {
        status: 'rejected',
        rejectedAt: serverTimestamp(),
        rejectionReason: reason
      });
      
      try {
        await addDoc(collection(db, 'auditLogs'), {
          userId: user.uid,
          userEmail: user.email,
          action: 'TENANT_REJECTED',
          targetType: 'tenant_registration',
          targetId: registration.id,
          details: {
            companyName: registration.companyName,
            adminEmail: registration.adminEmail,
            rejectionReason: reason
          },
          tenantId: null,
          timestamp: serverTimestamp()
        });
      } catch (auditError) {
        console.warn('⚠️ Rejection audit log failed:', auditError);
      }
      
    } catch (error) {
      console.error('Error rejecting tenant:', error);
      alert('Failed to reject tenant: ' + error.message);
    }
  };

  // ============================================
  // INSURANCE HANDLERS
  // ============================================
  const handleApproveInsurance = async (insurance, expirationDate) => {
    try {
      const expDate = new Date(expirationDate);
      
      await updateDoc(doc(db, 'carrierInsuranceVerifications', insurance.id), {
        status: 'approved',
        verifiedBy: user.uid,
        verifiedByEmail: user.email,
        verifiedAt: serverTimestamp(),
        expiresAt: expDate,
        updatedAt: serverTimestamp()
      });

      // Create notification for carrier
      try {
        await addDoc(collection(db, 'liveLoadNotifications'), {
          userId: insurance.carrierId,
          type: 'insurance_approved',
          title: 'Insurance Verified!',
          message: `Your insurance has been verified. You can now bid on LiveLoad shipments. Expires: ${expDate.toLocaleDateString()}`,
          read: false,
          createdAt: serverTimestamp()
        });
      } catch (notifError) {
        console.warn('Notification failed:', notifError);
      }

      // Audit log
      try {
        await addDoc(collection(db, 'auditLogs'), {
          userId: user.uid,
          userEmail: user.email,
          action: 'INSURANCE_APPROVED',
          targetType: 'carrier_insurance',
          targetId: insurance.id,
          details: {
            carrierId: insurance.carrierId,
            companyName: insurance.companyName,
            expiresAt: expDate.toISOString()
          },
          timestamp: serverTimestamp()
        });
      } catch (auditError) {
        console.warn('Audit log failed:', auditError);
      }

      setInsuranceModalOpen(false);
      setSelectedInsurance(null);
      alert(`✅ Insurance approved for ${insurance.companyName}`);
      
    } catch (error) {
      console.error('Error approving insurance:', error);
      alert('Failed to approve insurance: ' + error.message);
    }
  };

  const handleRejectInsurance = async (insurance, reason) => {
    try {
      await updateDoc(doc(db, 'carrierInsuranceVerifications', insurance.id), {
        status: 'rejected',
        rejectedBy: user.uid,
        rejectedByEmail: user.email,
        rejectedAt: serverTimestamp(),
        rejectionReason: reason,
        updatedAt: serverTimestamp()
      });

      // Create notification for carrier
      try {
        await addDoc(collection(db, 'liveLoadNotifications'), {
          userId: insurance.carrierId,
          type: 'insurance_rejected',
          title: 'Insurance Verification Failed',
          message: `Your insurance verification was rejected. Reason: ${reason}. Please upload valid documentation.`,
          read: false,
          createdAt: serverTimestamp()
        });
      } catch (notifError) {
        console.warn('Notification failed:', notifError);
      }

      setInsuranceModalOpen(false);
      setSelectedInsurance(null);
      alert(`Insurance rejected for ${insurance.companyName}`);
      
    } catch (error) {
      console.error('Error rejecting insurance:', error);
      alert('Failed to reject insurance: ' + error.message);
    }
  };

  // ============================================
  // HELPERS
  // ============================================
  const formatDate = (dateString) => {
    if (dateString && dateString.toDate) {
      return dateString.toDate().toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    }
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatShortDate = (dateString) => {
    if (dateString && dateString.toDate) {
      return dateString.toDate().toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
    }
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const getDaysUntilExpiration = (expiresAt) => {
    if (!expiresAt) return null;
    const expDate = expiresAt.toDate ? expiresAt.toDate() : new Date(expiresAt);
    const now = new Date();
    const diffTime = expDate - now;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  // ============================================
  // COMPONENTS
  // ============================================
  const RegistrationCard = ({ registration, showActions = false }) => (
    <div className="bg-white rounded-lg border border-gray-200 p-6 mb-4 hover:shadow-md transition-shadow">
      <div className="flex justify-between items-start mb-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">{registration.companyName}</h3>
          <p className="text-sm text-gray-600">Contact: {registration.contactName}</p>
        </div>
        <div className="text-right">
          <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
            registration.status === 'pending_approval' ? 'bg-yellow-100 text-yellow-800' :
            registration.status === 'approved' ? 'bg-green-100 text-green-800' :
            'bg-red-100 text-red-800'
          }`}>
            {registration.status.replace('_', ' ').toUpperCase()}
          </span>
        </div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <div>
          <p className="text-sm text-gray-600">Email: {registration.adminEmail}</p>
          <p className="text-sm text-gray-600">Phone: {registration.phone || 'Not provided'}</p>
          {registration.domain && (
            <p className="text-sm text-gray-600">Domain: {registration.domain}</p>
          )}
        </div>
        <div>
          <p className="text-sm text-gray-600">Submitted: {formatDate(registration.submittedAt)}</p>
          {registration.tenantId && (
            <p className="text-sm text-gray-600">Tenant ID: {registration.tenantId}</p>
          )}
        </div>
      </div>
      
      {registration.rejectionReason && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
          <p className="text-sm text-red-700">
            <strong>Rejection Reason:</strong> {registration.rejectionReason}
          </p>
        </div>
      )}
      
      {showActions && (
        <div className="flex gap-3">
          <button
            onClick={() => handleApprove(registration)}
            className="flex-1 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors"
          >
            ✅ Approve & Create Tenant
          </button>
          <button
            onClick={() => {
              const reason = prompt("Please enter a reason for rejection:", "");
              if (reason !== null) {
                handleReject(registration, reason || 'No reason provided');
              }
            }}
            className="flex-1 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors"
          >
            ❌ Reject
          </button>
        </div>
      )}
    </div>
  );

  const InsuranceCard = ({ insurance, showActions = false }) => {
    const daysUntil = getDaysUntilExpiration(insurance.expiresAt);
    const isExpiringSoon = daysUntil !== null && daysUntil <= 30 && daysUntil > 0;
    const isExpired = daysUntil !== null && daysUntil <= 0;

    return (
      <div className={`bg-white rounded-lg border p-6 mb-4 hover:shadow-md transition-shadow ${
        isExpired ? 'border-red-300 bg-red-50' : 
        isExpiringSoon ? 'border-yellow-300 bg-yellow-50' : 
        'border-gray-200'
      }`}>
        <div className="flex justify-between items-start mb-4">
          <div className="flex items-center gap-3">
            <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
              insurance.status === 'pending' ? 'bg-yellow-100' :
              insurance.status === 'approved' ? 'bg-green-100' :
              'bg-red-100'
            }`}>
              <span className="text-xl">
                {insurance.status === 'pending' ? '⏳' :
                 insurance.status === 'approved' ? '✅' : '❌'}
              </span>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">{insurance.companyName}</h3>
              <p className="text-sm text-gray-500">
                {insurance.mcNumber || insurance.dotNumber || 'No MC/DOT'}
              </p>
            </div>
          </div>
          <div className="text-right">
            <span className={`inline-flex px-3 py-1 text-xs font-semibold rounded-full ${
              insurance.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
              insurance.status === 'approved' ? 'bg-green-100 text-green-800' :
              insurance.status === 'rejected' ? 'bg-red-100 text-red-800' :
              'bg-gray-100 text-gray-800'
            }`}>
              {insurance.status?.toUpperCase()}
            </span>
            {isExpiringSoon && !isExpired && (
              <p className="text-xs text-yellow-600 mt-1 font-medium">
                ⚠️ Expires in {daysUntil} days
              </p>
            )}
            {isExpired && (
              <p className="text-xs text-red-600 mt-1 font-medium">
                🚫 Expired
              </p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wide">Contact</p>
            <p className="text-sm text-gray-900">{insurance.contactName || 'N/A'}</p>
            <p className="text-sm text-gray-600">{insurance.email}</p>
            <p className="text-sm text-gray-600">{insurance.phone || 'No phone'}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wide">Insurance Details</p>
            <p className="text-sm text-gray-900">{insurance.insuranceProvider || 'N/A'}</p>
            <p className="text-sm text-gray-600">Policy: {insurance.policyNumber || 'N/A'}</p>
            <p className="text-sm text-gray-600">
              Coverage: {insurance.coverageAmount ? `$${insurance.coverageAmount.toLocaleString()}` : 'N/A'}
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wide">Dates</p>
            <p className="text-sm text-gray-600">
              Submitted: {formatShortDate(insurance.createdAt)}
            </p>
            {insurance.verifiedAt && (
              <p className="text-sm text-gray-600">
                Verified: {formatShortDate(insurance.verifiedAt)}
              </p>
            )}
            {insurance.expiresAt && (
              <p className={`text-sm font-medium ${isExpired ? 'text-red-600' : isExpiringSoon ? 'text-yellow-600' : 'text-gray-600'}`}>
                Expires: {formatShortDate(insurance.expiresAt)}
              </p>
            )}
          </div>
        </div>

        {insurance.documentUrl && (
          <div className="mb-4">
            <a 
              href={insurance.documentUrl} 
              target="_blank" 
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              View Insurance Document
            </a>
          </div>
        )}

        {insurance.rejectionReason && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
            <p className="text-sm text-red-700">
              <strong>Rejection Reason:</strong> {insurance.rejectionReason}
            </p>
          </div>
        )}

        {showActions && (
          <div className="flex gap-3 pt-4 border-t border-gray-200">
            <button
              onClick={() => {
                setSelectedInsurance(insurance);
                setInsuranceModalOpen(true);
              }}
              className="flex-1 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors"
            >
              ✅ Review & Approve
            </button>
            <button
              onClick={() => {
                const reason = prompt("Please enter a reason for rejection:", "");
                if (reason !== null && reason.trim()) {
                  handleRejectInsurance(insurance, reason);
                }
              }}
              className="flex-1 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors"
            >
              ❌ Reject
            </button>
          </div>
        )}
      </div>
    );
  };

  // Insurance Approval Modal
  const InsuranceApprovalModal = () => {
    const [expirationDate, setExpirationDate] = useState('');
    
    // Set default expiration to 1 year from now
    useEffect(() => {
      const oneYearFromNow = new Date();
      oneYearFromNow.setFullYear(oneYearFromNow.getFullYear() + 1);
      setExpirationDate(oneYearFromNow.toISOString().split('T')[0]);
    }, [selectedInsurance]);

    if (!insuranceModalOpen || !selectedInsurance) return null;

    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
          <div className="p-6 border-b border-gray-200">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-bold text-gray-900">Review Insurance</h2>
              <button 
                onClick={() => {
                  setInsuranceModalOpen(false);
                  setSelectedInsurance(null);
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          <div className="p-6">
            {/* Company Info */}
            <div className="bg-gray-50 rounded-lg p-4 mb-6">
              <h3 className="font-semibold text-gray-900 mb-2">{selectedInsurance.companyName}</h3>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-gray-500">MC/DOT Number</p>
                  <p className="font-medium">{selectedInsurance.mcNumber || selectedInsurance.dotNumber || 'N/A'}</p>
                </div>
                <div>
                  <p className="text-gray-500">Contact</p>
                  <p className="font-medium">{selectedInsurance.contactName || 'N/A'}</p>
                </div>
                <div>
                  <p className="text-gray-500">Email</p>
                  <p className="font-medium">{selectedInsurance.email}</p>
                </div>
                <div>
                  <p className="text-gray-500">Phone</p>
                  <p className="font-medium">{selectedInsurance.phone || 'N/A'}</p>
                </div>
              </div>
            </div>

            {/* Insurance Details */}
            <div className="bg-blue-50 rounded-lg p-4 mb-6">
              <h4 className="font-semibold text-blue-900 mb-2">Insurance Information</h4>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-blue-700">Provider</p>
                  <p className="font-medium text-blue-900">{selectedInsurance.insuranceProvider || 'N/A'}</p>
                </div>
                <div>
                  <p className="text-blue-700">Policy Number</p>
                  <p className="font-medium text-blue-900">{selectedInsurance.policyNumber || 'N/A'}</p>
                </div>
                <div>
                  <p className="text-blue-700">Coverage Amount</p>
                  <p className="font-medium text-blue-900">
                    {selectedInsurance.coverageAmount ? `$${selectedInsurance.coverageAmount.toLocaleString()}` : 'N/A'}
                  </p>
                </div>
                <div>
                  <p className="text-blue-700">Submitted</p>
                  <p className="font-medium text-blue-900">{formatShortDate(selectedInsurance.createdAt)}</p>
                </div>
              </div>
            </div>

            {/* Document Preview */}
            {selectedInsurance.documentUrl && (
              <div className="mb-6">
                <h4 className="font-semibold text-gray-900 mb-2">Uploaded Document</h4>
                <a 
                  href={selectedInsurance.documentUrl} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-3 rounded-lg transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  View Certificate of Insurance (COI)
                </a>
              </div>
            )}

            {/* Expiration Date */}
            <div className="mb-6">
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Insurance Expiration Date *
              </label>
              <input
                type="date"
                value={expirationDate}
                onChange={(e) => setExpirationDate(e.target.value)}
                min={new Date().toISOString().split('T')[0]}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              <p className="text-xs text-gray-500 mt-1">
                Set based on the expiration date shown on the COI document
              </p>
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              <button
                onClick={() => {
                  if (!expirationDate) {
                    alert('Please set an expiration date');
                    return;
                  }
                  handleApproveInsurance(selectedInsurance, expirationDate);
                }}
                className="flex-1 bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-lg font-semibold transition-colors"
              >
                ✅ Approve Insurance
              </button>
              <button
                onClick={() => {
                  const reason = prompt("Please enter a reason for rejection:", "");
                  if (reason !== null && reason.trim()) {
                    handleRejectInsurance(selectedInsurance, reason);
                  }
                }}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white px-6 py-3 rounded-lg font-semibold transition-colors"
              >
                ❌ Reject
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  const tenantCounts = {
    pending: pendingRegistrations.length,
    approved: approvedTenants.length,
    rejected: rejectedTenants.length
  };

  const insuranceCounts = {
    pending: pendingInsurance.length,
    approved: approvedInsurance.length,
    expired: expiredInsurance.length
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Admin Dashboard</h1>
          <p className="mt-2 text-gray-600">Manage tenants, carrier insurance verifications, and storage cleanup</p>
        </div>

        {/* Section Toggle */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-1 mb-6 inline-flex flex-wrap">
          <button
            onClick={() => { setActiveSection('tenants'); setActiveTab('pending'); }}
            className={`px-6 py-3 rounded-lg font-medium transition-all ${
              activeSection === 'tenants' 
                ? 'bg-blue-600 text-white shadow-md' 
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            <span className="flex items-center gap-2">
              🏢 Tenant Management
              {tenantCounts.pending > 0 && (
                <span className={`px-2 py-0.5 rounded-full text-xs ${
                  activeSection === 'tenants' ? 'bg-blue-500 text-white' : 'bg-yellow-100 text-yellow-800'
                }`}>
                  {tenantCounts.pending}
                </span>
              )}
            </span>
          </button>
          <button
            onClick={() => { setActiveSection('insurance'); setActiveTab('pending'); }}
            className={`px-6 py-3 rounded-lg font-medium transition-all ${
              activeSection === 'insurance' 
                ? 'bg-orange-600 text-white shadow-md' 
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            <span className="flex items-center gap-2">
              🛡️ Insurance Verification
              {insuranceCounts.pending > 0 && (
                <span className={`px-2 py-0.5 rounded-full text-xs ${
                  activeSection === 'insurance' ? 'bg-orange-500 text-white' : 'bg-yellow-100 text-yellow-800'
                }`}>
                  {insuranceCounts.pending}
                </span>
              )}
            </span>
          </button>
          <button
            onClick={() => { setActiveSection('documents'); }}
            className={`px-6 py-3 rounded-lg font-medium transition-all ${
              activeSection === 'documents' 
                ? 'bg-purple-600 text-white shadow-md' 
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            <span className="flex items-center gap-2">
              🗑️ Document Cleanup
            </span>
          </button>
        </div>

        {/* Stats Cards */}
        {activeSection === 'tenants' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">Pending Approval</p>
                  <p className="text-3xl font-bold text-yellow-600">{tenantCounts.pending}</p>
                </div>
                <div className="w-12 h-12 bg-yellow-100 rounded-full flex items-center justify-center">
                  <span className="text-2xl">⏳</span>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">Approved Tenants</p>
                  <p className="text-3xl font-bold text-green-600">{tenantCounts.approved}</p>
                </div>
                <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
                  <span className="text-2xl">✅</span>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">Rejected</p>
                  <p className="text-3xl font-bold text-red-600">{tenantCounts.rejected}</p>
                </div>
                <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
                  <span className="text-2xl">❌</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeSection === 'insurance' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">Pending Review</p>
                  <p className="text-3xl font-bold text-yellow-600">{insuranceCounts.pending}</p>
                </div>
                <div className="w-12 h-12 bg-yellow-100 rounded-full flex items-center justify-center">
                  <span className="text-2xl">⏳</span>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">Verified Carriers</p>
                  <p className="text-3xl font-bold text-green-600">{insuranceCounts.approved}</p>
                </div>
                <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
                  <span className="text-2xl">✅</span>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">Expired / Rejected</p>
                  <p className="text-3xl font-bold text-red-600">{insuranceCounts.expired}</p>
                </div>
                <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
                  <span className="text-2xl">⚠️</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeSection === 'documents' && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">Total Old Documents</p>
                  <p className="text-3xl font-bold text-purple-600">{documentStats.total}</p>
                </div>
                <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center">
                  <span className="text-2xl">📄</span>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">Dispatch Sheets</p>
                  <p className="text-3xl font-bold text-blue-600">{documentStats.dispatch}</p>
                </div>
                <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                  <span className="text-2xl">📋</span>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">Gate Passes</p>
                  <p className="text-3xl font-bold text-green-600">{documentStats.gatePass}</p>
                </div>
                <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
                  <span className="text-2xl">🎫</span>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">Total Size</p>
                  <p className="text-3xl font-bold text-orange-600">{formatFileSize(documentStats.totalSize)}</p>
                </div>
                <div className="w-12 h-12 bg-orange-100 rounded-full flex items-center justify-center">
                  <span className="text-2xl">💾</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab Navigation */}
        {activeSection !== 'documents' && (
          <div className="border-b border-gray-200 mb-6">
            <nav className="-mb-px flex space-x-8">
              {activeSection === 'tenants' ? (
                <>
                  {[
                    { key: 'pending', label: 'Pending', count: tenantCounts.pending, icon: '⏳' },
                    { key: 'approved', label: 'Approved', count: tenantCounts.approved, icon: '✅' },
                    { key: 'rejected', label: 'Rejected', count: tenantCounts.rejected, icon: '❌' }
                  ].map(tab => (
                    <button
                      key={tab.key}
                      onClick={() => setActiveTab(tab.key)}
                      className={`py-3 px-1 border-b-2 font-medium text-sm flex items-center gap-2 ${
                        activeTab === tab.key
                          ? 'border-blue-500 text-blue-600'
                          : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                      }`}
                    >
                      <span>{tab.icon}</span>
                      {tab.label}
                      {tab.count > 0 && (
                        <span className={`py-0.5 px-2 rounded-full text-xs ${
                          activeTab === tab.key ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-600'
                        }`}>
                          {tab.count}
                        </span>
                      )}
                    </button>
                  ))}
                </>
              ) : (
                <>
                  {[
                    { key: 'pending', label: 'Pending Review', count: insuranceCounts.pending, icon: '⏳' },
                    { key: 'approved', label: 'Verified', count: insuranceCounts.approved, icon: '✅' },
                    { key: 'expired', label: 'Expired/Rejected', count: insuranceCounts.expired, icon: '⚠️' }
                  ].map(tab => (
                    <button
                      key={tab.key}
                      onClick={() => setActiveTab(tab.key)}
                      className={`py-3 px-1 border-b-2 font-medium text-sm flex items-center gap-2 ${
                        activeTab === tab.key
                          ? 'border-orange-500 text-orange-600'
                          : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                      }`}
                    >
                      <span>{tab.icon}</span>
                      {tab.label}
                      {tab.count > 0 && (
                        <span className={`py-0.5 px-2 rounded-full text-xs ${
                          activeTab === tab.key ? 'bg-orange-100 text-orange-600' : 'bg-gray-100 text-gray-600'
                        }`}>
                          {tab.count}
                        </span>
                      )}
                    </button>
                  ))}
                </>
              )}
            </nav>
          </div>
        )}

        {/* Content */}
        <div className="space-y-6">
          {/* Tenant Section */}
          {activeSection === 'tenants' && (
            <>
              {activeTab === 'pending' && (
                <div>
                  {pendingRegistrations.length === 0 ? (
                    <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
                      <div className="text-gray-400 text-4xl mb-4">📋</div>
                      <p className="text-gray-500">No pending registrations</p>
                    </div>
                  ) : (
                    pendingRegistrations.map(registration => (
                      <RegistrationCard 
                        key={registration.id} 
                        registration={registration} 
                        showActions={true}
                      />
                    ))
                  )}
                </div>
              )}

              {activeTab === 'approved' && (
                <div>
                  {approvedTenants.length === 0 ? (
                    <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
                      <div className="text-gray-400 text-4xl mb-4">✅</div>
                      <p className="text-gray-500">No approved tenants yet</p>
                    </div>
                  ) : (
                    approvedTenants.map(tenant => (
                      <RegistrationCard 
                        key={tenant.id} 
                        registration={tenant} 
                        showActions={false}
                      />
                    ))
                  )}
                </div>
              )}

              {activeTab === 'rejected' && (
                <div>
                  {rejectedTenants.length === 0 ? (
                    <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
                      <div className="text-gray-400 text-4xl mb-4">❌</div>
                      <p className="text-gray-500">No rejected applications</p>
                    </div>
                  ) : (
                    rejectedTenants.map(tenant => (
                      <RegistrationCard 
                        key={tenant.id} 
                        registration={tenant} 
                        showActions={false}
                      />
                    ))
                  )}
                </div>
              )}
            </>
          )}

          {/* Insurance Section */}
          {activeSection === 'insurance' && (
            <>
              {activeTab === 'pending' && (
                <div>
                  {pendingInsurance.length === 0 ? (
                    <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
                      <div className="text-gray-400 text-4xl mb-4">🛡️</div>
                      <p className="text-gray-500">No pending insurance verifications</p>
                      <p className="text-gray-400 text-sm mt-2">Carriers will appear here when they submit insurance documents</p>
                    </div>
                  ) : (
                    pendingInsurance.map(insurance => (
                      <InsuranceCard 
                        key={insurance.id} 
                        insurance={insurance} 
                        showActions={true}
                      />
                    ))
                  )}
                </div>
              )}

              {activeTab === 'approved' && (
                <div>
                  {approvedInsurance.length === 0 ? (
                    <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
                      <div className="text-gray-400 text-4xl mb-4">✅</div>
                      <p className="text-gray-500">No verified carriers yet</p>
                    </div>
                  ) : (
                    approvedInsurance.map(insurance => (
                      <InsuranceCard 
                        key={insurance.id} 
                        insurance={insurance} 
                        showActions={false}
                      />
                    ))
                  )}
                </div>
              )}

              {activeTab === 'expired' && (
                <div>
                  {expiredInsurance.length === 0 ? (
                    <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
                      <div className="text-gray-400 text-4xl mb-4">⚠️</div>
                      <p className="text-gray-500">No expired or rejected insurance</p>
                    </div>
                  ) : (
                    expiredInsurance.map(insurance => (
                      <InsuranceCard 
                        key={insurance.id} 
                        insurance={insurance} 
                        showActions={false}
                      />
                    ))
                  )}
                </div>
              )}
            </>
          )}

          {/* Document Cleanup Section */}
          {activeSection === 'documents' && (
            <div>
              {/* Controls */}
              <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">🗑️ Storage Cleanup - Dispatch Sheets & Gate Passes</h3>
                <p className="text-sm text-gray-600 mb-4">
                  Scan Firebase Storage for old dispatch documents and gate passes. This will NOT delete photos or other files.
                </p>
               
                <div className="flex flex-wrap items-end gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Minimum Age (days)
                    </label>
                    <input
                      type="number"
                      value={minAgeDays}
                      onChange={(e) => setMinAgeDays(Math.max(1, parseInt(e.target.value) || 45))}
                      min="1"
                      className="w-32 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                    />
                  </div>
                  
                  <button
                    onClick={scanForOldDocuments}
                    disabled={isLoadingDocuments}
                    className={`px-6 py-2 rounded-lg font-medium transition-colors ${
                      isLoadingDocuments
                        ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                        : 'bg-purple-600 hover:bg-purple-700 text-white'
                    }`}
                  >
                    {isLoadingDocuments ? (
                      <span className="flex items-center gap-2">
                        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        Scanning...
                      </span>
                    ) : (
                      '🔍 Scan for Old Documents'
                    )}
                  </button>
                  
                  {selectedDocuments.length > 0 && (
                    <button
                      onClick={handleDeleteSelectedDocuments}
                      disabled={isDeletingDocuments}
                      className={`px-6 py-2 rounded-lg font-medium transition-colors ${
                        isDeletingDocuments
                          ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                          : 'bg-red-600 hover:bg-red-700 text-white'
                      }`}
                    >
                      {isDeletingDocuments ? (
                        <span className="flex items-center gap-2">
                          <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                          </svg>
                          Deleting...
                        </span>
                      ) : (
                        `🗑️ Delete Selected (${selectedDocuments.length})`
                      )}
                    </button>
                  )}
                </div>
              </div>
              
              {/* Document List */}
              {oldDocuments.length > 0 && (
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  <div className="p-4 border-b border-gray-200 bg-gray-50 flex justify-between items-center">
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={selectedDocuments.length === oldDocuments.length}
                        onChange={handleSelectAll}
                        className="w-4 h-4 text-purple-600 rounded border-gray-300 focus:ring-purple-500"
                      />
                      <span className="text-sm font-medium text-gray-700">
                        Select All ({oldDocuments.length} documents)
                      </span>
                    </div>
                    <span className="text-sm text-gray-500">
                      {selectedDocuments.length} selected
                    </span>
                  </div>
                  
                  <div className="divide-y divide-gray-200 max-h-[600px] overflow-y-auto">
                    {oldDocuments.map((doc) => (
                      <div
                        key={doc.id}
                        className={`p-4 hover:bg-gray-50 transition-colors ${
                          selectedDocuments.includes(doc.id) ? 'bg-purple-50' : ''
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <input
                            type="checkbox"
                            checked={selectedDocuments.includes(doc.id)}
                            onChange={() => handleSelectDocument(doc.id)}
                            className="mt-1 w-4 h-4 text-purple-600 rounded border-gray-300 focus:ring-purple-500"
                          />
                          
                          <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                            doc.type === 'dispatch' ? 'bg-blue-100' : 'bg-green-100'
                          }`}>
                            <span className="text-lg">
                              {doc.type === 'dispatch' ? '📋' : '🎫'}
                            </span>
                          </div>
                          
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-medium text-gray-900 truncate">
                                {doc.name}
                              </p>
                              <span className={`px-2 py-0.5 text-xs rounded-full ${
                                doc.type === 'dispatch' 
                                  ? 'bg-blue-100 text-blue-700' 
                                  : 'bg-green-100 text-green-700'
                              }`}>
                                {doc.type === 'dispatch' ? 'Dispatch' : 'Gate Pass'}
                              </span>
                            </div>
                            <p className="text-xs text-gray-500 truncate mt-1">
                              {doc.path}
                            </p>
                            <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                              <span>📅 {doc.createdAt.toLocaleDateString()}</span>
                              <span className={`font-medium ${
                                doc.ageInDays > 90 ? 'text-red-600' : 
                                doc.ageInDays > 60 ? 'text-orange-600' : 'text-yellow-600'
                              }`}>
                                {doc.ageInDays} days old
                              </span>
                              <span>💾 {formatFileSize(doc.size)}</span>
                              {doc.tenant && <span>🏢 {doc.tenant}</span>}
                              {doc.loadId && <span>📦 Load: {doc.loadId}</span>}
                              {doc.source && <span>📥 {doc.source}</span>}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              {oldDocuments.length === 0 && !isLoadingDocuments && (
                <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
                  <div className="text-gray-400 text-4xl mb-4">📂</div>
                  <p className="text-gray-500">Click "Scan for Old Documents" to find documents older than {minAgeDays} days</p>
                  <p className="text-gray-400 text-sm mt-2">Only dispatch sheets and gate passes (PDFs) will be scanned</p>
                </div>
              )}
              
              {/* Warning */}
              <div className="mt-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                <div className="flex items-start gap-3">
                  <span className="text-xl">⚠️</span>
                  <div>
                    <p className="text-sm font-medium text-yellow-800">Important Notes:</p>
                    <ul className="text-sm text-yellow-700 mt-1 list-disc list-inside">
                      <li>This will permanently delete files from Firebase Storage</li>
                      <li>Only PDFs (dispatch sheets and gate passes) are scanned - photos are NOT included</li>
                      <li>Deleted files cannot be recovered</li>
                      <li>The reference in Firestore (load documents array) will NOT be updated - only the file is deleted</li>
                      <li>All deletions are logged in the audit trail</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Insurance Approval Modal */}
      <InsuranceApprovalModal />
    </div>
  );
};

export default AdminApprovalDashboard;