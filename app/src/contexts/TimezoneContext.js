// src/contexts/TimezoneContext.js
import React, { createContext, useState, useEffect, useContext } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { db, auth } from '../firebase'; // Adjust this path to your firebase.js file

// 1. Create the Context
const TimezoneContext = createContext();

// 2. Create a custom hook for easy consumption of the context
export const useTimezone = () => useContext(TimezoneContext);

// 3. Create the Provider component
export const TimezoneProvider = ({ children }) => {
  // State for the application-wide time zone
  // Initialize with a sensible default
  const [applicationTimeZone, setApplicationTimeZone] = useState("America/New_York");
  // State to track if the time zone is still being loaded from Firestore
  const [isLoadingTimeZone, setIsLoadingTimeZone] = useState(true);
  // State for logged in user info (to get tenantId)
  const [loggedInUser, setLoggedInUser] = useState(null);

  // Listen for authentication state changes to get user and tenantId
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        // Fetch user profile to get tenantId
        const userDocRef = doc(db, "users", user.uid);
        const unsubProfile = onSnapshot(userDocRef, (docSnap) => {
          if (docSnap.exists()) {
            setLoggedInUser({ uid: user.uid, email: user.email, ...docSnap.data() });
            console.log("TimezoneProvider: User profile loaded with tenantId:", docSnap.data().tenantId);
          } else {
            setLoggedInUser({ uid: user.uid, email: user.email, tenantId: null });
            console.warn("TimezoneProvider: User profile not found in Firestore for UID:", user.uid);
          }
        });
        return () => unsubProfile();
      } else {
        setLoggedInUser(null);
      }
    });
    return unsubscribe;
  }, []);

  // useEffect to subscribe to timezone settings based on tenantId
  useEffect(() => {
    let unsubscribeTenant = null;
    let unsubscribeGlobal = null;

    const setupTimezoneSubscription = () => {
      setIsLoadingTimeZone(true);

      // If we have a tenantId, try to get tenant-specific timezone first
      if (loggedInUser?.tenantId) {
        console.log("TimezoneProvider: Setting up tenant-specific timezone subscription for tenantId:", loggedInUser.tenantId);
        
        // Subscribe to tenant-specific settings
        const tenantSettingsRef = doc(db, "tenantSettings", loggedInUser.tenantId);
        unsubscribeTenant = onSnapshot(tenantSettingsRef, (tenantDocSnap) => {
          let tenantTimezone = null;
          
          if (tenantDocSnap.exists()) {
            const tenantSettings = tenantDocSnap.data();
            console.log("TimezoneProvider: Received tenant settings:", tenantSettings);
            
            if (tenantSettings.defaultTimeZone && typeof tenantSettings.defaultTimeZone === 'string') {
              tenantTimezone = tenantSettings.defaultTimeZone;
              console.log("TimezoneProvider: Using tenant-specific timezone:", tenantTimezone);
              setApplicationTimeZone(tenantTimezone);
              setIsLoadingTimeZone(false);
              return; // Use tenant timezone, don't need global fallback
            }
          }

          // If no tenant-specific timezone, fall back to global settings
          console.log("TimezoneProvider: No tenant-specific timezone found, falling back to global settings");
          
          const appSettingsRef = doc(db, "appConfig", "settings");
          unsubscribeGlobal = onSnapshot(appSettingsRef, (globalDocSnap) => {
            if (globalDocSnap.exists()) {
              const globalSettings = globalDocSnap.data();
              console.log("TimezoneProvider: Received global settings:", globalSettings);
              
              if (globalSettings.defaultTimeZone && typeof globalSettings.defaultTimeZone === 'string') {
                setApplicationTimeZone(globalSettings.defaultTimeZone);
                console.log("TimezoneProvider: Using global timezone:", globalSettings.defaultTimeZone);
              } else {
                // Global setting is invalid, use fallback
                setApplicationTimeZone("America/New_York");
                console.warn("TimezoneProvider: Global 'defaultTimeZone' field is missing or invalid. Using fallback 'America/New_York'.");
              }
            } else {
              // Global settings document doesn't exist, use fallback
              setApplicationTimeZone("America/New_York");
              console.warn("TimezoneProvider: Global appConfig/settings document not found. Using fallback timezone 'America/New_York'.");
            }
            setIsLoadingTimeZone(false);
          }, (error) => {
            console.error("TimezoneProvider: Error fetching global timezone settings:", error);
            setApplicationTimeZone("America/New_York");
            setIsLoadingTimeZone(false);
          });
        }, (error) => {
          console.error("TimezoneProvider: Error fetching tenant timezone settings:", error);
          // Fall back to global settings on error
          console.log("TimezoneProvider: Falling back to global settings due to tenant settings error");
          
          const appSettingsRef = doc(db, "appConfig", "settings");
          unsubscribeGlobal = onSnapshot(appSettingsRef, (globalDocSnap) => {
            if (globalDocSnap.exists()) {
              const globalSettings = globalDocSnap.data();
              if (globalSettings.defaultTimeZone && typeof globalSettings.defaultTimeZone === 'string') {
                setApplicationTimeZone(globalSettings.defaultTimeZone);
                console.log("TimezoneProvider: Using global timezone after tenant error:", globalSettings.defaultTimeZone);
              } else {
                setApplicationTimeZone("America/New_York");
                console.warn("TimezoneProvider: Global timezone also invalid. Using fallback 'America/New_York'.");
              }
            } else {
              setApplicationTimeZone("America/New_York");
              console.warn("TimezoneProvider: Global settings not found after tenant error. Using fallback 'America/New_York'.");
            }
            setIsLoadingTimeZone(false);
          });
        });
      } else {
        // No tenantId available, use global settings only
        console.log("TimezoneProvider: No tenantId available, using global settings only");
        
        const appSettingsRef = doc(db, "appConfig", "settings");
        unsubscribeGlobal = onSnapshot(appSettingsRef, (globalDocSnap) => {
          if (globalDocSnap.exists()) {
            const globalSettings = globalDocSnap.data();
            console.log("TimezoneProvider: Received global settings (no tenant):", globalSettings);
            
            if (globalSettings.defaultTimeZone && typeof globalSettings.defaultTimeZone === 'string') {
              setApplicationTimeZone(globalSettings.defaultTimeZone);
              console.log("TimezoneProvider: Using global timezone (no tenant):", globalSettings.defaultTimeZone);
            } else {
              setApplicationTimeZone("America/New_York");
              console.warn("TimezoneProvider: Global 'defaultTimeZone' field is missing or invalid (no tenant). Using fallback 'America/New_York'.");
            }
          } else {
            setApplicationTimeZone("America/New_York");
            console.warn("TimezoneProvider: Global appConfig/settings document not found (no tenant). Using fallback 'America/New_York'.");
          }
          setIsLoadingTimeZone(false);
        }, (error) => {
          console.error("TimezoneProvider: Error fetching global timezone (no tenant):", error);
          setApplicationTimeZone("America/New_York");
          setIsLoadingTimeZone(false);
        });
      }
    };

    // Setup subscription when we have user info (or lack thereof)
    setupTimezoneSubscription();

    // Cleanup function
    return () => {
      console.log("TimezoneProvider: Cleaning up timezone subscriptions");
      if (unsubscribeTenant) {
        unsubscribeTenant();
      }
      if (unsubscribeGlobal) {
        unsubscribeGlobal();
      }
    };
  }, [loggedInUser]); // Re-run when loggedInUser changes

  // Provide the timezone state and loading status to children components
  return (
    <TimezoneContext.Provider value={{ 
      applicationTimeZone, 
      isLoadingTimeZone,
      tenantId: loggedInUser?.tenantId || null 
    }}>
      {children}
    </TimezoneContext.Provider>
  );
};