// functions/src/brokers/mergeBrokers.js
const functions = require("firebase-functions");
const cors = require("cors")({ origin: true });
const { db, admin } = require("../../config/firebase");
const { normalizeBrokerName } = require("../../services/broker");

module.exports = functions.https.onRequest(async (req, res) => {
  cors(req, res, async () => {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method Not Allowed. Use POST." });
    }

    // =========================================================================
    // 1. AUTHENTICATE & AUTHORIZE
    // =========================================================================
    let decodedToken;
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({ error: "Missing or invalid authorization header." });
      }
      const idToken = authHeader.split("Bearer ")[1];
      decodedToken = await admin.auth().verifyIdToken(idToken);
    } catch (authError) {
      functions.logger.error("Auth failed:", authError.message);
      return res.status(401).json({ error: "Authentication failed." });
    }

    // Get user profile and check role
    let userProfile;
    try {
      const userDoc = await db.collection("users").doc(decodedToken.uid).get();
      if (!userDoc.exists) {
        return res.status(403).json({ error: "User profile not found." });
      }
      userProfile = userDoc.data();

      // Check for admin roles
      const userRoles = Array.isArray(userProfile.role)
        ? userProfile.role
        : [userProfile.role];

      const allowedRoles = ["Super Admin", "Admin"];
      const hasPermission = userRoles.some((r) => allowedRoles.includes(r));

      if (!hasPermission) {
        functions.logger.warn(`User ${decodedToken.uid} attempted merge without permission. Roles: ${userRoles}`);
        return res.status(403).json({ error: "Only Super Admin and Admin can merge brokers." });
      }
    } catch (profileError) {
      functions.logger.error("Profile lookup failed:", profileError.message);
      return res.status(500).json({ error: "Failed to verify user permissions." });
    }

    // =========================================================================
    // 2. VALIDATE INPUT
    // =========================================================================
    const { primaryBrokerId, secondaryBrokerIds, tenantId } = req.body;

    if (!primaryBrokerId || typeof primaryBrokerId !== "string") {
      return res.status(400).json({ error: "primaryBrokerId is required." });
    }

    if (!Array.isArray(secondaryBrokerIds) || secondaryBrokerIds.length === 0) {
      return res.status(400).json({ error: "secondaryBrokerIds must be a non-empty array." });
    }

    if (!tenantId || typeof tenantId !== "string") {
      return res.status(400).json({ error: "tenantId is required." });
    }

    // Verify tenant matches user
    if (userProfile.tenantId !== tenantId) {
      return res.status(403).json({ error: "Tenant mismatch." });
    }

    // Make sure primary is not in secondary list
    if (secondaryBrokerIds.includes(primaryBrokerId)) {
      return res.status(400).json({ error: "Primary broker cannot be in the secondary list." });
    }

    const allBrokerIds = [primaryBrokerId, ...secondaryBrokerIds];

    functions.logger.log(`🔀 MERGE REQUEST: Primary="${primaryBrokerId}", Secondaries=${JSON.stringify(secondaryBrokerIds)}, Tenant=${tenantId}`);

    try {
      // =========================================================================
      // 3. FETCH ALL BROKER DOCS & VALIDATE OWNERSHIP
      // =========================================================================
      const brokerDocs = {};
      for (const brokerId of allBrokerIds) {
        const brokerDoc = await db.collection("brokers").doc(brokerId).get();
        if (!brokerDoc.exists) {
          return res.status(404).json({ error: `Broker not found: ${brokerId}` });
        }
        const data = brokerDoc.data();
        if (data.tenantId !== tenantId) {
          return res.status(403).json({ error: `Broker ${brokerId} does not belong to your tenant.` });
        }
        brokerDocs[brokerId] = data;
      }

      const primaryBroker = brokerDocs[primaryBrokerId];
      functions.logger.log(`✅ Primary broker: "${primaryBroker.name}"`);

      // =========================================================================
      // 4. MERGE CONTACT DETAILS (fill gaps from secondaries)
      // =========================================================================
      const mergedFields = {};

      // Fill missing fields from secondary brokers (first non-empty wins)
      const fieldsToMerge = ["phone", "email", "address"];
      for (const field of fieldsToMerge) {
        if (!primaryBroker[field]) {
          for (const secId of secondaryBrokerIds) {
            if (brokerDocs[secId][field]) {
              mergedFields[field] = brokerDocs[secId][field];
              functions.logger.log(`  📋 Filling ${field} from secondary "${brokerDocs[secId].name}": ${brokerDocs[secId][field]}`);
              break;
            }
          }
        }
      }

      // =========================================================================
      // 5. FIND ALL LOADS REFERENCING SECONDARY BROKERS
      // =========================================================================
      let totalLoadsUpdated = 0;
      const MAX_BATCH_SIZE = 500;

      for (const secId of secondaryBrokerIds) {
        const secBroker = brokerDocs[secId];
        functions.logger.log(`🔍 Finding loads for secondary broker: "${secBroker.name}" (${secId})`);

        // Query loads by brokerId
        const loadsByIdQuery = db.collection("loads")
          .where("tenantId", "==", tenantId)
          .where("brokerId", "==", secId);

        const loadsByIdSnapshot = await loadsByIdQuery.get();

        // Also query by brokerName (some loads might only have name, not ID)
        const loadsByNameQuery = db.collection("loads")
          .where("tenantId", "==", tenantId)
          .where("brokerName", "==", secBroker.name);

        const loadsByNameSnapshot = await loadsByNameQuery.get();

        // Deduplicate load IDs
        const loadIdsToUpdate = new Set();
        loadsByIdSnapshot.docs.forEach((d) => loadIdsToUpdate.add(d.id));
        loadsByNameSnapshot.docs.forEach((d) => loadIdsToUpdate.add(d.id));

        functions.logger.log(`  📦 Found ${loadIdsToUpdate.size} loads to reassign`);

        // Batch update loads
        const loadIds = Array.from(loadIdsToUpdate);
        for (let i = 0; i < loadIds.length; i += MAX_BATCH_SIZE) {
          const batch = db.batch();
          const chunk = loadIds.slice(i, i + MAX_BATCH_SIZE);

          for (const loadId of chunk) {
            const loadRef = db.collection("loads").doc(loadId);
            batch.update(loadRef, {
              brokerId: primaryBrokerId,
              brokerName: primaryBroker.name,
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
              lastMergedFrom: secBroker.name,
              lastMergedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
          }

          await batch.commit();
          totalLoadsUpdated += chunk.length;
          functions.logger.log(`  ✅ Updated batch of ${chunk.length} loads`);
        }
      }

      // =========================================================================
      // 6. UPDATE PRIMARY BROKER WITH MERGED FIELDS
      // =========================================================================
      const primaryUpdate = {
        ...mergedFields,
        nameLower: normalizeBrokerName(primaryBroker.name),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        lastMergeAction: {
          mergedFrom: secondaryBrokerIds.map((id) => ({
            id,
            name: brokerDocs[id].name,
          })),
          mergedAt: admin.firestore.FieldValue.serverTimestamp(),
          mergedBy: decodedToken.uid,
          loadsReassigned: totalLoadsUpdated,
        },
      };

      await db.collection("brokers").doc(primaryBrokerId).update(primaryUpdate);
      functions.logger.log(`✅ Updated primary broker with merged fields`);

      // =========================================================================
      // 7. ALSO UPDATE brokerFactoringRules IF ANY REFERENCE SECONDARY BROKERS
      // =========================================================================
      for (const secId of secondaryBrokerIds) {
        const factoringQuery = db.collection("brokerFactoringRules")
          .where("tenantId", "==", tenantId)
          .where("brokerId", "==", secId);

        const factoringSnapshot = await factoringQuery.get();

        if (!factoringSnapshot.empty) {
          const batch = db.batch();
          factoringSnapshot.docs.forEach((facDoc) => {
            batch.update(facDoc.ref, {
              brokerId: primaryBrokerId,
              brokerName: primaryBroker.name,
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
              mergedFrom: secId,
            });
          });
          await batch.commit();
          functions.logger.log(`  📊 Reassigned ${factoringSnapshot.size} factoring rules from ${secId}`);
        }
      }

      // =========================================================================
      // 8. DELETE SECONDARY BROKERS
      // =========================================================================
      const deleteBatch = db.batch();
      for (const secId of secondaryBrokerIds) {
        deleteBatch.delete(db.collection("brokers").doc(secId));
      }
      await deleteBatch.commit();
      functions.logger.log(`🗑️ Deleted ${secondaryBrokerIds.length} secondary broker(s)`);

      // =========================================================================
      // 9. AUDIT LOG
      // =========================================================================
      await db.collection("auditLogs").add({
        userId: decodedToken.uid,
        userEmail: decodedToken.email || userProfile.email,
        action: "BROKERS_MERGED",
        targetType: "broker",
        targetId: primaryBrokerId,
        details: {
          primaryBrokerName: primaryBroker.name,
          primaryBrokerId: primaryBrokerId,
          mergedBrokers: secondaryBrokerIds.map((id) => ({
            id,
            name: brokerDocs[id].name,
          })),
          loadsReassigned: totalLoadsUpdated,
          fieldsMerged: Object.keys(mergedFields),
        },
        tenantId: tenantId,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
      });

      // =========================================================================
      // 10. RETURN RESULT
      // =========================================================================
      const result = {
        success: true,
        primaryBroker: {
          id: primaryBrokerId,
          name: primaryBroker.name,
        },
        mergedBrokers: secondaryBrokerIds.map((id) => ({
          id,
          name: brokerDocs[id].name,
        })),
        loadsReassigned: totalLoadsUpdated,
        fieldsMerged: Object.keys(mergedFields),
      };

      functions.logger.log(`✅ MERGE COMPLETE:`, result);

      return res.status(200).json(result);
    } catch (error) {
      functions.logger.error("❌ Merge failed:", error);
      return res.status(500).json({
        error: "Merge failed: " + error.message,
      });
    }
  });
});