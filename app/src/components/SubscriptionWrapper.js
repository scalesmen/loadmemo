// src/components/SubscriptionWrapper.js

import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { onAuthStateChanged } from 'firebase/auth';

const TRIAL_DAYS = 30;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes cache

// In-memory cache for subscription status
const subscriptionCache = new Map();

// Global subscription listener to prevent multiple listeners
let globalTenantListener = null;
let currentTenantId = null;

export default function SubscriptionWrapper({ children }) {
  const [status, setStatus] = useState('loading'); // Start with loading
  const [showPaywall, setShowPaywall] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const checkInProgress = useRef(false);
  const isMounted = useRef(true);

  // Pages that should always be accessible
  const publicPaths = ['/settings', '/login', '/register', '/logout'];
  
  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  useEffect(() => {
    // Skip verification on public pages
    if (publicPaths.some(path => location.pathname.startsWith(path))) {
      setStatus('allowed');
      return;
    }

    const setupSubscriptionListener = async () => {
      // Prevent duplicate checks
      if (checkInProgress.current) return;
      checkInProgress.current = true;

      try {
        const user = auth.currentUser;
        if (!user) {
          if (isMounted.current) {
            setStatus('allowed'); // Auth is handled elsewhere
          }
          return;
        }

        // Check cache first
        const cacheKey = `sub_${user.uid}`;
        const cached = subscriptionCache.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
          if (isMounted.current) {
            setStatus(cached.status);
            setShowPaywall(cached.status === 'blocked');
          }
          return;
        }

        // Get user's tenant ID
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        if (!userDoc.exists()) {
          if (isMounted.current) {
            setStatus('allowed');
          }
          return;
        }

        const tenantId = userDoc.data().tenantId;
        if (!tenantId) {
          if (isMounted.current) {
            setStatus('allowed');
          }
          return;
        }

        // Set up real-time listener only if tenant changed
        if (tenantId !== currentTenantId) {
          // Clean up old listener
          if (globalTenantListener) {
            globalTenantListener();
            globalTenantListener = null;
          }

          currentTenantId = tenantId;

          // Set up new listener
          globalTenantListener = onSnapshot(
            doc(db, 'tenants', tenantId),
            (tenantDoc) => {
              if (!tenantDoc.exists()) {
                updateSubscriptionStatus(false, user.uid);
                return;
              }

              const isAllowed = checkSubscriptionStatus(tenantDoc.data());
              updateSubscriptionStatus(isAllowed, user.uid);
            },
            (error) => {
              console.error('Subscription listener error:', error);
              // On error, allow access
              updateSubscriptionStatus(true, user.uid);
            }
          );
        }

      } catch (error) {
        console.error('Subscription setup error:', error);
        if (isMounted.current) {
          setStatus('allowed');
        }
      } finally {
        checkInProgress.current = false;
      }
    };

    // Use auth state listener
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        setupSubscriptionListener();
      } else {
        // Clean up on logout
        if (globalTenantListener) {
          globalTenantListener();
          globalTenantListener = null;
          currentTenantId = null;
        }
        subscriptionCache.clear();
        if (isMounted.current) {
          setStatus('allowed');
        }
      }
    });

    return () => {
      unsubscribe();
    };
  }, [location.pathname]);

  const updateSubscriptionStatus = (isAllowed, userId) => {
    // Update cache
    const cacheKey = `sub_${userId}`;
    subscriptionCache.set(cacheKey, {
      status: isAllowed ? 'allowed' : 'blocked',
      timestamp: Date.now()
    });

    // Update state only if component is mounted
    if (isMounted.current) {
      setStatus(isAllowed ? 'allowed' : 'blocked');
      setShowPaywall(!isAllowed);
    }
  };

  const checkSubscriptionStatus = (tenantData) => {
    const now = new Date();

    // Quick checks - no complex logic
    // 1. Legacy subscription check
    if (tenantData.subscription?.status === 'active') return true;

    // 2. Billing status check
    const billing = tenantData.billing || {};
    
    // Active subscription always allowed
    if (billing.status === 'active' && billing.stripeSubscriptionId) return true;
    
    // Check trial status with subscription
    if (billing.status === 'trial' && billing.stripeSubscriptionId) {
      // Has subscription but in trial - check trial end
      if (billing.trialEndsAt) {
        const trialEnd = billing.trialEndsAt.toDate ? billing.trialEndsAt.toDate() : new Date(billing.trialEndsAt);
        return now < trialEnd;
      }
      return true; // Has subscription, assume valid
    }

    // 3. Free trial period check (no subscription)
    if (!billing.stripeSubscriptionId) {
      // Check billing.trialEndsAt first
      if (billing.trialEndsAt) {
        const trialEnd = billing.trialEndsAt.toDate ? billing.trialEndsAt.toDate() : new Date(billing.trialEndsAt);
        return now < trialEnd;
      }

      // Fallback to 30-day trial from creation
      if (tenantData.createdAt) {
        const createdAt = tenantData.createdAt.toDate ? tenantData.createdAt.toDate() : new Date(tenantData.createdAt);
        const trialEnd = new Date(createdAt);
        trialEnd.setDate(trialEnd.getDate() + TRIAL_DAYS);
        return now < trialEnd;
      }
    }

    // 4. Paid until date check (for canceled subscriptions)
    if (billing.cancelAtPeriodEnd && (billing.nextBillingDate || billing.stripePaidUntil)) {
      const paidUntil = billing.nextBillingDate?.toDate?.() || 
                       billing.stripePaidUntil?.toDate?.() ||
                       (billing.nextBillingDate ? new Date(billing.nextBillingDate) : null) ||
                       (billing.stripePaidUntil ? new Date(billing.stripePaidUntil) : null);
      
      if (paidUntil && now < paidUntil) return true;
    }

    return false;
  };

  // Show loading state briefly
  if (status === 'loading') {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  // Only show paywall if explicitly blocked and not on public pages
  if (showPaywall && status === 'blocked' && !publicPaths.some(path => location.pathname.startsWith(path))) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50 p-4">
        <div className="max-w-md w-full bg-white shadow-lg rounded-lg p-8">
          <svg className="mx-auto h-12 w-12 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <h2 className="mt-4 text-2xl font-bold text-gray-900 text-center">Subscription Required</h2>
          <p className="mt-2 text-gray-600 text-center">
            Your free trial has ended. Please update your subscription to continue.
          </p>
          <button
            onClick={() => navigate('/settings?tab=subscription')}
            className="mt-6 w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-4 rounded-md transition-colors"
          >
            View Subscription Plans
          </button>
        </div>
      </div>
    );
  }

  // Default: allow access
  return <>{children}</>;
}