// In functions/src/stripe/createPortalSession.js

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const admin = require("firebase-admin");

// Use the same secret definition as your other V2 functions
const stripeSecret = defineSecret("STRIPE_SECRET");

/**
 * Creates a Stripe Billing Portal session for an authenticated user.
 * This function uses the V2 syntax to match your project's structure.
 */
const createPortalSession = onCall(
  {
    secrets: [stripeSecret], // Ensures the secret is available
    cors: true,
    maxInstances: 10,
  },
  async (request) => {
    const { auth, data } = request;

    // Initialize Stripe inside the handler to prevent deployment errors
    const stripe = require("stripe")(stripeSecret.value());

    // 1. Check for Authentication
    if (!auth) {
      throw new HttpsError(
        "unauthenticated",
        "You must be logged in to manage your subscription."
      );
    }

    const tenantId = data.tenantId;
    const uid = auth.uid;

    if (!tenantId) {
      throw new HttpsError(
        "invalid-argument",
        "The function must be called with a tenantId."
      );
    }

    try {
      // 2. Verify User Permissions and Tenant Association
      const userDoc = await admin.firestore().collection("users").doc(uid).get();
      if (!userDoc.exists) {
        throw new HttpsError("not-found", "User not found.");
      }
      const userData = userDoc.data();

      if (userData.tenantId !== tenantId) {
        throw new HttpsError(
          "permission-denied",
          "You do not have permission to manage this tenant's subscription."
        );
      }

      if (userData.role !== "Admin" && userData.role !== "Super Admin") {
        throw new HttpsError(
          "permission-denied",
          "You must be an administrator to manage subscriptions."
        );
      }

      // 3. Get the Stripe Customer ID from Firestore
      const tenantDoc = await admin
        .firestore()
        .collection("tenants")
        .doc(tenantId)
        .get();
      if (!tenantDoc.exists) {
        throw new HttpsError("not-found", "Tenant not found.");
      }

      const stripeCustomerId = tenantDoc.data().stripeCustomerId;
      if (!stripeCustomerId) {
        throw new HttpsError(
          "failed-precondition",
          "This account does not have a Stripe customer record. Please choose a plan first."
        );
      }

      // 4. Define the return URL
      const returnUrl = "https://loadmemo.com/settings?tab=subscription";

      // 5. Create a Stripe Billing Portal Session
      const portalSession = await stripe.billingPortal.sessions.create({
        customer: stripeCustomerId,
        return_url: returnUrl,
      });

      // 6. Return the Portal URL to the frontend
      return { url: portalSession.url };
    } catch (error) {
      console.error("Error creating portal session:", error);
      if (error instanceof HttpsError) {
        throw error; // Re-throw HttpsError as-is
      }
      // For other types of errors, throw a generic internal error
      throw new HttpsError(
        "internal",
        "An unexpected error occurred while creating the portal session."
      );
    }
  }
);

module.exports = createPortalSession;
