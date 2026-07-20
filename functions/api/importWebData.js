// functions/api/importWebData.js
const { onRequest } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const { createBrokerIfNotExists } = require('../services/broker');

exports.importWebData = onRequest(
  { 
    timeoutSeconds: 60,
    memory: '512MiB',
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

      // 2. Extract the processed data
      const { extractedData, source, sourceUrl } = req.body;
      
      if (!extractedData) {
        return res.status(400).json({ error: 'No extracted data provided' });
      }

      // 3. Auto-create broker if needed
      if (extractedData.brokerName) {
        console.log(`Checking/creating broker: "${extractedData.brokerName}"`);
        
        const brokerId = await createBrokerIfNotExists(extractedData.brokerName, tenantId);
        
        if (brokerId) {
          extractedData.brokerId = brokerId;
          console.log(`✅ Broker ready: ${brokerId}`);
        }
      }

      // 4. Prepare load data
      const loadData = {
        ...extractedData,
        tenantId: tenantId,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        createdBy: 'web_import',
        createdByUserId: 'chrome_extension',
        source: source || 'chrome_extension_web',
        sourceUrl: sourceUrl || extractedData.sourceUrl,
        status: 'draft',
        importedVia: apiKeyData.companyName,
        // Ensure required fields
        vehicleCount: extractedData.vehicleCount || 
                     (extractedData.vehicles ? extractedData.vehicles.length : 0),
        mileage: extractedData.mileage || 0,
        amount: extractedData.amount || 0
      };

      // Clean up undefined values
      Object.keys(loadData).forEach(key => {
        if (loadData[key] === undefined) {
          loadData[key] = null;
        }
      });

      // 5. Create the load
      console.log('Creating load document...');
      const loadRef = await admin.firestore()
        .collection('loads')
        .add(loadData);

      console.log('Load created:', loadRef.id);

      // 6. Create audit log
      await admin.firestore().collection('auditLogs').add({
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        action: 'LOAD_IMPORTED_FROM_WEB',
        targetType: 'load',
        targetId: loadRef.id,
        tenantId: tenantId,
        userId: 'chrome_extension',
        userEmail: `api_${apiKeyData.companyName}`,
        details: {
          source: 'chrome_extension_web',
          sourceUrl: sourceUrl,
          apiKeyUsed: apiKeyData.keyPrefix + '...',
          companyName: apiKeyData.companyName,
          commodityType: extractedData.commodityType,
          extractedLoadId: extractedData.load_id,
          brokerName: extractedData.brokerName
        }
      });

      // 7. Return success
      return res.json({
        success: true,
        load_id: loadRef.id,
        message: 'Load imported successfully',
        loadDetails: {
          load_id: extractedData.load_id,
          brokerName: extractedData.brokerName,
          amount: extractedData.amount,
          pickup: extractedData.pickupLocation,
          delivery: extractedData.deliveryLocation,
          vehicleCount: loadData.vehicleCount
        }
      });

    } catch (error) {
      console.error('Error importing web data:', error);
      return res.status(500).json({ 
        error: 'Failed to import data', 
        details: error.message 
      });
    }
  }
);