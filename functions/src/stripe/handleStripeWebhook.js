const { onRequest } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const admin = require('firebase-admin');

const stripeSecret = defineSecret('STRIPE_SECRET');
const stripeWebhookSecret = defineSecret('STRIPE_WEBHOOK_SECRET');

const handleStripeWebhook = onRequest(
  { secrets: [stripeSecret, stripeWebhookSecret], cors: true, maxInstances: 1 },
  async (req, res) => {
    const stripe = require('stripe')(stripeSecret.value());
    const sig = req.headers['stripe-signature'];
    const db = admin.firestore();

    let event;

    try {
      event = stripe.webhooks.constructEvent(
        req.rawBody,
        sig,
        stripeWebhookSecret.value()
      );
    } catch (err) {
      console.error('❌ Webhook signature verification failed:', err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    try {
      switch (event.type) {
        case 'checkout.session.completed': {
          const session = event.data.object;
          console.log('✅ Checkout session completed:', session.id);
          
          if (session.mode === 'subscription' && session.subscription) {
            const tenantId = session.metadata?.tenantId;
            if (!tenantId) {
              console.error('❌ Missing tenantId in checkout session metadata');
              return res.status(400).send('Missing tenantId');
            }

            const subscription = await stripe.subscriptions.retrieve(session.subscription, {
              expand: ['items.data.price']
            });
            
            const subscriptionItem = subscription.items.data[0];
            const pricePerUnit = subscriptionItem.price.unit_amount / 100;
            const quantity = subscriptionItem.quantity;
            const monthlyAmount = pricePerUnit * quantity;
            
            let planId = 'custom';
            if (pricePerUnit === 39) planId = 'small_fleet';
            else if (pricePerUnit === 29) planId = 'medium_fleet';
            else if (pricePerUnit === 19) planId = 'large_fleet';
            
            const nextBillingDate = subscription.current_period_end 
              ? new Date(subscription.current_period_end * 1000) 
              : null;
              
            const trialEndsAt = subscription.trial_end && subscription.trial_end > 0 
              ? new Date(subscription.trial_end * 1000) 
              : null;
            
            const updateData = {
              'billing.stripeSubscriptionId': subscription.id,
              'billing.status': subscription.status === 'trialing' ? 'trial' : 'active',
              'billing.plan': planId,
              'billing.truckCount': quantity,
              'billing.pricePerTruck': pricePerUnit,
              'billing.monthlyAmount': monthlyAmount,
              'billing.nextBillingDate': nextBillingDate,
              'billing.stripePaidUntil': nextBillingDate,
              'billing.trialEndsAt': trialEndsAt,
              'billing.cancelAtPeriodEnd': subscription.cancel_at_period_end || false,
              'billing.createdAt': admin.firestore.FieldValue.serverTimestamp(),
            };

            await db.collection('tenants').doc(tenantId).update(updateData);

            console.log(`✅ Created subscription ${subscription.id} for tenant ${tenantId}`);

            await db.collection('auditLogs').add({
              timestamp: admin.firestore.FieldValue.serverTimestamp(),
              action: 'SUBSCRIPTION_CREATED_FROM_CHECKOUT',
              targetType: 'subscription',
              tenantId,
              details: {
                subscriptionId: subscription.id,
                sessionId: session.id,
                status: subscription.status,
                plan: planId,
                truckCount: quantity,
                monthlyRate: monthlyAmount,
              },
            });
          }
          break;
        }

        case 'customer.subscription.created':
        case 'customer.subscription.updated': {
          const subscription = event.data.object;
          
          const customerSnapshot = await db
            .collection('tenants')
            .where('stripeCustomerId', '==', subscription.customer)
            .limit(1)
            .get();

          if (customerSnapshot.empty) {
            console.error('❌ Cannot find tenant for customer:', subscription.customer);
            return res.status(200).send('Tenant not found, but webhook processed');
          }

          const tenantDoc = customerSnapshot.docs[0];
          const tenantId = tenantDoc.id;
          
          const fullSubscription = await stripe.subscriptions.retrieve(subscription.id, {
            expand: ['items.data.price']
          });
          
          const subscriptionItem = fullSubscription.items.data[0];
          const pricePerUnit = subscriptionItem.price.unit_amount / 100;
          const quantity = subscriptionItem.quantity;
          const monthlyAmount = pricePerUnit * quantity;
          
          let planId = 'custom';
          if (pricePerUnit === 39) planId = 'small_fleet';
          else if (pricePerUnit === 29) planId = 'medium_fleet';
          else if (pricePerUnit === 19) planId = 'large_fleet';

          const nextBillingDate = subscription.current_period_end 
            ? new Date(subscription.current_period_end * 1000) 
            : null;
            
          const trialEndsAt = subscription.trial_end && subscription.trial_end > 0 
            ? new Date(subscription.trial_end * 1000) 
            : null;

          const updateData = {
            'billing.stripeSubscriptionId': subscription.id,
            'billing.status': subscription.status === 'trialing' ? 'trial' : subscription.status,
            'billing.plan': planId,
            'billing.truckCount': quantity,
            'billing.pricePerTruck': pricePerUnit,
            'billing.monthlyAmount': monthlyAmount,
            'billing.nextBillingDate': nextBillingDate,
            'billing.stripePaidUntil': nextBillingDate,
            'billing.trialEndsAt': trialEndsAt,
            'billing.cancelAtPeriodEnd': subscription.cancel_at_period_end || false,
            'billing.updatedAt': admin.firestore.FieldValue.serverTimestamp(),
          };

          if (subscription.cancel_at_period_end) {
            const cancelAt = subscription.cancel_at ? new Date(subscription.cancel_at * 1000) : nextBillingDate;
            updateData['billing.cancelAt'] = cancelAt;
            updateData['billing.canceledAt'] = admin.firestore.FieldValue.serverTimestamp();
            
            console.log(`Subscription ${subscription.id} set to cancel at ${cancelAt}`);
          } else {
            updateData['billing.cancelAt'] = admin.firestore.FieldValue.delete();
            updateData['billing.canceledAt'] = admin.firestore.FieldValue.delete();
          }

          await tenantDoc.ref.update(updateData);

          await db.collection('auditLogs').add({
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            action: event.type === 'customer.subscription.created' ? 'SUBSCRIPTION_CREATED' : 'SUBSCRIPTION_UPDATED',
            targetType: 'subscription',
            tenantId: tenantId,
            details: {
              subscriptionId: subscription.id,
              status: subscription.status,
              plan: planId,
              truckCount: quantity,
              monthlyAmount: monthlyAmount,
              cancelAtPeriodEnd: subscription.cancel_at_period_end || false,
            },
          });
          break;
        }

        case 'customer.subscription.deleted': {
          const sub = event.data.object;
          
          const customerSnapshot = await db
            .collection('tenants')
            .where('stripeCustomerId', '==', sub.customer)
            .limit(1)
            .get();

          if (!customerSnapshot.empty) {
            const tenantDoc = customerSnapshot.docs[0];
            
            const canceledAt = sub.canceled_at ? new Date(sub.canceled_at * 1000) : new Date();
            
            await tenantDoc.ref.update({
              'billing.status': 'canceled',
              'billing.canceledAt': canceledAt,
              'billing.cancelAt': new Date(),
            });
            
            console.log(`Subscription ${sub.id} deleted for tenant ${tenantDoc.id}`);
          }
          break;
        }

        case 'invoice.payment_succeeded': {
          const invoice = event.data.object;
          console.log(`✅ Payment succeeded for invoice: ${invoice.id}`);
          
          const paymentDate = invoice.created 
            ? new Date(invoice.created * 1000)
            : new Date();
          
          if (invoice.subscription && invoice.customer) {
            const customerSnapshot = await db
              .collection('tenants')
              .where('stripeCustomerId', '==', invoice.customer)
              .limit(1)
              .get();

            if (!customerSnapshot.empty) {
              const tenantDoc = customerSnapshot.docs[0];
              await tenantDoc.ref.update({
                'billing.lastPaymentAmount': invoice.amount_paid / 100,
                'billing.lastPaymentDate': paymentDate,
                'billing.paymentStatus': 'succeeded',
              });
            }
          }
          break;
        }

        case 'invoice.payment_failed': {
          const invoice = event.data.object;
          console.log(`❌ Payment failed for customer: ${invoice.customer}`);

          const customerSnapshot = await db
            .collection('tenants')
            .where('stripeCustomerId', '==', invoice.customer)
            .limit(1)
            .get();

          if (!customerSnapshot.empty) {
            const tenantDoc = customerSnapshot.docs[0];
            await tenantDoc.ref.update({
              'billing.paymentStatus': 'failed',
              'billing.lastPaymentFailure': admin.firestore.FieldValue.serverTimestamp(),
            });

            await db.collection('auditLogs').add({
              timestamp: admin.firestore.FieldValue.serverTimestamp(),
              action: 'PAYMENT_FAILED',
              targetType: 'subscription',
              tenantId: tenantDoc.id,
              details: {
                invoiceId: invoice.id,
                amountDue: invoice.amount_due,
                attemptCount: invoice.attempt_count,
              },
            });
          }
          break;
        }

        case 'customer.subscription.trial_will_end': {
          const trialSub = event.data.object;
          console.log(`⚠️ Trial ending soon for subscription: ${trialSub.id}`);
          
          const customerSnapshot = await db
            .collection('tenants')
            .where('stripeCustomerId', '==', trialSub.customer)
            .limit(1)
            .get();

          if (!customerSnapshot.empty) {
            const tenantDoc = customerSnapshot.docs[0];
            await tenantDoc.ref.update({
              'billing.trialEndingSoon': true,
              'billing.trialEndingNotificationSent': admin.firestore.FieldValue.serverTimestamp(),
            });
          }
          break;
        }

        default:
          console.log(`ℹ️ Unhandled event type: ${event.type}`);
      }

      return res.json({ received: true });
    } catch (error) {
      console.error('🔥 Error processing webhook:', error);
      return res.status(200).json({ received: true, error: error.message });
    }
  }
);

module.exports = handleStripeWebhook;