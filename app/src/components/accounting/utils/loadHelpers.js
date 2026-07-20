// src/components/accounting/utils/loadHelpers.js

/**
 * Format timestamp for invoices (date only)
 */
export const formatInvoiceTimestamp = (timestamp) => {
  if (timestamp && typeof timestamp.toDate === 'function') {
    return timestamp.toDate().toLocaleDateString();
  }
  if (timestamp instanceof Date) {
    return timestamp.toLocaleDateString();
  }
  return 'N/A';
};

/**
 * Get location string from location data
 */
export const getLocationString = (locationData) => {
  if (!locationData) return 'Location not recorded';
  return `${locationData.latitude.toFixed(6)}, ${locationData.longitude.toFixed(6)}`;
};

/**
 * Shorten URL for display
 */
export const shortenUrl = (url) => {
  if (!url) return 'No URL';
  const parts = url.split('/');
  const fileName = parts[parts.length - 1];
  const fileNamePart = fileName.split('?')[0];
  return fileNamePart.substring(0, 50) + (fileNamePart.length > 50 ? '...' : '');
};

/**
 * Calculate per mile rate
 */
export const calculatePerMileRate = (amount, mileage) => {
  const numAmount = Number(amount);
  const numMileage = Number(mileage);
  
  if (numMileage > 0 && numAmount > 0) {
    return (numAmount / numMileage).toFixed(2);
  }
  return null;
};

/**
 * Calculate due date based on payment terms
 */
export const calculateDueDate = (paymentTerms, deliveryDate) => {
  const baseDate = deliveryDate ? new Date(deliveryDate) : new Date();
  
  switch (paymentTerms) {
    case 'same_day_ach':
    case 'on_delivery':
    case 'on_pickup':
      return baseDate.toLocaleDateString();
    case '2_business_days':
      return new Date(baseDate.getTime() + 2 * 24 * 60 * 60 * 1000).toLocaleDateString();
    case '5_business_days':
      return new Date(baseDate.getTime() + 7 * 24 * 60 * 60 * 1000).toLocaleDateString();
    case '7_business_days':
      return new Date(baseDate.getTime() + 10 * 24 * 60 * 60 * 1000).toLocaleDateString();
    case '10_business_days':
      return new Date(baseDate.getTime() + 14 * 24 * 60 * 60 * 1000).toLocaleDateString();
    case '15_business_days':
      return new Date(baseDate.getTime() + 21 * 24 * 60 * 60 * 1000).toLocaleDateString();
    case '20_business_days':
      return new Date(baseDate.getTime() + 28 * 24 * 60 * 60 * 1000).toLocaleDateString();
    case '30_business_days':
      return new Date(baseDate.getTime() + 42 * 24 * 60 * 60 * 1000).toLocaleDateString();
    case 'factoring':
      return 'Upon Factoring Approval';
    default:
      return new Date(baseDate.getTime() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString();
  }
};

/**
 * Calculate if payment is overdue based on delivery date and payment terms
 */
export const isPaymentOverdue = (load) => {
  // Only check overdue for delivered loads
  if (load.status !== 'Delivered') {
    return false;
  }

  // If explicitly marked as paid, not overdue
  if (load.paymentStatus === 'paid') {
    return false;
  }

  // Must have delivery date
  if (!load.actualDEL) {
    console.log('Missing actualDEL:', { 
      loadId: load.load_id, 
      actualDEL: load.actualDEL 
    });
    return false;
  }

  // Check for payment terms
  const paymentTerms = load.paymentTerms;
  
  if (!paymentTerms) {
    console.log('No payment terms set for load:', load.load_id);
    return false;
  }

  // Factoring doesn't have a fixed due date
  if (paymentTerms === 'factoring') {
    return false;
  }

  const deliveryDate = load.actualDEL.toDate ? load.actualDEL.toDate() : new Date(load.actualDEL);
  const today = new Date();
  const daysSinceDelivery = Math.floor((today - deliveryDate) / (1000 * 60 * 60 * 24));

  // Define days for each payment term
  const paymentTermDays = {
    'same_day_ach': 0,
    'on_delivery': 0,
    'on_pickup': 0,
    '2_business_days': 2,
    '5_business_days': 7,  // Using 7 calendar days for 5 business days
    '7_business_days': 10, // Using 10 calendar days for 7 business days
    '10_business_days': 14,
    '15_business_days': 21,
    '20_business_days': 28,
    '30_business_days': 42
  };

  const allowedDays = paymentTermDays[paymentTerms];
  
  if (allowedDays === undefined) {
    console.log('Unknown payment term:', paymentTerms);
    return false;
  }
  
  // For immediate payment terms (0 days), use >= instead of >
  const isOverdue = allowedDays === 0 ? daysSinceDelivery >= 0 : daysSinceDelivery > allowedDays;
  
  // Debug logging
  console.log('Payment overdue check:', {
    loadId: load.load_id,
    paymentTerms: paymentTerms,
    allowedDays,
    daysSinceDelivery,
    isOverdue: isOverdue,
    paymentStatus: load.paymentStatus
  });
  
  return isOverdue;
};

/**
 * Get payment terms description for invoice
 */
export const getPaymentTermsDescription = (paymentTerms) => {
  const descriptions = {
    'same_day_ach': [
      '• Payment via Same Day ACH',
      '• Funds typically available same business day'
    ],
    'on_delivery': [
      '• Payment due on delivery',
      '• COD - Cash on Delivery'
    ],
    'on_pickup': [
      '• Payment due on pickup',
      '• Payment required before loading'
    ],
    '2_business_days': [
      '• Payment via Quickpay (2 Day)',
      '• Funds available within 2 business days'
    ],
    '5_business_days': [
      '• Payment due within 5 business days',
      '• Late payments subject to 1.5% monthly service charge'
    ],
    '7_business_days': [
      '• Payment due within 7 business days',
      '• Late payments subject to 1.5% monthly service charge'
    ],
    '10_business_days': [
      '• Payment due within 10 business days',
      '• Late payments subject to 1.5% monthly service charge'
    ],
    '15_business_days': [
      '• Payment due within 15 business days',
      '• Late payments subject to 1.5% monthly service charge'
    ],
    '20_business_days': [
      '• Payment due within 20 business days',
      '• Late payments subject to 1.5% monthly service charge'
    ],
    '30_business_days': [
      '• Payment due within 30 business days',
      '• Late payments subject to 1.5% monthly service charge'
    ],
    'factoring': [
      '• Payment processed through Factoring Company',
      '• Submit invoice to factoring company for immediate payment',
      '• Contact accounting for factoring company details'
    ]
  };

  return descriptions[paymentTerms] || [];
};

/**
 * Format currency
 */
export const formatCurrency = (amount) => {
  return (Number(amount) || 0).toLocaleString(undefined, { 
    style: 'currency', 
    currency: 'USD' 
  });
};

/**
 * Get default company info when not available
 */
export const getDefaultCompanyInfo = () => ({
  name: 'Company Name Not Available',
  address: 'Company Address Not Available',
  phone: 'Phone Not Available',
  email: 'Email Not Available',
  usdot: 'USDOT Not Available',
  mcNumber: 'MC Not Available',
  taxId: 'Tax ID Not Available'
});

/**
 * Get default driver info when not available
 */
export const getDefaultDriverInfo = () => ({
  name: "N/A",
  email: "N/A",
  phone: "N/A"
});

/**
 * Get default broker info when not available
 */
export const getDefaultBrokerInfo = (load) => ({
  name: load?.brokerName || "N/A",
  address: "Address Not Available",
  phone: "Phone Not Available",
  email: "Email Not Available"
});