// src/components/accounting/services/accountingService.js
// ⭐ UPDATED: Phase 2 - parentCompanyId filtering for company isolation
// ⭐ UPDATED: emailInvoiceToBoker now supports optional BOL attachment
// ⭐ UPDATED: Overdue filter fetches ALL loads (no limit) for complete results

import {
  collection, query, where, orderBy, getDocs, getDoc,
  doc, updateDoc, deleteDoc, serverTimestamp, 
  Timestamp, limit, startAfter
} from 'firebase/firestore';
import { db } from '../../../firebase';
import { zonedTimeToUtc } from 'date-fns-tz';
import { 
  LOAD_ACCOUNTING_STATUSES_DELIVERED, 
  LOAD_ACCOUNTING_STATUSES_ALL, 
  LOADS_PER_PAGE 
} from '../constants/accountingConstants';
import { archiveLoad as archiveLoadService } from '../../archive/services/archiveService';
import { getFunctions, httpsCallable } from 'firebase/functions';

/**
 * Client-side multi-field search filter
 * Searches across: Load ID, VIN, Make, Model, and Broker Name
 */
export function applyMultiFieldSearch(loads, searchTerm, brokers = []) {
  if (!searchTerm || searchTerm.trim() === "") {
    return loads;
  }

  const search = searchTerm.trim().toLowerCase();
  
  console.log('🔍 Multi-field search for:', search);
  console.log('🔍 Total loads before search:', loads.length);
  console.log('🔍 Brokers available:', brokers.length);
  
  const results = loads.filter(load => {
    // 1. Search by Load ID (case-insensitive partial match)
    if (load.load_id && load.load_id.toLowerCase().includes(search)) {
      return true;
    }

    // 2. Search by VIN, Make, Model (case-insensitive partial match)
    if (load.vehicles && Array.isArray(load.vehicles)) {
      const vinMatch = load.vehicles.some(vehicle => 
        vehicle.vin && vehicle.vin.toLowerCase().includes(search)
      );
      if (vinMatch) return true;

      const makeMatch = load.vehicles.some(vehicle => 
        vehicle.make && vehicle.make.toLowerCase().includes(search)
      );
      if (makeMatch) return true;

      const modelMatch = load.vehicles.some(vehicle => 
        vehicle.model && vehicle.model.toLowerCase().includes(search)
      );
      if (modelMatch) return true;
    }

    // 3. Search by Broker Name (case-insensitive partial match)
    if (load.brokerName && load.brokerName.toLowerCase().includes(search)) {
      return true;
    }

    if (load.brokerId && brokers && Array.isArray(brokers) && brokers.length > 0) {
      const broker = brokers.find(b => b.id === load.brokerId);
      if (broker && broker.name && broker.name.toLowerCase().includes(search)) {
        return true;
      }
    }

    return false;
  });
  
  console.log('✅ Search results:', results.length);
  return results;
}

/**
 * CLIENT-SIDE parent company filter for loads
 * Used because Firestore doesn't allow two 'in' operators (status already uses 'in')
 * @param {Array} loads - Array of load objects
 * @param {Array} userParentCompanyIds - User's assigned parent company IDs
 * @returns {Array} Filtered loads
 */
function applyParentCompanyFilter(loads, userParentCompanyIds) {
  if (!userParentCompanyIds || userParentCompanyIds.length === 0) {
    return loads;
  }

  const beforeCount = loads.length;
  const filtered = loads.filter(load => {
   if (!load.parentCompanyId) {
  // Legacy load without parentCompanyId — show to everyone until tagged
  return true;
}
    return userParentCompanyIds.includes(load.parentCompanyId);
  });

  console.log(`🏢 Accounting company filter: ${beforeCount} → ${filtered.length} loads`);
  return filtered;
}

/**
 * Fetch company info by company name
 */
export async function fetchCompanyInfo(companyName, tenantId) {
  if (!companyName || !tenantId) return null;

  try {
    const companiesQuery = query(
      collection(db, "companies"),
      where("tenantId", "==", tenantId),
      where("name", "==", companyName)
    );
    const companiesSnapshot = await getDocs(companiesQuery);

    if (!companiesSnapshot.empty) {
      const companyDoc = companiesSnapshot.docs[0];
      const companyData = companyDoc.data();

      return {
        name: companyData.name || companyName,
        address: companyData.address || 'Address Not Available',
        phone: companyData.phone || 'Phone Not Available',
        email: companyData.email || 'Email Not Available',
        usdot: companyData.usdot || 'USDOT Not Available',
        mcNumber: companyData.mcNumber || 'MC Not Available',
        taxId: companyData.taxId || 'Tax ID Not Available'
      };
    }
  } catch (error) {
    console.error("Error fetching company info:", error);
  }
  
  return null;
}

/**
 * Fetch broker details
 */
export async function fetchBrokerDetails(brokerId, tenantId) {
  if (!brokerId || !tenantId) return null;

  try {
    const brokerDocSnap = await getDoc(doc(db, "brokers", brokerId));
    if (brokerDocSnap.exists()) {
      const brokerData = brokerDocSnap.data();
      if (brokerData.tenantId === tenantId) {
        return brokerData;
      } else {
        console.warn("Broker does not belong to current tenant");
      }
    }
  } catch (error) {
    console.error("Error fetching broker details:", error);
  }
  
  return null;
}

/**
 * Build query conditions for accounting loads
 * UPDATED: Skips date filters when searching to allow searching all history
 * UPDATED: For overdue filter, skips date filters AND uses no limit (handled in fetchAccountingLoads)
 */
export function buildAccountingQueryConditions(filters, tenantId, applicationTimeZone) {
  let conditions = [
    where("tenantId", "==", tenantId)
  ];
  
  // Use appropriate status array based on toggle
  const statusArray = filters.showPickedUp 
    ? LOAD_ACCOUNTING_STATUSES_ALL 
    : LOAD_ACCOUNTING_STATUSES_DELIVERED;
  
  conditions.push(where("status", "in", statusArray));
  
  const dateFieldForRangeQuery = filters.showPickedUp ? "actualPU" : "actualDEL";
  let effectiveOrderByField = dateFieldForRangeQuery;
  let effectiveOrderByDirection = "desc";

  const hasSearchTerm = filters.loadIdSearch && filters.loadIdSearch.trim() !== "";
  const isUnlimitedFilter = filters.quickFilter && filters.quickFilter !== 'all';
  const isOtherQuickFilter = filters.quickFilter && filters.quickFilter !== 'all' && !isUnlimitedFilter;
  
  // Skip date filters only when searching
  const skipDateFilters = hasSearchTerm;
  
  // For overdue/unpaid: if user set dates, respect them. If not, use 90-day lookback.
  if (isUnlimitedFilter && !filters.startDate && !filters.endDate && applicationTimeZone) {
    const lookbackDate = new Date();
    lookbackDate.setDate(lookbackDate.getDate() - 90);
    const lookbackStr = `${lookbackDate.toISOString().split('T')[0]}T00:00:00`;
    const utcLookback = zonedTimeToUtc(lookbackStr, applicationTimeZone);
    conditions.push(where(dateFieldForRangeQuery, ">=", Timestamp.fromDate(utcLookback)));
    console.log(`📦 ${filters.quickFilter.toUpperCase()}: Using 90-day lookback from ${lookbackDate.toISOString().split('T')[0]}`);
  }
  
  if (!skipDateFilters) {
    if (filters.startDate && applicationTimeZone) {
      const startOfDayInAppTZStr = `${filters.startDate}T00:00:00`;
      const utcStart = zonedTimeToUtc(startOfDayInAppTZStr, applicationTimeZone);
      conditions.push(where(dateFieldForRangeQuery, ">=", Timestamp.fromDate(utcStart)));
    }
    
    if (filters.endDate && applicationTimeZone) {
      const endOfDayInAppTZStr = `${filters.endDate}T23:59:59.999`;
      const utcEnd = zonedTimeToUtc(endOfDayInAppTZStr, applicationTimeZone);
      conditions.push(where(dateFieldForRangeQuery, "<=", Timestamp.fromDate(utcEnd)));
    }
  }

  if (filters.driverId !== 'all') {
    conditions.push(where("driverId", "==", filters.driverId));
  }
  if (filters.truckId !== 'all') {
    conditions.push(where("truckId", "==", filters.truckId));
  }
  if (filters.brokerId !== 'all') {
    conditions.push(where("brokerId", "==", filters.brokerId));
  }
  if (filters.dispatcherId !== 'all') {
    conditions.push(where("dispatcherId", "==", filters.dispatcherId));
  }

  return { conditions, effectiveOrderByField, effectiveOrderByDirection };
}

/**
 * Fetch initial accounting loads
 * PHASE 2: Added parentCompanyIds param for company filtering
 * ⭐ UPDATED: "overdue" quick filter fetches ALL loads (no limit) for complete results
 * Other quick filters still use 750 limit
 * CLIENT-SIDE FILTERING for archived loads, multi-field search, and parent company
 */
export async function fetchAccountingLoads(filters, tenantId, applicationTimeZone, brokers = [], isQuickFilterActive = false, parentCompanyIds = null) {
  console.log('📦 fetchAccountingLoads called with brokers:', brokers.length, 'parentCompanyIds:', parentCompanyIds);
  
  const hasSearchTerm = filters.loadIdSearch && filters.loadIdSearch.trim() !== "";
  const searchTerm = hasSearchTerm ? filters.loadIdSearch.trim() : "";
  
  // Check if search term looks like a Load ID
  const looksLikeLoadId = /^[A-Za-z0-9-_]+$/.test(searchTerm) && searchTerm.length >= 3;
  
  // If searching for what looks like a Load ID, try exact Firestore query first
  if (hasSearchTerm && looksLikeLoadId) {
    console.log('🔍 Attempting exact Load ID search in Firestore:', searchTerm);
    
    try {
      const exactMatchQuery = query(
        collection(db, "loads"),
        where("tenantId", "==", tenantId),
        where("load_id", "==", searchTerm)
      );
      
      const exactSnapshot = await getDocs(exactMatchQuery);
      
      if (!exactSnapshot.empty) {
        console.log('✅ Found exact Load ID match:', exactSnapshot.docs.length);
        
        let loadsData = exactSnapshot.docs
          .map(d => ({ docId: d.id, ...d.data() }))
          .filter(load => load.isArchived !== true);

        // PHASE 2: Apply parent company filter
        if (parentCompanyIds) {
          loadsData = applyParentCompanyFilter(loadsData, parentCompanyIds);
        }
        
        return { 
          loadsData, 
          lastDoc: null, 
          hasMore: false 
        };
      }
      
      console.log('⚠️ No exact match found, falling back to client-side search');
    } catch (err) {
      console.error('Error in exact Load ID search:', err);
    }
  }
  
  // Regular query with conditions
  const { conditions, effectiveOrderByField, effectiveOrderByDirection } = 
    buildAccountingQueryConditions(filters, tenantId, applicationTimeZone);

  // ⭐ DETERMINE FETCH STRATEGY:
  // - "overdue" filter: fetch ALL loads (no limit) — overdue loads can be very old
  // - Other quick filters (paid/unpaid/invoiced/uninvoiced): fetch 750 
  // - Search: fetch 750
  // - Normal browsing: fetch LOADS_PER_PAGE (paginated)
  const isUnlimitedFilter = filters.quickFilter && filters.quickFilter !== 'all';
  const isOtherQuickFilter = isQuickFilterActive && !isUnlimitedFilter;
  const shouldFetchMore = hasSearchTerm || isOtherQuickFilter;
  const shouldFetchAll = isUnlimitedFilter;

  let queryParts = [
    collection(db, "loads"),
    ...conditions,
    orderBy(effectiveOrderByField, effectiveOrderByDirection)
  ];

  // Only apply limit if NOT fetching all
  if (shouldFetchAll) {
    queryParts.push(limit(200));
    console.log(`📦 ${filters.quickFilter.toUpperCase()} MODE: Fetching 200 loads per batch with 90-day lookback`);
  } else {
    const limitCount = shouldFetchMore ? 750 : LOADS_PER_PAGE;
    queryParts.push(limit(limitCount));
    console.log('📦 Fetching with limit:', limitCount, 'orderBy:', effectiveOrderByField);
  }

  const q = query(...queryParts);

  const snapshot = await getDocs(q);
  
  console.log('📦 Accounting: Fetched from DB:', snapshot.docs.length);
  
  // CLIENT-SIDE FILTER: Exclude archived loads
  let loadsData = snapshot.docs
    .map(d => ({ docId: d.id, ...d.data() }))
    .filter(load => load.isArchived !== true);
  
  console.log('📦 After archive filter:', loadsData.length);

  // PHASE 2: Apply parent company filter (client-side because status already uses 'in')
  if (parentCompanyIds) {
    loadsData = applyParentCompanyFilter(loadsData, parentCompanyIds);
  }
  
  // Apply multi-field search (Load ID, VIN, Make, Model, Broker Name)
  loadsData = applyMultiFieldSearch(loadsData, filters.loadIdSearch, brokers);
  
  console.log('✅ Accounting: After all filters:', loadsData.length);
  
  const lastDoc = snapshot.docs[snapshot.docs.length - 1];
  // No pagination when fetching all or fetching more
  const hasMore = shouldFetchAll 
    ? snapshot.docs.length === 200
    : (!shouldFetchMore && snapshot.docs.length === LOADS_PER_PAGE);

  return { loadsData, lastDoc, hasMore };
}

/**
 * Fetch more accounting loads (pagination)
 * PHASE 2: Added parentCompanyIds param for company filtering
 */
export async function fetchMoreAccountingLoads(filters, tenantId, applicationTimeZone, lastVisible, brokers = [], parentCompanyIds = null) {
  console.log('📦 fetchMoreAccountingLoads called with brokers:', brokers.length);
  
  const { conditions, effectiveOrderByField, effectiveOrderByDirection } = 
    buildAccountingQueryConditions(filters, tenantId, applicationTimeZone);

  const isUnlimitedFilter = filters.quickFilter && filters.quickFilter !== 'all';
  const pageSize = isUnlimitedFilter ? 200 : LOADS_PER_PAGE;

  const q = query(
    collection(db, "loads"),
    ...conditions,
    orderBy(effectiveOrderByField, effectiveOrderByDirection),
    startAfter(lastVisible),
    limit(pageSize)
  );

  const snapshot = await getDocs(q);
  
  // CLIENT-SIDE FILTER: Exclude archived loads
  let loadsData = snapshot.docs
    .map(d => ({ docId: d.id, ...d.data() }))
    .filter(load => load.isArchived !== true);

  // PHASE 2: Apply parent company filter
  if (parentCompanyIds) {
    loadsData = applyParentCompanyFilter(loadsData, parentCompanyIds);
  }
  
  // Apply multi-field search
  loadsData = applyMultiFieldSearch(loadsData, filters.loadIdSearch, brokers);
  
  const lastDoc = snapshot.docs[snapshot.docs.length - 1];
  const hasMore = snapshot.docs.length === pageSize;

  return { loadsData, lastDoc, hasMore };
}

/**
 * Update load payment terms
 */
export async function updateLoadPayTerms(loadDocId, newPayTerms) {
  console.log('🔥 Updating Firestore document:', {
    loadDocId,
    newPayTerms,
    field: 'paymentTerms'
  });
  
  try {
    await updateDoc(doc(db, "loads", loadDocId), {
      paymentTerms: newPayTerms,
      updatedAt: serverTimestamp()
    });
    
    console.log('✅ Firestore update complete for payment terms');
  } catch (error) {
    console.error('❌ Firestore update failed:', error);
    throw error;
  }
}

/**
 * Update load payment method
 */
export async function updateLoadPaymentMethod(loadDocId, newPaymentMethod) {
  console.log('🔥 Updating payment method in Firestore:', {
    loadDocId,
    newPaymentMethod
  });
  
  await updateDoc(doc(db, "loads", loadDocId), {
    paymentMethod: newPaymentMethod,
    updatedAt: serverTimestamp()
  });
  
  console.log('✅ Payment method updated in Firestore');
}

/**
 * Update load payment status
 */
export async function updateLoadPaymentStatus(loadDocId, paymentStatus) {
  await updateDoc(doc(db, "loads", loadDocId), {
    paymentStatus: paymentStatus,
    paymentMarkedAt: paymentStatus === 'paid' ? serverTimestamp() : null,
    updatedAt: serverTimestamp()
  });
}

/**
 * Update load data
 */
export async function updateLoad(loadDocId, dataToUpdate) {
  console.log('🔧 accountingService.updateLoad: Starting update for:', loadDocId);
  
  const updatePayload = {
    ...dataToUpdate,
    updatedAt: serverTimestamp()
  };
  
  try {
    const loadRef = doc(db, "loads", loadDocId);
    await updateDoc(loadRef, updatePayload);
    console.log('✅ accountingService.updateLoad: Firestore update completed successfully');
  } catch (error) {
    console.error('❌ accountingService.updateLoad: Error updating load:', error);
    throw error;
  }
}

/**
 * Archive load (replaces delete)
 */
export async function deleteLoad(loadDocId, userId, userEmail, tenantId) {
  return await archiveLoadService(loadDocId, userId, userEmail, tenantId);
}

/**
 * Generate statement data
 * PHASE 2: Added parentCompanyIds param for company filtering
 */
export async function fetchStatementLoads(statementParams, tenantId, applicationTimeZone, parentCompanyIds = null) {
  let conditions = [
    where("tenantId", "==", tenantId),
    where("status", "==", "Delivered")
  ];

  if (statementParams.driverId !== 'all') {
    conditions.push(where("driverId", "==", statementParams.driverId));
  }
  if (statementParams.truckId !== 'all') {
    conditions.push(where("truckId", "==", statementParams.truckId));
  }

  const dateFieldForStatement = "actualDEL";

  const startOfDayInAppTZStr = `${statementParams.statementStartDate}T00:00:00`;
  const utcStart = zonedTimeToUtc(startOfDayInAppTZStr, applicationTimeZone);
  conditions.push(where(dateFieldForStatement, ">=", Timestamp.fromDate(utcStart)));

  const endOfDayInAppTZStr = `${statementParams.statementEndDate}T23:59:59.999`;
  const utcEnd = zonedTimeToUtc(endOfDayInAppTZStr, applicationTimeZone);
  conditions.push(where(dateFieldForStatement, "<=", Timestamp.fromDate(utcEnd)));

  const q = query(
    collection(db, "loads"),
    ...conditions,
    orderBy(dateFieldForStatement, "asc")
  );

  const snapshot = await getDocs(q);
  
  // CLIENT-SIDE FILTER: Exclude archived loads
  let loadsData = snapshot.docs
    .map(d => ({ docId: d.id, ...d.data() }))
    .filter(load => load.isArchived !== true);

  // PHASE 2: Apply parent company filter
  if (parentCompanyIds) {
    loadsData = applyParentCompanyFilter(loadsData, parentCompanyIds);
  }

  return loadsData;
}

// ============================================================================
// ADMIN NOTE AND EMAIL INVOICE FUNCTIONS
// ============================================================================

/**
 * Save accounting note for a load
 */
export async function saveAccountingNote(loadDocId, note) {
  console.log('💾 Saving accounting note:', { loadDocId, note });
  
  try {
    await updateDoc(doc(db, "loads", loadDocId), {
      accountingNote: note,
      accountingNoteUpdatedAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    
    console.log('✅ Accounting note saved successfully');
  } catch (error) {
    console.error('❌ Failed to save accounting note:', error);
    throw error;
  }
}

/**
 * Mark load as invoiced and update status
 */
export async function markLoadAsInvoiced(loadDocId) {
  console.log('📧 Marking load as invoiced:', loadDocId);
  
  try {
    await updateDoc(doc(db, "loads", loadDocId), {
      invoiceStatus: 'invoiced',
      invoicedAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    
    console.log('✅ Load marked as invoiced successfully');
  } catch (error) {
    console.error('❌ Failed to mark load as invoiced:', error);
    throw error;
  }
}

/**
 * ⭐ UPDATED: Email invoice to broker with optional BOL attachment
 */
export async function emailInvoiceToBoker(load, brokerEmail, invoicePdfBlob = null, bolPdfBlob = null) {
  console.log('📧 Emailing documents for load:', load.load_id, 'to:', brokerEmail);
  console.log('📧 Include Invoice:', invoicePdfBlob !== null);
  console.log('📧 Include BOL:', bolPdfBlob !== null);
  
  if (!invoicePdfBlob && !bolPdfBlob) {
    throw new Error('At least one document (Invoice or BOL) must be provided');
  }

  try {
    let base64Invoice = null;
    if (invoicePdfBlob) {
      base64Invoice = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64 = reader.result.split(',')[1];
          resolve(base64);
        };
        reader.onerror = () => reject(new Error('Failed to read Invoice PDF'));
        reader.readAsDataURL(invoicePdfBlob);
      });
    }
    
    let base64BOL = null;
    if (bolPdfBlob) {
      base64BOL = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64 = reader.result.split(',')[1];
          resolve(base64);
        };
        reader.onerror = () => reject(new Error('Failed to read BOL PDF'));
        reader.readAsDataURL(bolPdfBlob);
      });
      console.log('✅ BOL PDF converted to base64');
    }
    
    const functions = getFunctions();
    const sendInvoiceEmail = httpsCallable(functions, 'sendInvoiceEmail');
    
    const result = await sendInvoiceEmail({
      brokerEmail: brokerEmail,
      loadId: load.load_id,
      invoicePdfBase64: base64Invoice,
      bolPdfBase64: base64BOL,
      companyName: load.companyName || 'LoadMemo',
      companyId: load.companyId || null,
      amount: load.amount,
      pickupLocation: load.pickupLocation,
      deliveryLocation: load.deliveryLocation
    });
    
    console.log('✅ Email sent successfully:', result.data);
    
    if (result.data.cc) {
      console.log('✅ CC sent to company:', result.data.cc);
    }
    
    if (result.data.includedBOL) {
      console.log('✅ BOL was included in the email');
    }
    
    return result.data;
    
  } catch (error) {
    console.error('❌ Failed to send invoice email:', error);
    throw new Error(error.message || 'Failed to send email');
  }
}