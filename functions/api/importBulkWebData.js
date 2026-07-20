// functions/api/importBulkWebData.js
const { onRequest } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const { createBrokerIfNotExists } = require('../services/broker');

exports.importBulkWebData = onRequest(
  { 
    timeoutSeconds: 300, // 5 minutes for bulk operations
    memory: '1GiB',
    cors: true 
  },
  async (req, res) => {
    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }

    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
      // 1. Validate API Key
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Missing or invalid authorization header' });
      }

      const apiKey = authHeader.split(' ')[1];
      
      // Look up API key
      const apiKeysSnapshot = await admin.firestore()
        .collection('apiKeys')
        .where('apiKey', '==', apiKey)
        .where('status', '==', 'active')
        .limit(1)
        .get();

      if (apiKeysSnapshot.empty) {
        return res.status(401).json({ error: 'Invalid or revoked API key' });
      }

      const apiKeyDoc = apiKeysSnapshot.docs[0];
      const apiKeyData = apiKeyDoc.data();
      const tenantId = apiKeyData.tenantId;

      // 2. Extract the loads array
      const { loads, source, sourceUrl } = req.body;
      
      if (!loads || !Array.isArray(loads)) {
        return res.status(400).json({ error: 'No loads array provided' });
      }

      console.log(`Processing bulk import of ${loads.length} loads for tenant ${tenantId}`);

      // 3. Process each load
      const results = [];
      const batch = admin.firestore().batch();
      const brokerCache = new Map(); // Cache broker lookups

      for (let i = 0; i < loads.length; i++) {
        const loadData = loads[i];
        
        try {
          // Auto-create broker if needed (with caching)
          if (loadData.brokerName && !brokerCache.has(loadData.brokerName)) {
            const brokerId = await createBrokerIfNotExists(loadData.brokerName, tenantId);
            if (brokerId) {
              brokerCache.set(loadData.brokerName, brokerId);
            }
          }
          
          if (brokerCache.has(loadData.brokerName)) {
            loadData.brokerId = brokerCache.get(loadData.brokerName);
          }

          // Prepare load data
          const finalLoadData = {
            ...loadData,
            tenantId: tenantId,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            createdBy: 'web_import_bulk',
            createdByUserId: 'chrome_extension',
            source: source || 'chrome_extension_web_bulk',
            sourceUrl: sourceUrl || loadData.sourceUrl,
            status: 'Booked',
            importedVia: apiKeyData.companyName,
            // Ensure required fields
            vehicleCount: loadData.vehicleCount || 
                         (loadData.vehicles ? loadData.vehicles.length : 0),
            mileage: loadData.mileage || 0,
            amount: loadData.amount || 0,
            // Add batch import metadata
            batchImportId: `batch_${Date.now()}`,
            batchIndex: i
          };

          // Clean up undefined values
          Object.keys(finalLoadData).forEach(key => {
            if (finalLoadData[key] === undefined) {
              finalLoadData[key] = null;
            }
          });

          // Add to batch
          const loadRef = admin.firestore().collection('loads').doc();
          batch.set(loadRef, finalLoadData);
          
          results.push({
            success: true,
            load_id: loadRef.id,
            original_load_id: loadData.load_id,
            index: i
          });

        } catch (error) {
          console.error(`Error processing load ${i}:`, error);
          results.push({
            success: false,
            error: error.message,
            original_load_id: loadData.load_id,
            index: i
          });
        }
      }

      // 4. Commit the batch
      try {
        await batch.commit();
        console.log(`Successfully committed batch of ${results.filter(r => r.success).length} loads`);
      } catch (batchError) {
        console.error('Batch commit failed:', batchError);
        return res.status(500).json({ 
          error: 'Failed to save loads to database', 
          details: batchError.message 
        });
      }

      // 5. Create audit log
      const successCount = results.filter(r => r.success).length;
      await admin.firestore().collection('auditLogs').add({
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        action: 'BULK_LOADS_IMPORTED_FROM_WEB',
        targetType: 'loads',
        targetId: `batch_${Date.now()}`,
        tenantId: tenantId,
        userId: 'chrome_extension',
        userEmail: `api_${apiKeyData.companyName}`,
        details: {
          source: 'chrome_extension_web_bulk',
          sourceUrl: sourceUrl,
          apiKeyUsed: apiKeyData.keyPrefix + '...',
          companyName: apiKeyData.companyName,
          totalLoads: loads.length,
          successfulLoads: successCount,
          failedLoads: loads.length - successCount
        }
      });

      // 6. Return results
      return res.json({
        success: true,
        message: `Imported ${successCount} of ${loads.length} loads`,
        total: loads.length,
        successful: successCount,
        failed: loads.length - successCount,
        results: results
      });

    } catch (error) {
      console.error('Error in bulk import:', error);
      return res.status(500).json({ 
        error: 'Failed to process bulk import', 
        details: error.message 
      });
    }
  }
);