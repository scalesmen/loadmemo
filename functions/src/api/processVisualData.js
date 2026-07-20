// functions/src/api/processVisualData.js
const functions = require('firebase-functions');
const admin = require('firebase-admin');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// Import the post-processing function from your existing service
const { postProcessExtractedData } = require('../../services/gemini');

exports.processVisualData = functions.https.onRequest(async (req, res) => {
  // Enable CORS
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).send('');
  }

  try {
    // Verify API key
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized - Missing API key' });
    }

    const apiKey = authHeader.split('Bearer ')[1];
    
    // Verify user has valid API key in Firestore
    const userSnapshot = await admin.firestore()
      .collection('users')
      .where('apiKey', '==', apiKey)
      .limit(1)
      .get();

    if (userSnapshot.empty) {
      return res.status(401).json({ error: 'Invalid API key' });
    }

    const userId = userSnapshot.docs[0].id;
    const { screenshot, pageUrl, pageTitle } = req.body;

    if (!screenshot) {
      return res.status(400).json({ error: 'Screenshot required' });
    }

    functions.logger.log('Visual AI processing for user:', userId, 'URL:', pageUrl);

    // Get Gemini API key from config
    const geminiKey = functions.config().gemini?.key;
    if (!geminiKey) {
      functions.logger.error('Gemini API key not configured');
      return res.status(500).json({ error: 'AI service not configured' });
    }

    // Initialize Gemini (same way as your PDF service)
    const genAI = new GoogleGenerativeAI(geminiKey);
    
    // Use the same model as your PDF parser
    const model = genAI.getGenerativeModel({ 
      model: "gemini-2.5-flash-lite" 
    });

    // Comprehensive prompt for load extraction
    const prompt = `
You are analyzing a screenshot from a logistics/freight website. Extract ALL visible load information.

CRITICAL: Return ONLY valid JSON array format. Do not include any markdown, explanations, or text outside the JSON.

FIELDS TO EXTRACT (include all that are visible):
- load_id: Load ID / Order Number / Reference Number / BOL Number / Dispatch Number
- order_id: Alternative order identifier if different from load_id
- pickupCity: Pickup city name
- pickupState: Pickup state (2-letter code like "CA", "TX")
- pickupLocation: Full pickup address if visible
- pickupZip: Pickup ZIP code
- pickupDate: Pickup date in YYYY-MM-DD format
- pickupTime: Pickup time if visible
- pickupDateTime: Combined pickup date and time in ISO format if available
- deliveryCity: Delivery city name
- deliveryState: Delivery state (2-letter code)
- deliveryLocation: Full delivery address if visible
- deliveryZip: Delivery ZIP code
- deliveryDate: Delivery date in YYYY-MM-DD format
- deliveryTime: Delivery time if visible
- deliveryDateTime: Combined delivery date and time in ISO format if available
- amount: Rate/price (NUMBERS ONLY, no $ or commas)
- carrier_pay: Carrier payment amount if different from amount
- payout: Payout amount if visible
- weight: Weight in pounds (NUMBERS ONLY)
- distance: Distance in miles (NUMBERS ONLY)
- equipmentType: Equipment type (dry van, reefer, flatbed, auto carrier, conestoga, step deck, etc.)
- commodity: What is being shipped
- contactName: Broker/shipper contact name
- contactPhone: Contact phone number
- contactEmail: Contact email address
- brokerName: Broker company name
- carrierName: Carrier company name if visible
- notes: Any special instructions, requirements, or notes
- temperatureMin: For reefer loads - minimum temperature
- temperatureMax: For reefer loads - maximum temperature
- vehicles: For auto transport - array of vehicle objects

FOR AUTO TRANSPORT, extract vehicle details:
- vehicles: [
    {
      "year": "YYYY",
      "make": "Brand name",
      "model": "Model name",
      "vin": "17-character VIN",
      "type": "sedan/suv/truck/van/motorcycle",
      "color": "color if visible",
      "operable": "yes/no/unknown"
    }
  ]

EXTRACTION RULES:
1. Return ONLY a JSON array (even if just one load): [{...}]
2. Extract EXACT values as displayed on screen
3. For money amounts: extract ONLY numbers (if you see "$1,250.00", return "1250")
4. For dates: use YYYY-MM-DD format
5. If a field is not visible, DO NOT include it in the response
6. If you see multiple loads on the page, return multiple objects
7. Look at tables, cards, forms, and any structured data
8. For load_id/order_id: prioritize the most prominent identifier visible
9. Preserve all ID variations (load_id, order_id, contract, dispatch_order, etc.)
10. Include ALL payment-related fields you see (amount, carrier_pay, payout, rate, etc.)

EXAMPLE RESPONSE (your response should look like this):
[{
  "load_id": "ABC123",
  "order_id": "ORD-456",
  "pickupCity": "Los Angeles",
  "pickupState": "CA",
  "pickupLocation": "123 Main St, Los Angeles, CA 90001",
  "pickupDate": "2025-01-15",
  "pickupTime": "08:00",
  "deliveryCity": "New York",
  "deliveryState": "NY",
  "deliveryLocation": "456 Park Ave, New York, NY 10001",
  "deliveryDate": "2025-01-18",
  "deliveryTime": "17:00",
  "amount": "2500",
  "weight": "45000",
  "distance": "2789",
  "equipmentType": "dry van",
  "commodity": "Electronics",
  "contactName": "John Smith",
  "contactPhone": "555-1234",
  "brokerName": "ABC Logistics"
}]

If NO load data is visible, return empty array: []

Now analyze the screenshot and extract load information as JSON array:
`;

    // Prepare image for Gemini
    const screenshotData = screenshot.replace(/^data:image\/\w+;base64,/, '');
    const mimeType = screenshot.includes('data:image/png') ? 'image/png' : 'image/jpeg';

    const imagePart = {
      inlineData: {
        data: screenshotData,
        mimeType: mimeType
      }
    };

    // Configure generation (same as PDF parser)
    const generationConfig = {
      responseMimeType: "application/json",
      temperature: 0.1,  // Low temperature for consistent extraction
    };

    // Call Gemini Vision API
    functions.logger.log('Calling Gemini Vision API with model: gemini-2.5-flash-lite');
    
    const geminiResult = await model.generateContent({
      contents: [{ role: "user", parts: [imagePart, { text: prompt }] }],
      generationConfig,
    });

    const response = geminiResult.response;
    let geminiOutputText = response.text();

    functions.logger.log('Gemini Raw JSON Output:', geminiOutputText.substring(0, 500));

    // Parse JSON response
    let extractedData;
    try {
      extractedData = JSON.parse(geminiOutputText);
    } catch (parseError) {
      functions.logger.error('JSON parse error:', parseError);
      
      // Try to extract JSON from response if wrapped in markdown
      const jsonMatch = geminiOutputText.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        try {
          extractedData = JSON.parse(jsonMatch[0]);
          functions.logger.log('Successfully extracted JSON from markdown wrapper');
        } catch (e) {
          functions.logger.error('Failed to parse extracted JSON:', e);
          return res.status(500).json({ 
            error: 'Failed to parse AI response',
            raw: geminiOutputText.substring(0, 500)
          });
        }
      } else {
        return res.status(500).json({ 
          error: 'Failed to parse AI response - no valid JSON found',
          raw: geminiOutputText.substring(0, 500)
        });
      }
    }

    // Validate response is an array
    if (!Array.isArray(extractedData)) {
      functions.logger.error('Response is not an array:', typeof extractedData);
      
      // If it's a single object, wrap it in an array
      if (typeof extractedData === 'object' && extractedData !== null) {
        functions.logger.log('Converting single object to array');
        extractedData = [extractedData];
      } else {
        return res.status(500).json({ 
          error: 'Invalid response format from AI',
          raw: geminiOutputText.substring(0, 500)
        });
      }
    }

    // Apply post-processing to each load (same as PDF parser)
    extractedData = extractedData.map(load => postProcessExtractedData(load));

    // Log results
    if (extractedData.length > 0) {
      functions.logger.log(`✅ Successfully extracted ${extractedData.length} load(s) via Visual AI`);
      
      // Log sample of extracted data
      functions.logger.log('First load sample:', {
        load_id: extractedData[0].load_id,
        pickup: `${extractedData[0].pickupCity}, ${extractedData[0].pickupState}`,
        delivery: `${extractedData[0].deliveryCity}, ${extractedData[0].deliveryState}`,
        amount: extractedData[0].amount
      });
      
      // Log to Firestore for analytics
      try {
        await admin.firestore().collection('visual_extractions').add({
          userId: userId,
          pageUrl: pageUrl,
          pageTitle: pageTitle,
          loadsFound: extractedData.length,
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
          success: true
        });
      } catch (logError) {
        functions.logger.error('Failed to log analytics:', logError);
        // Don't fail the request if logging fails
      }
    } else {
      functions.logger.log('⚠️ No loads found in visual extraction');
    }

    return res.status(200).json(extractedData);

  } catch (error) {
    functions.logger.error('Visual processing error:', error);
    
    // Log error for debugging
    try {
      await admin.firestore().collection('visual_extraction_errors').add({
        error: error.message,
        stack: error.stack,
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      });
    } catch (logError) {
      functions.logger.error('Failed to log error:', logError);
    }

    return res.status(500).json({ 
      error: 'Processing failed',
      details: error.message 
    });
  }
});