// migrateTenants.js
// Run this script to update all existing tenants with proper billing structure

import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

// Your Firebase config
const firebaseConfig = {
  // Add your Firebase config here
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

const TRIAL_DAYS = 30;

async function migrateTenants() {
  console.log('Starting tenant migration...');
  
  try {
    // Get all tenants
    const tenantsSnapshot = await getDocs(collection(db, 'tenants'));
    console.log(`Found ${tenantsSnapshot.size} tenants to check`);
    
    let migrated = 0;
    let skipped = 0;
    let errors = 0;
    
    for (const tenantDoc of tenantsSnapshot.docs) {
      try {
        const tenantData = tenantDoc.data();
        const tenantId = tenantDoc.id;
        
        console.log(`\nChecking tenant: ${tenantId} (${tenantData.companyName || 'No name'})`);
        
        // Check if already has proper billing structure
        if (tenantData.billing && tenantData.billing.status) {
          console.log(`✓ Tenant ${tenantId} already has billing structure`);
          skipped++;
          continue;
        }
        
        // Calculate trial end date (30 days from creation)
        let trialEndDate = null;
        if (tenantData.createdAt) {
          const createdDate = tenantData.createdAt.toDate ? 
            tenantData.createdAt.toDate() : 
            new Date(tenantData.createdAt);
          trialEndDate = new Date(createdDate);
          trialEndDate.setDate(trialEndDate.getDate() + TRIAL_DAYS);
        } else {
          // If no createdAt, use 30 days from now
          trialEndDate = new Date();
          trialEndDate.setDate(trialEndDate.getDate() + TRIAL_DAYS);
        }
        
        // Prepare update data
        const updateData = {
          // Add billing structure
          billing: {
            plan: tenantData.subscriptionPlan || null,
            status: 'trial', // Default to trial
            nextBillingDate: null,
            trialEndsAt: trialEndDate,
            createdAt: serverTimestamp(),
            stripeCustomerId: tenantData.stripeCustomerId || null,
            stripeSubscriptionId: tenantData.stripeSubscriptionId || null
          },
          
          // Add settings if missing
          settings: tenantData.settings || {
            timezone: 'America/New_York',
            dateFormat: 'MM/dd/yyyy',
            currency: 'USD'
          },
          
          // Add updatedAt
          updatedAt: serverTimestamp()
        };
        
        // If tenant has existing subscription data, preserve it
        if (tenantData.subscription) {
          updateData.billing = {
            ...updateData.billing,
            plan: tenantData.subscription.plan || updateData.billing.plan,
            status: tenantData.subscription.status === 'active' ? 'active' : 'trial',
            stripeSubscriptionId: tenantData.subscription.stripeSubscriptionId || updateData.billing.stripeSubscriptionId,
            nextBillingDate: tenantData.subscription.currentPeriodEnd || null,
            truckCount: tenantData.subscription.truckCount || null,
            monthlyAmount: tenantData.subscription.monthlyRate || null
          };
        }
        
        // Check if they have active subscription in old format
        if (tenantData.status === 'active' && tenantData.stripeSubscriptionId) {
          updateData.billing.status = 'active';
          updateData.billing.stripeSubscriptionId = tenantData.stripeSubscriptionId;
        }
        
        // Add owner info if missing
        if (!tenantData.owner && tenantData.adminEmail) {
          updateData.owner = {
            email: tenantData.adminEmail,
            name: tenantData.adminName || tenantData.contactName || 'Unknown',
            role: 'Super Admin'
          };
        }
        
        console.log(`→ Migrating tenant ${tenantId}...`);
        console.log('  Billing status:', updateData.billing.status);
        console.log('  Trial ends:', trialEndDate.toLocaleDateString());
        
        // Update the tenant
        await updateDoc(doc(db, 'tenants', tenantId), updateData);
        
        console.log(`✅ Successfully migrated tenant ${tenantId}`);
        migrated++;
        
      } catch (error) {
        console.error(`❌ Error migrating tenant ${tenantDoc.id}:`, error);
        errors++;
      }
    }
    
    console.log('\n=== Migration Complete ===');
    console.log(`✅ Migrated: ${migrated} tenants`);
    console.log(`⏭️  Skipped: ${skipped} tenants (already had billing structure)`);
    console.log(`❌ Errors: ${errors} tenants`);
    
  } catch (error) {
    console.error('Fatal error during migration:', error);
  }
}

// Dry run function to see what would be updated
async function dryRun() {
  console.log('DRY RUN - No changes will be made\n');
  
  const tenantsSnapshot = await getDocs(collection(db, 'tenants'));
  
  let needsMigration = 0;
  let alreadyMigrated = 0;
  
  for (const tenantDoc of tenantsSnapshot.docs) {
    const tenantData = tenantDoc.data();
    const tenantId = tenantDoc.id;
    
    if (tenantData.billing && tenantData.billing.status) {
      alreadyMigrated++;
      console.log(`✓ ${tenantId} - Already migrated`);
    } else {
      needsMigration++;
      console.log(`⚠️  ${tenantId} - Needs migration`);
      console.log(`   Company: ${tenantData.companyName || 'No name'}`);
      console.log(`   Has old subscription: ${!!tenantData.subscription}`);
      console.log(`   Status: ${tenantData.status || 'No status'}`);
    }
  }
  
  console.log(`\nSummary: ${needsMigration} need migration, ${alreadyMigrated} already migrated`);
}

// Run the migration
// Uncomment the function you want to run:

// dryRun();  // Run this first to see what will be changed
// migrateTenants();  // Run this to actually migrate