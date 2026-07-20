// functions/src/stripe/subscriptionManagement.js

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const admin = require('firebase-admin');

const stripeSecret = defineSecret('STRIPE_SECRET');

/**
 * Cancel a subscription at the end of the billing period
 */
exports.cancelSubscription = onCall(
  {
    secrets: [stripeSecret],
    cors: true,
    maxInstances: 10
  },
  async (request) => {
    const { auth, data } = request;
    
    // Check authentication
    if (!auth) {
      throw new HttpsError(
        'unauthenticated',
        'User must be authenticated to cancel subscription'
      );
    }

    const { tenantId, subscriptionId } = data;

    if (!tenantId || !subscriptionId) {
      throw new HttpsError(
        'invalid-argument',
        'Missing required parameters: tenantId and subscriptionId'
      );
    }

    const stripe = require('stripe')(stripeSecret.value());

    try {
      // Verify user has permission
      const userDoc = await admin.firestore()
        .collection('users')
        .doc(auth.uid)
        .get();
      
      if (!userDoc.exists) {
        throw new HttpsError(
          'not-found',
          'User profile not found'
        );
      }

      const userData = userDoc.data();
      if (userData.tenantId !== tenantId || 
          (userData.role !== 'Admin' && userData.role !== 'Super Admin')) {
        throw new HttpsError(
          'permission-denied',
          'User does not have permission to cancel subscription'
        );
      }

      // Cancel subscription at period end in Stripe
      const subscription = await stripe.subscriptions.update(subscriptionId, {
        cancel_at_period_end: true
      });

      // Update Firestore
      const updates = {
        'billing.cancelAtPeriodEnd': true,
        'billing.canceledAt': admin.firestore.FieldValue.serverTimestamp(),
        'billing.canceledBy': auth.uid,
        'billing.status': 'active', // Still active until period end
        // Also update legacy subscription object if it exists
        'subscription.cancelAtPeriodEnd': true
      };

      await admin.firestore()
        .collection('tenants')
        .doc(tenantId)
        .update(updates);

      console.log(`Subscription ${subscriptionId} cancelled for tenant ${tenantId}`);

      return { 
        success: true,
        message: 'Subscription will be cancelled at the end of the billing period',
        cancelAt: subscription.cancel_at,
        currentPeriodEnd: subscription.current_period_end
      };
    } catch (error) {
      console.error('Cancel subscription error:', error);
      throw new HttpsError(
        'internal',
        `Failed to cancel subscription: ${error.message}`
      );
    }
  }
);

/**
 * Sync subscription status from Stripe to Firestore
 */
exports.syncSubscriptionStatus = onCall(
  {
    secrets: [stripeSecret],
    cors: true,
    maxInstances: 10
  },
  async (request) => {
    const { auth, data } = request;
    
    if (!auth) {
      throw new HttpsError(
        'unauthenticated',
        'User must be authenticated'
      );
    }

    const { tenantId } = data;

    if (!tenantId) {
      throw new HttpsError(
        'invalid-argument',
        'Missing tenant ID'
      );
    }

    const stripe = require('stripe')(stripeSecret.value());

    try {
      // Verify user permission
      const userDoc = await admin.firestore()
        .collection('users')
        .doc(auth.uid)
        .get();
      
      const userData = userDoc.data();
      if (userData.role !== 'Super Admin' && userData.role !== 'Admin') {
        throw new HttpsError(
          'permission-denied',
          'Only admins can sync subscription status'
        );
      }

      // Get tenant
      const tenantDoc = await admin.firestore()
        .collection('tenants')
        .doc(tenantId)
        .get();
      
      if (!tenantDoc.exists) {
        throw new HttpsError('not-found', 'Tenant not found');
      }

      const tenantData = tenantDoc.data();
      const stripeCustomerId = tenantData.billing?.stripeCustomerId || 
                             tenantData.stripeCustomerId;

      if (!stripeCustomerId) {
        return { 
          success: false, 
          message: 'No Stripe customer ID found for this tenant' 
        };
      }

      // Get all subscriptions from Stripe
      const subscriptions = await stripe.subscriptions.list({
        customer: stripeCustomerId,
        status: 'all',
        limit: 10,
        expand: ['data.default_payment_method']
      });

      // Find active or trialing subscription
      const activeSubscription = subscriptions.data.find(sub => 
        sub.status === 'active' || 
        sub.status === 'trialing'
      );

      if (activeSubscription) {
        // Calculate pricing details
        const pricePerUnit = activeSubscription.items.data[0]?.price.unit_amount / 100 || 0;
        const quantity = activeSubscription.items.data[0]?.quantity || 0;
        const totalAmount = pricePerUnit * quantity;

        // Update Firestore with latest data
        const updates = {
          'billing.status': activeSubscription.status === 'trialing' ? 'trial' : 'active',
          'billing.stripeSubscriptionId': activeSubscription.id,
          'billing.stripePaidUntil': new Date(activeSubscription.current_period_end * 1000),
          'billing.nextBillingDate': new Date(activeSubscription.current_period_end * 1000),
          'billing.cancelAtPeriodEnd': activeSubscription.cancel_at_period_end,
          'billing.pricePerTruck': pricePerUnit,
          'billing.truckCount': quantity,
          'billing.monthlyAmount': totalAmount,
          'billing.lastSyncedAt': admin.firestore.FieldValue.serverTimestamp(),
          'billing.lastSyncedBy': auth.uid
        };

        // Determine plan based on price
        let planId = 'custom';
        if (pricePerUnit === 39) planId = 'small_fleet';
        else if (pricePerUnit === 29) planId = 'medium_fleet';
        else if (pricePerUnit === 19) planId = 'large_fleet';
        updates['billing.plan'] = planId;

        // Add trial end date if in trial
        if (activeSubscription.trial_end) {
          updates['billing.trialEndsAt'] = new Date(activeSubscription.trial_end * 1000);
        }

        // If cancelled, add cancel date
        if (activeSubscription.cancel_at) {
          updates['billing.cancelAt'] = new Date(activeSubscription.cancel_at * 1000);
        }

        await tenantDoc.ref.update(updates);

        console.log(`Subscription synced for tenant ${tenantId}: ${activeSubscription.status}`);

        return { 
          success: true, 
          message: 'Subscription synced successfully',
          status: activeSubscription.status,
          details: {
            subscriptionId: activeSubscription.id,
            status: activeSubscription.status,
            currentPeriodEnd: activeSubscription.current_period_end,
            cancelAtPeriodEnd: activeSubscription.cancel_at_period_end,
            truckCount: quantity,
            monthlyAmount: totalAmount
          }
        };
      } else {
        // No active subscription - check for canceled subscriptions
        const canceledSubscription = subscriptions.data.find(sub => 
          sub.status === 'canceled' || sub.status === 'incomplete_expired'
        );

        const updates = {
          'billing.status': 'inactive',
          'billing.lastSyncedAt': admin.firestore.FieldValue.serverTimestamp(),
          'billing.lastSyncedBy': auth.uid
        };

        if (canceledSubscription) {
          updates['billing.canceledAt'] = new Date(canceledSubscription.canceled_at * 1000);
        }

        await tenantDoc.ref.update(updates);

        return { 
          success: true, 
          message: 'No active subscription found',
          status: 'inactive',
          subscriptionCount: subscriptions.data.length
        };
      }
    } catch (error) {
      console.error('Sync subscription error:', error);
      throw new HttpsError(
        'internal',
        `Failed to sync subscription: ${error.message}`
      );
    }
  }
);

/**
 * Reactivate a cancelled subscription (if still within billing period)
 */
exports.reactivateSubscription = onCall(
  {
    secrets: [stripeSecret],
    cors: true,
    maxInstances: 10
  },
  async (request) => {
    const { auth, data } = request;
    
    if (!auth) {
      throw new HttpsError(
        'unauthenticated',
        'User must be authenticated'
      );
    }

    const { tenantId, subscriptionId } = data;

    if (!tenantId || !subscriptionId) {
      throw new HttpsError(
        'invalid-argument',
        'Missing required parameters'
      );
    }

    const stripe = require('stripe')(stripeSecret.value());

    try {
      // Verify user permission
      const userDoc = await admin.firestore()
        .collection('users')
        .doc(auth.uid)
        .get();
      
      const userData = userDoc.data();
      if (userData.tenantId !== tenantId || 
          (userData.role !== 'Admin' && userData.role !== 'Super Admin')) {
        throw new HttpsError(
          'permission-denied',
          'User does not have permission to reactivate subscription'
        );
      }

      // Reactivate in Stripe
      const subscription = await stripe.subscriptions.update(subscriptionId, {
        cancel_at_period_end: false
      });

      // Update Firestore
      await admin.firestore()
        .collection('tenants')
        .doc(tenantId)
        .update({
          'billing.cancelAtPeriodEnd': false,
          'billing.cancelAt': admin.firestore.FieldValue.delete(),
          'billing.reactivatedAt': admin.firestore.FieldValue.serverTimestamp(),
          'billing.reactivatedBy': auth.uid,
          'subscription.cancelAtPeriodEnd': false
        });

      console.log(`Subscription ${subscriptionId} reactivated for tenant ${tenantId}`);

      return { 
        success: true,
        message: 'Subscription has been reactivated',
        status: subscription.status
      };
    } catch (error) {
      console.error('Reactivate subscription error:', error);
      throw new HttpsError(
        'internal',
        `Failed to reactivate subscription: ${error.message}`
      );
    }
  }
);