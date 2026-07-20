// functions/src/email/sendRegistrationEmail.js
// Sends confirmation email when a new tenant registration is created

const functions = require('firebase-functions/v2');
const sgMail = require('@sendgrid/mail');

exports.sendRegistrationEmail = functions.firestore.onDocumentCreated(
  {
    document: 'tenant_registrations/{registrationId}',
    timeoutSeconds: 60,
    memory: '256MiB',
    region: 'us-central1',
    secrets: ['SENDGRID_API_KEY'],
  },
  async (event) => {
    const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;
    
    if (!SENDGRID_API_KEY) {
      console.error('❌ SENDGRID_API_KEY is missing');
      return { success: false, error: 'SENDGRID_API_KEY is missing' };
    }
    
    sgMail.setApiKey(SENDGRID_API_KEY);

    const registration = event.data.data();
    const { adminEmail, contactName, companyName, phone, notes } = registration;
    
    if (!adminEmail) {
      console.error('❌ No email address in registration');
      return { success: false, error: 'No email address' };
    }

    console.log(`📧 Sending registration email for ${companyName} (${adminEmail})`);

    // Email to the registrant
    const userEmail = {
      to: adminEmail,
      from: 'no-reply@loadmemo.com',
      subject: 'LoadMemo Registration Received - Activation Pending',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
            .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; }
            .header { background-color: #0d9488; color: white; padding: 30px 20px; text-align: center; }
            .header h1 { margin: 0; font-size: 28px; }
            .header p { margin: 5px 0 0 0; opacity: 0.9; }
            .content { padding: 30px 20px; background-color: #f9fafb; }
            .alert-box { background-color: #fef3c7; border: 1px solid #f59e0b; border-radius: 8px; padding: 15px; margin: 20px 0; }
            .alert-box h4 { color: #92400e; margin: 0 0 8px 0; }
            .alert-box p { color: #92400e; margin: 0; font-size: 14px; }
            .info-box { background-color: white; padding: 20px; margin: 20px 0; border-radius: 8px; border: 1px solid #e5e7eb; }
            .info-box h3 { color: #1f2937; margin: 0 0 15px 0; }
            .info-box ul { margin: 0; padding-left: 0; list-style: none; }
            .info-box li { padding: 8px 0; border-bottom: 1px solid #f3f4f6; }
            .info-box li:last-child { border-bottom: none; }
            .info-box li::before { content: "✓ "; color: #0d9488; font-weight: bold; }
            .contact-box { background-color: #f0fdfa; border: 1px solid #0d9488; border-radius: 8px; padding: 15px; margin: 20px 0; }
            .contact-box h4 { color: #0d9488; margin: 0 0 10px 0; }
            .contact-box p { margin: 5px 0; color: #374151; }
            .contact-box a { color: #0d9488; text-decoration: none; }
            .footer { text-align: center; padding: 20px; background-color: #1f2937; color: #9ca3af; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>LoadMemo</h1>
              <p>Fleet Management System</p>
            </div>
            <div class="content">
              <h2 style="color: #1f2937;">Welcome, ${contactName}!</h2>
              
              <p>Thank you for registering <strong>${companyName}</strong> with LoadMemo. Your account has been created and is pending activation.</p>
              
              <div class="alert-box">
                <h4>⏳ Activation Pending</h4>
                <p>Our team will review your registration within 1-2 business days. You'll receive another email once your account is activated.</p>
              </div>
              
              <div class="info-box">
                <h3>What Happens Next?</h3>
                <ul>
                  <li>Our team reviews your registration details</li>
                  <li>You receive an activation confirmation email</li>
                  <li>Login at loadmemo.com with your email and password</li>
                  <li>Start managing your fleet immediately</li>
                </ul>
              </div>
              
              <div class="contact-box">
                <h4>📞 Need Help?</h4>
                <p>If you have questions or need faster activation, contact us:</p>
                <p>📧 <a href="mailto:admin@loadmemo.com">admin@loadmemo.com</a></p>
                <p>📱 <a href="tel:+12015265176">(201) 526-5176</a></p>
              </div>
            </div>
            <div class="footer">
              <p>© ${new Date().getFullYear()} LoadMemo. All rights reserved.</p>
              <p>This email was sent because you registered for a LoadMemo account.</p>
            </div>
          </div>
        </body>
        </html>
      `
    };

    // Email to admin (notification of new registration)
    const adminNotification = {
      to: 'admin@loadmemo.com',
      from: 'no-reply@loadmemo.com',
      subject: `🆕 New Registration: ${companyName}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; }
            .header { background-color: #4F46E5; color: white; padding: 20px; text-align: center; }
            .content { padding: 20px; background-color: #f9fafb; }
            table { width: 100%; border-collapse: collapse; background: white; }
            th, td { padding: 12px; text-align: left; border: 1px solid #e5e7eb; }
            th { background-color: #f3f4f6; font-weight: 600; width: 30%; }
            .btn { display: inline-block; background-color: #0d9488; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin-top: 20px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h2 style="margin: 0;">New Tenant Registration</h2>
            </div>
            <div class="content">
              <p>A new company has registered for LoadMemo:</p>
              
              <table>
                <tr>
                  <th>Company</th>
                  <td><strong>${companyName}</strong></td>
                </tr>
                <tr>
                  <th>Contact</th>
                  <td>${contactName}</td>
                </tr>
                <tr>
                  <th>Email</th>
                  <td><a href="mailto:${adminEmail}">${adminEmail}</a></td>
                </tr>
                <tr>
                  <th>Phone</th>
                  <td>${phone || 'Not provided'}</td>
                </tr>
                <tr>
                  <th>Notes</th>
                  <td>${notes || 'None'}</td>
                </tr>
                <tr>
                  <th>Submitted</th>
                  <td>${new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })} EST</td>
                </tr>
              </table>
              
              <a href="https://loadmemo.com" class="btn">Review in Admin Panel</a>
            </div>
          </div>
        </body>
        </html>
      `
    };

    try {
      // Send both emails
      await Promise.all([
        sgMail.send(userEmail),
        sgMail.send(adminNotification)
      ]);
      
      console.log(`✅ Registration emails sent for ${companyName} (${adminEmail})`);
      return { success: true };
      
    } catch (error) {
      console.error('❌ SendGrid error:', error);
      
      if (error.response) {
        console.error('SendGrid error details:', error.response.body);
      }
      
      return { success: false, error: error.message };
    }
  }
);