// CHANGE 1: Import specifically from v2/https to match your Gen 2 environment
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require('firebase-admin');
const { v4: uuidv4 } = require('uuid');

// Admin SDK initialization is handled in index.js, so we just use the instances
const bucket = admin.storage().bucket();
const db = admin.firestore();

// CHANGE 2: Use the V2 signature "request" instead of "(data, context)"
exports.uploadSignature = onCall(async (request) => {
  try {
    // CHANGE 3: Unwrap the data properly for Gen 2
    const data = request.data; 
    
    // Now we can access your fields safely
    const { signature, loadId, tenantId, type, signerName, location } = data;

    // --- DEBUG LOGGING (Keep this for safety) ---
    console.log('Received V2 request data:', {
      hasSignature: !!signature,
      signatureLength: signature ? signature.length : 0,
      loadId,
      tenantId,
      type,
      signerName,
      hasLocation: !!location
    });

    // 1. Validate required fields
    const missingFields = [];
    if (!signature) missingFields.push('signature');
    if (!loadId) missingFields.push('loadId');
    if (!tenantId) missingFields.push('tenantId');
    if (!type) missingFields.push('type');
    if (!signerName) missingFields.push('signerName');

    if (missingFields.length > 0) {
      const errorMessage = `Missing required fields: ${missingFields.join(', ')}`;
      console.error(errorMessage);
      throw new HttpsError('invalid-argument', errorMessage);
    }

    // 2. Prepare Buffer
    const base64Data = signature.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');

    // 3. Define File Path
    const fileName = `${type}_signature_${Date.now()}.png`;
    const filePath = `load_signatures/${tenantId}/${loadId}/${fileName}`;
    const file = bucket.file(filePath);

    // 4. Create Token
    const token = uuidv4();

    // 5. Upload
    await file.save(buffer, {
      metadata: {
        contentType: 'image/png',
        metadata: {
          firebaseStorageDownloadTokens: token,
        }
      }
    });

    // 6. Get URL
    const downloadURL = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(filePath)}?alt=media&token=${token}`;

    // 7. Metadata
    const signatureMetadata = {
      url: downloadURL,
      signerName: signerName.trim(),
      capturedAt: admin.firestore.Timestamp.now(),
      clientTimestamp: new Date().toISOString(),
      tenantId,
      platform: 'android',
      uploadedVia: 'cloud-function-v2',
      ...(location && { location }),
    };

    // 8. Update Firestore
    const signatureUrlField = type === 'pickup' ? 'pickupSignatureUrl' : 'deliverySignatureUrl';
    const signatureMetaField = type === 'pickup' ? 'pickupSignatureMetadata' : 'deliverySignatureMetadata';

    await db.collection('loads').doc(loadId).update({
      [signatureUrlField]: downloadURL,
      [signatureMetaField]: signatureMetadata,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return { success: true, downloadURL };

  } catch (error) {
    console.error('uploadSignature FATAL error:', error);
    // Use HttpsError from v2 import
    throw new HttpsError('internal', error.message);
  }
});