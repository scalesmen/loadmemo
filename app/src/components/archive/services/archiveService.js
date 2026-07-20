// src/components/archive/services/archiveService.js

import {
  collection, query, where, orderBy, getDocs, 
  doc, updateDoc, deleteDoc, serverTimestamp,
  Timestamp, limit, startAfter, writeBatch
} from 'firebase/firestore';
import { db } from '../../../firebase';

const ARCHIVE_RETENTION_DAYS = 30;

/**
 * Archive a load instead of deleting it
 * Driver remains assigned - will be unassigned only on permanent delete
 */
export async function archiveLoad(loadDocId, userId, userEmail, tenantId) {
  try {
    const loadRef = doc(db, "loads", loadDocId);
    
    await updateDoc(loadRef, {
      isArchived: true,
      archivedAt: serverTimestamp(),
      archivedBy: userId,
      archivedByEmail: userEmail,
      updatedAt: serverTimestamp()
    });
    
    console.log(`✅ Load ${loadDocId} archived successfully`);
    return { success: true };
  } catch (error) {
    console.error('❌ Error archiving load:', error);
    throw error;
  }
}

/**
 * Bulk archive loads
 * Driver remains assigned - will be unassigned only on permanent delete
 */
export async function bulkArchiveLoads(loadDocIds, userId, userEmail, tenantId) {
  try {
    const batchSize = 500; // Firestore batch limit
    let archivedCount = 0;
    
    for (let i = 0; i < loadDocIds.length; i += batchSize) {
      const batch = writeBatch(db);
      const batchLoads = loadDocIds.slice(i, i + batchSize);
      
      batchLoads.forEach(loadDocId => {
        const loadRef = doc(db, "loads", loadDocId);
        batch.update(loadRef, {
          isArchived: true,
          archivedAt: serverTimestamp(),
          archivedBy: userId,
          archivedByEmail: userEmail,
          updatedAt: serverTimestamp()
        });
      });
      
      await batch.commit();
      archivedCount += batchLoads.length;
    }
    
    console.log(`✅ Bulk archived ${archivedCount} loads`);
    return { success: true, archivedCount };
  } catch (error) {
    console.error('❌ Error bulk archiving loads:', error);
    throw error;
  }
}

/**
 * Restore a load from archive
 * NOTE: Driver is NOT reassigned - must be manually assigned
 */
export async function restoreLoad(loadDocId, userId, userEmail) {
  try {
    const loadRef = doc(db, "loads", loadDocId);
    
    await updateDoc(loadRef, {
      isArchived: false,
      archivedAt: null,
      archivedBy: null,
      archivedByEmail: null,
      restoredAt: serverTimestamp(),
      restoredBy: userId,
      restoredByEmail: userEmail,
      updatedAt: serverTimestamp()
      // NOTE: driverId and driverName remain null - must be reassigned manually
    });
    
    console.log(`✅ Load ${loadDocId} restored successfully (driver must be reassigned)`);
    return { success: true };
  } catch (error) {
    console.error('❌ Error restoring load:', error);
    throw error;
  }
}

/**
 * Permanently delete a load (SOFT DELETE - marks as deleted for user)
 * Load stays in Firebase for app owner
 * UNASSIGNS DRIVER when permanently deleting
 */
export async function permanentlyDeleteLoad(loadDocId, userId, userEmail) {
  try {
    const loadRef = doc(db, "loads", loadDocId);
    
    // SOFT DELETE: Mark as deleted for user, but keep in Firebase
    // UNASSIGN DRIVER: So load disappears from driver's mobile app
    await updateDoc(loadRef, {
      isDeletedByUser: true,
      deletedAt: serverTimestamp(),
      deletedBy: userId,
      deletedByEmail: userEmail,
      // UNASSIGN DRIVER (only when permanently deleting)
      driverId: null,
      driverName: null,
      updatedAt: serverTimestamp()
    });
    
    console.log(`✅ Load ${loadDocId} soft deleted and driver unassigned`);
    return { success: true };
  } catch (error) {
    console.error('❌ Error permanently deleting load:', error);
    throw error;
  }
}

/**
 * Bulk permanently delete loads (SOFT DELETE)
 * Loads stay in Firebase for app owner
 * UNASSIGNS DRIVERS when permanently deleting
 */
export async function bulkPermanentlyDeleteLoads(loadDocIds, userId, userEmail) {
  try {
    const batchSize = 500;
    let deletedCount = 0;
    
    for (let i = 0; i < loadDocIds.length; i += batchSize) {
      const batch = writeBatch(db);
      const batchLoads = loadDocIds.slice(i, i + batchSize);
      
      batchLoads.forEach(loadDocId => {
        const loadRef = doc(db, "loads", loadDocId);
        batch.update(loadRef, {
          isDeletedByUser: true,
          deletedAt: serverTimestamp(),
          deletedBy: userId,
          deletedByEmail: userEmail,
          // UNASSIGN DRIVER (only when permanently deleting)
          driverId: null,
          driverName: null,
          updatedAt: serverTimestamp()
        });
      });
      
      await batch.commit();
      deletedCount += batchLoads.length;
    }
    
    console.log(`✅ Bulk soft deleted ${deletedCount} loads and unassigned drivers`);
    return { success: true, deletedCount };
  } catch (error) {
    console.error('❌ Error bulk deleting loads:', error);
    throw error;
  }
}

/**
 * Fetch archived loads
 * Excludes loads marked as deleted by user
 */
export async function fetchArchivedLoads(filters, tenantId, lastVisible = null) {
  const LOADS_PER_PAGE = 30;
  
  let conditions = [
    where("tenantId", "==", tenantId),
    where("isArchived", "==", true)
    // Note: We don't filter by isDeletedByUser in query because it may not exist on old docs
    // We'll filter client-side instead
  ];
  
  // Add filters if needed
  if (filters.loadIdSearch && filters.loadIdSearch.trim() !== "") {
    conditions.push(where("load_id", "==", filters.loadIdSearch.trim()));
  }
  
  if (filters.driverId && filters.driverId !== 'all') {
    conditions.push(where("driverId", "==", filters.driverId));
  }

  if (filters.dispatcherId && filters.dispatcherId !== 'all') {
    conditions.push(where("dispatcherId", "==", filters.dispatcherId));
  }
  
  let q = query(
    collection(db, "loads"),
    ...conditions,
    orderBy("archivedAt", "desc"),
    limit(LOADS_PER_PAGE)
  );
  
  if (lastVisible) {
    q = query(
      collection(db, "loads"),
      ...conditions,
      orderBy("archivedAt", "desc"),
      startAfter(lastVisible),
      limit(LOADS_PER_PAGE)
    );
  }
  
  const snapshot = await getDocs(q);
  
  // CLIENT-SIDE FILTER: Exclude loads marked as deleted by user
  const loadsData = snapshot.docs
    .map(d => ({ docId: d.id, ...d.data() }))
    .filter(load => load.isDeletedByUser !== true);
  
  const lastDoc = snapshot.docs[snapshot.docs.length - 1];
  const hasMore = snapshot.docs.length === LOADS_PER_PAGE;
  
  return { loadsData, lastDoc, hasMore };
}

/**
 * Get loads eligible for permanent deletion (older than 30 days)
 * Excludes loads already marked as deleted by user
 */
export async function getLoadsToDelete(tenantId) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - ARCHIVE_RETENTION_DAYS);
  
  const q = query(
    collection(db, "loads"),
    where("tenantId", "==", tenantId),
    where("isArchived", "==", true),
    where("archivedAt", "<=", Timestamp.fromDate(cutoffDate))
  );
  
  const snapshot = await getDocs(q);
  
  // Filter out loads already marked as deleted by user
  return snapshot.docs
    .map(d => ({ docId: d.id, ...d.data() }))
    .filter(load => load.isDeletedByUser !== true);
}

/**
 * Batch delete old archived loads (soft delete)
 * Marks loads as deleted for user but keeps in Firebase
 */
export async function deleteOldArchivedLoads(tenantId, userId, userEmail) {
  try {
    const loadsToDelete = await getLoadsToDelete(tenantId);
    
    if (loadsToDelete.length === 0) {
      console.log('✅ No old archived loads to delete');
      return { success: true, deletedCount: 0 };
    }
    
    // Use bulk soft delete
    const loadDocIds = loadsToDelete.map(load => load.docId);
    const result = await bulkPermanentlyDeleteLoads(loadDocIds, userId, userEmail);
    
    console.log(`✅ Soft deleted ${result.deletedCount} old archived loads`);
    return result;
  } catch (error) {
    console.error('❌ Error deleting old archived loads:', error);
    throw error;
  }
}

/**
 * Calculate days remaining until permanent deletion
 */
export function getDaysUntilDeletion(archivedAt) {
  if (!archivedAt) return null;
  
  const archivedDate = archivedAt.seconds 
    ? new Date(archivedAt.seconds * 1000) 
    : new Date(archivedAt);
  
  const deleteDate = new Date(archivedDate);
  deleteDate.setDate(deleteDate.getDate() + ARCHIVE_RETENTION_DAYS);
  
  const now = new Date();
  const daysRemaining = Math.ceil((deleteDate - now) / (1000 * 60 * 60 * 24));
  
  return {
    daysRemaining: Math.max(0, daysRemaining),
    deleteDate: deleteDate.toLocaleDateString()
  };
}