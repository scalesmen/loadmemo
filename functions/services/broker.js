// services/broker.js - Optimized with indexed case-insensitive matching

const { db, admin } = require('../config/firebase');
const functions = require('firebase-functions');

/**
 * Normalize broker name for duplicate-proof matching
 * Strips ALL non-alphanumeric characters so variations match:
 *   "Central Dispatch"      → "centraldispatch"
 *   "CentralDispatch"       → "centraldispatch"
 *   "CENTRAL DISPATCH"      → "centraldispatch"
 *   "Central Dispatch, LLC" → "centraldispatchllc"
 *   "J.B. Hunt"             → "jbhunt"
 *   "J B Hunt"              → "jbhunt"
 * 
 * @param {string} name - Broker name
 * @returns {string} - Normalized key (lowercase, alphanumeric only)
 */
function normalizeBrokerName(name) {
  if (!name) return '';
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '') // Strip EVERYTHING except letters and numbers
    .trim();
}

/**
 * Create a new broker if it doesn't exist, or update missing fields if it does
 * Uses indexed `nameLower` field for fast case-insensitive matching
 * 
 * @param {string} brokerName - Broker/Shipper name from PDF
 * @param {string} tenantId - Tenant ID
 * @param {Object} contactDetails - Optional contact details extracted from PDF
 * @param {string} contactDetails.phone - Broker phone number
 * @param {string} contactDetails.email - Broker email address
 * @param {string} contactDetails.address - Broker address
 * @returns {string|null} - Broker document ID or null if failed
 */
async function createBrokerIfNotExists(brokerName, tenantId, contactDetails = {}) {
  if (!brokerName || !brokerName.trim()) {
    functions.logger.log("No broker name provided, skipping auto-creation");
    return null;
  }

  const trimmedBrokerName = brokerName.trim();
  const normalizedName = normalizeBrokerName(brokerName);
  
  // Clean up contact details
  const cleanedContact = {
    phone: contactDetails.phone?.trim() || '',
    email: contactDetails.email?.trim() || '',
    address: contactDetails.address?.trim() || '',
  };

  functions.logger.log(`🔍 Looking for broker: "${trimmedBrokerName}" (normalized: "${normalizedName}")`);

  try {
    // =========================================================================
    // OPTIMIZED: Query using indexed nameLower field (fast!)
    // =========================================================================
    let existingBrokerDoc = null;
    
    // Primary lookup: Query by nameLower (indexed, fast, handles all variations)
    const nameLowerQuery = db.collection("brokers")
      .where("nameLower", "==", normalizedName)
      .where("tenantId", "==", tenantId)
      .limit(1);
    
    const nameLowerSnapshot = await nameLowerQuery.get();
    
    if (!nameLowerSnapshot.empty) {
      existingBrokerDoc = nameLowerSnapshot.docs[0];
      functions.logger.log(`✅ Found broker via nameLower index`);
    } else {
      // Fallback: Try exact name match (for legacy brokers without nameLower)
      const exactNameQuery = db.collection("brokers")
        .where("name", "==", trimmedBrokerName)
        .where("tenantId", "==", tenantId)
        .limit(1);
      
      const exactNameSnapshot = await exactNameQuery.get();
      
      if (!exactNameSnapshot.empty) {
        existingBrokerDoc = exactNameSnapshot.docs[0];
        functions.logger.log(`✅ Found broker via exact name match (legacy)`);
      }
    }
    
    // =========================================================================
    // BROKER EXISTS - Update missing fields
    // =========================================================================
    if (existingBrokerDoc) {
      const existingData = existingBrokerDoc.data();
      const brokerId = existingBrokerDoc.id;
      
      functions.logger.log(`✅ Broker "${trimmedBrokerName}" exists (ID: ${brokerId})`);
      
      // Build update object for missing fields only
      const updateFields = {};
      
      // Add/update nameLower if missing or outdated (re-normalize legacy brokers)
      if (!existingData.nameLower || existingData.nameLower !== normalizedName) {
        updateFields.nameLower = normalizedName;
        functions.logger.log(`  🔄 Migrating: updating nameLower index`);
      }
      
      // Only update if existing field is empty AND new data has value
      if (!existingData.phone && cleanedContact.phone) {
        updateFields.phone = cleanedContact.phone;
        functions.logger.log(`  📞 Adding missing phone: ${cleanedContact.phone}`);
      }
      
      if (!existingData.email && cleanedContact.email) {
        updateFields.email = cleanedContact.email;
        functions.logger.log(`  📧 Adding missing email: ${cleanedContact.email}`);
      }
      
      if (!existingData.address && cleanedContact.address) {
        updateFields.address = cleanedContact.address;
        functions.logger.log(`  📍 Adding missing address: ${cleanedContact.address}`);
      }
      
      // If there are fields to update, do it
      if (Object.keys(updateFields).length > 0) {
        updateFields.updatedAt = admin.firestore.FieldValue.serverTimestamp();
        updateFields.lastUpdatedFrom = 'pdf_import_auto';
        
        await db.collection("brokers").doc(brokerId).update(updateFields);
        
        functions.logger.log(`✅ Updated broker with fields:`, Object.keys(updateFields));
      } else {
        functions.logger.log(`ℹ️ Broker already complete, no updates needed`);
      }
      
      return brokerId;
    }

    // =========================================================================
    // NEW BROKER - Create with all available details
    // =========================================================================
    functions.logger.log(`🆕 Creating new broker: "${trimmedBrokerName}" for tenant ${tenantId}`);
    
    const newBrokerData = {
      name: trimmedBrokerName,
      nameLower: normalizedName,  // Normalized key for duplicate-proof lookups
      phone: cleanedContact.phone,
      email: cleanedContact.email,
      address: cleanedContact.address,
      tenantId: tenantId,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      createdBy: 'pdf_import_auto',
      autoCreated: true
    };

    const newBrokerRef = await db.collection("brokers").add(newBrokerData);
    
    functions.logger.log(`✅ Created broker "${trimmedBrokerName}" (ID: ${newBrokerRef.id})`, {
      hasPhone: !!cleanedContact.phone,
      hasEmail: !!cleanedContact.email,
      hasAddress: !!cleanedContact.address
    });
    
    return newBrokerRef.id;
    
  } catch (error) {
    functions.logger.error("Error in createBrokerIfNotExists:", error);
    return null;
  }
}

/**
 * Migration utility: Add/update nameLower on all existing brokers for a tenant
 * Uses the NEW normalization (strips all non-alphanumeric chars)
 * Run this once per tenant after deploying the updated normalization
 * 
 * @param {string} tenantId - Tenant ID to migrate
 * @returns {Object} - Migration results
 */
async function migrateBrokersAddNameLower(tenantId) {
  if (!tenantId) {
    throw new Error("tenantId is required");
  }

  functions.logger.log(`🔄 Starting broker migration for tenant: ${tenantId}`);
  
  try {
    const brokersQuery = db.collection("brokers")
      .where("tenantId", "==", tenantId);
    
    const snapshot = await brokersQuery.get();
    
    let migratedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;
    let duplicatesFound = [];
    
    // =========================================================================
    // PHASE 1: Detect duplicates BEFORE updating
    // =========================================================================
    const nameKeyMap = {}; // normalizedName → [{ id, name }]
    
    for (const docSnap of snapshot.docs) {
      const data = docSnap.data();
      if (!data.name) {
        errorCount++;
        continue;
      }
      
      const normalized = normalizeBrokerName(data.name);
      
      if (!nameKeyMap[normalized]) {
        nameKeyMap[normalized] = [];
      }
      nameKeyMap[normalized].push({
        id: docSnap.id,
        name: data.name
      });
    }
    
    // Find groups with duplicates
    for (const [normalized, entries] of Object.entries(nameKeyMap)) {
      if (entries.length > 1) {
        duplicatesFound.push({
          normalizedName: normalized,
          count: entries.length,
          brokers: entries.map(e => ({ id: e.id, name: e.name }))
        });
      }
    }
    
    if (duplicatesFound.length > 0) {
      functions.logger.warn(`⚠️ Found ${duplicatesFound.length} duplicate broker groups:`);
      duplicatesFound.forEach(dup => {
        functions.logger.warn(`  "${dup.normalizedName}" → ${dup.count} entries: ${dup.brokers.map(b => `"${b.name}" (${b.id})`).join(', ')}`);
      });
    }
    
    // =========================================================================
    // PHASE 2: Update nameLower on ALL brokers (re-normalize with new logic)
    // =========================================================================
    let batch = db.batch();
    let batchCount = 0;
    const MAX_BATCH_SIZE = 500;
    
    for (const docSnap of snapshot.docs) {
      const data = docSnap.data();
      
      if (!data.name) {
        continue;
      }
      
      const newNormalized = normalizeBrokerName(data.name);
      
      // Update if nameLower is missing OR different from new normalization
      if (data.nameLower !== newNormalized) {
        batch.update(docSnap.ref, { 
          nameLower: newNormalized,
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        migratedCount++;
        batchCount++;
        
        if (batchCount >= MAX_BATCH_SIZE) {
          await batch.commit();
          functions.logger.log(`  Committed batch of ${batchCount} brokers`);
          batch = db.batch();
          batchCount = 0;
        }
      } else {
        skippedCount++;
      }
    }
    
    // Commit remaining
    if (batchCount > 0) {
      await batch.commit();
    }
    
    const results = {
      total: snapshot.size,
      migrated: migratedCount,
      skipped: skippedCount,
      errors: errorCount,
      duplicatesFound: duplicatesFound
    };
    
    functions.logger.log(`✅ Migration complete:`, results);
    
    return results;
    
  } catch (error) {
    functions.logger.error("Migration error:", error);
    throw error;
  }
}

module.exports = { 
  createBrokerIfNotExists,
  migrateBrokersAddNameLower,
  normalizeBrokerName
};