// functions/src/storage/getSignedUploadUrl.js

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { getStorage } = require("firebase-admin/storage");

const BUCKET_NAME = "truckmemo2.appspot.com";

/**
 * Creates a v4 signed URL for uploading a file to Firebase Storage.
 */
const getSignedUploadUrl = onCall(async (request) => {
  const { filePath } = request.data;
  
  if (!filePath) {
    throw new HttpsError(
      'invalid-argument', 
      'The function must be called with the "filePath" argument.'
    );
  }

  const bucket = getStorage().bucket(BUCKET_NAME);
  const file = bucket.file(filePath);

  const options = {
    version: 'v4',
    action: 'write',
    expires: Date.now() + 15 * 60 * 1000, // URL expires in 15 minutes
    contentType: 'image/jpeg',
  };

  try {
    const [url] = await file.getSignedUrl(options);
    return { signedUrl: url };
  } catch (error) {
    console.error("Error creating signed URL:", error);
    throw new HttpsError('internal', 'Could not create upload URL.');
  }
});

module.exports = getSignedUploadUrl;