import React, { useEffect, useState } from 'react';
import { auth, db, functions } from '../../firebase'; // Make sure functions is imported
import { applyOwnerImpersonation } from '../../utils/impersonation';
import { doc, onSnapshot, collection, query, where, getDocs, Timestamp } from "firebase/firestore";
import { loadStripe } from '@stripe/stripe-js';
import { httpsCallable } from 'firebase/functions';

// Initialize Stripe
const stripePromise = loadStripe('pk_live_51Ra6TqIi1BgzeFsXVY9Iu4K5J3jSZxEmrlZQVHJtTKwwasdotnNwiBmrQGp3NxQrkpO5dooTw1xahEqs0BIAZab000GBtGnA0s');
const MILES_PER_TRUCK_THRESHOLD = 25000; // Monthly miles threshold per truck
const TRIAL_DAYS = 30;

// Fleet size thresholds
const FLEET_SIZE_LIMITS = {
  SMALL: 10,    // 1-10 trucks
  MEDIUM: 30    // 11-30 trucks, 31+ is large
};

// Helper function to determine fleet size
const getFleetSize = (truckCount) => {
  if (truckCount <= FLEET_SIZE_LIMITS.SMALL) return 'small_fleet';
  if (truckCount <= FLEET_SIZE_LIMITS.MEDIUM) return 'medium_fleet';
  return 'large_fleet';
};

// Helper function to get appropriate plan based on truck count
const getAppropriatePlan = (truckCount) => {
  const fleetSize = getFleetSize(truckCount);
  return fleetPlans.find(plan => plan.id === fleetSize);
};

const fleetPlans = [
  {
    name: 'Small Fleet',
    id: 'small_fleet',
    pricePerTruck: 39,
    truckRange: '1-10 trucks',
    minTrucks: 1,
    maxTrucks: 10,
    description: 'Perfect for small operations',
    features: [
      '$39 per truck per month',
      'For fleets with 1-10 trucks',
      'Full load tracking',
      'Driver management',
      'Email support',
      'Monthly reports',
      'Mobile app access'
    ],
    highlighted: false
  },
  {
    name: 'Medium Fleet',
    id: 'medium_fleet',
    pricePerTruck: 29,
    truckRange: '11-30 trucks',
    minTrucks: 11,
    maxTrucks: 30,
    description: 'Best value for growing fleets',
    features: [
      '$29 per truck per month',
      'For fleets with 11-30 trucks',
      'Everything in Small Fleet',
      'Priority support',
      'Advanced analytics',
      'API access',
      'Custom reports'
    ],
    highlighted: true,
    badge: 'Most Popular'
  },
  {
    name: 'Large Fleet',
    id: 'large_fleet',
    pricePerTruck: 19,
    truckRange: '31+ trucks',
    minTrucks: 31,
    maxTrucks: null,
    description: 'Enterprise pricing for large operations',
    features: [
      '$19 per truck per month',
      'For fleets with 31+ trucks',
      'Everything in Medium Fleet',
      'Dedicated support',
      'Custom integrations',
      'Training sessions',
      'SLA guarantee'
    ],
    highlighted: false
  }
];

export default function SubscriptionManagement({ tenantId: propTenantId }) {
  const [currentSubscription, setCurrentSubscription] = useState(null);
  const [loading, setLoading] = useState(false);
  const [processingPlan, setProcessingPlan] = useState(null);
  const [tenantData, setTenantData] = useState(null);
  const [loggedInUser, setLoggedInUser] = useState(null);
  const [currentTenantId, setCurrentTenantId] = useState(propTenantId);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [truckCount, setTruckCount] = useState(0);
  const [monthlyMiles, setMonthlyMiles] = useState(0);
  const [calculatedTrucks, setCalculatedTrucks] = useState(0);
  const [usageWarning, setUsageWarning] = useState(false);
  const [trialDaysLeft, setTrialDaysLeft] = useState(null);

  // Helper function to get price based on plan name
  const getPriceForPlan = (planName) => {
    if (!planName) return 0;
    const plan = fleetPlans.find(p => 
      p.name.toLowerCase().includes(planName.toLowerCase()) || 
      p.id === planName
    );
    return plan ? plan.pricePerTruck : 0;
  };

  // Get logged in user and tenant ID
  useEffect(() => {
    const unsubscribeAuth = auth.onAuthStateChanged((user) => {
      if (user) {
        const uid = user.uid;
        const unsubProfile = onSnapshot(doc(db, "users", uid), (docSnap) => {
          if (docSnap.exists()) {
            const userData = applyOwnerImpersonation({
              uid,
              email: user.email,
              ...docSnap.data(),
            });
            setLoggedInUser(userData);
            
            if (!propTenantId && userData.tenantId) {
              setCurrentTenantId(userData.tenantId);
            }
          } else {
            console.warn("SubscriptionManagement: User profile not found");
            setLoggedInUser({ uid, email: user.email, role: null });
          }
        });
        return () => unsubProfile();
      } else {
        setLoggedInUser(null);
        setCurrentTenantId(null);
      }
    });
    return unsubscribeAuth;
  }, [propTenantId]);

  // Fetch tenant subscription data
  useEffect(() => {
    if (!currentTenantId) return;

    const unsubscribeTenant = onSnapshot(
      doc(db, "tenants", currentTenantId),
      (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          setTenantData(data);
          
          // Calculate trial days left
          if (data.billing?.trialEndsAt) {
            // Use trialEndsAt if it exists
            const trialEndDate = data.billing.trialEndsAt.toDate ? 
              data.billing.trialEndsAt.toDate() : 
              new Date(data.billing.trialEndsAt);
            const now = new Date();
            const daysLeft = Math.max(0, Math.ceil((trialEndDate - now) / (1000 * 60 * 60 * 24)));
            setTrialDaysLeft(daysLeft);
          } else if (data.createdAt) {
            // Fallback to 30 days from creation
            const createdDate = data.createdAt.toDate ? data.createdAt.toDate() : new Date(data.createdAt);
            const now = new Date();
            const daysSinceCreation = Math.floor((now - createdDate) / (1000 * 60 * 60 * 24));
            const daysLeft = Math.max(0, TRIAL_DAYS - daysSinceCreation);
            setTrialDaysLeft(daysLeft);
          }
          
          // Check BOTH subscription and billing objects
          const billing = data.billing || {};
          const subscription = data.subscription || {};
          
          // IMPORTANT: Only set currentSubscription if there's a REAL Stripe subscription
          // Don't treat trial status as an active subscription
          const hasStripeSubscription = billing.stripeSubscriptionId || subscription.stripeSubscriptionId;
          
          if (hasStripeSubscription) {
            // We have a real Stripe subscription
            setCurrentSubscription({
              plan: billing.plan || subscription.plan || data.subscriptionPlan,
              status: billing.status || subscription.status || data.status,
              currentPeriodEnd: billing.nextBillingDate || billing.stripePaidUntil || subscription.currentPeriodEnd,
              cancelAtPeriodEnd: billing.cancelAtPeriodEnd || subscription.cancelAtPeriodEnd || false,
              truckCount: billing.truckCount || subscription.truckCount || truckCount || 0,
              monthlyRate: billing.monthlyAmount || subscription.monthlyRate || (truckCount * getPriceForPlan(billing.plan)) || 0,
              // Additional billing info
              stripeSubscriptionId: billing.stripeSubscriptionId || subscription.stripeSubscriptionId,
              trialEndsAt: billing.trialEndsAt,
              pricePerTruck: getPriceForPlan(billing.plan || subscription.plan),
              nextBillingDate: billing.nextBillingDate || billing.stripePaidUntil || subscription.currentPeriodEnd
            });
          } else {
            // No Stripe subscription exists yet - user is either in trial or needs to subscribe
            setCurrentSubscription(null);
          }
        }
      },
      (error) => {
        console.error("Error fetching tenant subscription:", error);
      }
    );

    return () => unsubscribeTenant();
  }, [currentTenantId, truckCount]);

  // Fetch active truck count only
  useEffect(() => {
    if (!currentTenantId) return;

    const unsubscribeTrucks = onSnapshot(
      query(
        collection(db, "trucks"), 
        where("tenantId", "==", currentTenantId),
        where("status", "==", "Active")
      ),
      (snapshot) => {
        setTruckCount(snapshot.size);
      },
      (error) => {
        console.error("Error fetching trucks:", error);
      }
    );

    return () => unsubscribeTrucks();
  }, [currentTenantId]);

  // Calculate monthly miles from delivered loads
  useEffect(() => {
    if (!currentTenantId) return;

    const calculateMonthlyMiles = async () => {
      try {
        const now = new Date();
        const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        
        // Query delivered loads for current month
        const loadsQuery = query(
          collection(db, "loads"),
          where("tenantId", "==", currentTenantId),
          where("status", "==", "delivered"),
          where("deliveredAt", ">=", Timestamp.fromDate(firstDayOfMonth)),
          where("deliveredAt", "<=", Timestamp.fromDate(lastDayOfMonth))
        );
        
        const snapshot = await getDocs(loadsQuery);
        let totalMiles = 0;
        
        snapshot.forEach((doc) => {
          const load = doc.data();
          totalMiles += (load.loadedMiles || 0);
        });
        
        setMonthlyMiles(totalMiles);
        
        // Calculate actual truck usage
        if (truckCount > 0) {
          const milesPerTruck = totalMiles / truckCount;
          if (milesPerTruck > MILES_PER_TRUCK_THRESHOLD) {
            const actualTrucks = Math.ceil(totalMiles / MILES_PER_TRUCK_THRESHOLD);
            setCalculatedTrucks(actualTrucks);
            setUsageWarning(true);
          } else {
            setCalculatedTrucks(truckCount);
            setUsageWarning(false);
          }
        }
      } catch (error) {
        console.error("Error calculating monthly miles:", error);
      }
    };

    calculateMonthlyMiles();
    // Recalculate every hour
    const interval = setInterval(calculateMonthlyMiles, 3600000);
    
    return () => clearInterval(interval);
  }, [currentTenantId, truckCount]);

  const handleSelectPlan = async (planId, pricePerTruck) => {
    if (!currentTenantId) {
      alert('Please log in to subscribe');
      return;
    }

    if (!loggedInUser || (loggedInUser.role !== 'Admin' && loggedInUser.role !== 'Super Admin')) {
      alert('You do not have permission to manage subscriptions');
      return;
    }

    if (truckCount === 0) {
      alert('Please add at least one truck before subscribing');
      return;
    }

    setProcessingPlan(planId);
    
    try {
      // Calculate total price based on actual truck usage
      const trucksToCharge = usageWarning ? calculatedTrucks : truckCount;
      const totalPrice = trucksToCharge * pricePerTruck;
      
      const createCheckoutSession = httpsCallable(functions, 'createCheckoutSession');
      const result = await createCheckoutSession({
        tenantId: currentTenantId,
        planId: planId,
        pricePerTruck: pricePerTruck,
        truckCount: trucksToCharge,
        totalPrice: totalPrice,
        metadata: {
          actualTrucks: truckCount,
          calculatedTrucks: trucksToCharge,
          monthlyMiles: monthlyMiles
        }
      });
      
      const stripe = await stripePromise;
      const { error } = await stripe.redirectToCheckout({
        sessionId: result.data.sessionId
      });
      
      if (error) {
        console.error('Stripe error:', error);
        alert(error.message);
      }
    } catch (error) {
      console.error('Checkout error:', error);
      alert('Error creating checkout session: ' + error.message);
    } finally {
      setProcessingPlan(null);
    }
  };

  const handleManageSubscription = async () => {
    setLoading(true);
    try {
      // This function calls your backend to get a Stripe Portal link
      const createPortalSession = httpsCallable(functions, 'createPortalSession');
      const result = await createPortalSession({ tenantId: currentTenantId });
      // Redirect the user to the Stripe Customer Portal
      window.location.href = result.data.url;
    } catch (error) {
      console.error('Error redirecting to customer portal:', error);
      alert('Could not open the subscription management page. Please try again later.');
      setLoading(false);
    }
  };

  const handleSyncSubscription = async () => {
    setLoading(true);
    try {
      // Make sure we have authentication
      const currentUser = auth.currentUser;
      if (!currentUser) {
        alert('You must be logged in to sync subscription');
        setLoading(false);
        return;
      }
      
      // Get fresh token
      await currentUser.getIdToken(true);
      
      console.log('Starting subscription sync for tenant:', currentTenantId);
      console.log('Current user:', currentUser.uid);
      console.log('User role:', loggedInUser?.role);
      
      const syncSubscriptionStatus = httpsCallable(functions, 'syncSubscriptionStatus');
      const result = await syncSubscriptionStatus({ 
        tenantId: currentTenantId 
      });
      
      console.log('Sync result:', result.data);
      
      if (result.data.success) {
        alert(`Subscription synced successfully! Status: ${result.data.status}`);
        // Reload to show updated data
        window.location.reload();
      } else {
        alert(`Sync completed: ${result.data.message}`);
      }
    } catch (error) {
      console.error('Error syncing subscription:', error);
      console.error('Error code:', error.code);
      console.error('Error details:', error.details);
      alert('Failed to sync subscription: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCancelSubscription = async () => {
    setLoading(true);
    try {
      // Make sure we have a current user
      const currentUser = auth.currentUser;
      if (!currentUser) {
        alert('You must be logged in to cancel subscription');
        setLoading(false);
        return;
      }

      // Get a fresh ID token
      const idToken = await currentUser.getIdToken(true);
      console.log('Got ID token:', idToken ? 'Yes' : 'No');

      // Check if we have the subscription ID
      if (!currentSubscription.stripeSubscriptionId) {
        alert('No subscription ID found. Please refresh the page and try again.');
        setLoading(false);
        return;
      }

      // For debugging: log the request data
      console.log('Cancelling subscription:', {
        tenantId: currentTenantId,
        subscriptionId: currentSubscription.stripeSubscriptionId,
        user: currentUser.uid
      });

      const cancelSubscription = httpsCallable(functions, 'cancelSubscription');
      const result = await cancelSubscription({ 
        tenantId: currentTenantId,
        subscriptionId: currentSubscription.stripeSubscriptionId 
      });
      
      if (result.data.success) {
        alert('Your subscription has been cancelled. You will continue to have access until the end of your current billing period.');
        setShowCancelModal(false);
        // Optionally refresh the subscription data
        window.location.reload();
      } else {
        alert('Failed to cancel subscription. Please try again or contact support.');
      }
    } catch (error) {
      console.error('Error cancelling subscription:', error);
      console.error('Error details:', error.code, error.message, error.details);
      alert('Could not cancel subscription. Error: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  // Add this function to handle the update
  const handleUpdateSubscription = async () => {
    setLoading(true);
    try {
      if (!currentSubscription.stripeSubscriptionId) {
        alert('No subscription ID found');
        setLoading(false);
        return;
      }

      const confirmed = window.confirm(
        `Update your subscription to ${truckCount} truck${truckCount !== 1 ? 's' : ''}?\n\n` +
        `This will update your billing immediately with proration.`
      );

      if (!confirmed) {
        setLoading(false);
        return;
      }

      const updateSubscriptionQuantity = httpsCallable(functions, 'updateSubscriptionQuantity');
      const result = await updateSubscriptionQuantity({
        tenantId: currentTenantId,
        newTruckCount: truckCount
      });

      if (result.data.success) {
        alert(
          `✅ Subscription updated successfully!\n\n` +
          `New quantity: ${result.data.details.newQuantity} trucks\n` +
          `New monthly rate: $${result.data.details.newMonthlyAmount}\n\n` +
          `The change has been prorated and applied to your account.`
        );
        
        // Reload to show updated subscription
        window.location.reload();
      }
    } catch (error) {
      console.error('Error updating subscription:', error);
      alert('Failed to update subscription: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (timestamp) => {
    if (!timestamp) return 'N/A';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
  };

  const canManageSubscription = loggedInUser && 
    (loggedInUser.role === 'Super Admin' || loggedInUser.role === 'Admin');

  if (!loggedInUser) {
    return <div className="text-center py-8 text-gray-500">Loading...</div>;
  }

  if (!currentTenantId) {
    return (
      <div className="text-center py-8">
        <div className="text-red-600 mb-2">Tenant information is missing</div>
        <div className="text-sm text-gray-500">Cannot load subscription management without tenant context</div>
      </div>
    );
  }

  // Simple isInTrial check
  const isInTrial = trialDaysLeft > 0 && !currentSubscription;

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-700 mb-2">Subscription Management</h2>
        <p className="text-sm text-gray-600">
          Manage your LoadMemo subscription based on your fleet size. 
          {currentTenantId && (
            <span className="text-gray-500 ml-2">Tenant: {currentTenantId}</span>
          )}
        </p>
      </div>

      {/* Trial Banner */}
      {isInTrial && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
          <div className="flex items-center">
            <svg className="h-5 w-5 text-blue-600 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <p className="text-sm font-medium text-blue-900">
                Free Trial Period: {trialDaysLeft} days remaining
              </p>
              <p className="text-sm text-blue-700 mt-1">
                Enjoy full access to all features. Add trucks and start managing your fleet!
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Usage Warning - Cheating Detection */}
      {usageWarning && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
          <div className="flex items-start">
            <svg className="h-5 w-5 text-red-600 mr-2 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div className="flex-1">
              <p className="text-sm font-medium text-red-900">⚠️ Billing Adjustment Required - Usage Audit Alert</p>
              <p className="text-sm text-red-700 mt-1">
                Your {truckCount} active truck{truckCount !== 1 ? 's have' : ' has'} driven <strong>{monthlyMiles.toLocaleString()} miles</strong> this month 
                ({Math.round(monthlyMiles / truckCount).toLocaleString()} miles per truck).
              </p>
              <p className="text-sm text-red-700 mt-2">
                This exceeds our fair usage limit of {MILES_PER_TRUCK_THRESHOLD.toLocaleString()} miles per truck per month. 
                <strong> Based on actual usage, we've determined you're operating {calculatedTrucks} trucks.</strong>
              </p>
              <p className="text-sm font-medium text-red-900 mt-2">
                Your next bill will be calculated for {calculatedTrucks} trucks instead of {truckCount} to ensure fair pricing for all customers.
              </p>
              <div className="mt-3 p-3 bg-white rounded border border-red-300">
                <p className="text-xs text-red-800">
                  <strong>Why this adjustment?</strong> Our system detected that your registered trucks are being used beyond normal single-truck capacity. 
                  This typically indicates unregistered trucks using the platform. To maintain fair pricing for all customers, 
                  we automatically adjust billing based on actual usage patterns.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Current Subscription Status */}
      <div className="bg-white rounded-lg shadow-md p-6 mb-6">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">Current Subscription</h3>
        
        {currentSubscription && !isInTrial ? (
          <div className="space-y-3">
            <div className="flex justify-between items-center py-2 border-b border-gray-100">
              <span className="text-sm font-medium text-gray-600">Plan</span>
              <span className="text-sm font-semibold text-gray-900">
                {currentSubscription.plan || 'Not Set'}
              </span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-gray-100">
              <span className="text-sm font-medium text-gray-600">Status</span>
              <span className={`px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full 
                ${currentSubscription.status === 'active' ? 'bg-green-100 text-green-800' : 
                  currentSubscription.status === 'trial' ? 'bg-yellow-100 text-yellow-800' :
                  'bg-red-100 text-red-800'}`}>
                {currentSubscription.status || 'Inactive'}
              </span>
            </div>
            {currentSubscription.cancelAtPeriodEnd && (
              <div className="flex justify-between items-center py-2 border-b border-gray-100">
                <span className="text-sm font-medium text-gray-600">Cancellation</span>
                <span className="text-sm text-red-600">
                  Will cancel at period end
                </span>
              </div>
            )}
            <div className="flex justify-between items-center py-2 border-b border-gray-100">
              <span className="text-sm font-medium text-gray-600">Trucks Billed</span>
              <span className="text-sm text-gray-900">
                {currentSubscription.truckCount || calculatedTrucks || truckCount}
              </span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-gray-100">
              <span className="text-sm font-medium text-gray-600">Monthly Rate</span>
              <span className="text-sm text-gray-900">
                ${currentSubscription.monthlyRate || 0}/month
              </span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-gray-100">
              <span className="text-sm font-medium text-gray-600">Next Billing Date</span>
              <span className="text-sm text-gray-900">
                {formatDate(currentSubscription.currentPeriodEnd)}
              </span>
            </div>
          </div>
        ) : (
          <div className="text-center py-4 text-gray-500">
            {isInTrial 
              ? `You're in your free trial period. Choose a plan below to continue after your trial ends.`
              : 'No active subscription. Choose a plan below to get started.'}
          </div>
        )}
      </div>

      {/* Fleet Information */}
      <div className="bg-white rounded-lg shadow-md p-6 mb-6">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">Fleet Information</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="text-center p-4 bg-gray-50 rounded-lg">
            <p className="text-2xl font-bold text-gray-900">{truckCount}</p>
            <p className="text-sm text-gray-600">Active Trucks</p>
            <p className="text-xs text-gray-500 mt-1">(Billable)</p>
          </div>
          <div className="text-center p-4 bg-gray-50 rounded-lg">
            <p className="text-2xl font-bold text-gray-900">{monthlyMiles.toLocaleString()}</p>
            <p className="text-sm text-gray-600">Miles This Month</p>
            <p className="text-xs text-gray-500 mt-1">All delivered loads</p>
          </div>
          <div className="text-center p-4 bg-gray-50 rounded-lg">
            <p className="text-2xl font-bold text-gray-900">
              {usageWarning ? (
                <span className="text-red-600">{calculatedTrucks}</span>
              ) : (
                truckCount
              )}
            </p>
            <p className="text-sm text-gray-600">Trucks to Bill</p>
            <p className="text-xs text-gray-500 mt-1">
              {usageWarning ? 'Adjusted for usage' : 'Based on active trucks'}
            </p>
          </div>
        </div>
      </div>

      {/* Update Subscription Section - Only show for active subscribers */}
      {currentSubscription && currentSubscription.status === 'active' && (
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">Update Truck Count</h3>
          
          {/* Current vs Actual Trucks */}
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="text-center p-4 bg-gray-50 rounded-lg">
              <p className="text-2xl font-bold text-gray-900">{currentSubscription.truckCount || 0}</p>
              <p className="text-sm text-gray-600">Trucks Paid For</p>
              <p className="text-xs text-gray-500 mt-1">Current subscription</p>
            </div>
            <div className="text-center p-4 bg-blue-50 rounded-lg">
              <p className="text-2xl font-bold text-blue-600">{truckCount}</p>
              <p className="text-sm text-gray-600">Active Trucks</p>
              <p className="text-xs text-gray-500 mt-1">In your fleet</p>
            </div>
          </div>
          
          {/* Show update button if mismatch */}
          {truckCount !== currentSubscription.truckCount && (
            <>
              <div className="mb-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                <p className="text-sm text-yellow-800">
                  <strong>Action Required:</strong> Your active truck count doesn't match your subscription.
                  {truckCount > currentSubscription.truckCount ? (
                    <>
                      {' '}You have {truckCount - currentSubscription.truckCount} more truck{truckCount - currentSubscription.truckCount > 1 ? 's' : ''} than you're paying for.
                    </>
                  ) : (
                    <>
                      {' '}You're paying for {currentSubscription.truckCount - truckCount} truck{currentSubscription.truckCount - truckCount > 1 ? 's' : ''} you're not using.
                    </>
                  )}
                </p>
              </div>
              
              {/* Proration Explanation */}
              <div className="mb-4 text-sm text-gray-600">
                <p className="font-medium mb-2">How billing works:</p>
                <ul className="list-disc list-inside space-y-1 text-xs">
                  <li>Changes are prorated automatically by Stripe</li>
                  <li>You'll be charged/credited for the remaining days in this billing period</li>
                  <li>Starting next billing cycle, you'll pay the new monthly amount</li>
                </ul>
              </div>
              
              {/* Calculate proration preview */}
              {currentSubscription.nextBillingDate && (
                <div className="mb-4 p-3 bg-gray-50 rounded">
                  <p className="text-sm font-medium text-gray-700 mb-1">Billing Preview:</p>
                  {(() => {
                    const nextBilling = currentSubscription.nextBillingDate.toDate ? 
                      currentSubscription.nextBillingDate.toDate() : 
                      new Date(currentSubscription.nextBillingDate);
                    const daysRemaining = Math.ceil((nextBilling - new Date()) / (1000 * 60 * 60 * 24));
                    const daysInPeriod = 30; // Approximate
                    const prorateRatio = daysRemaining / daysInPeriod;
                    const currentMonthly = currentSubscription.monthlyRate || 0;
                    const newMonthly = truckCount * (currentSubscription.pricePerTruck || 39);
                    const difference = newMonthly - currentMonthly;
                    const proratedAmount = Math.abs(difference * prorateRatio);
                    
                    return (
                      <div className="text-xs text-gray-600">
                        <p>Days remaining in period: {daysRemaining}</p>
                        <p>Current monthly: ${currentMonthly}</p>
                        <p>New monthly: ${newMonthly}</p>
                        {difference > 0 ? (
                          <p className="font-medium text-green-700">
                            Estimated charge today: ${proratedAmount.toFixed(2)}
                          </p>
                        ) : (
                          <p className="font-medium text-green-700">
                            Estimated credit: ${proratedAmount.toFixed(2)}
                          </p>
                        )}
                      </div>
                    );
                  })()}
                </div>
              )}
              
              <button
                onClick={handleUpdateSubscription}
                disabled={loading || !canManageSubscription}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-4 rounded-md disabled:bg-gray-400"
              >
                {loading ? 'Processing...' : `Update to ${truckCount} Truck${truckCount !== 1 ? 's' : ''}`}
              </button>
            </>
          )}
          
          {/* Show "all good" message if counts match */}
          {truckCount === currentSubscription.truckCount && (
            <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
              <p className="text-sm text-green-800">
                ✅ Your subscription matches your active truck count. No action needed!
              </p>
            </div>
          )}
        </div>
      )}

      {/* --- Smart Subscription Section --- */}
      <div className="mb-6">
        {currentSubscription && currentSubscription.status === 'canceled' ? (
          // --- UI FOR CANCELED SUBSCRIPTIONS ---
          <div>
            <div className="bg-red-50 border border-red-200 rounded-lg p-6 mb-6">
              <div className="flex items-start">
                <svg className="h-5 w-5 text-red-600 mr-2 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-red-900 mb-2">
                    Subscription Canceled
                  </h3>
                  <p className="text-sm text-red-700 mb-4">
                    Your subscription has been canceled. To continue using LoadMemo, please select a plan below to resubscribe.
                  </p>
                  {tenantData?.billing?.plan && (
                    <div className="mt-3 p-3 bg-white rounded border border-red-300">
                      <p className="text-xs text-gray-700">
                        <strong>Previous Plan:</strong> {tenantData.billing.plan} ({tenantData.billing.truckCount || truckCount} trucks at ${tenantData.billing.pricePerTruck || 39}/truck/month)
                      </p>
                      <button
                        onClick={() => handleSelectPlan(
                          tenantData.billing.plan, 
                          tenantData.billing.pricePerTruck || getPriceForPlan(tenantData.billing.plan)
                        )}
                        disabled={loading || truckCount === 0}
                        className="mt-2 bg-green-600 hover:bg-green-700 text-white text-xs font-medium py-1 px-3 rounded disabled:bg-gray-400"
                      >
                        Quick Resubscribe with Previous Plan
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
            <h3 className="text-lg font-semibold text-gray-800 mb-4">Choose a Plan to Resubscribe</h3>
          </div>
        ) : currentSubscription ? (
          // --- UI FOR EXISTING ACTIVE SUBSCRIBERS ---
          <div>
            <h3 className="text-lg font-semibold text-gray-800 mb-4">Manage Your Subscription</h3>
            <div className="bg-white rounded-lg shadow-md p-6 text-center">
                <p className="text-gray-600 mb-4">You already have an active subscription. You can manage your plan, view invoices, and update your payment method in the customer portal.</p>
                <button 
                  onClick={handleManageSubscription} 
                  disabled={loading}
                  className="w-full max-w-xs mx-auto bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-4 rounded-md disabled:bg-gray-400"
                >
                  {loading ? 'Opening Portal...' : 'Manage My Subscription'}
                </button>
                {currentSubscription.cancelAtPeriodEnd && (
                  <p className="mt-3 text-sm text-yellow-600">
                    ⚠️ Your subscription will cancel on {formatDate(currentSubscription.currentPeriodEnd)}
                  </p>
                )}
            </div>
          </div>
        ) : (
          // --- UI FOR NEW SUBSCRIBERS ---
          <div>
            <h3 className="text-lg font-semibold text-gray-800 mb-4">Choose Your Fleet Plan</h3>
            
            {truckCount > 0 && (
              <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-sm text-blue-900">
                  <strong>Recommended Plan:</strong> Based on your {truckCount} truck{truckCount !== 1 ? 's' : ''}, 
                  you qualify for the <strong>{getAppropriatePlan(truckCount).name}</strong> plan 
                  at ${getAppropriatePlan(truckCount).pricePerTruck}/truck/month.
                </p>
              </div>
            )}
            
            {/* Show pricing plans for new subscribers OR canceled subscriptions */}
            {(!currentSubscription || currentSubscription.status === 'canceled') && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {fleetPlans.map((plan) => {
                  const trucksToCharge = usageWarning ? calculatedTrucks : truckCount;
                  const totalPrice = trucksToCharge * plan.pricePerTruck;
                  const isRecommended = truckCount > 0 && getFleetSize(truckCount) === plan.id;
                  const isAvailable = truckCount >= plan.minTrucks && (!plan.maxTrucks || truckCount <= plan.maxTrucks);
                  
                  return (
                  <div
                    key={plan.id}
                    className={`relative bg-white rounded-lg shadow-md p-6 
                      ${plan.highlighted ? 'ring-2 ring-blue-500' : 'border border-gray-200'}
                      ${isRecommended ? 'ring-2 ring-green-500' : ''}
                      ${!isAvailable && truckCount > 0 ? 'opacity-60' : ''}`}
                  >
                    {plan.badge && (
                      <div className="absolute top-0 right-0 -mt-3 -mr-3">
                        <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-blue-600 text-white">
                          {plan.badge}
                        </span>
                      </div>
                    )}
                    
                    {isRecommended && (
                      <div className="absolute top-0 left-0 -mt-3 -ml-3">
                        <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-green-600 text-white">
                          Recommended
                        </span>
                      </div>
                    )}

                    <h4 className="text-lg font-semibold text-gray-900 mb-1">{plan.name}</h4>
                    <p className="text-sm text-gray-600 mb-1">{plan.description}</p>
                    <p className="text-xs text-gray-500 mb-4">({plan.truckRange})</p>
                    
                    <div className="mb-4">
                      <div className="flex items-baseline">
                        <span className="text-3xl font-bold text-gray-900">${plan.pricePerTruck}</span>
                        <span className="text-gray-500 ml-1">/truck/month</span>
                      </div>
                      {truckCount > 0 && (
                        <p className="text-sm text-gray-600 mt-2">
                          Total: <span className="font-semibold">${totalPrice}/month</span> for {trucksToCharge} truck{trucksToCharge !== 1 ? 's' : ''}
                        </p>
                      )}
                    </div>

                    <ul className="space-y-3 mb-6">
                      {plan.features.map((feature, index) => (
                        <li key={index} className="flex items-start">
                          <svg className="h-5 w-5 text-green-500 mr-2 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                          <span className="text-sm text-gray-600">{feature}</span>
                        </li>
                      ))}
                    </ul>

                    <button
                      onClick={() => handleSelectPlan(plan.id, plan.pricePerTruck)}
                      disabled={!canManageSubscription || processingPlan === plan.id || truckCount === 0 || !isAvailable}
                      className={`w-full py-2 px-4 rounded-md text-sm font-medium transition-colors
                        ${!isAvailable || truckCount === 0 || !canManageSubscription
                          ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                          : isRecommended
                            ? 'bg-green-600 hover:bg-green-700 text-white'
                            : plan.highlighted 
                              ? 'bg-blue-600 hover:bg-blue-700 text-white'
                              : 'bg-gray-200 hover:bg-gray-300 text-gray-700'
                        }`}
                    >
                      {processingPlan === plan.id ? 'Processing...' : 
                       truckCount === 0 ? 'Add Trucks First' :
                       !isAvailable ? `Requires ${plan.truckRange}` :
                       !canManageSubscription ? 'Contact Admin' :
                       'Select Plan'}
                    </button>
                  </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Usage Policy */}
      <div className="bg-gray-50 rounded-lg p-4 text-sm text-gray-600">
        <p className="font-medium text-gray-700 mb-2">Fair Usage Policy</p>
        <p>
          We monitor usage to ensure fair pricing. If any truck exceeds {MILES_PER_TRUCK_THRESHOLD.toLocaleString()} miles per month, 
          we'll automatically adjust your billing to reflect actual usage. This helps keep our pricing fair for all fleet sizes.
        </p>
      </div>

      {/* Cancel Subscription Modal */}
      {showCancelModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
          <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4 text-gray-800">Cancel Subscription</h3>
            <p className="text-sm text-gray-600 mb-6">
              Are you sure you want to cancel your subscription? You'll continue to have access 
              until the end of your current billing period.
            </p>
            
            <div className="flex justify-end space-x-3">
              <button
                type="button"
                className="bg-gray-200 hover:bg-gray-300 text-gray-700 px-4 py-2 rounded-md text-sm font-medium"
                onClick={() => setShowCancelModal(false)}
                disabled={loading}
              >
                Keep Subscription
              </button>
              <button
                type="button"
                className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-md text-sm font-medium"
                onClick={handleCancelSubscription}
                disabled={loading}
              >
                {loading ? 'Cancelling...' : 'Yes, Cancel'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}