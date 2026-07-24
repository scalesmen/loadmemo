// src/utils/auditLog.js
// Shared audit-log writer. Existing features each had their own copy-pasted
// version of this; new audit logging added going forward should import this
// one instead, so the write shape stays consistent in one place.

import { db } from '../firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';

export async function logAudit({ userId, userEmail, action, targetType, targetId, details, tenantId }) {
  try {
    await addDoc(collection(db, 'auditLogs'), {
      userId,
      userEmail,
      action,
      targetType,
      targetId,
      details: details || {},
      tenantId,
      timestamp: serverTimestamp()
    });
  } catch (error) {
    console.error(`Audit log failed for action "${action}":`, error);
  }
}
