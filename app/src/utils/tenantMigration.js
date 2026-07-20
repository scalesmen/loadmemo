// Step 1: Tenant Setup and Data Migration Script
// Create this as a new file: src/utils/tenantMigration.js

import { db } from '../firebase';
import { 
  collection, 
  doc, 
  setDoc, 
  getDocs, 
  updateDoc, 
  writeBatch, 
  serverTimestamp 
} from 'firebase/firestore';
import { v4 as uuidv4 } from 'uuid';

// Step 1A: Create your first tenant (your current company)
export const createFirstTenant = async () => {
  try {
    console.log("Creating first tenant...");
    
    const tenantId = `tenant_${uuidv4().slice(0, 8)}`; // e.g., tenant_abc12345
    
    const tenantData = {
      id: tenantId,
      companyName: "TRUCKMEMO", // Your company name
      domain: "loadmemo.com", // Your domain
      subscriptionPlan: "enterprise", // free, basic, premium, enterprise
      status: "active",
      createdAt: serverTimestamp(),
      settings: {
        timezone: "America/Chicago", // Your current timezone setting
        commodityTypes: ["dry_van"], // Your current commodity types
        factoringCompany: "rts_financial", // Your current factoring company setting
        maxDrivers: -1, // Unlimited for your company
        maxLoads: -1,   // Unlimited for your company
      },
      billing: {
        plan: "enterprise",
        status: "active",
        nextBillingDate: null, // Your company doesn't pay
        trialEndsAt: null,
      },
      owner: {
        email: "admin@loadmemo.com", // Your Super Admin email
        name: "TRUCKMEMO Admin", // Your name
        role: "Super Admin"
      }
    };
    
    await setDoc(doc(db, "tenants", tenantId), tenantData);
    
    console.log("✅ First tenant created:", tenantId);
    return tenantId;
    
  } catch (error) {
    console.error("❌ Error creating first tenant:", error);
    throw error;
  }
};

// Step 1B: Add tenantId to existing data
export const migrateLegacyDataToTenant = async (tenantId) => {
  try {
    console.log(`🔄 Starting migration to tenant: ${tenantId}`);
    
    const collections = [
      'users',
      'loads', 
      'drivers',
      'trucks',
      'companies',
      'brokers',
      'auditLogs'
    ];
    
    for (const collectionName of collections) {
      console.log(`📝 Migrating ${collectionName}...`);
      
      const snapshot = await getDocs(collection(db, collectionName));
      const batch = writeBatch(db);
      let updateCount = 0;
      
      snapshot.docs.forEach(docSnap => {
        const docRef = doc(db, collectionName, docSnap.id);
        batch.update(docRef, { 
          tenantId: tenantId,
          migratedAt: serverTimestamp()
        });
        updateCount++;
        
        // Firestore batch limit is 500 operations
        if (updateCount % 400 === 0) {
          console.log(`  📊 Batching ${updateCount} documents...`);
        }
      });
      
      if (updateCount > 0) {
        await batch.commit();
        console.log(`  ✅ Updated ${updateCount} documents in ${collectionName}`);
      } else {
        console.log(`  ℹ️ No documents found in ${collectionName}`);
      }
    }
    
    console.log("🎉 Migration completed successfully!");
    
  } catch (error) {
    console.error("❌ Migration failed:", error);
    throw error;
  }
};

// Step 1C: Update your Super Admin user with tenant association
export const assignSuperAdminToTenant = async (tenantId, superAdminEmail) => {
  try {
    console.log("👑 Assigning Super Admin to tenant...");
    
    // Find your Super Admin user
    const usersSnapshot = await getDocs(collection(db, "users"));
    const superAdminDoc = usersSnapshot.docs.find(doc => 
      doc.data().email === superAdminEmail && doc.data().role === "Super Admin"
    );
    
    if (superAdminDoc) {
      await updateDoc(doc(db, "users", superAdminDoc.id), {
        tenantId: tenantId,
        isTenantOwner: true,
        assignedAt: serverTimestamp()
      });
      
      console.log("✅ Super Admin assigned to tenant");
      return superAdminDoc.id;
    } else {
      console.warn("⚠️ Super Admin user not found with email:", superAdminEmail);
      return null;
    }
    
  } catch (error) {
    console.error("❌ Error assigning Super Admin:", error);
    throw error;
  }
};

// Step 1D: Full migration function (run this once)
export const runFullTenantMigration = async () => {
  try {
    console.log("🚀 Starting full tenant migration...");
    
    // 1. Create your tenant
    const tenantId = await createFirstTenant();
    
    // 2. Migrate all existing data
    await migrateLegacyDataToTenant(tenantId);
    
    // 3. Assign your Super Admin account
    const superAdminEmail = "admin@loadmemo.com"; // Your Super Admin email
    await assignSuperAdminToTenant(tenantId, superAdminEmail);
    
    console.log("🎉 Full migration completed!");
    console.log("📋 Next steps:");
    console.log("1. Update your authentication to include tenantId");
    console.log("2. Modify all queries to filter by tenantId");
    console.log("3. Create tenant signup flow for new customers");
    
    return {
      tenantId,
      status: "success",
      message: "Migration completed successfully"
    };
    
  } catch (error) {
    console.error("💥 Migration failed:", error);
    return {
      tenantId: null,
      status: "failed", 
      message: error.message
    };
  }
};

// Step 1E: Helper function to check current data structure
export const analyzeLegacyData = async () => {
  try {
    console.log("🔍 Analyzing current data structure...");
    
    const analysis = {};
    const collections = ['users', 'loads', 'drivers', 'trucks', 'companies', 'brokers'];
    
    for (const collectionName of collections) {
      const snapshot = await getDocs(collection(db, collectionName));
      analysis[collectionName] = {
        count: snapshot.docs.length,
        hasTenantId: snapshot.docs.some(doc => doc.data().hasOwnProperty('tenantId')),
        sampleFields: snapshot.docs.length > 0 ? Object.keys(snapshot.docs[0].data()) : []
      };
    }
    
    console.log("📊 Data Analysis:", analysis);
    return analysis;
    
  } catch (error) {
    console.error("❌ Analysis failed:", error);
    throw error;
  }
};