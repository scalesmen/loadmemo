const functions = require('firebase-functions');
const admin = require('firebase-admin');
const { onCall } = require('firebase-functions/v2/https');

// Initialize admin once
admin.initializeApp();

// Import all functions
const createNewUserFromInvite = require('./src/auth/createUserFromInvite');
const parsePdfToLoad = require('./src/pdf/parsePdfToLoad');
const { processVisualData } = require('./src/api/processVisualData');
const { uploadSignature } = require('./src/storage/uploadSignature');
const { sendRegistrationEmail } = require('./src/email/sendRegistrationEmail');
const { createTenantRegistration } = require('./src/auth/createTenantRegistration');
const mergeBrokers = require('./src/brokers/mergeBrokers');
const { getEmptyDriversWithLocations } = require('./src/api/getEmptyDriversWithLocations');
const { adminPasswordReset } = require('./src/auth/adminPasswordReset');



// Import Stripe functions
const createStripeCustomer = require('./src/stripe/createStripeCustomer');
const createCheckoutSession = require('./src/stripe/createCheckoutSession');
const handleStripeWebhook = require('./src/stripe/handleStripeWebhook');
const createPortalSession = require('./src/stripe/createPortalSession');
const { importBulkWebData } = require('./api/importBulkWebData');

// Import subscription management functions
const subscriptionManagement = require('./src/stripe/subscriptionManagement');

// Import PDF function
const { importPdf } = require('./api/importPdf');

// Import new web scraping functions
const { processWebData } = require('./api/processWebData');
const { importWebData } = require('./api/importWebData');

// Import SendGrid email function
const { sendInvoiceEmail } = require('./src/email/sendInvoiceEmail');

// ============================================
// LIVELOAD IMPORTS - NEW
// ============================================
const parseLiveLoadDocumentModule = require('./api/parseLiveLoadDocument');
const { analyzeDispatcherPerformance } = require('./src/dispatcher/analyzePerformance');
const { aiLoadMonitor } = require('./src/api/aiLoadMonitor');



// Export all functions
exports.createNewUserFromInvite = createNewUserFromInvite;
exports.parsePdfToLoad = parsePdfToLoad;
exports.mergeBrokers = mergeBrokers;

// Export Stripe functions
exports.createStripeCustomer = createStripeCustomer;
exports.createCheckoutSession = createCheckoutSession;
exports.handleStripeWebhook = handleStripeWebhook;
exports.createPortalSession = createPortalSession;
exports.uploadSignature = uploadSignature;

// Export subscription management functions
exports.cancelSubscription = subscriptionManagement.cancelSubscription;
exports.syncSubscriptionStatus = subscriptionManagement.syncSubscriptionStatus;
exports.reactivateSubscription = subscriptionManagement.reactivateSubscription;

// Export storage functions
exports.getSignedUploadUrl = require('./src/storage/getSignedUploadUrl').getSignedUploadUrl;

// Export API functions for Chrome extension
exports.importPdf = importPdf;
exports.processWebData = processWebData;
exports.importWebData = importWebData;
exports.importBulkWebData = importBulkWebData;
exports.processVisualData = processVisualData;

// Export SendGrid email function
exports.sendInvoiceEmail = sendInvoiceEmail;
exports.sendRegistrationEmail = sendRegistrationEmail;
exports.createTenantRegistration = createTenantRegistration;

// ============================================
// LIVELOAD EXPORTS - NEW
// ============================================
exports.parseLiveLoadDocument = parseLiveLoadDocumentModule;
exports.analyzeDispatcherPerformance = analyzeDispatcherPerformance;
exports.getEmptyDriversWithLocations = getEmptyDriversWithLocations;
exports.aiLoadMonitor = aiLoadMonitor;
exports.adminPasswordReset = adminPasswordReset;



// ============================================
// MAPS API KEY FUNCTION - V2 with Environment Variables
// ============================================
const { defineSecret } = require('firebase-functions/params');

const googleMapsApiKey = defineSecret('GOOGLE_MAPS_API_KEY');

exports.getMapsApiKey = onCall(
  { secrets: [googleMapsApiKey] },
  async (request) => {
    // Only return to authenticated users
    if (!request.auth) {
      throw new Error('Must be authenticated');
    }

    try {
      const apiKey = googleMapsApiKey.value();
      
      if (!apiKey) {
        console.error('Maps API key not found in environment');
        throw new Error('Maps API key not configured');
      }

      console.log('Returning Maps API key to user:', request.auth.uid);
      return { apiKey };
    } catch (error) {
      console.error('Error in getMapsApiKey:', error);
      throw new Error('Failed to retrieve Maps API key: ' + error.message);
    }
  }
);