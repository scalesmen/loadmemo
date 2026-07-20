// functions/src/stripe/updateSubscriptionQuantity.js

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const admin = require('firebase-admin');

const stripeSecret = defineSecret('STRIPE_SECRET');

exports.updateSubscriptionQuantity = onCall(
  {
    secrets: [stripeSecret],
    cors: true,
    maxInstances: 10
  },
  async (request) => {
    const { auth, data } = request;
    
    if (!auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const { tenantId, newTruckCount } = data;

    if (!tenantId || !newTruckCount || newTruckCount < 1) {
      throw new HttpsError('invalid-argument', 'Invalid parameters');
    }

    const stripe = require('stripe')(stripeSecret.value());
    const db = admin.firestore();

    try {
      // Verify user permission
      const userDoc = await db.collection('users').doc(auth.uid).get();
      const userData = userDoc.data();
      
      if (userData.tenantId !== tenantId || 
          (userData.role !== 'Admin' && userData.role !== 'Super Admin')) {
        throw new HttpsError('permission-denied', 'Not authorized');
      }

      // Get tenant data
      const tenantDoc = await db.collection('tenants').doc(tenantId).get();
      const tenantData = tenantDoc.data();
      const billing = tenantData.billing || {};

      if (!billing.stripeSubscriptionId) {
        throw new HttpsError('failed-precondition', 'No active subscription found');
      }

      // Get current subscription from Stripe
      const subscription = await stripe.subscriptions.retrieve(billing.stripeSubscriptionId);
      const subscriptionItem = subscription.items.data[0];

      // Update the subscription quantity immediately
      // proration_behavior: 'always_invoice' means charge immediately for the difference
      const updatedItem = await stripe.subscriptionItems.update(
        subscriptionItem.id,
        {
          quantity: newTruckCount,
          proration_behavior: 'always_invoice' // This charges immediately!
        }
      );

      // Calculate new monthly amount
      const pricePerTruck = subscriptionItem.price.unit_amount / 100;
      const newMonthlyAmount = pricePerTruck * newTruckCount;

      // Update Firestore
      await tenantDoc.ref.update({
        'billing.truckCount': newTruckCount,
        'billing.monthlyAmount': newMonthlyAmount,
        'billing.lastQuantityUpdate': admin.firestore.FieldValue.serverTimestamp(),
        'billing.updatedBy': auth.uid
      });

      // Create audit log
      await db.collection('auditLogs').add({
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        userId: auth.uid,
        userEmail: userData.email,
        action: 'SUBSCRIPTION_QUANTITY_UPDATED',
        targetType: 'subscription',
        tenantId: tenantId,
        details: {
          oldQuantity: subscriptionItem.quantity,
          newQuantity: newTruckCount,
          pricePerUnit: pricePerTruck,
          oldMonthlyAmount: subscriptionItem.quantity * pricePerTruck,
          newMonthlyAmount: newMonthlyAmount,
          subscriptionId: billing.stripeSubscriptionId
        }
      });

      console.log(`Updated subscription quantity for ${tenantId}: ${subscriptionItem.quantity} → ${newTruckCount}`);

      return {
        success: true,
        message: `Subscription updated to ${newTruckCount} trucks`,
        details: {
          previousQuantity: subscriptionItem.quantity,
          newQuantity: newTruckCount,
          newMonthlyAmount: newMonthlyAmount,
          pricePerTruck: pricePerTruck,
          prorated: true
        }
      };

    } catch (error) {
      console.error('Update subscription quantity error:', error);
      throw new HttpsError('internal', error.message);
    }
  }
);