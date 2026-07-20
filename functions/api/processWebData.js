// functions/api/processWebData.js
const { onRequest } = require('firebase-functions/v2/https');
const functions = require('firebase-functions');
const admin = require('firebase-admin');
const { extractDataFromPDF } = require('../services/gemini'); // Use existing service
const { COMMODITY_PROMPTS } = require('../config/constants');

// Define the Gemini API key parameter
const geminiApiKeyParam = functions.params.defineString("GEMINI_API_KEY");

exports.processWebData = onRequest(
  { 
    timeoutSeconds: 60,
    memory: '1GiB',
    cors: true 
  },
  async (req, res) => {
    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }

    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
      // 1. Validate API Key
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        console.error('Missing authorization header');
        return res.status(401).json({ error: 'Missing or invalid authorization header' });
      }

      const apiKey = authHeader.split(' ')[1];
      console.log('API Key prefix:', apiKey.substring(0, 7));
      
      // Look up API key in Firestore
      const apiKeysSnapshot = await admin.firestore()
        .collection('apiKeys')
        .where('apiKey', '==', apiKey)
        .where('status', '==', 'active')
        .limit(1)
        .get();

      if (apiKeysSnapshot.empty) {
        console.error('Invalid API key');
        return res.status(401).json({ error: 'Invalid or revoked API key' });
      }

      const apiKeyDoc = apiKeysSnapshot.docs[0];
      const apiKeyData = apiKeyDoc.data();
      const tenantId = apiKeyData.tenantId;

      console.log('API Key validated for tenant:', tenantId);

      // Update last used
      await apiKeyDoc.ref.update({
        lastUsed: admin.firestore.FieldValue.serverTimestamp(),
        lastUsedBy: 'chrome_extension'
      });

      // 2. Get Gemini API key
      const currentApiKey = geminiApiKeyParam.value();
      if (!currentApiKey) {
        console.error("Gemini API key parameter is not set.");
        return res.status(500).json({ error: "AI service is not configured on the server." });
      }

      // 3. Process the web data
      const { pageUrl, pageTitle, scrapedText, structuredData, commodityType } = req.body;
      
      if (!scrapedText && !structuredData) {
        return res.status(400).json({ error: 'No data provided to process' });
      }

      console.log('Processing web data for commodity type:', commodityType || 'auto');

      // Prepare data for Gemini processing
      // Since extractDataFromPDF expects a buffer, we'll create a text "buffer"
      const dataForProcessing = createWebDataBuffer(pageUrl, pageTitle, scrapedText, structuredData, commodityType);
      
      // Use the existing gemini service with the proper model
      const extractedData = await processWebDataWithGemini(dataForProcessing, commodityType || 'auto', currentApiKey);

      // Auto-calculate mileage if not extracted
      if (extractedData.pickupLocation && extractedData.deliveryLocation && !extractedData.mileage) {
        const mileage = await calculateMileageFromAddresses(
          extractedData.pickupLocation, 
          extractedData.deliveryLocation
        );
        if (mileage) {
          extractedData.mileage = mileage;
        }
      }

      // Add metadata
      extractedData.tenantId = tenantId;
      extractedData.sourceUrl = pageUrl;
      extractedData.extractionTimestamp = admin.firestore.FieldValue.serverTimestamp();
      extractedData.commodityType = commodityType;

      // Handle array response for list pages
      if (Array.isArray(extractedData)) {
        console.log(`Returning ${extractedData.length} loads from list page`);
        return res.json(extractedData);
      }

      return res.json(extractedData);

    } catch (error) {
      console.error('Error processing web data:', error);
      return res.status(500).json({ 
        error: 'Failed to process web data', 
        details: error.message 
      });
    }
  }
);

function createWebDataBuffer(pageUrl, pageTitle, scrapedText, structuredData, commodityType) {
  // Create a structured text representation of the web data
  const siteInstructions = getSiteSpecificInstructions(pageUrl);
  
  const formattedData = `
WEB PAGE DATA EXTRACTION
========================
Page URL: ${pageUrl}
Page Title: ${pageTitle}
Commodity Type: ${commodityType || 'auto'}

${siteInstructions}

STRUCTURED DATA EXTRACTED:
${JSON.stringify(structuredData, null, 2).substring(0, 10000)}

PAGE TEXT CONTENT:
${(scrapedText || '').substring(0, 20000)}
`;

  return Buffer.from(formattedData, 'utf-8');
}

async function processWebDataWithGemini(dataBuffer, commodityType, apiKey) {
  const { GoogleGenerativeAI } = require("@google/generative-ai");
  const { COMMODITY_PROMPTS } = require('../config/constants');
  
  // Initialize Gemini
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ 
    model: "gemini-2.5-flash-lite" // Using the same model as your PDF processing
  });

  // Detect if this is a list page
  const dataStr = dataBuffer.toString('utf-8');
  const isListPage = dataStr.includes('/loads') || 
                     dataStr.includes('stage=') ||
                     dataStr.includes('"loads":[') ||
                     dataStr.includes('multiple loads');

  let prompt;
  if (isListPage) {
    prompt = createBulkExtractionPrompt(commodityType);
  } else {
    prompt = COMMODITY_PROMPTS[commodityType] || COMMODITY_PROMPTS.auto;
  }

  console.log(`Using ${commodityType} prompt, list page: ${isListPage}`);

  const generationConfig = {
    responseMimeType: "application/json",
  };

  const result = await model.generateContent({
    contents: [{ role: "user", parts: [{text: prompt + '\n\nData:\n' + dataStr}] }],
    generationConfig,
  });

  const response = await result.response;
  const responseText = response.text();

  console.log("Gemini response length:", responseText.length);

  let extractedData;
  try {
    extractedData = JSON.parse(responseText);
  } catch (jsonError) {
    console.error("Error parsing JSON from Gemini:", jsonError.message);
    console.error("Response text:", responseText.substring(0, 500));
    throw new Error("Failed to parse AI response as JSON");
  }

  // Apply post-processing if it's a single load
  if (!Array.isArray(extractedData)) {
    const { postProcessExtractedData } = require('../services/gemini');
    extractedData = postProcessExtractedData(extractedData);
  }

  return extractedData;
}

function createBulkExtractionPrompt(commodityType) {
  const basePrompt = COMMODITY_PROMPTS[commodityType] || COMMODITY_PROMPTS.auto;
  
  return `
Extract ALL loads from this web page data. This appears to be a list/table of multiple loads.
Return an ARRAY of load objects, where each object follows the format below.

IMPORTANT FOR LIST PAGES:
- Extract EVERY load visible on the page
- Each load should be a complete object with all available fields
- If a field is not available for a specific load, use null
- Ensure load_id is unique for each load
- Look for load data in tables, cards, rows, or any repeating structures
- Return as a JSON array: [{load1}, {load2}, {load3}, ...]

${basePrompt}

CRITICAL: Return an ARRAY of loads, not a single object. If you find multiple loads, return them all.
`;
}

function getSiteSpecificInstructions(pageUrl) {
  const url = pageUrl.toLowerCase();
  
  if (url.includes('centraldispatch')) {
    return `
CENTRAL DISPATCH SPECIFIC:
- Order ID is usually in format CD-XXXXXXX
- Look for "Dispatch Sheet" or "Order Details" sections
- Payment info may be under "Carrier Pay" or "COD Amount"
- Vehicles are listed with Year Make Model format`;
  } else if (url.includes('superdispatch')) {
    return `
SUPER DISPATCH SPECIFIC:
- Order numbers are typically 6-8 digits
- Look for "Load Details" section or load cards
- Carrier pay is usually clearly marked
- Pickup/delivery dates include time windows
- On list pages, each row or card represents a different load`;
  } else if (url.includes('dat.com')) {
    return `
DAT LOAD BOARD SPECIFIC:
- Reference numbers may be under "Ref#" or "Load#"
- Rate is per mile or flat rate
- Equipment type is crucial
- Look for "Post Date" vs "Pickup Date"`;
  } else if (url.includes('truckstop.com')) {
    return `
TRUCKSTOP.COM SPECIFIC:
- Load IDs are alphanumeric
- Check for "Book Now" rate vs posted rate
- May have multiple stops
- Equipment requirements are detailed`;
  }
  
  return '';
}

async function calculateMileageFromAddresses(origin, destination) {
  try {
    const googleMapsApiKey = process.env.GOOGLE_MAPS_API_KEY;
    
    if (!googleMapsApiKey) {
      console.warn("Google Maps API key not found");
      return null;
    }

    const url = `https://maps.googleapis.com/maps/api/distancematrix/json?` +
      `origins=${encodeURIComponent(origin)}&` +
      `destinations=${encodeURIComponent(destination)}&` +
      `units=imperial&` +
      `mode=driving&` +
      `key=${googleMapsApiKey}`;

    const response = await fetch(url);
    const data = await response.json();

    if (data.status === 'OK' && data.rows[0]?.elements[0]?.status === 'OK') {
      const distanceText = data.rows[0].elements[0].distance.text;
      const mileage = parseInt(distanceText.replace(/,/g, '').match(/\d+/)[0]);
      console.log(`Calculated mileage: ${mileage} miles`);
      return mileage;
    }
    
    return null;
  } catch (error) {
    console.error('Mileage calculation error:', error);
    return null;
  }
}