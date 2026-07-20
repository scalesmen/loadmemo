// functions/api/parseLiveLoadDocument.js
const functions = require('firebase-functions');
const cors = require('cors')({ origin: true });
const admin = require('firebase-admin');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// Use the same API key parameter
const geminiApiKeyParam = functions.params.defineString("GEMINI_API_KEY");

const LIVELOAD_DOCUMENT_PROMPT = `
You are an expert at extracting data from auto auction and vehicle release documents.
Analyze this PDF document and extract the following information in JSON format.
Return ONLY valid JSON. No markdown or backticks.

Structure:
{
  "documentType": "gate_pass" | "bill_of_sale" | "vehicle_release" | "transporter_auth" | "dispatch_sheet",
  "source": "manheim" | "adesa" | "openlane" | "smartauction" | "backlotcars" | "copart" | "iaai" | "other",
  "releaseId": "string",
  "saleDate": "YYYY-MM-DD",
  "vehicles": [{
    "vin": "string", "year": "string", "make": "string", "model": "string", 
    "trim": "string", "color": "string", "body": "string", "odometer": number,
    "lotLocation": "string", "inop": boolean
  }],
  "pickup": {
    "facilityName": "string", "address": "string", "city": "string", "state": "string", "zip": "string", "phone": "string", "instructions": "string"
  },
  "buyer": {
    "accountNumber": "string", "name": "string", "contact": "string", "address": "string", "city": "string", "state": "string", "zip": "string", "phone": "string"
  },
  "announcements": "string",
  "confidence": 0.95
}`;

module.exports = functions.https.onRequest(async (req, res) => {
  cors(req, res, async () => {
    if (req.method === 'OPTIONS') return res.status(204).send('');
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    try {
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });

      const idToken = authHeader.split('Bearer ')[1];
      const decodedToken = await admin.auth().verifyIdToken(idToken);
      const { storagePath, fileName } = req.body;

      const currentApiKey = geminiApiKeyParam.value();
      const genAI = new GoogleGenerativeAI(currentApiKey);
      
      const bucket = admin.storage().bucket();
      const file = bucket.file(storagePath);
      const [fileBuffer] = await file.download();
      const base64Data = fileBuffer.toString('base64');

      // Matching your working config exactly
      const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" });
      const generationConfig = { responseMimeType: "application/json" };

      const result = await model.generateContent({
        contents: [{ 
          role: "user", 
          parts: [
            { inlineData: { data: base64Data, mimeType: "application/pdf" } },
            { text: LIVELOAD_DOCUMENT_PROMPT }
          ] 
        }],
        generationConfig,
      });

      const responseText = result.response.text();
      
      // Since we use responseMimeType: "application/json", JSON.parse will work directly
      let parsedData;
      try {
        parsedData = JSON.parse(responseText);
      } catch (e) {
        // Fallback: strip backticks if Gemini somehow still includes them
        const cleaned = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
        parsedData = JSON.parse(cleaned);
      }

      return res.status(200).json({
        success: true,
        ...parsedData,
        parsedAt: new Date().toISOString(),
        fileName
      });

    } catch (error) {
      functions.logger.error('Error:', error);
      return res.status(500).json({ error: error.message });
    }
  });
});