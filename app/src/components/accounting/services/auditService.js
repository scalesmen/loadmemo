// src/components/accounting/services/auditService.js

import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '../../../firebase';

/**
 * Log an audit trail entry
 */
export async function logAudit({ 
  userId, 
  userEmail, 
  action, 
  targetType, 
  targetId, 
  details, 
  tenantId 
}) {
  try {
    await addDoc(collection(db, "auditLogs"), {
      userId,
      userEmail,
      action,
      targetType,
      targetId,
      details,
      tenantId,
      timestamp: serverTimestamp()
    });
  } catch (e) {
    console.error("Audit log error:", e);
    // Don't throw - audit logging should not break the main operation
  }
}

/**
 * Log field change audit
 */
export async function logFieldChangeAudit({
  user,
  loadDocId,
  loadId,
  field,
  oldValue,
  newValue
}) {
  await logAudit({
    userId: user.uid,
    userEmail: user.email,
    action: "edit_accounting_field",
    targetType: "load",
    targetId: loadDocId,
    tenantId: user.tenantId,
    details: {
      field,
      oldValue: oldValue ?? null,
      newValue: newValue ?? null,
      message: `Accounting updated field '${field}' from "${oldValue ?? ''}" to "${newValue ?? ''}" on load ${loadId || loadDocId}`
    }
  });
}

/**
 * Log payment terms update
 */
export async function logPaymentTermsUpdate({
  user,
  loadDocId,
  newPayTerms
}) {
  await logAudit({
    userId: user.uid,
    userEmail: user.email,
    action: "update_pay_terms",
    targetType: "load",
    targetId: loadDocId,
    tenantId: user.tenantId,
    details: {
      newPayTerms,
      message: `Updated payment terms to: ${newPayTerms}`
    }
  });
}

/**
 * Log load archive
 */
export async function logLoadArchive({
  user,
  loadDocId,
  loadId
}) {
  await logAudit({
    userId: user.uid,
    userEmail: user.email,
    action: "archive_load",
    targetType: "load",
    targetId: loadDocId,
    tenantId: user.tenantId,
    details: {
      load_id: loadId,
      message: `Archived load ${loadId}`
    }
  });
}

/**
 * Log bulk archive (NEW)
 */
export async function logBulkArchive({ user, loadCount }) {
  await logAudit({
    userId: user.uid,
    userEmail: user.email,
    action: "bulk_archive_loads",
    targetType: "loads",
    targetId: "bulk",
    tenantId: user.tenantId,
    details: {
      loadCount,
      message: `Bulk archived ${loadCount} loads (drivers unassigned)`
    }
  });
}

/**
 * Log load restoration
 */
export async function logLoadRestore({
  user,
  loadDocId,
  loadId
}) {
  await logAudit({
    userId: user.uid,
    userEmail: user.email,
    action: "restore_load",
    targetType: "load",
    targetId: loadDocId,
    tenantId: user.tenantId,
    details: {
      load_id: loadId,
      message: `Restored load ${loadId} from archive`
    }
  });
}

/**
 * Log permanent deletion
 */
export async function logPermanentDeletion({
  user,
  loadDocId,
  loadId
}) {
  await logAudit({
    userId: user.uid,
    userEmail: user.email,
    action: "permanent_delete_load",
    targetType: "load",
    targetId: loadDocId,
    tenantId: user.tenantId,
    details: {
      load_id: loadId,
      message: `Permanently deleted load ${loadId}`
    }
  });
}

/**
 * Log bulk permanent deletion (NEW)
 */
export async function logBulkPermanentDeletion({ user, loadCount }) {
  await logAudit({
    userId: user.uid,
    userEmail: user.email,
    action: "bulk_permanent_delete_loads",
    targetType: "loads",
    targetId: "bulk",
    tenantId: user.tenantId,
    details: {
      loadCount,
      message: `Bulk permanently deleted ${loadCount} loads (soft delete - drivers unassigned)`
    }
  });
}

/**
 * Log load deletion (legacy - now archives)
 */
export async function logLoadDeletion({
  user,
  loadDocId,
  loadId
}) {
  // This now logs as archive
  await logLoadArchive({ user, loadDocId, loadId });
}