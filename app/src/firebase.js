// src/firebase.js

import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getFunctions } from "firebase/functions";

// Optional: Import getAnalytics if you plan to use it
// import { getAnalytics } from "firebase/analytics";

const firebaseConfig = {
  apiKey: "AIzaSyC5ef8OT0cwoO0iV-KIfzGfv8y9sXMINVM", // Your actual API key
  authDomain: "truckmemo2.firebaseapp.com",          // Your actual auth domain
  projectId: "truckmemo2",                           // Your actual project ID
  storageBucket: "truckmemo2.firebasestorage.app",   // <<< CORRECTED BUCKET NAME
  messagingSenderId: "470314939716",                 // Your actual sender ID
  appId: "1:470314939716:web:8d1abd810855b2c3db1311", // Your actual app ID
  measurementId: "G-GL3F969EZL"                      // Your actual measurement ID (if you use Analytics)
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firebase services
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);
const functions = getFunctions(app);

// Optional: Initialize Analytics
// const analytics = getAnalytics(app);

// Export the services you want to use in other parts of your app
export { auth, db, storage, functions, app };