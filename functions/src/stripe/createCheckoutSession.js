const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const admin = require('firebase-admin');

const stripeSecret = defineSecret('STRIPE_SECRET');

const createCheckoutSession = onCall(
  { 
    secrets: [stripeSecret],
    cors: true,
    maxInstances: 10
  },
  async (request) => {
    const { auth, data } = request;

    if (!auth) {
      throw new HttpsError('unauthenticated', 'User must be logged in');
    }

    const {
      tenantId,
      planId,
      pricePerTruck,
      truckCount,
      totalPrice,
      metadata,
    } = data;

    const db = admin.firestore();
    
    // Initialize variables
    let userData = null;
    let stripe = null;

    try {
      // Initialize Stripe with cleaned secret
      const rawSecret = stripeSecret.value();
      if (!rawSecret) {
        throw new HttpsError('internal', 'Payment system not configured');
      }
      
      // Clean the Stripe secret
      const cleanStripeSecret = rawSecret
        .trim()
        .replace(/[\r\n\t\s]+/g, '')
        .replace(/[^\x20-\x7E]/g, '');
      
      stripe = require('stripe')(cleanStripeSecret);

      // Validate required fields
      if (!tenantId) {
        throw new HttpsError('invalid-argument', 'Tenant ID is required');
      }

      const tenantDoc = await db.collection('tenants').doc(tenantId).get();
      if (!tenantDoc.exists) {
        throw new HttpsError('not-found', 'Tenant not found');
      }

      const tenant = tenantDoc.data();

      const userDoc = await db.collection('users').doc(auth.uid).get();
      if (!userDoc.exists) {
        throw new HttpsError('not-found', 'User not found');
      }

      userData = userDoc.data();

      if (userData.role !== 'Admin' && userData.role !== 'Super Admin') {
        throw new HttpsError('permission-denied', 'Not authorized to manage subscriptions');
      }

      if (userData.tenantId !== tenantId) {
        throw new HttpsError('permission-denied', 'Not authorized for this tenant');
      }

      let customerId = tenant.stripeCustomerId;
      
      // Check if we're in test or live mode
      const isTestMode = cleanStripeSecret.startsWith('sk_test_');
      console.log('Stripe mode:', isTestMode ? 'test' : 'live');

      // If customer exists, verify they exist in the current mode
      if (customerId) {
        try {
          await stripe.customers.retrieve(customerId);
          console.log('Existing customer found:', customerId);
        } catch (error) {
          if (error.code === 'resource_missing') {
            console.log(`Customer ${customerId} not found in ${isTestMode ? 'test' : 'live'} mode, creating new customer`);
            customerId = null;
          } else {
            throw error;
          }
        }
      }

      // Create customer if doesn't exist
      if (!customerId) {
        // Try different possible email field names
        const customerEmail = 
          tenant.email || 
          tenant.ownerEmail || 
          tenant.adminEmail || 
          tenant.primaryEmail ||
          tenant.contactEmail ||
          userData.email || 
          `${tenantId}@loadmemo.com`;
        
        const customerName =
          tenant.companyName || tenant.name || tenant.businessName || 'Unknown Company';

        console.log('Creating Stripe customer:', {
          email: customerEmail,
          name: customerName,
          tenantId: tenantId
        });

        const customer = await stripe.customers.create({
          email: customerEmail,
          name: customerName,
          metadata: { 
            tenantId,
            createdBy: auth.uid
          },
        });

        customerId = customer.id;
        await tenantDoc.ref.update({ stripeCustomerId: customerId });
        console.log('New customer created:', customerId);
      }

      // Map plan IDs to Stripe price IDs
      const planToPriceMap = {
        small_fleet: 'price_1RaIZ1Ii1BgzeFsXk0ZH3ycq',
        medium_fleet: 'price_1RaIjpIi1BgzeFsXbP4YrB6x',
        large_fleet: 'price_1RaIkgIi1BgzeFsXDB9p9s7y',
      };

      const stripePriceId = planToPriceMap[planId];
      if (!stripePriceId) {
        throw new HttpsError('invalid-argument', 'Invalid plan selected');
      }

      // CRITICAL FIX: Check if this is a returning customer
      const isReturningCustomer = !!(
        tenant.billing?.stripeSubscriptionId ||
        tenant.billing?.status === 'canceled' ||
        tenant.billing?.canceledAt ||
        tenant.billing?.lastPaymentDate ||
        tenant.subscription?.stripeSubscriptionId ||
        tenant.subscription?.status === 'canceled' ||
        tenant.subscription?.lastPaymentDate
      );

      console.log('Customer status:', {
        isReturning: isReturningCustomer,
        billingStatus: tenant.billing?.status,
        hasEverPaid: !!(tenant.billing?.lastPaymentDate || tenant.subscription?.lastPaymentDate),
        hadSubscription: !!(tenant.billing?.stripeSubscriptionId || tenant.subscription?.stripeSubscriptionId)
      });

      // Calculate trial end date ONLY for new customers
      let trialEnd = null;
      let trialDays = 0;
      
      if (!isReturningCustomer && tenant.createdAt) {
        const createdDate = tenant.createdAt.toDate
          ? tenant.createdAt.toDate()
          : new Date(tenant.createdAt);
        const thirtyDaysLater = new Date(createdDate);
        thirtyDaysLater.setDate(thirtyDaysLater.getDate() + 30);

        if (thirtyDaysLater > new Date()) {
          trialEnd = Math.floor(thirtyDaysLater.getTime() / 1000);
          trialDays = Math.ceil((thirtyDaysLater - new Date()) / (1000 * 60 * 60 * 24));
          console.log(`New customer eligible for ${trialDays} day trial`);
        }
      } else if (isReturningCustomer) {
        console.log('Returning customer - NO TRIAL');
      }

      const appUrl = process.env.APP_URL || 'https://loadmemo.com';

      // Build subscription_data separately based on customer type
      const subscriptionData = {
        metadata: {
          tenantId: tenantId,
          planId: planId,
          truckCount: truckCount.toString(),
          pricePerTruck: pricePerTruck.toString(),
          isReturningCustomer: isReturningCustomer.toString(),
        },
      };

      // Only add trial_end for NEW customers who are eligible
      if (!isReturningCustomer && trialEnd) {
        subscriptionData.trial_end = trialEnd;
      }

      // Create checkout session configuration
      const sessionConfig = {
        customer: customerId,
        payment_method_types: ['card'],
        mode: 'subscription',
        line_items: [
          {
            price: stripePriceId,
            quantity: truckCount,
          },
        ],
        success_url: `${appUrl}/settings?tab=subscription&success=true`,
        cancel_url: `${appUrl}/settings?tab=subscription&canceled=true`,
        // IMPORTANT: Pass metadata at the session level
        metadata: {
          tenantId: tenantId,
          planId: planId,
          truckCount: truckCount.toString(),
          pricePerTruck: pricePerTruck.toString(),
          isReturningCustomer: isReturningCustomer.toString(),
        },
        subscription_data: subscriptionData,
        // Allow promotion codes
        allow_promotion_codes: true,
        // Collect billing address
        billing_address_collection: 'required',
        // Customer can update quantity in portal later
        customer_update: {
          address: 'auto',
          name: 'auto',
        },
      };

      const session = await stripe.checkout.sessions.create(sessionConfig);
      console.log('Checkout session created:', session.id);

      // Log audit trail
      await db.collection('auditLogs').add({
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        userId: auth.uid,
        userEmail: userData?.email || 'unknown',
        action: 'SUBSCRIPTION_CHECKOUT_INITIATED',
        targetType: 'subscription',
        tenantId: tenantId,
        details: {
          sessionId: session.id,
          planId: planId,
          pricePerTruck: pricePerTruck,
          truckCount: truckCount,
          totalPrice: totalPrice,
          isReturningCustomer: isReturningCustomer,
          hasTrialPeriod: !isReturningCustomer && !!trialEnd,
          trialDays: !isReturningCustomer ? trialDays : 0,
          metadata: metadata,
        },
      });

      return { sessionId: session.id };
    } catch (error) {
      console.error('🔥 Error creating checkout session:', error);
      console.error('Error type:', error.type);
      console.error('Error code:', error.code);
      console.error('Error details:', error.detail);

      // Log error audit
      if (userData && db) {
        try {
          await db.collection('auditLogs').add({
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            userId: auth.uid,
            userEmail: userData.email || 'unknown',
            action: 'SUBSCRIPTION_CHECKOUT_FAILED',
            targetType: 'subscription',
            tenantId: tenantId,
            error: true,
            details: {
              errorMessage: error.message,
              errorCode: error.code || error.type || 'unknown',
              errorType: error.type,
              attemptedPlan: planId,
            },
          });
        } catch (auditError) {
          console.error('Failed to log audit:', auditError);
        }
      }

      // Handle Stripe-specific errors
      if (error.type === 'StripeConnectionError') {
        throw new HttpsError('internal', 'Connection to payment processor failed. Please try again.');
      } else if (error.type === 'StripeInvalidRequestError') {
        throw new HttpsError('invalid-argument', error.message);
      } else if (error.type === 'StripeAPIError') {
        throw new HttpsError('internal', 'Payment processor error. Please try again later.');
      }
      
      // If it's already a Firebase HttpsError, throw it as is
      if (error instanceof HttpsError) {
        throw error;
      }
      
      // Otherwise, wrap it in a proper HttpsError
      throw new HttpsError(
        'internal',
        error.message || 'Failed to create checkout session'
      );
    }
  }
);

module.exports = createCheckoutSession;