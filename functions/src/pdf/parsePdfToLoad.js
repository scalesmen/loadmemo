// src/pdf/parsePdfToLoad.js - Updated with Broker Factoring Integration

const functions = require("firebase-functions");
const cors = require('cors')({ origin: true });
const { storage, admin } = require('../../config/firebase');
const { verifyAuthToken, getUserProfile } = require('../../utils/auth');
const { validatePdfParsingInput } = require('../../utils/validation');
const { extractDataFromPDF } = require('../../services/gemini');
const { createBrokerIfNotExists } = require('../../services/broker');
const { calculateMileage } = require('../../services/mileage');
const { applyFactoringToLoad } = require('../../services/factoring'); // 🆕 NEW: Factoring service

// Define the Gemini API key parameter
const geminiApiKeyParam = functions.params.defineString("GEMINI_API_KEY");

module.exports = functions.https.onRequest(async (req, res) => {
  cors(req, res, async () => {
    if (req.method !== "POST") {
      functions.logger.warn(`Method Not Allowed: ${req.method} for parsePdfToLoad.`);
      return res.status(405).json({ error: "Method Not Allowed. Please use POST." });
    }

    const { filePathInStorage, originalFileName, tenantId, userId, userEmail, commodityType } = req.body;
    
    // Validate input data
    try {
      validatePdfParsingInput(req.body);
    } catch (validationError) {
      functions.logger.error("Input validation failed:", validationError.message);
      return res.status(400).json({ error: "Invalid input: " + validationError.message });
    }

    // Verify authentication token
    let decodedToken;
    try {
      decodedToken = await verifyAuthToken(req);
    } catch (authError) {
      functions.logger.error("Authentication failed:", authError.message);
      return res.status(401).json({ error: "Authentication required: " + authError.message });
    }

    // Verify the user in the token matches the user in the request body
    if (decodedToken.uid !== userId) {
      functions.logger.error("User ID mismatch. Token UID:", decodedToken.uid, "Request UID:", userId);
      return res.status(403).json({ error: "User ID mismatch. Access denied." });
    }

    // Get user profile and verify tenantId
    let userProfile;
    try {
      userProfile = await getUserProfile(decodedToken.uid);
    } catch (profileError) {
      functions.logger.error("Failed to get user profile:", profileError.message);
      return res.status(403).json({ error: "User profile error: " + profileError.message });
    }

    // Verify tenantId matches
    if (userProfile.tenantId !== tenantId) {
      functions.logger.error("TenantId mismatch. User tenant:", userProfile.tenantId, "Request tenant:", tenantId);
      return res.status(403).json({ error: "Tenant access denied." });
    }

    // Check if Gemini API key is available
    const currentApiKey = geminiApiKeyParam.value();
    if (!currentApiKey) {
      functions.logger.error("parsePdfToLoad: Gemini API key parameter is not set.");
      return res.status(500).json({ error: "AI service is not configured on the server." });
    }

    // Log commodity type for debugging
    functions.logger.log(`parsePdfToLoad: Processing PDF for tenant ${tenantId}, commodity type: ${commodityType || 'auto'}`);

    try {
      const bucket = storage.bucket();
      const file = bucket.file(filePathInStorage);

      const [exists] = await file.exists();
      if (!exists) {
        functions.logger.error(`File not found in Storage at path: ${filePathInStorage}`);
        return res.status(404).json({ error: `File not found at specified path: ${filePathInStorage}` });
      }

      // Check file size before downloading
      const [metadata] = await file.getMetadata();
      const fileSizeBytes = parseInt(metadata.size);
      const maxSizeBytes = 50 * 1024 * 1024; // 50MB limit

      if (fileSizeBytes > maxSizeBytes) {
        functions.logger.error(`File too large: ${fileSizeBytes} bytes`);
        return res.status(413).json({ 
          error: `File too large. Maximum size allowed is 50MB` 
        });
      }

      const [pdfBuffer] = await file.download();
      functions.logger.log(`Successfully downloaded PDF: ${filePathInStorage}, Size: ${pdfBuffer.length} bytes`);

      // Extract data using Gemini service
      const extractedData = await extractDataFromPDF(pdfBuffer, commodityType, currentApiKey);
      functions.logger.log("Successfully extracted data with Gemini:", extractedData);

      // 🆕 MAP LOADBOARD SOURCE TO SOURCE TYPE
      const loadboardSourceMap = {
  'super_dispatch': 'super_dispatch_pdf',
  'central_dispatch': 'central_dispatch_pdf',
  'carsarrive': 'carsarrive_pdf',
  'ship_cars': 'ship_cars_pdf',
  'acv_transport': 'acv_transport_pdf',
  'runbuggy': 'runbuggy_pdf',
  'direct_freight': 'direct_freight_pdf',
  'montway': 'montway_pdf',
  'carpool': 'carpool_pdf',
  'copart': 'copart_pdf',
  'carvana': 'carvana_pdf',
  'haulex': 'haulex_pdf',
  'rpm': 'rpm_pdf',
  'autosled': 'autosled_pdf',
  'acertus': 'acertus_pdf',
  'unknown': 'pdf_upload'
};

      const sourceType = loadboardSourceMap[extractedData.loadboardSource] || 'pdf_upload';
      functions.logger.log(`📄 Loadboard detected: ${extractedData.loadboardSource} → sourceType: ${sourceType}`);

      // Remove the loadboardSource field as we've converted it to sourceType
      delete extractedData.loadboardSource;

      // Auto-create broker if extracted from PDF (with contact details)
      if (extractedData.brokerName) {
        functions.logger.log(`Gemini extracted broker: "${extractedData.brokerName}"`);
        
        // Pass broker contact details to createBrokerIfNotExists
        const brokerContactDetails = {
          phone: extractedData.brokerPhone || null,
          email: extractedData.brokerEmail || null,
          address: extractedData.brokerAddress || null,
        };
        
        functions.logger.log(`📋 Broker contact details from PDF:`, brokerContactDetails);
        
        const brokerId = await createBrokerIfNotExists(
          extractedData.brokerName, 
          tenantId,
          brokerContactDetails
        );
        
        if (brokerId) {
          extractedData.brokerId = brokerId;
          functions.logger.log(`✅ Broker ready for load creation: ${brokerId}`);
        } else {
          functions.logger.warn(`⚠️ Could not create/find broker: "${extractedData.brokerName}"`);
        }
        
        // Clean up broker contact fields from load data (they belong to broker, not load)
        delete extractedData.brokerPhone;
        delete extractedData.brokerEmail;
        delete extractedData.brokerAddress;
      }

      // ============================================================
      // 🆕 NEW: Apply Broker Factoring Rules
      // ============================================================
      if (extractedData.brokerId && extractedData.amount) {
        functions.logger.log(`💰 Checking factoring rules for broker: ${extractedData.brokerId}`);
        
        try {
          const dataWithFactoring = await applyFactoringToLoad(extractedData, tenantId);
          
          if (dataWithFactoring.factoringApplied) {
            functions.logger.log(`✅ Factoring applied: ${dataWithFactoring.factoringPercentage}% = $${dataWithFactoring.factoringAmount} fee`);
            functions.logger.log(`✅ Driver pay calculated: $${dataWithFactoring.driverPay || dataWithFactoring.driverCollectionAmount}`);
            
            // Copy factoring data back to extractedData
            Object.assign(extractedData, dataWithFactoring);
          } else {
            functions.logger.log(`📊 No factoring rule applied for this broker`);
          }
        } catch (factoringError) {
          functions.logger.warn(`⚠️ Factoring calculation failed (non-fatal): ${factoringError.message}`);
          // Continue without factoring - non-fatal error
        }
      }
      // ============================================================

      // Auto-calculate mileage if not extracted from PDF
      if (extractedData.pickupLocation && extractedData.deliveryLocation && !extractedData.mileage) {
        const mileage = await calculateMileage(extractedData.pickupLocation, extractedData.deliveryLocation);
        if (mileage) {
          extractedData.mileage = mileage;
        }
      }

      // Add tenant and user information to the extracted data
      extractedData.tenantId = tenantId;
      extractedData.createdBy = userId;
      extractedData.createdByEmail = userEmail;
      extractedData.createdAt = admin.firestore.FieldValue.serverTimestamp();
      extractedData.updatedAt = admin.firestore.FieldValue.serverTimestamp();
      extractedData.status = "Booked";
      // Map carrierName from PDF to companyName — ONLY if it matches an existing
      // company in this tenant (case-insensitive). Otherwise leave empty so the
      // driver's assigned company applies by default.
      if (extractedData.carrierName && !extractedData.companyName) {
        try {
          const normalize = (s) => (s || '')
            .toLowerCase()
            .replace(/[.,]/g, '')
            .replace(/\b(llc|inc|corp|corporation|co|ltd|company)\b/g, '')
            .replace(/\s+/g, ' ')
            .trim();

          const rawCarrier = extractedData.carrierName;
          const targetExact = rawCarrier.toLowerCase().trim();
          const targetNorm = normalize(rawCarrier);

          const companiesSnap = await admin.firestore()
            .collection('companies')
            .where('tenantId', '==', tenantId)
            .get();

          let matchDoc = companiesSnap.docs.find(
            d => (d.data().name || '').toLowerCase().trim() === targetExact
          );
          if (!matchDoc && targetNorm) {
            matchDoc = companiesSnap.docs.find(
              d => normalize(d.data().name) === targetNorm
            );
          }

          if (matchDoc) {
            extractedData.companyName = matchDoc.data().name; // canonical spelling
            extractedData.companyId = matchDoc.id;
            functions.logger.log(`🏢 Carrier "${rawCarrier}" matched tenant company: "${matchDoc.data().name}" (${matchDoc.id})`);
          } else {
            functions.logger.log(`🏢 Carrier "${rawCarrier}" not found in tenant companies — leaving companyName empty (driver default will apply)`);
          }
        } catch (companyMatchError) {
          functions.logger.warn(`⚠️ Carrier-to-company matching failed (non-fatal): ${companyMatchError.message}`);
        }
      }
      delete extractedData.carrierName;
      extractedData.commodityType = commodityType || 'auto';
      
      // ADD SOURCE TYPE TO RESPONSE
      extractedData.sourceType = sourceType;

      // ============================================================
      // Generate PDF download URL and include metadata for auto-attachment
      // ============================================================
     let pdfDownloadUrl = null;
try {
  const { getDownloadURL } = require('firebase-admin/storage');
  pdfDownloadUrl = await getDownloadURL(file);
  functions.logger.log(`📎 Generated permanent download URL for PDF attachment`);
} catch (urlError) {
  functions.logger.warn(`⚠️ Could not generate download URL: ${urlError.message}`);
}
      // Add PDF metadata for frontend to use when creating the load
      extractedData.attachedPdfMetadata = {
        originalStoragePath: filePathInStorage,
        originalFileName: originalFileName,
        fileType: 'application/pdf',
        downloadUrl: pdfDownloadUrl,
        uploadedAt: new Date().toISOString(),
        uploadedBy: userEmail,
        uploadedById: userId,
        documentType: 'dispatch' // Will be attached as a dispatch document
      };
      
      functions.logger.log(`📎 PDF metadata included for auto-attachment:`, {
        path: filePathInStorage,
        fileName: originalFileName,
        hasUrl: !!pdfDownloadUrl
      });
      // ============================================================

      functions.logger.log("Final extracted data with tenant info:", extractedData);

      return res.status(200).json(extractedData);

    } catch (error) {
      functions.logger.error(`Critical error in 'parsePdfToLoad' for ${filePathInStorage}:`, error);
      let errorMessage = "Internal Server Error while processing PDF with AI.";
      if (error.message) {
        errorMessage += ` Details: ${error.message}`;
      }
      if (error.stack) {
        functions.logger.error("Error stack:", error.stack);
      }
      return res.status(500).json({ error: errorMessage, details: error.toString() });
    }
  });
});