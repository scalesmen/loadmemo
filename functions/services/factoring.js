// functions/src/services/factoring.js
// Broker Factoring Service - Looks up and applies factoring rules

const { admin } = require('../config/firebase');

/**
 * Get factoring rule for a specific broker
 * @param {string} brokerId - The broker's document ID
 * @param {string} tenantId - The tenant ID
 * @returns {Object|null} - Factoring rule or null if not found
 */
async function getFactoringRuleForBroker(brokerId, tenantId) {
  if (!brokerId || !tenantId) {
    return null;
  }

  try {
    const db = admin.firestore();
    
    // Query for active factoring rule for this broker
    const rulesSnapshot = await db
      .collection('brokerFactoringRules')
      .where('tenantId', '==', tenantId)
      .where('brokerId', '==', brokerId)
      .where('isActive', '==', true)
      .limit(1)
      .get();

    if (rulesSnapshot.empty) {
      console.log(`No active factoring rule found for broker ${brokerId} in tenant ${tenantId}`);
      return null;
    }

    const ruleDoc = rulesSnapshot.docs[0];
    const rule = {
      id: ruleDoc.id,
      ...ruleDoc.data()
    };

    console.log(`✅ Found factoring rule for broker ${brokerId}: ${rule.factoringPercentage}%`);
    return rule;

  } catch (error) {
    console.error('Error fetching factoring rule:', error);
    return null;
  }
}

/**
 * Calculate driver pay after factoring deduction
 * @param {number} loadPrice - The total load price
 * @param {number} factoringPercentage - The factoring percentage (e.g., 3.5 for 3.5%)
 * @returns {Object} - Calculation details
 */
function calculateFactoringDeduction(loadPrice, factoringPercentage) {
  const price = parseFloat(loadPrice) || 0;
  const percentage = parseFloat(factoringPercentage) || 0;

  if (price <= 0 || percentage <= 0) {
    return {
      loadPrice: price,
      factoringPercentage: 0,
      factoringAmount: 0,
      driverPay: price,
      wasApplied: false
    };
  }

  const factoringAmount = (price * percentage / 100);
  const driverPay = price - factoringAmount;

  return {
    loadPrice: price,
    factoringPercentage: percentage,
    factoringAmount: Math.round(factoringAmount * 100) / 100, // Round to 2 decimals
    driverPay: Math.round(driverPay * 100) / 100, // Round to 2 decimals
    wasApplied: true
  };
}

/**
 * Apply factoring to extracted load data if a rule exists
 * @param {Object} extractedData - The extracted load data from PDF
 * @param {string} tenantId - The tenant ID
 * @returns {Object} - Updated extracted data with factoring applied
 */
async function applyFactoringToLoad(extractedData, tenantId) {
  // Check if we have a broker ID and load amount
  if (!extractedData.brokerId || !extractedData.amount) {
    console.log('📊 Factoring: No broker ID or amount, skipping factoring calculation');
    return extractedData;
  }

  // Look up factoring rule for this broker
  const factoringRule = await getFactoringRuleForBroker(extractedData.brokerId, tenantId);

  if (!factoringRule) {
    console.log('📊 Factoring: No active rule for this broker');
    return extractedData;
  }

  // Calculate factoring deduction
  const calculation = calculateFactoringDeduction(
    extractedData.amount,
    factoringRule.factoringPercentage
  );

  if (calculation.wasApplied) {
    console.log(`💰 Factoring Applied: $${extractedData.amount} - ${factoringRule.factoringPercentage}% = $${calculation.driverPay} driver pay`);

    // Update the extracted data with factoring info
    extractedData.factoringApplied = true;
    extractedData.factoringRuleId = factoringRule.id;
    extractedData.factoringPercentage = factoringRule.factoringPercentage;
    extractedData.factoringAmount = calculation.factoringAmount;
    extractedData.factoringBrokerName = factoringRule.brokerName;
    
    // 🆕 Set Broker Fee field to the factoring amount
    // This shows the factoring deduction in the Broker Fee field on the LoadModal
    extractedData.brokerFeeCollection = calculation.factoringAmount;
    
    // Set driver pay (only if not already set or if it's 0)
    if (!extractedData.driverPay || extractedData.driverPay === 0) {
      extractedData.driverPay = calculation.driverPay;
    }
    
    // Also set driverCollectionAmount for consistency with the UI
    if (!extractedData.driverCollectionAmount || extractedData.driverCollectionAmount === 0) {
      extractedData.driverCollectionAmount = calculation.driverPay;
    }
    
    console.log(`📊 Broker Fee set to: $${calculation.factoringAmount} (${factoringRule.factoringPercentage}% factoring)`);
  }

  return extractedData;
}

module.exports = {
  getFactoringRuleForBroker,
  calculateFactoringDeduction,
  applyFactoringToLoad
};