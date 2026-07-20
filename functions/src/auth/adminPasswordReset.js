// functions/src/auth/adminPasswordReset.js
//
// Two actions:
// 1. "sendResetLink" — generates a password reset link via Admin SDK and sends via SendGrid
// 2. "setPassword" — directly sets a new password for a user (super admin only)
//
// Bypasses Firebase's default email delivery entirely — uses SendGrid which is proven working

const functions = require("firebase-functions");
const { onCall } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const sgMail = require("@sendgrid/mail");

const db = admin.firestore();
const auth = admin.auth();

exports.adminPasswordReset = onCall(
  {
    region: "us-central1",
    secrets: ["SENDGRID_API_KEY"],
  },
  async (request) => {
    // Must be authenticated
    if (!request.auth) {
      throw new functions.https.HttpsError("unauthenticated", "Must be logged in");
    }

    const callerUid = request.auth.uid;

    // Verify caller is superAdmin
    const callerDoc = await db.collection("users").doc(callerUid).get();
    if (!callerDoc.exists) {
      throw new functions.https.HttpsError("permission-denied", "User not found");
    }

    const callerData = callerDoc.data();
    const callerRole = callerData.role;

    // Check if superAdmin (handle both string and array roles)
    const isSuperAdmin = Array.isArray(callerRole)
      ? callerRole.includes("Super Admin")
      : callerRole === "Super Admin";

    if (!isSuperAdmin) {
      throw new functions.https.HttpsError("permission-denied", "Only super admins can reset passwords");
    }

    const { action, targetUid, targetEmail, newPassword } = request.data;

    if (!action) {
      throw new functions.https.HttpsError("invalid-argument", "Missing action");
    }

    // ── ACTION 1: Send reset link via SendGrid ──
    if (action === "sendResetLink") {
      if (!targetEmail && !targetUid) {
        throw new functions.https.HttpsError("invalid-argument", "Missing targetEmail or targetUid");
      }

      let email = targetEmail;
      let userName = "";

      // If we have UID, look up email and name
      if (targetUid) {
        try {
          const userRecord = await auth.getUser(targetUid);
          email = userRecord.email;
        } catch (e) {
          throw new functions.https.HttpsError("not-found", "User not found in Firebase Auth");
        }

        const userDoc = await db.collection("users").doc(targetUid).get();
        if (userDoc.exists) {
          userName = userDoc.data().name || "";
        }
      }

      if (!email) {
        throw new functions.https.HttpsError("invalid-argument", "User has no email address");
      }

      // Generate reset link via Admin SDK
      let resetLink;
      try {
        resetLink = await auth.generatePasswordResetLink(email, {
          url: "https://loadmemo.com",
        });
      } catch (e) {
        console.error("Error generating reset link:", e);
        throw new functions.https.HttpsError("internal", `Failed to generate reset link: ${e.message}`);
      }

      // Send via SendGrid
      const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;
      if (!SENDGRID_API_KEY) {
        throw new functions.https.HttpsError("internal", "SendGrid API key not configured");
      }

      sgMail.setApiKey(SENDGRID_API_KEY);

      const msg = {
        to: email,
        from: "no-reply@loadmemo.com",
        subject: "Reset Your LoadMemo Password",
        html: `
          <!DOCTYPE html>
          <html>
          <head>
            <style>
              body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
              .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; }
              .header { background-color: #0d9488; color: white; padding: 30px 20px; text-align: center; }
              .header h1 { margin: 0; font-size: 28px; }
              .content { padding: 30px 20px; background-color: #f9fafb; }
              .btn { display: inline-block; background-color: #0d9488; color: white !important; padding: 14px 32px;
                text-decoration: none; border-radius: 8px; font-size: 16px; font-weight: bold; margin: 20px 0; }
              .footer { text-align: center; padding: 20px; background-color: #1f2937; color: #9ca3af; font-size: 12px; }
              .note { background-color: #fef3c7; border: 1px solid #f59e0b; border-radius: 8px; padding: 12px; margin: 16px 0; font-size: 14px; color: #92400e; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1>LoadMemo</h1>
              </div>
              <div class="content">
                <h2>Password Reset Request</h2>
                <p>Hi${userName ? " " + userName : ""},</p>
                <p>Your LoadMemo administrator has requested a password reset for your account.</p>
                <p>Click the button below to set a new password:</p>
                <div style="text-align: center;">
                  <a href="${resetLink}" class="btn">Reset My Password</a>
                </div>
                <div class="note">
                  ⏳ This link expires in 1 hour. If you didn't request this, you can safely ignore this email.
                </div>
                <p style="font-size: 12px; color: #6b7280; margin-top: 20px;">
                  If the button doesn't work, copy and paste this link into your browser:<br>
                  <a href="${resetLink}" style="color: #0d9488; word-break: break-all;">${resetLink}</a>
                </p>
              </div>
              <div class="footer">
                <p>&copy; ${new Date().getFullYear()} LoadMemo. All rights reserved.</p>
              </div>
            </div>
          </body>
          </html>
        `,
      };

      try {
        await sgMail.send(msg);
        console.log(`✅ Password reset email sent to ${email} by admin ${callerUid}`);
      } catch (sendError) {
        console.error("SendGrid error:", sendError);
        throw new functions.https.HttpsError("internal", "Failed to send email");
      }

      return { success: true, message: `Password reset link sent to ${email}` };
    }

    // ── ACTION 2: Set password directly ──
    if (action === "setPassword") {
      if (!targetUid) {
        throw new functions.https.HttpsError("invalid-argument", "Missing targetUid");
      }

      if (!newPassword || newPassword.length < 6) {
        throw new functions.https.HttpsError("invalid-argument", "Password must be at least 6 characters");
      }

      try {
        await auth.updateUser(targetUid, { password: newPassword });
        console.log(`✅ Password set for user ${targetUid} by admin ${callerUid}`);
      } catch (e) {
        console.error("Error setting password:", e);
        throw new functions.https.HttpsError("internal", `Failed to set password: ${e.message}`);
      }

      return { success: true, message: "Password updated successfully" };
    }

    throw new functions.https.HttpsError("invalid-argument", "Invalid action. Use 'sendResetLink' or 'setPassword'");
  }
);