// services/gemini.js - Updated version with load_id fallback logic and driver pay auto-calculation

const { GoogleGenerativeAI } = require("@google/generative-ai");
const functions = require('firebase-functions');
const { COMMODITY_PROMPTS } = require('../config/constants');

let genAI = null;

function initializeGemini(apiKey) {
  if (!genAI && apiKey) {
    try {
      genAI = new GoogleGenerativeAI(apiKey);
      functions.logger.log("Gemini AI client initialized successfully.");
    } catch (initError) {
      functions.logger.error("Failed to initialize Gemini AI client:", initError);
      throw new Error("AI service client failed to initialize");
    }
  }
  return genAI;
}

// Helper function to post-process extracted data
function postProcessExtractedData(data) {
  // Fix load_id if missing but order_id exists
  if (!data.load_id && data.order_id) {
    data.load_id = data.order_id;
    functions.logger.log(`Applied fallback: load_id = order_id (${data.order_id})`);
  }
  
  // Fix amount if missing but other payment fields exist
  if (!data.amount || data.amount === null || data.amount === 0) {
    // Check for common payment field variations
    const paymentFields = [
      'payout', 'carrier_pay', 'carrierPay', 'carrier_payout', 'carrierPayout',
      'rate', 'load_rate', 'loadRate', 'freight_rate', 'freightRate',
      'total_rate', 'totalRate', 'line_haul', 'lineHaul', 'line_haul_rate',
      'gross_pay', 'grossPay', 'total_pay', 'totalPay', 'carrier_total',
      'carrierTotal', 'total_to_carrier', 'totalToCarrier', 'payment',
      'carrier_rate', 'carrierRate', 'agreed_rate', 'agreedRate'
    ];
    
    for (const field of paymentFields) {
      if (data[field]) {
        // Extract numeric value from the field
        let value = data[field];
        if (typeof value === 'string') {
          // Remove $, commas, and other non-numeric characters
          value = value.replace(/[$,]/g, '').trim();
          value = parseFloat(value);
        }
        
        if (!isNaN(value) && value > 0) {
          data.amount = value;
          functions.logger.log(`Applied amount fallback: amount = ${field} (${value})`);
          // Remove the duplicate field to avoid confusion
          delete data[field];
          break;
        }
      }
    }
  }
  
  // Clean up amount field - ensure it's numeric
  if (data.amount && typeof data.amount === 'string') {
    data.amount = parseFloat(data.amount.toString().replace(/[$,]/g, '').trim());
  }

  // ============================================================================
  // AUTO-CALCULATE DRIVER PAY WHEN PAYMENT TERMS REQUIRE DRIVER COLLECTION
  // ============================================================================
  
  // Normalize payment terms for comparison
  const paymentTerms = (data.paymentTerms || '').toLowerCase().trim();
  const isCollectionOnPickupOrDelivery = 
    paymentTerms === 'on_delivery' || 
    paymentTerms === 'on delivery' ||
    paymentTerms === 'on_pickup' || 
    paymentTerms === 'on pick up' ||
    paymentTerms === 'on pickup' ||
    paymentTerms === 'cod';

  // Get current values
  const loadPrice = parseFloat(data.amount) || 0;
  const brokerFee = parseFloat(data.brokerFeeCollection) || 0;
  const currentDriverPay = parseFloat(data.driverCollectionAmount) || 0;

  // Auto-calculate driver pay if:
  // 1. Payment terms require driver collection (On Delivery or On Pickup)
  // 2. Driver pay is missing, null, 0, or not set
  // 3. Load price exists and is greater than 0
  if (isCollectionOnPickupOrDelivery && loadPrice > 0) {
    if (!data.driverCollectionAmount || currentDriverPay === 0 || currentDriverPay === null) {
      const calculatedDriverPay = loadPrice - brokerFee;
      data.driverCollectionAmount = calculatedDriverPay;
      
      functions.logger.log(`💰 Auto-calculated Driver Pay for ${paymentTerms}:`, {
        loadPrice: loadPrice,
        brokerFee: brokerFee,
        calculatedDriverPay: calculatedDriverPay,
        formula: `${loadPrice} - ${brokerFee} = ${calculatedDriverPay}`
      });
    } else {
      functions.logger.log(`💰 Driver Pay already set by Gemini: ${currentDriverPay}`);
    }
  }

  // Ensure brokerFeeCollection is always a number (default to 0 if not set)
  if (data.brokerFeeCollection === null || data.brokerFeeCollection === undefined || data.brokerFeeCollection === '') {
    data.brokerFeeCollection = 0;
  } else if (typeof data.brokerFeeCollection === 'string') {
    data.brokerFeeCollection = parseFloat(data.brokerFeeCollection.replace(/[$,]/g, '').trim()) || 0;
  }

  // Ensure driverCollectionAmount is a number if set
  if (data.driverCollectionAmount !== null && data.driverCollectionAmount !== undefined) {
    if (typeof data.driverCollectionAmount === 'string') {
      data.driverCollectionAmount = parseFloat(data.driverCollectionAmount.replace(/[$,]/g, '').trim()) || 0;
    }
  }

  // Log final payment values
  functions.logger.log('💵 Final payment values after post-processing:', {
    amount: data.amount,
    brokerFeeCollection: data.brokerFeeCollection,
    driverCollectionAmount: data.driverCollectionAmount,
    paymentTerms: data.paymentTerms,
    paymentMethod: data.paymentMethod
  });

  // ============================================================================
  // END DRIVER PAY AUTO-CALCULATION
  // ============================================================================
  
  // Log payment-related fields for debugging
  functions.logger.log('Payment fields found:', {
    amount: data.amount,
    ...Object.keys(data).reduce((acc, key) => {
      const lowerKey = key.toLowerCase();
      if (lowerKey.includes('pay') || lowerKey.includes('rate') || 
          lowerKey.includes('amount') || lowerKey.includes('total')) {
        acc[key] = data[key];
      }
      return acc;
    }, {})
  });
  
  // Also check for common variations
  if (!data.load_id) {
    // Check for other possible field names that might contain the load ID
    const possibleLoadIdFields = [
      'orderId', 'orderNumber', 'order_number', 'orderNo', 'order_no',
      'loadNumber', 'load_number', 'loadNo', 'load_no',
      'bolNumber', 'bol_number', 'bolNo', 'bol_no',
      'referenceNumber', 'reference_number', 'refNo', 'ref_no',
      'shipmentId', 'shipment_id', 'shipmentNumber', 'shipment_number',
      'contractNumber', 'contract_number', 'contractNo', 'contract_no', 'contract',
      'dispatchOrder', 'dispatch_order', 'dispatchNumber', 'dispatch_number',
      'dispatchNo', 'dispatch_no', 'dispatch'
    ];
    
    for (const field of possibleLoadIdFields) {
      if (data[field]) {
        data.load_id = data[field];
        functions.logger.log(`Applied fallback: load_id = ${field} (${data[field]})`);
        // Remove the duplicate field to avoid confusion
        delete data[field];
        break;
      }
    }
  }
  
  // If still no load_id, generate a temporary one
  if (!data.load_id) {
    // Generate based on pickup location and date if available
    if (data.pickupDateTime && data.pickupLocation) {
      const dateStr = data.pickupDateTime.substring(0, 10).replace(/-/g, '');
      const locationStr = data.pickupLocation.substring(0, 3).toUpperCase();
      data.load_id = `AUTO-${dateStr}-${locationStr}-${Date.now().toString().slice(-4)}`;
      functions.logger.warn(`Generated temporary load_id: ${data.load_id}`);
    } else {
      data.load_id = `TEMP-${Date.now()}`;
      functions.logger.warn(`Generated timestamp-based load_id: ${data.load_id}`);
    }
  }
  
  // Clean up the load_id (remove extra spaces, special characters)
  if (data.load_id) {
    data.load_id = data.load_id.toString().trim();
  }
  
  // Log all extracted IDs for debugging
  functions.logger.log('Extracted IDs:', {
    load_id: data.load_id,
    order_id: data.order_id,
    // Log any other ID fields that were found
    ...Object.keys(data).reduce((acc, key) => {
      if (key.toLowerCase().includes('id') || key.toLowerCase().includes('number')) {
        acc[key] = data[key];
      }
      return acc;
    }, {})
  });
  
  return data;
}

// Helper utility for brief exponential backoff/delay
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function extractDataFromPDF(pdfBuffer, commodityType, apiKey) {
  const ai = initializeGemini(apiKey);
  if (!ai) {
    throw new Error("Gemini AI not initialized");
  }

  // Fallback models chain
  const models = [
    "gemini-3.1-flash-lite", // Fastest & ultra-cheap (replaces 2.0-flash-lite)
    "gemini-3.5-flash",      // Smartest generation model (replaces 2.0 / 1.5)
    "gemini-2.5-flash"       // High-quota stable fallback
  ];

  const selectedCommodityType = commodityType || 'auto';
  const prompt = COMMODITY_PROMPTS[selectedCommodityType] || COMMODITY_PROMPTS.auto;
  
  functions.logger.log(`Using ${selectedCommodityType} commodity prompt`);

  const pdfFilePart = {
    inlineData: {
      data: pdfBuffer.toString("base64"),
      mimeType: "application/pdf",
    },
  };

  const generationConfig = {
    responseMimeType: "application/json",
  };

  let lastError = null;

  for (let i = 0; i < models.length; i++) {
    const modelName = models[i];
    try {
      functions.logger.log(`🤖 Trying model: ${modelName}`);
      const model = ai.getGenerativeModel({ model: modelName });

      const geminiResult = await model.generateContent({
        contents: [{ role: "user", parts: [pdfFilePart, { text: prompt }] }],
        generationConfig,
      });

      const response = geminiResult.response;
      const geminiOutputText = response.text();

      functions.logger.log(`✅ ${modelName} succeeded`);
      functions.logger.log("Gemini Raw JSON Output:", geminiOutputText);

      let extractedData;
      try {
        extractedData = JSON.parse(geminiOutputText);
      } catch (jsonError) {
        functions.logger.error("Error parsing JSON from Gemini:", jsonError.message);
        throw new Error("Failed to parse AI response as JSON");
      }

      extractedData = postProcessExtractedData(extractedData);
      return extractedData;

    } catch (error) {
      lastError = error;
      
      // Convert error to string to capture entire stack/message context safely
      const errorString = String(error) + (error.message ? ' ' + error.message : '') + (error.status ? ' ' + error.status : '');
      
      const isRetryable = errorString.includes('503') || 
                          errorString.includes('Service Unavailable') ||
                          errorString.includes('overloaded') ||
                          errorString.includes('high demand') ||
                          errorString.includes('429') || 
                          errorString.includes('Too Many Requests') ||
                          error.status === 503 || 
                          error.status === 429;

      if (isRetryable && i < models.length - 1) {
        // Add a 1-second pause before banging into the next model to let traffic clear
        functions.logger.warn(`⚠️ ${modelName} unavailable (${error.status || '503'}), pausing 1s then trying next model...`);
        await delay(1000);
        continue;
      }

      // If it's a fatal validation error or we ran out of models, stop here
      throw error;
    }
  }

  functions.logger.error("❌ All Gemini models failed:", lastError?.message || lastError);
  throw lastError || new Error("All AI models are currently unavailable. Please try again later.");
}

module.exports = { initializeGemini, extractDataFromPDF, postProcessExtractedData };