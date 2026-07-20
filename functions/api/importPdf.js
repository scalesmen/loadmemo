// functions/api/importPdf.js
const { onRequest } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const pdf = require('pdf-parse');
const { COMMODITY_PROMPTS } = require('../config/constants');

// Initialize Gemini with environment variable or config
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

exports.importPdf = onRequest(
  { 
    timeoutSeconds: 120,
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
        console.error('Missing authorization header');
        return res.status(401).json({ error: 'Missing or invalid authorization header' });
      }

      const apiKey = authHeader.split(' ')[1];
      console.log('API Key prefix:', apiKey.substring(0, 7));
      
      // Look up API key in Firestore
      const apiKeysSnapshot = await admin.firestore()
        .collection('apiKeys')
        .where('apiKey', '==', apiKey)
        .where('status', '==', 'active')
        .limit(1)
        .get();

      if (apiKeysSnapshot.empty) {
        console.error('Invalid API key');
        return res.status(401).json({ error: 'Invalid or revoked API key' });
      }

      const apiKeyDoc = apiKeysSnapshot.docs[0];
      const apiKeyData = apiKeyDoc.data();
      const tenantId = apiKeyData.tenantId;

      console.log('API Key validated for tenant:', tenantId);

      // Update last used
      await apiKeyDoc.ref.update({
        lastUsed: admin.firestore.FieldValue.serverTimestamp(),
        lastUsedBy: 'chrome_extension'
      });

      // 2. Get tenant settings to determine commodity type
      const tenantSettingsDoc = await admin.firestore()
        .doc(`tenantSettings/${tenantId}`)
        .get();
      
      const tenantSettings = tenantSettingsDoc.data() || {};
      const commodityTypes = tenantSettings.commodityTypes || ['automobile_hauling'];
      
      // Map commodity types to prompt keys
      const commodityMap = {
        'automobile_hauling': 'auto',
        'dry_van': 'dryvan',
        'reefer': 'reefer',
        'flatbed': 'flatbed',
        'tanker': 'tanker'
      };
      
      // Use the first commodity type or default to auto
      const primaryCommodity = commodityMap[commodityTypes[0]] || 'auto';
      const commodityPrompt = COMMODITY_PROMPTS[primaryCommodity] || COMMODITY_PROMPTS.auto;

      console.log('Using commodity type:', primaryCommodity);

      // 3. Process PDF
      const { pdf_data, source_url, filename } = req.body;
      
      if (!pdf_data) {
        return res.status(400).json({ error: 'PDF data is required' });
      }

      // Convert base64 to buffer
      const pdfBuffer = Buffer.from(pdf_data, 'base64');
      
      // Extract text from PDF
      let pdfText;
      try {
        const pdfData = await pdf(pdfBuffer);
        pdfText = pdfData.text;
        console.log('PDF text extracted, length:', pdfText.length);
      } catch (pdfError) {
        console.error('PDF parsing error:', pdfError);
        return res.status(400).json({ 
          error: 'Failed to parse PDF', 
          details: pdfError.message 
        });
      }

      // 4. Call Gemini to extract data
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
      
      const prompt = commodityPrompt + '\n\nDocument text:\n' + pdfText;

      console.log('Calling Gemini...');
      const result = await model.generateContent(prompt);
      const response = await result.response;
      let extractedData;
      
      try {
        const responseText = response.text();
        // Clean up the response - remove markdown code blocks if present
        const cleanedText = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        extractedData = JSON.parse(cleanedText);
        console.log('Gemini extraction successful');
      } catch (parseError) {
        console.error('Failed to parse Gemini response:', parseError);
        console.error('Response text:', response.text());
        return res.status(500).json({ 
          error: 'Failed to parse AI response', 
          details: parseError.message 
        });
      }

      // 5. Create load in Firestore
      const loadData = {
        ...extractedData,
        tenantId: tenantId,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        createdBy: 'api_import',
        createdByUserId: 'chrome_extension',
        source: 'chrome_extension',
        sourceUrl: source_url || null,
        filename: filename || 'imported.pdf',
        status: 'draft',
        importedVia: apiKeyData.companyName,
        commodityType: primaryCommodity,
        // Ensure required fields have defaults
        vehicleCount: extractedData.vehicleCount || (extractedData.vehicles ? extractedData.vehicles.length : 0),
        mileage: extractedData.mileage || 0,
        amount: extractedData.amount || 0
      };

      // Clean up null/undefined values
      Object.keys(loadData).forEach(key => {
        if (loadData[key] === undefined) {
          loadData[key] = null;
        }
      });

      console.log('Creating load document...');
      const loadRef = await admin.firestore()
        .collection('loads')
        .add(loadData);

      console.log('Load created:', loadRef.id);

      // 6. Create audit log
      await admin.firestore().collection('auditLogs').add({
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        action: 'LOAD_IMPORTED_FROM_PDF',
        targetType: 'load',
        targetId: loadRef.id,
        tenantId: tenantId,
        userId: 'chrome_extension',
        userEmail: `api_${apiKeyData.companyName}`,
        details: {
          source: 'chrome_extension',
          filename: filename,
          apiKeyUsed: apiKeyData.keyPrefix + '...',
          companyName: apiKeyData.companyName,
          commodityType: primaryCommodity,
          extractedLoadId: extractedData.load_id
        }
      });

      return res.json({
        success: true,
        load_id: loadRef.id,
        message: 'PDF imported successfully',
        extractedData: {
          load_id: extractedData.load_id,
          brokerName: extractedData.brokerName,
          amount: extractedData.amount,
          vehicleCount: loadData.vehicleCount
        }
      });

    } catch (error) {
      console.error('Error importing PDF:', error);
      return res.status(500).json({ 
        error: 'Failed to import PDF', 
        details: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    }
});