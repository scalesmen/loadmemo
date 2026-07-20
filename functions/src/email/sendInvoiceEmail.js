// functions/src/email/sendInvoiceEmail.js
// ⭐ UPDATED: Supports any combination - Invoice only, BOL only, or both

const functions = require('firebase-functions/v2');
const sgMail = require('@sendgrid/mail');
const admin = require('firebase-admin');

exports.sendInvoiceEmail = functions.https.onCall(
  {
    timeoutSeconds: 60,
    memory: '256MiB',
    region: 'us-central1',
    secrets: ['SENDGRID_API_KEY'],
  },
  async (request) => {
    const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;
    
    if (!SENDGRID_API_KEY) {
      throw new functions.https.HttpsError('failed-precondition', 'SENDGRID_API_KEY is missing');
    }
    
    sgMail.setApiKey(SENDGRID_API_KEY);

    if (!request.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    const {
      brokerEmail,
      loadId,
      invoicePdfBase64,
      bolPdfBase64,
      companyName,
      companyId,
      amount,
      pickupLocation,
      deliveryLocation
    } = request.data;

    // Validate required fields
    if (!brokerEmail || !loadId) {
      throw new functions.https.HttpsError('invalid-argument', 'Missing required fields (brokerEmail, loadId)');
    }

    // At least one document must be provided
    if (!invoicePdfBase64 && !bolPdfBase64) {
      throw new functions.https.HttpsError('invalid-argument', 'At least one document (Invoice or BOL) must be provided');
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(brokerEmail)) {
      throw new functions.https.HttpsError('invalid-argument', 'Invalid email address');
    }

    // Get caller's tenantId server-side (never trust client for tenant scoping)
    let callerTenantId = null;
    try {
      const userDoc = await admin.firestore().collection('users').doc(request.auth.uid).get();
      callerTenantId = userDoc.exists ? userDoc.data().tenantId : null;
      console.log('🔐 Caller tenantId:', callerTenantId || 'NOT FOUND');
    } catch (error) {
      console.error('❌ Error fetching caller tenant:', error);
    }

    // Fetch company email — by ID (preferred), tenant-verified
    let companyEmail = null;
    let companyData = null;
    const companiesRef = admin.firestore().collection('companies');

    try {
      if (companyId) {
        console.log('🔍 Fetching company by ID:', companyId);
        const companyDoc = await companiesRef.doc(companyId).get();
        if (companyDoc.exists) {
          const data = companyDoc.data();
          if (callerTenantId && data.tenantId && data.tenantId !== callerTenantId) {
            console.error('🚫 Tenant mismatch! Company belongs to different tenant. Ignoring.');
          } else {
            companyData = data;
          }
        } else {
          console.warn('⚠️ Company doc not found by ID:', companyId);
        }
      }

      // Fallback: case-insensitive name match WITHIN caller's tenant only
      if (!companyData && companyName && callerTenantId) {
        console.log('🔍 Searching company by name within tenant:', companyName);
        const tenantCompanies = await companiesRef
          .where('tenantId', '==', callerTenantId)
          .get();
        const target = companyName.toLowerCase().trim();
        const match = tenantCompanies.docs.find(
          d => (d.data().name || '').toLowerCase().trim() === target
        );
        if (match) {
          companyData = match.data();
          console.log('✅ Found company via tenant-scoped name match');
        } else {
          console.warn('⚠️ Company not found in tenant:', companyName);
        }
      }

      if (companyData) {
        companyEmail = companyData.email;
        if (companyEmail && emailRegex.test(companyEmail)) {
          console.log('✅ Found company email:', companyEmail);
        } else {
          console.warn('⚠️ Company found but email is invalid or missing');
          companyEmail = null;
        }
      }
    } catch (error) {
      console.error('❌ Error fetching company email:', error);
    }

    // Build attachments array (only include non-null documents)
    const attachments = [];

    if (invoicePdfBase64) {
      attachments.push({
        content: invoicePdfBase64,
        filename: `Invoice-${loadId}.pdf`,
        type: 'application/pdf',
        disposition: 'attachment'
      });
      console.log('📎 Invoice PDF will be attached');
    }

    if (bolPdfBase64) {
      attachments.push({
        content: bolPdfBase64,
        filename: `BOL-${loadId}.pdf`,
        type: 'application/pdf',
        disposition: 'attachment'
      });
      console.log('📎 BOL PDF will be attached');
    }

    // Build dynamic document names for email content
    const docNames = [
      invoicePdfBase64 && 'Invoice',
      bolPdfBase64 && 'Bill of Lading (BOL)'
    ].filter(Boolean);
    
    const subjectDocs = [
      invoicePdfBase64 && 'Invoice',
      bolPdfBase64 && 'BOL'
    ].filter(Boolean).join(' & ');

    const docMention = docNames.join(' and ');
    const attachmentsList = docNames.map(name => `<li>${name} PDF</li>`).join('');

    const msg = {
      to: brokerEmail,
      from: 'no-reply@loadmemo.com',
      subject: `${subjectDocs} for Load ${loadId}`,
      text: `Please find attached the ${docMention} for Load ${loadId}.${invoicePdfBase64 ? ` Amount: $${amount}.` : ''} Thank you for your business!`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; }
            .header { background-color: #4F46E5; color: white; padding: 30px 20px; text-align: center; }
            .content { padding: 30px 20px; background-color: #f9fafb; }
            .details { background-color: white; padding: 20px; margin: 20px 0; border-radius: 8px; border: 1px solid #e5e7eb; }
            .amount { font-size: 32px; font-weight: bold; color: #059669; margin: 10px 0; }
            .attachments { background-color: #f0f9ff; padding: 15px; border-radius: 8px; border: 1px solid #bfdbfe; margin-top: 20px; }
            .attachments h4 { color: #1e40af; margin: 0 0 10px 0; }
            .attachments ul { margin: 0; padding-left: 20px; }
            .attachments li { color: #374151; margin-bottom: 5px; }
            .footer { text-align: center; padding: 20px; background-color: #f3f4f6; color: #6b7280; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>📄 ${subjectDocs}</h1>
              <p>Load #${loadId}</p>
            </div>
            <div class="content">
              <p>Dear Customer,</p>
              <p>Thank you for choosing our services. Please find attached the documentation for the following shipment:</p>
              <div class="details">
                <h3>Shipment Details</h3>
                <p><strong>Load ID:</strong> ${loadId}</p>
                <p><strong>From:</strong> ${pickupLocation || 'N/A'}</p>
                <p><strong>To:</strong> ${deliveryLocation || 'N/A'}</p>
                ${invoicePdfBase64 ? `
                <div style="margin-top: 20px;">
                  <p><strong>Total Amount:</strong></p>
                  <div class="amount">$${amount}</div>
                </div>
                ` : ''}
              </div>
              <div class="attachments">
                <h4>📎 Attached Documents:</h4>
                <ul>
                  ${attachmentsList}
                </ul>
              </div>
              <p>If you have any questions, please contact us.</p>
            </div>
            <div class="footer">
              <p><strong>${companyName || 'LoadMemo'}</strong></p>
            </div>
          </div>
        </body>
        </html>
      `,
      attachments: attachments
    };

    // Add CC and reply-to
    if (companyEmail) {
      msg.cc = companyEmail;
      msg.replyTo = companyEmail;
      console.log('✅ Added CC and reply-to:', companyEmail);
    }

    try {
      const result = await sgMail.send(msg);
      console.log('✅ Email sent to:', brokerEmail);
      console.log('✅ Documents sent:', subjectDocs);
      if (companyEmail) console.log('✅ CC sent to:', companyEmail);

      return {
        success: true,
        statusCode: result[0].statusCode,
        to: brokerEmail,
        cc: companyEmail || null,
        loadId: loadId,
        includedInvoice: !!invoicePdfBase64,
        includedBOL: !!bolPdfBase64
      };
    } catch (error) {
      console.error('❌ SendGrid error:', error);
      throw new functions.https.HttpsError('internal', `Failed to send email: ${error.message}`);
    }
  }
);