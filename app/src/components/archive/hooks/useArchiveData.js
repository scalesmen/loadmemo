// src/components/archive/hooks/useArchiveData.js

import { useState, useEffect, useCallback } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, onSnapshot, collection, query, where, orderBy } from 'firebase/firestore';
import { auth, db } from '../../../firebase';
import { applyOwnerImpersonation } from '../../../utils/impersonation';
import { 
  fetchArchivedLoads, 
  restoreLoad, 
  permanentlyDeleteLoad,
  bulkPermanentlyDeleteLoads,
  getDaysUntilDeletion,
  deleteOldArchivedLoads
} from '../services/archiveService';
import { 
  logLoadRestore, 
  logPermanentDeletion,
  logBulkPermanentDeletion
} from '../../accounting/services/auditService';

const CAN_ACCESS_ARCHIVE_ROLES = ['Admin', 'Super Admin', 'Accounting'];

export function useArchiveData() {
  const [loggedInUser, setLoggedInUser] = useState(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [hasAccess, setHasAccess] = useState(false);
  
  const [drivers, setDrivers] = useState([]);
  const [trucks, setTrucks] = useState([]);
  const [brokers, setBrokers] = useState([]);
  const [dispatchers, setDispatchers] = useState([]);
  
  const [archivedLoads, setArchivedLoads] = useState([]);
  const [isLoadingLoads, setIsLoadingLoads] = useState(false);
  const [error, setError] = useState(null);
  const [lastVisible, setLastVisible] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [isFetchingMore, setIsFetchingMore] = useState(false);
  
  const [filters, setFilters] = useState({
    loadIdSearch: '',
    driverId: 'all',
    dispatcherId: 'all'
  });

  // Handle authentication
  useEffect(() => {
    setIsAuthLoading(true);
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        const userDocRef = doc(db, "users", user.uid);
        const unsubProfile = onSnapshot(userDocRef, (docSnap) => {
          if (docSnap.exists()) {
            const userData = applyOwnerImpersonation({ uid: user.uid, email: user.email, ...docSnap.data() });
            setLoggedInUser(userData);
            const userRole = userData.role;
            setHasAccess(CAN_ACCESS_ARCHIVE_ROLES.includes(userRole));
          } else {
            setLoggedInUser({ uid: user.uid, email: user.email, role: null });
            setHasAccess(false);
          }
          setIsAuthLoading(false);
        }, (profileError) => {
          console.error("ArchivePage: Error fetching user profile:", profileError);
          setLoggedInUser({ uid: user.uid, email: user.email, role: null });
          setHasAccess(false);
          setIsAuthLoading(false);
        });
        return () => unsubProfile();
      } else {
        setLoggedInUser(null);
        setHasAccess(false);
        setIsAuthLoading(false);
      }
    });
    return unsubscribe;
  }, []);

  // Fetch related data
  useEffect(() => {
    if (!loggedInUser || !loggedInUser.tenantId) {
      setDrivers([]);
      setTrucks([]);
      setBrokers([]);
      setDispatchers([]);
      return;
    }

    const unsubDrivers = onSnapshot(
      query(
        collection(db, "drivers"), 
        where("tenantId", "==", loggedInUser.tenantId), 
        orderBy("name", "asc")
      ), 
      (snap) => setDrivers(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    );
    
    const unsubTrucks = onSnapshot(
      query(
        collection(db, "trucks"), 
        where("tenantId", "==", loggedInUser.tenantId), 
        orderBy("unitNumber", "asc")
      ), 
      (snap) => setTrucks(snap.docs.map(t => ({ id: t.id, ...t.data() })))
    );
    
    const unsubBrokers = onSnapshot(
      query(
        collection(db, "brokers"), 
        where("tenantId", "==", loggedInUser.tenantId), 
        orderBy("name", "asc")
      ), 
      (snap) => setBrokers(snap.docs.map(b => ({ id: b.id, ...b.data() })))
    );
    
    const unsubDispatchers = onSnapshot(
      query(
        collection(db, "users"), 
        where("tenantId", "==", loggedInUser.tenantId),
        where("role", "==", "Dispatcher")
      ), 
      (snap) => setDispatchers(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    );
    
    return () => {
      unsubDrivers();
      unsubTrucks();
      unsubBrokers();
      unsubDispatchers();
    };
  }, [loggedInUser]);

  // Fetch archived loads
  const loadArchivedLoads = useCallback(async () => {
    if (!loggedInUser || !loggedInUser.tenantId || !hasAccess) return;

    setIsLoadingLoads(true);
    setError(null);

    try {
      const { loadsData, lastDoc, hasMore: more } = await fetchArchivedLoads(
        filters,
        loggedInUser.tenantId
      );

      setArchivedLoads(loadsData);
      setLastVisible(lastDoc);
      setHasMore(more);
    } catch (err) {
      console.error('Error fetching archived loads:', err);
      setError(err.message);
    } finally {
      setIsLoadingLoads(false);
    }
  }, [loggedInUser, hasAccess, filters]);

  // Load more archived loads
  const loadMoreArchivedLoads = useCallback(async () => {
    if (!loggedInUser || !loggedInUser.tenantId || !hasMore || isFetchingMore) return;

    setIsFetchingMore(true);

    try {
      const { loadsData, lastDoc, hasMore: more } = await fetchArchivedLoads(
        filters,
        loggedInUser.tenantId,
        lastVisible
      );

      setArchivedLoads(prev => [...prev, ...loadsData]);
      setLastVisible(lastDoc);
      setHasMore(more);
    } catch (err) {
      console.error('Error loading more archived loads:', err);
      setError(err.message);
    } finally {
      setIsFetchingMore(false);
    }
  }, [loggedInUser, hasMore, isFetchingMore, filters, lastVisible]);

  // Restore load
  const handleRestoreLoad = useCallback(async (loadDocId, loadId) => {
    if (!loggedInUser) return;

    try {
      await restoreLoad(loadDocId, loggedInUser.uid, loggedInUser.email);
      
      // Remove from local state
      setArchivedLoads(prev => prev.filter(load => load.docId !== loadDocId));
      
      // Log audit
      await logLoadRestore({
        user: loggedInUser,
        loadDocId,
        loadId
      });
      
      alert(`Load ${loadId} restored successfully!`);
    } catch (err) {
      console.error('Error restoring load:', err);
      alert('Failed to restore load: ' + err.message);
    }
  }, [loggedInUser]);

  // Permanently delete load
  const handlePermanentDelete = useCallback(async (loadDocId, loadId) => {
    if (!loggedInUser) return;

    if (!window.confirm(
      `⚠️ PERMANENT DELETE WARNING ⚠️\n\n` +
      `Are you sure you want to PERMANENTLY DELETE Load ID: ${loadId}?\n\n` +
      `This action CANNOT be undone!\n\n` +
      `The load will be completely removed from your view.\n` +
      `The driver will be unassigned from this load.`
    )) {
      return;
    }

    try {
      await permanentlyDeleteLoad(loadDocId, loggedInUser.uid, loggedInUser.email);
      
      // Remove from local state
      setArchivedLoads(prev => prev.filter(load => load.docId !== loadDocId));
      
      // Log audit
      await logPermanentDeletion({
        user: loggedInUser,
        loadDocId,
        loadId
      });
      
      alert(`Load ${loadId} permanently deleted.\n\nDriver has been unassigned.`);
    } catch (err) {
      console.error('Error permanently deleting load:', err);
      alert('Failed to delete load: ' + err.message);
    }
  }, [loggedInUser]);

  // Bulk permanently delete loads
  const handleBulkPermanentDelete = useCallback(async (loadDocIds) => {
    if (!loggedInUser || loadDocIds.length === 0) return;

    try {
      const { deletedCount } = await bulkPermanentlyDeleteLoads(
        loadDocIds, 
        loggedInUser.uid, 
        loggedInUser.email
      );
      
      // Remove from local state
      setArchivedLoads(prev => prev.filter(load => !loadDocIds.includes(load.docId)));
      
      // Log audit
      await logBulkPermanentDeletion({
        user: loggedInUser,
        loadCount: deletedCount
      });
      
      return { success: true, deletedCount };
    } catch (err) {
      console.error('Error bulk deleting loads:', err);
      throw err;
    }
  }, [loggedInUser]);

  // Clean old archives (30+ days)
  const handleCleanOldArchives = useCallback(async () => {
    if (!loggedInUser || !loggedInUser.tenantId) return;

    if (!window.confirm('This will permanently delete all loads that have been archived for more than 30 days.\n\nAre you sure you want to continue?')) {
      return;
    }

    try {
      const { deletedCount } = await deleteOldArchivedLoads(
        loggedInUser.tenantId,
        loggedInUser.uid,
        loggedInUser.email
      );
      
      if (deletedCount > 0) {
        alert(`Successfully deleted ${deletedCount} old archived load(s).`);
        // Reload the list
        await loadArchivedLoads();
      } else {
        alert('No old archived loads found to delete.');
      }
    } catch (err) {
      console.error('Error cleaning old archives:', err);
      alert('Failed to clean archives: ' + err.message);
    }
  }, [loggedInUser, loadArchivedLoads]);

  // Initial load
  useEffect(() => {
    if (loggedInUser && hasAccess) {
      loadArchivedLoads();
    }
  }, [loggedInUser, hasAccess, loadArchivedLoads]);

  return {
    loggedInUser,
    isAuthLoading,
    hasAccess,
    drivers,
    trucks,
    brokers,
    dispatchers,
    archivedLoads,
    isLoadingLoads,
    error,
    hasMore,
    isFetchingMore,
    filters,
    setFilters,
    loadMoreArchivedLoads,
    handleRestoreLoad,
    handlePermanentDelete,
    handleBulkPermanentDelete,
    handleCleanOldArchives,
    getDaysUntilDeletion
  };
}