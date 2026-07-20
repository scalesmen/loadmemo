const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { defineSecret } = require('firebase-functions/params');
const admin = require('firebase-admin');

const stripeSecret = defineSecret('STRIPE_SECRET');

const createStripeCustomer = onDocumentCreated(
  {
    document: 'tenants/{tenantId}',
    secrets: [stripeSecret],
  },
  async (event) => {
    const snapshot = event.data;
    const tenant = snapshot.data();
    const tenantId = event.params.tenantId;

    const stripe = require('stripe')(stripeSecret.value());

    try {
      if (tenant.stripeCustomerId) {
        console.log(`Tenant ${tenantId} already has Stripe customer ID: ${tenant.stripeCustomerId}`);
        return null;
      }

const customerEmail = tenant.email || tenant.owner?.email || tenant.ownerEmail || tenant.adminEmail || tenant.contactEmail || `${tenantId}@loadmemo.com`;
      const customerName =
        tenant.companyName || tenant.name || tenant.factoringCompany || 'Unknown Company';

      const customer = await stripe.customers.create({
        email: customerEmail,
        name: customerName,
        metadata: {
          tenantId: tenantId,
          createdAt: new Date().toISOString(),
          environment: process.env.ENVIRONMENT || 'production',
        },
      });

      console.log(`✅ Created Stripe customer ${customer.id} for tenant ${tenantId}`);


      await snapshot.ref.update({
        stripeCustomerId: customer.id,
      });

      await admin.firestore().collection('auditLogs').add({
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        action: 'STRIPE_CUSTOMER_CREATED',
        targetType: 'tenant',
        tenantId: tenantId,
        systemGenerated: true,
        details: {
          stripeCustomerId: customer.id,
          customerEmail: customerEmail,
          customerName: customerName,
          trialPeriodDays: 30,
        },
      });

      return { success: true, customerId: customer.id };
    } catch (error) {
      console.error('❌ Error creating Stripe customer:', error.message);

      await snapshot.ref.update({
        stripeSetupError: error.message,
        stripeSetupErrorTime: admin.firestore.FieldValue.serverTimestamp(),
      });

      await admin.firestore().collection('auditLogs').add({
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        action: 'STRIPE_CUSTOMER_CREATION_FAILED',
        targetType: 'tenant',
        tenantId: tenantId,
        systemGenerated: true,
        error: true,
        details: {
          errorMessage: error.message,
          errorCode: error.code || 'unknown',
        },
      });

      throw error;
    }
  }
);

module.exports = createStripeCustomer;
