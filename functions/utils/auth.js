const { auth, db } = require('../config/firebase');
const functions = require('firebase-functions');

async function verifyAuthToken(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new Error('No valid authorization header found');
  }

  const idToken = authHeader.split('Bearer ')[1];
  try {
    const decodedToken = await auth.verifyIdToken(idToken);
    functions.logger.log("Token verified for user:", decodedToken.uid);
    return decodedToken;
  } catch (error) {
    functions.logger.error("Token verification failed:", error);
    throw new Error('Invalid authentication token');
  }
}

async function getUserProfile(uid) {
  try {
    const userDoc = await db.collection("users").doc(uid).get();
    if (!userDoc.exists) {
      throw new Error('User profile not found');
    }
    const userData = userDoc.data();
    if (!userData.tenantId) {
      throw new Error('User account missing tenant information');
    }
    return userData;
  } catch (error) {
    functions.logger.error("Error fetching user profile:", error);
    throw error;
  }
}

module.exports = { verifyAuthToken, getUserProfile };