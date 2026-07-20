const functions = require("firebase-functions");
const { db, auth, admin } = require('../../config/firebase');

module.exports = functions.https.onCall(async (data, context) => {
  functions.logger.log("=== createNewUserFromInvite CALLED ===");
  try {
    functions.logger.log("RAW DATA:", JSON.stringify(data));
  } catch (e) {
    functions.logger.log("RAW DATA could not stringify", e.message);
  }

  let realData = data;
  // Handle potential nested data structure from some client versions
  if (
    typeof data === 'object' &&
    data !== null &&
    !('token' in data) &&
    data.data && typeof data.data === 'object'
  ) {
    realData = data.data;
    functions.logger.log("USING NESTED data.data payload!");
  } else {
    functions.logger.log("Using root-level data payload.");
  }

  functions.logger.log("Input data types: ",
    "token:", typeof realData.token,
    "name:", typeof realData.name,
    "email:", typeof realData.email,
    "password:", typeof realData.password
  );

  if (
    !realData ||
    typeof realData.token !== "string" || !realData.token.trim() ||
    typeof realData.name !== "string" || !realData.name.trim() ||
    typeof realData.email !== "string" || !realData.email.trim() ||
    typeof realData.password !== "string" || !realData.password.trim()
  ) {
    functions.logger.error("createNewUserFromInvite: Missing or invalid required fields.");
    throw new functions.https.HttpsError(
      "invalid-argument",
      "Missing or invalid required fields (token, email, name, password)."
    );
  }

  const lowerCaseEmail = realData.email.toLowerCase().trim();
  const token = realData.token.trim();
  const name = realData.name.trim();

  const invitesRef = db.collection("pendingInvites");
  const inviteQuery = invitesRef.where("token", "==", token)
    .where("email", "==", lowerCaseEmail)
    .limit(1);
  
  let inviteSnap;
  try {
    inviteSnap = await inviteQuery.get();
  } catch (queryError) {
    functions.logger.error("Error querying pendingInvites collection:", queryError);
    throw new functions.https.HttpsError("internal", "Error validating invite token. Please try again.");
  }

  if (inviteSnap.empty) {
    functions.logger.warn(`No matching pending invite found for token: ${token} and email: ${lowerCaseEmail}`);
    throw new functions.https.HttpsError(
      "not-found",
      "Invite token not found, invalid, or already used for this email.",
    );
  }

  const inviteDoc = inviteSnap.docs[0];
  const inviteData = inviteDoc.data();

  let newUserRecord;
  try {
    newUserRecord = await auth.createUser({
      email: lowerCaseEmail,
      emailVerified: true,
      password: realData.password,
      displayName: name,
      disabled: false,
    });
    functions.logger.log("Successfully created new user in Firebase Auth:", newUserRecord.uid);
  } catch (authError) {
    functions.logger.error("Error creating user in Firebase Auth:", authError);
    if (authError.code === "auth/email-already-exists") {
      throw new functions.https.HttpsError(
        "already-exists",
        "This email address is already registered. Please log in or use a different email.",
      );
    }
    throw new functions.https.HttpsError(
      "internal",
      `Failed to create user account: ${authError.message}`,
    );
  }

  try {
    const customClaims = {
      role: inviteData.role || "Dispatcher",
      company: inviteData.company || "All Companies",
    };
    await auth.setCustomUserClaims(newUserRecord.uid, customClaims);
    functions.logger.log("Successfully set custom claims for user:", newUserRecord.uid, customClaims);
  } catch (claimsError) {
    functions.logger.error("Error setting custom claims for user:", newUserRecord.uid, claimsError);
  }

  const userDocData = {
    uid: newUserRecord.uid,
    name: name,
    email: lowerCaseEmail,
    role: inviteData.role || "Dispatcher",
    company: inviteData.company || "All Companies",
    tenantId: inviteData.tenantId || null,
    active: typeof inviteData.active === "boolean" ? inviteData.active : true,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    invitedBy: inviteData.invitedBy || null,
    inviteTokenUsed: token,
  };

  try {
    await db.collection("users").doc(newUserRecord.uid).set(userDocData);
    functions.logger.log("Successfully created user document in Firestore:", newUserRecord.uid);
  } catch (firestoreError) {
    functions.logger.error("Error creating user document in Firestore for user:", newUserRecord.uid, firestoreError);
    throw new functions.https.HttpsError(
      "internal",
      "Failed to create user profile in the database.",
    );
  }

  try {
    await inviteDoc.ref.delete();
    functions.logger.log("Successfully deleted pending invite:", inviteDoc.id);
  } catch (deleteError) {
    functions.logger.error("Error deleting pending invite:", inviteDoc.id, deleteError);
  }

  return {
    success: true,
    message: "User account created successfully! You can now log in.",
    uid: newUserRecord.uid,
  };
});