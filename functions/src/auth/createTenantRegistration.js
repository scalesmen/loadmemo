// functions/src/auth/createTenantRegistration.js
// Called immediately after Firebase Auth creates user
// Creates Firestore documents server-side to avoid permission issues

const functions = require('firebase-functions/v2');
const admin = require('firebase-admin');

const db = admin.firestore();

exports.createTenantRegistration = functions.https.onCall(
  {
    timeoutSeconds: 30,
    memory: '256MiB',
    region: 'us-central1',
  },
  async (request) => {
    // Verify user is authenticated
    if (!request.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'Must be authenticated to register'
      );
    }

    const userId = request.auth.uid;
    const email = request.auth.token.email;

    const { companyName, contactName, phone, notes } = request.data;

    // Validate required fields
    if (!companyName || !contactName) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Company name and contact name are required'
      );
    }

    console.log(`📝 Creating registration for ${companyName} (${email})`);

    try {
      // Create user document
      await db.collection('users').doc(userId).set({
        email: email.toLowerCase().trim(),
        role: null,  // ✅ Will be set during approval
        status: 'pending_approval',
        active: false,
        companyName: companyName.trim(),
        contactName: contactName.trim(),
        phone: phone?.trim() || '',
        notes: notes?.trim() || '',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      // Create tenant_registration document
      await db.collection('tenant_registrations').doc(userId).set({
        userId: userId,
        companyName: companyName.trim(),
        contactName: contactName.trim(),
        adminEmail: email.toLowerCase().trim(),
        phone: phone?.trim() || '',
        notes: notes?.trim() || '',
        status: 'pending_approval',
        submittedAt: admin.firestore.FieldValue.serverTimestamp(),
        approvedAt: null,
        tenantId: null
      });

      console.log(`✅ Registration created for ${companyName}`);
      
      return { 
        success: true, 
        userId: userId,
        message: 'Registration created successfully'
      };

    } catch (error) {
      console.error('❌ Registration error:', error);
      throw new functions.https.HttpsError(
        'internal',
        'Failed to complete registration: ' + error.message
      );
    }
  }
);